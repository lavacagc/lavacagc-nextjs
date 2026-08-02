/**
 * Chase the intakes that went quiet (WEB-01B, plus the abandoned case).
 *
 * Two stages, selected by ?stage=. Kept in one route because they share the
 * whole mechanism and differ only in the candidate query and the wording.
 *
 *   ?stage=low_intent   never opened the link      (WEB-01B)
 *   ?stage=abandoned    opened it, went quiet
 *
 * ?dry=1 reports what it would do and sends nothing.
 *
 * The stamp is claimed BEFORE the send and released if the send fails, so a
 * crash between the two cannot silently swallow a lead, and a success cannot be
 * alerted twice. `chaseOne` owns that sequence - see the note there on why the
 * claim has to prove it won the race rather than assume it.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { sendTelegramMessage } from '@/lib/notify/telegramMessage';
import {
  chaseMessage, chaseOne, candidateQuery, chaseCutoff, paginate,
  type ChaseCandidate, type ChaseDeps, type ChaseKind,
} from '@/lib/intake/chase';
import { recordRouting } from '@/lib/intake/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/**
 * A full page is 25 sequential candidates, each a PATCH plus a Telegram send
 * that waits up to 6s of its own. A run killed mid-loop is the one thing the
 * claim-before-send sequence cannot survive: every candidate already claimed
 * but not yet sent keeps its stamp and is never chased again, because the
 * release never runs. 300 like every other looping cron here.
 */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const stage = url.searchParams.get('stage');
  const dry = url.searchParams.get('dry') === '1';

  if (stage !== 'low_intent' && stage !== 'abandoned') {
    return NextResponse.json(
      { error: "stage must be 'low_intent' or 'abandoned'" },
      { status: 400 },
    );
  }
  const kind: ChaseKind = stage;

  const now = new Date();
  // The same clock the claim re-checks each candidate against, so a row cannot
  // be selected by one window and stamped under another.
  const cutoff = chaseCutoff(kind, now);

  // A read that failed is NOT an empty list. Reporting ok:true and processed:0
  // for a query that never ran would make a broken cron look like a quiet one.
  let candidates: ChaseCandidate[];
  let truncated: boolean;
  try {
    const rows = await supabaseRest<ChaseCandidate[]>('GET', candidateQuery(kind, cutoff));
    if (!Array.isArray(rows)) throw new Error('unexpected response shape');
    ({ candidates, truncated } = paginate(rows));
  } catch (err) {
    console.error(`[intake-chase] could not read ${kind} candidates:`, err);
    return NextResponse.json(
      { ok: false, stage: kind, error: 'Could not read candidates - nothing was chased.' },
      { status: 503 },
    );
  }

  // A run that drained its backlog and a run that got through the first 25 of
  // it must not report the same thing (AC8).
  const backlog = truncated
    ? { truncated: true, note: `More than ${candidates.length} are waiting - the rest go on the next run.` }
    : { truncated: false };

  if (dry) {
    return NextResponse.json({
      ok: !truncated,
      ...(truncated ? { degraded: ['candidate_read_truncated'] } : {}),
      stage: kind,
      dry: true,
      cutoff,
      wouldChase: candidates.length,
      ...backlog,
      preview: candidates.slice(0, 3).map((c) => ({
        session: c.id,
        who: c.first_name,
        message: chaseMessage(kind, c, now),
      })),
    });
  }

  const deps: ChaseDeps = {
    patch: (path, body) => supabaseRest('PATCH', path, body),
    send: sendTelegramMessage,
    recordRouting,
  };

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let routingUnrecorded = 0;

  for (const c of candidates) {
    const result = await chaseOne(kind, c, now, deps);
    if (result.outcome === 'sent') sent++;
    else if (result.outcome === 'skipped') skipped++;
    else failed++;
    // The alert went but the lead has no record of where it was routed. Not a
    // send failure, and it must not be reported as a clean run either.
    if (result.routingRecorded === false) routingUnrecorded++;
  }

  // A run that could not do its whole job names the part it could not do, in
  // the field the cron log actually shows. `ok: true` with the detail buried in
  // a counter is the same silence AC8 exists to stop: a run where all 25 sends
  // failed must not answer the way a clean one does.
  const degraded = [
    ...(failed > 0 ? ['chase_send_failed'] : []),
    ...(routingUnrecorded > 0 ? ['routing_write_failed'] : []),
    ...(truncated ? ['candidate_read_truncated'] : []),
  ];

  return NextResponse.json({
    ok: degraded.length === 0,
    ...(degraded.length > 0 ? { degraded } : {}),
    stage: kind,
    cutoff,
    found: candidates.length,
    ...backlog,
    sent,
    // Another run held the stamp, or the session stopped being a candidate.
    // Expected under overlap, not an error.
    skipped,
    failed,
    ...(routingUnrecorded ? { routingUnrecorded } : {}),
  });
}
