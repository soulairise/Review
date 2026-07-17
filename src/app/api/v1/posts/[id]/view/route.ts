import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { withErrors, jsonNoContent, badRequest, notFound } from '@/lib/api-error';
import { assertCanReadPost } from '@/lib/access';
import { zPrefixedId } from '@/lib/schemas/common';
import { PostViewSchema } from '@/lib/schemas/post';
import { getSessionFromRequest } from '@/lib/auth/session';
import { getClientIp } from '@/lib/auth/ratelimit';

export const runtime = 'nodejs';

const seenViews = new Map<string, number>();
const DEDUPE_MS = 60 * 60 * 1000;

function checkDup(key: string): boolean {
  const now = Date.now();
  const exp = seenViews.get(key);
  if (exp && exp > now) return true;
  seenViews.set(key, now + DEDUPE_MS);
  if (seenViews.size > 10_000) {
    for (const [k, v] of seenViews) if (v <= now) seenViews.delete(k);
  }
  return false;
}

// POST /api/v1/posts/{id}/view
export const POST = withErrors(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!zPrefixedId('pst').safeParse(id).success) throw badRequest('ID 형식이 올바르지 않습니다.');

  const raw = await req.json().catch(() => null);
  const parsed = PostViewSchema.safeParse(raw ?? {});
  const sessionId = parsed.success ? parsed.data?.session_id : undefined;

  const post = await db.post.findUnique({
    where: { id },
    select: { id: true, authorId: true, isSubscriberOnly: true, publishedAt: true, deletedAt: true },
  });
  if (!post || post.deletedAt) throw notFound();

  const viewer = await getSessionFromRequest(req);
  await assertCanReadPost(post, viewer?.sub ?? null);

  const viewerKey = viewer?.sub ?? sessionId ?? getClientIp(req.headers);
  if (checkDup(id + '|' + viewerKey)) return jsonNoContent();

  await db.post.update({ where: { id }, data: { viewsCount: { increment: 1 } } });
  return jsonNoContent();
});
