/**
 * Save a homeowner's home profile (progressive profiling). Cookie-gated by the
 * hc_access cookie — no admin/login. Upserts home_profiles.systems.
 */
import { NextRequest, NextResponse } from 'next/server';
import { HC_ACCESS_COOKIE, verifyHomeAccess } from '@/lib/homecare/accessCookie';
import { findHomeownerById } from '@/lib/homecare/homeowners';
import { sanitizeSystems, STAGES } from '@/lib/homecare/profile';
import { supabaseRest } from '@/lib/notify/supabase-rest';

const STAGE_KEYS = new Set<string>(STAGES.map((s) => s.key));
// Keep legacy homeowner_type in sync with stage so older reads still work.
const STAGE_TO_LEGACY: Record<string, string> = { just_bought: 'first_time', new_construction: 'first_time', established: 'experienced', selling: 'experienced' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const access = await verifyHomeAccess(request.cookies.get(HC_ACCESS_COOKIE)?.value);
  if (!access) return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });

  try {
    // Re-check the account is still active (signed cookies outlive unsubscribe).
    // Mirrors the Buy + Remodel middleware re-check. Fails closed.
    const homeowner = await findHomeownerById(access.homeownerId);
    if (!homeowner || homeowner.status !== 'active') {
      return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { systems?: unknown; stage?: unknown; homeowner_type?: unknown };
    const systems = sanitizeSystems(body.systems);
    // Prefer the new `stage`; fall back to legacy homeowner_type for older clients.
    const stage = typeof body.stage === 'string' && STAGE_KEYS.has(body.stage) ? body.stage : null;
    const homeowner_type = stage
      ? STAGE_TO_LEGACY[stage]
      : body.homeowner_type === 'first_time' || body.homeowner_type === 'experienced'
        ? body.homeowner_type
        : null;

    await supabaseRest(
      'POST',
      'home_profiles?on_conflict=homeowner_id',
      { homeowner_id: access.homeownerId, systems, stage, homeowner_type, updated_at: new Date().toISOString() },
      { prefer: 'resolution=merge-duplicates,return=minimal' },
    );

    return NextResponse.json({ ok: true, systems, stage, homeowner_type });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('home-care profile save failed:', message);
    return NextResponse.json({ ok: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
