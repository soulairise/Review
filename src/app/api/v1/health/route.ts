import { db } from '@/lib/db';
import { withErrors, jsonOk } from '@/lib/api-error';

export const runtime = 'nodejs';

export const GET = withErrors(async () => {
  const t0 = Date.now();
  // DB 연결 sanity check
  const ok = await db.$queryRaw`SELECT 1 as ok`.then(() => true).catch(() => false);
  return jsonOk({
    status: ok ? 'ok' : 'degraded',
    db: ok ? 'ok' : 'down',
    time: new Date().toISOString(),
    latency_ms: Date.now() - t0,
    version: process.env.npm_package_version ?? '0.1.0',
  });
});
