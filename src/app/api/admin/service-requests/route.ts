/**
 * GET /api/admin/service-requests - the Service Requests list (AD1) and its
 * 30-day summary card (AD7).
 *
 * Filters: status, service (catalog slug), source, county (derived from the
 * town, see requestsAdmin.ts). Status, service and source filter in the
 * query; county is derived, so it filters the fetched page.
 *
 * Admin auth is enforced by middleware on /api/admin/*. Reads with the secret
 * key: the table has RLS on and no policies (SEC5).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { isServiceSlug } from '@/lib/home-services/catalog';
import {
  countyForRequest, isRequestStatus, summarizeRequests, type HomeServiceRequestRow,
} from '@/lib/home-services/requestsAdmin';
import { serverError } from '@/lib/home-services/adminRoute';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LIST_LIMIT = 300;
const LIST_COLUMNS = 'id,status,services,first_name,last_name,phone,town,address,zip,source,phone_verified,created_at,merged_count,customer_price_cents';

type ListRow = Pick<HomeServiceRequestRow,
  'id' | 'status' | 'services' | 'first_name' | 'last_name' | 'phone' | 'town' | 'address' | 'zip' | 'source' |
  'phone_verified' | 'created_at' | 'merged_count' | 'customer_price_cents'>;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const status = q.get('status') ?? '';
  const service = q.get('service') ?? '';
  const source = (q.get('source') ?? '').trim().slice(0, 80);
  const county = (q.get('county') ?? '').trim();

  const filters: string[] = [];
  if (status) {
    if (!isRequestStatus(status)) return NextResponse.json({ error: 'Unknown status' }, { status: 400 });
    filters.push(`status=eq.${status}`);
  }
  if (service) {
    if (!isServiceSlug(service)) return NextResponse.json({ error: 'Unknown service' }, { status: 400 });
    filters.push(`services=cs.{${service}}`);
  }
  if (source) filters.push(`source=eq.${encodeURIComponent(source)}`);

  try {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const [rows, recent, heldRows, sourceRows] = await Promise.all([
      supabaseRest<ListRow[]>('GET', `home_service_requests?select=${LIST_COLUMNS}${filters.map((f) => `&${f}`).join('')}&order=created_at.desc&limit=${LIST_LIMIT + 1}`),
      supabaseRest<Array<Pick<HomeServiceRequestRow, 'status' | 'services' | 'source'>>>(
        'GET', `home_service_requests?select=status,services,source&created_at=gte.${encodeURIComponent(since)}&limit=10000`,
      ),
      supabaseRest<Array<{ id: string }>>('GET', 'home_service_requests?select=id&status=eq.held&limit=1000'),
      supabaseRest<Array<{ source: string }>>('GET', 'home_service_requests?select=source&order=created_at.desc&limit=2000'),
    ]);

    const truncated = (rows ?? []).length > LIST_LIMIT;
    let list = (rows ?? []).slice(0, LIST_LIMIT).map((r) => ({ ...r, county: countyForRequest(r) }));
    if (county) list = list.filter((r) => (county === 'none' ? r.county === null : r.county === county));

    // Offer state per listed request, so the list can flag an expired offer.
    const ids = list.map((r) => r.id);
    const offers = ids.length
      ? (await supabaseRest<Array<{ request_id: string; status: string }>>(
          'GET', `job_offers?select=request_id,status&request_id=in.(${ids.join(',')})&limit=2000`,
        )) ?? []
      : [];
    const offersByRequest: Record<string, Record<string, number>> = {};
    for (const o of offers) {
      offersByRequest[o.request_id] ??= {};
      offersByRequest[o.request_id][o.status] = (offersByRequest[o.request_id][o.status] ?? 0) + 1;
    }

    return NextResponse.json({
      requests: list.map((r) => ({ ...r, offers: offersByRequest[r.id] ?? {} })),
      truncated,
      heldCount: (heldRows ?? []).length,
      sources: Array.from(new Set((sourceRows ?? []).map((r) => r.source || 'direct'))).sort(),
      summary: summarizeRequests(recent ?? [], 30),
    });
  } catch (err) {
    return serverError('Could not load service requests', err);
  }
}
