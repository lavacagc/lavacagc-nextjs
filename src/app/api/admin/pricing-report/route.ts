/**
 * GET /api/admin/pricing-report?days=90 - the pricing report (AD6).
 *
 * Per trade and county: offers sent, subs reached, declines, decline rate
 * (declines over subs reached), top decline reasons, average counter price
 * (counters on the offer page plus counters Alex logged on decline calls),
 * average sub pay and average customer price.
 *
 * County comes from the request's town (requestsAdmin.ts), so an offer and its
 * counters land in the same row as the homeowner's county.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { countyForRequest } from '@/lib/home-services/requestsAdmin';
import { DECLINE_REASONS, type DeclineReason } from '@/lib/home-services/offerRules';
import { serverError } from '@/lib/home-services/adminRoute';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ROW_CAP = 5000;

interface OfferLite { id: string; request_id: string; trade: string; sub_pay_cents: number; customer_price_cents: number; created_at: string }
interface ResponseLite { offer_id: string; type: string; counter_cents: number | null; decline_reason: DeclineReason | null; id: string }
interface CallLite { response_id: string; counter_cents: number | null; will_take: boolean | null }

export interface PricingRow {
  trade: string;
  county: string;
  offers: number;
  recipients: number;
  declines: number;
  declineRate: number | null;
  topReasons: Array<{ reason: DeclineReason | 'none'; count: number }>;
  counters: number;
  avgCounterCents: number | null;
  avgSubPayCents: number | null;
  avgCustomerPriceCents: number | null;
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const ids = (list: string[]) => `in.(${Array.from(new Set(list)).join(',')})`;

export async function GET(request: NextRequest) {
  const daysRaw = Number(request.nextUrl.searchParams.get('days') ?? '0');
  const days = Number.isInteger(daysRaw) && daysRaw > 0 && daysRaw <= 3650 ? daysRaw : 0;
  const since = days ? `&created_at=gte.${encodeURIComponent(new Date(Date.now() - days * 86400000).toISOString())}` : '';

  try {
    const offers = (await supabaseRest<OfferLite[]>(
      'GET', `job_offers?select=id,request_id,trade,sub_pay_cents,customer_price_cents,created_at${since}&order=created_at.desc&limit=${ROW_CAP}`,
    )) ?? [];
    const offerIds = offers.map((o) => o.id);
    const chunks: string[][] = [];
    for (let i = 0; i < offerIds.length; i += 200) chunks.push(offerIds.slice(i, i + 200));

    const [requests, responses, recipientCounts] = await Promise.all([
      (async () => {
        const reqIds = Array.from(new Set(offers.map((o) => o.request_id)));
        const out: Array<{ id: string; town: string; address: string; zip: string }> = [];
        for (let i = 0; i < reqIds.length; i += 200) {
          out.push(...((await supabaseRest<Array<{ id: string; town: string; address: string; zip: string }>>(
            'GET', `home_service_requests?select=id,town,address,zip&id=${ids(reqIds.slice(i, i + 200))}`,
          )) ?? []));
        }
        return out;
      })(),
      Promise.all(chunks.map((c) => supabaseRest<ResponseLite[]>(
        'GET', `offer_responses?select=id,offer_id,type,counter_cents,decline_reason&type=in.(counter,decline)&offer_id=${ids(c)}&limit=${ROW_CAP}`,
      ))).then((r) => r.flatMap((x) => x ?? [])),
      Promise.all(chunks.map((c) => supabaseRest<Array<{ offer_id: string }>>(
        'GET', `offer_recipients?select=offer_id&offer_id=${ids(c)}&limit=${ROW_CAP * 5}`,
      ))).then((r) => r.flatMap((x) => x ?? [])),
    ]);

    const declineIds = responses.filter((r) => r.type === 'decline').map((r) => r.id);
    const calls: CallLite[] = [];
    for (let i = 0; i < declineIds.length; i += 200) {
      calls.push(...((await supabaseRest<CallLite[]>(
        'GET', `decline_calls?select=response_id,counter_cents,will_take&response_id=${ids(declineIds.slice(i, i + 200))}`,
      )) ?? []));
    }

    const countyOf = new Map(requests.map((r) => [r.id, countyForRequest(r) ?? 'Unknown']));
    const recipientsByOffer = new Map<string, number>();
    for (const r of recipientCounts) recipientsByOffer.set(r.offer_id, (recipientsByOffer.get(r.offer_id) ?? 0) + 1);

    type Acc = { offers: OfferLite[]; recipients: number; declines: ResponseLite[]; counters: number[] };
    const groups = new Map<string, Acc>();
    const keyFor = (o: OfferLite) => `${o.trade}|${countyOf.get(o.request_id) ?? 'Unknown'}`;
    const offerById = new Map(offers.map((o) => [o.id, o]));
    for (const o of offers) {
      const k = keyFor(o);
      if (!groups.has(k)) groups.set(k, { offers: [], recipients: 0, declines: [], counters: [] });
      const g = groups.get(k)!;
      g.offers.push(o);
      g.recipients += recipientsByOffer.get(o.id) ?? 0;
    }
    for (const r of responses) {
      const o = offerById.get(r.offer_id);
      if (!o) continue;
      const g = groups.get(keyFor(o))!;
      if (r.type === 'decline') g.declines.push(r);
      if (r.type === 'counter' && r.counter_cents) g.counters.push(r.counter_cents);
    }
    for (const c of calls) {
      if (!c.counter_cents) continue;
      const resp = responses.find((r) => r.id === c.response_id);
      const o = resp ? offerById.get(resp.offer_id) : undefined;
      if (o) groups.get(keyFor(o))!.counters.push(c.counter_cents);
    }

    const rows: PricingRow[] = Array.from(groups, ([key, g]) => {
      const [trade, county] = key.split('|');
      const reasonCounts = new Map<DeclineReason | 'none', number>();
      for (const d of g.declines) {
        const reason = d.decline_reason && DECLINE_REASONS.includes(d.decline_reason) ? d.decline_reason : 'none';
        reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
      }
      return {
        trade,
        county,
        offers: g.offers.length,
        recipients: g.recipients,
        declines: g.declines.length,
        declineRate: g.recipients > 0 ? g.declines.length / g.recipients : null,
        topReasons: Array.from(reasonCounts, ([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 3),
        counters: g.counters.length,
        avgCounterCents: avg(g.counters),
        avgSubPayCents: avg(g.offers.map((o) => o.sub_pay_cents)),
        avgCustomerPriceCents: avg(g.offers.map((o) => o.customer_price_cents)),
      };
    }).sort((a, b) => a.trade.localeCompare(b.trade) || a.county.localeCompare(b.county));

    return NextResponse.json({ rows, days, truncated: offers.length >= ROW_CAP });
  } catch (err) {
    return serverError('Could not build the pricing report', err);
  }
}
