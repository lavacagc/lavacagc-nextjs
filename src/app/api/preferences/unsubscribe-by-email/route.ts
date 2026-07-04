import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import {
  getOrCreateByEmail,
  applyUpdate,
  STREAM_KEYS,
  normalizeEmail,
  type StreamKey,
} from '@/lib/preferences/preferences';

/**
 * Tokenless unsubscribe by email — the backend for the public /unsub page.
 *
 * A recipient who lands on /unsub without a token (a link that carried none,
 * a mistyped URL, a short link shared off-platform) must still be able to opt
 * out — CAN-SPAM requires the mechanism to work. This turns off every
 * marketing stream for the given email; applyUpdate cascades that to the
 * homeowners and newsletter_subscribers status via syncLegacyStatus, so one
 * call covers all lists.
 *
 * Always answers 200 { ok: true } for any syntactically valid email so the
 * endpoint can't be used to probe whether an address is subscribed. Turning a
 * stream off is idempotent, so re-submitting is harmless. Rate-limited per IP
 * to blunt row-creation abuse.
 *
 * Public route (under /api/preferences, declared in middleware PUBLIC_ROUTES).
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  let email = '';
  try {
    const body = (await request.json().catch(() => ({}))) as { email?: unknown };
    email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
  } catch {
    email = '';
  }

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const rl = await checkRateLimit(`unsub-by-email:${getClientIp(request)}`, 20, 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests — please try again in a minute.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
    );
  }

  try {
    const current = await getOrCreateByEmail(email);
    const changes = Object.fromEntries(STREAM_KEYS.map((k) => [k, false])) as Record<StreamKey, boolean>;
    await applyUpdate({
      current,
      changes,
      actor: 'self',
      actorDetail: 'unsub-page-by-email',
      ip: getClientIp(request),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('unsubscribe-by-email failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Something went wrong — please try again.' }, { status: 500 });
  }
}
