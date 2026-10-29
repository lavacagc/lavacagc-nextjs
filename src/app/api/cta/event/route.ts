/**
 * POST /api/cta/event - public sink for hero CTA views and clicks.
 *
 * Body: { button, variant_key, event_type: 'view' | 'click', visitor_id }.
 * Self-guarded (the /api/cta/ prefix is public in middleware): 1 KB body cap,
 * zod, a per-IP rate limit (`cta:<ip>`, 60 per minute), and errors are never
 * echoed. Inserts with the secret key; the unique index
 * (button, variant_key, event_type, visitor_id) makes repeats free, so a
 * duplicate (23505) is answered exactly like a first write.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { readCappedJson } from '@/lib/cta/http';
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
  visitor_id: z.string().uuid(),
}).strict();

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

  try {
    await supabaseRest('POST', 'cta_events', [parsed.data], { prefer: 'return=minimal' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/23505|duplicate key/i.test(message)) {
      console.error('cta event insert failed:', message);
      return NextResponse.json({ error: 'Could not record event' }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
