import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from '@/lib/rateLimit';
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
  try {
    const pref = await findByToken(token);
    // Read-only: land on the preference center (valid token) or its invalid
    // state, and let the human confirm the unsubscribe there.
    const confirm = stream && (STREAM_KEYS as string[]).includes(stream) ? stream : 'all';
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
    // RFC 8058: turn off all marketing regardless of body; ack 200.
    await unsubscribe(request, token, null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('preferences unsubscribe POST failed:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
