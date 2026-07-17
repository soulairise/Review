import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import {
  withErrors, jsonOk, jsonNoContent, notFound, badRequest, validationFailed,
} from '@/lib/api-error';
import { assertOwner } from '@/lib/access';
import { UpdateSeriesSchema } from '@/lib/schemas/series';
import { zodErrorToFields, zPrefixedId } from '@/lib/schemas/common';
import { resolveTagIds } from '@/lib/tags';
import { toSeriesDTO } from '@/lib/mappers';
import { requireUser, getSessionFromRequest } from '@/lib/auth/session';

export const runtime = 'nodejs';

async function loadSeries(id: string) {
  const s = await db.series.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, handle: true, displayName: true, bio: true, createdAt: true } },
      tags: { include: { tag: { select: { slug: true, isGenre: true } } } },
      _count: { select: { episodes: { where: { deletedAt: null } } } },
    },
  });
  if (!s || s.deletedAt) throw notFound();
  const subOnly = await db.episode.count({
    where: { seriesId: s.id, isSubscriberOnly: true, deletedAt: null },
  });
  return { s, subOnly };
}

// ============================================================
//  GET /api/v1/series/{id}
// ============================================================
export const GET = withErrors(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!zPrefixedId('srs').safeParse(id).success) throw badRequest('ID 형식이 올바르지 않습니다.');

  const { s, subOnly } = await loadSeries(id);
  const viewer = await getSessionFromRequest(req);

  let isSubscribedToAuthor = false;
  if (viewer) {
    const sub = await db.subscription.findFirst({
      where: {
        subscriberId: viewer.sub,
        authorId: s.authorId,
        status: 'ACTIVE',
        currentPeriodEnd: { gte: new Date() },
      },
      select: { id: true },
    });
    isSubscribedToAuthor = !!sub;
  }

  return jsonOk({
    series: toSeriesDTO({
      s,
      author: s.author,
      tags: s.tags.map((t) => t.tag),
      episodeCount: s._count.episodes,
      subscribersOnlyCount: subOnly,
    }),
    viewer: { is_subscribed_to_author: isSubscribedToAuthor },
  });
});

// ============================================================
//  PATCH /api/v1/series/{id}
//  본인 소유만.
// ============================================================
export const PATCH = withErrors(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!zPrefixedId('srs').safeParse(id).success) throw badRequest('ID 형식이 올바르지 않습니다.');

  const { user } = await requireUser(req);
  const existing = await db.series.findUnique({
    where: { id },
    select: { id: true, authorId: true, deletedAt: true },
  });
  if (!existing || existing.deletedAt) throw notFound();
  assertOwner(existing.authorId, user.id);

  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== 'object') throw badRequest('JSON 본문이 필요합니다.');
  const parsed = UpdateSeriesSchema.safeParse(raw);
  if (!parsed.success) throw validationFailed({ fields: zodErrorToFields(parsed.error) });
  const body = parsed.data;

  // 커버 이미지 검증
  if (body.cover_image_id) {
    const img = await db.image.findUnique({
      where: { id: body.cover_image_id },
      select: { uploaderId: true, status: true },
    });
    if (!img || img.uploaderId !== user.id || img.status !== 'READY') {
      throw validationFailed({ fields: { cover_image_id: '유효하지 않은 커버 이미지입니다.' } });
    }
  }

  // 태그 교체 (transaction 안에서 삭제 후 재삽입)
  const tagsToApply = body.genres || body.tags
    ? await resolveTagIds({ genres: body.genres ?? [], tags: body.tags ?? [] })
    : null;

  const updated = await db.$transaction(async (tx) => {
    if (tagsToApply) {
      await tx.seriesTag.deleteMany({ where: { seriesId: id } });
      if (tagsToApply.length) {
        await tx.seriesTag.createMany({
          data: tagsToApply.map((tagId) => ({ seriesId: id, tagId })),
          skipDuplicates: true,
        });
      }
    }
    return await tx.series.update({
      where: { id },
      data: {
        ...(body.title != null ? { title: body.title } : {}),
        ...(body.description != null ? { description: body.description } : {}),
        ...(body.cover_image_id != null ? { coverImageId: body.cover_image_id } : {}),
        ...(body.viewer_mode_default != null ? { viewerModeDefault: body.viewer_mode_default.toUpperCase() as 'SCROLL' | 'PAGE' } : {}),
        ...(body.status != null ? { status: body.status.toUpperCase() as 'ONGOING' | 'COMPLETED' | 'HIATUS' } : {}),
        ...(body.is_adult != null ? { isAdult: body.is_adult } : {}),
      },
      include: {
        author: { select: { id: true, handle: true, displayName: true, bio: true, createdAt: true } },
        tags: { include: { tag: { select: { slug: true, isGenre: true } } } },
        _count: { select: { episodes: { where: { deletedAt: null } } } },
      },
    });
  });

  const subOnly = await db.episode.count({
    where: { seriesId: id, isSubscriberOnly: true, deletedAt: null },
  });

  return jsonOk(
    toSeriesDTO({
      s: updated,
      author: updated.author,
      tags: updated.tags.map((t) => t.tag),
      episodeCount: updated._count.episodes,
      subscribersOnlyCount: subOnly,
    })
  );
});

// ============================================================
//  DELETE /api/v1/series/{id}
//  Soft delete — 하위 회차 함께 soft delete.
// ============================================================
export const DELETE = withErrors(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!zPrefixedId('srs').safeParse(id).success) throw badRequest('ID 형식이 올바르지 않습니다.');

  const { user } = await requireUser(req);
  const existing = await db.series.findUnique({
    where: { id },
    select: { id: true, authorId: true, deletedAt: true },
  });
  if (!existing || existing.deletedAt) throw notFound();
  assertOwner(existing.authorId, user.id);

  const now = new Date();
  await db.$transaction([
    db.series.update({ where: { id }, data: { deletedAt: now } }),
    db.episode.updateMany({ where: { seriesId: id, deletedAt: null }, data: { deletedAt: now } }),
  ]);
  return jsonNoContent();
});
