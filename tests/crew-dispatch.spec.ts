import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildIcs, googleCalendarUrl, ICS_ORGANIZER } from '../src/lib/homecare/ics';
import {
  buildDispatchEmail, buildDispatchCancelledEmail, dispatchSubject, ACTION_PREFIX, CANCELLED_PREFIX,
} from '../src/lib/homecare/dispatchEmail';
import { escapeTelegram } from '../src/lib/notify/telegramMessage';
import { SERVICE_REPLY_TO } from '../src/lib/homecare/serviceEmails';
import { HOME_CARE_FROM } from '../src/lib/notify/senders';
import { crewIcsUid, dispatchStateOf, type DispatchAssignment } from '../src/lib/homecare/dispatch';

/**
 * Acceptance criteria for crew dispatch.
 * See docs/crew-dispatch-acceptance-criteria.md - IDs below match that doc.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * The same file with comments stripped.
 *
 * These sources explain themselves at length, and several of the guarantees
 * below are "this word appears nowhere" - which a comment SAYING the word does
 * not violate. Asserting on the raw text made the doc comment the thing under
 * test instead of the code.
 */
const code = (p: string) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const START = new Date(Date.UTC(2026, 7, 5, 12));   // 5 Aug 2026, 8am Eastern
const END = new Date(Date.UTC(2026, 7, 5, 15));     // 11am Eastern
const NOW = new Date(Date.UTC(2026, 7, 1, 12));

const ics = (over: Partial<Parameters<typeof buildIcs>[0]> = {}) => buildIcs({
  uid: 'lavaca-crew-1',
  start: START,
  end: END,
  services: ['Clean gutters & downspouts', 'Clean the dryer vent'],
  address: '14 Maple Ave, West Orange, NJ',
  customerName: 'Jordan Caruso',
  customerPhone: '(201) 555-0100',
  variant: 'crew',
  attendees: [{ name: 'Veronica', email: 'veronica@lavacagc.com' }],
  now: NOW,
  ...over,
});

const dispatch = (over = {}) => buildDispatchEmail({
  recipientName: 'Veronica',
  customerName: 'Jordan Caruso',
  customerPhone: '(201) 555-0100',
  address: '14 Maple Ave, West Orange, NJ',
  services: ['Clean gutters & downspouts', 'Clean the dryer vent'],
  visitDateLabel: 'Wed 5 Aug',
  timeWindow: '8:00 - 11:00am',
  subName: 'Ramirez Exteriors',
  confirmUrl: 'https://www.lavacagc.com/crew/confirm/TOKEN',
  calendarUrl: 'https://calendar.google.com/calendar/render?action=TEMPLATE',
  ...over,
});

/* ── calendar delivery (AC 1-11) ─────────────────────────────────────────── */

test('AC1 a crew invite is METHOD:REQUEST, not PUBLISH', () => {
  expect(ics()).toContain('METHOD:REQUEST');
  expect(ics()).not.toContain('METHOD:PUBLISH');
});

test('AC2 a crew invite carries an ORGANIZER, which REQUEST requires', () => {
  expect(ics()).toContain(`ORGANIZER;CN=La Vaca General Contractors:mailto:${ICS_ORGANIZER}`);
});

test('AC3 one ATTENDEE line per recipient, RSVP requested', () => {
  const out = ics({ attendees: [
    { name: 'Alex', email: 'alex@lavacagc.com' },
    { name: 'Veronica', email: 'veronica@lavacagc.com' },
  ] });
  const lines = out.split('\r\n').filter((l) => l.startsWith('ATTENDEE'));
  expect(lines).toHaveLength(2);
  expect(lines[0]).toContain('RSVP=TRUE');
  expect(lines[0]).toContain('mailto:alex@lavacagc.com');
  expect(lines[1]).toContain('CN=Veronica');
});

test('AC2 the ORGANIZER is the address the dispatch is actually sent from', () => {
  // A mismatch is what makes Gmail and Outlook fall back to a plain attachment,
  // which is the outcome METHOD:REQUEST was chosen to avoid. Derived, not
  // written out twice, so the two cannot drift apart again.
  expect(ICS_ORGANIZER).toBe('alex@email.lavaca.link');
  expect(HOME_CARE_FROM).toContain(`<${ICS_ORGANIZER}>`);
});

test('AC4 a crew invite carries SEQUENCE so a re-send supersedes it', () => {
  expect(ics()).toContain('SEQUENCE:0');
  expect(ics({ sequence: 3 })).toContain('SEQUENCE:3');
});

test('AC4 the sequence counts up only once an invite has actually gone out', () => {
  const src = read('src/lib/homecare/dispatch.ts');
  expect(src).toContain(
    'const sequence = dispatch.dispatched_at ? (dispatch.ics_sequence ?? 0) + 1 : (dispatch.ics_sequence ?? 0);',
  );
  // ...and it is persisted with the stamp, so the next send counts on from it.
  const stamp = src.slice(src.indexOf('if (sentTo.length > 0) {'));
  expect(stamp).toContain('ics_sequence: sequence');
  expect(read('supabase/migrations/20260818000000_crew_dispatch.sql'))
    .toContain('ADD COLUMN IF NOT EXISTS ics_sequence INTEGER NOT NULL DEFAULT 0');
});

test('AC5+AC6 a crew invite carries both ops alarms, and the 7am one names the customer + phone', () => {
  const out = ics();
  const alarms = out.split('BEGIN:VALARM').length - 1;
  expect(alarms).toBe(2);
  expect(out).toContain("Confirm tomorrow's visit for Jordan Caruso");
  expect(out).toContain('Text Jordan Caruso when the crew is on the way - (201) 555-0100');
});

test('AC5 the crew alarms fire at 7:30pm the night before and 7:00am on the day, Eastern', () => {
  const out = ics();
  // 4 Aug 19:30 EDT = 23:30Z; 5 Aug 07:00 EDT = 11:00Z.
  expect(out).toContain('TRIGGER;VALUE=DATE-TIME:20260804T233000Z');
  expect(out).toContain('TRIGGER;VALUE=DATE-TIME:20260805T110000Z');
});

test('AC7 the customer variant still has no alarm and still promises a text', () => {
  const out = ics({ variant: 'customer', attendees: [] });
  expect(out).not.toContain('BEGIN:VALARM');
  expect(out).not.toContain('ATTENDEE');
  expect(out).toContain("We'll text you when we're on our way");
  expect(out).toContain('METHOD:PUBLISH');
});

test('AC7 the customer variant never leaks the crew instruction or the phone number', () => {
  const out = ics({ variant: 'customer', attendees: [] });
  expect(out).not.toContain('when the crew is on the way');
  expect(out).not.toContain('(201) 555-0100');
});

test('AC8 the owner variant is unchanged - PUBLISH, no attendees, both alarms', () => {
  const out = ics({ variant: 'owner', attendees: [] });
  expect(out).toContain('METHOD:PUBLISH');
  expect(out).not.toContain('ATTENDEE');
  expect(out).not.toContain('SEQUENCE');
  expect(out.split('BEGIN:VALARM').length - 1).toBe(2);
});

test('AC9 alarm triggers are absolute DATE-TIME values, never relative offsets', () => {
  const out = ics();
  for (const line of out.split('\r\n').filter((l) => l.startsWith('TRIGGER'))) {
    expect(line).toContain('VALUE=DATE-TIME');
    expect(line).not.toMatch(/-PT\d/);
  }
});

test('AC9 an evening visit keeps its alarms in the evening and the morning', () => {
  // 6pm Eastern on 5 Aug - the UTC date has already rolled over to the 6th.
  const evening = new Date(Date.UTC(2026, 7, 5, 22));
  const out = ics({ start: evening, end: new Date(Date.UTC(2026, 7, 6, 0)) });
  expect(out).toContain('TRIGGER;VALUE=DATE-TIME:20260804T233000Z'); // still the 4th, 7:30pm
  expect(out).toContain('TRIGGER;VALUE=DATE-TIME:20260805T110000Z'); // still the 5th, 7:00am
});

test('AC10 the Google Calendar link is a TEMPLATE render URL with a UTC date range', () => {
  const url = googleCalendarUrl({
    title: 'La Vaca: Clean gutters - Jordan Caruso',
    start: START, end: END,
    details: 'Services: Clean gutters',
    location: '14 Maple Ave',
  });
  expect(url.startsWith('https://calendar.google.com/calendar/render?')).toBe(true);
  const params = new URL(url).searchParams;
  expect(params.get('action')).toBe('TEMPLATE');
  expect(params.get('dates')).toBe('20260805T120000Z/20260805T150000Z');
  expect(params.get('location')).toBe('14 Maple Ave');
});

test('AC11 the calendar link involves no credential and no API host', () => {
  const url = googleCalendarUrl({ title: 't', start: START, end: END, details: 'd', location: 'l' });
  expect(url).not.toContain('googleapis.com');
  expect(url).not.toMatch(/token|key=|auth/i);
});

/* ── the dispatch email (AC 12-22) ───────────────────────────────────────── */

test('AC12 the subject leads with the literal caps prefix', () => {
  expect(ACTION_PREFIX).toBe('[ACTION REQUIRED]');
  expect(dispatch().subject.startsWith('[ACTION REQUIRED] ')).toBe(true);
});

test('AC13 the subject carries date, window and street so Gmail cannot thread two visits together', () => {
  const a = dispatchSubject({ visitDateLabel: 'Wed 5 Aug', timeWindow: '8:00 - 11:00am', address: '14 Maple Ave, West Orange, NJ' });
  const b = dispatchSubject({ visitDateLabel: 'Thu 6 Aug', timeWindow: '1:00 - 3:00pm', address: '9 Elm St, Montclair, NJ' });
  expect(a).toBe('[ACTION REQUIRED] Wed 5 Aug, 8:00 - 11:00am - 14 Maple Ave');
  expect(a).not.toBe(b);
});

test('AC13 the subject uses the street only, not the whole address', () => {
  const s = dispatchSubject({ visitDateLabel: 'Wed 5 Aug', timeWindow: '8-11am', address: '14 Maple Ave, West Orange, NJ 07052' });
  expect(s).toContain('14 Maple Ave');
  expect(s).not.toContain('07052');
});

test('AC14 caps are confined to the prefix', () => {
  const tail = dispatch().subject.slice(ACTION_PREFIX.length);
  expect(tail).not.toMatch(/[A-Z]{4,}/);
});

test('AC15 the body names the customer, address, services and sub', () => {
  const { html } = dispatch();
  expect(html).toContain('Jordan Caruso');
  expect(html).toContain('14 Maple Ave, West Orange, NJ');
  expect(html).toContain('Clean the dryer vent');
  expect(html).toContain('Ramirez Exteriors');
});

test('AC15 the sub row is omitted entirely when there is no sub', () => {
  expect(dispatch({ subName: null }).html).not.toContain('confirm they are booked');
});

test('AC16 the body says the customer is told at 7:30pm either way', () => {
  expect(dispatch().html).toContain('7:30pm tonight either way');
});

test('AC17 the body explains the attachment and the 7:00am text reminder', () => {
  const { html } = dispatch();
  expect(html).toContain('Save the calendar invite attached');
  expect(html).toContain('7:00am tomorrow to text Jordan Caruso');
});

test('AC18 the dispatch carries no unsubscribe link and no postal address', () => {
  const { html, text } = dispatch();
  expect(html.toLowerCase()).not.toContain('unsubscribe');
  expect(text.toLowerCase()).not.toContain('unsubscribe');
  expect(html).not.toContain('51 Crestmont Rd');
});

test('AC18 it still says why they received it, and how to reply', () => {
  expect(dispatch().html).toContain('Sent to you because you are on this visit');
});

test('AC19 the customer-facing shell still exports the CAN-SPAM address', () => {
  // Guards against "internal mail needs no address" being applied to the shell
  // every customer email is built from.
  const shell = read('src/lib/homecare/emailShell.ts');
  expect(shell).toContain('51 Crestmont Rd, West Orange, NJ 07052');
  expect(shell).toContain('Unsubscribe');
});

test('AC20 the dispatch send passes no preferenceStream', () => {
  const src = code('src/lib/homecare/dispatch.ts');
  expect(src).not.toContain('preferenceStream');
  expect(src).toContain("category: 'crew_dispatch'");
});

test('AC21 the dispatch is sent per recipient, inside the assignment loop', () => {
  const src = read('src/lib/homecare/dispatch.ts');
  const loop = src.slice(src.indexOf('for (const assignment of assignments)'));
  expect(loop).toContain('sendTrackedEmail');
  expect(loop).toContain('to: assignment.email');
  expect(loop).toContain('confirm/${assignment.confirm_token}');
});

test('AC22 the calendar file rides as an attachment named visit.ics', () => {
  const src = read('src/lib/homecare/dispatch.ts');
  expect(src).toContain("attachments: [{ filename: 'visit.ics', content: ics }]");
});

test('AC22 the dispatch replies to the service addresses', () => {
  expect(read('src/lib/homecare/dispatch.ts')).toContain('replyTo: SERVICE_REPLY_TO.join');
  expect(SERVICE_REPLY_TO).toEqual(['alex@lavacagc.com', 'veronica@lavacagc.com']);
});

test('the plain-text part carries both one-tap routes', () => {
  const { text } = dispatch();
  expect(text).toContain('https://www.lavacagc.com/crew/confirm/TOKEN');
  expect(text).toContain('calendar.google.com');
});

/* ── attachments in the chokepoint (AC 23-25) ────────────────────────────── */

test('AC23 attachments are base64-encoded on the way to Resend', () => {
  const src = read('src/lib/notify/sendEmail.ts');
  expect(src).toContain("Buffer.from(a.content).toString('base64')");
});

test('AC24 attachment bytes never reach email_log - only the filenames', () => {
  const src = read('src/lib/notify/sendEmail.ts');
  const log = src.slice(src.indexOf('async function writeEmailLog'), src.indexOf('async function suppress'));
  expect(log).toContain('a.filename');
  expect(log).not.toContain('a.content');
  expect(log).not.toContain('base64');
});

test('AC25 a send with no attachments spreads nothing into the Resend payload', () => {
  const src = read('src/lib/notify/sendEmail.ts');
  expect(src).toContain('...(input.attachments?.length');
});

/* ── recipients (AC 26-32) ───────────────────────────────────────────────── */

test('AC26 the migration seeds exactly the two SERVICE_REPLY_TO addresses', () => {
  const sql = read('supabase/migrations/20260818000000_crew_dispatch.sql');
  expect(sql).toContain("('Alex', 'alex@lavacagc.com'), ('Veronica', 'veronica@lavacagc.com')");
  expect(sql).toContain('ON CONFLICT DO NOTHING');
});

test('AC27 recipient email uniqueness is case-insensitive', () => {
  const sql = read('supabase/migrations/20260818000000_crew_dispatch.sql');
  expect(sql).toMatch(/CREATE UNIQUE INDEX[\s\S]*?dispatch_recipients \(lower\(email\)\)/);
});

test('AC27 the create route lower-cases before insert', () => {
  expect(read('src/app/api/admin/crew/route.ts')).toContain('parsed.data.email.toLowerCase()');
});

test('AC28+AC29 no selection means everyone active, not nobody', () => {
  const src = read('src/lib/homecare/dispatch.ts');
  const fn = src.slice(src.indexOf('export async function resolveRecipients'));
  expect(fn).toContain('if (!ids || ids.length === 0) return all;');
  expect(fn).toContain('active=is.true');
});

test('AC30 an inactive recipient is dropped even when explicitly named', () => {
  const src = read('src/lib/homecare/dispatch.ts');
  const fn = src.slice(src.indexOf('export async function resolveRecipients'), src.indexOf('export async function ensureVisitDispatch'));
  // The filter runs over `all`, which is already narrowed to active rows, so a
  // named-but-inactive id cannot survive it.
  expect(fn).toContain('return all.filter((r) => wanted.has(r.id));');
});

test('AC31+AC32 the admin pre-ticks everyone active and blocks an empty pick', () => {
  const page = read('src/app/vaca-mgmt/send-service-quote/page.tsx');
  expect(page).toContain('setCrewPicked(new Set(active.map((r) => r.id)))');
  expect(page).toContain('crew.length > 0 && crewPicked.size === 0');
  expect(page).toContain('Nobody selected - nobody will be told to go');
});

/* ── booking (AC 33-40) ──────────────────────────────────────────────────── */

test('AC33 a dispatch failure never fails a booking that succeeded', () => {
  const route = read('src/app/api/admin/service-quote/schedule/route.ts');
  const after = route.slice(route.indexOf('const dispatch = await sendVisitDispatch'));
  expect(after).toContain('.catch((err): SendDispatchResult =>');
  expect(after).toContain("outcome: 'unavailable'");
  // The dispatch happens after the booking write, not before it. Compared
  // against the CALL, not the import, which naturally sits above everything.
  expect(route.indexOf('await scheduleVisit(')).toBeLessThan(route.indexOf('await sendVisitDispatch('));
});

test('AC34 the schedule response reports the dispatch outcome and who it reached', () => {
  const route = read('src/app/api/admin/service-quote/schedule/route.ts');
  expect(route).toContain('dispatch: dispatch.outcome');
  expect(route).toContain('dispatchedTo: dispatch.sentTo');
});

test('AC35+AC36 the toast reports both outcomes and distinguishes no_recipients', () => {
  const page = read('src/app/vaca-mgmt/send-service-quote/page.tsx');
  expect(page).toContain("data.dispatch === 'no_recipients'");
  expect(page).toContain('there are no active crew members');
  expect(page).toContain("const bad = data.reminder === 'unavailable' || data.dispatch !== 'sent'");
});

test('AC37 re-dispatching reuses the visit row rather than resetting its stamps', () => {
  const src = read('src/lib/homecare/dispatch.ts');
  const fn = src.slice(src.indexOf('export async function ensureVisitDispatch'), src.indexOf('export async function ensureAssignments'));
  expect(fn).toContain('if (existing[0]) {');
  expect(fn).not.toContain('nudged_at: null');
});

test('AC38 re-dispatching reuses each assignment, so a re-send cannot un-confirm', () => {
  const src = read('src/lib/homecare/dispatch.ts');
  const fn = src.slice(src.indexOf('export async function ensureAssignments'), src.indexOf('export interface VisitContext'));
  expect(fn).toContain('const missing = recipients.filter((r) => !byRecipient.has(r.id));');
  // The ONE row a re-send resets is a RETIRED one - somebody put back on the
  // visit after being dropped, whose answer was retired with them. A live
  // confirmation is never touched, which is what this AC has always guarded.
  const revive = fn.slice(fn.indexOf('const returning ='), fn.indexOf('const missing ='));
  expect(revive).toContain("wanted.has(a.recipient_id) && a.status === 'retired'");
  expect(revive).toContain("{ status: 'sent', confirmed_at: null, note: null, updated_at: stamp }");
  expect(fn.split("status: 'sent'").length - 1, 'no other write puts a row back to sent').toBe(1);
});

test('AC81 a recipient dropped from the selection is retired, not left with a live link', () => {
  const src = read('src/lib/homecare/dispatch.ts');
  const fn = src.slice(src.indexOf('export async function ensureAssignments'), src.indexOf('export interface VisitContext'));
  // Deselecting is how a mis-addressed visit is corrected, and re-booking the
  // same window is a re-dispatch rather than a supersede - so nothing else
  // would ever clean the row up.
  expect(fn).toContain("const dropped = existing.filter((a) => !wanted.has(a.recipient_id) && a.status !== 'retired');");
  expect(fn).toContain("{ status: 'retired', updated_at: stamp }");
  // The row is kept: it is the record that they were sent it.
  expect(fn).not.toContain("supabaseRest('DELETE'");
  // A revival that did not land skips the send rather than mailing a link that
  // is still dead.
  expect(fn).toContain("a!.status !== 'retired'");

  // Owner decision: their calendar event is deliberately NOT retracted, so no
  // METHOD:CANCEL is sent from here. AC82 is the mitigation.
  expect(fn).not.toContain('sendDispatchRetraction');
});

test('AC81 a retired assignment counts for nothing, wherever the crew is read', () => {
  const src = read('src/lib/homecare/dispatch.ts');
  expect(src).toContain("return assignments.filter((a) => a.status !== 'retired');");
  // Every reader goes through the one helper rather than remembering the rule.
  const cron = read('src/app/api/cron/visit-dispatch-escalation/route.ts');
  expect(cron).toContain('const mine = liveAssignments(');
  const confirm = read('src/app/api/crew/confirm/route.ts');
  expect(confirm).toContain('liveAssignments(rows)');

  const a = (over: Partial<DispatchAssignment>): DispatchAssignment => ({
    id: 'a1', dispatch_id: 'd1', recipient_id: 'r1', email: 'alex@lavacagc.com',
    name: 'Alex', confirm_token: 't', status: 'sent', confirmed_at: null, note: null, ...over,
  });
  // Veronica confirmed, then was taken off the visit. Alex has not answered, so
  // the visit is still awaiting - not confirmed on the strength of hers.
  const dropped = dispatchStateOf([
    a({}),
    a({ id: 'a2', recipient_id: 'r2', name: 'Veronica', status: 'retired', confirmed_at: '2026-08-04T12:00:00Z' }),
  ]);
  expect(dropped.state).toBe('awaiting');
  expect(dropped.confirmedBy).toEqual([]);
  // And a retired flag is not an open problem either.
  expect(dispatchStateOf([a({}), a({ id: 'a2', recipient_id: 'r2', status: 'retired', note: 'sub cancelled' })]).flags).toEqual([]);
});

test('AC82 a retired token says so plainly, and cannot answer', () => {
  const page = read('src/app/crew/confirm/[token]/page.tsx');
  expect(page).toContain("if (assignment.status === 'retired')");
  expect(page).toContain('You are no longer on this visit');
  // The whole point: they may be acting on the 7:00am alarm still on their
  // calendar, which is not retracted.
  expect(page).toContain('text the customer about it');
  // Checked BEFORE the generic "not valid" fallback can swallow it...
  expect(page.indexOf("assignment.status === 'retired'")).toBeGreaterThan(page.indexOf('This link is not valid'));
  // ...and an unknown token still gets that generic answer, so AC44 holds.
  expect(page).toContain('This link is not valid');

  const route = read('src/app/api/crew/confirm/route.ts');
  expect(route).toContain("if (assignment.status === 'retired')");
  expect(route).toContain('{ status: 410 }');
  // Refused before the write, or it would satisfy the escalation for people
  // who have not answered.
  expect(route.indexOf("assignment.status === 'retired'")).toBeLessThan(route.indexOf("supabaseRest('PATCH'"));
});

test('AC81 the status CHECK allows retired, and the migration stays re-runnable', () => {
  const sql = read('supabase/migrations/20260818000000_crew_dispatch.sql');
  expect(sql).toContain("CHECK (status IN ('sent', 'confirmed', 'flagged', 'retired'))");
  // Widening a CHECK against a live table only works if the old one is dropped
  // first, and this file is hand-applied to a database that already has it.
  expect(sql).toContain('DROP CONSTRAINT IF EXISTS visit_dispatch_recipients_status_check;');
});

test('AC39 dispatched_at is stamped only when something actually sent', () => {
  const src = read('src/lib/homecare/dispatch.ts');
  expect(src).toContain('if (sentTo.length > 0) {');
  const stamp = src.slice(src.indexOf('if (sentTo.length > 0) {'));
  expect(stamp).toContain('dispatched_at:');
});

test('AC40 cancelling a visit clears its dispatch so a re-book is still chased', () => {
  const route = read('src/app/api/admin/service-quote/schedule/route.ts');
  const del = route.slice(route.indexOf('export async function DELETE'));
  expect(del).toContain("clearVisitDispatch(homeownerId, startAt, { reason: 'cancelled', visit })");
  expect(read('src/lib/homecare/dispatch.ts')).toContain("'DELETE',\n      `visit_dispatch?homeowner_id=eq.");
});

test('AC40 completing a visit clears its dispatch too, but retracts nothing', () => {
  // Same stale row as a cancel leaves: a re-booking of that window would find
  // an already-'confirmed' assignment and a nudged_at that says it has been
  // chased. The clear is scoped to the windows this call actually closed - and
  // it is COMPLETED, not cancelled, because the job happened: mailing "you are
  // not going" about work somebody just finished would be a lie.
  const route = read('src/app/api/admin/service-quote/complete/route.ts');
  expect(route).toContain("clearVisitDispatch(homeownerId, new Date(iso), { reason: 'completed' })");
  expect(route).toContain('for (const iso of completedVisitStarts)');
  expect(route).toContain('dispatch,');
  // And it resolves no visit context on the way: `visit` is read only by the
  // retraction, which a completion never sends, so doing it anyway would be
  // three Supabase round trips per window for a value nobody looks at.
  expect(route).not.toContain('visitContextFor');
});

test('AC40 a reschedule clears the dispatch for the window it moved off', () => {
  const route = read('src/app/api/admin/service-quote/schedule/route.ts');
  const post = route.slice(route.indexOf('export async function POST'), route.indexOf('/** The owner'));
  expect(post).toContain("clearVisitDispatch(homeowner.id, when, { reason: 'cancelled', visit })");
  // Read before the upsert vacates the window, or there is nothing left to
  // describe in the retraction.
  expect(post.indexOf('const vacated = await Promise.all')).toBeLessThan(post.indexOf('await scheduleVisit('));
});

/* ── confirming (AC 41-49) ───────────────────────────────────────────────── */

test('AC41 the confirm page mutates nothing on GET', () => {
  const page = code('src/app/crew/confirm/[token]/page.tsx');
  expect(page).toContain('lookupByToken');
  for (const verb of ['PATCH', 'POST', 'DELETE', 'supabaseRest']) {
    expect(page).not.toContain(verb);
  }
});

test('AC41 lookupByToken issues only reads', () => {
  const src = code('src/lib/homecare/dispatch.ts');
  const fn = src.slice(src.indexOf('export async function lookupByToken'), src.indexOf('export async function clearVisitDispatch'));
  expect(fn).not.toContain("'PATCH'");
  expect(fn).not.toContain("'POST'");
  expect(fn).not.toContain("'DELETE'");
});

test('AC42 the confirm API exposes POST only - no GET handler to be prefetched', () => {
  const route = read('src/app/api/crew/confirm/route.ts');
  expect(route).toContain('export async function POST');
  expect(route).not.toContain('export async function GET');
});

test('AC43 the confirm page is noindex', () => {
  const page = read('src/app/crew/confirm/[token]/page.tsx');
  expect(page).toContain('robots: { index: false, follow: false }');
});

test('AC44 an unknown token gets a generic answer that cannot be used to enumerate', () => {
  const route = read('src/app/api/crew/confirm/route.ts');
  expect(route).toContain("error: 'This link is not valid.'");
  expect(route).not.toContain('token not found');
});

test('AC45 a cancelled visit shows "no longer on the books" instead of a confirm button', () => {
  const page = read('src/app/crew/confirm/[token]/page.tsx');
  expect(page).toContain('if (!visit?.stillBooked)');
  expect(page).toContain('no longer on the books');
});

test('AC46 "Something is wrong" opens a note field rather than submitting', () => {
  const actions = read('src/app/crew/confirm/[token]/CrewConfirmActions.tsx');
  expect(actions).toContain('onClick={() => setShowNote(true)}');
  const openBtn = actions.slice(actions.indexOf('data-testid="crew-flag-open"'), actions.indexOf('Something is wrong'));
  expect(openBtn).not.toContain("submit('flag')");
});

test('AC47+AC48 a flag stores the note, a confirm clears it, and both stamp the time', () => {
  const route = read('src/app/api/crew/confirm/route.ts');
  expect(route).toContain("note: action === 'flag' ? (note ?? null) : null");
  expect(route).toContain('confirmed_at: now');
});

test('AC49 /api/crew/ is public in middleware, guarded by the token', () => {
  const mw = read('src/middleware.ts');
  const publicBlock = mw.slice(mw.indexOf('const PUBLIC_ROUTES'), mw.indexOf('function isPublicRoute'));
  expect(publicBlock).toContain("'/api/crew/'");
  // and it must NOT have been added to the admin-session list by accident
  const adminBlock = mw.slice(mw.indexOf('const ADMIN_AUTH_ROUTES'), mw.indexOf('const CRON_AUTH_ROUTES'));
  expect(adminBlock).not.toContain('/api/crew');
});

/* ── escalation (AC 50-65) ───────────────────────────────────────────────── */

const cron = () => read('src/app/api/cron/visit-dispatch-escalation/route.ts');

test('AC50+AC51+AC52 both stages are scheduled, and both land before the customer reminder', () => {
  const vercel = JSON.parse(read('vercel.json')) as { crons: { path: string; schedule: string }[] };
  const nudge = vercel.crons.find((c) => c.path.includes('stage=nudge'));
  const escalate = vercel.crons.find((c) => c.path.includes('stage=escalate'));
  const reminder = vercel.crons.find((c) => c.path === '/api/cron/visit-reminders');
  expect(nudge?.schedule).toBe('0 21 * * *');
  expect(escalate?.schedule).toBe('0 22 * * *');
  expect(reminder?.schedule).toBe('30 23 * * *');

  // Same fixed-UTC convention as the reminder, so the order holds in both
  // seasons: 21:00 < 22:00 < 23:30 regardless of DST.
  const minutes = (s: string) => Number(s.split(' ')[1]) * 60 + Number(s.split(' ')[0]);
  expect(minutes(nudge!.schedule)).toBeLessThan(minutes(escalate!.schedule));
  expect(minutes(escalate!.schedule)).toBeLessThan(minutes(reminder!.schedule));
});

test('AC53 the escalation reads visits from homeowner_maintenance, not from visit_dispatch', () => {
  const src = cron();
  const query = src.slice(src.indexOf('const visits = ('), src.indexOf('if (visits.length === 0)'));
  expect(query).toContain('homeowner_maintenance?select=');
  expect(query).toContain('scheduled_start=gte.');
  expect(query).not.toContain('visit_dispatch?select=');
});

test('AC54 tasks sharing a window are grouped into one visit', () => {
  expect(cron()).toContain('const key = `${v.homeowner_id}|${v.scheduled_start}`;');
});

test('AC55 only a confirmation stops the chase - a flag does not', () => {
  // A flag says this visit has a PROBLEM, and the customer is still told at
  // 7:30pm that we are coming. Treating it as answered made flagging strictly
  // worse than ignoring the email: both stages went quiet and nobody was told.
  const src = cron();
  expect(src).toContain("mine.some((a) => a.status === 'confirmed')");
  expect(src).not.toContain("a.status === 'confirmed' || a.status === 'flagged'");
});

test('AC55 both stages carry the flag note, so the owner sees what is wrong', () => {
  const src = cron();
  expect(src).toContain("const flagged = mine.filter((a) => a.status === 'flagged');");
  expect(src).toContain('flagged a problem');
  expect(src).toContain('escapeTelegram(a.note)');
});

test('AC56 a stage already stamped is skipped, making a retry a no-op', () => {
  expect(cron()).toContain('if (dispatch && dispatch[stampColumn])');
});

test('AC57 the stamp is claimed before the send, re-asserting is.null', () => {
  const src = cron();
  expect(src).toContain('${stampColumn}=is.null');
  expect(src.indexOf('${stampColumn}=is.null')).toBeLessThan(src.indexOf('await sendTelegramMessage(text)'));
});

test('AC58 a failed send releases its stamp so a re-hit can still get through', () => {
  const src = cron();
  const failure = src.slice(src.indexOf('} else {\n        failed.push(label);'));
  expect(failure).toContain(`{ [stampColumn]: null }`);
});

test('AC59+AC60 a visit with no dispatch row is chased, and skipped if no row can be made', () => {
  const src = cron();
  expect(src).toContain('if (!dispatch) {');
  expect(src).toContain('ensureVisitDispatch({ homeownerId: first.homeowner_id, visitStart: start })');
  expect(src).toContain('skipping to avoid repeat sends');
});

test('AC61+AC62 the message carries the details, and the two stages differ on urgency', () => {
  const src = cron();
  expect(src).toContain('No dispatch was ever sent for this visit');
  expect(src).toContain('about 90 minutes from now');
  expect(src).toContain('told we are coming at 7:30pm tonight');
});

test('AC63 Telegram HTML is escaped', () => {
  expect(escapeTelegram('Ben & Co <script>')).toBe('Ben &amp; Co &lt;script&gt;');
  const src = cron();
  // Every interpolation into the message body goes through the escaper.
  const message = src.slice(src.indexOf('const text = ['), src.indexOf('const outcome = await sendTelegramMessage'));
  for (const match of message.matchAll(/\$\{(?!escapeTelegram)([a-zA-Z][\w.?]*)\}/g)) {
    throw new Error(`unescaped interpolation in the Telegram message: ${match[1]}`);
  }
});

test('AC64 dryRun reports who would be chased and stamps nothing', () => {
  const src = cron();
  expect(src).toContain('if (dryRun) continue;');
  expect(src.indexOf('if (dryRun) continue;')).toBeLessThan(src.indexOf('${stampColumn}=is.null'));
});

test('AC65 a run that could not deliver reports itself failed', () => {
  const src = cron();
  expect(src).toContain('ok: failed.length === 0');
  expect(src).toContain("degraded: 'escalation_send_failed'");
});

/* ── flagging reaches somebody (AC 66-67) ────────────────────────────────── */

const confirmRoute = () => read('src/app/api/crew/confirm/route.ts');

test('AC66 a flag Telegrams the office at once, with who, which visit, and the note', () => {
  const src = confirmRoute();
  expect(src).toContain('sendTelegramMessage');
  const alert = src.slice(src.indexOf('async function notifyFlag'));
  expect(alert).toContain('A visit has been flagged');
  // Who, the visit, and what they typed - all of it escaped.
  for (const field of [
    'escapeTelegram(who)',
    'escapeTelegram(visit?.customerName',
    'escapeTelegram(when)',
    'escapeTelegram(visit.address)',
    'escapeTelegram(note)',
  ]) {
    expect(alert).toContain(field);
  }
  for (const match of alert.matchAll(/\$\{(?!escapeTelegram)([a-zA-Z][\w.?]*)\}/g)) {
    throw new Error(`unescaped interpolation in the flag alert: ${match[1]}`);
  }
});

test('AC66 a confirm sends no Telegram - only a flag does', () => {
  const src = confirmRoute();
  expect(src).toContain("if (action === 'confirm') return NextResponse.json({ status: 'confirmed' });");
  expect(src.indexOf("if (action === 'confirm') return")).toBeLessThan(src.indexOf('await notifyFlag('));
});

test('AC67 the flag is recorded before the Telegram, and a failed send is logged not returned', () => {
  const src = confirmRoute();
  expect(src.indexOf("status: action === 'confirm' ? 'confirmed' : 'flagged'"))
    .toBeLessThan(src.indexOf('await notifyFlag('));
  const after = src.slice(src.indexOf('const notified = '));
  expect(after).toContain('console.error');
  expect(after).toContain("return NextResponse.json({ status: 'flagged', notified });");
});

test('AC74 only the transition into a flag alerts, so one token cannot flood the chat', () => {
  // This route is public and unthrottled, and the token rides in an email that
  // can be forwarded. Judged against the row as it was BEFORE the PATCH, or the
  // status just written would make every flag look like a repeat.
  const src = confirmRoute();
  expect(src).toContain(
    "const repeat = assignment.status === 'flagged' && (assignment.note ?? null) === (note ?? null);",
  );
  expect(src).toContain("const notified = repeat ? 'duplicate' as const : await notifyFlag(");
  expect(src.indexOf('const repeat =')).toBeGreaterThan(src.indexOf("supabaseRest('PATCH'"));
});

test('AC75 the flag alert reads the other assignments rather than asserting nobody confirmed', () => {
  const src = confirmRoute();
  // The escalation skips any visit somebody has confirmed, so when a colleague
  // already answered this alert is the ONLY message the owner gets about the
  // problem. It cannot be the one that says something false.
  expect(src).not.toContain('Nobody has confirmed it.');
  const verdict = src.slice(src.indexOf('async function siblingVerdict'));
  expect(verdict).toContain('assignmentsForDispatch(dispatch.id)');
  // Live siblings only - somebody retired off the visit is not a colleague who
  // has answered it.
  expect(verdict).toContain('liveAssignments(rows).filter((a) => a.id !== assignment.id)');
  expect(verdict).toContain("a.status === 'confirmed'");
  expect(verdict).toContain('escapeTelegram(confirmed.join');
  // A read that failed says so rather than guessing either way.
  expect(verdict).toContain('could not be read');
});

test('AC49 a server error on this public route leaks no Supabase detail', () => {
  const src = confirmRoute();
  // The thrown message carries the table name, the token filter and PostgREST's
  // own error body. It is logged, never returned.
  expect(src).toContain("{ error: 'server_error' }");
  expect(src).not.toContain('{ error: message }');
  expect(src).toContain('console.error');
});

/* ── retiring a visit (AC 68-72) ─────────────────────────────────────────── */

const cancelIcs = (over: Partial<Parameters<typeof buildIcs>[0]> = {}) =>
  ics({ cancel: true, sequence: 1, ...over });

test('AC68 a retraction is METHOD:CANCEL and STATUS:CANCELLED', () => {
  const out = cancelIcs();
  expect(out).toContain('METHOD:CANCEL');
  expect(out).not.toContain('METHOD:REQUEST');
  expect(out).toContain('STATUS:CANCELLED');
  expect(out).not.toContain('STATUS:CONFIRMED');
  // It still names who is being uninvited, and by whom.
  expect(out).toContain(`ORGANIZER;CN=La Vaca General Contractors:mailto:${ICS_ORGANIZER}`);
  expect(out).toContain('mailto:veronica@lavacagc.com');
});

test('AC69 a retraction carries the invite UID and a higher SEQUENCE', () => {
  expect(crewIcsUid('DISPATCH', 'RECIPIENT')).toBe('lavaca-crew-DISPATCH-RECIPIENT');
  // Same UID as the invite, so a client removes the event it holds rather than
  // filing a second, cancelled one beside it.
  const invite = ics({ uid: crewIcsUid('D', 'R'), sequence: 0 });
  const retraction = cancelIcs({ uid: crewIcsUid('D', 'R'), sequence: 1 });
  expect(invite).toContain('UID:lavaca-crew-D-R');
  expect(retraction).toContain('UID:lavaca-crew-D-R');
  expect(invite).toContain('SEQUENCE:0');
  expect(retraction).toContain('SEQUENCE:1');

  const src = read('src/lib/homecare/dispatch.ts');
  expect(src).toContain('const sequence = (dispatch.ics_sequence ?? 0) + 1;');
  expect(src).toContain('uid: crewIcsUid(dispatch.id, assignment.recipient_id)');
});

test('AC70 a retraction carries NO alarm - it must never say "text the customer"', () => {
  const out = cancelIcs();
  expect(out).not.toContain('BEGIN:VALARM');
  expect(out).not.toContain('when the crew is on the way');
  // ...while the invite it retracts still carries both.
  expect(ics().split('BEGIN:VALARM').length - 1).toBe(2);
});

test('AC70 the cancelled email tells them not to text the customer', () => {
  const { subject, html, text } = buildDispatchCancelledEmail({
    recipientName: 'Veronica',
    customerName: 'Jordan Caruso',
    address: '14 Maple Ave, West Orange, NJ',
    services: ['Clean gutters & downspouts'],
    visitDateLabel: 'Wed 5 Aug',
    timeWindow: '8:00 - 11:00am',
  });
  expect(subject).toBe(`${CANCELLED_PREFIX} Wed 5 Aug, 8:00 - 11:00am - 14 Maple Ave`);
  expect(html).toContain('Do not text ');
  expect(html).toContain('Jordan Caruso');
  expect(text).toContain('Do not text the customer about it');
  // Internal mail, exactly like the dispatch it retracts.
  expect(html.toLowerCase()).not.toContain('unsubscribe');
  expect(html).not.toContain('51 Crestmont Rd');
});

test('AC71 the recipients are read before the row is deleted, or they cascade away', () => {
  const src = read('src/lib/homecare/dispatch.ts');
  const fn = src.slice(src.indexOf('export async function clearVisitDispatch'));
  expect(fn.indexOf('assignmentsForDispatch(dispatch.id)')).toBeLessThan(fn.indexOf("'DELETE',"));
  expect(fn.indexOf("'DELETE',")).toBeLessThan(fn.indexOf('sendDispatchRetraction('));
});

test('AC72 only a cancelled visit whose dispatch actually sent, and is still ahead, is retracted', () => {
  const src = read('src/lib/homecare/dispatch.ts');
  expect(src).toContain(
    "if (reason === 'cancelled' && dispatch?.dispatched_at && assignments.length > 0\n"
      + '      && visitStart.getTime() > now.getTime()) {',
  );
  // Injectable, so the cutoff is testable rather than only observable in
  // production - the same shape crossSeasonBookings uses.
  expect(src).toContain("opts: { reason: 'cancelled' | 'completed'; visit?: VisitContext | null; now?: Date },");
});

test('AC72 a window already past is cleared but never mailed about', () => {
  // A visit that has already started has no 7:00am alarm left to fire, so
  // "[CANCELLED] ... you are not going" about it is pure noise on the one
  // channel that has to stay worth reading - and re-booking a service into a
  // later window in the same season puts exactly such a window through here.
  const src = read('src/lib/homecare/dispatch.ts');
  const fn = src.slice(src.indexOf('export async function clearVisitDispatch'));
  // The row still goes, whatever the answer: a stale row is what makes the next
  // booking of that window inherit the stamps that say it has been chased.
  expect(fn.indexOf("'DELETE',")).toBeLessThan(fn.indexOf('visitStart.getTime() > now.getTime()'));
  expect(fn).toContain("return { status: 'cleared', retraction, unretracted };");
});

test('AC79 a retraction that did not land is reported, never assumed', () => {
  const src = read('src/lib/homecare/dispatch.ts');
  // The per-recipient failure is collected rather than only logged...
  const send = src.slice(src.indexOf('async function sendDispatchRetraction'));
  expect(send).toContain('unretracted.push(assignment.email)');
  expect(send).toContain('return unretracted;');
  // ...and a throw is treated as nobody having been told, not as success.
  expect(src).toContain('return assignments.map((a) => a.email);');
  expect(src).toContain("retraction = unretracted.length > 0 ? 'send_failed' : 'sent';");
});

test('AC79 both callers surface it - the cancel response and the reschedule', () => {
  const route = read('src/app/api/admin/service-quote/schedule/route.ts');
  // A cancel hands the whole verdict back, next to the reminder's.
  expect(route).toContain("return NextResponse.json({ status: 'cancelled', reminder, dispatch });");
  // A reschedule used to discard it entirely, which made a failed retraction on
  // a moved visit invisible even in the response.
  expect(route).toContain('const retired: { when: Date; result: ClearDispatchResult }[] = [];');
  expect(route).toContain('const stillHolding = [...new Set(retired.flatMap((r) => r.result.unretracted))];');
  expect(route).toContain('stillHolding,');

  const page = read('src/app/vaca-mgmt/send-service-quote/page.tsx');
  expect(page).toContain('data.dispatch?.unretracted ?? []');
  expect(page).toContain('The crew could NOT be told it is off');
  expect(page).toContain('data.stillHolding ?? []');
  expect(page).toContain('will text the customer about it at 7:00am');
});

test('AC83 a dispatch row that would not come off is never reported as a clean cancel', () => {
  // The catch returns BEFORE the retraction is attempted, so an empty
  // `unretracted` alongside 'unavailable' means nobody was told - not that
  // everybody was.
  const lib = read('src/lib/homecare/dispatch.ts');
  const guard = lib.slice(lib.indexOf("return { status: 'unavailable'"));
  expect(guard.indexOf('sendDispatchRetraction')).toBeGreaterThan(guard.indexOf("retraction: 'not_needed'"));

  const page = read('src/app/vaca-mgmt/send-service-quote/page.tsx');
  // The cancel toast reads the row's own verdict, says what it means, and is
  // destructive on it.
  expect(page).toContain("const dispatchStale = data.dispatch?.status === 'unavailable';");
  expect(page).toContain('The crew record could NOT be cleared');
  expect(page).toContain('variant: stranded || dispatchStale || stillHolding.length > 0');
  // The complete toast reads the `dispatch` the route has always returned.
  expect(page).toContain("const dispatchStale = data.dispatch === 'unavailable';");
  expect(page).toContain('variant: stranded || dispatchStale ? ');
  // And the reschedule names the window it could not retire.
  expect(page).toContain('const unretiredWindows: string[] = data.unretiredWindows ?? [];');
  expect(page).toContain('The crew record for the OLD window could NOT be retired');
  expect(page).toContain('|| unretiredWindows.length > 0');

  const schedule = read('src/app/api/admin/service-quote/schedule/route.ts');
  expect(schedule).toContain("const unretiredWindows = retired\n      .filter((r) => r.result.status === 'unavailable')");
  expect(schedule).toContain('unretiredWindows,');
  const complete = read('src/app/api/admin/service-quote/complete/route.ts');
  expect(complete).toContain("if (cleared.status === 'unavailable') dispatch = 'unavailable';");
});

test('AC84 a dispatch read that failed reads as unknown, never as never-dispatched', () => {
  const intake = read('src/app/api/admin/service-quote/intake/route.ts');
  // Both queries: a partial failure on either one used to make every visit read
  // as never dispatched, and the screen renders nothing at all in that state -
  // so a flagged visit vanished from the only surface a flag reaches, taking
  // its "Mark handled" button with it.
  expect(intake.match(/\.catch\(\(\) => null\)/g) ?? [], 'both reads fail closed').toHaveLength(2);
  expect(intake).toContain('if (read === null) return unreadable();');
  expect(intake).toContain('if (answered === null) return unreadable();');
  expect(intake).toContain('dispatch: UNKNOWN_DISPATCH_STATE');
  // An EMPTY read is still 'none' - that is a visit nobody was dispatched for,
  // which is a different thing from one we could not read.
  expect(intake).toContain('if (dispatches.length === 0) return bookings.map((b) => ({ ...b, dispatch: blank }));');

  const lib = read('src/lib/homecare/dispatch.ts');
  expect(lib).toContain("state: 'unknown', confirmedBy: [], flags: []");

  const page = read('src/app/vaca-mgmt/send-service-quote/page.tsx');
  expect(page).toContain("b.dispatch.state === 'unknown' ?");
  expect(page).toContain('Could not read what the crew has said');
});

test('AC80 a missing scheduled_end resolves through visitEndsAt, never a second literal', () => {
  // visitEndsAt says two hours. Spelling an hour here made the 5pm Telegram and
  // the crew confirm page describe one visit as "8:00 - 10:00am" and
  // "8:00 - 9:00am", and the CANCEL .ics inherited the shorter one.
  const src = read('src/lib/homecare/dispatch.ts');
  expect(src).toContain('end: new Date(visitEndsAt(key, endIso))');
  expect(src).toContain('visit?.end ?? new Date(visitEndsAt(visitKey(visitStart), null))');
  expect(src, 'no third copy of the fallback').not.toContain('3600_000');
});

test('AC72 the retraction never carries a preferenceStream either', () => {
  const src = code('src/lib/homecare/dispatch.ts');
  expect(src).not.toContain('preferenceStream');
  expect(src).toContain("category: 'crew_dispatch_cancelled'");
});

test('AC72 the retraction is auditable - its own category, filterable in the admin', () => {
  const page = read('src/app/vaca-mgmt/emails/page.tsx');
  expect(page).toContain("'crew_dispatch_cancelled'");
  expect(page).toContain("if (c === 'crew_dispatch_cancelled') return 'Crew dispatch cancelled';");
});

/* ── clearing a flag (AC 76-78) ──────────────────────────────────────────── */

test('AC78 a flag outranks a confirmation when the state is summarised', () => {
  const a = (over: Partial<DispatchAssignment>): DispatchAssignment => ({
    id: 'a1', dispatch_id: 'd1', recipient_id: 'r1', email: 'alex@lavacagc.com',
    name: 'Alex', confirm_token: 't', status: 'sent', confirmed_at: null, note: null, ...over,
  });

  expect(dispatchStateOf([]).state).toBe('none');
  expect(dispatchStateOf([a({})]).state).toBe('awaiting');
  expect(dispatchStateOf([a({ status: 'confirmed' })]).state).toBe('confirmed');
  // A colleague having confirmed silences the 5pm and 6pm chases, which is
  // exactly why the problem somebody raised has to stay visible here.
  const mixed = dispatchStateOf([
    a({ status: 'confirmed' }),
    a({ id: 'a2', recipient_id: 'r2', name: 'Veronica', status: 'flagged', note: 'sub cancelled' }),
  ]);
  expect(mixed.state).toBe('flagged');
  expect(mixed.confirmedBy).toEqual(['Alex']);
  expect(mixed.flags).toEqual([{ by: 'Veronica', note: 'sub cancelled' }]);
});

test('AC77 the admin list shows each visit\'s dispatch state, read with the bookings', () => {
  const intake = read('src/app/api/admin/service-quote/intake/route.ts');
  expect(intake).toContain('withDispatchState(homeowner.id, groupBookings(');
  expect(intake).toContain('dispatchStateOf(byDispatch.get(d.id) ?? [])');
  // Matched on the instant: PostgREST's "+00:00" and a Date's "Z" are the same
  // moment spelled two ways, and matching the text would read every visit as
  // never dispatched.
  expect(intake).toContain('stateByStart.get(new Date(b.start).getTime())');

  const page = read('src/app/vaca-mgmt/send-service-quote/page.tsx');
  expect(page).toContain('data-testid="sq-dispatch-state"');
  expect(page).toContain('Crew has not answered yet');
  expect(page).toContain('Flagged by ');
});

test('AC76 clearing a flag is an admin action, and only the flagged rows move', () => {
  const route = read('src/app/api/admin/service-quote/dispatch/route.ts');
  // Under /api/admin/, so middleware gates it on the admin session - NOT the
  // public token endpoint, which is guarded by a link in somebody's inbox.
  expect(route).toContain('handleFlagSchema');
  expect(route).toContain('&status=eq.flagged');
  expect(route).toContain("{ status: 'confirmed', confirmed_at: now, updated_at: now }");
  // Somebody who never answered still has not answered.
  expect(route).not.toContain("status=eq.sent");
  // The note stays: it is the record of what was wrong, and the visit being
  // sorted does not make it untrue.
  expect(route).not.toContain('note: null');

  const page = read('src/app/vaca-mgmt/send-service-quote/page.tsx');
  expect(page).toContain("fetch('/api/admin/service-quote/dispatch'");
  expect(page).toContain('data-testid="sq-handled"');
  // Confirm-gated, the same as "Mark completed".
  expect(page).toContain('window.confirm(\'Mark this flag handled?');
  // And offered only where there is a flag to clear.
  expect(page).toContain("b.dispatch?.state === 'flagged' && (");
});

/* ── row-level security (AC 73) ──────────────────────────────────────────── */

test('AC73 RLS is enabled on all three dispatch tables', () => {
  const sql = read('supabase/migrations/20260818000000_crew_dispatch.sql');
  for (const table of ['dispatch_recipients', 'visit_dispatch', 'visit_dispatch_recipients']) {
    expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table}\\s+ENABLE ROW LEVEL SECURITY;`));
  }
  // No policy: every reader reaches these through the secret key, which
  // bypasses RLS. A policy would be the only way anon could see a token.
  expect(sql).not.toContain('CREATE POLICY');
});

test('AC73 the migration stays idempotent - it is hand-applied to a live database', () => {
  const sql = read('supabase/migrations/20260818000000_crew_dispatch.sql');
  for (const create of sql.match(/CREATE TABLE[^(]*/g) ?? []) {
    expect(create).toContain('IF NOT EXISTS');
  }
  for (const index of sql.match(/CREATE (UNIQUE )?INDEX[^(]*/g) ?? []) {
    expect(index).toContain('IF NOT EXISTS');
  }
  for (const column of sql.match(/ADD COLUMN[^,\n]*/g) ?? []) {
    expect(column).toContain('IF NOT EXISTS');
  }
});

/* ── what was deliberately not built ─────────────────────────────────────── */

test('nothing in the feature talks to a Google API or reads a mailbox', () => {
  for (const f of [
    'src/lib/homecare/dispatch.ts',
    'src/lib/homecare/dispatchEmail.ts',
    'src/lib/homecare/ics.ts',
    'src/app/api/cron/visit-dispatch-escalation/route.ts',
  ]) {
    const src = read(f);
    expect(src).not.toContain('googleapis');
    expect(src).not.toContain('gmail');
    expect(src).not.toContain('oauth');
  }
});

test('no automated "on our way" customer email was added', () => {
  // The owner chose a real text sent by a person. The only thing that mentions
  // being on the way is the 7:00am alarm and the crew-facing copy.
  const dispatchSrc = read('src/lib/homecare/dispatch.ts');
  expect(dispatchSrc).not.toContain("category: 'visit_reminder'");
  const service = read('src/lib/homecare/serviceEmails.ts');
  expect(service).toContain("We'll text you when we're on our way");
});

test('the live reminder copy promising a text is untouched', () => {
  const service = read('src/lib/homecare/serviceEmails.ts');
  expect(service).toContain("so you'll know roughly when to expect the knock");
});
