import { z } from 'zod';
import { zPrefixedId, zViewerMode, zTags, zLongText } from './common';

export const CreateSeriesSchema = z.object({
  title: z.string().trim().min(1, '제목을 입력해주세요.').max(100, '100자를 넘을 수 없습니다.'),
  description: zLongText(2000).optional(),
  cover_image_id: zPrefixedId('img').optional(),
  viewer_mode_default: zViewerMode.default('scroll'),
  genres: z.array(z.string().min(1).max(20)).min(1, '장르를 하나 이상 선택하세요.').max(3, '장르는 최대 3개까지 가능합니다.'),
  tags: zTags.default([]),
  is_adult: z.boolean().default(false),
});
export type CreateSeriesBody = z.infer<typeof CreateSeriesSchema>;

export const UpdateSeriesSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  description: zLongText(2000).optional(),
  cover_image_id: zPrefixedId('img').optional(),
  viewer_mode_default: zViewerMode.optional(),
  status: z.enum(['ongoing', 'completed', 'hiatus']).optional(),
  genres: z.array(z.string().min(1).max(20)).max(3).optional(),
  tags: zTags.optional(),
  is_adult: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: '수정할 필드를 하나 이상 지정하세요.' });
export type UpdateSeriesBody = z.infer<typeof UpdateSeriesSchema>;

export const SeriesListQuerySchema = z.object({
  author_id: zPrefixedId('usr').optional(),
  genre: z.string().min(1).max(20).optional(),
  status: z.enum(['ongoing', 'completed', 'hiatus']).optional(),
  sort: z.enum(['popular', 'latest', 'updated']).default('popular'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});
export type SeriesListQuery = z.infer<typeof SeriesListQuerySchema>;
