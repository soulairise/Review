# 짓다 (JITDA) — 정적 쇼케이스

이 폴더는 **GitHub Pages 로 서빙되는 정적 사이트**입니다. 방문자가 백엔드 없이도 목업 · 스펙을 브라우저에서 그대로 볼 수 있어요.

## 구성

- **`index.html`** — 프로젝트 포탈. 모든 목업 · 문서 링크의 진입점.
- **`mockups/`** — 5개 화면 목업 (완전한 HTML · Mock fetch adapter 로 즉시 인터랙션)
  - `main.html`   — 메인 페이지 (인기 랭킹 · 최신작)
  - `author.html` — 작가 페이지 (팔로우 · 구독 · 팁 모달)
  - `viewer.html` — 회차 뷰어 (스크롤/페이지 · 잠금)
  - `studio.html` — 작가 스튜디오 (대시보드 · 업로드 · 정산)
  - `auth.html`   — 로그인 · 회원가입
- **`specs/`** — 3개 기획 · 명세 문서
  - `prd.html`      — Product Requirements v0.1
  - `api.html`      — API 명세 v0.1
  - `security.html` — 보안 명세 v0.1

## GitHub Pages 활성화

저장소 **Settings → Pages** 에서:
- Source: **Deploy from a branch**
- Branch: **main** / Folder: **/docs**
- Save → 몇 초 뒤 `https://<username>.github.io/<repo>/` 에서 접근 가능.

`.nojekyll` 파일이 포함되어 있어 Jekyll 처리 없이 정적 파일 그대로 서빙됩니다.
