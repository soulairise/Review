import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { withErrors, jsonOk } from '@/lib/api-error';
import { requireUser } from '@/lib/auth/session';

export const runtime = 'nodejs';

export const GET = withErrors(async (req: NextRequest) => {
  const { user } = await requireUser(req);

  const full = await db.user.findUnique({
    where: { id: user.id },
    select: {
      id: true, handle: true, displayName: true, avatarImageId: true, bio: true,
      email: true, emailVerifiedAt: true, isAdultVerified: true, role: true,
      createdAt: true,
      authorProfile: {
        select: {
          subscriptionEnabled: true, subscriptionPrice: true, subscriptionCurrency: true,
          payoutAccountRef: true,
        },
      },
    },
  });
  if (!full) throw new Error('user not found');

  return jsonOk({
    user: {
      id: full.id,
      handle: full.handle,
      display_name: full.displayName,
      avatar_url: null,
      bio: full.bio,
      is_author: true,
      created_at: full.createdAt.toISOString(),
    },
    email: full.email,
    email_verified: !!full.emailVerifiedAt,
    is_adult_verified: full.isAdultVerified,
    role: full.role.toLowerCase(),
    author_profile: {
      subscription: {
        enabled: full.authorProfile?.subscriptionEnabled ?? false,
        price: full.authorProfile?.subscriptionPrice ?? null,
        currency: full.authorProfile?.subscriptionCurrency ?? 'KRW',
      },
      stripe_connect_ready: !!full.authorProfile?.payoutAccountRef,
    },
  });
});

export const DELETE = withErrors(async (req: NextRequest) => {
  const { user } = await requireUser(req);
  const scheduled = new Date(Date.now() + 30 * 86_400_000);
  await db.user.update({
    where: { id: user.id },
    data: { status: 'PENDING_DELETION', scheduledDeletionAt: scheduled },
  });
  // 활성 구독 자동 해지 (Stripe 취소는 별도 잡)
  await db.subscription.updateMany({
    where: { subscriberId: user.id, status: 'ACTIVE' },
    data: { status: 'CANCELED', canceledAt: new Date() },
  });
  return jsonOk({ scheduled_deletion_at: scheduled.toISOString() });
});
