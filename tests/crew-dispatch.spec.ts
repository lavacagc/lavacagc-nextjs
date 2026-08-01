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
  const stamp = src.slice(src.indexOf("const recorded: 'ok' | 'unavailable' ="));
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

test('AC92 a crew list that could not be READ is never shown as an empty one', () => {
  // These lead to OPPOSITE outcomes, so they cannot share a rendering. A read
  // that failed leaves no selection to send, and no selection means the server
  // dispatches to every active recipient - while the empty-list copy says
  // "nobody is told about this visit". The screen warned that nobody would be
  // dispatched at the precise moment everybody was.
  const page = read('src/app/vaca-mgmt/send-service-quote/page.tsx');
  const effect = page.slice(page.indexOf('useEffect(() => {'), page.indexOf('const toggleCrew ='));
  expect(effect).toContain('if (!res.ok) throw new Error(');
  expect(effect).toContain("setCrewRead('unavailable');");
  // Nothing is replaced before res.ok is checked, so a failed read cannot empty
  // a list that had loaded.
  expect(effect.indexOf('if (!res.ok)')).toBeLessThan(effect.indexOf('setCrew(active)'));

  expect(page).toContain("{crewRead === 'unavailable' ? (");
  expect(page).toContain('The crew list could NOT be read');
  expect(page).toContain('still emails EVERY active crew member');
  // The genuinely-empty copy survives, because for an empty list it is true.
  expect(page).toContain('without one, nobody is told about this visit');
  // ...and it is only reachable once the read succeeded.
  expect(page.indexOf("crewRead === 'unavailable' ? (")).toBeLessThan(page.indexOf(') : crew.length === 0 ? ('));

  // The Crew page itself is the same shape: its toast fades, and what stays on
  // screen would otherwise say nobody is on the list.
  const crewPage = read('src/app/vaca-mgmt/crew/page.tsx');
  expect(crewPage).toContain("setRead('unavailable');");
  expect(crewPage).toContain('The crew list could NOT be read - this is not an empty list');
  expect(crewPage).toContain("read === 'unavailable'\n              ? 'The list could not be read");
  expect(crewPage.indexOf("read === 'unavailable' ? (")).toBeLessThan(crewPage.indexOf('crew.length === 0 ? ('));
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
  expect(fn).toContain('const existing = await dispatchForVisit(args.homeownerId, args.visitStart);');
  expect(fn).toContain('if (existing) {');
  expect(fn).toContain("return { row: existing, subRecorded: 'ok' };");
  expect(fn).not.toContain('nudged_at: null');
});

test('AC96 the dispatch row is a read-then-insert that survives losing the race', () => {
  const src = read('src/lib/homecare/dispatch.ts');
  const fn = src.slice(src.indexOf('export async function ensureVisitDispatch'), src.indexOf('export interface EnsureAssignmentsResult'));
  // NOT an upsert, whatever the comment used to say: `onConflict` switches the
  // Prefer header to return=minimal (supabase-rest.ts), so `created?.[0]` would
  // be undefined and every FIRST dispatch would report 'unavailable'.
  expect(fn).not.toContain('onConflict');
  expect(src.slice(0, src.indexOf('export async function ensureAssignments')))
    .not.toContain('Upserts on (homeowner_id, visit_start)');
  // So the conflict is recovered where it happens: two callers that both missed
  // the row race, the loser's insert violates idx_visit_dispatch_visit, and it
  // reads the winner's row rather than failing a booking over a race it lost.
  expect(fn).toContain('const row = created?.[0]\n    ?? await dispatchForVisit(args.homeownerId, args.visitStart).catch(() => null);');
  expect(read('supabase/migrations/20260818000000_crew_dispatch.sql'))
    .toContain('idx_visit_dispatch_visit');
});

test('AC90 a sub the row would not store is reported, not just logged', () => {
  // The email is right - it is built from the value handed back - so the
  // divergence is invisible from everywhere else: the confirm page drops its
  // "Sub" row and its "sub is booked" wording, and a flag alert about this
  // visit cannot name who was booked for it.
  const src = read('src/lib/homecare/dispatch.ts');
  const fn = src.slice(src.indexOf('export async function ensureVisitDispatch'), src.indexOf('export interface EnsureAssignmentsResult'));
  expect(fn).toContain("}).then(() => 'ok' as const).catch((err) => {");
  expect(fn).toContain("return 'unavailable' as const;");
  // What the admin typed still goes in the email either way.
  expect(fn).toContain('return { row: { ...existing, sub_name: sub }, subRecorded };');

  // Carried through the send's verdict, so a stored-nowhere sub cannot report
  // a clean 'sent'...
  expect(src).toContain("|| recorded === 'unavailable' || subRecorded === 'unavailable';");
  expect(src).toContain('return { outcome, sentTo, stillLive, notMailed, recorded, subRecorded };');

  // ...through the response...
  const route = read('src/app/api/admin/service-quote/schedule/route.ts');
  expect(route).toContain('dispatchSubRecorded: dispatch.subRecorded,');

  // ...and into the toast, which is the only place the divergence is ever said,
  // in BOTH directions: a sub the row would not store, and one it would not
  // clear. The second one has no name to put in the sentence, so it cannot
  // share the first one's wording.
  const page = read('src/app/vaca-mgmt/send-service-quote/page.tsx');
  expect(page).toContain("data.dispatchSubRecorded !== 'unavailable'");
  expect(page).toContain('is NOT stored on the visit');
  expect(page).toContain('The sub could NOT be cleared from the visit');
  expect(page).toContain('any flag alert will not');
  expect(page).toContain('still name them');
  expect(page).toContain('+ recordLine + subLine + movedLine + staleLine');
});

test('AC93 whatever is in the sub box wins - an empty one clears it', () => {
  // The fill-only rule was borrowed from ensureServiceHomeowner, where "only
  // fill blanks" is right because the CUSTOMER owns the data. The admin is the
  // sole author of this field, so the same rule made a sub write-once per
  // window: the crew were re-mailed "Sub: Ramirez Exteriors - confirm they are
  // booked" for a sub who had fallen through, with no way to correct it short
  // of cancelling the visit and re-booking it.
  const src = read('src/lib/homecare/dispatch.ts');
  const fn = src.slice(src.indexOf('export async function ensureVisitDispatch'), src.indexOf('export interface EnsureAssignmentsResult'));
  // ABSENT and EMPTY stop meaning the same thing, and the write happens for
  // anything supplied - including the null a cleared box becomes.
  expect(fn).toContain('const sub = args.subName === undefined ? undefined : args.subName || null;');
  expect(fn).toContain('if (sub !== undefined && sub !== existing.sub_name) {');
  expect(fn).toContain('sub_name: sub, updated_at: new Date().toISOString(),');
  expect(fn, 'a fill-only guard is what made it write-once').not.toContain('if (args.subName &&');

  // The boundary has to keep them apart or the clear silently no-ops...
  const schema = read('src/app/api/admin/service-quote/_schema.ts');
  expect(schema).toContain("subName: z.string().trim().max(160).optional().transform((v) => (v === '' ? null : v)),");
  // ...and the page has to actually send the empty box.
  const page = read('src/app/vaca-mgmt/send-service-quote/page.tsx');
  expect(page).toContain('subName: subName.trim(),');
  expect(page).not.toContain('...(subName.trim() ? { subName: subName.trim() } : {})');

  // A caller that omits the field leaves the stored sub alone - which is why
  // this is absent-vs-empty rather than "always write". The escalation cron
  // passes no sub, and chasing a visit must not wipe one as a side effect.
  const cron = read('src/app/api/cron/visit-dispatch-escalation/route.ts');
  expect(cron).toContain('ensureVisitDispatch({ homeownerId: first.homeowner_id, visitStart: start })');
  expect(cron).not.toContain('subName');
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
  // is still dead - and names them, rather than dropping them silently.
  expect(fn).toContain("if (row && row.status !== 'retired') assignments.push(row);");
  expect(fn).toContain('else notMailed.push(r.email);');

  // Owner decision: their calendar event is deliberately NOT retracted, so no
  // METHOD:CANCEL is sent from here. AC82 is the mitigation.
  expect(fn).not.toContain('sendDispatchRetraction');
});

test('AC85 a retirement that did not land is reported, never rendered as a clean send', () => {
  // The worst failure in this module: it does not lose information, it disables
  // the safety net. The dropped person keeps a live token, and one tap from
  // them satisfies "somebody confirmed" for a visit the people actually going
  // have never answered - silencing both the 5pm and the 6pm chase.
  const src = read('src/lib/homecare/dispatch.ts');
  const fn = src.slice(src.indexOf('export async function ensureAssignments'), src.indexOf('export interface VisitContext'));
  expect(fn).toContain('stillLive.push(...dropped.map((a) => a.email));');
  expect(fn).toContain('return { assignments, stillLive, notMailed };');
  // Carried through the send's own verdict: a partial retirement never reports
  // 'sent'.
  expect(src).toContain(
    'const degraded = stillLive.length > 0 || notMailed.length > 0\n'
      + "    || recorded === 'unavailable' || subRecorded === 'unavailable';",
  );
  expect(src).toContain(
    "const outcome: DispatchOutcome = sentTo.length === 0 || anyFailed\n"
      + "    ? 'send_failed'\n"
      + "    : degraded ? 'sent_degraded' : 'sent';",
  );
  // A verdict reached before a later throw still comes back.
  expect(src).toContain(
    "return { outcome: 'unavailable', sentTo: [], stillLive, notMailed, recorded: 'ok', subRecorded, error };",
  );
  // ...and no write in the function throws out of it in the first place. The
  // insert and the retire PATCH hit the SAME table, so whatever breaks one
  // breaks both - which makes a combined failure the likeliest way to reach
  // that catch, and it would take the retirement verdict with it.
  const insert = fn.slice(fn.indexOf('const missing = recipients.filter'));
  expect(insert).toContain('crew dispatch could not create a record for');
  expect(insert).toContain('return [] as DispatchAssignment[];');
  // Those recipients then fall through to notMailed rather than being lost.
  expect(insert).toContain('else notMailed.push(r.email);');

  const route = read('src/app/api/admin/service-quote/schedule/route.ts');
  expect(route).toContain('crewStillLive: dispatch.stillLive,');
  expect(route).toContain('crewNotMailed: dispatch.notMailed,');

  const page = read('src/app/vaca-mgmt/send-service-quote/page.tsx');
  // Destructive and specific about what is still live - `bad` already fires on
  // any outcome that is not a clean 'sent'.
  expect(page).toContain('const crewStillLive: string[] = data.crewStillLive ?? [];');
  expect(page).toContain('could NOT be taken off this visit');
  expect(page).toContain('would stop the 5pm and 6pm chases');
  expect(page).toContain('const crewNotMailed: string[] = data.crewNotMailed ?? [];');
  expect(page).toContain('got NOTHING - their crew record could not be written');
  expect(page).toContain("const bad = data.reminder === 'unavailable' || data.dispatch !== 'sent'");
  // ...and a degraded send still says who was mailed, rather than telling the
  // admin to call people who did receive it.
  expect(page).toContain("data.dispatch === 'sent' || data.dispatch === 'sent_degraded'");
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
  const stamp = src.slice(src.indexOf("const recorded: 'ok' | 'unavailable' ="));
  expect(stamp).toContain("sentTo.length === 0 ? 'ok' : await supabaseRest(");
  expect(stamp).toContain('dispatched_at:');
});

test('AC85 a send the dispatch row does not know about is reported, not swallowed', () => {
  // The email is out and cannot be unsent, but a row that does not know it went
  // says two wrong things: the 5pm stage chases it as "nobody was ever told",
  // and cancelling the visit retracts NOTHING, because a retraction only goes
  // out for a dispatch that sent - leaving the crew the 7:00am alarm.
  const src = read('src/lib/homecare/dispatch.ts');
  const stamp = src.slice(src.indexOf("const recorded: 'ok' | 'unavailable' ="));
  expect(stamp).toContain("return 'unavailable' as const;");
  expect(stamp).toContain('so cancelling it will not take it off their calendars');
  expect(stamp, 'never swallowed into an empty catch').not.toContain('.catch(() => {})');
  // And it reaches the admin rather than only the log.
  expect(src).toContain("recorded === 'unavailable'");
  const route = read('src/app/api/admin/service-quote/schedule/route.ts');
  expect(route).toContain('dispatchRecorded: dispatch.recorded,');
  const page = read('src/app/vaca-mgmt/send-service-quote/page.tsx');
  expect(page).toContain("data.dispatchRecorded === 'unavailable'");
  expect(page).toContain('The dispatch is NOT recorded on the visit');
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
  expect(page).toContain('if (!visit.stillBooked)');
  expect(page).toContain('no longer on the books');
});

test('AC87 a visit that could not be READ is never rendered as a cancelled one', () => {
  // The admin screen showing 'none' hides information; this screen would tell
  // the person who is supposed to drive to the house that the job is off. They
  // then neither go nor confirm, and the 5pm chase reports "nobody has
  // confirmed" for a visit we told them was cancelled.
  const src = read('src/lib/homecare/dispatch.ts');
  const fn = src.slice(src.indexOf('export async function lookupByToken'), src.indexOf('export type RetractionOutcome'));
  // Through the same helper the retraction reads a visit through, so the two
  // cannot drift into different answers about the same failure.
  expect(fn).toContain('const read = await readVisitContext(row.homeowner_id, new Date(row.visit_start));');
  expect(fn).toContain("visit: read.status === 'ok' ? read.visit : null,");
  expect(fn).toContain("visitRead: read.status === 'ok' ? 'ok' : 'unavailable',");
  const helper = src.slice(src.indexOf('export async function readVisitContext'), src.indexOf('export interface TokenLookup'));
  expect(helper).toContain("return { status: 'unavailable' };");
  expect(helper).toContain("return visit ? { status: 'ok', visit } : { status: 'none' };");
  expect(helper).toContain('console.error');

  const page = read('src/app/crew/confirm/[token]/page.tsx');
  expect(page).toContain("if (visitRead === 'unavailable' || !visit) {");
  expect(page).toContain('We could not check this visit');
  expect(page).toContain('Do not assume it is cancelled');
  // Checked BEFORE the "no longer on the books" answer, or that one swallows it.
  expect(page.indexOf("visitRead === 'unavailable'")).toBeLessThan(page.indexOf('no longer on the books'));
});

test('AC91 a token read that FAILED is never rendered as an invalid link', () => {
  // The outer half of AC87. Both reads in the lookup can throw, and a catch
  // folding that into the null a missing token produces told a crew member
  // holding a perfectly good link that it was dead - sending them through their
  // inbox for a newer email that does not exist.
  const src = read('src/lib/homecare/dispatch.ts');
  const fn = src.slice(src.indexOf('export async function lookupByToken'), src.indexOf('export type RetractionOutcome'));
  expect(fn).toContain("return { status: 'unavailable' };");
  expect(fn).toContain("return { status: 'not_found' };");
  // Both reads are inside the try, so neither can escape as a throw the caller
  // has to remember to catch.
  expect(fn.indexOf('try {')).toBeLessThan(fn.indexOf('visit_dispatch_recipients?select='));
  expect(fn.indexOf('visit_dispatch?select=')).toBeLessThan(fn.indexOf('} catch (err) {'));

  const page = read('src/app/crew/confirm/[token]/page.tsx');
  expect(page).toContain("if (lookup.status === 'unavailable') {");
  expect(page).toContain('We could not check your link');
  expect(page).toContain('Your link is probably fine');
  // The generic answer stays for a token that really is unknown, so live tokens
  // still cannot be enumerated.
  expect(page).toContain("if (lookup.status === 'not_found') {");
  expect(page).toContain('This link is not valid');
  expect(page).not.toContain('lookupByToken(token).catch');

  // The route answered this correctly already, and still does - now off the
  // same verdict rather than a catch of its own, so the page and its API cannot
  // disagree about the same event again.
  const route = read('src/app/api/crew/confirm/route.ts');
  expect(route).toContain("if (lookup.status === 'unavailable') {");
  expect(route).toContain("error: 'server_error' }, { status: 500 }");
  expect(route).toContain("if (lookup.status === 'not_found') {");
  expect(route).toContain("error: 'This link is not valid.' }, { status: 404 }");
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

test('AC88 a claim that threw is not a lost race, and never reports ok', () => {
  // Both leave this run with nothing to send. Folding them together answered
  // ok:true with the visit filed under already_chased, so a permission error or
  // a 5xx dropped it from the last line of defence before the 7:30pm customer
  // reminder and said nothing at all.
  const src = cron();
  expect(src).toContain('.then((rows) => rows ?? []).catch((err) => {');
  expect(src).toContain('if (claimed === null) {\n        failed.push(label);');
  // Zero rows and no error is still the lost race, and still a correct skip.
  expect(src).toContain('if (claimed.length === 0) {\n        alreadyChased += 1;');
  expect(src).not.toContain('.catch(() => [] as VisitDispatchRow[])');
  // ...which turns the run's own verdict, since `failed` is what ok reads.
  expect(src).toContain('ok: failed.length === 0');
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

  // Both reads, not just the sibling one. The visit used to degrade quietly to
  // "A customer" with no address and no services, and no sign anything failed -
  // in the very case this alert is the only message the owner ever gets.
  const alert = src.slice(src.indexOf('async function notifyFlag'), src.indexOf('async function siblingVerdict'));
  expect(alert).toContain("visitRead === 'unavailable'");
  expect(alert).toContain('The visit itself could NOT be read');
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
  // And only when there IS a retraction to address. A completion retracts
  // nothing, so reading its recipients is a round trip per window for a value
  // that is then discarded.
  expect(fn).toContain('if (dispatch && retracting) assignments = await assignmentsForDispatch(dispatch.id);');
});

test('AC72 only a cancelled visit whose dispatch actually sent, and is still ahead, is retracted', () => {
  const src = read('src/lib/homecare/dispatch.ts');
  expect(src).toContain(
    "retracting = reason === 'cancelled' && Boolean(dispatch?.dispatched_at)\n"
      + '      && visitStart.getTime() > now.getTime();',
  );
  expect(src).toContain('if (retracting && dispatch && assignments.length > 0) {');
  // Injectable, so the cutoff is testable rather than only observable in
  // production - the same shape crossSeasonBookings uses.
  expect(src).toContain("opts: { reason: 'cancelled' | 'completed'; visit?: VisitContextRead | null; now?: Date },");
});

test('AC72 a window already past is cleared but never mailed about', () => {
  // A visit that has already started has no 7:00am alarm left to fire, so
  // "[CANCELLED] ... you are not going" about it is pure noise on the one
  // channel that has to stay worth reading - and re-booking a service into a
  // later window in the same season puts exactly such a window through here.
  const src = read('src/lib/homecare/dispatch.ts');
  const fn = src.slice(src.indexOf('export async function clearVisitDispatch'));
  // The row still goes, whatever the answer: a stale row is what makes the next
  // booking of that window inherit the stamps that say it has been chased. The
  // cutoff is worked out before the delete because it reads the row that is
  // about to go, and it gates the SEND alone - never the delete.
  expect(fn.indexOf('visitStart.getTime() > now.getTime()')).toBeLessThan(fn.indexOf("'DELETE',"));
  expect(fn.indexOf("'DELETE',")).toBeLessThan(fn.indexOf('if (retracting && dispatch'));
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

test('AC94 a retraction that cannot NAME the visit is never sent, and is reported', () => {
  // Both reads folded a failure into the same null an empty answer produces,
  // and the email went out built entirely from defaults: "the customer", a
  // blank address, no work, and a subject trailing off after the dash. That is
  // a cancellation the crew cannot tie to a job, and it reported 'sent'.
  const src = read('src/lib/homecare/dispatch.ts');
  const fn = src.slice(src.indexOf('export async function clearVisitDispatch'));
  expect(fn).toContain('const described = visit ?? await readVisitContext(homeownerId, visitStart);');
  expect(fn).toContain("if (described.status !== 'ok') {");
  expect(fn).toContain("retraction = 'unavailable';");
  // Nobody was told, so everybody is still holding it - the admin is the one
  // who has to make the call.
  expect(fn).toContain('unretracted = assignments.map((a) => a.email);');
  // With no defaults left to fall back on, the send cannot be reached without
  // something to name the job by.
  const send = src.slice(src.indexOf('async function sendDispatchRetraction'));
  expect(send).toContain('visit: VisitContext;');
  expect(send, 'no more inventing a customer').not.toContain("?? 'the customer'");

  // Both callers hand the READ down rather than its value, so a failed one can
  // still be told from a window with nothing in it.
  const route = read('src/app/api/admin/service-quote/schedule/route.ts');
  expect(route).toContain('visit: await readVisitContext(homeowner.id, when),');
  expect(route).toContain('const visit = await readVisitContext(homeownerId, startAt);');
  expect(route).not.toContain('visitContextFor');

  const page = read('src/app/vaca-mgmt/send-service-quote/page.tsx');
  expect(page).toContain("const undescribed = data.dispatch?.retraction === 'unavailable';");
  expect(page).toContain('the visit could not be read, so no cancellation was sent');
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
  // And so does the customer record the whole panel hangs off: swallowed to an
  // empty list it read as "no record for this customer", which takes the list,
  // the flag on it and the "Mark handled" button with it.
  expect(intake).toContain("let bookingsRead: 'ok' | 'unavailable' = owners === null ? 'unavailable' : 'ok';");
  expect(intake).toContain("'service-quote intake could not read the customer record:',");

  const lib = read('src/lib/homecare/dispatch.ts');
  expect(lib).toContain("state: 'unknown', confirmedBy: [], flags: []");

  const page = read('src/app/vaca-mgmt/send-service-quote/page.tsx');
  expect(page).toContain("b.dispatch.state === 'unknown' ?");
  expect(page).toContain('Could not read what the crew has said');

  // The screen fails closed too. A 500 body still parses, so an unchecked read
  // emptied the panel - and this runs straight after a cancel or a completion,
  // where a shrinking list is exactly what success looks like.
  const refresh = page.slice(page.indexOf('const refreshBookings ='), page.indexOf('const lookup ='));
  expect(refresh).toContain('if (!res.ok) throw new Error(');
  expect(refresh).toContain('The visit list could not be refreshed');
  expect(refresh).toContain("variant: 'destructive',");
  // The previous list is KEPT: nothing is replaced before res.ok is checked.
  expect(refresh.indexOf('if (!res.ok)')).toBeLessThan(refresh.indexOf('setBookings('));
  const lookupFn = page.slice(page.indexOf('const lookup ='), page.indexOf('const toggle ='));
  expect(lookupFn.indexOf('if (!res.ok)')).toBeLessThan(lookupFn.indexOf('setBookings('));

  // And the read of the visits themselves. It stays best-effort - the
  // scheduling columns are hand-applied - but an empty list wearing a 200 is
  // the same lie: this panel is the only place a flag appears, and it renders
  // nothing at all when the list is empty.
  expect(intake).toContain("bookingsRead = 'unavailable';");
  expect(intake).toContain('bookings, bookingsRead });');
  expect(refresh).toContain("if (data.bookingsRead === 'unavailable') throw new Error(");
  // A lookup is a different customer, so its list is replaced either way -
  // keeping it would aim "Mark completed" at the wrong homeowner - and the gap
  // is said out loud instead.
  expect(lookupFn).toContain("if (data.bookingsRead === 'unavailable') {");
  expect(lookupFn).toContain('Their visits could not be read');
  expect(lookupFn).toContain('is NOT ');
});

test('AC89 one spelling of the (homeowner, window) dispatch read', () => {
  // The key that must not drift: visitKey normalisation and the URL encoding
  // both have to be right in every copy, and a reader that got either wrong
  // would quietly find no row and report a dispatched visit as never
  // dispatched. The same rule assignmentsForDispatch already holds.
  const lib = read('src/lib/homecare/dispatch.ts');
  expect(lib).toContain('export async function dispatchForVisit(');
  expect(lib).toContain('const existing = await dispatchForVisit(args.homeownerId, args.visitStart);');
  expect(lib).toContain('dispatch = await dispatchForVisit(homeownerId, visitStart);');

  const route = read('src/app/api/admin/service-quote/dispatch/route.ts');
  expect(route).toContain('const dispatch = await dispatchForVisit(homeownerId, new Date(start));');

  // One spelling, everywhere. The lookup by dispatch id, the window-range read
  // in the cron and the DELETE are different reads and keep their own filters.
  const spellings = [
    'src/lib/homecare/dispatch.ts',
    'src/app/api/admin/service-quote/dispatch/route.ts',
    'src/app/api/admin/service-quote/intake/route.ts',
    'src/app/api/cron/visit-dispatch-escalation/route.ts',
  ].flatMap((f) => read(f).match(/visit_dispatch\?select=\$\{VISIT_DISPATCH_COLUMNS\}[\s\S]{0,200}?visit_start=eq\./g) ?? []);
  expect(spellings, 'the (homeowner, window) dispatch read is written once').toHaveLength(1);
});

test('AC80 a missing scheduled_end resolves through visitEndsAt, never a second literal', () => {
  // visitEndsAt says two hours. Spelling an hour here made the 5pm Telegram and
  // the crew confirm page describe one visit as "8:00 - 10:00am" and
  // "8:00 - 9:00am", and the CANCEL .ics inherited the shorter one.
  const src = read('src/lib/homecare/dispatch.ts');
  expect(src).toContain('end: new Date(visitEndsAt(key, endIso))');
  // The retraction takes the window straight off the visit it was handed rather
  // than working one out for itself, so there is only ever the one fallback.
  expect(src).toContain('const { end, customerName, address, services } = visit;');
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

test('AC86 clearing a flag reports what actually moved, not what was intended', () => {
  // On a stale list - the flag cleared in another tab, or the assignment
  // retired between the read and the click - the PATCH matches nothing. Saying
  // "it will not be chased again" there is a promise the escalation does not
  // keep: a visit nobody has confirmed is still chased at 5pm and 6pm.
  const route = read('src/app/api/admin/service-quote/dispatch/route.ts');
  expect(route).toContain("status: handled.length > 0 ? 'handled' : 'nothing_to_handle',");
  expect(route).toContain('handled: handled.length,');
  // The state is re-read AFTER the write, so it is the visit's, not this
  // route's intention.
  expect(route.indexOf("supabaseRest<DispatchAssignment[]>(\n      'PATCH'"))
    .toBeLessThan(route.indexOf('const after = await assignmentsForDispatch(dispatch.id)'));

  const page = read('src/app/vaca-mgmt/send-service-quote/page.tsx');
  expect(page).toContain('const cleared: number = data.handled ?? 0;');
  expect(page).toContain('const state: string | undefined = data.dispatch?.state;');
  // What the admin is told about the chase comes from that state, all three ways.
  expect(page).toContain('This visit reads as confirmed now, so it will not be chased again.');
  expect(page).toContain('Another flag is still open on it, so 5pm and 6pm will keep chasing it.');
  expect(page).toContain('Nobody on this visit has confirmed, so 5pm and 6pm will still chase it.');
  expect(page).toContain("title: cleared > 0 ? 'Flag cleared' : 'Nothing to clear',");
  expect(page).toContain('No flag was open on this visit - the list was out of date. ');
  expect(page).toContain("variant: state === 'confirmed' ? undefined : 'destructive',");
});

test('AC95 a flag clear whose re-read failed is not reported as a failed clear', () => {
  // The PATCH landed and the 5pm/6pm chases really have stopped by this point.
  // Answering 500 over the read that follows told the admin the opposite, and
  // the page throws before refreshing - so the stale "Flagged by ..." row and
  // its "Mark handled" button stayed on screen under a "Failed" toast, and the
  // visit might be called off over a problem already closed.
  const route = read('src/app/api/admin/service-quote/dispatch/route.ts');
  expect(route).toContain('const after = await assignmentsForDispatch(dispatch.id).catch((err) => {');
  expect(route).toContain('dispatch: after ? dispatchStateOf(after) : UNKNOWN_DISPATCH_STATE,');
  // The re-read is the LAST thing that can fail, so nothing after it can turn
  // a landed write into a 500.
  expect(route.indexOf('const after = await assignmentsForDispatch'))
    .toBeGreaterThan(route.indexOf("`visit_dispatch_recipients?dispatch_id=eq.${dispatch.id}&status=eq.flagged`"));

  // And the toast has an `unknown` branch, or it would assert the definite
  // "nobody has confirmed" about a state it could not read.
  const page = read('src/app/vaca-mgmt/send-service-quote/page.tsx');
  expect(page).toContain("state === 'unknown'");
  expect(page).toContain('What the visit reads as now could NOT be checked');
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
