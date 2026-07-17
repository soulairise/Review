import Link from 'next/link';

const brandStyle: React.CSSProperties = {
  fontSize: 40,
  fontWeight: 900,
  letterSpacing: '-0.03em',
  marginBottom: 4,
};

const dotStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 10,
  height: 10,
  background: 'var(--accent)',
  borderRadius: '50%',
  marginLeft: 4,
  transform: 'translateY(-4px)',
};

export default function HomePage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '80px 24px' }}>
      <h1 style={brandStyle}>
        짓다<span style={dotStyle} />
      </h1>
      <p style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, marginBottom: 24 }}>
        JITDA · Web platform
      </p>
      <p style={{ fontSize: 18, color: 'var(--ink-2)', marginBottom: 32, maxWidth: '48ch', lineHeight: 1.55 }}>
        웹툰 오픈 플랫폼. 지금은 백엔드 API 만 준비된 상태예요. 프론트 화면은 아래 목업 아티팩트를 참고하세요.
      </p>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 40 }}>
        <SectionTitle>API 상태</SectionTitle>
        <Card>
          <code style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}>
            GET <Link href="/api/v1/health" style={{ color: 'var(--accent)' }}>/api/v1/health</Link>
          </code>
        </Card>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SectionTitle>구현된 엔드포인트 (Phase 1 초기)</SectionTitle>
        <Card>
          <EndpointRow method="POST"   path="/api/v1/auth/signup" />
          <EndpointRow method="POST"   path="/api/v1/auth/login" />
          <EndpointRow method="POST"   path="/api/v1/auth/refresh" />
          <EndpointRow method="POST"   path="/api/v1/auth/logout" />
          <EndpointRow method="GET"    path="/api/v1/auth/me" />
          <EndpointRow method="DELETE" path="/api/v1/auth/me" />
          <EndpointRow method="POST"   path="/api/v1/webhooks/stripe" note="(Stripe → 서버)" />
        </Card>
      </section>

      <footer style={{ marginTop: 60, color: 'var(--muted)', fontSize: 12 }}>
        © 2026 짓다 · v0.1.0
      </footer>
    </main>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>
      {children}
    </h2>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: '14px 18px' }}>
      {children}
    </div>
  );
}

function EndpointRow({ method, path, note }: { method: string; path: string; note?: string }) {
  const color: Record<string, string> = {
    GET: '#2b7fa0', POST: '#2f8f5d', PATCH: '#c78e28', DELETE: '#c94848',
  };
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}>
      <span style={{
        display: 'inline-block', padding: '2px 8px', borderRadius: 4,
        background: color[method] ?? 'var(--muted)', color: 'white',
        fontSize: 10.5, fontWeight: 700, minWidth: 52, textAlign: 'center',
        letterSpacing: '0.06em',
      }}>{method}</span>
      <code>{path}</code>
      {note && <span style={{ color: 'var(--muted)', fontFamily: 'inherit' }}>{note}</span>}
    </div>
  );
}
