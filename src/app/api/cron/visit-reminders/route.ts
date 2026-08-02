/**
 * La Vaca Home Care - night-before visit reminders.
 *
 * Runs at `30 23 * * *` UTC: 7:30pm Eastern in summer, 6:30pm in winter. The
 * owner chose one fixed UTC time and accepted that hour of drift rather than
 * carry DST logic.
 *
 * 23:30 UTC is deliberate. It is still the SAME calendar date in Eastern, so
 * "visits scheduled for tomorrow" resolves correctly. An hour later (00:30 UTC)
 * would already be the next UTC day while Eastern is still today, and the query
 * would silently skip a day - and nobody notices a reminder that never sent.
 *
 * Separate from `send-follow-ups` (09:00 UTC = 4am Eastern) precisely because
 * that time is fine for a nurture email nobody times and useless for "we're
 * coming today". That cron skips this type outright
 * (DEDICATED_SENDER_FOLLOW_UP_TYPES), so this route is the only sender.
 *
 * SEND-ONCE: the visit's `follow_up_queue` row is the ledger, found by
 * (lead_email, visit_start) so two visits on one day keep separate ledgers. It
 * is CLAIMED (pending -> sent) before the send, so a Vercel cron retry, a manual
 * GET or a concurrent run finds nothing left to claim instead of mailing the
 * batch twice.
 *
 * A send that does not complete releases its claim, and the run answers
 * `ok:false`. The release is NOT a retry: every run covers exactly one Eastern
 * day, so tomorrow's run looks at tomorrow's visits and this row is outside its
 * window and every later one. It only reopens the row to a manual re-hit before
 * Eastern midnight - which is why the failure is logged per recipient and the
 * response says the run failed, rather than being quietly deferred to a run that
 * will never come.
 *
 *   ?dryRun=1 - report who would be reminded, send nothing, claim nothing.
 *
 * Auth: Bearer CRON_SECRET (also enforced by middleware on /api/cron/*).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { sendTrackedEmail } from '@/lib/notify/sendEmail';
import { HOME_CARE_FROM } from '@/lib/notify/sendHomeCareEmails';
import { buildVisitReminderEmail, SERVICE_REPLY_TO } from '@/lib/homecare/serviceEmails';
import {
  tomorrowEasternWindow, visitDateLabel, visitTimeWindow, visitKey, visitEndsAt, reminderSendAt,
  ledgerKey, ledgerVerdict, VISIT_REMINDER_TYPE, type ReminderLedgerRow,
} from '@/lib/homecare/visitSchedule';
import { preferencesUrlFor } from '@/lib/preferences/preferences';
import { cleanEnv } from '@/lib/envClean';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const SITE_URL = cleanEnv(process.env.NEXT_PUBLIC_SITE_URL) || 'https://www.lavacagc.com';
const MAX_PER_RUN = 200;

interface VisitRow {
  id: string;
  homeowner_id: string;
  task_key: string;
  status: string;
  scheduled_start: string;
  scheduled_end: string | null;
  service_address: string | null;
}

interface OwnerRow {
  id: string;
  email: string;
  first_name: string | null;
  unsubscribe_token: string;
  address: string | null;
}

/** A visit's reminder row in follow_up_queue - the send-once ledger. */
interface LedgerRow extends ReminderLedgerRow {
  lead_email: string;
  visit_start: string | null;
}

export async function GET(request: NextRequest) {
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
  const now = new Date();
  const { startUtc, endUtc } = tomorrowEasternWindow(now);

  try {
    // A visit is a row carrying a WINDOW, not one whose status reads 'booked'.
    // `status` is shared with the member's own checkbox: a member who sees the
    // visit card and ticks "Clean gutters" to acknowledge it writes 'done' onto
    // the very row the booking lives on. Filtered on status, this query would
    // then skip a visit that is still happening - no reminder, for a job the
    // owner's calendar still holds. Cancelling and completing both clear the
    // window, which is what actually takes a visit off the books.
    const visits = (await supabaseRest<VisitRow[]>(
      'GET',
      `homeowner_maintenance?select=id,homeowner_id,task_key,status,scheduled_start,scheduled_end,service_address` +
        `&scheduled_start=gte.${startUtc.toISOString()}&scheduled_start=lt.${endUtc.toISOString()}` +
        `&order=scheduled_start.asc&limit=${MAX_PER_RUN}`,
    )) ?? [];

    if (visits.length === 0) {
      return NextResponse.json({ ok: true, window: { from: startUtc, to: endUtc }, visits: 0, sent: 0, dryRun });
    }

    // One visit per homeowner+window, even when several tasks share it -
    // a customer with three booked tasks gets ONE email listing all three.
    const byOwner = new Map<string, VisitRow[]>();
    for (const v of visits) {
      const key = `${v.homeowner_id}|${v.scheduled_start}`;
      if (!byOwner.has(key)) byOwner.set(key, []);
      byOwner.get(key)!.push(v);
    }

    const ownerIds = [...new Set(visits.map((v) => v.homeowner_id))];
    const owners = (await supabaseRest<OwnerRow[]>(
      'GET',
      `homeowners?select=id,email,first_name,unsubscribe_token,address&id=in.(${ownerIds.join(',')})`,
    )) ?? [];
    const ownerById = new Map(owners.map((o) => [o.id, o]));

    // Titles for the services being performed.
    const keys = [...new Set(visits.map((v) => v.task_key))];
    const catalog = (await supabaseRest<{ key: string; title: string }[]>(
      'GET',
      `maintenance_catalog?select=key,title&key=in.(${keys.map((k) => `"${k}"`).join(',')})`,
    )) ?? [];
    const titleFor = new Map(catalog.map((c) => [c.key, c.title]));

    // The ledger for every visit in this window - one read over the same
    // Eastern day the visits themselves were selected for.
    //
    // `visit_start` is hand-applied (20260817), as every migration in this repo
    // is. Without it PostgREST 400s and there is no send-once ledger at all - so
    // this run sends NOTHING rather than mailing a batch it could not guard,
    // and says so out loud instead of 500ing where a cron failure is silent.
    let ledger: LedgerRow[];
    try {
      ledger = (await supabaseRest<LedgerRow[]>(
        'GET',
        `follow_up_queue?select=id,lead_email,visit_start,status,created_at&follow_up_type=eq.${VISIT_REMINDER_TYPE}` +
          `&visit_start=gte.${startUtc.toISOString()}&visit_start=lt.${endUtc.toISOString()}`,
      )) ?? [];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('visit-reminders: no send-once ledger, sending nothing:', message);
      return NextResponse.json({
        ok: false,
        degraded: 'reminder_ledger_unavailable',
        error: message,
        window: { from: startUtc, to: endUtc },
        visits: visits.length,
        sent: 0,
        dryRun,
      });
    }
    const ledgerBy = new Map<string, LedgerRow[]>();
    for (const row of ledger) {
      if (!row.visit_start) continue;
      const key = ledgerKey(row.lead_email, row.visit_start);
      const bucket = ledgerBy.get(key);
      if (bucket) bucket.push(row); else ledgerBy.set(key, [row]);
    }

    let sent = 0;
    let alreadySent = 0;
    const skipped: string[] = [];
    /** Recipients whose send did not complete - the run reports itself failed. */
    const failed: string[] = [];
    const wouldSend: string[] = [];

    for (const [, rows] of byOwner) {
      const owner = ownerById.get(rows[0].homeowner_id);
      if (!owner?.email) { skipped.push(rows[0].homeowner_id); continue; }

      const start = new Date(rows[0].scheduled_start);
      const end = new Date(visitEndsAt(rows[0].scheduled_start, rows[0].scheduled_end));
      const services = rows.map((r) => titleFor.get(r.task_key) ?? r.task_key);
      const address = rows[0].service_address ?? owner.address ?? '';

      // Anything not still open (already sent, or deliberately cancelled when
      // the visit moved) is done with. This is what makes a retry a no-op.
      const visitStart = visitKey(start);
      const { claim: existing, closed } = ledgerVerdict(ledgerBy.get(ledgerKey(owner.email, visitStart)));
      if (closed) {
        alreadySent += 1;
        continue;
      }

      wouldSend.push(owner.email);
      if (dryRun) continue;

      const preferencesUrl = await preferencesUrlFor(SITE_URL, owner.email).catch(() => undefined);
      const { subject, html, text } = buildVisitReminderEmail({
        recipientName: owner.first_name || owner.email,
        services,
        address,
        timeWindow: visitTimeWindow(start, end),
        visitDateLabel: visitDateLabel(start),
        portalUrl: `${SITE_URL}/home-care/checklist`,
        unsubscribeUrl: `${SITE_URL}/api/home-care/unsubscribe?token=${encodeURIComponent(owner.unsubscribe_token)}`,
        preferencesUrl,
      });

      // Claim BEFORE sending. The PATCH re-asserts the open statuses, so if a
      // concurrent run got there first it updates nothing and we skip - the
      // difference between "send twice" and "send once" on a cron retry.
      const claimedAt = new Date().toISOString();
      let claimId: string | null = null;
      if (existing) {
        const claimed = await supabaseRest<LedgerRow[]>(
          'PATCH',
          `follow_up_queue?id=eq.${existing.id}&status=in.(pending,failed)`,
          { status: 'sent', sent_at: claimedAt },
        ).catch(() => [] as LedgerRow[]);
        if (!claimed || claimed.length === 0) { alreadySent += 1; wouldSend.pop(); continue; }
        claimId = existing.id;
      } else {
        // No row: the visit was booked before the ledger existed, or its queue
        // insert failed. Write the ledger entry so this send is still recorded
        // once and a retry finds it.
        const created = await supabaseRest<LedgerRow[]>('POST', 'follow_up_queue', [{
          lead_email: owner.email,
          lead_name: owner.first_name || owner.email,
          follow_up_type: VISIT_REMINDER_TYPE,
          scheduled_at: reminderSendAt(start).toISOString(),
          visit_start: visitStart,
          status: 'sent',
          sent_at: claimedAt,
          email_subject: subject,
          email_body: html,
        }]).catch(() => [] as LedgerRow[]);
        claimId = created?.[0]?.id ?? null;
        // No ledger row, no send. An unrecorded send is one that every retry and
        // every manual re-hit repeats, because nothing tells them it happened -
        // the failure this whole ledger exists to prevent. Fails closed like the
        // unavailable-ledger branch above and like ledgerVerdict.
        if (!claimId) {
          console.error('visit-reminders: could not record the send-once ledger row, skipping', owner.email);
          skipped.push(owner.email);
          wouldSend.pop();
          continue;
        }
      }

      const res = await sendTrackedEmail({
        from: HOME_CARE_FROM,
        to: owner.email,
        replyTo: SERVICE_REPLY_TO,
        subject,
        html,
        text,
        category: 'visit_reminder',
        toName: owner.first_name ?? null,
        homeownerId: owner.id,
        campaign: { follow_up_type: VISIT_REMINDER_TYPE },
      });
      if (res.status === 'sent') {
        sent += 1;
      } else {
        // Nothing here is a decision about the recipient, so every outcome is a
        // fault. This send passes no `preferenceStream` and no `knownSuppressed`
        // - a night-before reminder for a visit the customer booked is
        // transactional and must not be droppable by a marketing opt-out - and
        // those are the only two routes to `sendTrackedEmail`'s 'unsubscribed'.
        // A branch narrowing on that reason here would read as an opt-out being
        // honoured somewhere in this route, which is protection that does not
        // exist. `no_api_key` comes back as 'skipped' too, and held as final it
        // closed the ledger for every visit that night.
        failed.push(owner.email);
        console.error(
          `visit-reminders: send FAILED for ${owner.email} - ${visitDateLabel(start)} ` +
            `${visitTimeWindow(start, end)} (visit ${visitStart}): ${res.status}` +
            `${res.reason ? ` (${res.reason})` : ''}${res.error ? ` - ${res.error}` : ''}. ` +
            'No later run covers this visit; re-run the cron before Eastern midnight or text the customer.',
        );
        // Released so a re-hit tonight can still take the row - `ledgerVerdict`
        // counts 'failed' as open. It is not a deferral: the window moves on
        // with the calendar, so no scheduled run ever looks at this visit again.
        if (claimId) {
          await supabaseRest('PATCH', `follow_up_queue?id=eq.${claimId}`, { status: 'failed', sent_at: null })
            .catch((err) => {
              // Now the claim stands as 'sent' on a reminder nobody received,
              // and even the manual re-hit finds nothing to take.
              console.error(
                `visit-reminders: could not release the claim for ${owner.email} - the ledger now reads sent ` +
                  'for a reminder that was never delivered:',
                err instanceof Error ? err.message : err,
              );
            });
        }
      }
    }

    // A run that could not tell someone about tomorrow's visit is a failed run,
    // and it has to say so. Nothing revisits these: the released claims are
    // outside every later run's window, and the only trace otherwise would be a
    // console line in a cron nobody watches - which is the same silence the
    // unavailable-ledger branch answers `ok:false` to avoid. Counts only in the
    // body; the addresses are in the log.
    return NextResponse.json({
      ok: failed.length === 0,
      ...(failed.length > 0 ? { degraded: 'reminder_send_failed' } : {}),
      window: { from: startUtc, to: endUtc },
      visits: visits.length,
      recipients: byOwner.size,
      would_send: wouldSend.length,
      sent,
      already_sent: alreadySent,
      skipped: skipped.length,
      failed: failed.length,
      dryRun,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('visit-reminders failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
