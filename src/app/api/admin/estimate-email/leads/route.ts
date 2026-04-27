import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';

/**
 * GET /api/admin/estimate-email/leads?q=...
 *
 * Lightweight typeahead search over public.leads to populate the
 * "select a lead" picker in the estimate-email admin form. Returns at most
 * 25 rows. Admin auth is enforced by middleware.
 */

export const dynamic = 'force-dynamic';

// Internal row shape from Supabase. The leads table stores names as
// first_name/last_name; we compose a `name` field for the frontend.
interface DbLeadRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  project_type: string | null;
  city: string | null;
  created_at: string;
}

interface LeadHit {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  project_type: string | null;
  city: string | null;
  created_at: string;
}

const SELECT_COLS = 'id,first_name,last_name,email,phone,project_type,city,created_at';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';

  // Empty query → return the most recent 25 leads, useful for "I just took
  // this lead" workflows where the admin doesn't want to type.
  let path: string;
  if (!q) {
    path = `leads?select=${SELECT_COLS}&order=created_at.desc&limit=25`;
  } else {
    // PostgREST OR filter — escape any commas/parens by URI-encoding.
    // ilike pattern with %q% on first_name/last_name/email/phone.
    const pattern = `*${q}*`;
    const safe = encodeURIComponent(pattern);
    path =
      `leads?select=${SELECT_COLS}` +
      `&or=(first_name.ilike.${safe},last_name.ilike.${safe},email.ilike.${safe},phone.ilike.${safe})` +
      `&order=created_at.desc&limit=25`;
  }

  try {
    const rows = await supabaseRest<DbLeadRow[]>('GET', path);
    const leads: LeadHit[] = (rows ?? []).map((r) => {
      const composed = [r.first_name, r.last_name].filter(Boolean).join(' ').trim();
      return {
        id: r.id,
        name: composed || null,
        email: r.email,
        phone: r.phone,
        project_type: r.project_type,
        city: r.city,
        created_at: r.created_at,
      };
    });
    return NextResponse.json({ leads });
  } catch (err) {
    console.error('Lead search failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Search failed' },
      { status: 500 },
    );
  }
}
