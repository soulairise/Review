# 짓다 (JITDA)

웹툰 오픈 플랫폼. 이 저장소는 Next.js 15 (App Router) 기반의 **풀스택 백엔드 + 프론트** 프로젝트입니다.

- **PRD v0.1**, **API 명세 v0.1**, **보안 명세 v0.1** 을 이 코드의 단일 진실 원본으로 삼습니다.
- Phase 1 진행: 인증 + 콘텐츠 CRUD 완료. 소셜 · 결제 · 업로드 순차 개발.

## 🎨 바로 보기 (GitHub Pages)

브라우저에서 즉시 볼 수 있는 라이브 데모:

- **포탈**: <https://YOUR-GH-USERNAME.github.io/jitda/> — 모든 목업·문서의 진입점
- **화면 목업** 5개 (인터랙티브, Mock adapter 내장):
  - [메인](./docs/mockups/main.html) · [작가](./docs/mockups/author.html) · [뷰어](./docs/mockups/viewer.html) · [스튜디오](./docs/mockups/studio.html) · [로그인](./docs/mockups/auth.html)
- **문서** 3개: [PRD](./docs/specs/prd.html) · [API 명세](./docs/specs/api.html) · [보안 명세](./docs/specs/security.html)

> Pages 활성화: Settings → Pages → Source: Deploy from a branch → **main / /docs** → Save.

## 스택

| 영역 | 선택 |
|---|---|
| Runtime | Node.js 20+ |
| Framework | Next.js 15 (App Router · TypeScript) |
| DB | PostgreSQL 15+ (Prisma ORM) |
| 비밀번호 해싱 | `@node-rs/argon2` (Argon2id) |
| JWT | `jose` (HS256) |
| 검증 | `zod` |
| 결제 | `stripe` |
| 이메일 | `resend` (계획) |
| 스토리지 | Cloudflare R2 / AWS S3 (presigned URL) |

## 처음 실행

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 파일 준비
cp .env.example .env.local
# .env.local 편집:
#   - DATABASE_URL           로컬 Postgres URL
#   - JWT_ACCESS_SECRET      openssl rand -base64 48
#   - JWT_REFRESH_SECRET     openssl rand -base64 48 (다른 값)
#   - STRIPE_*               테스트 키

# 3. DB 마이그레이션 (Prisma) + 장르 시드
npm run db:migrate
npm run db:seed

# 4. 개발 서버
npm run dev

# 5. 확인
open http://localhost:3000
open http://localhost:3000/api/v1/health
```

## 주요 명령

```bash
npm run dev              # 개발 서버 (Turbopack)
npm run build            # 프로덕션 빌드 (prisma generate 포함)
npm run typecheck        # tsc --noEmit
npm run lint             # eslint

npm run db:migrate       # 마이그레이션 (dev)
npm run db:migrate:deploy # 마이그레이션 (prod, 컨테이너)
npm run db:studio        # Prisma Studio (DB GUI)
npm run db:generate      # Prisma Client 재생성
npm run db:seed          # 고정 장르 태그 upsert
```

## 디렉토리 구조

```
jitda/
├─ prisma/
│  └─ schema.prisma        # 16 엔티티 + 감사 로그 + 웹훅 idempotency
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx
│  │  ├─ page.tsx
│  │  ├─ globals.css
│  │  └─ api/
│  │     └─ v1/
│  │        ├─ health/route.ts
│  │        ├─ auth/
│  │        │  ├─ signup/route.ts        ✅ POST
│  │        │  ├─ login/route.ts         ✅ POST (잠금)
│  │        │  ├─ refresh/route.ts       ✅ POST (rotation)
│  │        │  ├─ logout/route.ts        ✅ POST
│  │        │  └─ me/route.ts            ✅ GET · DELETE
│  │        ├─ series/
│  │        │  ├─ route.ts               ✅ GET (list) · POST (create)
│  │        │  └─ [id]/
│  │        │     ├─ route.ts            ✅ GET · PATCH · DELETE
│  │        │     └─ episodes/route.ts   ✅ GET (list) · POST (create)
│  │        ├─ episodes/
│  │        │  └─ [id]/
│  │        │     ├─ route.ts            ✅ GET · PATCH · DELETE
│  │        │     └─ view/route.ts       ✅ POST (dedup)
│  │        ├─ posts/
│  │        │  ├─ route.ts               ✅ GET (list) · POST (create)
│  │        │  └─ [id]/
│  │        │     ├─ route.ts            ✅ GET · PATCH · DELETE
│  │        │     └─ view/route.ts       ✅ POST (dedup)
│  │        └─ webhooks/
│  │           └─ stripe/route.ts        ✅ 서명 검증 + idempotency
│  └─ lib/
│     ├─ db.ts                       # Prisma singleton
│     ├─ id.ts                       # 접두어 있는 base62 ID
│     ├─ cursor.ts                   # 커서 페이지네이션
│     ├─ genres.ts                   # 고정 장르 카테고리
│     ├─ tags.ts                     # 장르·태그 resolve/upsert
│     ├─ mappers.ts                  # DB → API DTO 직렬화
│     ├─ access.ts                   # 소유권 · 구독 접근 검증
│     ├─ api-error.ts                # APIError · jsonOk/jsonError · withErrors
│     ├─ schemas/
│     │  ├─ common.ts                # Zod 공통 (email · handle · pagination)
│     │  ├─ auth.ts                  # signup · login · refresh · reset
│     │  ├─ series.ts                # Create/Update/ListQuery
│     │  ├─ episode.ts               # Create/Update/ListQuery
│     │  └─ post.ts                  # Create/Update/ListQuery
│     ├─ auth/
│     │  ├─ password.ts              # Argon2id · timing attack 방어
│     │  ├─ tokens.ts                # JWT + refresh token (256bit 랜덤)
│     │  ├─ session.ts               # 쿠키 이름 · requireUser
│     │  └─ ratelimit.ts             # 로그인 실패 카운트/잠금
│     └─ security/
│        └─ headers.ts               # HSTS · CSP · nosniff · frame-ancestors
├─ middleware.ts                     # HTTPS 강제 리다이렉트 + 요청 ID
├─ next.config.ts                    # 보안 헤더 세팅
├─ tsconfig.json
├─ package.json
└─ .env.example
```

## 보안 원칙 (요약)

**전체는 [보안 명세 v0.1](https://claude.ai/code/artifact/35acff47-277d-46d3-938a-f9c5480e405a) 참조.**

- **HTTPS 전면**. `middleware.ts` 가 프로덕션에서 http 접근을 301 리다이렉트. HSTS + preload.
- **비밀번호는 Argon2id**. 파라미터 `memoryCost=19MiB, timeCost=2` (§3.2).
- **토큰**: Access = JWT (1h), Refresh = 256bit 랜덤 (30d) · SHA-256 해시로만 저장.
- **Refresh 토큰**은 `__Host-` 접두 쿠키 (`HttpOnly · Secure · SameSite=Strict · Path=/`).
- **입력 검증**은 Zod 스키마 → 서버가 최종 방어선.
- **XSS**: React 자동 이스케이프 · CSP · `dangerouslySetInnerHTML` 미사용.
- **Injection**: Prisma 파라미터 바인딩 강제. `$queryRawUnsafe` 금지.
- **CSRF**: SameSite=Strict + Bearer 헤더 조합으로 자동 차단.
- **로그인 잠금**: 같은 (이메일 + IP) 15분 내 5회 실패 → 15분 잠금.
- **Timing attack 방어**: 존재하지 않는 계정도 dummy verify 로 CPU 시간 균일화.
- **감사 로그**: `AuditLog` 모델 append-only. 프로덕션에서 UPDATE/DELETE 권한 미부여.

## 구현된 엔드포인트 (Phase 1 진행 상황)

### Auth · Session
- `POST   /api/v1/auth/signup`
- `POST   /api/v1/auth/login`
- `POST   /api/v1/auth/refresh`
- `POST   /api/v1/auth/logout`
- `GET    /api/v1/auth/me`
- `DELETE /api/v1/auth/me`

### Content — Series
- `GET    /api/v1/series` · 필터: author_id, genre, status, sort (popular · latest · updated) · 커서 페이지네이션
- `POST   /api/v1/series`
- `GET    /api/v1/series/{id}` · viewer.is_subscribed_to_author 포함
- `PATCH  /api/v1/series/{id}` · 소유권 검증 · 태그 교체
- `DELETE /api/v1/series/{id}` · 소프트 삭제 · 하위 회차 함께 삭제

### Content — Episode
- `GET    /api/v1/series/{id}/episodes` · 발행된 회차만
- `POST   /api/v1/series/{id}/episodes` · 자동 회차 번호 · 이미지 소유권 검증
- `GET    /api/v1/episodes/{id}` · **구독자 전용 403** + `required_subscription`
- `PATCH  /api/v1/episodes/{id}`
- `DELETE /api/v1/episodes/{id}` · Series 집계 감소
- `POST   /api/v1/episodes/{id}/view` · 1시간 dedup (session or IP)

### Content — Post
- `GET    /api/v1/posts` · 필터: author_id, genre, sort
- `POST   /api/v1/posts`
- `GET    /api/v1/posts/{id}` · 구독자 전용 지원
- `PATCH  /api/v1/posts/{id}`
- `DELETE /api/v1/posts/{id}`
- `POST   /api/v1/posts/{id}/view`

### System
- `GET    /api/v1/health`
- `POST   /api/v1/webhooks/stripe` (서명 검증 + idempotency)

## 다음 단계

1. **Auth OAuth** — Google · Apple (PKCE + JWKS 검증)
2. **이메일 인증 · 비밀번호 재설정** — Resend 연동
3. **업로드** — R2/S3 presigned URL + 서버측 재인코딩
4. **소셜 액션** — Follow · Subscription · Tip · Comment · Reaction
5. **결제** — Stripe Subscription + Tip (PaymentIntent), Webhook 이벤트 처리 완결
6. **알림** — Notification 발생 hook (새 회차 · 댓글 · 팁)
7. **랭킹 배치** — 1시간 주기 집계 잡
8. **관리자 콘솔 API** — 신고 처리 · 정산 실행 · 전역 설정
9. **View dedup 을 Redis (Upstash) 로 이관** — 현재 in-memory (단일 인스턴스 한정)

## 관련 아티팩트

| 문서 · 목업 | URL |
|---|---|
| PRD v0.1 | https://claude.ai/code/artifact/1bcf4c8e-d919-49b8-b7a4-b26634ac2b51 |
| API 명세 v0.1 | https://claude.ai/code/artifact/1ba63469-1bab-4725-90ab-8f82721f725d |
| 보안 명세 v0.1 | https://claude.ai/code/artifact/35acff47-277d-46d3-938a-f9c5480e405a |
| 메인 페이지 목업 | https://claude.ai/code/artifact/b89bb2e6-8589-48b0-b697-915d7e2519c7 |
| 작가 페이지 | https://claude.ai/code/artifact/b90ee058-01b6-490b-9df9-1b549cb8e92f |
| 회차 뷰어 | https://claude.ai/code/artifact/0951fea6-d24f-4189-b6d1-659b3627fdc1 |
| 작가 스튜디오 | https://claude.ai/code/artifact/3b125068-2f9c-48ac-b000-f14f486dbd75 |
| 로그인 · 회원가입 | https://claude.ai/code/artifact/81985598-8a94-4a1a-bfd6-34b7caacc932 |
