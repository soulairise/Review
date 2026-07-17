import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { withErrors, jsonNoContent, badRequest, notFound } from '@/lib/api-error';
import { assertCanReadEpisode } from '@/lib/access';
import { zPrefixedId } from '@/lib/schemas/common';
import { EpisodeViewSchema } from '@/lib/schemas/episode';
import { getSessionFromRequest } from '@/lib/auth/session';
import { getClientIp } from '@/lib/auth/ratelimit';

export const runtime = 'nodejs';

// 어뷰징 방지 in-memory dedup: (episodeId + viewerKey) → 1시간 TTL.
// 실 프로덕션은 Redis (Upstash) 로 교체. 단일 인스턴스 · 재시작 후 초기화 됨.
const seenViews = new Map<string, number>();
const DEDUPE_MS = 60 * 60 * 1000;

function makeKey(episodeId: string, viewerKey: string): string {
  return episodeId + '|' + viewerKey;
}

function isDuplicate(key: string): boolean {
  const exp = seenViews.get(key);
  const now = Date.now();
  if (exp && exp > now) return true;
  seenViews.set(key, now + DEDUPE_MS);
  // 소규모 GC
  if (seenViews.size > 10_000) {
    for (const [k, v] of seenViews) if (v <= now) seenViews.delete(k);
  }
  return false;
}

// POST /api/v1/episodes/{id}/view
export const POST = withErrors(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!zPrefixedId('epi').safeParse(id).success) throw badRequest('ID 형식이 올바르지 않습니다.');

  const raw = await req.json().catch(() => null);
  const parsed = EpisodeViewSchema.safeParse(raw ?? {});
  const sessionId = parsed.success ? parsed.data?.session_id : undefined;

  const episode = await db.episode.findUnique({
    where: { id },
    select: {
      id: true, seriesId: true, isSubscriberOnly: true, publishedAt: true, deletedAt: true,
      series: { select: { authorId: true } },
    },
  });
  if (!episode || episode.deletedAt) throw notFound();

  const viewer = await getSessionFromRequest(req);
  // 접근 권한이 없는 회차는 조회 카운트도 X (뷰어에 진입할 수 없으므로 정상 흐름 X)
  await assertCanReadEpisode(episode, episode.series.authorId, viewer?.sub ?? null);

  // dedup key: 로그인 유저면 user id, 아니면 (session_id 또는 IP)
  const viewerKey = viewer?.sub ?? sessionId ?? getClientIp(req.headers);
  if (isDuplicate(makeKey(id, viewerKey))) return jsonNoContent();

  await db.$transaction([
    db.episode.update({ where: { id }, data: { viewsCount: { increment: 1 } } }),
    db.series.update({ where: { id: episode.seriesId }, data: { viewsTotal: { increment: 1 } } }),
  ]);
  return jsonNoContent();
});
