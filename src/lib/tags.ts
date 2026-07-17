import { db } from './db';
import { GENRE_SET, GENRES, isGenreSlug } from './genres';
import { validationFailed } from './api-error';

// 태그 슬러그 정규화. 사용자 입력은 소문자·앞뒤 공백 제거·언어별 정규화.
export function normalizeTagSlug(raw: string): string {
  return raw.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * 요청의 genres/tags 배열을 Tag 레코드 ID 배열로 변환.
 * - 장르는 반드시 GENRE_SET 에 있어야 함 (없으면 422).
 * - 자유 태그는 upsert 로 새로 만들되, isGenre=false.
 *
 * 반환: [tagId, ...]
 */
export async function resolveTagIds(input: { genres: string[]; tags: string[] }): Promise<string[]> {
  // 장르 검증
  for (const g of input.genres) {
    if (!isGenreSlug(g)) {
      throw validationFailed({ fields: { genres: `알 수 없는 장르: ${g}` } });
    }
  }

  const genreTags = input.genres.length
    ? await db.tag.findMany({
        where: { slug: { in: input.genres }, isGenre: true },
        select: { id: true, slug: true },
      })
    : [];
  const missing = input.genres.filter((g) => !genreTags.some((t) => t.slug === g));
  if (missing.length) {
    // 시드가 안 됐을 수 있음 — 자동 upsert 로 보정
    for (const slug of missing) {
      const info = GENRES.find((g) => g.slug === slug);
      if (!info) continue;
      const t = await db.tag.upsert({
        where: { slug },
        create: { slug, isGenre: true, nameKo: info.nameKo, nameEn: info.nameEn },
        update: {},
        select: { id: true, slug: true },
      });
      genreTags.push(t);
    }
  }

  const freeSlugs = Array.from(new Set(input.tags.map(normalizeTagSlug))).filter(Boolean);
  const freeTags: { id: string }[] = [];
  for (const slug of freeSlugs) {
    if (GENRE_SET.has(slug)) continue; // 장르 슬러그를 자유 태그로 저장 금지
    const t = await db.tag.upsert({
      where: { slug },
      create: { slug, isGenre: false, nameKo: slug, nameEn: slug },
      update: {},
      select: { id: true },
    });
    freeTags.push(t);
  }

  return [...genreTags.map((t) => t.id), ...freeTags.map((t) => t.id)];
}
