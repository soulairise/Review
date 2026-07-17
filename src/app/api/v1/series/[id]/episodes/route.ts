import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { idFor } from '@/lib/id';
import {
  withErrors, jsonOk, jsonCreated, badRequest, notFound, validationFailed, conflict,
} from '@/lib/api-error';
import { assertOwner, assertOwnedReadyImages } from '@/lib/access';
import { CreateEpisodeSchema, EpisodeListQuerySchema } from '@/lib/schemas/episode';
import { zodErrorToFields, zPrefixedId } from '@/lib/schemas/common';
import { toEpisodeSummary } from '@/lib/mappers';
import { encodeCursor, decodeCursor } from '@/lib/cursor';
import { requireUser } from '@/lib/auth/session';
import type { Prisma } from '@prisma/client';

export const runtime = 'nodejs';

// ============================================================
//  GET /api/v1/series/{id}/episodes
//  회차 목록. 이미지 미포함 (뷰어 진입 전 목록).
// ============================================================
export const GET = withErrors(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id: seriesId } = await ctx.params;
  if (!zPrefixedId('srs').safeParse(seriesId).success) throw badRequest('ID 형식이 올바르지 않습니다.');

  const series = await db.series.findUnique({ where: { id: seriesId }, select: { id: true, deletedAt: true } });
  if (!series || series.deletedAt) throw notFound();

  const q = EpisodeListQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) throw validationFailed({ fields: zodErrorToFields(q.error) });
  const { sort, limit, cursor } = q.data;

  const now = new Date();
  const where: Prisma.EpisodeWhereInput = {
    seriesId,
    deletedAt: null,
    publishedAt: { not: null, lte: now }, // 미공개 회차는 목록에서 제외 (소유자 dashboard 는 별도)
  };

  const decoded = decodeCursor(cursor);
  let orderBy: Prisma.EpisodeOrderByWithRelationInput[];
  if (sort === 'order_asc')  orderBy = [{ order: 'asc' }, { id: 'asc' }];
  else if (sort === 'latest') orderBy = [{ publishedAt: 'desc' }, { id: 'desc' }];
  else                        orderBy = [{ order: 'desc' }, { id: 'desc' }];

  if (decoded) {
    if (sort === 'order_asc') {
      where.OR = [
        { order: { gt: Number(decoded.k) } },
        { order: Number(decoded.k), id: { gt: decoded.i } },
      ];
    } else if (sort === 'latest') {
      const d = new Date(decoded.k as string);
      where.OR = [
        { publishedAt: { lt: d } },
        { publishedAt: d, id: { lt: decoded.i } },
      ];
    } else {
      where.OR = [
        { order: { lt: Number(decoded.k) } },
        { order: Number(decoded.k), id: { lt: decoded.i } },
      ];
    }
  }

  const rows = await db.episode.findMany({
    where, orderBy, take: limit + 1,
    select: { id: true, title: true, order: true, isSubscriberOnly: true, publishedAt: true, viewsCount: true, likesCount: true },
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const last = page.at(-1);
  const nextCursor = hasMore && last
    ? encodeCursor({
        k: sort === 'latest' ? (last.publishedAt as Date).toISOString() : last.order,
        i: last.id,
      })
    : null;

  return jsonOk({ items: page.map(toEpisodeSummary), next_cursor: nextCursor, has_more: hasMore });
});

// ============================================================
//  POST /api/v1/series/{id}/episodes
//  회차 생성 (소유자만).
// ============================================================
export const POST = withErrors(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id: seriesId } = await ctx.params;
  if (!zPrefixedId('srs').safeParse(seriesId).success) throw badRequest('ID 형식이 올바르지 않습니다.');

  const { user } = await requireUser(req);
  const series = await db.series.findUnique({
    where: { id: seriesId },
    select: { id: true, authorId: true, deletedAt: true },
  });
  if (!series || series.deletedAt) throw notFound();
  assertOwner(series.authorId, user.id);

  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== 'object') throw badRequest('JSON 본문이 필요합니다.');
  const parsed = CreateEpisodeSchema.safeParse(raw);
  if (!parsed.success) throw validationFailed({ fields: zodErrorToFields(parsed.error) });
  const body = parsed.data;

  await assertOwnedReadyImages(body.image_ids, user.id);

  // 자동 회차 번호
  let order = body.order;
  if (order == null) {
    const last = await db.episode.findFirst({
      where: { seriesId, deletedAt: null },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    order = (last?.order ?? 0) + 1;
  }

  // (seriesId, order) unique → 중복 시 409
  const dup = await db.episode.findUnique({
    where: { seriesId_order: { seriesId, order } },
    select: { id: true, deletedAt: true },
  });
  if (dup && !dup.deletedAt) throw conflict(`이미 ${order}화가 존재합니다.`, { fields: { order: '이미 사용 중인 회차 번호입니다.' } });

  const episodeId = idFor.episode();
  const publishedAt = body.published_at ? new Date(body.published_at) : new Date();

  const episode = await db.$transaction(async (tx) => {
    // deleted 회차 재사용 방지: 완전 새 id 로 생성
    if (dup?.deletedAt) {
      // 그냥 다른 order 를 쓰라고 안내하는 게 안전. 여기서는 409 그대로.
      throw conflict(`이미 ${order}화가 존재합니다 (삭제된 회차).`, { fields: { order: '삭제된 회차와 번호가 겹칩니다.' } });
    }
    const created = await tx.episode.create({
      data: {
        id: episodeId,
        seriesId,
        title: body.title,
        order: order!,
        viewerMode: body.viewer_mode.toUpperCase() as 'SCROLL' | 'PAGE',
        isSubscriberOnly: body.is_subscriber_only,
        isAdult: body.is_adult,
        publishedAt,
      },
    });
    // 이미지 attach
    await tx.image.updateMany({
      where: { id: { in: body.image_ids } },
      data: { episodeId: created.id, ownerType: 'EPISODE', ownerId: created.id },
    });
    // 이미지 순서 반영
    for (let i = 0; i < body.image_ids.length; i++) {
      await tx.image.update({ where: { id: body.image_ids[i]! }, data: { order: i + 1 } });
    }
    // 시리즈 updatedAt bump (Prisma 는 자동 반영)
    await tx.series.update({ where: { id: seriesId }, data: { updatedAt: new Date() } });
    return created;
  });

  const images = await db.image.findMany({
    where: { episodeId: episode.id },
    orderBy: { order: 'asc' },
    select: { id: true, url: true, order: true, width: true, height: true, fileSize: true },
  });

  const [prev, next] = await Promise.all([
    db.episode.findFirst({
      where: { seriesId, order: { lt: episode.order }, deletedAt: null },
      orderBy: { order: 'desc' }, select: { id: true },
    }),
    db.episode.findFirst({
      where: { seriesId, order: { gt: episode.order }, deletedAt: null },
      orderBy: { order: 'asc' }, select: { id: true },
    }),
  ]);

  // toEpisodeDTO 는 별도로 세팅
  return jsonCreated({
    id: episode.id,
    series_id: episode.seriesId,
    title: episode.title,
    order: episode.order,
    viewer_mode: episode.viewerMode.toLowerCase(),
    is_subscriber_only: episode.isSubscriberOnly,
    is_adult: episode.isAdult,
    images: images.map((img) => ({
      id: img.id, url: img.url, order: img.order,
      width: img.width, height: img.height, file_size: img.fileSize,
    })),
    stats: { views: 0, likes: 0, comments: 0 },
    prev_episode_id: prev?.id ?? null,
    next_episode_id: next?.id ?? null,
    published_at: episode.publishedAt?.toISOString() ?? null,
    created_at: episode.createdAt.toISOString(),
  });
});
