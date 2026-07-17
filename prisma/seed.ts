// npm run db:seed
// 시드 데이터 — 최소한. 고정 장르 태그만 upsert.
// 프로덕션 배포 시에도 무해하게 반복 실행 가능.

import { PrismaClient } from '@prisma/client';
import { GENRES } from '../src/lib/genres';

const db = new PrismaClient();

async function main() {
  for (const g of GENRES) {
    await db.tag.upsert({
      where: { slug: g.slug },
      create: { slug: g.slug, isGenre: true, nameKo: g.nameKo, nameEn: g.nameEn },
      update: { isGenre: true, nameKo: g.nameKo, nameEn: g.nameEn },
    });
  }
  console.log(`✓ Seeded ${GENRES.length} genre tags.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
