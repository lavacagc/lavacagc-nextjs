/**
 * Toggle a homeowner's checklist task done/undone (the "stored" checklist),
 * or dismiss/restore a task via `dismiss: boolean` ("not relevant to my home",
 * stored as one season='all' row with status 'dismissed'; restore sets 'todo').
 * Cookie-gated by hc_access. Upserts homeowner_maintenance for the current season.
 * `completed_at` stamps each done-toggle - except an untick of work La Vaca
 * performed, which is a statement about now and leaves the record of the job
 * standing - and `updated_at` stamps every write
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
import { checklistCompletionFields, type RowCompletion } from '@/lib/homecare/selection';
import { supabaseRest } from '@/lib/notify/supabase-rest';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * What completion this row already holds, so the write can tell whose it is.
 *
 * Never swallowed: a read that failed does not mean "nobody has completed this",
 * and acting on that guess is what erases the record. The route answers 500 and
 * the member can tap again.
 */
async function currentCompletion(homeownerId: string, taskKey: string, season: string): Promise<RowCompletion | null> {
  const rows = await supabaseRest<RowCompletion[]>(
    'GET',
    `homeowner_maintenance?select=completed_by,completed_at&homeowner_id=eq.${homeownerId}` +
      `&task_key=eq.${encodeURIComponent(taskKey)}&season=eq.${encodeURIComponent(season)}&limit=1`,
  );
  return rows?.[0] ?? null;
}

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

    // An untick is a statement about NOW, not about the past, and this row is
    // both. Only read on that path: a tick reassigns the row to the member
    // whatever was there before, so there is nothing to preserve and nothing to
    // look up. `checklistCompletionFields` holds the rule itself.
    const current = done ? null : await currentCompletion(access.homeownerId, taskKey, season);

    // The member owns `status`, `completed_at` and `completed_by` and nothing
    // else. A La Vaca booking lives on this same (homeowner, task, season) row,
    // and `scheduled_start`/`scheduled_end`/`service_address` are deliberately
    // absent from this body: a merge-duplicates upsert only writes the columns
    // it carries, so the visit survives the member ticking the task. Every
    // reader treats the window - not this status - as what says a visit is on
    // the books, so the completion is recorded and the booking stands.
    await supabaseRest(
      'POST',
      'homeowner_maintenance?on_conflict=homeowner_id,task_key,season',
      {
        homeowner_id: access.homeownerId,
        task_key: taskKey,
        season,
        status: done ? 'done' : 'todo',
        // Attribution follows whoever set the CURRENT status - except an untick
        // of work LA VACA performed, which leaves both completion columns
        // untouched so the record of the job survives. Same merge-duplicates
        // rule in both directions: a column this body does not carry keeps
        // whatever it had.
        ...checklistCompletionFields(done, now, current),
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
