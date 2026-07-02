/**
 * Toggle a homeowner's checklist task done/undone (the "stored" checklist).
 * Cookie-gated by hc_access. Upserts homeowner_maintenance for the current season.
 */
import { NextRequest, NextResponse } from 'next/server';
import { HC_ACCESS_COOKIE, verifyHomeAccess } from '@/lib/homecare/accessCookie';
import { findHomeownerById } from '@/lib/homecare/homeowners';
import { currentSeason } from '@/lib/homecare/season';
import { supabaseRest } from '@/lib/notify/supabase-rest';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const access = await verifyHomeAccess(request.cookies.get(HC_ACCESS_COOKIE)?.value);
  if (!access) return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });

  try {
    // A signed cookie stays valid until expiry; re-check the account is still
    // active so an unsubscribed homeowner can't keep writing (mirrors the
    // Buy + Remodel middleware `subscriberIsActive` re-check). Fails closed.
    const homeowner = await findHomeownerById(access.homeownerId);
    if (!homeowner || homeowner.status !== 'active') {
      return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { task_key?: string; done?: boolean; season?: string };
    const taskKey = (body.task_key ?? '').slice(0, 80);
    if (!taskKey) return NextResponse.json({ ok: false, error: 'task_key required' }, { status: 400 });
    const done = body.done === true;
    const validSeasons = ['spring', 'summer', 'fall', 'winter', 'starter'];
    const season = validSeasons.includes(body.season ?? '') ? (body.season as string) : currentSeason();
    const now = new Date().toISOString();

    await supabaseRest(
      'POST',
      'homeowner_maintenance?on_conflict=homeowner_id,task_key,season',
      {
        homeowner_id: access.homeownerId,
        task_key: taskKey,
        season,
        status: done ? 'done' : 'todo',
        completed_at: done ? now : null,
        updated_at: now,
      },
      { prefer: 'resolution=merge-duplicates,return=minimal' },
    );

    return NextResponse.json({ ok: true, task_key: taskKey, done });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('home-care task toggle failed:', message);
    return NextResponse.json({ ok: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
