import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Wiring acceptance criteria for Home Care service quotes - the parts that
 * live in routes, pages and the migration rather than in a pure function.
 * IDs match docs/service-quotes-acceptance-criteria.md.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const migration = read('supabase/migrations/20260815000000_home_care_service_quotes.sql');
const typeMigration = read('supabase/migrations/20260816000000_visit_reminder_follow_up_type.sql');
const visitMigration = read('supabase/migrations/20260817000000_follow_up_queue_visit_start.sql');
const sharedCron = read('src/app/api/cron/send-follow-ups/route.ts');
const sendRoute = read('src/app/api/admin/service-quote/send/route.ts');
const scheduleRoute = read('src/app/api/admin/service-quote/schedule/route.ts');
const completeRoute = read('src/app/api/admin/service-quote/complete/route.ts');
const intakeRoute = read('src/app/api/admin/service-quote/intake/route.ts');
const cron = read('src/app/api/cron/visit-reminders/route.ts');
const scheduling = read('src/lib/homecare/serviceScheduling.ts');
const schema = read('src/app/api/admin/service-quote/_schema.ts');
const portal = read('src/app/home-care/checklist/page.tsx');
const visitCard = read('src/components/homecare/UpcomingVisitCard.tsx');
const customerIcs = read('src/app/api/home-care/visit.ics/route.ts');
const adminPage = read('src/app/vaca-mgmt/send-service-quote/page.tsx');
const newsletterCron = read('src/app/api/cron/home-care-newsletter/route.ts');

test('every route and page exists', () => {
  for (const p of [
    'src/app/api/admin/service-quote/send/route.ts',
    'src/app/api/admin/service-quote/schedule/route.ts',
    'src/app/api/admin/service-quote/complete/route.ts',
    'src/app/api/admin/service-quote/intake/route.ts',
    'src/app/api/cron/visit-reminders/route.ts',
    'src/app/api/home-care/visit.ics/route.ts',
    'src/app/vaca-mgmt/send-service-quote/page.tsx',
    'src/components/homecare/UpcomingVisitCard.tsx',
    'docs/service-quotes-acceptance-criteria.md',
  ]) {
    expect(existsSync(join(process.cwd(), p)), p).toBe(true);
  }
});

test('migration is additive and idempotent - no existing column is narrowed', () => {
  expect(migration).toContain('ADD COLUMN IF NOT EXISTS scheduled_start');
  expect(migration).toContain('ADD COLUMN IF NOT EXISTS completed_by TEXT NOT NULL DEFAULT \'homeowner\'');
  expect(migration).toContain("CHECK (completed_by IN ('homeowner', 'lavaca'))");
  expect(migration).toContain("ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'project'");
  // estimate_url stays NOT NULL - QuickBooks is still in the loop.
  expect(migration).not.toMatch(/estimate_url[\s\S]*DROP NOT NULL/);
  expect(migration).not.toContain('DROP COLUMN');
});

/* ── SC: scheduling ──────────────────────────────────────────────────────── */

test('SC1+SC2: scheduling upserts a homeowner as pending + service_quote', () => {
  expect(scheduling).toContain("status: 'pending'");
  expect(scheduling).toContain("source: 'service_quote'");
  // Reuse, never duplicate: an existing row is looked up by email first.
  expect(scheduling).toContain('homeowners?select=id,email,first_name,phone,status,source');
});

test('SC3: a scheduled non-member is structurally excluded from the newsletter', () => {
  // The guard is a property of the cron query, not a rule to remember.
  expect(newsletterCron).toContain('status=eq.active');
  // ...and scheduling must never flip an existing member's status.
  expect(scheduling).toContain("never touch `status`");
  const patchBlock = scheduling.slice(scheduling.indexOf('const patch'), scheduling.indexOf('if (Object.keys(patch)'));
  expect(patchBlock).not.toContain('status');
});

test('SC4: scheduling writes the window and marks the tasks booked', () => {
  expect(scheduling).toContain("status: 'booked'");
  expect(scheduling).toContain('scheduled_start:');
  expect(scheduling).toContain('scheduled_end:');
  expect(scheduling).toContain('service_address:');
});

test('SC5: scheduling sends no verification email', () => {
  expect(scheduling).not.toContain('sendHomeCareVerificationEmail');
  expect(scheduleRoute).not.toContain('sendHomeCareVerificationEmail');
});

test('SC6: rescheduling updates in place rather than duplicating', () => {
  expect(scheduling).toContain("onConflict: 'homeowner_id,task_key,season'");
});

/* ── RM: reminders ───────────────────────────────────────────────────────── */

test('RM1+RM4+RM5: a reminder is queued, and cancelled before any requeue', () => {
  expect(scheduling).toContain('requeueVisitReminder');
  // Cancel-then-queue, in that order: a reminder for a moved visit is worse
  // than none.
  const fn = scheduling.slice(scheduling.indexOf('export async function requeueVisitReminder'));
  expect(fn.indexOf('await cancelPendingVisitReminders')).toBeLessThan(fn.indexOf("'follow_up_queue'"));
  expect(scheduling).toContain('export async function cancelVisitReminder');
  expect(scheduleRoute).toContain('cancelVisitReminder'); // DELETE path
});

test('RM4+RM5+RM11: cancels are scoped to the visit, not the address or the day', () => {
  // visit_start is what names one visit. Keying on the 7:30pm send slot made
  // two visits on one date share a row, so every cancel filters on the visit.
  expect(scheduling).toContain('visit_start=in.');
  expect(scheduling).toContain('visit_start: visitKey(start)');
  expect(scheduling).not.toContain('scheduled_at=eq.');
  expect(scheduling).toContain('export async function bookedVisitRows');
  // The route reads the windows it is about to overwrite and supersedes those.
  expect(scheduleRoute).toContain('bookedVisitRows');
  expect(scheduleRoute).toContain('supersedes');
  // Completing names the visits it completed rather than the customer.
  expect(completeRoute).toContain('completedVisitStarts');
  expect(completeRoute).toContain('cancelVisitReminder(owner.email, new Date(iso))');
});

test('RM5: a cancel matches the address exactly, and DELETE validates it', () => {
  // PostgREST reads `*` as an alias for `%` and gives no way to escape it, so
  // an ilike prefilter is narrowed by a JS equality check before anything is
  // patched - the same guard cancelPendingFollowUps documents.
  expect(scheduling).toContain("from '@/lib/notify/cancelFollowUps'");
  expect(scheduling).toContain('escapeLikePattern');
  expect(scheduling).not.toContain('function escapeLike('); // no second private copy
  const fn = scheduling.slice(scheduling.indexOf('async function cancelPendingVisitReminders'));
  expect(fn.indexOf('.trim().toLowerCase() === wanted'), 'exact match before the patch')
    .toBeLessThan(fn.indexOf("'PATCH'"));
  // The DELETE params go through zod, so `?email=*` never reaches the cancel.
  expect(scheduleRoute).toContain('cancelVisitSchema.safeParse');
  expect(schema).toContain('export const cancelVisitSchema');
  expect(schema).toContain("email: z.string().trim().email('Valid customer email required')");
});

test('RM8: the queue row is the ledger, claimed BEFORE the send', () => {
  // Claiming after the send would leave a crashed run's batch re-sendable.
  const claim = cron.indexOf('status=in.(pending,failed)');
  const send = cron.indexOf('await sendTrackedEmail');
  expect(claim, 'the cron must claim the ledger row').toBeGreaterThan(-1);
  expect(claim).toBeLessThan(send);
  // Dead intent removed: there is no reminder_sent_at column anywhere.
  expect(cron).not.toContain('reminder_sent_at');
  expect(migration).not.toContain('reminder_sent_at');
});

test('RM8: the cron reads its verdict from every row a visit holds', () => {
  // A visit can hold several rows and Postgres returns them in no defined
  // order, so the cron collects them all and hands the set to ledgerVerdict
  // (unit-tested in service-quotes.spec.ts) rather than keeping the last one.
  expect(cron).toContain('new Map<string, LedgerRow[]>');
  expect(cron).toContain('ledgerVerdict(ledgerBy.get(');
  expect(cron).toContain('created_at');
});

test('RM11: the ledger is keyed on the visit, and the migration adds the column', () => {
  expect(cron).toContain('visit_start=gte.');
  expect(cron).toContain('ledgerKey(owner.email, visitStart)');
  expect(cron).not.toContain('reminderSlot');
  expect(visitMigration).toContain('ADD COLUMN IF NOT EXISTS visit_start timestamptz');
  expect(visitMigration).toContain('CREATE INDEX IF NOT EXISTS idx_follow_up_queue_visit');
  // Nullable: every other sequence sharing follow_up_queue has no visit.
  expect(visitMigration).not.toMatch(/visit_start timestamptz[^\n]*NOT NULL/);
});

test('RM9: the shared follow-up drain never sends a visit reminder', () => {
  // follow_up_queue is shared and send-follow-ups has no type filter of its
  // own, so without this exclusion every reminder goes out twice.
  expect(sharedCron).toContain('DEDICATED_SENDER_FOLLOW_UP_TYPES');
  expect(sharedCron).toMatch(/\.not\('follow_up_type', 'in'/);
  const registry = read('src/lib/notify/cancelFollowUps.ts');
  expect(registry).toContain("VISIT_REMINDER_FOLLOW_UP_TYPES = ['visit_reminder_1d']");
  expect(registry).toContain('DEDICATED_SENDER_FOLLOW_UP_TYPES');
  // One definition of the string, shared by both sides.
  expect(scheduling).not.toContain("'visit_reminder_1d'");
});

test('RM10: the migration widens follow_up_type to admit the reminder', () => {
  expect(typeMigration).toContain('DROP CONSTRAINT IF EXISTS follow_up_queue_follow_up_type_check');
  expect(typeMigration).toContain("'visit_reminder_1d'");
  // The widened list must keep every sequence already sharing the table.
  for (const t of ['instant_ack', '24h', '48h', '7d', 'feedback_day0', 'feedback_day3', 'feedback_day7']) {
    expect(typeMigration, t).toContain(`'${t}'`);
  }
});

test('RM3: service email reply-to carries both addresses', () => {
  for (const src of [sendRoute, cron, completeRoute]) {
    expect(src).toContain('SERVICE_REPLY_TO');
  }
});

test('RM7: the cron windows on Eastern, never on UTC dates', () => {
  expect(cron).toContain('tomorrowEasternWindow');
  expect(cron).toContain('status=eq.booked');
  // No naive UTC date arithmetic for "tomorrow".
  expect(cron).not.toMatch(/getUTCDate\(\)\s*\+\s*1/);
});

test('RM8: one email per customer per window, not one per task', () => {
  expect(cron).toContain('const byOwner = new Map');
  expect(cron).toContain('`${v.homeowner_id}|${v.scheduled_start}`');
});

test('RM: the cron supports a read-only dry run', () => {
  expect(cron).toContain("searchParams.get('dryRun') === '1'");
  expect(cron).toContain('if (dryRun) continue;');
});

/* ── ICS ─────────────────────────────────────────────────────────────────── */

test('ICS5: the customer endpoint hard-codes the alarm-free variant', () => {
  expect(customerIcs).toContain("variant: 'customer'");
  expect(customerIcs).not.toContain("variant: 'owner'");
  // Gated to a signed-in member.
  expect(customerIcs).toContain('verifyHomeAccess');
  expect(customerIcs).toContain('text/calendar');
});

test('ICS: the owner endpoint is the only one that emits alarms', () => {
  expect(scheduleRoute).toContain("variant: 'owner'");
});

/* ── PT: portal ──────────────────────────────────────────────────────────── */

test('PT1+PT4: the visit card renders only when a visit is booked', () => {
  expect(portal).toContain('{upcomingVisit && <UpcomingVisitCard');
  expect(portal).toContain("status: 'booked'".replace("status: 'booked'", "r.status === 'booked'"));
  expect(portal).toContain('scheduled_start');
});

test('PT2: tomorrow and later render differently', () => {
  expect(visitCard).toContain('Coming up');
  expect(visitCard).toContain('Scheduled');
  expect(visitCard).toContain('isTomorrowEastern');
});

test('PT3: the card offers the calendar file and both reschedule routes', () => {
  expect(visitCard).toContain('/api/home-care/visit.ics');
  expect(visitCard).toContain('mailto:alex@lavacagc.com,veronica@lavacagc.com');
  expect(visitCard).toContain('tel:2012124917');
});

test('PT5: only La Vaca work carries a completion label', () => {
  expect(portal).toContain("r.completed_by === 'lavaca'");
  const client = read('src/components/homecare/HomeCareChecklistClient.tsx');
  expect(client).toContain('Completed by La Vaca');
  // Absent from lavacaCompleted -> no label at all.
  expect(client).toContain('lavacaCompleted?.[id(t.key, season)]');
  // Server-rendered too, so the zone is pinned: without it the server formats
  // in UTC and the browser locally, and a late-evening completion hydrates to a
  // different day on each.
  expect(client).toContain("timeZone: 'America/New_York'");
});

test('PT5: the label is keyed per season, and only while it is current', () => {
  // Keyed on task_key alone it leaked: La Vaca's fall gutter clean credited
  // itself on the spring row the member ticked, and came back on next fall's
  // re-tick carrying last year's date. Same key shape as doneItems.
  expect(portal).toContain('`${r.task_key}|${r.season}`');
  const block = portal.slice(portal.indexOf('const lavacaCompleted'), portal.indexOf('const bookedRows'));
  expect(block).toContain('isRowCurrent(r)');
  // Several seasons' rows for one key: keep the newest, not whichever came last.
  expect(block).toContain('Date.parse(r.completed_at) > Date.parse(previous)');
});

test('PT: the portal survives a deploy that lands before the migration', () => {
  // This select is unconditional on a page every member loads, and PostgREST
  // answers an unknown column with a 400 that supabaseRest throws on.
  expect(portal).toContain('async function fetchMaintenanceRows');
  expect(portal).toContain('SERVICE_COLUMNS');
  expect(portal).toContain('MAINTENANCE_BASE');
  // The narrow retry is what keeps a pre-migration environment on its feet.
  const fn = portal.slice(portal.indexOf('async function fetchMaintenanceRows'));
  expect(fn.indexOf('catch')).toBeLessThan(fn.indexOf('interface CatalogRow'));
});

test('the visit cancel targets one window, not the whole season', () => {
  const del = scheduleRoute.slice(scheduleRoute.indexOf('export async function DELETE'));
  expect(del).toContain('scheduled_start=eq.');
  expect(del).toContain('cancelVisitSchema.safeParse');
  expect(del).toContain('cancelVisitReminder(email, startAt)');
  // (homeowner, window) is the whole filter. One window can file its tasks under
  // different seasons, so a season filter would leave part of the visit booked.
  expect(del).not.toContain('season=eq.');
});

test('SC7: the admin form builds the visit instant in Eastern', () => {
  // A date-time string with no offset is parsed in the BROWSER's zone, so this
  // is the one place a visit could be booked against the wrong clock.
  expect(adminPage).toContain('easternVisitInstant(date, from).toISOString()');
  expect(adminPage).toContain('easternVisitInstant(date, to).toISOString()');
  expect(adminPage).not.toContain('new Date(`${date}T');
});

test('SC8: the season comes from the VISIT date, reconciled per task, server-side', () => {
  // homeowner_maintenance is keyed on (homeowner, task, season): today's season
  // files a September visit under summer, where the portal never shows it.
  // Reconciling needs the task's own catalog seasons, which only the server
  // reads - so the client sends no season at all and stores what came back.
  expect(scheduleRoute).toContain('seasonForTaskVisit(visitDay');
  expect(scheduleRoute).toContain('select=key,title,seasons');
  expect(schema).not.toContain("season: z.enum(['spring', 'summer', 'fall', 'winter'])");
  expect(adminPage).not.toContain('function currentSeasonName');
  expect(adminPage).not.toContain('seasonOfVisit');
  // Completing reuses the seasons the booking was filed under.
  expect(adminPage).toContain('seasons: scheduled.seasons');
});

test('SC8: a task with no season to be filed under fails loudly', () => {
  // A row filed where the portal never renders the task is invisible to the
  // member - worse than a rejected booking, because nothing surfaces it.
  const post = scheduleRoute.slice(scheduleRoute.indexOf('export async function POST'));
  expect(post).toContain('unfiled');
  expect(post).toContain('No season to file these services under');
  expect(post.indexOf('unfiled.length > 0')).toBeLessThan(post.indexOf('await scheduleVisit'));
});

test('SC9: a reschedule across a season boundary clears the old booking', () => {
  // The upsert only reaches the (task, season) row it writes, so a visit that
  // moves to another season would leave the old row booked: a phantom visit on
  // the portal and a live "we're coming tomorrow" for a slot nobody attends.
  expect(scheduling).toContain('export async function clearSupersededBookings');
  const fn = scheduling.slice(
    scheduling.indexOf('export async function bookedVisitRows'),
    scheduling.indexOf('export function visitStartsOf'),
  );
  expect(fn, 'read across every season, not just the new one').not.toContain('season=eq.');
  expect(scheduleRoute).toContain('clearSupersededBookings');
  // Unbook first, write second: a failure leaves the previous booking whole.
  expect(scheduleRoute.indexOf('await clearSupersededBookings'))
    .toBeLessThan(scheduleRoute.indexOf('await scheduleVisit'));
});

test('CP: completing resolves the season from the BOOKED row, across seasons', () => {
  expect(completeRoute).toContain('status=in.(booked,done)');
  expect(completeRoute).not.toContain('season=eq.${encodeURIComponent(season)}');
  expect(completeRoute).toContain('bookedFor');
  // Idempotency is per (task, season), so last year's completion of the same
  // task cannot swallow this one.
  expect(completeRoute).toContain('`${r.task_key}|${r.season}`');
});

test('RM12: the reminder gate is the SEND time, not the visit', () => {
  // The cron only ever looks at "tomorrow, Eastern". A visit booked at 11pm the
  // night before is still in the future, but its 7:30pm slot has gone and the
  // run that would have carried it fired hours ago - the row would sit pending
  // forever while the admin was told a reminder was queued.
  const visit = read('src/lib/homecare/visitSchedule.ts');
  const fn = visit.slice(visit.indexOf('export function reminderIsStillUseful'));
  expect(fn).toContain('reminderSendAt(visitStart).getTime() > now.getTime()');
  expect(adminPage).toContain('text the customer yourself');
});

test('RM13: an unapplied migration degrades instead of hard-failing', () => {
  // 20260816 (the follow_up_type CHECK) and 20260817 (visit_start) are
  // hand-applied like every migration in this repo.
  const queue = scheduling.slice(scheduling.indexOf('export async function requeueVisitReminder'));
  expect(queue).toContain("return 'unavailable'");
  expect(queue.indexOf('try {')).toBeLessThan(queue.indexOf("'follow_up_queue'"));
  // The cron has no ledger without visit_start, so it sends NOTHING rather than
  // mailing a batch it cannot guard - and says so instead of 500ing silently.
  expect(cron).toContain('reminder_ledger_unavailable');
  expect(cron).toContain('sending nothing');
  const ledger = cron.slice(cron.indexOf('let ledger: LedgerRow[]'));
  expect(ledger.indexOf('sent: 0')).toBeLessThan(ledger.indexOf('await sendTrackedEmail'));
});

/* ── CP: completion ──────────────────────────────────────────────────────── */

test('CP1+CP2: mark-complete attributes to La Vaca; the checkbox does not', () => {
  expect(completeRoute).toContain("completed_by: 'lavaca'");
  const taskRoute = read('src/app/api/home-care/task/route.ts');
  expect(taskRoute).not.toContain("completed_by: 'lavaca'");
});

test('CP3: existing rows default to homeowner', () => {
  expect(migration).toContain("DEFAULT 'homeowner'");
});

test('CP4: mark-complete is idempotent - no second feedback email', () => {
  expect(completeRoute).toContain('alreadyOurs');
  expect(completeRoute).toContain('already_completed_by_lavaca');
  expect(completeRoute).toContain('if (skipFeedback || transitioning.length === 0)');
});

test('CP: completing a visit clears its pending reminder', () => {
  expect(completeRoute).toContain('cancelVisitReminder');
});

/* ── send route ──────────────────────────────────────────────────────────── */

test('the send route audits as kind=service and keeps the QBO url', () => {
  expect(sendRoute).toContain("kind: 'service'");
  expect(sendRoute).toContain('estimate_url: estimateUrl');
  expect(sendRoute).toContain('scope_summary: scopeSummary');
  expect(sendRoute).toContain('valid_until');
  // Same double-click guard as the project estimate tool.
  expect(sendRoute).toContain('IDEMPOTENCY_WINDOW_SECONDS');
  expect(sendRoute).toContain("category: 'service_quote'");
});

test('the send route audits failures too', () => {
  expect(sendRoute).toContain("result.status === 'sent' ? (isTest ? 'test' : 'sent') : 'failed'");
});

/* ── intake + admin page ─────────────────────────────────────────────────── */

test('IN: intake returns catalog, past requests and service history', () => {
  expect(intakeRoute).toContain('bookableCatalog');
  expect(intakeRoute).toContain('parseTaskKeys');
  expect(intakeRoute).toContain('lastDoneFor');
  expect(intakeRoute).toContain('status=eq.done');
});

test('the admin page keeps the Send Estimate shape minus portal and cadence', () => {
  expect(adminPage).toContain('Send a test to me');
  expect(adminPage).toContain('Send quote');
  expect(adminPage).toContain('Scope summary');
  expect(adminPage).toContain('Quote valid until');
  expect(adminPage).toContain('QuickBooks estimate URL');
  expect(adminPage).toContain('Mark service completed');
  // The two fields that do not belong on a one-visit job. Asserted against the
  // rendered form (the file's own doc comment names them as deliberately absent).
  const form = adminPage.slice(adminPage.indexOf("'use client'"));
  expect(form).not.toContain('Portal URL</Label>');
  expect(form).not.toContain('Update cadence</Label>');
  expect(form).not.toContain('portalUrl');
  expect(form).not.toContain('updateCadence');
});

test('mark-complete is confirm-gated in the UI', () => {
  expect(adminPage).toContain('window.confirm');
});

test('no emoji or em dashes in any new source file', () => {
  for (const [name, src] of Object.entries({
    sendRoute, scheduleRoute, completeRoute, intakeRoute, cron, scheduling, visitCard, adminPage, customerIcs,
  })) {
    expect(src, `${name} emoji`).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(src, `${name} em dash`).not.toContain('—');
  }
});
