/**
 * Save a homeowner's home profile (progressive profiling). Cookie-gated by the
 * hc_access cookie — no admin/login. Upserts home_profiles.systems.
 */
import { NextRequest, NextResponse } from 'next/server';
import { HC_ACCESS_COOKIE, verifyHomeAccess } from '@/lib/homecare/accessCookie';
import { sanitizeSystems } from '@/lib/homecare/profile';
import { supabaseRest } from '@/lib/notify/supabase-rest';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const access = await verifyHomeAccess(request.cookies.get(HC_ACCESS_COOKIE)?.value);
  if (!access) return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const systems = sanitizeSystems((body as { systems?: unknown }).systems);

    await supabaseRest(
      'POST',
      'home_profiles?on_conflict=homeowner_id',
      { homeowner_id: access.homeownerId, systems, updated_at: new Date().toISOString() },
      { prefer: 'resolution=merge-duplicates,return=minimal' },
    );

    return NextResponse.json({ ok: true, systems });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('home-care profile save failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
