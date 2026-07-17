import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { withErrors, jsonNoContent } from '@/lib/api-error';
import { hashRefreshToken } from '@/lib/auth/tokens';
import { REFRESH_COOKIE, REFRESH_COOKIE_OPTS } from '@/lib/auth/session';

export const runtime = 'nodejs';

export const POST = withErrors(async (req: NextRequest) => {
  const raw = req.cookies.get(REFRESH_COOKIE)?.value
    ?? (await req.json().catch(() => null))?.refresh_token;

  if (typeof raw === 'string' && raw.length > 0) {
    const hash = hashRefreshToken(raw);
    // 존재 여부 상관없이 revoke. 응답에도 오류 노출 X.
    await db.refreshToken.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  const res = jsonNoContent();
  // 쿠키 제거
  res.cookies.set(REFRESH_COOKIE, '', { ...REFRESH_COOKIE_OPTS, maxAge: 0 });
  return res;
});
