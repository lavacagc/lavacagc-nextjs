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

interface LeadRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  project_type: string | null;
  city: string | null;
  created_at: string;
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';

  // Empty query → return the most recent 25 leads, useful for "I just took
  // this lead" workflows where the admin doesn't want to type.
  let path: string;
  if (!q) {
    path = `leads?select=id,name,email,phone,project_type,city,created_at&order=created_at.desc&limit=25`;
  } else {
    // PostgREST OR filter — escape any commas/parens by URI-encoding.
    // ilike pattern with %q% on name/email/phone.
    const pattern = `*${q}*`;
    const safe = encodeURIComponent(pattern);
    path =
      `leads?select=id,name,email,phone,project_type,city,created_at` +
      `&or=(name.ilike.${safe},email.ilike.${safe},phone.ilike.${safe})` +
      `&order=created_at.desc&limit=25`;
  }

  try {
    const rows = await supabaseRest<LeadRow[]>('GET', path);
    return NextResponse.json({ leads: rows ?? [] });
  } catch (err) {
    console.error('Lead search failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Search failed' },
      { status: 500 },
    );
  }
}
