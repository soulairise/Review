import { z } from 'zod';
import { zViewerMode, zImageIds } from './common';

export const CreateEpisodeSchema = z.object({
  title: z.string().trim().min(1, '제목을 입력해주세요.').max(100),
  order: z.number().int().min(1).max(100000).optional(), // 미지정 시 자동 채번
  viewer_mode: zViewerMode.default('scroll'),
  is_subscriber_only: z.boolean().default(false),
  is_adult: z.boolean().default(false),
  image_ids: zImageIds.min(1, '이미지를 최소 1장 이상 첨부하세요.'),
  published_at: z.string().datetime().optional(), // 미지정 시 즉시 발행 (now)
});
export type CreateEpisodeBody = z.infer<typeof CreateEpisodeSchema>;

export const UpdateEpisodeSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  order: z.number().int().min(1).max(100000).optional(),
  viewer_mode: zViewerMode.optional(),
  is_subscriber_only: z.boolean().optional(),
  is_adult: z.boolean().optional(),
  image_ids: zImageIds.min(1).optional(),
  published_at: z.string().datetime().nullable().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: '수정할 필드를 하나 이상 지정하세요.' });
export type UpdateEpisodeBody = z.infer<typeof UpdateEpisodeSchema>;

export const EpisodeViewSchema = z.object({
  session_id: z.string().min(1).max(64).optional(),
}).optional();

export const EpisodeListQuerySchema = z.object({
  sort: z.enum(['order_asc', 'order_desc', 'latest']).default('order_desc'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});
export type EpisodeListQuery = z.infer<typeof EpisodeListQuerySchema>;
