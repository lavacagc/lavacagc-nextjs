/**
 * GET /api/admin/offers/responses - the Sub Responses inbox (BD5, BD7):
 * pending counters and detail requests on OPEN offers, open decline call tasks,
 * and the most recent responses their offer outlived (`closed`, no actions),
 * each with the sub, the offer and the request it belongs to.
 */
import { NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { OFFER_COLUMNS, RECIPIENT_COLUMNS, RESPONSE_COLUMNS } from '@/lib/home-services/offers';
import type { DeclineCallRow, JobOfferRow, OfferRecipientRow, OfferResponseRow } from '@/lib/home-services/offerRules';
import { signPaths } from '@/lib/home-services/storage';
import { serverError } from '@/lib/home-services/adminRoute';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface SubLite { id: string; business_name: string; contact_name: string; phone: string; email: string; language: string }
interface RequestLite { id: string; first_name: string; last_name: string; town: string }

/** How many outlived responses the folded "Closed" list carries. */
const CLOSED_LIMIT = 30;

const ids = (list: string[]) => `in.(${Array.from(new Set(list)).join(',')})`;

export async function GET() {
  try {
    const [pending, closedRows, calls] = await Promise.all([
      supabaseRest<OfferResponseRow[]>('GET', `offer_responses?select=${RESPONSE_COLUMNS}&status=eq.pending&type=in.(counter,details)&order=created_at.asc&limit=200`),
      // Outlived by their offer (assigned, expired, withdrawn): shown folded away, no actions (D3).
      supabaseRest<OfferResponseRow[]>('GET', `offer_responses?select=${RESPONSE_COLUMNS}&status=eq.closed&order=created_at.desc&limit=${CLOSED_LIMIT}`),
      supabaseRest<DeclineCallRow[]>('GET', 'decline_calls?select=id,response_id,request_id,sub_id,status,counter_cents,will_take,reason_text,called_at,created_at&status=eq.open&order=created_at.asc&limit=200'),
    ]);
    const callResponses = (calls ?? []).length
      ? (await supabaseRest<OfferResponseRow[]>('GET', `offer_responses?select=${RESPONSE_COLUMNS}&id=${ids((calls ?? []).map((c) => c.response_id))}`)) ?? []
      : [];
    const all = [...(pending ?? []), ...(closedRows ?? []), ...callResponses];

    const offerIds = all.map((r) => r.offer_id);
    const subIds = [...all.map((r) => r.sub_id), ...(calls ?? []).map((c) => c.sub_id)];
    const recipientIds = all.map((r) => r.recipient_id);
    const [offers, subs, recipients] = await Promise.all([
      offerIds.length ? supabaseRest<JobOfferRow[]>('GET', `job_offers?select=${OFFER_COLUMNS}&id=${ids(offerIds)}`) : Promise.resolve([]),
      subIds.length ? supabaseRest<SubLite[]>('GET', `subs?select=id,business_name,contact_name,phone,email,language&id=${ids(subIds)}`) : Promise.resolve([]),
      recipientIds.length ? supabaseRest<OfferRecipientRow[]>('GET', `offer_recipients?select=${RECIPIENT_COLUMNS}&id=${ids(recipientIds)}`) : Promise.resolve([]),
    ]);
    const requestIds = [...(offers ?? []).map((o) => o.request_id), ...(calls ?? []).map((c) => c.request_id)];
    const requests = requestIds.length
      ? (await supabaseRest<RequestLite[]>('GET', `home_service_requests?select=id,first_name,last_name,town&id=${ids(requestIds)}`)) ?? []
      : [];

    const offerFor = (id: string) => {
      const o = (offers ?? []).find((x) => x.id === id);
      return o ? {
        id: o.id, trade: o.trade, town: o.town, sub_pay_cents: o.sub_pay_cents, customer_price_cents: o.customer_price_cents,
        status: o.status, expires_at: o.expires_at, request_id: o.request_id,
      } : null;
    };
    const subFor = (id: string) => (subs ?? []).find((s) => s.id === id) ?? null;
    const requestFor = (id: string | undefined) => requests.find((r) => r.id === id) ?? null;

    const withFiles = async (r: OfferResponseRow) => {
      const urls = await signPaths((r.attachments ?? []).map((a) => a.storage_path));
      const rcpt = (recipients ?? []).find((x) => x.id === r.recipient_id);
      const offer = offerFor(r.offer_id);
      return {
        id: r.id, type: r.type, counter_cents: r.counter_cents, note: r.note, created_at: r.created_at,
        attachments: (r.attachments ?? []).map((a, i) => ({ name: a.name ?? 'file', content_type: a.content_type, url: urls[i] })),
        sub: subFor(r.sub_id),
        offer,
        request: requestFor(offer?.request_id),
        recipient: rcpt ? { paused_at: rcpt.paused_at, expires_at: rcpt.expires_at, closed_reason: rcpt.closed_reason } : null,
      };
    };

    // Only a pending row on an OPEN offer is work. A pending row whose offer has
    // already closed (written before closing existed) is shown as closed.
    const isOpen = (r: OfferResponseRow) => offerFor(r.offer_id)?.status === 'open';
    const actionable = (pending ?? []).filter(isOpen);
    const outlived = [...(pending ?? []).filter((r) => !isOpen(r)), ...(closedRows ?? [])]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, CLOSED_LIMIT);
    const [pendingRows, closed] = await Promise.all([
      Promise.all(actionable.map(withFiles)),
      Promise.all(outlived.map(withFiles)),
    ]);
    return NextResponse.json({
      counters: pendingRows.filter((r) => r.type === 'counter'),
      details: pendingRows.filter((r) => r.type === 'details'),
      closed,
      declineCalls: (calls ?? []).map((c) => {
        const resp = callResponses.find((r) => r.id === c.response_id);
        return {
          id: c.id, created_at: c.created_at,
          reason: resp?.decline_reason ?? null, note: resp?.note ?? '',
          sub: subFor(c.sub_id),
          offer: resp ? offerFor(resp.offer_id) : null,
          request: requestFor(c.request_id),
        };
      }),
    });
  } catch (err) {
    return serverError('Could not load sub responses', err);
  }
}
