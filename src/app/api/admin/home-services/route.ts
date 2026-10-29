/**
 * GET /api/admin/home-services - every home_services row, active or not, for
 * the Services & Prices editor and the admin name and price lookups
 * (docs/phase-2/acceptance-criteria.md, "Admin Services & Prices editor").
 *
 * Reads the table directly, not the hourly cache the public pages use, so the
 * editor always shows what is stored. Admin auth is enforced by middleware on
 * /api/admin/* (CAT8).
 */
import { NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { HOME_SERVICE_COLUMNS, type HomeServiceRow } from '@/lib/home-services/catalogRow';
import { serverError } from '@/lib/home-services/adminRoute';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const services =
      (await supabaseRest<HomeServiceRow[]>('GET', `home_services?select=${HOME_SERVICE_COLUMNS}&order=sort.asc,slug.asc&limit=50`)) ?? [];
    return NextResponse.json({ services });
  } catch (err) {
    return serverError('Could not load the services', err);
  }
}
