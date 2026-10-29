/**
 * POST /api/cta/event - public sink for hero CTA views and clicks.
 *
 * Body: { button, variant_key, event_type: 'view' | 'click' }. The visitor id
 * is NOT in the body: it is the server-minted, signed, httpOnly `cta_vid`
 * cookie (src/lib/cta/visitor.server.ts).
 *
 * Order: per-IP rate limit (`cta:<ip>`, 60 per minute), 1 KB body cap, strict
 * zod, then the visitor:
 *  - no `cta_vid` cookie: a fresh id is minted, set on the response, and the
 *    event is recorded under it;
 *  - a cookie whose signature does not verify: 204, nothing recorded, and a
 *    fresh cookie is set so a real visitor recovers on the next event;
 *  - a valid cookie: the event is recorded under its id.
 * Only (button, variant_key) pairs that are active are recorded, and a click
 * only when the same visitor already has a view of the same variant; anything
 * else is answered 204 and dropped. Repeats are free: the unique index
 * (button, variant_key, event_type, visitor_id) absorbs them (23505).
 * Errors are logged and answered generically.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { readCappedJson } from '@/lib/cta/http';
import { isActivePair } from '@/lib/cta/activePairs.server';
import { mintVisitorCookie, verifyVisitorCookie, VISITOR_COOKIE } from '@/lib/cta/visitor.server';
import { CTA_BUTTONS, CTA_VARIANT_KEYS } from '@/lib/cta/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BODY_BYTES = 1024;
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

const eventSchema = z.object({
  button: z.enum(CTA_BUTTONS),
  variant_key: z.enum(CTA_VARIANT_KEYS),
  event_type: z.enum(['view', 'click']),
}).strict();

function isSecure(request: NextRequest): boolean {
  return request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
}

export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(`cta:${getClientIp(request)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter ?? 60) } },
    );
  }

  const body = await readCappedJson(request, MAX_BODY_BYTES);
  if ('error' in body) return NextResponse.json({ error: body.error }, { status: body.status });

  const parsed = eventSchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
  const event = parsed.data;

  try {
    const cookie = request.cookies.get(VISITOR_COOKIE.name)?.value;
    let visitorId = verifyVisitorCookie(cookie);
    let minted: string | null = null;
    if (!visitorId) {
      const fresh = mintVisitorCookie();
      minted = fresh.value;
      // A present but invalid cookie is not trusted for this event.
      visitorId = cookie ? null : fresh.visitorId;
    }

    const respond = (recorded: boolean) => {
      const res = recorded ? NextResponse.json({ ok: true }) : new NextResponse(null, { status: 204 });
      if (minted) res.cookies.set(VISITOR_COOKIE.name, minted, VISITOR_COOKIE.options(isSecure(request)));
      return res;
    };

    if (!visitorId) return respond(false);
    if (!(await isActivePair(event.button, event.variant_key))) return respond(false);

    if (event.event_type === 'click') {
      const views = await supabaseRest<{ id: number }[]>(
        'GET',
        `cta_events?select=id&visitor_id=eq.${visitorId}&button=eq.${event.button}` +
          `&variant_key=eq.${event.variant_key}&event_type=eq.view&limit=1`,
      );
      if (!views?.length) return respond(false);
    }

    try {
      await supabaseRest('POST', 'cta_events', [{ ...event, visitor_id: visitorId }], { prefer: 'return=minimal' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/23505|duplicate key/i.test(message)) throw err;
    }
    return respond(true);
  } catch (err) {
    console.error('cta event failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Could not record event' }, { status: 500 });
  }
}
