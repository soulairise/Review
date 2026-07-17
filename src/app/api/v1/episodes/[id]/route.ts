import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import {
  withErrors, jsonOk, jsonNoContent, badRequest, notFound, validationFailed, conflict,
} from '@/lib/api-error';
import { assertOwner, assertCanReadEpisode, assertOwnedReadyImages } from '@/lib/access';
import { UpdateEpisodeSchema } from '@/lib/schemas/episode';
import { zodErrorToFields, zPrefixedId } from '@/lib/schemas/common';
import { toEpisodeDTO } from '@/lib/mappers';
import { requireUser, getSessionFromRequest } from '@/lib/auth/session';

export const runtime = 'nodejs';

async function loadEpisode(id: string) {
  const e = await db.episode.findUnique({
    where: { id },
    include: {
      series: { select: { id: true, authorId: true, deletedAt: true } },
    },
  });
  if (!e || e.deletedAt || e.series.deletedAt) throw notFound();
  return e;
}

async function getNavigation(seriesId: string, order: number) {
  const [prev, next] = await Promise.all([
    db.episode.findFirst({
      where: {
        seriesId, order: { lt: order }, deletedAt: null,
        publishedAt: { not: null, lte: new Date() },
      },
      orderBy: { order: 'desc' }, select: { id: true },
    }),
    db.episode.findFirst({
      where: {
        seriesId, order: { gt: order }, deletedAt: null,
        publishedAt: { not: null, lte: new Date() },
      },
      orderBy: { order: 'asc' }, select: { id: true },
    }),
  ]);
  return { prev_id: prev?.id ?? null, next_id: next?.id ?? null };
}

// ============================================================
//  GET /api/v1/episodes/{id}
// ============================================================
export const GET = withErrors(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!zPrefixedId('epi').safeParse(id).success) throw badRequest('ID 형식이 올바르지 않습니다.');

  const e = await loadEpisode(id);
  const viewer = await getSessionFromRequest(req);
  await assertCanReadEpisode(e, e.series.authorId, viewer?.sub ?? null);

  const images = await db.image.findMany({
    where: { episodeId: e.id },
    orderBy: { order: 'asc' },
    select: { id: true, url: true, order: true, width: true, height: true, fileSize: true },
  });
  const nav = await getNavigation(e.seriesId, e.order);

  return jsonOk(toEpisodeDTO(e, images, nav));
});

// ============================================================
//  PATCH /api/v1/episodes/{id}
// ============================================================
export const PATCH = withErrors(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!zPrefixedId('epi').safeParse(id).success) throw badRequest('ID 형식이 올바르지 않습니다.');

  const { user } = await requireUser(req);
  const e = await loadEpisode(id);
  assertOwner(e.series.authorId, user.id);

  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== 'object') throw badRequest('JSON 본문이 필요합니다.');
  const parsed = UpdateEpisodeSchema.safeParse(raw);
  if (!parsed.success) throw validationFailed({ fields: zodErrorToFields(parsed.error) });
  const body = parsed.data;

  if (body.image_ids) await assertOwnedReadyImages(body.image_ids, user.id);

  // order 변경 시 유니크 충돌 확인
  if (body.order != null && body.order !== e.order) {
    const dup = await db.episode.findUnique({
      where: { seriesId_order: { seriesId: e.seriesId, order: body.order } },
      select: { id: true, deletedAt: true },
    });
    if (dup && !dup.deletedAt) throw conflict('이미 사용 중인 회차 번호입니다.', { fields: { order: '중복' } });
  }

  const publishedAt = body.published_at === undefined
    ? undefined
    : body.published_at === null
      ? null
      : new Date(body.published_at);

  const updated = await db.$transaction(async (tx) => {
    const u = await tx.episode.update({
      where: { id },
      data: {
        ...(body.title != null ? { title: body.title } : {}),
        ...(body.order != null ? { order: body.order } : {}),
        ...(body.viewer_mode != null ? { viewerMode: body.viewer_mode.toUpperCase() as 'SCROLL' | 'PAGE' } : {}),
        ...(body.is_subscriber_only != null ? { isSubscriberOnly: body.is_subscriber_only } : {}),
        ...(body.is_adult != null ? { isAdult: body.is_adult } : {}),
        ...(publishedAt !== undefined ? { publishedAt } : {}),
      },
    });
    if (body.image_ids) {
      // 기존 이미지 detach
      await tx.image.updateMany({
        where: { episodeId: id, id: { notIn: body.image_ids } },
        data: { episodeId: null, ownerType: null, ownerId: null },
      });
      // 신규 attach + 순서 반영
      for (let i = 0; i < body.image_ids.length; i++) {
        await tx.image.update({
          where: { id: body.image_ids[i]! },
          data: {
            episodeId: id,
            ownerType: 'EPISODE',
            ownerId: id,
            order: i + 1,
          },
        });
      }
    }
    await tx.series.update({ where: { id: e.seriesId }, data: { updatedAt: new Date() } });
    return u;
  });

  const images = await db.image.findMany({
    where: { episodeId: id },
    orderBy: { order: 'asc' },
    select: { id: true, url: true, order: true, width: true, height: true, fileSize: true },
  });
  const nav = await getNavigation(updated.seriesId, updated.order);
  return jsonOk(toEpisodeDTO(updated, images, nav));
});

// ============================================================
//  DELETE /api/v1/episodes/{id}
// ============================================================
export const DELETE = withErrors(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!zPrefixedId('epi').safeParse(id).success) throw badRequest('ID 형식이 올바르지 않습니다.');

  const { user } = await requireUser(req);
  const e = await loadEpisode(id);
  assertOwner(e.series.authorId, user.id);

  await db.$transaction([
    db.episode.update({ where: { id }, data: { deletedAt: new Date() } }),
    // Series 집계 감소
    db.series.update({
      where: { id: e.seriesId },
      data: {
        viewsTotal: { decrement: e.viewsCount },
        likesTotal: { decrement: e.likesCount },
      },
    }),
  ]);
  return jsonNoContent();
});
