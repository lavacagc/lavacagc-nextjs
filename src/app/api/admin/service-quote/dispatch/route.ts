/**
 * POST /api/admin/service-quote/dispatch - the office has dealt with a flag.
 *
 * A crew member who taps "Something is wrong" cannot take it back: their screen
 * is terminal by design, because the person who found the problem is not
 * necessarily the person who fixes it. But a flag no longer counts as an answer
 * - only a confirmation stops the 5pm and 6pm chases - so without this route a
 * flagged visit is chased until its window passes with no way to stop it, and
 * the owner is alerted three times about one problem they have already sorted.
 *
 * So clearing a flag is an ADMIN action, taken where the admin is already
 * looking: the "On the books" list on /vaca-mgmt/send-service-quote. It marks
 * that visit's flagged assignments confirmed, which is what the escalation
 * reads, and it is deliberately NOT the public token endpoint - that one is
 * guarded by a link in somebody's inbox, and this is the office speaking.
 *
 * The note is KEPT. It is the record of what was wrong, and the visit having
 * been sorted does not make it untrue.
 *
 * Admin auth is enforced by middleware on /api/admin/*.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import {
  assignmentsForDispatch, dispatchStateOf, VISIT_DISPATCH_COLUMNS,
  type DispatchAssignment, type VisitDispatchRow,
} from '@/lib/homecare/dispatch';
import { visitKey } from '@/lib/homecare/visitSchedule';
import { handleFlagSchema } from '../_schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let raw: unknown;
  try { raw = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = handleFlagSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  const { homeownerId, start } = parsed.data;
  const key = visitKey(new Date(start));

  try {
    const rows = (await supabaseRest<VisitDispatchRow[]>(
      'GET',
      `visit_dispatch?select=${VISIT_DISPATCH_COLUMNS}` +
        `&homeowner_id=eq.${homeownerId}&visit_start=eq.${encodeURIComponent(key)}&limit=1`,
    )) ?? [];
    const dispatch = rows[0];
    if (!dispatch) {
      return NextResponse.json({ error: 'No crew dispatch for that visit' }, { status: 404 });
    }

    const now = new Date().toISOString();
    // Scoped to the flagged rows: somebody who never answered has still not
    // answered, and marking their silence as a confirmation would hide the one
    // thing the chase exists to surface.
    const handled = (await supabaseRest<DispatchAssignment[]>(
      'PATCH',
      `visit_dispatch_recipients?dispatch_id=eq.${dispatch.id}&status=eq.flagged`,
      { status: 'confirmed', confirmed_at: now, updated_at: now },
    )) ?? [];

    return NextResponse.json({
      status: 'handled',
      handled: handled.length,
      dispatch: dispatchStateOf(await assignmentsForDispatch(dispatch.id)),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('service-quote dispatch handled failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
