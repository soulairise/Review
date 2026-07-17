import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { verifyAccessToken, type AccessTokenClaims, REFRESH_TOKEN_TTL_SEC } from './tokens';
import { unauthorized } from '@/lib/api-error';

// 쿠키 이름·플래그
export const REFRESH_COOKIE = '__Host-jitda_refresh';

export const REFRESH_COOKIE_OPTS = {
  httpOnly: true as const,
  secure: true as const,
  sameSite: 'strict' as const,
  path: '/',
  maxAge: REFRESH_TOKEN_TTL_SEC,
};

// 요청 헤더의 Bearer 토큰에서 세션을 파싱.
export async function getSessionFromRequest(req: NextRequest): Promise<AccessTokenClaims | null> {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;
  try {
    return await verifyAccessToken(token);
  } catch {
    return null;
  }
}

// 필수 인증. 없으면 401 throw.
export async function requireUser(req: NextRequest) {
  const sess = await getSessionFromRequest(req);
  if (!sess) throw unauthorized();
  // 유저가 살아있는지 & 상태 확인 (SUSPENDED 등 즉시 반영)
  const user = await db.user.findUnique({
    where: { id: sess.sub },
    select: { id: true, role: true, handle: true, status: true, displayName: true },
  });
  if (!user || user.status !== 'ACTIVE') throw unauthorized();
  return { ...sess, user };
}

// 서버 컴포넌트/서버 액션용 쿠키 유틸
export async function readRefreshCookie(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(REFRESH_COOKIE)?.value;
}
