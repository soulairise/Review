// 고정 장르 카테고리 (PRD §5.5). Phase 1.
// 새 장르 추가는 관리자 콘솔 · 데이터 마이그레이션으로만.

export const GENRES = [
  { slug: 'romance',  nameKo: '로맨스',     nameEn: 'Romance' },
  { slug: 'fantasy',  nameKo: '판타지',     nameEn: 'Fantasy' },
  { slug: 'thriller', nameKo: '스릴러',     nameEn: 'Thriller' },
  { slug: 'daily',    nameKo: '일상',       nameEn: 'Slice of Life' },
  { slug: 'bl_gl',    nameKo: 'BL/GL',      nameEn: 'BL / GL' },
  { slug: 'action',   nameKo: '액션',       nameEn: 'Action' },
  { slug: 'comedy',   nameKo: '개그',       nameEn: 'Comedy' },
  { slug: 'drama',    nameKo: '드라마',     nameEn: 'Drama' },
  { slug: 'youth',    nameKo: '청춘',       nameEn: 'Youth' },
  { slug: 'horror',   nameKo: '공포',       nameEn: 'Horror' },
] as const;

export type GenreSlug = typeof GENRES[number]['slug'];

export const GENRE_SLUGS = GENRES.map((g) => g.slug) as readonly GenreSlug[];

export const GENRE_SET = new Set<string>(GENRE_SLUGS);

export function isGenreSlug(s: string): s is GenreSlug {
  return GENRE_SET.has(s);
}
