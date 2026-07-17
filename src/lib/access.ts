import { db } from './db';
import { forbidden, notFound } from './api-error';

/**
 * 리소스 소유권 검증 헬퍼.
 * mutating 엔드포인트(PATCH/DELETE/create-child) 모두 서버에서 재검증한다.
 *
 * @throws 403 forbidden / 404 not_found
 */
export function assertOwner(ownerId: string, userId: string): void {
  if (ownerId !== userId) throw forbidden();
}

/**
 * Episode 접근 권한 확인.
 * - 삭제되었으면 404
 * - 미공개(publishedAt 미래) 이고 소유자가 아니면 404 (존재 자체를 숨김)
 * - is_subscriber_only 이고 소유자·활성 구독자가 아니면 403 with required_subscription
 */
export async function assertCanReadEpisode(
  episode: {
    id: string;
    seriesId: string;
    isSubscriberOnly: boolean;
    publishedAt: Date | null;
    deletedAt: Date | null;
  },
  seriesAuthorId: string,
  viewerUserId: string | null
): Promise<void> {
  if (episode.deletedAt) throw notFound();

  const isOwner = viewerUserId != null && viewerUserId === seriesAuthorId;

  // 예약 발행 · 미공개
  if (!episode.publishedAt || episode.publishedAt > new Date()) {
    if (!isOwner) throw notFound();
    return; // 소유자는 미공개도 접근
  }

  if (!episode.isSubscriberOnly) return;
  if (isOwner) return;

  if (!viewerUserId) {
    throw forbidden('이 회차는 구독자 전용입니다.', {
      required_subscription: true,
      series_id: episode.seriesId,
      author_id: seriesAuthorId,
    });
  }

  const sub = await db.subscription.findFirst({
    where: {
      subscriberId: viewerUserId,
      authorId: seriesAuthorId,
      status: 'ACTIVE',
      currentPeriodEnd: { gte: new Date() },
    },
    select: { id: true },
  });
  if (!sub) {
    throw forbidden('이 회차는 구독자 전용입니다.', {
      required_subscription: true,
      series_id: episode.seriesId,
      author_id: seriesAuthorId,
    });
  }
}

/**
 * Post 접근. 회차보다 단순 — 미공개 · 구독자 전용만 체크.
 */
export async function assertCanReadPost(
  post: {
    id: string;
    authorId: string;
    isSubscriberOnly: boolean;
    publishedAt: Date | null;
    deletedAt: Date | null;
  },
  viewerUserId: string | null
): Promise<void> {
  if (post.deletedAt) throw notFound();
  const isOwner = viewerUserId != null && viewerUserId === post.authorId;
  if (!post.publishedAt || post.publishedAt > new Date()) {
    if (!isOwner) throw notFound();
    return;
  }
  if (!post.isSubscriberOnly) return;
  if (isOwner) return;
  if (!viewerUserId) {
    throw forbidden('이 포스트는 구독자 전용입니다.', {
      required_subscription: true,
      author_id: post.authorId,
    });
  }
  const sub = await db.subscription.findFirst({
    where: {
      subscriberId: viewerUserId,
      authorId: post.authorId,
      status: 'ACTIVE',
      currentPeriodEnd: { gte: new Date() },
    },
    select: { id: true },
  });
  if (!sub) {
    throw forbidden('이 포스트는 구독자 전용입니다.', {
      required_subscription: true,
      author_id: post.authorId,
    });
  }
}

/**
 * 유저가 업로드한 이미지들이 본인 소유이며 사용 가능(READY) 상태인지 검증.
 * 사용된 이미지는 소유자만 다시 사용할 수 있게 하려면 여기서 추가 검사.
 */
export async function assertOwnedReadyImages(
  imageIds: string[],
  uploaderId: string
): Promise<void> {
  if (imageIds.length === 0) return;
  const images = await db.image.findMany({
    where: { id: { in: imageIds } },
    select: { id: true, uploaderId: true, status: true },
  });
  if (images.length !== imageIds.length) {
    throw notFound('일부 이미지를 찾을 수 없습니다.');
  }
  for (const img of images) {
    if (img.uploaderId !== uploaderId) {
      throw forbidden('본인이 업로드하지 않은 이미지를 사용할 수 없습니다.');
    }
    if (img.status !== 'READY') {
      throw forbidden('아직 처리되지 않은 이미지가 있습니다.', {
        fields: { image_ids: '아직 처리되지 않은 이미지가 있습니다.' },
      });
    }
  }
}
