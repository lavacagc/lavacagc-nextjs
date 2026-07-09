import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import {
  findByToken,
  applyUpdate,
  STREAM_KEYS,
  type StreamKey,
} from '@/lib/preferences/preferences';

/**
 * Self-service email preference center API. Authentication is the
 * preference_token (a capability) — the same trust model as unsubscribe links.
 * Public route (declared in middleware PUBLIC_ROUTES).
 *
 *   GET  /api/preferences?token=…   → current stream state for the page
 *   POST /api/preferences           → { token, changes: { home_care?: bool, … } }
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Project the row down to the marketing streams the preference center manages.
// Derived from STREAM_KEYS so a newly added stream (e.g. newsletter) shows up in
// the UI automatically - never hand-list the streams here.
function stateOf(pref: Record<StreamKey, boolean>): Record<StreamKey, boolean> {
  return Object.fromEntries(STREAM_KEYS.map((k) => [k, pref[k]])) as Record<StreamKey, boolean>;
}

export async function GET(request: NextRequest) {
  const rl = await checkRateLimit(`prefs-read:${getClientIp(request)}`, 30, 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
    );
  }

  const token = request.nextUrl.searchParams.get('token') ?? '';
  try {
    const pref = await findByToken(token);
    if (!pref) return NextResponse.json({ error: 'invalid_token' }, { status: 404 });
    return NextResponse.json({ email: pref.email, streams: stateOf(pref) });
  } catch (err) {
    console.error('preferences GET failed:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const rl = await checkRateLimit(`prefs-write:${getClientIp(request)}`, 15, 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { token, changes } = (body ?? {}) as {
    token?: string;
    changes?: Record<string, unknown>;
  };
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'missing_token' }, { status: 400 });
  }

  // Whitelist + coerce the incoming changes to known stream booleans.
  const clean: Partial<Record<StreamKey, boolean>> = {};
  if (changes && typeof changes === 'object') {
    for (const key of STREAM_KEYS) {
      const v = (changes as Record<string, unknown>)[key];
      if (typeof v === 'boolean') clean[key] = v;
    }
  }

  try {
    const pref = await findByToken(token);
    if (!pref) return NextResponse.json({ error: 'invalid_token' }, { status: 404 });

    const updated = await applyUpdate({
      current: pref,
      changes: clean,
      actor: 'self',
      ip: getClientIp(request),
    });
    return NextResponse.json({ email: updated.email, streams: stateOf(updated) });
  } catch (err) {
    console.error('preferences POST failed:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
