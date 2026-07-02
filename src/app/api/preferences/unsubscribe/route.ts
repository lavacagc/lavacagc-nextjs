import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import {
  findByToken,
  applyUpdate,
  STREAM_KEYS,
  type StreamKey,
} from '@/lib/preferences/preferences';

/**
 * One-click unsubscribe target for email footers + the List-Unsubscribe header.
 *
 *   GET  ?token=…&stream=home_care   → user clicked a footer link; mutates
 *        NOTHING (link prefetchers / security scanners fetch these URLs) and
 *        redirects to the preference center with a one-click confirm prompt
 *        for that stream (or all marketing streams if no stream given).
 *   POST ?token=…                    → RFC 8058 one-click (mail clients POST
 *        `List-Unsubscribe=One-Click`); turns off ALL marketing streams and
 *        returns 200 with no redirect.
 *
 * Public route (declared in middleware PUBLIC_ROUTES); auth is the token.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function streamsToTurnOff(streamParam: string | null): Partial<Record<StreamKey, boolean>> {
  if (streamParam && (STREAM_KEYS as string[]).includes(streamParam)) {
    return { [streamParam as StreamKey]: false };
  }
  // No/unknown stream → unsubscribe from everything marketing.
  return Object.fromEntries(STREAM_KEYS.map((k) => [k, false])) as Record<StreamKey, boolean>;
}

async function unsubscribe(request: NextRequest, token: string, streamParam: string | null) {
  const pref = await findByToken(token);
  if (!pref) return null;
  await applyUpdate({
    current: pref,
    changes: streamsToTurnOff(streamParam),
    actor: 'self',
    actorDetail: 'one-click',
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
      return NextResponse.redirect(
        new URL(
          `/preferences?token=${encodeURIComponent(token)}&confirm=${encodeURIComponent(confirm)}`,
          origin,
        ),
      );
    }

    const pref = await findByToken(token);
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

    // RFC 8058: turn off all marketing regardless of body; ack 200.
    await unsubscribe(request, token, null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('preferences unsubscribe POST failed:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
