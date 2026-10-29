/**
 * /api/admin/service-requests/<id>
 *
 * GET   the detail panel (AD2): every field, the answers as lines, signed photo
 *       links (7 days, private bucket), the offers sent on this request with
 *       who got them and what they said, and who would get a new bid request
 *       for each trade (and who would not, and why - BD3).
 * PATCH status change, note, Won, Lost (AD3, AD4). Every change appends a
 *       timestamped line to admin_notes; nothing rewrites an earlier line.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { describeAnswers } from '@/lib/home-services/catalog';
import { STATUS_LABEL, answerLinesFor, countyForRequest, tradesForServices } from '@/lib/home-services/requestsAdmin';
import {
  OFFER_COLUMNS, RECIPIENT_COLUMNS, RESPONSE_COLUMNS, appendRequestNote, getRequest, previewRecipients, tradeAssignment,
} from '@/lib/home-services/offers';
import type { JobOfferRow, OfferRecipientRow, OfferResponseRow } from '@/lib/home-services/offerRules';
import { formatDollars } from '@/lib/home-services/pricing';
import { signPaths } from '@/lib/home-services/storage';
import { isSpecNookConfigured } from '@/lib/specnook/client';
import { isSmsConfigured } from '@/lib/home-services/sms';
import { UUID_RE, actingAdmin, readJson, serverError } from '@/lib/home-services/adminRoute';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  try {
    const request = await getRequest(id);
    if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const [photoRows, offers, preview, trades] = await Promise.all([
      supabaseRest<Array<{ id: string; storage_path: string; content_type: string; created_at: string }>>(
        'GET', `lead_photos?select=id,storage_path,content_type,created_at&request_id=eq.${id}&order=created_at.asc&limit=50`,
      ),
      supabaseRest<JobOfferRow[]>('GET', `job_offers?select=${OFFER_COLUMNS}&request_id=eq.${id}&order=created_at.desc&limit=50`),
      previewRecipients(request),
      tradeAssignment(id),
    ]);
    const urls = await signPaths((photoRows ?? []).map((p) => p.storage_path));
    const photos = (photoRows ?? []).map((p, i) => ({ id: p.id, url: urls[i], content_type: p.content_type, created_at: p.created_at }));

    const offerIds = (offers ?? []).map((o) => o.id);
    const [recipients, responses] = offerIds.length
      ? await Promise.all([
          supabaseRest<OfferRecipientRow[]>('GET', `offer_recipients?select=${RECIPIENT_COLUMNS}&offer_id=in.(${offerIds.join(',')})&limit=1000`),
          supabaseRest<OfferResponseRow[]>('GET', `offer_responses?select=${RESPONSE_COLUMNS}&offer_id=in.(${offerIds.join(',')})&order=created_at.asc&limit=1000`),
        ])
      : [[], []];
    const subIds = Array.from(new Set((recipients ?? []).map((r) => r.sub_id)));
    const subs = subIds.length
      ? (await supabaseRest<Array<{ id: string; business_name: string; language: string }>>(
          'GET', `subs?select=id,business_name,language&id=in.(${subIds.join(',')})`,
        )) ?? []
      : [];
    const subName = (sid: string | null) => subs.find((s) => s.id === sid)?.business_name ?? 'Unknown sub';

    return NextResponse.json({
      request: {
        ...request,
        county: countyForRequest(request),
        answer_lines: describeAnswers(request.services, request.answers ?? {}),
      },
      photos,
      offers: (offers ?? []).map((o) => ({
        ...o,
        assigned_sub_name: o.assigned_sub_id ? subName(o.assigned_sub_id) : null,
        // The token is the sub's credential; the admin never needs it, so it never leaves the server.
        recipients: (recipients ?? []).filter((r) => r.offer_id === o.id).map((r) => {
          const copy: Partial<OfferRecipientRow> = { ...r, sub_name: subName(r.sub_id) } as Partial<OfferRecipientRow>;
          delete copy.token;
          return copy;
        }),
        responses: (responses ?? []).filter((r) => r.offer_id === o.id).map((r) => ({ ...r, sub_name: subName(r.sub_id) })),
      })),
      // Latest state per trade that went out: open, assigned, expired or cancelled (withdrawn).
      trade_state: trades.latest,
      bid: {
        trades: tradesForServices(request.services).map((trade) => ({
          trade,
          // English for Alex; each sub reads these in their own language.
          answers: answerLinesFor(request, trade, 'en'),
          preview: preview.find((p) => p.trade === trade) ?? null,
        })),
      },
      integrations: { specnook: isSpecNookConfigured(), sms: isSmsConfigured(), email: !!process.env.RESEND_API_KEY },
    });
  } catch (err) {
    return serverError('Could not load the request', err);
  }
}

const patchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status'), status: z.enum(['held', 'new', 'contacted', 'bid_sent', 'assigned']) }),
  z.object({ action: z.literal('note'), text: z.string().trim().min(1, 'Write a note first').max(2000) }),
  z.object({ action: z.literal('won'), customer_price_cents: z.number().int().positive().max(100_000_000) }),
  z.object({ action: z.literal('lost'), reason: z.string().trim().min(1, 'Say why it was lost').max(500) }),
]);

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  const read = await readJson(request, 8 * 1024);
  if (read.ok === false) return read.response;
  const parsed = patchSchema.safeParse(read.body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;
  const by = await actingAdmin();

  try {
    const current = await getRequest(id);
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const from = STATUS_LABEL[current.status];
    let updated;
    switch (body.action) {
      case 'status':
        if (body.status === current.status) return NextResponse.json({ request: current, unchanged: true });
        updated = await appendRequestNote(id, `Status: ${from} -> ${STATUS_LABEL[body.status]}.`, { status: body.status }, by);
        break;
      case 'note':
        updated = await appendRequestNote(id, `Note: ${body.text}`, {}, by);
        break;
      case 'won':
        updated = await appendRequestNote(
          id,
          `Status: ${from} -> Won at ${formatDollars(body.customer_price_cents)}.`,
          { status: 'won', won_at: new Date().toISOString(), customer_price_cents: body.customer_price_cents, lost_reason: null },
          by,
        );
        break;
      case 'lost':
        updated = await appendRequestNote(id, `Status: ${from} -> Lost. Reason: ${body.reason}`, { status: 'lost', lost_reason: body.reason }, by);
        break;
    }
    return NextResponse.json({ request: updated });
  } catch (err) {
    return serverError('Could not update the request', err);
  }
}
