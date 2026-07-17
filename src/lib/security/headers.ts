// 보안 명세 §2 — 모든 응답에 세팅.
// next.config.ts 의 headers() 에서 사용.

const CSP = [
  "default-src 'self'",
  "img-src 'self' https://cdn.jitda.com data: blob:",
  "script-src 'self' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",              // Tailwind/Next 인라인 style 허용 시. 가능하면 nonce 로 이관.
  "font-src 'self' data:",
  "connect-src 'self' https://api.stripe.com",
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

export function buildSecurityHeaders() {
  const isProd = process.env.NODE_ENV === 'production';
  return [
    // HTTPS 강제 (프로덕션에서만 — dev 서버는 http)
    ...(isProd
      ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
      : []),
    { key: 'Content-Security-Policy', value: CSP },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self)' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
    { key: 'X-Frame-Options', value: 'DENY' },
  ];
}
