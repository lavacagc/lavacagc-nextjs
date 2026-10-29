/**
 * POST /api/experiments/event - public sink for experiment views, clicks and
 * request starts on pages that render experiments server-side.
 *
 * Body (strict, 1 KB cap):
 *   { event: 'view' | 'click', experiment_key, variant_key }
 *   { event: 'request_started' }
 * The visitor is the signed, httpOnly `cta_vid` cookie (the Phase 1 counting
 * identity, src/lib/cta/visitor.server.ts), never a body field.
 *
 * Self-guarded (public in middleware): per-IP rate limit (`exp-event:<ip>`,
 * 60 a minute), the body cap, strict zod, then:
 *  - a view or click counts only for a LIVE experiment, an ACTIVE variant,
 *    and exactly the variant the visitor's seed (`cta_v`) hashes to, so a
 *    beacon cannot claim a variant the visitor was not served. A crawler user
 *    agent counts for nothing. A click also records its view (the two race the
 *    navigation the click starts).
 *  - request_started is attributed by the server to the live experiments the
 *    visitor has a view in (src/lib/experiments/events.server.ts).
 *  - no cookie: one is minted and set, and a view is recorded under it; a
 *    click or request start on an id minted by this very request never counts
 *    (that is the one shape a cookieless script can produce at will). An
 *    invalid cookie: 204, nothing recorded, a fresh cookie set.
 * The homepage buttons (hero-primary, hero-secondary) report through
 * /api/cta/event instead, because their pre-paint script keeps a stored key.
 * Repeats are free (the unique index). Errors are logged, answered generically.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { readCappedJson } from '@/lib/cta/http';
import { mintVisitorCookie, verifyVisitorCookie, VISITOR_COOKIE } from '@/lib/cta/visitor.server';
import { CTA_ASSIGN_COOKIE } from '@/lib/cta/types';
import { isCrawlerUserAgent } from '@/lib/botFilter';
import { assignVariant, seedFromCookie } from '@/lib/experiments/assign';
import { recordDownstream } from '@/lib/experiments/events.server';
import { recordEvents, renderableExperiments, type EventRow } from '@/lib/experiments/store.server';
import { EXPERIMENT_KEY_RE, HERO_EXPERIMENT, LIVE_STATUSES, VARIANT_KEYS } from '@/lib/experiments/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BODY_BYTES = 1024;
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

const bodySchema = z.discriminatedUnion('event', [
  z.object({
    event: z.enum(['view', 'click']),
    experiment_key: z.string().max(60).regex(EXPERIMENT_KEY_RE),
    variant_key: z.enum(VARIANT_KEYS),
  }).strict(),
  z.object({ event: z.literal('request_started') }).strict(),
]);

function isSecure(request: NextRequest): boolean {
  return request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
}

export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(`exp-event:${getClientIp(request)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter ?? 60) } });
  }

  const body = await readCappedJson(request, MAX_BODY_BYTES);
  if ('error' in body) return NextResponse.json({ error: body.error }, { status: body.status });
  const parsed = bodySchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
  const event = parsed.data;

  try {
    const cookie = request.cookies.get(VISITOR_COOKIE.name)?.value;
    let visitorId = verifyVisitorCookie(cookie);
    let minted: string | null = null;
    if (!visitorId) {
      const fresh = mintVisitorCookie();
      minted = fresh.value;
      visitorId = cookie ? null : fresh.visitorId;
    }
    const respond = (recorded: number) => {
      const res = recorded > 0 ? NextResponse.json({ ok: true, recorded }) : new NextResponse(null, { status: 204 });
      if (minted) res.cookies.set(VISITOR_COOKIE.name, minted, VISITOR_COOKIE.options(isSecure(request)));
      return res;
    };

    if (!visitorId || isCrawlerUserAgent(request.headers.get('user-agent'))) return respond(0);

    if (event.event === 'request_started') {
      if (minted) return respond(0);
      return respond(await recordDownstream(visitorId, 'request_started'));
    }

    if (event.event === 'click' && minted) return respond(0);
    if ((Object.values(HERO_EXPERIMENT) as string[]).includes(event.experiment_key)) return respond(0);

    const exp = (await renderableExperiments()).find((e) => e.key === event.experiment_key);
    if (!exp || !(LIVE_STATUSES as readonly string[]).includes(exp.status)) return respond(0);
    const seed = seedFromCookie(request.cookies.get(CTA_ASSIGN_COOKIE)?.value);
    const assigned = seed ? assignVariant(seed, exp.key, exp.variants) : null;
    if (!assigned || assigned.key !== event.variant_key) return respond(0);

    const rows: EventRow[] = [{ experiment_key: exp.key, variant_key: assigned.key, visitor_id: visitorId, event: 'view' }];
    if (event.event === 'click') rows.push({ ...rows[0], event: 'click' });
    await recordEvents(rows);
    return respond(rows.length);
  } catch (err) {
    console.error('experiment event failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Could not record event' }, { status: 500 });
  }
}
