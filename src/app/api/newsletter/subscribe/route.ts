import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { getOrCreateByEmail, applyUpdate, normalizeEmail, STREAM_KEYS } from '@/lib/preferences/preferences';
import { addOrUpdateResendContact } from '@/lib/notify/resendAudience';

/**
 * Monthly-newsletter signup - the backend for the exit-intent capture (and any
 * future inline newsletter form).
 *
 * Affirmative single opt-in: the caller shows a clear consent statement next to
 * the button ("you agree to receive our monthly newsletter; unsubscribe
 * anytime"), and this route records that consent by flipping the dedicated
 * `newsletter` marketing stream ON via applyUpdate - which writes an auditable
 * preference_events row (actor=self, source, ip) that IS the consent proof.
 *
 * Because `newsletter` is a marketing stream (STREAM_KEYS), the subscriber is
 * covered for free by the whole unsubscribe workflow: the /unsub cascade,
 * one-click List-Unsubscribe (stream=newsletter), the preference center, and
 * the Resend two-way sync - so there is no leak path. Delivery is gated at send
 * time by sendTrackedEmail(preferenceStream:'newsletter').
 *
 * Always answers 200 { ok: true } for any syntactically valid email so it can't
 * be used to probe whether an address is already subscribed. Flipping the flag
 * on is idempotent, so re-submitting is harmless. Rate-limited per IP.
 *
 * Public route (declared in middleware PUBLIC_ROUTES under /api/newsletter/).
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Where the signup happened, for the consent audit trail. Kept to a short
// allow-list so a caller can't stuff arbitrary text into the audit log.
const ALLOWED_SOURCES = new Set(['exit_intent', 'inline', 'footer']);

export async function POST(request: NextRequest) {
  let email = '';
  let source = 'inline';
  try {
    const body = (await request.json().catch(() => ({}))) as { email?: unknown; source?: unknown };
    email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
    if (typeof body.source === 'string' && ALLOWED_SOURCES.has(body.source)) source = body.source;
  } catch {
    email = '';
  }

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: 'Please enter a valid email address.' }, { status: 400 });
  }

  const ip = getClientIp(request);

  // Per-IP throttle to blunt row-creation abuse. Fails open on DB hiccup.
  const rl = await checkRateLimit(`newsletter-subscribe:${ip}`, 10, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: 'Too many requests. Please try again later.' }, { status: 429 });
  }

  try {
    // Seed every marketing stream off when creating a net-new contact so a
    // newsletter-only signup records only the consent they actually gave; an
    // existing contact is returned untouched. applyUpdate then flips newsletter
    // on and writes the affirmative-consent audit event.
    const streamsOff = Object.fromEntries(STREAM_KEYS.map((k) => [k, false] as const));
    const current = await getOrCreateByEmail(email, streamsOff);
    await applyUpdate({
      current,
      changes: { newsletter: true },
      actor: 'self',
      actorDetail: `newsletter-signup:${source}`,
      ip,
    });

    // Mirror the opt-in into the Resend audience (best-effort, never blocks the
    // response). Suppress-only semantics inside the helper mean this only ever
    // adds a fresh contact / leaves an existing one alone - it never clears a
    // prior unsubscribe.
    await addOrUpdateResendContact(email).catch((e) =>
      console.error('newsletter Resend contact upsert failed (non-fatal):', e instanceof Error ? e.message : e),
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('newsletter subscribe failed:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: 'Something went wrong - please try again.' },
      { status: 500 },
    );
  }
}
