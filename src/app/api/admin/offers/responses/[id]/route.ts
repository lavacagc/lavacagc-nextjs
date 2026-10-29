/**
 * POST /api/admin/offers/responses/<id> - Alex answers a sub (BD5, BD6).
 *
 * JSON for counters: { action: 'accept' } (the sub must then confirm),
 * { action: 'reject', text? }, { action: 'reply_price', price_cents, text? }.
 * Multipart for a detail reply: fields `action=reply_details`, `text`, and up
 * to 3 `files`. The reply is emailed and texted to the sub, and the sub's
 * paused clock restarts with the paused time added back.
 *
 * Counters above 70% of the customer price cannot be accepted, and a reply
 * price above it cannot be sent (subPayViolation).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { InboxError, RESPONSE_COLUMNS, handleInboxAction, type InboxAction } from '@/lib/home-services/offers';
import type { OfferResponseRow } from '@/lib/home-services/offerRules';
import { ATTACHMENT_ERROR_TEXT, MAX_MULTIPART_BYTES, storeAttachments } from '@/lib/home-services/attachments';
import { UUID_RE, actingAdmin, readJson, serverError } from '@/lib/home-services/adminRoute';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const jsonSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('accept') }),
  z.object({ action: z.literal('reject'), text: z.string().trim().max(1000).optional() }),
  z.object({ action: z.literal('reply_price'), price_cents: z.number().int().positive().max(100_000_000), text: z.string().trim().max(1000).optional() }),
]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  const by = await actingAdmin();
  let act: InboxAction;

  try {
    if ((request.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
      if (Number(request.headers.get('content-length') ?? 0) > MAX_MULTIPART_BYTES) {
        return NextResponse.json({ error: 'Body too large' }, { status: 413 });
      }
      const form = await request.formData();
      if (form.get('action') !== 'reply_details') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
      const text = String(form.get('text') ?? '').trim();
      if (!text) return NextResponse.json({ error: 'Write the answer first.' }, { status: 400 });
      if (text.length > 4000) return NextResponse.json({ error: 'Keep the answer under 4000 characters.' }, { status: 400 });
      const rows = await supabaseRest<OfferResponseRow[]>('GET', `offer_responses?select=${RESPONSE_COLUMNS}&id=eq.${id}`);
      const response = rows?.[0];
      if (!response) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const files = form.getAll('files').filter((f): f is File => typeof f !== 'string');
      const stored = await storeAttachments(files, response.offer_id, response.recipient_id, 'admin');
      if (stored.ok === false) return NextResponse.json({ error: ATTACHMENT_ERROR_TEXT[stored.error] }, { status: 400 });
      act = { action: 'reply_details', text, attachments: stored.attachments };
    } else {
      const read = await readJson(request, 8 * 1024);
      if (read.ok === false) return read.response;
      const parsed = jsonSchema.safeParse(read.body);
      if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Validation failed' }, { status: 400 });
      act = parsed.data;
    }
    const result = await handleInboxAction(id, act, by);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof InboxError) return NextResponse.json({ error: err.message }, { status: err.status });
    return serverError('Could not answer the sub', err);
  }
}
