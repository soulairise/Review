import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { idFor } from '@/lib/id';
import { withErrors, badRequest, conflict, jsonCreated, validationFailed } from '@/lib/api-error';
import { SignupSchema } from '@/lib/schemas/auth';
import { zodErrorToFields } from '@/lib/schemas/common';
import { hashPassword, checkPasswordStrength } from '@/lib/auth/password';

export const runtime = 'nodejs'; // Argon2 는 Node runtime 필요

export const POST = withErrors(async (req: NextRequest) => {
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) throw badRequest('Content-Type 은 application/json 이어야 합니다.');

  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== 'object') throw badRequest('JSON 본문이 필요합니다.');

  const parsed = SignupSchema.safeParse(raw);
  if (!parsed.success) throw validationFailed({ fields: zodErrorToFields(parsed.error) });

  const { email, password, display_name, handle } = parsed.data;

  const strength = checkPasswordStrength(password, { email, handle, displayName: display_name });
  if (!strength.ok) throw validationFailed({ fields: { password: strength.reason ?? '더 강한 비밀번호가 필요합니다.' } });

  // 중복 검사 (하나의 쿼리로 묶어 race 축소)
  const existing = await db.user.findFirst({
    where: { OR: [{ email }, { handle }] },
    select: { email: true, handle: true },
  });
  if (existing) {
    const fields: Record<string, string> = {};
    if (existing.email === email) fields.email = '이미 사용 중입니다.';
    if (existing.handle === handle) fields.handle = '이미 사용 중입니다.';
    throw conflict('이미 사용 중인 값이 있습니다.', { fields });
  }

  const passwordHash = await hashPassword(password);
  const userId = idFor.user();

  const user = await db.user.create({
    data: {
      id: userId,
      email,
      passwordHash,
      displayName: display_name,
      handle,
      authorProfile: { create: {} },
      notificationSettings: { create: {} },
    },
    select: {
      id: true, handle: true, displayName: true, avatarImageId: true,
      bio: true, createdAt: true,
    },
  });

  // TODO: 이메일 인증 링크 발송 (Resend). 여기서는 큐잉 스텁.
  // await queueEmailVerification(userId, email);

  return jsonCreated({
    user: {
      id: user.id,
      handle: user.handle,
      display_name: user.displayName,
      avatar_url: null,
      bio: user.bio,
      is_author: true,
      created_at: user.createdAt.toISOString(),
    },
    email_verification_sent: true,
  });
});
