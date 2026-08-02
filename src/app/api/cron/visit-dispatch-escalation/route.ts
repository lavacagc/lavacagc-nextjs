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
import { sendTelegramMessage } from '@/lib/notify/telegramMessage';
import {
  ensureVisitDispatch, liveAssignments, VISIT_DISPATCH_COLUMNS, DISPATCH_ASSIGNMENT_COLUMNS,
  type DispatchAssignment, type VisitDispatchRow,
} from '@/lib/homecare/dispatch';
import { escalationMessage } from '@/lib/homecare/dispatchAlerts';
import { readCustomerReminder } from '@/lib/homecare/serviceScheduling';
import {
  tomorrowEasternWindow, visitDateLabel, visitTimeWindow, visitEndsAt, visitKey,
  type ChaseStage,
} from '@/lib/homecare/visitSchedule';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_PER_RUN = 200;

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
  const stage: ChaseStage = q.get('stage') === 'escalate' ? 'escalate' : 'nudge';
  const stampColumn = stage === 'escalate' ? 'escalated_at' : 'nudged_at';

  const now = new Date();
  const { startUtc, endUtc } = tomorrowEasternWindow(now);

  try {
    // ONE ROW MORE than the cap, and ordered by the full visit key. The extra
    // row is what tells a genuinely-full page from a truncated one - reading
    // exactly MAX_PER_RUN cannot, so a day with exactly that many task rows
    // reported itself degraded having dropped nothing - and the second sort key
    // is what makes the boundary a whole visit rather than an arbitrary slice
    // of whichever visits share a start time.
    const page = (await supabaseRest<VisitRow[]>(
      'GET',
      `homeowner_maintenance?select=homeowner_id,task_key,scheduled_start,scheduled_end,service_address` +
        `&scheduled_start=gte.${startUtc.toISOString()}&scheduled_start=lt.${endUtc.toISOString()}` +
        `&order=scheduled_start.asc,homeowner_id.asc&limit=${MAX_PER_RUN + 1}`,
    )) ?? [];

    // The cap is on TASK rows, and a visit is one or more of them, so a full
    // page is "there may be more visits tomorrow than this run has seen" - and
    // the ones it has not seen are the ones nothing else will chase before the
    // 7:30pm customer reminder.
    const truncated = page.length > MAX_PER_RUN;
    // The last visit on a truncated page is the one whose remaining task rows
    // may be over the edge, and a HALF-READ visit is worse than an unread one:
    // its Telegram would list only the services that fit, and stamping it
    // claims the send-once ledger, so no re-hit can ever correct the message.
    // Dropped whole instead, and counted in `degraded` with the rest.
    const last = page[page.length - 1];
    const partial = truncated && last ? `${last.homeowner_id}|${last.scheduled_start}` : null;
    const visits = partial
      ? page.filter((v) => `${v.homeowner_id}|${v.scheduled_start}` !== partial)
      : page;
    if (truncated) {
      console.error(
        `visit-dispatch-escalation: read past the ${MAX_PER_RUN} task row cap for ${startUtc.toISOString()} - ` +
          'later visits in this window were NOT looked at and will not be chased, and the visit at the ' +
          'boundary was dropped rather than chased off a half-read window.',
      );
    }

    if (visits.length === 0) {
      return NextResponse.json({
        ok: !truncated,
        ...(truncated ? { degraded: ['visit_read_truncated'] } : {}),
        stage,
        window: { from: startUtc, to: endUtc },
        visits: 0,
        chased: 0,
        dryRun,
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
          `visit_dispatch_recipients?select=${DISPATCH_ASSIGNMENT_COLUMNS}` +
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
      // Only the people still ON the visit. Somebody un-ticked from a later
      // re-dispatch is retired, and counting their earlier confirmation would
      // silence both stages for a visit nobody going has answered.
      const mine = liveAssignments(dispatch ? assignmentsByDispatch.get(dispatch.id) ?? [] : []);

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

      // Pushed on the two paths that actually reach a send - the dry run that
      // is reporting one, and the claim below that won one - never
      // speculatively. Pushing here and unwinding with `.pop()` in each failure
      // path below worked only for as long as everybody remembered: one new
      // `continue` between the push and the send leaves a phantom entry in
      // `would_chase`, which is the number the admin reads as "visits chased".
      const chaseLabel = `${owner?.email ?? first.homeowner_id} ${label}`;
      if (dryRun) {
        wouldChase.push(chaseLabel);
        continue;
      }

      // No dispatch row at all: the visit was booked before this feature, or
      // its dispatch could not be recorded. That is MORE urgent, not less -
      // nobody was ever told - so it is chased, and needs a row to stamp.
      if (!dispatch) {
        dispatch = await ensureVisitDispatch({ homeownerId: first.homeowner_id, visitStart: start })
          .then((r) => r.row)
          .catch(() => null);
        if (!dispatch) {
          console.error(`visit-dispatch-escalation: no dispatch row to stamp for ${label}, skipping to avoid repeat sends`);
          failed.push(label);
          continue;
        }
      }

      // Claim BEFORE sending. The PATCH re-asserts that the stamp is still
      // null, so a concurrent run that got there first updates nothing and this
      // one skips - the difference between telling the owner once and telling
      // them twice.
      //
      // A claim that THREW is not a claim somebody else won. Both leave this
      // run with nothing to send, and folding them together answered `ok: true`
      // with the visit filed under `already_chased` - so a permission error or
      // a 5xx on this one PATCH silently dropped the visit from the last line
      // of defence before the 7:30pm customer reminder, and said nothing.
      const stampedAt = new Date().toISOString();
      const claimed = await supabaseRest<VisitDispatchRow[]>(
        'PATCH',
        `visit_dispatch?id=eq.${dispatch.id}&${stampColumn}=is.null`,
        { [stampColumn]: stampedAt, updated_at: stampedAt },
      ).then((rows) => rows ?? []).catch((err) => {
        console.error(
          `visit-dispatch-escalation: could not claim ${stampColumn} for ${label} - ` +
            'nobody has been told this visit is unconfirmed:',
          err instanceof Error ? err.message : String(err),
        );
        return null;
      });
      if (claimed === null) {
        failed.push(label);
        continue;
      }
      // Zero rows and no error IS the lost race: a concurrent run stamped it
      // first, so it has been chased and this one correctly stays quiet.
      if (claimed.length === 0) {
        alreadyChased += 1;
        continue;
      }
      wouldChase.push(chaseLabel);

      // Whether there is a 7:30pm to beat, read rather than assumed: a booking
      // too late for the covering run queued nothing, and this message's whole
      // urgency is the deadline it names. Read only for a visit being chased,
      // which is a handful a night rather than the whole window. No address to
      // find the row by is its own answer, like every other read here.
      const customerReminder = owner?.email
        ? await readCustomerReminder(owner.email, start, now)
        : 'unavailable' as const;

      // Built by the shared builder, not assembled here between a claim and a
      // send. Which of "nobody was ever told" and "the send could not be written
      // down" this message states is the most consequential branch in the
      // feature, and inline it could only ever be pinned by grepping this file.
      const text = escalationMessage({
        stage,
        customer: owner?.first_name || owner?.email || 'a customer',
        label,
        address: first.service_address ?? '',
        services: rows.map((r) => titleFor.get(r.task_key) ?? r.task_key),
        phone: owner?.phone ?? null,
        dispatched: Boolean(dispatch.dispatched_at),
        sentTo: mine.map((a) => a.name || a.email),
        flags: mine
          .filter((a) => a.status === 'flagged')
          .map((a) => ({ by: a.name || a.email, note: a.note })),
        customerReminder,
      });

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

    // A run that could not do its whole job says which part it could not do,
    // rather than leaving a console line in a cron nobody watches. A stage that
    // told nobody is one; a read that hit its own ceiling is the other - the
    // limit counts TASK rows, so a busy day's last visits are simply not in the
    // list (plus the boundary visit, dropped rather than chased off a half-read
    // window), and reporting a clean `visits:` count for a truncated read is
    // the same silence, one step earlier.
    const degraded = [
      ...(failed.length > 0 ? ['escalation_send_failed'] : []),
      ...(truncated ? ['visit_read_truncated'] : []),
    ];

    return NextResponse.json({
      ok: degraded.length === 0,
      ...(degraded.length > 0 ? { degraded } : {}),
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
