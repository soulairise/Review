import { z } from 'zod';
import { zPrefixedId, zViewerMode, zImageIds, zTags, zLongText } from './common';

export const CreatePostSchema = z.object({
  title: z.string().trim().min(1, '제목을 입력해주세요.').max(100),
  description: zLongText(1000).optional(),
  viewer_mode: zViewerMode.default('scroll'),
  is_subscriber_only: z.boolean().default(false),
  is_adult: z.boolean().default(false),
  image_ids: zImageIds.min(1, '이미지를 최소 1장 이상 첨부하세요.'),
  genres: z.array(z.string().min(1).max(20)).max(3).default([]),
  tags: zTags.default([]),
  published_at: z.string().datetime().optional(),
});
export type CreatePostBody = z.infer<typeof CreatePostSchema>;

export const UpdatePostSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  description: zLongText(1000).optional(),
  viewer_mode: zViewerMode.optional(),
  is_subscriber_only: z.boolean().optional(),
  is_adult: z.boolean().optional(),
  image_ids: zImageIds.min(1).optional(),
  genres: z.array(z.string().min(1).max(20)).max(3).optional(),
  tags: zTags.optional(),
  published_at: z.string().datetime().nullable().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: '수정할 필드를 하나 이상 지정하세요.' });
export type UpdatePostBody = z.infer<typeof UpdatePostSchema>;

export const PostListQuerySchema = z.object({
  author_id: zPrefixedId('usr').optional(),
  genre: z.string().min(1).max(20).optional(),
  sort: z.enum(['latest', 'popular']).default('latest'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});
export type PostListQuery = z.infer<typeof PostListQuerySchema>;

export const PostViewSchema = z.object({
  session_id: z.string().min(1).max(64).optional(),
}).optional();
