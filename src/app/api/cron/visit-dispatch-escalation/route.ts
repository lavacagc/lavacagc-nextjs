/**
 * La Vaca Home Care - nobody confirmed tomorrow's visit.
 *
 * Two stages, both to the operations Telegram chat:
 *
 *   ?stage=nudge     21:00 UTC - 5pm Eastern in summer, 4pm in winter
 *   ?stage=escalate  22:00 UTC - 6pm Eastern in summer, 5pm in winter
 *
 * One fixed UTC time each, with the hour of DST drift accepted - the same
 * decision the owner made for the 7:30pm reminder, so the two stay consistent
 * rather than the schedule carrying two different conventions. What matters is
 * the ORDER, and it holds in both seasons: both stages always land before the
 * 23:30 UTC customer reminder, which is the deadline that gives them their
 * purpose. By 7:30pm the customer has been told we are coming; after that,
 * finding out nobody confirmed is too late to do anything about quietly.
 *
 * Driven off `homeowner_maintenance`, exactly as the reminder cron is, NOT off
 * `visit_dispatch`. A visit that was cancelled or closed out has had its window
 * cleared, so it is structurally excluded from this query rather than by a rule
 * somebody has to remember - and chasing a confirmation for a visit that is off
 * is the one message guaranteed to teach the reader to ignore these.
 *
 * SEND-ONCE: `nudged_at` / `escalated_at` on the visit's dispatch row are the
 * ledger, stamped BEFORE the send so a Vercel retry or a manual re-hit finds
 * nothing left to claim. A send that fails releases its stamp so a re-hit can
 * still get through.
 *
 *   ?dryRun=1 - report who would be chased, send nothing, stamp nothing.
 *
 * Auth: Bearer CRON_SECRET (also enforced by middleware on /api/cron/*).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { sendTelegramMessage, escapeTelegram } from '@/lib/notify/telegramMessage';
import {
  ensureVisitDispatch, VISIT_DISPATCH_COLUMNS,
  type DispatchAssignment, type VisitDispatchRow,
} from '@/lib/homecare/dispatch';
import {
  tomorrowEasternWindow, visitDateLabel, visitTimeWindow, visitEndsAt, visitKey,
} from '@/lib/homecare/visitSchedule';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_PER_RUN = 200;

type Stage = 'nudge' | 'escalate';

interface VisitRow {
  homeowner_id: string;
  task_key: string;
  scheduled_start: string;
  scheduled_end: string | null;
  service_address: string | null;
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const dryRun = q.get('dryRun') === '1';
  const stage: Stage = q.get('stage') === 'escalate' ? 'escalate' : 'nudge';
  const stampColumn = stage === 'escalate' ? 'escalated_at' : 'nudged_at';

  const now = new Date();
  const { startUtc, endUtc } = tomorrowEasternWindow(now);

  try {
    const visits = (await supabaseRest<VisitRow[]>(
      'GET',
      `homeowner_maintenance?select=homeowner_id,task_key,scheduled_start,scheduled_end,service_address` +
        `&scheduled_start=gte.${startUtc.toISOString()}&scheduled_start=lt.${endUtc.toISOString()}` +
        `&order=scheduled_start.asc&limit=${MAX_PER_RUN}`,
    )) ?? [];

    if (visits.length === 0) {
      return NextResponse.json({
        ok: true, stage, window: { from: startUtc, to: endUtc }, visits: 0, chased: 0, dryRun,
      });
    }

    // One visit per homeowner+window, however many tasks share it - the same
    // grouping the reminder cron uses, so "a visit" means the same thing in both.
    const byVisit = new Map<string, VisitRow[]>();
    for (const v of visits) {
      const key = `${v.homeowner_id}|${v.scheduled_start}`;
      const bucket = byVisit.get(key);
      if (bucket) bucket.push(v); else byVisit.set(key, [v]);
    }

    const ownerIds = [...new Set(visits.map((v) => v.homeowner_id))];
    const owners = (await supabaseRest<{ id: string; first_name: string | null; email: string; phone: string | null }[]>(
      'GET', `homeowners?select=id,first_name,email,phone&id=in.(${ownerIds.join(',')})`,
    )) ?? [];
    const ownerById = new Map(owners.map((o) => [o.id, o]));

    const keys = [...new Set(visits.map((v) => v.task_key))];
    const catalog = (await supabaseRest<{ key: string; title: string }[]>(
      'GET', `maintenance_catalog?select=key,title&key=in.(${keys.map((k) => `"${k}"`).join(',')})`,
    )) ?? [];
    const titleFor = new Map(catalog.map((c) => [c.key, c.title]));

    // Every dispatch row covering this window, in one read.
    const dispatches = (await supabaseRest<VisitDispatchRow[]>(
      'GET',
      `visit_dispatch?select=${VISIT_DISPATCH_COLUMNS}` +
        `&visit_start=gte.${startUtc.toISOString()}&visit_start=lt.${endUtc.toISOString()}`,
    )) ?? [];
    const dispatchByVisit = new Map(dispatches.map((d) => [`${d.homeowner_id}|${visitKey(new Date(d.visit_start))}`, d]));

    const assignments = dispatches.length > 0
      ? (await supabaseRest<DispatchAssignment[]>(
          'GET',
          `visit_dispatch_recipients?select=id,dispatch_id,recipient_id,email,name,confirm_token,status,confirmed_at,note` +
            `&dispatch_id=in.(${dispatches.map((d) => d.id).join(',')})`,
        )) ?? []
      : [];
    const assignmentsByDispatch = new Map<string, DispatchAssignment[]>();
    for (const a of assignments) {
      const bucket = assignmentsByDispatch.get(a.dispatch_id);
      if (bucket) bucket.push(a); else assignmentsByDispatch.set(a.dispatch_id, [a]);
    }

    let chased = 0;
    let confirmed = 0;
    let alreadyChased = 0;
    const failed: string[] = [];
    const wouldChase: string[] = [];

    for (const [, rows] of byVisit) {
      const first = rows[0];
      const owner = ownerById.get(first.homeowner_id);
      const start = new Date(first.scheduled_start);
      const end = new Date(visitEndsAt(first.scheduled_start, first.scheduled_end));
      const label = `${visitDateLabel(start)} ${visitTimeWindow(start, end)}`;

      let dispatch = dispatchByVisit.get(`${first.homeowner_id}|${visitKey(start)}`) ?? null;
      const mine = dispatch ? assignmentsByDispatch.get(dispatch.id) ?? [] : [];

      // ONLY a confirmation stops the chase. A flag is the opposite of an
      // all-clear: somebody said this visit has a problem, and the customer is
      // still told at 7:30pm that we are coming. The flag itself already
      // Telegrams the office the moment it is tapped (see /api/crew/confirm),
      // and these two stages carry the note along so the visit stays in front of
      // the owner until it is either fixed and confirmed or called off.
      if (mine.some((a) => a.status === 'confirmed')) {
        confirmed += 1;
        continue;
      }

      // Already chased at this stage - a retry, or a second cron firing.
      if (dispatch && dispatch[stampColumn]) {
        alreadyChased += 1;
        continue;
      }

      wouldChase.push(`${owner?.email ?? first.homeowner_id} ${label}`);
      if (dryRun) continue;

      // No dispatch row at all: the visit was booked before this feature, or
      // its dispatch could not be recorded. That is MORE urgent, not less -
      // nobody was ever told - so it is chased, and needs a row to stamp.
      if (!dispatch) {
        dispatch = await ensureVisitDispatch({ homeownerId: first.homeowner_id, visitStart: start })
          .catch(() => null);
        if (!dispatch) {
          console.error(`visit-dispatch-escalation: no dispatch row to stamp for ${label}, skipping to avoid repeat sends`);
          failed.push(label);
          wouldChase.pop();
          continue;
        }
      }

      // Claim BEFORE sending. The PATCH re-asserts that the stamp is still
      // null, so a concurrent run that got there first updates nothing and this
      // one skips - the difference between telling the owner once and telling
      // them twice.
      const stampedAt = new Date().toISOString();
      const claimed = await supabaseRest<VisitDispatchRow[]>(
        'PATCH',
        `visit_dispatch?id=eq.${dispatch.id}&${stampColumn}=is.null`,
        { [stampColumn]: stampedAt, updated_at: stampedAt },
      ).catch(() => [] as VisitDispatchRow[]);
      if (!claimed || claimed.length === 0) {
        alreadyChased += 1;
        wouldChase.pop();
        continue;
      }

      const services = rows.map((r) => titleFor.get(r.task_key) ?? r.task_key);
      const address = first.service_address ?? '';
      const customer = owner?.first_name || owner?.email || 'a customer';
      const neverDispatched = !dispatch.dispatched_at;
      const sentTo = mine.map((a) => a.name || a.email).join(', ');
      // Carried into the message rather than left as a status: "somebody said
      // something is wrong" and "the sub cancelled" call for different moves,
      // and only one of them is written down anywhere.
      const flagged = mine.filter((a) => a.status === 'flagged');
      const flagLines = flagged.map((a) =>
        `⚠️ <b>${escapeTelegram(a.name || a.email)} flagged a problem</b>` +
        `${a.note ? `: ${escapeTelegram(a.note)}` : ' (no note).'}`);

      const text = [
        stage === 'escalate'
          ? '🔴 <b>Still unconfirmed</b>'
          : '🟠 <b>Nobody has confirmed tomorrow\'s visit</b>',
        '',
        `<b>${escapeTelegram(customer)}</b> - ${escapeTelegram(label)}`,
        address ? `📍 ${escapeTelegram(address)}` : '',
        `🧰 ${escapeTelegram(services.join(', '))}`,
        owner?.phone ? `📱 <code>${escapeTelegram(owner.phone)}</code>` : '',
        '',
        neverDispatched
          ? '⚠️ <b>No dispatch was ever sent for this visit</b> - nobody has been told to go.'
          : flagLines.length > 0
            ? flagLines.join('\n')
            : `Sent to ${escapeTelegram(sentTo || 'the crew')}, no answer yet.`,
        stage === 'escalate'
          ? 'The customer is told we are coming at 7:30pm - about 90 minutes from now.'
          : 'The customer is told we are coming at 7:30pm tonight.',
      ].filter(Boolean).join('\n');

      const outcome = await sendTelegramMessage(text);
      if (outcome === 'sent') {
        chased += 1;
      } else {
        failed.push(label);
        console.error(
          `visit-dispatch-escalation: ${stage} could not be delivered for ${label} (${outcome}). ` +
            'Nobody has been told this visit is unconfirmed.',
        );
        // Released so a re-hit before the customer reminder can still get
        // through. Not a deferral: the window moves with the calendar, so no
        // scheduled run ever looks at this visit again.
        await supabaseRest('PATCH', `visit_dispatch?id=eq.${dispatch.id}`, { [stampColumn]: null })
          .catch((err) => console.error(
            `visit-dispatch-escalation: could not release the ${stampColumn} claim for ${label} - ` +
              'it now reads as chased when nobody was told:',
            err instanceof Error ? err.message : err,
          ));
      }
    }

    return NextResponse.json({
      // A stage that could not tell anyone is a failed run and says so, rather
      // than leaving a console line in a cron nobody watches.
      ok: failed.length === 0,
      ...(failed.length > 0 ? { degraded: 'escalation_send_failed' } : {}),
      stage,
      window: { from: startUtc, to: endUtc },
      visits: byVisit.size,
      would_chase: wouldChase.length,
      chased,
      confirmed,
      already_chased: alreadyChased,
      failed: failed.length,
      dryRun,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('visit-dispatch-escalation failed:', message);
    return NextResponse.json({ ok: false, stage, error: message }, { status: 500 });
  }
}
