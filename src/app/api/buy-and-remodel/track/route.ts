import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE_NAME, verifyAccess } from '@/lib/listings/accessCookie';
import { buildSubscriberActivityRow } from '@/lib/listings/subscriberActivity';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { updateSubscriber } from '@/lib/listings/subscribers';
import { getClientIp, checkRateLimit } from '@/lib/rateLimit';

/**
 * Subscriber behavior beacon.
 *
 * Records a page view for a KNOWN subscriber. The subscriber identity comes from
 * the signed httpOnly `br_access` cookie (the browser can't forge it and the
 * client never sees it), so this can't be used to write activity for someone
 * else. For anonymous visitors (no/invalid cookie) it writes nothing and returns
 * ok — the client beacon is gated by the readable `br_known` cookie, but this is
 * the authoritative check.
 *
 * Fully best-effort: rate-limited, body-capped, dedupes rapid duplicate hits, and
 * never throws back to the caller (a sendBeacon failure must not affect browsing).
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BODY_BYTES = 4 * 1024;

export async function POST(request: NextRequest) {
  try {
    // Identify the subscriber from the signed access cookie.
    const cookie = request.cookies.get(ACCESS_COOKIE_NAME)?.value;
    const verified = await verifyAccess(cookie);
    if (!verified) {
      // Anonymous — accept silently, record nothing.
      return NextResponse.json({ ok: true });
    }
    const subscriberId = verified.subscriberId;

    // Per-subscriber rate limit (covers the IP via the cookie identity).
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`br-track:${subscriberId}`, 120, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ ok: true }); // soft-drop, never error
    }

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: true });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ ok: true });
    }

    const userAgent = request.headers.get('user-agent');
    const row = buildSubscriberActivityRow(subscriberId, parsed as Record<string, unknown>, ip, userAgent);
    if (!row) {
      return NextResponse.json({ ok: true });
    }

    // Dedupe: skip if this subscriber logged the same path in the last 8s
    // (guards React strict-mode double effects / link prefetch).
    try {
      const since = new Date(Date.now() - 8_000).toISOString();
      const recent = await supabaseRest<{ id: string }[]>(
        'GET',
        `subscriber_activity?subscriber_id=eq.${encodeURIComponent(subscriberId)}` +
          `&path=eq.${encodeURIComponent(row.path)}&created_at=gt.${encodeURIComponent(since)}&select=id&limit=1`,
      );
      if (recent && recent.length > 0) {
        return NextResponse.json({ ok: true, deduped: true });
      }
    } catch {
      // dedupe is best-effort; fall through and insert
    }

    await supabaseRest('POST', 'subscriber_activity', row, { prefer: 'return=minimal' });

    // Recognize returning subscribers + link their anonymous device id once.
    const patch: Record<string, unknown> = { last_seen_at: new Date().toISOString() };
    if (row.visitor_id) patch.visitor_id = row.visitor_id;
    await updateSubscriber(subscriberId, patch).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('subscriber track error:', err);
    return NextResponse.json({ ok: true }); // never surface errors to the beacon
  }
}
