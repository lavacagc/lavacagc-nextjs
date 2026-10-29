/**
 * POST /api/offers/<token> - a sub answers a job offer (OF4, OF5, BD9).
 *
 * Public by design: the token (32 random bytes, one per sub per offer, sent
 * only to that sub) is the credential. The page at /offer/<token> is read-only
 * on GET because mail scanners and link previews fetch every URL in a message;
 * every action is a POST here.
 *
 * Body: JSON { action: 'accept' | 'confirm' | 'counter' | 'details' | 'decline', ... },
 * or multipart for `details` with up to 3 `files`.
 *
 * Guards in order (SEC1, SEC3): body cap, rate limit per IP and per token
 * (fail closed), schema, token lookup (unknown and malformed get the same
 * answer), then the offer state machine in offers.ts. Server errors are
 * logged, never echoed.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { z } from 'zod';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { isWellFormedToken, lookupOfferByToken, respondToOffer } from '@/lib/home-services/offers';
import { DECLINE_REASONS } from '@/lib/home-services/offerRules';
import { parseDollarsToCents } from '@/lib/home-services/pricing';
import { MAX_MULTIPART_BYTES, storeAttachments } from '@/lib/home-services/attachments';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const JSON_MAX_BYTES = 8 * 1024;
const IP_LIMIT = 60;
const TOKEN_LIMIT = 20;
const WINDOW_MS = 10 * 60 * 1000;

const price = z.union([z.number(), z.string()]).transform((v, ctx) => {
  const cents = typeof v === 'number' ? Math.round(v * 100) : parseDollarsToCents(v);
  if (!cents || cents <= 0 || cents > 100_000_000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'price_required' });
    return z.NEVER;
  }
  return cents;
});

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('accept') }),
  z.object({ action: z.literal('confirm') }),
  z.object({ action: z.literal('counter'), price, note: z.string().trim().max(1000).default('') }),
  z.object({ action: z.literal('details'), text: z.string().trim().min(1, 'details_required').max(4000) }),
  z.object({
    action: z.literal('decline'),
    reason: z.enum(DECLINE_REASONS).nullable().optional().transform((v) => v ?? null),
    note: z.string().trim().max(1000).default(''),
  }),
]);

const tokenBucket = (token: string) => createHash('sha256').update(token).digest('hex').slice(0, 32);

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const isMultipart = (request.headers.get('content-type') ?? '').startsWith('multipart/form-data');
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > (isMultipart ? MAX_MULTIPART_BYTES : JSON_MAX_BYTES)) {
    return NextResponse.json({ error: 'too_large' }, { status: 413 });
  }

  const ip = getClientIp(request);
  const [ipLimit, tokenLimit] = await Promise.all([
    checkRateLimit(`offer-ip:${ip}`, IP_LIMIT, WINDOW_MS, { failClosed: true }),
    checkRateLimit(`offer-token:${tokenBucket(token)}`, TOKEN_LIMIT, WINDOW_MS, { failClosed: true }),
  ]);
  if (!ipLimit.allowed || !tokenLimit.allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  let raw: Record<string, unknown>;
  let files: File[] = [];
  try {
    if (isMultipart) {
      const form = await request.formData();
      raw = { action: form.get('action'), text: form.get('text') ?? undefined };
      files = form.getAll('files').filter((f): f is File => typeof f !== 'string');
    } else {
      const text = await request.text();
      if (text.length > JSON_MAX_BYTES) return NextResponse.json({ error: 'too_large' }, { status: 413 });
      raw = JSON.parse(text);
    }
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid_body' }, { status: 400 });
  }
  if (files.length > 0 && parsed.data.action !== 'details') {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (!isWellFormedToken(token)) return NextResponse.json({ error: 'invalid_link' }, { status: 404 });
  const lookup = await lookupOfferByToken(token);
  if (lookup.status === 'unavailable') return NextResponse.json({ error: 'server_error' }, { status: 500 });
  if (lookup.status === 'not_found') return NextResponse.json({ error: 'invalid_link' }, { status: 404 });
  const { found } = lookup;

  try {
    const body = parsed.data;
    let result;
    if (body.action === 'details') {
      const stored = await storeAttachments(files, found.offer.id, found.recipient.id, 'sub');
      if (stored.ok === false) return NextResponse.json({ error: stored.error }, { status: 400 });
      result = await respondToOffer(found, { action: 'details', text: body.text, attachments: stored.attachments });
    } else if (body.action === 'counter') {
      result = await respondToOffer(found, { action: 'counter', price_cents: body.price, note: body.note });
    } else if (body.action === 'decline') {
      result = await respondToOffer(found, { action: 'decline', reason: body.reason, note: body.note });
    } else {
      result = await respondToOffer(found, { action: body.action });
    }
    if (result.ok === false) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, outcome: result.outcome });
  } catch (err) {
    console.error('offer response failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
