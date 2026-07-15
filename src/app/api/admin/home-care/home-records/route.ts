/**
 * Staff "Home Record" view API (My Home Systems, Slice 6).
 *
 * GET  /api/admin/home-care/home-records                      -> roster (no sensitive values)
 * GET  /api/admin/home-care/home-records?homeowner_id=<uuid>  -> one homeowner's saved facts
 *
 * TWO gates, both server-side:
 *  1. Middleware already 401s /api/admin/* without a valid admin session.
 *  2. requireHomeCareStaff() re-derives the session email IN THIS ROUTE and
 *     checks it against the dedicated HOME_CARE_STAFF_EMAILS allowlist - the
 *     owner's explicit decision that shut-off maps are need-to-know, not
 *     "any logged-in admin". Fails closed (no allowlist = nobody).
 *
 * "NO LOG, NO LOOK": the detail response contains home-security data, so an
 * audit row (who viewed whose record, which fact categories, when, from where)
 * is written to home_record_access_log BEFORE any value is returned. If that
 * insert fails, the route returns 500 and shows nothing - mirroring the
 * consent-before-write rule on the homeowner save path. The roster deliberately
 * exposes no fact values (only names + counts), so listing is not a logged view.
 *
 * Values shown are registry-filtered: a row whose fact_key is no longer in
 * HOME_FACTS simply doesn't render, same chokepoint as everywhere else.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireHomeCareStaff } from '@/lib/homecare/staffAccess';
import { findHomeownerById } from '@/lib/homecare/homeowners';
import { readHomeRecordsStrict } from '@/lib/homecare/homeRecords';
import { HOME_FACTS, factValueSummary } from '@/lib/homecare/records';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ROSTER_PAGE = 1000;
const ROSTER_MAX_ROWS = 100000;

interface RosterSourceRow {
  homeowner_id: string;
  updated_at: string;
}

interface HomeownerLite {
  id: string;
  email: string;
  first_name: string | null;
  zip: string | null;
  home_type: string | null;
  status: string;
}

interface AccessLogRow {
  staff_email: string;
  created_at: string;
}

export async function GET(request: NextRequest) {
  const staff = await requireHomeCareStaff();
  if (!staff) {
    return NextResponse.json(
      { ok: false, error: 'Not authorized for Home Care records' },
      { status: 403 },
    );
  }

  const homeownerId = request.nextUrl.searchParams.get('homeowner_id');
  if (!homeownerId) return roster();
  if (!UUID_RE.test(homeownerId)) {
    return NextResponse.json({ ok: false, error: 'Invalid homeowner id' }, { status: 400 });
  }
  return detail(request, staff.email, homeownerId);
}

/**
 * Which homeowners have saved details, with counts and freshness only - never
 * the values themselves, so opening the roster is not a logged record view.
 * Fail-soft: before go-live the home_records table doesn't exist yet, and the
 * staff page should render an empty roster, not an error.
 */
async function roster() {
  const rows: RosterSourceRow[] = [];
  try {
    for (let offset = 0; offset < ROSTER_MAX_ROWS; offset += ROSTER_PAGE) {
      const page = (await supabaseRest<RosterSourceRow[]>(
        'GET',
        `home_records?select=homeowner_id,updated_at&order=id.asc&limit=${ROSTER_PAGE}&offset=${offset}`,
      )) ?? [];
      rows.push(...page);
      if (page.length < ROSTER_PAGE) break;
    }
  } catch (err) {
    console.error('home-record roster read failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: true, roster: [] });
  }
  if (!rows.length) return NextResponse.json({ ok: true, roster: [] });

  const byOwner = new Map<string, { count: number; last: string }>();
  for (const r of rows) {
    const cur = byOwner.get(r.homeowner_id);
    if (!cur) byOwner.set(r.homeowner_id, { count: 1, last: r.updated_at });
    else {
      cur.count += 1;
      if (r.updated_at > cur.last) cur.last = r.updated_at;
    }
  }

  let owners: HomeownerLite[] = [];
  try {
    const ids = [...byOwner.keys()].join(',');
    owners = (await supabaseRest<HomeownerLite[]>(
      'GET',
      `homeowners?id=in.(${ids})&select=id,email,first_name,zip,home_type,status`,
    )) ?? [];
  } catch (err) {
    console.error('home-record roster owners read failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: true, roster: [] });
  }

  const roster = owners
    .map((o) => {
      const agg = byOwner.get(o.id)!;
      return {
        id: o.id,
        first_name: o.first_name,
        email: o.email,
        zip: o.zip,
        home_type: o.home_type,
        status: o.status,
        fact_count: agg.count,
        last_updated: agg.last,
      };
    })
    .sort((a, b) => (a.last_updated < b.last_updated ? 1 : -1));

  return NextResponse.json({ ok: true, roster });
}

/** One homeowner's saved facts - audit-logged BEFORE any value leaves the server. */
async function detail(request: NextRequest, staffEmail: string, homeownerId: string) {
  try {
    const homeowner = await findHomeownerById(homeownerId);
    if (!homeowner) {
      return NextResponse.json({ ok: false, error: 'Homeowner not found' }, { status: 404 });
    }

    const rows = await readHomeRecordsStrict(homeownerId);
    const byFactKey = new Map(rows.map((r) => [r.fact_key, r]));

    // Registry order + registry filter, same as the recap and the booking rider.
    const facts: {
      fact_key: string;
      label: string;
      kind: string;
      summary: string;
      updated_by: string;
      updated_at: string;
    }[] = [];
    for (const fact of HOME_FACTS) {
      const row = byFactKey.get(fact.key);
      if (!row) continue;
      const summary = factValueSummary(fact, { note: row.note, detail: row.detail ?? {} }).trim();
      if (!summary) continue;
      facts.push({
        fact_key: fact.key,
        label: fact.label,
        kind: fact.kind,
        summary,
        updated_by: row.updated_by,
        updated_at: row.updated_at,
      });
    }

    // NO LOG, NO LOOK: record the view (fact keys only, never values) before
    // returning anything sensitive. A failed audit insert blocks the view.
    try {
      const auditRow: Record<string, unknown> = {
        homeowner_id: homeownerId,
        staff_email: staffEmail,
        fact_keys: facts.map((f) => f.fact_key),
        user_agent: request.headers.get('user-agent') || null,
      };
      const ip = getClientIp(request);
      if (ip && ip !== 'unknown' && /^[0-9a-fA-F.:]+$/.test(ip)) {
        auditRow.ip_address = ip;
      }
      await supabaseRest('POST', 'home_record_access_log', auditRow, { prefer: 'return=minimal' });
    } catch (err) {
      console.error('home-record access log failed:', err instanceof Error ? err.message : String(err));
      return NextResponse.json(
        { ok: false, error: 'Could not record this access, so the record was not shown. Please try again.' },
        { status: 500 },
      );
    }

    // Recent views of this record (includes the one just logged) - the trust
    // surface that makes "every view is logged" visible to the team.
    let recentAccess: AccessLogRow[] = [];
    try {
      recentAccess = (await supabaseRest<AccessLogRow[]>(
        'GET',
        `home_record_access_log?homeowner_id=eq.${encodeURIComponent(homeownerId)}` +
          '&select=staff_email,created_at&order=created_at.desc&limit=6',
      )) ?? [];
    } catch {
      // Non-fatal: the view itself was already logged above.
    }

    return NextResponse.json({
      ok: true,
      homeowner: {
        id: homeowner.id,
        first_name: homeowner.first_name,
        email: homeowner.email,
        zip: homeowner.zip,
        home_type: homeowner.home_type,
        status: homeowner.status,
      },
      facts,
      recent_access: recentAccess,
    });
  } catch (err) {
    console.error('home-record detail failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { ok: false, error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }
}
