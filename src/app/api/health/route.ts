import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DB_TIMEOUT_MS = 3000;

/**
 * GET /api/health
 *
 * Public liveness and readiness for uptime monitors and the deploy pipeline:
 * which commit is serving, and whether Supabase answers a one-row read with
 * the public key within 3 seconds. 200 when healthy, 503 when the database
 * check fails. Returns no secrets and no data beyond those two facts.
 */
export async function GET() {
  const started = Date.now();
  const db = await pingDatabase();
  const healthy = db.ok;
  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      commit: servingCommit(),
      env: process.env.VERCEL_ENV ?? 'local',
      db,
      ms: Date.now() - started,
    },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}

function servingCommit(): string {
  const sha = process.env.NEXT_PUBLIC_APP_COMMIT_SHA?.trim() || process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  return sha ? sha.slice(0, 7) : 'local';
}

async function pingDatabase(): Promise<{ ok: boolean; ms: number; error?: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const started = Date.now();
  if (!url || !key) return { ok: false, ms: 0, error: 'not configured' };
  try {
    const res = await fetch(`${url}/rest/v1/service_areas?select=slug&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(DB_TIMEOUT_MS),
      cache: 'no-store',
    });
    return res.ok
      ? { ok: true, ms: Date.now() - started }
      : { ok: false, ms: Date.now() - started, error: `http ${res.status}` };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    return { ok: false, ms: Date.now() - started, error: timedOut ? 'timeout' : 'unreachable' };
  }
}
