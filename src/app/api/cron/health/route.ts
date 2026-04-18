import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.lavacagc.com';

const ENDPOINTS_TO_CHECK = [
  { name: 'Homepage', path: '/' },
  { name: 'Services', path: '/services' },
  { name: 'Contact', path: '/contact' },
];

interface HealthCheckResult {
  name: string;
  url: string;
  status: 'up' | 'down';
  statusCode: number | null;
  responseTimeMs: number;
  error?: string;
}

/**
 * GET /api/cron/health
 * 
 * Uptime monitoring endpoint. Pings key pages and returns their status.
 * Configure as a Vercel Cron or call from an external monitoring service.
 *
 * Optional: Set CRON_SECRET env var and pass as Authorization header.
 */
export async function GET(request: NextRequest) {
  // CRON_SECRET is enforced by middleware — this is a defense-in-depth check
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Server misconfiguration: CRON_SECRET not set' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: HealthCheckResult[] = [];
  let allUp = true;

  for (const endpoint of ENDPOINTS_TO_CHECK) {
    const url = `${SITE_URL}${endpoint.path}`;
    const startTime = Date.now();

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': 'LaVacaGC-HealthCheck/1.0' },
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      const responseTimeMs = Date.now() - startTime;
      const isUp = response.status >= 200 && response.status < 400;

      if (!isUp) allUp = false;

      results.push({
        name: endpoint.name,
        url,
        status: isUp ? 'up' : 'down',
        statusCode: response.status,
        responseTimeMs,
        ...(!isUp ? { error: `HTTP ${response.status}` } : {}),
      });
    } catch (error) {
      const responseTimeMs = Date.now() - startTime;
      allUp = false;

      results.push({
        name: endpoint.name,
        url,
        status: 'down',
        statusCode: null,
        responseTimeMs,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  const failedEndpoints = results.filter(r => r.status === 'down');

  const response = {
    status: allUp ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks: results,
    summary: {
      total: results.length,
      up: results.filter(r => r.status === 'up').length,
      down: failedEndpoints.length,
    },
    ...(failedEndpoints.length > 0 ? {
      failed: failedEndpoints.map(f => ({
        name: f.name,
        url: f.url,
        error: f.error,
      })),
    } : {}),
  };

  return NextResponse.json(response, {
    status: allUp ? 200 : 503,
  });
}
