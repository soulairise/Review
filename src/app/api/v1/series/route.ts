import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { idFor } from '@/lib/id';
import { withErrors, jsonOk, jsonCreated, badRequest, validationFailed } from '@/lib/api-error';
import { CreateSeriesSchema, SeriesListQuerySchema } from '@/lib/schemas/series';
import { zodErrorToFields } from '@/lib/schemas/common';
import { resolveTagIds } from '@/lib/tags';
import { toSeriesDTO, type SeriesDTO } from '@/lib/mappers';
import { encodeCursor, decodeCursor } from '@/lib/cursor';
import { requireUser, getSessionFromRequest } from '@/lib/auth/session';
import type { Prisma } from '@prisma/client';

export const runtime = 'nodejs';

// ============================================================
//  GET /api/v1/series
//  목록. 필터 · 커서 페이지네이션.
// ============================================================
export const GET = withErrors(async (req: NextRequest) => {
  const url = new URL(req.url);
  const q = SeriesListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!q.success) throw validationFailed({ fields: zodErrorToFields(q.error) });
  const { author_id, genre, status, sort, limit, cursor } = q.data;

  // 성인 콘텐츠는 인증·검증된 성인만 노출 (Phase 2 스위치 대비)
  const viewer = await getSessionFromRequest(req);
  const showAdult = false; // Phase 2 에서 viewer.isAdultVerified 로 대체

  const where: Prisma.SeriesWhereInput = {
    deletedAt: null,
    ...(showAdult ? {} : { isAdult: false }),
    ...(author_id ? { authorId: author_id } : {}),
    ...(status ? { status: status.toUpperCase() as Prisma.SeriesWhereInput['status'] } : {}),
    ...(genre ? { tags: { some: { tag: { slug: genre, isGenre: true } } } } : {}),
  };

  const decoded = decodeCursor(cursor);
  // 정렬 필드
  let orderBy: Prisma.SeriesOrderByWithRelationInput[];
  let cursorField: 'viewsTotal' | 'createdAt' | 'updatedAt';
  if (sort === 'popular') { orderBy = [{ viewsTotal: 'desc' }, { id: 'desc' }]; cursorField = 'viewsTotal'; }
  else if (sort === 'latest') { orderBy = [{ createdAt: 'desc' }, { id: 'desc' }]; cursorField = 'createdAt'; }
  else { orderBy = [{ updatedAt: 'desc' }, { id: 'desc' }]; cursorField = 'updatedAt'; }

  // Cursor 는 (sortValue, id) 튜플로 filtering
  if (decoded) {
    const k = decoded.k;
    const op: 'lt' | 'lte' = 'lte'; // tie-break id 로 정확히 커팅
    // sortValue 가 같으면 id 로 tie-break
    where.OR = [
      { [cursorField]: { lt: cursorField === 'viewsTotal' ? Number(k) : new Date(k as string) } },
      {
        [cursorField]: cursorField === 'viewsTotal' ? Number(k) : new Date(k as string),
        id: { lt: decoded.i },
      },
    ] as Prisma.SeriesWhereInput['OR'];
    // remove the naive lte
    void op;
  }

  // fetch + 1 로 has_more 판정
  const rows = await db.series.findMany({
    where,
    orderBy,
    take: limit + 1,
    include: {
      author: { select: { id: true, handle: true, displayName: true, bio: true, createdAt: true } },
      tags: { include: { tag: { select: { slug: true, isGenre: true } } } },
      _count: { select: { episodes: { where: { deletedAt: null } } } },
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  // subscribers_only_count 는 배치로 (N+1 방지)
  const seriesIds = page.map((s) => s.id);
  const subOnlyGroups = seriesIds.length
    ? await db.episode.groupBy({
        by: ['seriesId'],
        where: { seriesId: { in: seriesIds }, isSubscriberOnly: true, deletedAt: null },
        _count: true,
      })
    : [];
  const subOnlyMap = new Map(subOnlyGroups.map((g) => [g.seriesId, g._count]));

  const items: SeriesDTO[] = page.map((s) =>
    toSeriesDTO({
      s,
      author: s.author,
      tags: s.tags.map((t) => t.tag),
      episodeCount: s._count.episodes,
      subscribersOnlyCount: subOnlyMap.get(s.id) ?? 0,
    })
  );

  const last = page.at(-1);
  const nextCursor = hasMore && last
    ? encodeCursor({
        k: cursorField === 'viewsTotal' ? last.viewsTotal : (last[cursorField] as Date).toISOString(),
        i: last.id,
      })
    : null;

  return jsonOk({ items, next_cursor: nextCursor, has_more: hasMore });
});

// ============================================================
//  POST /api/v1/series
//  새 시리즈 생성.
// ============================================================
export const POST = withErrors(async (req: NextRequest) => {
  const { user } = await requireUser(req);
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) throw badRequest('Content-Type 은 application/json 이어야 합니다.');

  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== 'object') throw badRequest('JSON 본문이 필요합니다.');

  const parsed = CreateSeriesSchema.safeParse(raw);
  if (!parsed.success) throw validationFailed({ fields: zodErrorToFields(parsed.error) });
  const body = parsed.data;

  // 커버 이미지 검증 (있으면)
  if (body.cover_image_id) {
    const img = await db.image.findUnique({
      where: { id: body.cover_image_id },
      select: { id: true, uploaderId: true, status: true },
    });
    if (!img || img.uploaderId !== user.id) throw validationFailed({ fields: { cover_image_id: '커버 이미지를 찾을 수 없습니다.' } });
    if (img.status !== 'READY') throw validationFailed({ fields: { cover_image_id: '커버 이미지가 아직 처리되지 않았습니다.' } });
  }

  const tagIds = await resolveTagIds({ genres: body.genres, tags: body.tags });
  const id = idFor.series();

  const created = await db.series.create({
    data: {
      id,
      authorId: user.id,
      title: body.title,
      description: body.description ?? null,
      coverImageId: body.cover_image_id ?? null,
      viewerModeDefault: body.viewer_mode_default.toUpperCase() as 'SCROLL' | 'PAGE',
      isAdult: body.is_adult,
      tags: { create: tagIds.map((tagId) => ({ tagId })) },
    },
    include: {
      author: { select: { id: true, handle: true, displayName: true, bio: true, createdAt: true } },
      tags: { include: { tag: { select: { slug: true, isGenre: true } } } },
      _count: { select: { episodes: { where: { deletedAt: null } } } },
    },
  });

  return jsonCreated(
    toSeriesDTO({
      s: created,
      author: created.author,
      tags: created.tags.map((t) => t.tag),
      episodeCount: created._count.episodes,
      subscribersOnlyCount: 0,
    })
  );
});
