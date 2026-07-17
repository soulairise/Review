import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import {
  withErrors, badRequest, validationFailed, jsonOk,
} from '@/lib/api-error';
import { APIError } from '@/lib/api-error';
import { LoginSchema } from '@/lib/schemas/auth';
import { zodErrorToFields } from '@/lib/schemas/common';
import { burnCpuLikeAVerify, verifyPassword } from '@/lib/auth/password';
import {
  signAccessToken, issueRefreshToken, ACCESS_TOKEN_TTL_SEC, REFRESH_TOKEN_TTL_SEC,
} from '@/lib/auth/tokens';
import {
  checkLoginLockout, recordLoginAttempt, getClientIp,
} from '@/lib/auth/ratelimit';
import { REFRESH_COOKIE, REFRESH_COOKIE_OPTS } from '@/lib/auth/session';

export const runtime = 'nodejs';

// 통일된 실패 응답 — 계정 존재 여부·비밀번호 오류를 구분하지 않는다.
const invalidCredentials = () =>
  new APIError(401, 'invalid_credentials', '이메일 또는 비밀번호가 올바르지 않습니다.');

export const POST = withErrors(async (req: NextRequest) => {
  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== 'object') throw badRequest('JSON 본문이 필요합니다.');

  const parsed = LoginSchema.safeParse(raw);
  if (!parsed.success) throw validationFailed({ fields: zodErrorToFields(parsed.error) });
  const { email, password } = parsed.data;

  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent');

  // 잠금 확인
  await checkLoginLockout({ email, ip });

  const user = await db.user.findUnique({
    where: { email },
    select: {
      id: true, passwordHash: true, role: true, handle: true, displayName: true,
      status: true, emailVerifiedAt: true,
    },
  });

  if (!user || !user.passwordHash) {
    // 존재하지 않아도 실 해싱만큼 CPU 소비 → timing attack 방어
    await burnCpuLikeAVerify(password);
    await recordLoginAttempt({ email, ip, userAgent }, false);
    throw invalidCredentials();
  }

  if (user.status !== 'ACTIVE') {
    await recordLoginAttempt({ email, ip, userAgent, userId: user.id }, false);
    throw invalidCredentials(); // 계정 상태 구체 노출 X
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await recordLoginAttempt({ email, ip, userAgent, userId: user.id }, false);
    throw invalidCredentials();
  }

  await recordLoginAttempt({ email, ip, userAgent, userId: user.id }, true);

  // 토큰 발급
  const accessToken = await signAccessToken({ sub: user.id, role: user.role, handle: user.handle });
  const refresh = issueRefreshToken();
  await db.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: refresh.hash,
      userAgent: userAgent ?? undefined,
      ip,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000),
    },
  });

  const res = jsonOk({
    access_token: accessToken,
    expires_in: ACCESS_TOKEN_TTL_SEC,
    token_type: 'Bearer',
    user: {
      id: user.id,
      handle: user.handle,
      display_name: user.displayName,
      avatar_url: null,
      bio: null,
      is_author: true,
      created_at: new Date().toISOString(),
    },
  });
  // Refresh token 은 HttpOnly 쿠키로만
  res.cookies.set(REFRESH_COOKIE, refresh.raw, REFRESH_COOKIE_OPTS);
  return res;
});
