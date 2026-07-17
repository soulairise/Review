import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { withErrors, unauthorized, jsonOk } from '@/lib/api-error';
import {
  ACCESS_TOKEN_TTL_SEC, REFRESH_TOKEN_TTL_SEC,
  issueRefreshToken, hashRefreshToken, signAccessToken,
} from '@/lib/auth/tokens';
import { REFRESH_COOKIE, REFRESH_COOKIE_OPTS } from '@/lib/auth/session';

export const runtime = 'nodejs';

export const POST = withErrors(async (req: NextRequest) => {
  // 쿠키 우선, body 는 fallback
  let raw = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!raw) {
    const body = await req.json().catch(() => null);
    if (body && typeof body === 'object' && typeof (body as { refresh_token?: unknown }).refresh_token === 'string') {
      raw = (body as { refresh_token: string }).refresh_token;
    }
  }
  if (!raw) throw unauthorized('refresh token 이 없습니다.');

  const hash = hashRefreshToken(raw);
  const record = await db.refreshToken.findUnique({
    where: { tokenHash: hash },
    select: {
      id: true, userId: true, expiresAt: true, revokedAt: true,
      user: { select: { id: true, role: true, handle: true, status: true } },
    },
  });

  if (!record || record.revokedAt || record.expiresAt < new Date() || !record.user || record.user.status !== 'ACTIVE') {
    throw unauthorized('refresh token 이 유효하지 않습니다.');
  }

  // 회전(rotation): 이전 토큰 무효화 → 새 토큰 발급
  const newRefresh = issueRefreshToken();
  await db.$transaction([
    db.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    }),
    db.refreshToken.create({
      data: {
        userId: record.userId,
        tokenHash: newRefresh.hash,
        parentId: record.id,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000),
      },
    }),
  ]);

  const accessToken = await signAccessToken({
    sub: record.user.id,
    role: record.user.role,
    handle: record.user.handle,
  });

  const res = jsonOk({
    access_token: accessToken,
    expires_in: ACCESS_TOKEN_TTL_SEC,
    token_type: 'Bearer',
  });
  res.cookies.set(REFRESH_COOKIE, newRefresh.raw, REFRESH_COOKIE_OPTS);
  return res;
});
