// DB row → API 응답 shape 매핑.
// spec 을 벗어난 필드는 여기서 걸러지고, 이름 변환 (camelCase → snake_case) 도 여기서.

import type {
  User, Series, Episode, Post, Image, Tag, Comment as CommentRow,
  Notification as NotifRow, Payout as PayoutRow, Subscription as SubRow,
  Tip as TipRow, ContentTargetType as TargetTypeRow,
} from '@prisma/client';

// ---- User (public) ----
export interface UserPublic {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  is_author: boolean;
  created_at: string;
}

export function toUserPublic(u: Pick<User, 'id' | 'handle' | 'displayName' | 'bio' | 'createdAt'>): UserPublic {
  return {
    id: u.id,
    handle: u.handle,
    display_name: u.displayName,
    avatar_url: null,
    bio: u.bio,
    is_author: true,
    created_at: u.createdAt.toISOString(),
  };
}

// ---- Image ----
export interface ImageDTO {
  id: string;
  url: string | null;
  order: number;
  width: number | null;
  height: number | null;
  file_size: number | null;
}
export function toImageDTO(img: Pick<Image, 'id' | 'url' | 'order' | 'width' | 'height' | 'fileSize'>): ImageDTO {
  return {
    id: img.id,
    url: img.url,
    order: img.order,
    width: img.width,
    height: img.height,
    file_size: img.fileSize,
  };
}

// ---- Tags → genres/tags split ----
export function splitTags(tags: Pick<Tag, 'slug' | 'isGenre'>[]) {
  const genres: string[] = [];
  const free: string[] = [];
  for (const t of tags) {
    if (t.isGenre) genres.push(t.slug);
    else free.push(t.slug);
  }
  return { genres, tags: free };
}

// ---- Series ----
export interface SeriesDTO {
  id: string;
  author: UserPublic;
  title: string;
  description: string | null;
  cover_image: { url: string; width: number | null; height: number | null } | null;
  viewer_mode_default: 'scroll' | 'page';
  status: 'ongoing' | 'completed' | 'hiatus';
  genres: string[];
  tags: string[];
  episode_count: number;
  stats: {
    views_total: number;
    likes_total: number;
    subscribers_only_count: number;
  };
  is_adult: boolean;
  created_at: string;
  updated_at: string;
}

export interface SeriesRowWith {
  s: Series;
  author: Pick<User, 'id' | 'handle' | 'displayName' | 'bio' | 'createdAt'>;
  tags: Pick<Tag, 'slug' | 'isGenre'>[];
  episodeCount: number;
  subscribersOnlyCount: number;
  cover?: Pick<Image, 'url' | 'width' | 'height'> | null;
}

export function toSeriesDTO(r: SeriesRowWith): SeriesDTO {
  const t = splitTags(r.tags);
  return {
    id: r.s.id,
    author: toUserPublic(r.author),
    title: r.s.title,
    description: r.s.description,
    cover_image: r.cover?.url ? { url: r.cover.url, width: r.cover.width, height: r.cover.height } : null,
    viewer_mode_default: r.s.viewerModeDefault.toLowerCase() as 'scroll' | 'page',
    status: r.s.status.toLowerCase() as 'ongoing' | 'completed' | 'hiatus',
    genres: t.genres,
    tags: t.tags,
    episode_count: r.episodeCount,
    stats: {
      views_total: r.s.viewsTotal,
      likes_total: r.s.likesTotal,
      subscribers_only_count: r.subscribersOnlyCount,
    },
    is_adult: r.s.isAdult,
    created_at: r.s.createdAt.toISOString(),
    updated_at: r.s.updatedAt.toISOString(),
  };
}

// ---- Episode ----
export interface EpisodeDTO {
  id: string;
  series_id: string;
  title: string;
  order: number;
  viewer_mode: 'scroll' | 'page';
  is_subscriber_only: boolean;
  is_adult: boolean;
  images: ImageDTO[];
  stats: { views: number; likes: number; comments: number };
  prev_episode_id: string | null;
  next_episode_id: string | null;
  published_at: string | null;
  created_at: string;
}

export function toEpisodeDTO(
  e: Episode,
  images: Pick<Image, 'id' | 'url' | 'order' | 'width' | 'height' | 'fileSize'>[],
  navigation: { prev_id: string | null; next_id: string | null }
): EpisodeDTO {
  return {
    id: e.id,
    series_id: e.seriesId,
    title: e.title,
    order: e.order,
    viewer_mode: e.viewerMode.toLowerCase() as 'scroll' | 'page',
    is_subscriber_only: e.isSubscriberOnly,
    is_adult: e.isAdult,
    images: images.slice().sort((a, b) => a.order - b.order).map(toImageDTO),
    stats: {
      views: e.viewsCount,
      likes: e.likesCount,
      comments: e.commentsCount,
    },
    prev_episode_id: navigation.prev_id,
    next_episode_id: navigation.next_id,
    published_at: e.publishedAt?.toISOString() ?? null,
    created_at: e.createdAt.toISOString(),
  };
}

// 리스트용 (이미지 없는 요약)
export interface EpisodeSummaryDTO {
  id: string;
  title: string;
  order: number;
  is_subscriber_only: boolean;
  published_at: string | null;
  stats: { views: number; likes: number };
}
export function toEpisodeSummary(e: Pick<Episode, 'id' | 'title' | 'order' | 'isSubscriberOnly' | 'publishedAt' | 'viewsCount' | 'likesCount'>): EpisodeSummaryDTO {
  return {
    id: e.id,
    title: e.title,
    order: e.order,
    is_subscriber_only: e.isSubscriberOnly,
    published_at: e.publishedAt?.toISOString() ?? null,
    stats: { views: e.viewsCount, likes: e.likesCount },
  };
}

// ---- Post ----
export interface PostDTO {
  id: string;
  author: UserPublic;
  title: string;
  description: string | null;
  viewer_mode: 'scroll' | 'page';
  is_subscriber_only: boolean;
  is_adult: boolean;
  images: ImageDTO[];
  genres: string[];
  tags: string[];
  stats: { views: number; likes: number; comments: number };
  published_at: string | null;
  created_at: string;
}

export function toPostDTO(
  p: Post,
  author: Pick<User, 'id' | 'handle' | 'displayName' | 'bio' | 'createdAt'>,
  tags: Pick<Tag, 'slug' | 'isGenre'>[],
  images: Pick<Image, 'id' | 'url' | 'order' | 'width' | 'height' | 'fileSize'>[]
): PostDTO {
  const t = splitTags(tags);
  return {
    id: p.id,
    author: toUserPublic(author),
    title: p.title,
    description: p.description,
    viewer_mode: p.viewerMode.toLowerCase() as 'scroll' | 'page',
    is_subscriber_only: p.isSubscriberOnly,
    is_adult: p.isAdult,
    images: images.slice().sort((a, b) => a.order - b.order).map(toImageDTO),
    genres: t.genres,
    tags: t.tags,
    stats: {
      views: p.viewsCount,
      likes: p.likesCount,
      comments: p.commentsCount,
    },
    published_at: p.publishedAt?.toISOString() ?? null,
    created_at: p.createdAt.toISOString(),
  };
}

// ---- 재사용: content target type 매핑 (Prisma enum ↔ API string) ----
export function targetTypeToApi(t: TargetTypeRow): 'episode' | 'post' | 'comment' | 'salon' | 'user' {
  return t.toLowerCase() as 'episode' | 'post' | 'comment' | 'salon' | 'user';
}
