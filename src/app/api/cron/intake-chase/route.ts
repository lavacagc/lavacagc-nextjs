/**
 * Chase the intakes that went quiet (WEB-01B, plus the abandoned case).
 *
 * Two stages, selected by ?stage=. Kept in one route because they share the
 * whole mechanism and differ only in the candidate query and the wording.
 *
 *   ?stage=low_intent   never opened the link      (WEB-01B)
 *   ?stage=abandoned    opened it, went quiet
 *
 * Both stages run at 13:00, 16:00, 19:00 and 22:00 UTC - 9am, noon, 3pm and 6pm
 * Eastern in summer, an hour earlier in winter. Fixed UTC times with the hour of
 * DST drift accepted, the same convention the dispatch escalation crons use.
 *
 * Every three hours because the thresholds are 6h and 4h: checked once a day the
 * cron time, not the threshold, decides when the alert lands, and a lead who
 * went quiet at 2pm would be chased the following afternoon. Daytime only,
 * because these land in the owner's personal chat - a 3am chase is worse than a
 * late one, and a lead who goes quiet at 11pm is best chased in the morning
 * anyway. The elapsed hours in the message are computed from the timestamp, so
 * they stay true whenever the run lands.
 *
 * ?dry=1 reports what it would do and sends nothing.
 *
 * The stamp is claimed BEFORE the send and released if the send fails, so a
 * crash between the two cannot silently swallow a lead, and a success cannot be
 * alerted twice. `chaseOne` owns that sequence - see the note there on why the
 * claim has to prove it won the race rather than assume it.
 *
 * A candidate past `CHASE_MAX_AGE_HOURS` is claimed and NOT sent: the backlog a
 * sustained outage builds would otherwise arrive a page per run reporting hours
 * in the hundreds, and stale advice in the owner's chat is what teaches him to
 * stop reading it. Retirements are counted, logged and named in `degraded`,
 * because ending a lead's chase with nobody told is a decision, not a quiet run.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { sendTelegramMessage } from '@/lib/notify/telegramMessage';
import {
  chaseMessage, chaseOne, candidateQuery, chaseCutoff, isPastChasing, paginate,
  CHASE_MAX_AGE_HOURS,
  type ChaseCandidate, type ChaseDeps, type ChaseFailure, type ChaseKind, type ChaseResult,
} from '@/lib/intake/chase';
import { recordRouting } from '@/lib/intake/session';

/**
 * What each failure is called in the cron log. This is the one field Vercel
 * surfaces, so it names the fault: a run whose claims were all refused by an
 * unreachable Supabase must not send the reader to look at Telegram.
 */
const FAULT_LABEL: Record<ChaseFailure, string> = {
  claim: 'chase_claim_failed',
  send: 'chase_send_failed',
  not_configured: 'telegram_not_configured',
  unexpected: 'chase_threw',
};

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

  // Aged-out rows are claimed and dropped rather than sent, so counting them as
  // "would chase" would overstate what the run is about to do.
  const wouldRetire = candidates.filter((c) => isPastChasing(kind, c, now)).length;

  if (dry) {
    // The preview renders the same lead-supplied rows the live path does, and
    // the live path treats a row it cannot render as one failed candidate and
    // keeps going. Unguarded here, the one surface a malformed row would first
    // be noticed on is the one that answers a bare 500 naming no row at all.
    const previewFailures: string[] = [];
    const preview = candidates.slice(0, 3).map((c) => {
      try {
        return { session: c.id, who: c.first_name, message: chaseMessage(kind, c, now) };
      } catch (err) {
        console.error(`[intake-chase] could not render a preview for ${c.id}:`, err);
        previewFailures.push(c.id);
        return { session: c.id, who: c.first_name, error: 'could not be rendered' };
      }
    });

    const dryDegraded = [
      ...(previewFailures.length > 0 ? ['preview_render_failed'] : []),
      ...(truncated ? ['candidate_read_truncated'] : []),
    ];
    return NextResponse.json({
      ok: dryDegraded.length === 0,
      ...(dryDegraded.length > 0 ? { degraded: dryDegraded } : {}),
      stage: kind,
      dry: true,
      cutoff,
      wouldChase: candidates.length - wouldRetire,
      ...(wouldRetire ? { wouldRetire } : {}),
      ...backlog,
      preview,
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
  let retired = 0;
  let processed = 0;
  let routingUnrecorded = 0;
  const faults = new Set<string>();

  for (const c of candidates) {
    processed++;
    // One bad row must not take the run down with it. `chaseOne` already
    // releases its own claim on a throw; this is the backstop that keeps the
    // REST of the page from being left claimed and unsent by a failure nobody
    // has thought of yet.
    let result: ChaseResult;
    try {
      result = await chaseOne(kind, c, now, deps);
    } catch (err) {
      console.error(`[intake-chase] ${c.id} threw and was not chased:`, err);
      result = { outcome: 'failed', failure: 'unexpected', routingRecorded: null };
    }
    if (result.outcome === 'sent') sent++;
    else if (result.outcome === 'skipped') skipped++;
    else if (result.outcome === 'retired') retired++;
    else {
      failed++;
      faults.add(FAULT_LABEL[result.failure ?? 'unexpected']);
    }
    // The alert went but the lead has no record of where it was routed. Not a
    // send failure, and it must not be reported as a clean run either.
    if (result.routingRecorded === false) routingUnrecorded++;

    // Nothing can send without credentials, so working through the rest of the
    // page would claim and release 24 more rows to no purpose and report a
    // Telegram fault 25 times over. The stamps are already back, so every one
    // of them is still a candidate for the run after the config is fixed.
    if (result.failure === 'not_configured') {
      console.error('[intake-chase] Telegram is not configured - stopping the run');
      break;
    }
  }

  // A mass retirement must not pass for a quiet run. It is the one outcome here
  // that permanently ends a lead's chase without anybody being told.
  if (retired > 0) {
    console.warn(
      `[intake-chase] retired ${retired} ${kind} session(s) older than ` +
        `${CHASE_MAX_AGE_HOURS}h - stamped, not sent`,
    );
  }

  // A run that could not do its whole job names the part it could not do, in
  // the field the cron log actually shows. `ok: true` with the detail buried in
  // a counter is the same silence AC8 exists to stop: a run where all 25 sends
  // failed must not answer the way a clean one does - and a run where Supabase
  // refused every claim must not point the reader at Telegram.
  const unprocessed = candidates.length - processed;
  const degraded = [
    ...[...faults].sort(),
    ...(retired > 0 ? ['chase_retired_stale'] : []),
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
    // Past the age ceiling: stamped so they leave the queue, deliberately never
    // sent. Reported because nobody was told about these leads and nobody will
    // be, which is a decision the run has to show rather than absorb.
    ...(retired ? { retired } : {}),
    ...(unprocessed ? { unprocessed } : {}),
    ...(routingUnrecorded ? { routingUnrecorded } : {}),
  });
}
