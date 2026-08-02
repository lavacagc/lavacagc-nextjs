/**
 * Chase the intakes that went quiet (WEB-01B, plus the abandoned case).
 *
 * Two stages, selected by ?stage=. Kept in one route because they share the
 * whole mechanism and differ only in the candidate query and the wording.
 *
 *   ?stage=low_intent   never opened the link      (WEB-01B)
 *   ?stage=abandoned    opened it, did not finish
 *
 * ?dry=1 reports what it would do and sends nothing.
 *
 * The stamp is claimed BEFORE the send and released if the send fails, so a
 * crash between the two cannot silently swallow a lead, and a success cannot be
 * alerted twice.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { sendTelegramMessage } from '@/lib/notify/telegramMessage';
import { chaseMessage, type ChaseCandidate, type ChaseKind } from '@/lib/intake/chase';
import { lowIntentDecision } from '@/lib/intake/scoring';
import { recordRouting } from '@/lib/intake/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Long enough that a lead who is simply busy is not chased mid-afternoon. */
const LOW_INTENT_AFTER_HOURS = 6;
const ABANDONED_AFTER_HOURS = 4;

const STAMP: Record<ChaseKind, string> = {
  low_intent: 'low_intent_alert_at',
  abandoned: 'abandoned_alert_at',
};

const SELECT = 'id,lead_id,first_name,project_type,answers,created_at,opened_at';

function candidateQuery(kind: ChaseKind, cutoff: string): string {
  if (kind === 'low_intent') {
    return (
      `lead_intake_sessions?select=${SELECT}` +
      `&opened_at=is.null&low_intent_alert_at=is.null` +
      `&created_at=lt.${cutoff}&limit=25`
    );
  }
  return (
    `lead_intake_sessions?select=${SELECT}` +
    `&opened_at=not.is.null&completed_at=is.null&declined_at=is.null` +
    `&abandoned_alert_at=is.null&opened_at=lt.${cutoff}&limit=25`
  );
}

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
  try {
    const rows = await supabaseRest<ChaseCandidate[]>('GET', candidateQuery(kind, cutoff));
    if (!Array.isArray(rows)) throw new Error('unexpected response shape');
    candidates = rows;
  } catch (err) {
    console.error(`[intake-chase] could not read ${kind} candidates:`, err);
    return NextResponse.json(
      { ok: false, stage: kind, error: 'Could not read candidates - nothing was chased.' },
      { status: 503 },
    );
  }

  if (dry) {
    return NextResponse.json({
      ok: true,
      stage: kind,
      dry: true,
      cutoff,
      wouldChase: candidates.length,
      preview: candidates.slice(0, 3).map((c) => ({
        session: c.id,
        who: c.first_name,
        message: chaseMessage(kind, c, now),
      })),
    });
  }

  let sent = 0;
  let failed = 0;

  for (const c of candidates) {
    const stampedAt = new Date().toISOString();

    // Claim first. The `is.null` in the filter is what makes two overlapping
    // runs safe - the second one matches nothing and sends nothing.
    try {
      await supabaseRest(
        'PATCH',
        `lead_intake_sessions?id=eq.${c.id}&${STAMP[kind]}=is.null`,
        { [STAMP[kind]]: stampedAt },
        { prefer: 'return=minimal' },
      );
    } catch (err) {
      console.error(`[intake-chase] could not claim ${c.id}:`, err);
      failed++;
      continue;
    }

    const outcome = await sendTelegramMessage(chaseMessage(kind, c, now));

    if (outcome === 'sent') {
      sent++;
      // WEB-01B: non-engagement recorded as a signal on the lead, not inferred
      // later from an absence.
      if (kind === 'low_intent') {
        const d = lowIntentDecision();
        await recordRouting({
          leadId: c.lead_id,
          score: 0,
          bucket: d.bucket,
          signals: ['Never opened the intake link'],
          routedTo: d.routedTo,
          reason: d.reason,
        });
      }
    } else {
      failed++;
      // Release the claim so the next run retries. A stamp left behind on a
      // failed send is a lead nobody is ever told about.
      try {
        await supabaseRest(
          'PATCH',
          `lead_intake_sessions?id=eq.${c.id}`,
          { [STAMP[kind]]: null },
          { prefer: 'return=minimal' },
        );
      } catch (err) {
        console.error(`[intake-chase] could not release the claim on ${c.id}:`, err);
      }
    }
  }

  return NextResponse.json({ ok: true, stage: kind, cutoff, found: candidates.length, sent, failed });
}
