import { NextResponse, type NextRequest } from 'next/server';

// 미들웨어: HTTPS 강제 리다이렉트 + 요청 ID 부여.
// 헤더 값은 next.config.ts 의 headers() 에서 세팅 (프리렌더된 페이지에도 적용).

const ALLOW_HTTP_HOSTS = new Set(['localhost:3000', '127.0.0.1:3000']);

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const host = req.headers.get('host') ?? '';
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');

  // 프로덕션에서 http 접근 → https 로 301
  if (
    process.env.NODE_ENV === 'production' &&
    proto === 'http' &&
    !ALLOW_HTTP_HOSTS.has(host)
  ) {
    const https = new URL(url.toString());
    https.protocol = 'https:';
    return NextResponse.redirect(https, 301);
  }

  // 요청 ID (감사 로그·에러 추적용)
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  const res = NextResponse.next();
  res.headers.set('x-request-id', requestId);
  return res;
}

// _next 정적 파일은 스킵
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
