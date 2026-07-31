/**
 * Toggle a homeowner's checklist task done/undone (the "stored" checklist),
 * or dismiss/restore a task via `dismiss: boolean` ("not relevant to my home",
 * stored as one season='all' row with status 'dismissed'; restore sets 'todo').
 * Cookie-gated by hc_access. Upserts homeowner_maintenance for the current season.
 * `completed_at` stamps each done-toggle and `updated_at` stamps every write
 * (the expiry clock for statuses that stamp no `completed_at`). `isRowCurrent`
 * (src/lib/homecare/selection.ts) compares them to `completionCutoff(season)`
 * so seasonal completions expire when the season next comes around (see
 * src/lib/homecare/season.ts). The checklist page and the monthly newsletter
 * both read it, so they cannot disagree about what still counts as done.
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

    const body = (await request.json().catch(() => ({}))) as { task_key?: string; done?: boolean; season?: string; dismiss?: boolean };
    const taskKey = (body.task_key ?? '').slice(0, 80);
    if (!taskKey) return NextResponse.json({ ok: false, error: 'task_key required' }, { status: 400 });
    const now = new Date().toISOString();

    // Dismissal ("not relevant to my home") is task-level, not per-season:
    // one season='all' marker row. Restore flips it to 'todo', which every
    // reader ignores, so the same upsert handles both directions.
    if (typeof body.dismiss === 'boolean') {
      await supabaseRest(
        'POST',
        'homeowner_maintenance?on_conflict=homeowner_id,task_key,season',
        {
          homeowner_id: access.homeownerId,
          task_key: taskKey,
          season: 'all',
          status: body.dismiss ? 'dismissed' : 'todo',
          completed_at: null,
          updated_at: now,
        },
        { prefer: 'resolution=merge-duplicates,return=minimal' },
      );
      return NextResponse.json({ ok: true, task_key: taskKey, dismissed: body.dismiss });
    }

    const done = body.done === true;
    const validSeasons = ['spring', 'summer', 'fall', 'winter', 'starter'];
    const season = validSeasons.includes(body.season ?? '') ? (body.season as string) : currentSeason();

    await supabaseRest(
      'POST',
      'homeowner_maintenance?on_conflict=homeowner_id,task_key,season',
      {
        homeowner_id: access.homeownerId,
        task_key: taskKey,
        season,
        status: done ? 'done' : 'todo',
        completed_at: done ? now : null,
        // Attribution follows whoever set the CURRENT status. The column
        // defaults to 'homeowner' on insert only, and a merge-duplicates upsert
        // updates just the columns in the body - so without this a row La Vaca
        // completed keeps 'lavaca' after the member unticks it and does the work
        // themselves, and the portal credits us for their work.
        completed_by: 'homeowner',
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
