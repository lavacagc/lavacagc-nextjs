/**
 * POST /api/admin/offers - "Send bid request" (BD1-BD4).
 *
 * One offer per trade on the request. Every offer is validated first (trade on
 * the request, sub pay within 70% of the customer price, photos belong to the
 * request); then each trade goes to every eligible sub at once, by email and
 * text in the sub's language. The answer lists exactly who got what over which
 * channel, and names the trades that went to nobody and why.
 *
 * Admin auth is enforced by middleware on /api/admin/*.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { TRADE_LABEL, type Trade } from '@/lib/home-services/catalog';
import { OfferInputError, getRequest, sendBidRequest } from '@/lib/home-services/offers';
import { actingAdmin, readJson, serverError } from '@/lib/home-services/adminRoute';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const TRADES = Object.keys(TRADE_LABEL) as [Trade, ...Trade[]];
const date = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(''), z.null()]).transform((v) => (v ? v : null));

const schema = z.object({
  request_id: z.string().uuid(),
  offers: z.array(z.object({
    trade: z.enum(TRADES),
    sub_pay_cents: z.number().int().positive().max(100_000_000),
    customer_price_cents: z.number().int().positive().max(100_000_000),
    scope_summary: z.string().trim().max(2000),
    town: z.string().trim().min(1, 'Town is required').max(80),
    photo_ids: z.array(z.string().uuid()).max(20).default([]),
    target_start: date.default(null),
    target_end: date.default(null),
  })).min(1).max(7),
});

export async function POST(request: NextRequest) {
  const read = await readJson(request, 32 * 1024);
  if (read.ok === false) return read.response;
  const parsed = schema.safeParse(read.body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  const by = await actingAdmin();
  try {
    const req = await getRequest(parsed.data.request_id);
    if (!req) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    const results = await sendBidRequest(req, parsed.data.offers, by);
    const sentAny = results.some((r) => r.status === 'sent');
    return NextResponse.json({ results, sent: sentAny }, { status: sentAny ? 200 : 409 });
  } catch (err) {
    if (err instanceof OfferInputError) return NextResponse.json({ error: err.message }, { status: 400 });
    return serverError('Could not send the bid request', err);
  }
}
