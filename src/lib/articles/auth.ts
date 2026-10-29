/**
 * Who may call /api/articles/*: the same door as the project ingest
 * (src/lib/projects/ingest.ts authorizeIngest), with its own rate-limit bucket.
 *
 * `Authorization: Bearer <PROJECT_INGEST_TOKEN>` compared in constant time
 * (src/lib/projects/ingestAuth.ts, shared as is), OR a signed-in admin
 * session. With the token unset or under 32 characters every article route
 * answers 404 to everyone, signed-in admins included (ART1).
 * Every call is rate limited by IP, 30 a minute, before the token is checked,
 * so the token cannot be guessed at speed (ART7).
 *
 * Server-only.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { checkIngestToken } from '@/lib/projects/ingestAuth';
import { adminUserId } from '@/lib/projects/session';

export const ARTICLES_RATE_LIMIT = 30;
export const ARTICLES_RATE_WINDOW_MS = 60_000;
/** The rate_limits bucket prefix; specs clear only their own family. */
export const ARTICLES_RATE_BUCKET = 'articles';

export type ArticlesCaller =
  | { ok: true; via: 'token' | 'session'; userId: string | null }
  | { ok: false; response: NextResponse };

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 });
const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

export async function authorizeArticles(request: NextRequest): Promise<ArticlesCaller> {
  const verdict = checkIngestToken(request.headers.get('authorization'));
  if (verdict === 'disabled') return { ok: false, response: notFound() };

  const rl = await checkRateLimit(
    `${ARTICLES_RATE_BUCKET}:${getClientIp(request)}`,
    ARTICLES_RATE_LIMIT,
    ARTICLES_RATE_WINDOW_MS,
  );
  if (!rl.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Too many requests. Try again in a minute.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
      ),
    };
  }

  if (verdict === 'valid') return { ok: true, via: 'token', userId: null };
  if (verdict === 'invalid') return { ok: false, response: unauthorized() };

  const userId = await adminUserId(request);
  if (userId) return { ok: true, via: 'session', userId };
  return { ok: false, response: unauthorized() };
}
