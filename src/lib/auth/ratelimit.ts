import { db } from '@/lib/db';
import { rateLimited } from '@/lib/api-error';

// 보안 명세 §3.6 & §9.
// 로그인 실패 카운트: 같은 (이메일, IP) 쌍으로 15분 내 5회 실패 시 15분 잠금.

const WINDOW_MIN = 15;
const MAX_FAILS = 5;

export interface LoginAttemptContext {
  email: string;
  ip: string;
  userAgent?: string | null;
  userId?: string | null;
}

export async function checkLoginLockout(ctx: LoginAttemptContext): Promise<void> {
  const windowStart = new Date(Date.now() - WINDOW_MIN * 60_000);
  const recentFails = await db.loginAttempt.count({
    where: {
      emailTried: ctx.email,
      ip: ctx.ip,
      success: false,
      createdAt: { gte: windowStart },
    },
  });
  if (recentFails >= MAX_FAILS) {
    throw rateLimited(
      `로그인 시도가 너무 많습니다. ${WINDOW_MIN}분 후 다시 시도해주세요.`,
      WINDOW_MIN * 60
    );
  }
}

export async function recordLoginAttempt(ctx: LoginAttemptContext, success: boolean): Promise<void> {
  await db.loginAttempt.create({
    data: {
      emailTried: ctx.email,
      ip: ctx.ip,
      userAgent: ctx.userAgent ?? undefined,
      userId: ctx.userId ?? undefined,
      success,
    },
  });
}

// 요청 IP 추출. 프록시 뒤에서는 X-Forwarded-For 첫 번째 (신뢰할 수 있는 프록시 전제).
export function getClientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = headers.get('x-real-ip');
  if (real) return real.trim();
  return '0.0.0.0';
}
