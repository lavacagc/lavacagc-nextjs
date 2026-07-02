import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from '@/lib/rateLimit';
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

function stateOf(pref: { home_care: boolean; buy_remodel: boolean; announcements: boolean }) {
  return {
    home_care: pref.home_care,
    buy_remodel: pref.buy_remodel,
    announcements: pref.announcements,
  };
}

export async function GET(request: NextRequest) {
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
