import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import {
  findByToken,
  applyUpdate,
  STREAM_KEYS,
  type SuppressionKey,
} from '@/lib/preferences/preferences';

/**
 * One-click unsubscribe target for email footers + the List-Unsubscribe header.
 *
 *   GET  ?token=…&stream=home_care   → user clicked a footer link; mutates
 *        NOTHING (link prefetchers / security scanners fetch these URLs) and
 *        redirects to the preference center with a one-click confirm prompt
 *        for that stream (or all marketing streams if no stream given).
 *        stream=follow_ups redirects to the /unsub page in follow-ups mode.
 *   POST ?token=…[&stream=follow_ups] → RFC 8058 one-click (mail clients POST
 *        `List-Unsubscribe=One-Click`). For a marketing link this turns off ALL
 *        marketing streams; for the transactional follow_ups link it turns off
 *        only follow_ups (a marketing unsubscribe must not silence sales
 *        follow-ups, and vice-versa). Returns 200 with no redirect.
 *
 * Public route (declared in middleware PUBLIC_ROUTES); auth is the token.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function streamsToTurnOff(streamParam: string | null): Partial<Record<SuppressionKey, boolean>> {
  // Transactional follow-ups opt-out — deliberately its own thing, never part of
  // the marketing cascade.
  if (streamParam === 'follow_ups') {
    return { follow_ups: false };
  }
  if (streamParam && (STREAM_KEYS as string[]).includes(streamParam)) {
    return { [streamParam as SuppressionKey]: false };
  }
  // No/unknown stream → unsubscribe from everything marketing (NOT follow_ups).
  return Object.fromEntries(STREAM_KEYS.map((k) => [k, false])) as Record<SuppressionKey, boolean>;
}

async function unsubscribe(request: NextRequest, token: string, streamParam: string | null) {
  const pref = await findByToken(token);
  if (!pref) return null;
  await applyUpdate({
    current: pref,
    changes: streamsToTurnOff(streamParam),
    actor: 'self',
    actorDetail: streamParam === 'follow_ups' ? 'one-click-followups' : 'one-click',
    ip: getClientIp(request),
  });
  return pref.preference_token;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  const stream = request.nextUrl.searchParams.get('stream');
  const origin = request.nextUrl.origin;
  const confirm = stream && (STREAM_KEYS as string[]).includes(stream) ? stream : 'all';
  try {
    // Over the limit: skip the DB lookup but still land the human on the
    // preference center — the page validates the token itself, so a scanner
    // burst from a shared gateway IP can't break a real click.
    const rl = await checkRateLimit(`prefs-unsub-get:${getClientIp(request)}`, 30, 60 * 1000);
    if (!rl.allowed) {
      const dest =
        stream === 'follow_ups'
          ? `/unsub?stream=follow_ups`
          : `/preferences?token=${encodeURIComponent(token)}&confirm=${encodeURIComponent(confirm)}`;
      return NextResponse.redirect(new URL(dest, origin));
    }

    const pref = await findByToken(token);
    // Follow-ups opt-out is handled by the /unsub page in follow-ups mode (kept
    // out of the marketing preference center). Prefill the email when we can.
    if (stream === 'follow_ups') {
      const q = pref ? `?stream=follow_ups&email=${encodeURIComponent(pref.email)}` : `?stream=follow_ups`;
      return NextResponse.redirect(new URL(`/unsub${q}`, origin));
    }
    // Read-only: land on the preference center (valid token) or its invalid
    // state, and let the human confirm the unsubscribe there.
    const url = pref
      ? `/preferences?token=${encodeURIComponent(pref.preference_token)}&confirm=${encodeURIComponent(confirm)}`
      : `/preferences?invalid=1`;
    return NextResponse.redirect(new URL(url, origin));
  } catch (err) {
    console.error('preferences unsubscribe GET failed:', err);
    return NextResponse.redirect(new URL('/preferences?invalid=1', origin));
  }
}

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  const stream = request.nextUrl.searchParams.get('stream');
  try {
    // Generous per-IP limit — one-click POSTs arrive from shared mail-provider
    // infrastructure, so keep the ceiling high; 429 lets the client retry.
    const rl = await checkRateLimit(`prefs-unsub-post:${getClientIp(request)}`, 60, 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
      );
    }

    // RFC 8058: follow_ups link → turn off follow_ups only; any marketing link →
    // turn off all marketing. Ack 200 regardless.
    await unsubscribe(request, token, stream === 'follow_ups' ? 'follow_ups' : null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('preferences unsubscribe POST failed:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
