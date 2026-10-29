/**
 * Who may call the experiments agent routes: the ingest bearer token
 * (`PROJECT_INGEST_TOKEN`, the same one the project and article routes use)
 * or a signed-in admin session. A copy of authorizeIngest with two changes:
 *  - its own rate-limit bucket, `experiments:<ip>`, 30 a minute;
 *  - every refusal that is not a rate limit is a 404, not a 401: without a
 *    valid credential the routes do not exist (EX6), and a token unset or
 *    shorter than 32 characters keeps them dark for everyone.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { checkIngestToken } from '@/lib/projects/ingestAuth';
import { adminUserId } from '@/lib/projects/session';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const EXPERIMENTS_RATE_LIMIT = 30;
export const EXPERIMENTS_RATE_WINDOW_MS = 60_000;

export type ExperimentsCaller = { ok: true; by: string } | { ok: false; response: NextResponse };

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 });

export async function authorizeExperiments(request: NextRequest): Promise<ExperimentsCaller> {
  const verdict = checkIngestToken(request.headers.get('authorization'));
  if (verdict === 'disabled') return { ok: false, response: notFound() };

  const rl = await checkRateLimit(`experiments:${getClientIp(request)}`, EXPERIMENTS_RATE_LIMIT, EXPERIMENTS_RATE_WINDOW_MS);
  if (!rl.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Too many requests. Try again in a minute.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
      ),
    };
  }

  if (verdict === 'valid') return { ok: true, by: 'agent' };
  if (verdict === 'invalid') return { ok: false, response: notFound() };
  const userId = await adminUserId(request);
  if (userId) return { ok: true, by: `admin:${userId}` };
  return { ok: false, response: notFound() };
}

/** The site origin for links in messages: the configured site URL, else the request's own. */
export function siteOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured && /^https?:\/\//.test(configured)) return configured.replace(/\/$/, '');
  return request.nextUrl.origin;
}

/**
 * The clock. `?now=<iso>` moves it so a spec can run the weekly cron with a
 * fake clock (EX5), but only off Vercel production, and on a production build
 * only when EXPERIMENTS_FAKE_CLOCK=1 is set for that server. The routes that
 * read it are already behind CRON_SECRET or the ingest token.
 */
function testHooksAllowed(): boolean {
  return process.env.VERCEL_ENV !== 'production' && (process.env.NODE_ENV !== 'production' || process.env.EXPERIMENTS_FAKE_CLOCK === '1');
}

export function clock(request: NextRequest): Date {
  const raw = request.nextUrl.searchParams.get('now');
  if (raw && testHooksAllowed()) {
    const t = Date.parse(raw);
    if (Number.isFinite(t)) return new Date(t);
  }
  return new Date();
}

/**
 * `?keys=a,b` limits a cron run to those experiments, under the same rule as
 * the fake clock, so a spec evaluates only its own rows on a shared database.
 * Undefined (every experiment) in production.
 */
export function onlyKeys(request: NextRequest): string[] | undefined {
  const raw = request.nextUrl.searchParams.get('keys');
  if (!raw || !testHooksAllowed()) return undefined;
  return raw.split(',').map((k) => k.trim()).filter(Boolean).slice(0, 50);
}

/**
 * A JSON body that may be absent: an empty body reads as `{}`. Too large is a
 * 413 and anything that is not JSON a 400, answered by the caller as is.
 */
export async function readOptionalJson(request: NextRequest, maxBytes: number): Promise<{ ok: true; value: unknown } | { ok: false; response: NextResponse }> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  const tooLarge = () => ({ ok: false as const, response: NextResponse.json({ error: 'Request body is too large.' }, { status: 413 }) });
  if (declared > maxBytes) return tooLarge();
  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) return tooLarge();
  if (!text.trim()) return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }) };
  }
}
