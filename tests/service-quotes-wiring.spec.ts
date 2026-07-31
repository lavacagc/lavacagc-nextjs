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
const adminDrain = read('src/app/api/follow-up/route.ts');
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

test('RM15: a ledger row that cannot be written stops the send', () => {
  // The other branch claims an existing row and skips when the claim loses.
  // This one WRITES the row - and sending anyway leaves no record at all, so
  // every retry and every manual re-hit sends "we're coming tomorrow" again.
  const branch = cron.slice(cron.indexOf('} else {'), cron.indexOf('const res = await sendTrackedEmail'));
  expect(branch).toContain('if (!claimId) {');
  expect(branch).toContain('skipped.push(owner.email)');
  expect(branch.indexOf('continue;'), 'skip before the send, not after').toBeGreaterThan(-1);
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

test('RM9: EVERY drain of the shared queue skips a visit reminder', () => {
  // follow_up_queue is shared and neither drain has a type filter of its own.
  // The 09:00 UTC cron would send the reminder a second time; /api/follow-up
  // flips rows to 'sent' without mailing anything, which closes the ledger row
  // and silences the reminder that was still to go out. Both failures are
  // invisible from the drain's own code, so the exclusion lives in the query
  // builder rather than in a constant each drain remembers to apply.
  const registry = read('src/lib/notify/cancelFollowUps.ts');
  expect(registry).toContain("VISIT_REMINDER_FOLLOW_UP_TYPES = ['visit_reminder_1d']");
  expect(registry).toContain('DEDICATED_SENDER_FOLLOW_UP_TYPES');
  expect(registry).toContain('export function sharedFollowUpQueue');
  expect(registry).toContain('export function withoutDedicatedSenders');
  expect(registry).toMatch(/\.not\('follow_up_type', 'in'/);

  for (const [name, src] of Object.entries({ sharedCron, adminDrain })) {
    expect(src, `${name} must read the queue through the helper`).toContain('sharedFollowUpQueue');
    // The bypass this test exists to catch: a drain that reaches for the table
    // itself gets none of the exclusion.
    expect(src, `${name} must not build a raw queue read`)
      .not.toMatch(/from\('follow_up_queue'\)\s*\n?\s*\.select\(/);
  }
  // The one queue WRITE not already narrowed by ids the helper returned.
  expect(sharedCron).toContain('withoutDedicatedSenders(');

  // One definition of the string, shared by every side.
  expect(scheduling).not.toContain("'visit_reminder_1d'");
});

test('RM16: a reader keyed on the person is scoped to the sequence it means', () => {
  // The drains were guarded; two readers still spoke for the whole table.
  const registry = read('src/lib/notify/cancelFollowUps.ts');
  const leadFollowUp = read('src/lib/notify/leadFollowUp.ts');
  const drips = read('src/lib/followups/activeDrips.ts');
  const followUpsRoute = read('src/app/api/admin/follow-ups/route.ts');

  // ONE registry, read in both directions, so a fourth sequence adds itself in
  // one place instead of being rediscovered by each caller.
  expect(registry).toContain('export const FOLLOW_UP_SEQUENCE_TYPES');
  expect(registry).toContain('export function followUpTypesForSequence');
  expect(registry).toContain('export function followUpSequenceOf');
  expect(drips).toContain('followUpSequenceOf');

  // A Map, because the name looked up in it comes off a request body: an object
  // literal answers 'constructor' with something truthy off Object.prototype,
  // so the unknown-name guard passed it through to the query builder.
  expect(registry).toContain('new Map<string, readonly string[]>');
  expect(registry, 'no object-literal lookup by a caller-supplied name')
    .not.toContain('FOLLOW_UP_SEQUENCE_TYPES[');

  // ONE spelling of each direction. A registry hoisted so there is exactly one
  // mapping does not get to carry a third and fourth alias of it - the next
  // reader cannot tell which is authoritative.
  expect(registry, 'folded into followUpTypesForSequence').not.toContain('followUpSequenceTypes');
  expect(read('src/lib/homecare/visitSchedule.ts'), 'VISIT_REMINDER_FOLLOW_UP_TYPES is the one name')
    .not.toContain('VISIT_FOLLOW_UP_TYPES');

  // "Has this lead been through the drip?" asked of the NURTURE types. Reminder
  // rows stay 'sent' forever, so a service customer who later filled in the
  // website form was skipped and their acknowledgement never went out.
  const check = leadFollowUp.slice(
    leadFollowUp.indexOf('const { data: existingFollowUps }'),
    leadFollowUp.indexOf('const emails ='),
  );
  expect(check).toContain("in('follow_up_type', LEAD_NURTURE_FOLLOW_UP_TYPES)");

  // Stop resolves through the registry: the `=== 'review' ? ... : nurture`
  // ternary collapsed every sequence it did not name onto the nurture types, so
  // the button cancelled nothing and said "Nothing left to stop".
  expect(followUpsRoute).toContain('followUpTypesForSequence(sequence)');
  expect(followUpsRoute, 'an unknown sequence is refused, not read as nurture')
    .toContain('Unknown sequence');
  // Resend cannot carry `visit_start`, so the copy would be a row no cron finds.
  expect(followUpsRoute).toContain('DEDICATED_SENDER_FOLLOW_UP_TYPES');
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
  expect(cron).toContain('scheduled_start=gte.');
  // No naive UTC date arithmetic for "tomorrow".
  expect(cron).not.toMatch(/getUTCDate\(\)\s*\+\s*1/);
});

test('RM15: the cron selects visits by WINDOW, never by the shared status', () => {
  // `status` is shared with the member's checklist checkbox, which writes
  // 'done'/'todo' onto the very row the booking lives on. Filtered on
  // status=eq.booked, a member ticking "Clean gutters" to acknowledge the visit
  // silently cancelled its reminder for a job that was still happening.
  const query = cron.slice(cron.indexOf('const visits = '), cron.indexOf('if (visits.length === 0)'));
  expect(query).not.toContain('status=eq.booked');
  expect(query).toContain('scheduled_start=gte.');
  expect(query).toContain('scheduled_start=lt.');
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
  expect(portal).toContain('const bookedRows');
  expect(portal).toContain('scheduled_start');
});

test('PT6: a member ticking a booked task does not hide their own visit', () => {
  // The checkbox writes 'done' onto the row the booking lives on, so neither
  // the fetch nor the card may be scoped by status - the visit would drop off
  // the page for a job that is still happening.
  const fetchFn = portal.slice(portal.indexOf('async function fetchMaintenanceRows'), portal.indexOf('interface CatalogRow'));
  expect(fetchFn).not.toContain('status=in.');
  expect(portal).toContain("(r) => r.scheduled_start && r.status !== 'dismissed'");
  // And the write itself carries none of the scheduling columns, so a
  // merge-duplicates upsert leaves the window intact.
  const taskRoute = read('src/app/api/home-care/task/route.ts');
  const upsertBody = taskRoute.slice(
    taskRoute.indexOf("status: done ? 'done' : 'todo'"),
    taskRoute.indexOf('return NextResponse.json({ ok: true, task_key: taskKey, done'),
  );
  for (const column of ['scheduled_start', 'scheduled_end', 'service_address']) {
    expect(upsertBody, `the member's checkbox must not write ${column}`).not.toContain(column);
  }
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
  // Held in state, not read straight off the prop: re-ticking the task moves
  // the attribution to the member server-side, and the open tab has to agree
  // or it credits us for work they just did themselves.
  expect(client).toContain('const [lavacaCompleted, setLavacaCompleted] = useState');
  const toggle = client.slice(client.indexOf('const toggleDone ='), client.indexOf('const toggleSelect ='));
  expect(toggle).toContain('setLavacaCompleted');
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
  expect(del).toContain('cancelVisitReminder(owner.email, startAt)');
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
  // Completing reuses the seasons the rows were filed under, read back off the
  // booking rather than remembered from a schedule call in this page session.
  expect(adminPage).toContain('Object.fromEntries(booking.tasks.map((t) => [t.key, t.season]))');
});

test('SC8: a task with no season to be filed under fails loudly', () => {
  // A row filed where the portal never renders the task is invisible to the
  // member - worse than a rejected booking, because nothing surfaces it.
  const post = scheduleRoute.slice(scheduleRoute.indexOf('export async function POST'));
  expect(post).toContain('unfiled');
  expect(post).toContain('No season to file these services under');
  expect(post.indexOf('unfiled.length > 0')).toBeLessThan(post.indexOf('await scheduleVisit'));
});

test('SC9: the pre-booking read sees every window, and fails closed', () => {
  // The window a reschedule vacates is what tells the requeue which reminder to
  // pull, and one window can hold tasks filed under different seasons - so this
  // read is scoped to the customer, never to the season being booked.
  const fn = scheduling.slice(
    scheduling.indexOf('export async function bookedVisitRows'),
    scheduling.indexOf('export function supersededBookings'),
  );
  expect(fn, 'read across every season, not just the new one').not.toContain('season=eq.');
  // A booking is a row with a WINDOW; `status` is shared with the member's
  // checkbox and says nothing about whether a visit is coming.
  expect(fn).toContain('scheduled_start=not.is.null');
  expect(fn).not.toContain('status=eq.booked');
  // And it fails CLOSED. Swallowed into [], a failed read reads as "this
  // customer holds no bookings" - the one answer that cancels nothing and still
  // returns 200 over a reminder for a window the visit has left.
  expect(fn, 'a failed read must not degrade to "no bookings"').not.toContain('.catch(');
  expect(scheduleRoute).toContain('bookedVisitRows(homeowner.id)');
});

test('SC10: one booking per (service, season), and windows compare as instants', () => {
  // ONE active booking per (homeowner, task, SEASON) - the table's own unique
  // key - so a reschedule is a plain upsert in place and needs no handshake.
  // The `replaces` parameter that tried to tell a move from a second concurrent
  // booking is gone from every layer.
  expect(scheduling).toContain('export function supersededBookings');
  expect(schema).not.toContain('replaces:');
  expect(scheduleRoute).not.toContain('replacesAt');
  expect(adminPage).not.toContain('replaces:');
  expect(scheduleRoute).toContain('supersededBookings({ previous, tasks, start: startAt })');
  const fn = scheduling.slice(
    scheduling.indexOf('export function supersededBookings'),
    scheduling.indexOf('export function orphanedVisitStarts'),
  );
  // Matched on (task, SEASON). `clean_gutters` is a fall AND a spring task, and
  // keyed on the task alone, booking the spring clean unbooked the October one.
  expect(fn).toContain('`${t.taskKey}|${t.season}`');
  expect(fn).toContain('`${row.task_key}|${row.season}`');
  // Which also means a cross-season move is a NEW booking, not an inferred one:
  // nothing unbooks a row the caller did not name. That was the round 3-5 spiral.
  expect(scheduling, 'no cross-season supersede guessing').not.toContain('clearSupersededBookings');
  expect(scheduleRoute).not.toContain('clearSupersededBookings');
  // PostgREST renders timestamptz as "...+00:00" and a Date as "....000Z", so a
  // string compare here matches nothing in production while every stub passes.
  expect(fn).toContain('new Date(row.scheduled_start).getTime()');
  expect(fn).not.toContain('toISOString()');
});

test('SC12: a window another service still holds keeps its reminder', () => {
  // Move the gutters off a 5 Aug visit that also carries a dryer vent and the
  // 5 Aug visit is still happening - cancelling its reminder on the strength of
  // the gutters row alone leaves the customer unannounced.
  expect(scheduling).toContain('export function orphanedVisitStarts');
  expect(scheduleRoute).toContain('orphanedVisitStarts({ previous, superseded })');
  // Which needs every window the customer holds, not just this booking's tasks.
  expect(scheduleRoute).toContain('bookedVisitRows(homeowner.id)');
  expect(scheduling).not.toContain('task_key=in.(${taskKeys');
});

test('SC13: a booking writes the window over a completion, never the status', () => {
  // The mirror of SC11. Their checkbox leaves the window alone; the booking has
  // to leave their completion alone, or a reschedule two days after they ticked
  // the task erases the tick with nothing to warn either side - the same
  // narrowing the cancel route makes with `status=eq.booked`.
  const fn = scheduling.slice(
    scheduling.indexOf('async function memberCompletionsInForce'),
    scheduling.indexOf('export interface BookedVisitRow'),
  );
  expect(fn).toContain('isRowCurrent');
  // A completion LA VACA recorded is still retaken: left in place it credits us
  // for whoever ticks the row next, and makes mark-complete treat the new visit
  // as already handled, so its window never comes off the books.
  expect(fn).toContain("r.completed_by !== 'lavaca'");
  expect(fn, 'not knowing what the row holds is not the same as it holding nothing')
    .not.toContain('.catch(');
  // Two payloads: the window always, the status only where nothing of theirs is
  // being overwritten.
  expect(fn).toContain("status: 'booked'");
  expect(fn).toContain('await upsert(held.map((t) => ({ ...identity(t), ...booking })))');
});

test('SC14: a booked visit can be cancelled from the admin page', () => {
  // The DELETE route was fully built and unreachable. A customer who phones to
  // cancel then keeps their portal card and gets "we're coming tomorrow" for a
  // job nobody is attending - the one email the owner does not know is going
  // out. The two workarounds were reschedule-to-a-fake-date, or "Mark
  // completed", which writes the job into the history and asks the customer to
  // rate work never performed.
  expect(adminPage).toContain('data-testid="sq-cancel"');
  expect(adminPage).toContain('Cancel visit');
  expect(adminPage).toContain("method: 'DELETE'");
  expect(adminPage).toContain('/api/admin/service-quote/schedule?');
  const fn = adminPage.slice(adminPage.indexOf('const cancel = async (booking: Booking)'), adminPage.indexOf('const visitLabel'));
  // Confirm-gated, names the window, and the list is re-read afterwards.
  expect(fn).toContain('window.confirm');
  expect(fn).toContain('start: booking.start');
  expect(fn).toContain('await refreshBookings()');

  // The address the reminder cancel matches on is READ from the homeowner row,
  // never sent. The unbook filters on homeowner_id and the cancel on the
  // address, so a caller-supplied one let them name different people: the page
  // sent its LOOKUP box, and a stale value cleared the window, matched no queue
  // row and still answered "cancelled" - so the customer was told we were
  // coming tomorrow for a visit that was called off.
  expect(fn, 'the lookup box is not bound to the loaded customer').not.toContain('email: email.trim()');
  expect(schema.slice(schema.indexOf('export const cancelVisitSchema')), 'no caller-supplied address')
    .not.toContain('email:');
  const del = scheduleRoute.slice(scheduleRoute.indexOf('export async function DELETE'));
  expect(del).toContain('homeowners?select=email&id=eq.${homeownerId}');
  expect(del).toContain('cancelVisitReminder(owner.email, startAt)');
  // Resolved BEFORE anything is written: a cancel that cannot pull the reminder
  // is the failure this route exists to prevent, so it must not half-happen.
  expect(del.indexOf('homeowners?select=email')).toBeLessThan(del.indexOf("supabaseRest('PATCH'"));
});

test('SC15: a service booked into another season is refused, not double-booked', () => {
  // The season is reconciled from the visit date, and for a two-season service
  // (clean_gutters, roof_inspect - both fall+spring) it flips on 1 Jun and
  // 1 Dec. So a SEVEN-DAY slip from 25 Nov to 3 Dec filed a second row under
  // spring while the fall row kept 25 Nov: "we're coming tomorrow" on 24 Nov
  // for a visit that had moved, and a portal card for it until it passed.
  //
  // Telling that from a deliberate second booking is not knowable here, and
  // guessing is what the `replaces` handshake cost three defects to learn. So
  // the admin decides: refused, with the visit already on the books named, and
  // Cancel visit one click away on the same screen.
  expect(scheduling).toContain('export function crossSeasonBookings');
  const fn = scheduling.slice(
    scheduling.indexOf('export function crossSeasonBookings'),
    scheduling.indexOf('export function orphanedVisitStarts'),
  );
  expect(fn).toContain('season === row.season');
  // Only windows still AHEAD. A past one announces nothing - its reminder run
  // has fired and the portal card filters to the future - so blocking on one
  // would only mean a visit nobody closed out can never be re-booked.
  expect(fn).toContain('ms > nowMs');

  const post = scheduleRoute.slice(
    scheduleRoute.indexOf('export async function POST'),
    scheduleRoute.indexOf('export async function GET'),
  );
  expect(post).toContain('crossSeasonBookings({ previous, tasks })');
  expect(post).toContain('status: 409');
  // Actionable: which service, which visit, and what to do about it.
  expect(post).toContain('Already on the books for a different season');
  expect(post).toContain('cancel that one first');
  expect(post).toContain('visitDateLabel(new Date(r.scheduled_start!))');
  // Refused BEFORE anything is written, so a rejected booking leaves no trace.
  expect(post.indexOf('conflicts.length > 0')).toBeLessThan(post.indexOf('await scheduleVisit'));
});

test('IN6: the intake lookup finds a lead whose stored email has capitals', () => {
  // `leads.email` is stored exactly as typed - the booking form only trims - so
  // a case-sensitive `eq.` against the lowercased param silently returns nothing
  // for `Jane.Smith@Gmail.com`, and the whole past-requests panel just fails to
  // appear. Same shape as cancelPendingFollowUps: an escaped ilike prefilter,
  // then an exact JS match, because PostgREST reads `*` as an alias for `%`.
  const lookup = intakeRoute.slice(intakeRoute.indexOf('const [leads, owners]'), intakeRoute.indexOf('const homeowner ='));
  expect(lookup).toContain('escapeLikePattern(email)');
  expect(lookup).toContain('email=ilike.');
  expect(lookup.slice(lookup.indexOf('leads?select='), lookup.indexOf('homeowners?select=')), 'the leads match is case-insensitive')
    .not.toContain('email=eq.');
  // homeowners IS normalised on write (normalizeEmail), so it keeps its exact
  // match - only `leads` is exposed.
  expect(lookup).toContain('homeowners?select=');
  expect(intakeRoute, 'and the ilike prefilter is narrowed by an exact match')
    .toContain(".trim().toLowerCase() === email");
});

test('CP9: a booked visit can be completed without re-booking it first', () => {
  // A visit is booked on Monday and performed on Thursday, in another session.
  // Gating the button on a schedule POST from the same page load meant
  // re-booking a finished job to close it out - which wiped the member's own
  // tick off the row and queued a reminder for a window that had passed.
  expect(intakeRoute).toContain('scheduled_start=not.is.null');
  expect(intakeRoute).toContain('groupBookings');
  expect(intakeRoute).toContain('bookings');
  expect(adminPage).toContain('data-testid="sq-bookings"');
  expect(adminPage).toContain('const complete = async (booking: Booking)');
  // The completion names the window it closes, so it cannot reach another visit.
  expect(adminPage).toContain('start: booking.start');
  expect(schema).toContain('start: z.string().datetime({ offset: true }).optional()');
  expect(completeRoute).toContain('performedAt');
  expect(completeRoute).toContain('if (performedAt !== null && at !== performedAt) continue;');
});

test('CP: completing resolves the season from the BOOKED row, across seasons', () => {
  // 'todo' is in the list because a member can untick a task La Vaca booked;
  // the row still holds the window, and the window is the booking.
  expect(completeRoute).toContain('status=in.(booked,done,todo)');
  expect(completeRoute).not.toContain('season=eq.${encodeURIComponent(season)}');
  expect(completeRoute).toContain('bookedFor');
  expect(completeRoute).toContain('if (!r.scheduled_start) continue;');
  // The visit happened, so it comes off the books - otherwise every reader
  // keeps announcing a job that is already done.
  expect(completeRoute).toContain('scheduled_start: null');
  // Idempotency is per (task, season), so last year's completion of the same
  // task cannot swallow this one.
  expect(completeRoute).toContain('`${r.task_key}|${r.season}`');
});

test('RM12+RM14: the reminder gate is the covering RUN, not the visit', () => {
  // The cron only ever looks at "tomorrow, Eastern". A visit booked at 11pm the
  // night before is still in the future, but the run that would have carried
  // its reminder fired hours ago - the row would sit pending forever while the
  // admin was told a reminder was queued. And the run is not the nominal 7:30pm
  // slot: with one fixed UTC time and no DST logic it fires at 6:30pm Eastern
  // all winter, so gating on the slot left an hour of that hole open.
  const visit = read('src/lib/homecare/visitSchedule.ts');
  const fn = visit.slice(visit.indexOf('export function reminderIsStillUseful'));
  expect(fn).toContain('reminderRunAt(visitStart).getTime() > now.getTime()');
  expect(visit).toContain('export function reminderRunAt');
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
  expect(adminPage).toContain('Mark completed');
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
