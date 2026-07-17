import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { idFor } from '@/lib/id';
import { withErrors, jsonOk, jsonCreated, badRequest, validationFailed } from '@/lib/api-error';
import { CreatePostSchema, PostListQuerySchema } from '@/lib/schemas/post';
import { zodErrorToFields } from '@/lib/schemas/common';
import { assertOwnedReadyImages } from '@/lib/access';
import { resolveTagIds } from '@/lib/tags';
import { toPostDTO } from '@/lib/mappers';
import { encodeCursor, decodeCursor } from '@/lib/cursor';
import { requireUser, getSessionFromRequest } from '@/lib/auth/session';
import type { Prisma } from '@prisma/client';

export const runtime = 'nodejs';

// ============================================================
//  GET /api/v1/posts
// ============================================================
export const GET = withErrors(async (req: NextRequest) => {
  const q = PostListQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) throw validationFailed({ fields: zodErrorToFields(q.error) });
  const { author_id, genre, sort, limit, cursor } = q.data;

  const viewer = await getSessionFromRequest(req);
  const showAdult = false; // Phase 2 스위치
  void viewer;

  const now = new Date();
  const where: Prisma.PostWhereInput = {
    deletedAt: null,
    publishedAt: { not: null, lte: now },
    ...(showAdult ? {} : { isAdult: false }),
    ...(author_id ? { authorId: author_id } : {}),
    ...(genre ? { tags: { some: { tag: { slug: genre, isGenre: true } } } } : {}),
  };

  const decoded = decodeCursor(cursor);
  let orderBy: Prisma.PostOrderByWithRelationInput[];
  let cursorField: 'viewsCount' | 'publishedAt';
  if (sort === 'popular') { orderBy = [{ viewsCount: 'desc' }, { id: 'desc' }]; cursorField = 'viewsCount'; }
  else { orderBy = [{ publishedAt: 'desc' }, { id: 'desc' }]; cursorField = 'publishedAt'; }

  if (decoded) {
    if (cursorField === 'viewsCount') {
      const v = Number(decoded.k);
      where.OR = [
        { viewsCount: { lt: v } },
        { viewsCount: v, id: { lt: decoded.i } },
      ];
    } else {
      const d = new Date(decoded.k as string);
      where.OR = [
        { publishedAt: { lt: d } },
        { publishedAt: d, id: { lt: decoded.i } },
      ];
    }
  }

  const rows = await db.post.findMany({
    where, orderBy, take: limit + 1,
    include: {
      author: { select: { id: true, handle: true, displayName: true, bio: true, createdAt: true } },
      tags: { include: { tag: { select: { slug: true, isGenre: true } } } },
      images: {
        orderBy: { order: 'asc' },
        select: { id: true, url: true, order: true, width: true, height: true, fileSize: true },
      },
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const items = page.map((p) =>
    toPostDTO(p, p.author, p.tags.map((t) => t.tag), p.images)
  );

  const last = page.at(-1);
  const nextCursor = hasMore && last
    ? encodeCursor({
        k: cursorField === 'viewsCount' ? last.viewsCount : (last.publishedAt as Date).toISOString(),
        i: last.id,
      })
    : null;

  return jsonOk({ items, next_cursor: nextCursor, has_more: hasMore });
});

// ============================================================
//  POST /api/v1/posts
// ============================================================
export const POST = withErrors(async (req: NextRequest) => {
  const { user } = await requireUser(req);
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) throw badRequest('Content-Type 은 application/json 이어야 합니다.');

  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== 'object') throw badRequest('JSON 본문이 필요합니다.');
  const parsed = CreatePostSchema.safeParse(raw);
  if (!parsed.success) throw validationFailed({ fields: zodErrorToFields(parsed.error) });
  const body = parsed.data;

  await assertOwnedReadyImages(body.image_ids, user.id);
  const tagIds = await resolveTagIds({ genres: body.genres, tags: body.tags });
  const id = idFor.post();
  const publishedAt = body.published_at ? new Date(body.published_at) : new Date();

  const post = await db.$transaction(async (tx) => {
    const p = await tx.post.create({
      data: {
        id,
        authorId: user.id,
        title: body.title,
        description: body.description ?? null,
        viewerMode: body.viewer_mode.toUpperCase() as 'SCROLL' | 'PAGE',
        isSubscriberOnly: body.is_subscriber_only,
        isAdult: body.is_adult,
        publishedAt,
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
      },
    });
    for (let i = 0; i < body.image_ids.length; i++) {
      await tx.image.update({
        where: { id: body.image_ids[i]! },
        data: {
          postId: p.id,
          ownerType: 'POST',
          ownerId: p.id,
          order: i + 1,
        },
      });
    }
    return p;
  });

  const [author, tags, images] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { id: true, handle: true, displayName: true, bio: true, createdAt: true },
    }),
    db.postTag.findMany({
      where: { postId: post.id },
      select: { tag: { select: { slug: true, isGenre: true } } },
    }).then((rows) => rows.map((r) => r.tag)),
    db.image.findMany({
      where: { postId: post.id },
      orderBy: { order: 'asc' },
      select: { id: true, url: true, order: true, width: true, height: true, fileSize: true },
    }),
  ]);

  return jsonCreated(toPostDTO(post, author, tags, images));
});
