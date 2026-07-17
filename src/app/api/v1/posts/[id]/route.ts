import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import {
  withErrors, jsonOk, jsonNoContent, badRequest, notFound, validationFailed,
} from '@/lib/api-error';
import { assertOwner, assertCanReadPost, assertOwnedReadyImages } from '@/lib/access';
import { UpdatePostSchema } from '@/lib/schemas/post';
import { zodErrorToFields, zPrefixedId } from '@/lib/schemas/common';
import { resolveTagIds } from '@/lib/tags';
import { toPostDTO } from '@/lib/mappers';
import { requireUser, getSessionFromRequest } from '@/lib/auth/session';

export const runtime = 'nodejs';

async function loadPost(id: string) {
  const p = await db.post.findUnique({ where: { id } });
  if (!p) throw notFound();
  return p;
}

async function assembleDTO(id: string) {
  const [post, author, tags, images] = await Promise.all([
    db.post.findUniqueOrThrow({ where: { id } }),
    db.post.findUniqueOrThrow({
      where: { id },
      select: { author: { select: { id: true, handle: true, displayName: true, bio: true, createdAt: true } } },
    }).then((r) => r.author),
    db.postTag.findMany({
      where: { postId: id },
      select: { tag: { select: { slug: true, isGenre: true } } },
    }).then((rows) => rows.map((r) => r.tag)),
    db.image.findMany({
      where: { postId: id },
      orderBy: { order: 'asc' },
      select: { id: true, url: true, order: true, width: true, height: true, fileSize: true },
    }),
  ]);
  return toPostDTO(post, author, tags, images);
}

// GET /posts/{id}
export const GET = withErrors(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!zPrefixedId('pst').safeParse(id).success) throw badRequest('ID 형식이 올바르지 않습니다.');
  const p = await loadPost(id);
  const viewer = await getSessionFromRequest(req);
  await assertCanReadPost(p, viewer?.sub ?? null);
  return jsonOk(await assembleDTO(id));
});

// PATCH /posts/{id}
export const PATCH = withErrors(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!zPrefixedId('pst').safeParse(id).success) throw badRequest('ID 형식이 올바르지 않습니다.');
  const { user } = await requireUser(req);
  const p = await loadPost(id);
  if (p.deletedAt) throw notFound();
  assertOwner(p.authorId, user.id);

  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== 'object') throw badRequest('JSON 본문이 필요합니다.');
  const parsed = UpdatePostSchema.safeParse(raw);
  if (!parsed.success) throw validationFailed({ fields: zodErrorToFields(parsed.error) });
  const body = parsed.data;

  if (body.image_ids) await assertOwnedReadyImages(body.image_ids, user.id);
  const tagsToApply = body.genres || body.tags
    ? await resolveTagIds({ genres: body.genres ?? [], tags: body.tags ?? [] })
    : null;

  const publishedAt = body.published_at === undefined
    ? undefined
    : body.published_at === null
      ? null
      : new Date(body.published_at);

  await db.$transaction(async (tx) => {
    if (tagsToApply) {
      await tx.postTag.deleteMany({ where: { postId: id } });
      if (tagsToApply.length) {
        await tx.postTag.createMany({
          data: tagsToApply.map((tagId) => ({ postId: id, tagId })),
          skipDuplicates: true,
        });
      }
    }
    await tx.post.update({
      where: { id },
      data: {
        ...(body.title != null ? { title: body.title } : {}),
        ...(body.description != null ? { description: body.description } : {}),
        ...(body.viewer_mode != null ? { viewerMode: body.viewer_mode.toUpperCase() as 'SCROLL' | 'PAGE' } : {}),
        ...(body.is_subscriber_only != null ? { isSubscriberOnly: body.is_subscriber_only } : {}),
        ...(body.is_adult != null ? { isAdult: body.is_adult } : {}),
        ...(publishedAt !== undefined ? { publishedAt } : {}),
      },
    });
    if (body.image_ids) {
      await tx.image.updateMany({
        where: { postId: id, id: { notIn: body.image_ids } },
        data: { postId: null, ownerType: null, ownerId: null },
      });
      for (let i = 0; i < body.image_ids.length; i++) {
        await tx.image.update({
          where: { id: body.image_ids[i]! },
          data: { postId: id, ownerType: 'POST', ownerId: id, order: i + 1 },
        });
      }
    }
  });

  return jsonOk(await assembleDTO(id));
});

// DELETE /posts/{id}
export const DELETE = withErrors(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!zPrefixedId('pst').safeParse(id).success) throw badRequest('ID 형식이 올바르지 않습니다.');
  const { user } = await requireUser(req);
  const p = await loadPost(id);
  if (p.deletedAt) throw notFound();
  assertOwner(p.authorId, user.id);
  await db.post.update({ where: { id }, data: { deletedAt: new Date() } });
  return jsonNoContent();
});
