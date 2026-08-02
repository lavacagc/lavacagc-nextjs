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
  chaseMessage, chaseOne, candidateQuery, paginate,
  type ChaseCandidate, type ChaseDeps, type ChaseKind,
} from '@/lib/intake/chase';
import { recordRouting } from '@/lib/intake/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Long enough that a lead who is simply busy is not chased mid-afternoon. */
const LOW_INTENT_AFTER_HOURS = 6;
/** Measured from the last answer, not from the open. See `candidateQuery`. */
const ABANDONED_AFTER_HOURS = 4;

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
  const hours = kind === 'low_intent' ? LOW_INTENT_AFTER_HOURS : ABANDONED_AFTER_HOURS;
  const cutoff = new Date(now.getTime() - hours * 3_600_000).toISOString();

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
      ok: true,
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

  return NextResponse.json({
    ok: true,
    stage: kind,
    cutoff,
    found: candidates.length,
    ...backlog,
    sent,
    // Another run held the stamp. Expected under overlap, not an error.
    skipped,
    failed,
    ...(routingUnrecorded ? { routingUnrecorded } : {}),
  });
}
