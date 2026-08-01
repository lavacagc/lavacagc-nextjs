import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildIcs, googleCalendarUrl, icsContentType, ICS_ORGANIZER } from '../src/lib/homecare/ics';
import {
  buildDispatchEmail, buildDispatchCancelledEmail, dispatchSubject, cancelledSubject,
  ACTION_PREFIX, CANCELLED_PREFIX,
} from '../src/lib/homecare/dispatchEmail';
import { escapeTelegram } from '../src/lib/notify/telegramMessage';
import {
  escalationMessage, flagAlertMessage, siblingVerdict, chaseSentence,
} from '../src/lib/homecare/dispatchAlerts';
import {
  chasesAhead, chaseStageLabel, customerReminderAhead, customerReminderState, morningAlarmAhead,
  type ChaseStage,
} from '../src/lib/homecare/visitSchedule';
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

/**
 * The dispatch email, rendered. Booked on 1 Aug for a visit on 5 Aug, which is
 * the ordinary case: a dispatch goes out the moment a visit is booked, and that
 * is routinely days or weeks ahead of the visit itself.
 */
const dispatch = (over: Partial<Parameters<typeof buildDispatchEmail>[0]> = {}) => buildDispatchEmail({
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
  visitStart: START,
  now: NOW,
  customerReminder: 'queued',
  ...over,
});

/** The retraction that withdraws it. */
const cancelled = (over: Partial<Parameters<typeof buildDispatchCancelledEmail>[0]> = {}) =>
  buildDispatchCancelledEmail({
    recipientName: 'Veronica',
    customerName: 'Jordan Caruso',
    address: '14 Maple Ave, West Orange, NJ',
    services: ['Clean gutters & downspouts'],
    visitDateLabel: 'Wed 5 Aug',
    timeWindow: '8:00 - 11:00am',
    visitStart: START,
    now: NOW,
    ...over,
  });

/**
 * The two Telegram alerts, rendered.
 *
 * Both used to be assembled inline in the routes that send them, so the only way
 * to pin either was to grep route source - which proves the file LOOKS right and
 * nothing about what the owner actually reads. These build the message.
 */
const escalation = (over: Partial<Parameters<typeof escalationMessage>[0]> = {}) => escalationMessage({
  stage: 'nudge',
  customer: 'Jordan',
  label: 'Wed 5 Aug 8:00 - 11:00am',
  address: '14 Maple Ave, West Orange, NJ',
  services: ['Clean gutters & downspouts'],
  phone: '(201) 555-0100',
  dispatched: true,
  sentTo: ['Veronica'],
  flags: [],
  customerReminder: 'coming',
  ...over,
});

const flagAlert = (over: Partial<Parameters<typeof flagAlertMessage>[0]> = {}) => flagAlertMessage({
  who: 'Veronica',
  when: 'Wed 5 Aug 8:00 - 11:00am',
  customerName: 'Jordan Caruso',
  customerPhone: '(201) 555-0100',
  address: '14 Maple Ave, West Orange, NJ',
  services: ['Clean gutters & downspouts'],
  subName: 'Ramirez Exteriors',
  visitRead: 'ok',
  note: 'sub cancelled',
  verdict: siblingVerdict([], ['nudge', 'escalate']),
  customerReminder: 'coming',
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
  expect(lines[1]).toContain('CN="Veronica"');
});

test('AC3 a CN is a quoted PARAMETER value, not backslash-escaped TEXT', () => {
  // RFC 5545 §3.1: parameter values are not escaped the way TEXT values are.
  // `CN=Ramirez\, Jr` is read as two parameters or rejected outright, which
  // breaks the invite for exactly the person whose name has a comma in it.
  const out = ics({ attendees: [{ name: 'Ramirez, Jr', email: 'sub@example.com' }] });
  const line = out.split('\r\n').find((l) => l.startsWith('ATTENDEE'))!;
  expect(line).toContain('CN="Ramirez, Jr"');
  expect(line).not.toContain('Ramirez\\,');
  // A quoted value has no escape of its own, so an embedded DQUOTE has to come
  // out rather than be smuggled in.
  const quoted = ics({ attendees: [{ name: 'Al "Big Al" Ramirez', email: 'sub@example.com' }] });
  const quotedLine = quoted.split('\r\n').find((l) => l.startsWith('ATTENDEE'))!;
  expect(quotedLine).toContain('CN="Al Big Al Ramirez"');
  expect(quotedLine.split(':mailto:')[0].split('CN=')[1]).toBe('"Al Big Al Ramirez"');
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

test('AC13 the retraction subject is the invite\'s, prefix apart, so Gmail threads them together', () => {
  // The street rule is the part that must not drift between the invite and the
  // retraction that withdraws it: Gmail threads on subject, and a `[CANCELLED]`
  // built from a different tail starts a second conversation sitting where
  // nobody is looking for it. One spelling, two prefixes.
  const args = { visitDateLabel: 'Wed 5 Aug', timeWindow: '8:00 - 11:00am', address: '14 Maple Ave, West Orange, NJ 07052' };
  expect(dispatchSubject(args).slice(ACTION_PREFIX.length))
    .toBe(cancelledSubject(args).slice(CANCELLED_PREFIX.length));
  expect(cancelledSubject(args)).toBe('[CANCELLED] Wed 5 Aug, 8:00 - 11:00am - 14 Maple Ave');
  // ...and spelled once, rather than twice and kept in step by hand.
  const src = code('src/lib/homecare/dispatchEmail.ts');
  expect(src.match(/address\.split\(','\)/g) ?? []).toHaveLength(1);
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

test('AC16 the body says WHEN the customer is told, read off the visit\'s own date', () => {
  // "Tonight" is true for exactly one of the days a visit can be booked on. The
  // .ics attached to this same email sets its alarms off the visit's date, so
  // the unconditional wording had the body contradicting its own attachment.
  const tomorrow = dispatch({ now: new Date(Date.UTC(2026, 7, 4, 12)) });
  expect(tomorrow.html).toContain('their reminder at 7:30pm tonight either way');
  expect(tomorrow.text).toContain('their reminder at 7:30pm tonight either way');

  const weeksOut = dispatch();
  expect(weeksOut.html).toContain('their reminder at 7:30pm on Tue 4 Aug either way');
  expect(weeksOut.text).toContain('their reminder at 7:30pm on Tue 4 Aug either way');
  // Named, not softened to "the night before": the crew need to know when.
  expect(weeksOut.html).not.toContain('tonight');
  expect(weeksOut.text).not.toContain('tonight');
});

test('AC16 a reminder that was never queued is reported, never promised', () => {
  // The booking route holds this verdict BEFORE it sends the dispatch: 'skipped'
  // is a booking that missed its covering run, 'unavailable' a queue write that
  // failed. In both, nobody is telling the customer anything.
  for (const customerReminder of ['skipped', 'unavailable'] as const) {
    const { html, text } = dispatch({ customerReminder });
    expect(html, customerReminder).toContain('No automatic reminder is going out to the customer');
    expect(html, customerReminder).toContain('text Jordan Caruso yourself');
    expect(html, customerReminder).not.toContain('either way');
    expect(text, customerReminder).toContain('No automatic reminder is going out to the customer');
    expect(text, customerReminder).not.toContain('either way');
  }
});

test('AC17 the body explains the attachment and names when each alarm fires', () => {
  const { html, text } = dispatch();
  expect(html).toContain('Save the calendar invite attached');
  expect(html).toContain('one at 7:30pm on Tue 4 Aug to confirm');
  expect(html).toContain('at 7:00am on Wed 5 Aug to text Jordan Caruso when you are on the way');
  expect(text).toContain('at 7:00am on Wed 5 Aug to text Jordan Caruso when you are on the way');

  const tomorrow = dispatch({ now: new Date(Date.UTC(2026, 7, 4, 12)) });
  expect(tomorrow.html).toContain('at 7:00am tomorrow to text Jordan Caruso');
  expect(tomorrow.text).toContain('at 7:00am tomorrow to text Jordan Caruso');
});

test('AC17 an alarm that has already fired is never described as coming', () => {
  // Both alarms are absolute instants on the visit's own dates, so a same-day
  // booking arrives after one or both have passed - and an invite described as
  // carrying a reminder that has gone is how somebody stops watching for it.
  const sameDay = dispatch({
    visitStart: new Date(Date.UTC(2026, 7, 5, 21)),   // 5pm Eastern
    now: new Date(Date.UTC(2026, 7, 5, 12)),          // 8am Eastern, same day
    customerReminder: 'skipped',
  });
  expect(sameDay.html).toContain('have already passed');
  expect(sameDay.html).toContain('text Jordan Caruso yourself before you go');
  expect(sameDay.html).not.toContain('It carries two reminders');
  expect(sameDay.text).toContain('text Jordan Caruso yourself before you go');

  // Booked overnight: the 7:30pm confirm alarm has gone, the 7:00am has not.
  const overnight = dispatch({
    now: new Date(Date.UTC(2026, 7, 5, 5)),           // 1am Eastern on the day
    customerReminder: 'skipped',
  });
  expect(overnight.html).toContain('at 7:00am this morning to text Jordan Caruso');
  expect(overnight.html).not.toContain('It carries two reminders');
  expect(overnight.text).toContain('at 7:00am this morning to text Jordan Caruso');
});

test('AC17 the text part carries the same claims as the HTML, never its own', () => {
  // Both sentences are built once and rendered into both parts. They were
  // spelled twice, which is a second bug waiting: a text part that drifts from
  // the HTML tells half the crew something the other half was never told.
  const { html, text } = dispatch();
  for (const claim of [
    'The customer gets their reminder at 7:30pm on Tue 4 Aug either way',
    'at 7:00am on Wed 5 Aug to text Jordan Caruso when you are on the way',
  ]) {
    expect(html).toContain(claim);
    expect(text).toContain(claim);
  }
  expect(text).not.toContain('tomorrow');
});

test('AC114 the invite\'s own 7:30pm alarm does not claim a reminder that never went', () => {
  // The alarm fires the night before saying the customer reminder has gone out.
  // Unset fails CLOSED - it says nothing about the customer rather than
  // asserting they were told.
  expect(ics({ customerReminded: true })).toContain('The customer reminder email has gone out');
  expect(ics({ customerReminded: false })).not.toContain('The customer reminder email has gone out');
  expect(ics()).not.toContain('The customer reminder email has gone out');
  // The instruction the alarm exists for survives either way.
  expect(ics()).toContain("Confirm tomorrow's visit for Jordan Caruso");
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
  expect(loop).toContain('sendCrewMail');
  expect(loop).toContain('assignment,');
  expect(loop).toContain('confirm/${assignment.confirm_token}');
  // ...and the envelope it goes out in is addressed to that one person.
  const envelope = src.slice(src.indexOf('function sendCrewMail'));
  expect(envelope).toContain('to: assignment.email');
});

test('AC22 the calendar file rides as an attachment named visit.ics', () => {
  const src = read('src/lib/homecare/dispatch.ts');
  expect(src).toContain(
    "attachments: [{ filename: 'visit.ics', content: ics, contentType: icsContentType(ics) }]",
  );
});

test('AC22 both crew sends spell the envelope once, so the audit shape cannot drift', () => {
  // The campaign blob is what the email_log audit reads and what records the
  // attachment name, and the content type is what makes the invite render as a
  // calendar card. Two copies of that is two chances for one of them to rot.
  const src = code('src/lib/homecare/dispatch.ts');
  expect(src.match(/sendTrackedEmail\(\{/g) ?? []).toHaveLength(1);
  expect(src.match(/sendCrewMail\(\{/g) ?? []).toHaveLength(2);
  const envelope = src.slice(src.indexOf('function sendCrewMail'));
  expect(envelope).toContain('campaign: { visit_start: visitKey(visitStart), dispatch_id: dispatchId }');
  expect(envelope).toContain('replyTo: SERVICE_REPLY_TO.join');
  // Only the category differs between the invite and the retraction.
  expect(envelope).toContain('category,');
});

test('AC23a the .ics is SENT as a calendar part, with the method its body declares', () => {
  // Gmail and Outlook render their own "Add to calendar" / RSVP card off the
  // MIME PART, not off the bytes: an attachment with no declared type is
  // offered as a plain file download, which is the exact outcome METHOD:REQUEST
  // was chosen over METHOD:PUBLISH to avoid. Without this the whole decision is
  // inert - which is how it survived ten rounds, since AC1 only ever asserted
  // what the FILE contains.
  expect(icsContentType(ics())).toBe('text/calendar; charset=utf-8; method=REQUEST');
  // And a retraction is announced as what it is. A CANCEL sent as a REQUEST is
  // one a client is entitled to ignore, leaving the visit and its 7:00am "text
  // the customer" alarm exactly where they were.
  expect(icsContentType(ics({ cancel: true, sequence: 1 })))
    .toBe('text/calendar; charset=utf-8; method=CANCEL');
  // Read off the file, never written out beside it, so the header cannot
  // disagree with the body.
  expect(icsContentType('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n')).toBe('text/calendar; charset=utf-8');
});

test('AC23a the chokepoint passes a content type through, and omits it when unasked', () => {
  const src = read('src/lib/notify/sendEmail.ts');
  expect(src).toContain('contentType?: string');
  // Spread, so every existing attachment-carrying send produces exactly the
  // request it produced before.
  expect(src).toContain("...(a.contentType ? { contentType: a.contentType } : {})");
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
  expect(fn).toContain("if (created?.[0]) return { row: created[0], subRecorded: 'ok' };");
  expect(fn).toContain('const won = await dispatchForVisit(args.homeownerId, args.visitStart).catch(() => null);');
  expect(read('supabase/migrations/20260818000000_crew_dispatch.sql'))
    .toContain('idx_visit_dispatch_visit');
});

test('AC97 the row recovered from a lost race still gets the sub that was typed', () => {
  // The likeliest racer is exactly the caller with no sub to contribute - the
  // escalation cron creating tomorrow's row at 21:00 UTC, against a booking for
  // the same window - so handing the winner's row straight back dropped the
  // admin's sub from the row AND from the email built off it, under a clean
  // 'sent'.
  const src = read('src/lib/homecare/dispatch.ts');
  const fn = src.slice(src.indexOf('export async function ensureVisitDispatch'), src.indexOf('export interface EnsureAssignmentsResult'));
  // One write, reached by both paths, so the recovered row cannot drift from
  // the one that was already there.
  expect(fn).toContain('const withSub = async (existing: VisitDispatchRow): Promise<EnsureDispatchResult> => {');
  expect(fn).toContain('return withSub(existing);');
  expect(fn).toContain('return withSub(won);');
  // And it reports the write the same way, so a sub the recovered row would not
  // take can never answer 'ok'.
  expect(fn.split("subRecorded: 'ok'").length - 1, 'only the paths that stored it report ok').toBe(3);
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
  expect(page).toContain('+ recordLine + subLine + subUnseenLine + movedLine + staleLine');
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
  // ...and the page has to actually send the empty box. Omitted ONLY when the
  // box could not be filled from the row (AC100) - never when it is empty.
  const page = read('src/app/vaca-mgmt/send-service-quote/page.tsx');
  expect(page).toContain('...(subUnseen ? {} : { subName: subName.trim() }),');
  expect(page).not.toContain('...(subName.trim() ? { subName: subName.trim() } : {})');

  // A caller that omits the field leaves the stored sub alone - which is why
  // this is absent-vs-empty rather than "always write". The escalation cron
  // passes no sub, and chasing a visit must not wipe one as a side effect.
  const cron = read('src/app/api/cron/visit-dispatch-escalation/route.ts');
  expect(cron).toContain('ensureVisitDispatch({ homeownerId: first.homeowner_id, visitStart: start })');
  expect(cron).not.toContain('subName');
});

test('AC98 the sub box shows the sub stored on the visit it is aimed at', () => {
  // A box that is authoritative on save and always opens blank makes the
  // DESTRUCTIVE direction the default: re-saving a window to add a crew member
  // or fix the address - the documented way to do both - cleared the stored
  // sub, and the clear succeeded, so no failure was ever reported.
  const intake = read('src/app/api/admin/service-quote/intake/route.ts');
  expect(intake).toContain('type BookedVisit = Booking & { dispatch: VisitDispatchState; sub: VisitSubState };');
  expect(intake).toContain('subByStart.set(at, d.sub_name);');
  expect(intake).toContain('sub: subFor(b),');
  // A read that FAILED is not "no sub", because the next save would delete a
  // name nobody was shown. The assignments read failing does NOT make the sub
  // unknown - that came off the dispatch row, which read fine.
  expect(intake).toContain('dispatch: UNKNOWN_DISPATCH_STATE, sub: UNKNOWN_VISIT_SUB');
  expect(intake).toContain('dispatch: UNKNOWN_DISPATCH_STATE, sub: subFor(b)');

  const page = read('src/app/vaca-mgmt/send-service-quote/page.tsx');
  // The box follows the visit the date and From time name, until it is typed in.
  expect(page).toContain('const targetStart = date && from ? easternVisitInstant(date, from).getTime() : NaN;');
  expect(page).toContain("const storedSub = targetVisit?.sub?.read === 'ok' ? targetVisit.sub.name ?? '' : '';");
  expect(page).toContain('const subName = subEdit ?? storedSub;');
  // Aiming the form at a different window hands the box back to that window,
  // so a sub typed for one visit cannot overwrite another's - but an ordinary
  // correction to the time keeps what was typed, which is why the decision runs
  // through `retarget` rather than blanking the edit on every keystroke.
  expect(page).toContain('onChange={(e) => { setDate(e.target.value); retarget(e.target.value, from); }}');
  expect(page).toContain('onChange={(e) => { setFrom(e.target.value); retarget(date, e.target.value); }}');
  const retargetFn = page.slice(page.indexOf('const retarget = ('), page.indexOf('useEffect(() => {'));
  // Only a window we can see has NO sub of its own leaves the typed one alone.
  // One whose sub could not be READ counts as carrying one, or the box would
  // hand this visit a sub typed for another.
  expect(retargetFn).toContain(
    "const subless = visit === undefined || (visit.sub?.read === 'ok' && visit.sub.name === null);",
  );
  expect(retargetFn).toContain('if (!subless) setSubEdit(null);');
  // As does looking up a different customer - the box used to keep the last
  // one's sub - and saving, after which the box shows what the row now holds.
  // The lookup does it through `clearCustomer`, which BOTH its paths run.
  const lookupFn = page.slice(page.indexOf('const lookup = useCallback'), page.indexOf('const toggle = (key: string)'));
  const reset = page.slice(page.indexOf('const clearCustomer = useCallback'), page.indexOf('const refreshBookings ='));
  expect(lookupFn).toContain('clearCustomer();');
  expect(reset).toContain('setSubEdit(null);');
  const scheduleFn = page.slice(page.indexOf('const schedule = async ()'), page.indexOf('const complete = async'));
  expect(scheduleFn).toContain('setSubEdit(null);');
  // And a box that could not be filled from the row says so, because an empty
  // one is a clear.
  expect(page).toContain("(bookingsRead === 'unavailable' || (targetVisit !== undefined && targetVisit.sub?.read !== 'ok'))");
  expect(page).toContain('could NOT be read, so this box is not showing it');
  expect(page).toContain('Stored on this visit: ${storedSub}');

  // The address is written onto the window too - everything else that reaches
  // the customer record fills blanks only - and it cannot go blank, because the
  // button is disabled without one. It can still be silently replaced, so a
  // window holding a different address says which one. (The claim this test
  // used to make, that the sub was the ONLY field with a destructive default,
  // was wrong: AC99 covers the third one.)
  expect(read('src/lib/homecare/serviceScheduling.ts')).toContain('if (args.address && !row.address) patch.address = args.address;');
  expect(page).toContain('targetVisit?.address && targetVisit.address !== address.trim()');
  expect(page).toContain('This visit is on the books at {targetVisit.address}');
  expect(page).toContain('|| selected.size === 0 || !address.trim()');
});

test('AC99 the ticked services show what the visit the form is aimed at holds', () => {
  // The third field written onto the window, and the sharpest: these keys pick
  // which (task, season) rows get the window at all, and they are the service
  // list BOTH the crew dispatch and the customer's reminder name. Left to the
  // customer's last request, re-saving a booked window to add a crew member
  // mailed everybody a list drawn from what they once asked for.
  const page = read('src/app/vaca-mgmt/send-service-quote/page.tsx');
  expect(page).toContain('const storedTasks = targetVisit ? new Set(targetVisit.tasks.map((t) => t.key)) : null;');
  expect(page).toContain('const selected = taskEdit ?? storedTasks ?? requestTasks;');
  // Ticking is an edit, so it takes the boxes off whatever they were following
  // rather than being folded back into the request's own selection.
  const toggleFn = page.slice(page.indexOf('const toggle = (key: string)'), page.indexOf('const send = async'));
  expect(toggleFn).toContain('setTaskEdit(next);');
  expect(page, 'the selection is derived now - a setter would let the two disagree').not.toContain('setSelected(');
  // A window on the books hands the ticks back to it; a save hands them back to
  // the row just written; a different customer drops them.
  const retargetFn = page.slice(page.indexOf('const retarget = ('), page.indexOf('useEffect(() => {'));
  expect(retargetFn).toContain('if (visit) setTaskEdit(null);');
  const scheduleFn = page.slice(page.indexOf('const schedule = async ()'), page.indexOf('const complete = async'));
  expect(scheduleFn).toContain('setTaskEdit(null);');
  const lookupFn = page.slice(page.indexOf('const lookup = useCallback'), page.indexOf('const toggle = (key: string)'));
  expect(lookupFn).toContain('clearCustomer();');
  expect(page.slice(
    page.indexOf('const clearCustomer = useCallback'), page.indexOf('const refreshBookings ='),
  )).toContain('setTaskEdit(null);');

  // The ticks live in the card ABOVE the date, so a date landing on a booked
  // visit changes them out of sight. The window says what it holds where the
  // window is named - and says what un-ticking does NOT do, because
  // `scheduleVisit` upserts and never unbooks.
  expect(page).toContain('data-testid="sq-tasks-stored"');
  expect(page).toContain('This visit is on the books for ${targetVisit.tasks.map((t) => t.title).join(\', \')}.');
  expect(page).toContain('un-ticking one does NOT take it off the visit');
  // And a visit list that could not be READ is not the absence of a window: the
  // ticks fall back to the customer's request, and only this says so.
  expect(page).toContain("const tasksUnknown = Number.isFinite(targetStart) && bookingsRead === 'unavailable';");
  expect(page).toContain('data-testid="sq-tasks-unread"');
  expect(page).toContain('what it holds, could NOT be read');
  const scheduling = read('src/lib/homecare/serviceScheduling.ts');
  const upsert = scheduling.slice(scheduling.indexOf('export async function scheduleVisit'), scheduling.indexOf('export interface BookedVisitRow'));
  expect(upsert, 'if this ever unbooks, the copy above has to change with it').not.toContain('scheduled_start: null');
});

test('AC100 a sub the box could not show is left alone, never cleared', () => {
  // The last hole in "whatever is in the box wins": on a failed dispatch-row
  // read the box resolves to '', and sending that is an explicit clear - a read
  // that FAILED turned into a destructive instruction. The write succeeds, so
  // AC90 never fires and the toast reads clean.
  const page = read('src/app/vaca-mgmt/send-service-quote/page.tsx');
  expect(page).toContain('const subUnseen = subUnknown && subEdit === null;');
  expect(page).toContain('...(subUnseen ? {} : { subName: subName.trim() }),');
  // Absent is what leaves the stored value alone - the same path the escalation
  // cron relies on (AC93).
  const dispatch = read('src/lib/homecare/dispatch.ts');
  expect(dispatch).toContain('const sub = args.subName === undefined ? undefined : args.subName || null;');
  // Reported, never assumed: the crew email that just went out names a value
  // nobody on this screen has seen.
  expect(page).toContain('The sub was left as it is - what is stored could NOT be read');
  expect(page).toContain('+ recordLine + subLine + subUnseenLine + movedLine + staleLine');
  // A DELIBERATE clear still works, because typing - including emptying the box
  // - makes the edit non-null.
  expect(page).toContain('const subName = subEdit ?? storedSub;');
});

test('AC101 a customer lookup clears every per-customer field before it fills any', () => {
  // The resets used to sit inside branches - services and scope behind "this
  // lead named some tasks", name and address behind "there is a homeowner
  // record" - so a walk-in with neither kept the LAST customer's on screen, and
  // both buttons accept that state: the quote mails one customer a sentence
  // written for another, and the booking writes their window onto another
  // customer's services at another customer's address.
  const page = read('src/app/vaca-mgmt/send-service-quote/page.tsx');
  // Spelled in one place now (AC104), because the failure path needed the same
  // reset and inline copies are what let the two drift apart.
  const reset = page.slice(page.indexOf('const clearCustomer = useCallback'), page.indexOf('const refreshBookings ='));
  expect(reset, 'the name is cleared').toContain("setName('');");
  expect(reset).toContain("setAddress('');");
  expect(reset).toContain("setScope('');");
  expect(reset).toContain('setRequestTasks(new Set());');
  expect(reset).toContain('setTaskEdit(null);');
  expect(reset).toContain('setSubEdit(null);');
  const lookupFn = page.slice(page.indexOf('const lookup = useCallback'), page.indexOf('const toggle = (key: string)'));
  const cleared = lookupFn.indexOf('clearCustomer();');
  const filled = lookupFn.indexOf('const latest = data.requests[0];');
  expect(cleared, 'the lookup runs it').toBeGreaterThan(-1);
  // Cleared FIRST, then filled from whatever this lookup returned - the order
  // is the whole guarantee, because the fill is what is conditional.
  expect(cleared, 'cleared before anything is filled back in').toBeLessThan(filled);
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
  expect(revive).toContain(
    "{ status: 'sent', confirmed_at: null, note: null, notified_at: null, updated_at: stamp }",
  );
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
    name: 'Alex', confirm_token: 't', status: 'sent', confirmed_at: null, note: null,
    notified_at: null, ...over,
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
  expect(route.indexOf("assignment.status === 'retired'"))
    .toBeLessThan(route.indexOf('visit_dispatch_recipients?id=eq.'));
});

test('AC82 the write re-asserts it, so a re-dispatch mid-request cannot be overwritten', () => {
  // The check above reads a snapshot. An admin re-dispatching this window in
  // the gap retires the row, and a PATCH filtered on the id alone would write
  // 'confirmed' straight back over it: the escalation would then count an
  // answer from somebody who is not going and both chases would go quiet for a
  // visit the people actually going have never answered. The same shape as the
  // escalation's claim, which re-asserts is.null for the same reason.
  const route = read('src/app/api/crew/confirm/route.ts');
  expect(route).toContain('`visit_dispatch_recipients?id=eq.${assignment.id}&status=neq.retired`');
  // Zero rows back IS the retired answer, not a confirmation of nothing.
  expect(route).toContain('if (updated.length === 0) return retiredAnswer();');
  expect(route.indexOf('status=neq.retired')).toBeLessThan(route.indexOf('if (updated.length === 0)'));
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
  const query = src.slice(src.indexOf('const page = ('), src.indexOf('if (visits.length === 0)'));
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
  const text = escalation({ flags: [{ by: 'Veronica', note: 'sub cancelled' }] });
  expect(text).toContain('Veronica flagged a problem');
  expect(text).toContain('sub cancelled');
  // A flag with no note still says somebody raised one.
  expect(escalation({ flags: [{ by: 'Alex', note: null }] })).toContain('Alex flagged a problem</b> (no note).');
});

test('AC55 the flag note is never traded away for the never-dispatched warning', () => {
  // They used to be branches of one ternary, so a visit whose dispatch email
  // went out but whose write-back failed (`recorded: 'unavailable'`) read as
  // never dispatched AND silently dropped the flag - the highest-signal content
  // in the message. Asserted on the RENDERED message now, not on the shape of
  // the expression that builds it.
  const both = escalation({
    dispatched: false,
    sentTo: ['Veronica'],
    flags: [{ by: 'Veronica', note: 'sub cancelled' }],
  });
  expect(both).toContain('sub cancelled');
  expect(both).toContain('This visit does not read as dispatched');

  // And "no dispatch was ever sent" is only said when there is nobody it could
  // have been sent to: assignments with no stamp is a write that failed, not a
  // crew nobody told.
  const nobody = escalation({ dispatched: false, sentTo: [] });
  expect(nobody).toContain('No dispatch was ever sent for this visit');
  const writeBackFailed = escalation({ dispatched: false, sentTo: ['Veronica', 'Alex'] });
  expect(writeBackFailed).not.toContain('No dispatch was ever sent');
  expect(writeBackFailed).toContain('it was sent to Veronica, Alex');
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
  // ...which turns the run's own verdict, since a failed send is one of the
  // things `degraded` collects and `ok` is read straight off that.
  expect(src).toContain("...(failed.length > 0 ? ['escalation_send_failed'] : [])");
  expect(src).toContain('ok: degraded.length === 0');
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
  const nudge = escalation();
  for (const detail of ['Jordan', 'Wed 5 Aug 8:00 - 11:00am', '14 Maple Ave', 'Clean gutters', '(201) 555-0100']) {
    expect(nudge).toContain(detail);
  }
  expect(nudge).toContain('told we are coming at 7:30pm tonight');
  expect(escalation({ stage: 'escalate' })).toContain('about 90 minutes from now');
  expect(escalation({ dispatched: false, sentTo: [] })).toContain('No dispatch was ever sent for this visit');
});

test('AC61 the escalation message is a pure builder, rendered without sending', () => {
  // It was assembled inline between the claim and the send, so the branch that
  // distinguishes "nobody was ever told" from "the write-back failed" - the most
  // consequential sentence in the feature - could only be pinned by grepping
  // route source, and it went wrong once with nothing objecting.
  const src = cron();
  expect(src).toContain('const text = escalationMessage({');
  expect(src).toContain('dispatched: Boolean(dispatch.dispatched_at),');
  expect(src).not.toContain('const dispatchLine = ');
  expect(src).not.toContain('escapeTelegram');
});

test('AC63 Telegram HTML is escaped', () => {
  expect(escapeTelegram('Ben & Co <script>')).toBe('Ben &amp; Co &lt;script&gt;');
  // On the RENDERED messages, with hostile values in every free-text field.
  // Grepping the builder for un-escaped interpolations only ever proved that
  // the file looked right.
  const hostile = 'Ben & Co <script>';
  const escaped = 'Ben &amp; Co &lt;script&gt;';
  const chase = escalation({
    customer: hostile, label: hostile, address: hostile, services: [hostile], phone: hostile,
    sentTo: [hostile], flags: [{ by: hostile, note: hostile }], dispatched: false,
  });
  const flag = flagAlert({
    who: hostile, when: hostile, customerName: hostile, customerPhone: hostile, address: hostile,
    services: [hostile], subName: hostile, note: hostile,
    verdict: siblingVerdict([{ name: hostile, email: hostile, status: 'confirmed' }], []),
  });
  for (const message of [chase, flag]) {
    expect(message).toContain(escaped);
    // Nothing survives that Telegram would read as markup: every remaining tag
    // is one the builder wrote itself.
    for (const tag of message.match(/<[^>]*>/g) ?? []) {
      expect(['<b>', '</b>', '<code>', '</code>']).toContain(tag);
    }
  }
});

test('AC64 dryRun reports who would be chased and stamps nothing', () => {
  const src = cron();
  expect(src).toContain('wouldChase.push(chaseLabel);\n        continue;');
  expect(src.indexOf('if (dryRun) {')).toBeLessThan(src.indexOf('${stampColumn}=is.null'));
});

test('AC64 would_chase is pushed where a chase really happens, never unwound', () => {
  // It used to be pushed speculatively and `.pop()`ed back off in each of the
  // three failure paths below it. That worked only for as long as everybody
  // remembered: one new `continue` in between leaves a phantom entry in the
  // number the admin reads as "visits chased".
  const src = cron();
  expect(src).not.toContain('wouldChase.pop()');
  expect(src.match(/wouldChase\.push\(/g) ?? []).toHaveLength(2);
  // The real-run push comes AFTER the claim is won, so nothing before it can
  // count a visit nobody was told about.
  expect(src.lastIndexOf('wouldChase.push(chaseLabel);'))
    .toBeGreaterThan(src.indexOf('if (claimed.length === 0)'));
});

test('AC65 a run that could not deliver reports itself failed', () => {
  const src = cron();
  expect(src).toContain('ok: degraded.length === 0');
  expect(src).toContain("'escalation_send_failed'");
  expect(src).toContain('...(degraded.length > 0 ? { degraded } : {})');
});

test('AC65 a read that hit its own ceiling says what it dropped, rather than a clean count', () => {
  // MAX_PER_RUN caps TASK rows, and the response reports `visits: byVisit.size`
  // - so a day whose bookings exceed it loses its tail from the last line of
  // defence before the 7:30pm customer reminder, and answered ok:true anyway.
  const src = cron();
  expect(src).toContain('limit=${MAX_PER_RUN + 1}');
  expect(src).toContain('const truncated = page.length > MAX_PER_RUN;');
  expect(src).toContain("...(truncated ? ['visit_read_truncated'] : [])");
  expect(src).toContain('will not be chased');
  // ...and it turns the run's verdict, exactly as a failed send does - on the
  // empty-page exit too, which used to answer a flat ok:true.
  expect(src).toContain('ok: degraded.length === 0');
  expect(src).toContain('ok: !truncated,');
});

test('AC65 the truncation verdict is exact, and no visit is chased off a half-read window', () => {
  // Reading exactly MAX_PER_RUN cannot tell a genuinely-full page from a
  // truncated one, so a day with exactly that many task rows reported itself
  // degraded having dropped nothing. One row MORE settles it.
  const src = cron();
  expect(src).toContain('MAX_PER_RUN + 1');
  // The boundary visit is DROPPED, not processed: grouped from only the task
  // rows that fit, its Telegram would list an incomplete services line - and
  // stamping it claims the send-once ledger, so no re-hit could ever correct
  // the message.
  expect(src).toContain('const partial = truncated && last');
  expect(src).toContain("page.filter((v) => `${v.homeowner_id}|${v.scheduled_start}` !== partial)");
  // Ordered by the whole visit key, or the boundary is an arbitrary slice of
  // whichever visits happen to share a start time.
  expect(src).toContain('order=scheduled_start.asc,homeowner_id.asc');
});

/* ── flagging reaches somebody (AC 66-67) ────────────────────────────────── */

const confirmRoute = () => read('src/app/api/crew/confirm/route.ts');

test('AC66 a flag Telegrams the office at once, with who, which visit, and the note', () => {
  const src = confirmRoute();
  expect(src).toContain('sendTelegramMessage');
  // Built by the shared builder, so the message is rendered and asserted here
  // rather than grepped out of the route that sends it.
  expect(src).toContain('const text = flagAlertMessage({');

  const text = flagAlert();
  expect(text).toContain('A visit has been flagged');
  for (const detail of [
    'Veronica', 'Jordan', 'Wed 5 Aug 8:00 - 11:00am', '14 Maple Ave',
    'Clean gutters', '(201) 555-0100', 'Ramirez Exteriors', 'sub cancelled',
  ]) {
    expect(text).toContain(detail);
  }
  // No note is its own instruction, never a blank line.
  expect(flagAlert({ note: null })).toContain('No note - call them.');
  // A visit that could not be READ says so rather than degrading to a thin
  // alert about "A customer" with no address and no services.
  expect(flagAlert({ visitRead: 'unavailable' })).toContain('The visit itself could NOT be read');
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

test('AC67 the flag screen says whether the office was actually told', () => {
  // The route computes `notified` and the screen used to throw it away, so a
  // flag nobody received still rendered "Flagged. The office has it." With a
  // colleague already confirmed, both chases stay quiet and that screen is the
  // last thing standing between the problem and nobody hearing about it.
  const actions = read('src/app/crew/confirm/[token]/CrewConfirmActions.tsx');
  expect(actions).toContain(
    "setFlagAlert(data.notified === 'sent' || data.notified === 'duplicate' ? 'reached' : 'unreached');",
  );
  expect(actions).toContain("flagAlert === 'unreached'");
  expect(actions).toContain('could NOT get the alert through to the office');
  // ...and it gives them the number, because they are the only one who can
  // close the gap from where they are standing.
  expect(actions).toContain('(201) 212-4917');
  expect(actions).toContain('href="tel:2012124917"');
  // The record is never conditional on the alert: the flag is written by the
  // route before the Telegram is attempted, and the screen still reports it as
  // flagged either way.
  expect(actions).toContain("setStatus(action === 'confirm' ? 'confirmed' : 'flagged');");
});

test('AC67 a link re-opened after a flag repeats what the tap was told, never the opposite', () => {
  // The screen used to default to the reassuring copy on load, so anybody who
  // re-opened the email after seeing the red "call us" screen was told the
  // office had it. There is no third state to default TO now: the page reads
  // the delivery stamp off the row and only that earns "the office has it".
  const actions = read('src/app/crew/confirm/[token]/CrewConfirmActions.tsx');
  expect(actions).toContain("export type FlagAlert = 'reached' | 'unreached';");
  expect(actions).not.toContain("'unknown'");
  expect(actions).toContain('useState<FlagAlert>(initialFlagAlert)');
  const page = read('src/app/crew/confirm/[token]/page.tsx');
  expect(page).toContain("initialFlagAlert={assignment.notified_at ? 'reached' : 'unreached'}");
});

test('AC108 a confirmed crew member can still raise a problem', () => {
  // The confirmed screen was terminal, and the only terminal state with neither
  // a way to say something is wrong nor a phone number. The crew member's own
  // confirmation is what silences the 5pm and 6pm chases, so a sub cancelling
  // overnight left the one person who knows with no route back into the system
  // at all - every automatic check already switched off by their own answer.
  const actions = read('src/app/crew/confirm/[token]/CrewConfirmActions.tsx');
  const confirmed = actions.slice(
    actions.indexOf("if (status === 'confirmed') {"), actions.indexOf("if (status === 'flagged') {"),
  );
  expect(confirmed).toContain('data-testid="crew-confirmed"');
  expect(confirmed, 'a way to raise it').toContain('data-testid="crew-flag-open"');
  expect(confirmed).toContain('onClick={() => setShowNote(true)}');
  expect(confirmed, 'and a human to call').toContain('href="tel:2012124917"');

  // One note form, above both screens that open it, so the two entrances
  // cannot drift into different forms.
  expect(actions.indexOf('if (showNote) {')).toBeLessThan(actions.indexOf("if (status === 'confirmed') {"));
  expect((actions.match(/data-testid="crew-note"/g) ?? [])).toHaveLength(1);
  expect((actions.match(/data-testid="crew-flag"\n/g) ?? [])).toHaveLength(1);

  // Nothing on the server side gates a flag on the row being unanswered, so
  // this really does reopen the visit rather than only recording a note: the
  // PATCH filters on the id and `neq.retired` alone, the alert fires because
  // the transition guard sees a status that is not 'flagged', and a flag
  // outranks a confirmation in both the escalation and the admin list.
  const route = confirmRoute();
  expect(route).toContain('&status=neq.retired');
  expect(route).not.toContain('status=eq.sent');
  expect(route).toContain("assignment.status === 'flagged'");
  const cron = read('src/app/api/cron/visit-dispatch-escalation/route.ts');
  expect(cron).toContain("if (mine.some((a) => a.status === 'confirmed')) {");

  // Clearing one is still the admin's, so a flagged screen stays terminal.
  const flagged = actions.slice(
    actions.indexOf("if (status === 'flagged') {"), actions.indexOf('data-testid="crew-confirm"'),
  );
  expect(flagged).toContain('data-testid="crew-flagged"');
  expect(flagged).not.toContain('setShowNote(true)');
});

test('AC111 the crew screen promises nothing that has already happened', () => {
  // Every sentence here asserted a deadline still ahead - the customer told at
  // 7:30pm "tonight", a reminder "at 7:00am" - and both are true only for a
  // visit tomorrow. AC108 exists for the person re-opening this link on the
  // MORNING of the visit, and they were the ones being told there was time.
  const actions = read('src/app/crew/confirm/[token]/CrewConfirmActions.tsx');
  const page = read('src/app/crew/confirm/[token]/page.tsx');

  // No unconditional promise survives in either file.
  expect(actions).not.toContain('customer is still told tonight');
  expect(page).not.toContain('The customer is told at 7:30pm tonight that we are coming, whether');
  // Both screens read one verdict, computed on the server from the visit's own
  // start, so the flag panels and the footer cannot drift apart.
  expect(page).toContain('customerNotice: customerNotice(visit.start, now, customerReminder),');
  expect(page).toContain('morningAlarmAhead: morningAlarmAhead(visit.start, now),');
  expect(page).toContain('timing={timing}');
  expect((actions.match(/timing\.customerNotice/g) ?? []).length).toBeGreaterThanOrEqual(2);
  expect(actions).toContain('timing.morningAlarmAhead');
  expect(actions).toContain('The 7:00am reminder has already been and gone');

  // And the alarm verdict is the one buildIcs actually sets, so the screen
  // cannot promise a reminder the invite does not carry.
  const visit = new Date(Date.UTC(2026, 7, 5, 12));           // 5 Aug, 8am Eastern
  expect(morningAlarmAhead(visit, new Date(Date.UTC(2026, 7, 4, 12)))).toBe(true);
  expect(morningAlarmAhead(visit, new Date(Date.UTC(2026, 7, 5, 10)))).toBe(true);   // 6am Eastern
  expect(morningAlarmAhead(visit, new Date(Date.UTC(2026, 7, 5, 11, 30)))).toBe(false); // 7:30am
});

test('AC111 the admin flag list promises no chase that cannot run either', () => {
  // The same claim, on the only screen a flag reaches: "5pm and 6pm will keep
  // chasing it" about a visit today is an alert that is not coming, told to the
  // one person who could have acted on it.
  const page = read('src/app/vaca-mgmt/send-service-quote/page.tsx');
  expect(page).toContain('const aheadNow = chasesAhead({');
  expect(page).toContain('and no chase is left to run - nothing else will raise it.');
  expect(page).toContain('and no chase is left to run - nothing else will ask.');
  // The two truthful branches are kept, and now name the stages that are
  // actually left rather than the fixed pair - see AC113.
  expect(page).toContain('so ${chaseStageLabel(aheadNow)} will keep chasing it.');
  expect(page).toContain('so ${chaseStageLabel(aheadNow)} will still chase it.');
});

test('AC113 a surviving chase is named by the stages that are actually left', () => {
  // The likeliest moment this screen is ever used is the one where the fixed
  // phrase is wrong: the owner gets the 5pm Telegram, opens the flag list at
  // 5:30pm and clears it. The nudge has fired; only the escalation remains.
  expect(chaseStageLabel(['nudge', 'escalate'])).toBe('5pm and 6pm');
  expect(chaseStageLabel(['nudge'])).toBe('5pm');
  expect(chaseStageLabel(['escalate'])).toBe('6pm');
  // Nothing coming is a different sentence, not a shorter list of times.
  expect(chaseStageLabel([])).toBe('');

  // The rule is spelled once: the Telegram sentence renders off the same label.
  expect(chaseSentence(['escalate'])).toContain('6pm is the last chase');
  expect(chaseSentence(['nudge'])).toContain('5pm will chase it');

  // Including the branch that says why nothing is coming. A colleague's
  // confirmation was credited with silencing "the 5pm and 6pm chases" whatever
  // was left - and the case a re-flag exists for is the one where neither was
  // ever going to run: the visit is TODAY, and both went last night.
  const confirmedBy = [{ name: 'Alex', email: 'alex@lavacagc.com', status: 'confirmed' }];
  expect(siblingVerdict(confirmedBy, ['nudge', 'escalate'])).toContain('so 5pm and 6pm stay quiet');
  expect(siblingVerdict(confirmedBy, ['escalate'])).toContain('so 6pm stays quiet');
  const nothingLeft = siblingVerdict(confirmedBy, []);
  expect(nothingLeft).toContain('no chase was left to run for it anyway');
  expect(nothingLeft).not.toContain('5pm');
  expect(nothingLeft).toContain('This is the only alert you get.');

  const visit = new Date(Date.UTC(2026, 7, 5, 12));
  const halfPastFive = new Date(Date.UTC(2026, 7, 4, 21, 30));
  expect(chaseStageLabel(chasesAhead({ visitStart: visit, now: halfPastFive }))).toBe('6pm');
});

test('AC74 only the transition into a flag alerts, so one token cannot flood the chat', () => {
  // This route is public and unthrottled, and the token rides in an email that
  // can be forwarded. Judged against the row as it was BEFORE the PATCH, or the
  // status just written would make every flag look like a repeat.
  const src = confirmRoute();
  expect(src).toContain("assignment.status === 'flagged'");
  expect(src).toContain("&& (assignment.note ?? null) === (note ?? null)");
  expect(src).toContain("const notified = alreadyTold ? 'duplicate' as const : await notifyFlag(");
  expect(src.indexOf('const alreadyTold =')).toBeLessThan(src.indexOf("supabaseRest<{ id: string }[]>("));
});

test('AC74 the guard dedupes DELIVERED alerts, not attempts', () => {
  // The anti-spam guard short-circuited notifyFlag on a same-note repeat
  // whether or not the first alert ever landed. The phone-at-a-job-site
  // sequence is exact: tap one writes the flag, Telegram fails, the response is
  // lost on a bad signal, they tap again - and were told the office had it when
  // nobody had been told anything. So the guard keys off a recorded DELIVERY.
  const src = confirmRoute();
  expect(src).toContain('&& assignment.notified_at !== null');
  // Stamped only for a Telegram that genuinely sent - never for an attempt,
  // and never for the 'duplicate' that a stamp already explains.
  expect(src).toContain("if (notified === 'sent') {");
  // ...and onto the row THIS request wrote, which is why the call carries the
  // timestamp its own PATCH set. Re-asserting the status alone let tap one's
  // late 'sent' stamp a row a second tap had since corrected to a DIFFERENT
  // note, so that corrected note read as already delivered and never reached
  // anybody - the same phone at the same job site, one tap later.
  expect(src).toContain('await recordNotified(assignment.id, now);');
  expect(src).toContain('updated_at: now,');
  const stamp = src.slice(src.indexOf('async function recordNotified'));
  expect(stamp).toContain('async function recordNotified(assignmentId: string, wroteAt: string)');
  expect(stamp).toContain('status=eq.flagged');
  expect(stamp).toContain('&updated_at=eq.${wroteAt}');
  expect(stamp).toContain('notified_at: stamp');
  // The stamp belongs to the flag as it now reads: any tap about to attempt a
  // fresh alert clears it first, so a send that fails cannot inherit an older
  // note's delivery.
  expect(src).toContain('notified_at: alreadyTold ? assignment.notified_at : null,');
  // ...and a recipient put back on the visit starts clean, for the same reason.
  expect(code('src/lib/homecare/dispatch.ts'))
    .toContain("{ status: 'sent', confirmed_at: null, note: null, notified_at: null, updated_at: stamp }");
  // The flag itself is never conditional on the alert landing.
  expect(src.indexOf("status: action === 'confirm' ? 'confirmed' : 'flagged'"))
    .toBeLessThan(src.indexOf('await notifyFlag('));
});

test('AC74 the delivery stamp is a column on the assignment, in the one migration', () => {
  // Hand-applied and already live, so the DDL has to be safe to re-run.
  const sql = read('supabase/migrations/20260818000000_crew_dispatch.sql');
  expect(sql).toContain('ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ');
  expect(sql.match(/CREATE TABLE (?!IF NOT EXISTS)/g) ?? []).toHaveLength(0);
  // Every reader selects it, through the one column list.
  expect(read('src/lib/homecare/dispatch.ts')).toContain(
    "'id,dispatch_id,recipient_id,email,name,confirm_token,status,confirmed_at,note,notified_at'",
  );
});

test('the unguarded public confirm route is recorded as a decision, not left as a gap', () => {
  // /api/crew/confirm is the one PUBLIC_ROUTES entry that does not self-guard
  // with checkRateLimit, and that was an explicit owner decision. Written down
  // so a future reader can tell a deliberate exception from an oversight and
  // does not "fix" it by accident - the whole reason this belongs in the doc.
  const doc = read('docs/crew-dispatch-acceptance-criteria.md');
  const notBuilt = doc.slice(doc.indexOf('## What was deliberately not built'));
  expect(notBuilt).toContain('No rate limit on `POST /api/crew/confirm`');
  expect(notBuilt).toContain('deliberate owner decision');
  expect(notBuilt).toContain('checkRateLimit');
  // The route really is the entry the note describes.
  expect(read('src/middleware.ts')).toContain("'/api/crew/',");
});

test('AC75 the flag alert reads the other assignments rather than asserting nobody confirmed', () => {
  const src = confirmRoute();
  // The escalation skips any visit somebody has confirmed, so when a colleague
  // already answered this alert is the ONLY message the owner gets about the
  // problem. It cannot be the one that says something false.
  expect(src).toContain('assignmentsForDispatch(dispatch.id)');
  // Live siblings only - somebody retired off the visit is not a colleague who
  // has answered it.
  expect(src).toContain('liveAssignments(rows).filter((a) => a.id !== assignment.id)');

  const both: ChaseStage[] = ['nudge', 'escalate'];
  expect(siblingVerdict([{ name: 'Alex', email: 'alex@lavacagc.com', status: 'confirmed' }], both))
    .toContain('Alex has already confirmed this visit');
  expect(siblingVerdict([
    { name: 'Alex', email: 'alex@lavacagc.com', status: 'confirmed' },
    { name: 'Sam', email: 'sam@lavacagc.com', status: 'confirmed' },
  ], both)).toContain('Alex, Sam have already confirmed');
  expect(siblingVerdict([{ name: null, email: 'sam@lavacagc.com', status: 'sent' }], both))
    .toContain('Nobody has confirmed it.');
  expect(siblingVerdict([], both)).toContain('Nobody else is on this visit');
  // A read that failed says so rather than guessing either way.
  expect(siblingVerdict(null, both)).toContain('could not be read');
});

test('AC110 the flag alert never promises a chase that is not coming', () => {
  // The alert closed with "5pm and 6pm will chase it" whenever nobody else had
  // confirmed - but the escalation only ever reads TOMORROW'S window and skips
  // any stage already stamped. The two cases where that is false are the two
  // most urgent ones: a visit TODAY, which is what re-flagging after a
  // confirmation exists for (the sub falls through at 6am), and a visit
  // tomorrow flagged after both stages have run. In both, this Telegram is the
  // only message the owner will ever get, and it ended by saying another was
  // coming.
  const now = new Date(Date.UTC(2026, 7, 4, 12));       // 4 Aug, 8am Eastern
  const tomorrow = new Date(Date.UTC(2026, 7, 5, 12));  // 5 Aug, 8am Eastern
  const today = new Date(Date.UTC(2026, 7, 4, 18));     // 4 Aug, 2pm Eastern

  expect(chasesAhead({ visitStart: tomorrow, now })).toEqual(['nudge', 'escalate']);
  // Today: both stages ran last night, and no run ever looks at this visit again.
  expect(chasesAhead({ visitStart: today, now })).toEqual([]);
  // Tomorrow, but the stamps are claimed - a re-hit is the only thing left, and
  // nothing scheduled.
  expect(chasesAhead({
    visitStart: tomorrow, now, nudgedAt: '2026-08-04T21:00:00Z', escalatedAt: '2026-08-04T22:00:00Z',
  })).toEqual([]);
  // Past 21:00 UTC the nudge has fired whether or not it stamped anything.
  expect(chasesAhead({ visitStart: tomorrow, now: new Date(Date.UTC(2026, 7, 4, 21, 30)) }))
    .toEqual(['escalate']);
  // A visit weeks out is genuinely still ahead of both.
  expect(chasesAhead({ visitStart: new Date(Date.UTC(2026, 7, 25, 12)), now }))
    .toEqual(['nudge', 'escalate']);

  // And the sentence follows the verdict rather than asserting one.
  expect(chaseSentence(['nudge', 'escalate'])).toContain('5pm and 6pm will chase it');
  expect(chaseSentence(['escalate'])).toContain('6pm is the last chase');
  expect(chaseSentence([])).toContain('Nothing else will chase this visit');
  expect(chaseSentence([])).not.toContain('will chase it');
  expect(siblingVerdict([], [])).toContain('this alert is all you get');

  // The route hands the real stamps in, so the verdict is the visit's own.
  const src = confirmRoute();
  expect(src).toContain('nudgedAt: dispatch.nudged_at,');
  expect(src).toContain('escalatedAt: dispatch.escalated_at,');
});

test('AC110 the flag alert says whether the customer has already been told', () => {
  // "The customer still gets their reminder the night before" was said whatever
  // the date: for a same-day flag they were told last night, and a deadline
  // described as still ahead is what makes the owner wait instead of ring.
  const now = new Date(Date.UTC(2026, 7, 4, 12));
  expect(customerReminderAhead(new Date(Date.UTC(2026, 7, 5, 12)), now)).toBe(true);
  expect(customerReminderAhead(new Date(Date.UTC(2026, 7, 4, 18)), now)).toBe(false);
  // 23:30 UTC, not `reminderSendAt` - in winter the two are an hour apart, and
  // that hour is exactly when this would say "still to come" about a reminder
  // already sent.
  const winterVisit = new Date(Date.UTC(2026, 0, 5, 13));
  expect(customerReminderAhead(winterVisit, new Date(Date.UTC(2026, 0, 4, 23, 0)))).toBe(true);
  expect(customerReminderAhead(winterVisit, new Date(Date.UTC(2026, 0, 4, 23, 45)))).toBe(false);

  expect(flagAlert({ customerReminder: 'coming' })).toContain('still gets their reminder');
  const sameDay = flagAlert({ customerReminder: 'told' });
  expect(sameDay).toContain('ALREADY been told we are coming');
  expect(sameDay).not.toContain('still gets their reminder');
  // The customer's own number rides along, because "call them" is what is left
  // once no chase is carrying the problem forward.
  expect(sameDay).toContain('(201) 555-0100');
});

test('AC115 the reminder verdict is read, never inferred from the clock', () => {
  // The clock knows when a reminder WOULD go, not whether one exists. A
  // same-day booking is past the covering run, so `requeueVisitReminder`
  // answers 'skipped' and no queue row is ever written - and every surface
  // reading the clock alone then says the customer has already been told about
  // a visit nobody has mentioned to them.
  const visit = new Date(Date.UTC(2026, 7, 5, 12));      // 5 Aug, 8am Eastern
  const dayBefore = new Date(Date.UTC(2026, 7, 4, 12));  // 4 Aug, 8am Eastern
  const sameDay = new Date(Date.UTC(2026, 7, 5, 10));    // 5 Aug, 6am Eastern
  const row = (status: string) => ({ id: `row-${status}`, status, created_at: '2026-08-04T12:00:00Z' });

  // No row is 'none', at any hour - this is the same-day booking, and the case
  // the clock got backwards.
  expect(customerReminderState([], visit, dayBefore)).toBe('none');
  expect(customerReminderState(undefined, visit, sameDay)).toBe('none');
  // A queued row is 'coming' only while a run that can carry it is still ahead.
  expect(customerReminderState([row('pending')], visit, dayBefore)).toBe('coming');
  expect(customerReminderState([row('pending')], visit, sameDay)).toBe('none');
  // Delivered outranks everything, exactly as `ledgerVerdict` treats it.
  expect(customerReminderState([row('sent')], visit, dayBefore)).toBe('told');
  expect(customerReminderState([row('responded'), row('pending')], visit, dayBefore)).toBe('told');
  // Deliberately cancelled is nothing coming, not a reminder still to send.
  expect(customerReminderState([row('cancelled')], visit, dayBefore)).toBe('none');

  // The read matches the ledger the way the reminder cron does - on (address,
  // visit start) - and reports a failure rather than answering with the clock.
  const scheduling = code('src/lib/homecare/serviceScheduling.ts');
  expect(scheduling).toContain('export async function readCustomerReminder(');
  expect(scheduling).toContain('follow_up_type=eq.${VISIT_REMINDER_TYPE}&visit_start=eq.${encodeURIComponent(key)}');
  expect(scheduling).toContain("return 'unavailable';");
  expect(scheduling).toContain('ledgerKey(r.lead_email ?? \'\', r.visit_start) === wanted');
});

test('AC115 all three surfaces past the send carry that verdict', () => {
  // The dispatch email got the booking's own verdict (AC114) and the three
  // surfaces that outlive it kept inferring one - so the email said "no
  // automatic reminder is going out, text them yourself" and the page it links
  // to said the customer had already been told.
  const page = read('src/app/crew/confirm/[token]/page.tsx');
  expect(page).toContain('await readCustomerReminder(visit.customerEmail, visit.start, now)');
  expect(page).toContain('customerNotice: customerNotice(visit.start, now, customerReminder),');
  expect(page).not.toContain('customerReminderAhead(visitStart, now)');

  const route = confirmRoute();
  expect(route).toContain('await readCustomerReminder(visit.customerEmail, visitStart, now)');
  expect(route).toContain('customerReminder,');
  expect(route).not.toContain('customerReminderAhead(');

  const chase = read('src/app/api/cron/visit-dispatch-escalation/route.ts');
  expect(chase).toContain('await readCustomerReminder(owner.email, start, now)');
  expect(chase).toContain('customerReminder,');

  // ...and each says what is actually true, including that it could not look.
  expect(flagAlert({ customerReminder: 'none' })).toContain('NO automatic reminder is going out');
  expect(flagAlert({ customerReminder: 'unavailable' })).toContain('could NOT be read');
  expect(escalation({ customerReminder: 'coming' })).toContain('told we are coming at 7:30pm tonight');
  expect(escalation({ customerReminder: 'none' })).toContain('No reminder is going out to the customer');
  expect(escalation({ customerReminder: 'none' })).not.toContain('at 7:30pm');
  expect(escalation({ customerReminder: 'told' })).toContain('has already been told we are coming');
  expect(escalation({ customerReminder: 'unavailable' })).toContain('could not be read');
  // A visit the read could not describe cannot name a reminder row either, and
  // says so rather than falling back to the clock.
  expect(confirmRoute()).toContain("? await readCustomerReminder(visit.customerEmail, visitStart, now)\n    : 'unavailable' as const");
});

test('AC115 the crew screen names the reminder it actually has', () => {
  // The clause is dropped into three sentences on that screen - the footer and
  // both flag panels - so it is written once and each of the four things that
  // can be true has its own wording.
  const page = read('src/app/crew/confirm/[token]/page.tsx');
  expect(page).toContain('the customer has ALREADY been told we are coming.');
  expect(page).toContain('no automatic reminder is going out to the customer, so nobody has told them');
  expect(page).toContain('we could NOT check whether the customer has been told');
  // When one IS coming the date is named, through the same helper the dispatch
  // email uses - "tonight" is true for exactly one of the days a visit can be
  // booked on (AC114), and this screen had its own copy of that claim.
  expect(page).toContain('customerReminderWhen(visitStart, now)');
  expect(page).not.toContain('at 7:30pm the night before');
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
  const { subject, html, text } = cancelled();
  expect(subject).toBe(`${CANCELLED_PREFIX} Wed 5 Aug, 8:00 - 11:00am - 14 Maple Ave`);
  expect(html).toContain('Do not text Jordan Caruso about it');
  expect(text).toContain('Do not text Jordan Caruso about it');
  expect(html).toContain('so its 7:00am reminder cannot fire');
  // Internal mail, exactly like the dispatch it retracts.
  expect(html.toLowerCase()).not.toContain('unsubscribe');
  expect(html).not.toContain('51 Crestmont Rd');
});

test('AC114 a retraction after the 7:00am alarm chases the text that may already have gone', () => {
  // A retraction goes out for any window whose START is still ahead, which
  // includes the morning OF the visit - by which time the "text the customer
  // when the crew is on the way" alarm has fired and the text may be sent.
  // "Do not text them" is then advice about something already done, and
  // "delete it so the 7:00am reminder cannot fire" is about an alarm that has.
  const { html, text } = cancelled({ now: new Date(Date.UTC(2026, 7, 5, 11, 30)) }); // 7:30am Eastern
  expect(html).toContain('Your 7:00am reminder has already gone off');
  expect(html).toContain('tell them the visit is off');
  expect(html).not.toContain('cannot fire');
  expect(text).toContain('Your 7:00am reminder has already gone off');
  expect(text).not.toContain('cannot fire');
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
  const withDispatch = intake.slice(
    intake.indexOf('async function withDispatchState'), intake.indexOf('export async function GET'),
  );
  expect(withDispatch.match(/readOrNull\(/g) ?? [], 'both reads fail closed').toHaveLength(2);
  expect(intake).toContain('if (read === null) {');
  expect(intake).toContain('if (answered === null) {');
  expect(intake.match(/dispatch: UNKNOWN_DISPATCH_STATE/g) ?? [], 'both say unknown').toHaveLength(2);
  // An EMPTY read is still 'none' - that is a visit nobody was dispatched for,
  // which is a different thing from one we could not read.
  expect(intake).toContain('if (dispatches.length === 0) return bookings.map((b) => ({ ...b, dispatch: blank, sub: noSub }));');
  // And so does the customer record the whole panel hangs off: swallowed to an
  // empty list it read as "no record for this customer", which takes the list,
  // the flag on it and the "Mark handled" button with it.
  expect(intake).toContain('let bookingsRead: ReadVerdict = owners === null ? \'unavailable\' : \'ok\';');
  expect(intake).toContain("readOrNull('the customer record', supabaseRest<");

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

test('AC102 the "On the books" panel renders on an unreadable list, not on length alone', () => {
  // The last place this feature collapsed a failed read into an empty answer,
  // and the sharpest: an unreadable list arrives EMPTY wearing a 200, and gated
  // on `bookings.length > 0` the panel - flag, note and "Mark handled" - simply
  // was not rendered. The only other signal was a toast that fades.
  const page = read('src/app/vaca-mgmt/send-service-quote/page.tsx');
  expect(page).toContain("{(bookings.length > 0 || bookingsRead === 'unavailable') && (");
  expect(page).toContain('data-testid="sq-bookings-unread"');
  expect(page).toContain('This is NOT "nothing on the books"');
  // The kept-but-unrefreshed list is the mirror case: a refresh runs straight
  // after a cancel or a completion, so an unmarked list reads as the write
  // having landed.
  expect(page).toContain('this list is of unknown age');
  // Gated on the state it describes and nothing else. The two warnings written
  // for this same failure are about a NAMED window, so neither can speak on a
  // fresh lookup - a third warning with a gate of its own would repeat the bug.
  expect(page).toContain("const tasksUnknown = Number.isFinite(targetStart) && bookingsRead === 'unavailable';");
  const panel = page.slice(page.indexOf("{(bookings.length > 0 || bookingsRead === 'unavailable') && ("));
  expect(panel).toContain("{bookingsRead === 'unavailable' && (");
  expect(panel, 'the persistent line cannot depend on a window being named').not.toContain('targetStart');
});

test('AC103 every read behind this screen answers its own verdict, never a neighbour\'s empty value', () => {
  // Same shape, three more panels: `homeowner: null` is also what a walk-in
  // reads as, no requests is also "they have never asked us for anything", and
  // an empty history prints "no record" against every service on the page.
  const intake = read('src/app/api/admin/service-quote/intake/route.ts');
  expect(intake).toContain("const homeownerRead: ReadVerdict = owners === null ? 'unavailable' : 'ok';");
  expect(intake).toContain("const requestsRead: ReadVerdict = leads === null ? 'unavailable' : 'ok';");
  expect(intake).toContain("let historyRead: ReadVerdict = owners === null ? 'unavailable' : 'ok';");
  expect(intake).toContain('if (done === null) historyRead = ');
  expect(intake).toContain('if (booked === null) bookingsRead = ');
  expect(intake).toContain('homeownerRead, requestsRead, historyRead, bookings, bookingsRead });');
  // Each read that used to swallow itself to an empty list now says so out loud
  // on the way past, the same as the customer record already did - and the rule
  // is spelled ONCE, because a fifth read added later is the one most likely to
  // get it wrong, and four hand-written copies had nothing to object with.
  expect(intake).toContain('async function readOrNull<T>(what: string, read: Promise<T | null>)');
  expect(intake).toContain('`service-quote intake could not read ${what}:`');
  expect(intake).toContain("readOrNull('their past requests', supabaseRest<");
  expect(intake).toContain("readOrNull('their service history', supabaseRest<");
  expect(intake).toContain("readOrNull('the visits on the books', supabaseRest<");
  // No read left with a catch of its own to get wrong.
  expect(intake.match(/\.catch\(/g) ?? [], 'one catch, inside the helper').toHaveLength(1);

  const page = read('src/app/vaca-mgmt/send-service-quote/page.tsx');
  expect(page).toContain('data-testid="sq-homeowner-unread"');
  expect(page).toContain('so this is not a new customer');
  expect(page).toContain('data-testid="sq-requests-unread"');
  expect(page).toContain('data-testid="sq-history-unread"');
  // "no record" is a claim about completions somebody read. These were not.
  expect(page).toContain("{hist ? hist.label : intake.historyRead === 'unavailable' ? 'not read' : 'no record'}");
  // The record warning comes back DOWN when a later read gets it - a booking
  // made from a lookup that could not read the record still yields the id.
  const refresh = page.slice(page.indexOf('const refreshBookings ='), page.indexOf('const lookup ='));
  expect(refresh).toContain("setHomeownerRead('ok');");
  const lookupFn = page.slice(page.indexOf('const lookup ='), page.indexOf('const toggle ='));
  expect(lookupFn).toContain("setHomeownerRead(data.homeownerRead === 'unavailable' ? 'unavailable' : 'ok');");
  expect(lookupFn).toContain("setHomeownerRead('unavailable');");
});

test('AC104 one reset, run on the lookup that FAILED as well as the one that worked', () => {
  const page = read('src/app/vaca-mgmt/send-service-quote/page.tsx');
  // Spelled once so the two paths cannot drift apart again - which is how the
  // failure path came to have no reset at all.
  expect(page).toContain('const clearCustomer = useCallback(() => {');
  const reset = page.slice(
    page.indexOf('const clearCustomer = useCallback'), page.indexOf('const refreshBookings ='),
  );
  for (const setter of [
    'setIntake(null);', "setName('');", "setAddress('');", "setScope('');",
    'setTaskEdit(null);', 'setSubEdit(null);', 'setBookings([]);',
    // The two that matter most: the id all three buttons fire against, and the
    // calendar link for whoever was booked.
    'setHomeownerId(null);', 'setScheduled(null);',
  ]) expect(reset, `${setter} belongs to one customer`).toContain(setter);

  const lookupFn = page.slice(page.indexOf('const lookup ='), page.indexOf('const toggle ='));
  expect(lookupFn.match(/clearCustomer\(\)/g) ?? [], 'both paths reset').toHaveLength(2);
  // The failure toast no longer says the screen is untouched, because it is not.
  expect(lookupFn).toContain('has been cleared off it');
  expect(lookupFn).not.toContain('Nothing on screen has been changed.');

  // And the record warning reads its claim off the same value that GATES the
  // buttons rather than asserting a safety beside it: a booking made after a
  // failed record read still yields a real id, so the flat claim was false
  // there too.
  const banner = page.slice(
    page.indexOf('data-testid="sq-homeowner-unread"'), page.indexOf('data-testid="sq-requests-unread"'),
  );
  expect(banner, 'the claim is read off what gates the buttons').toContain('homeownerId');
  expect(banner).toContain('Nothing below can be marked completed, cancelled or handled.');
  expect(banner).toContain('still acts on the customer');
});

test('AC106 the refresh re-reads the customer on screen, not the lookup box', () => {
  // `cancel`, `complete` and `markHandled` all await this and then toast
  // success, and all three fire against `homeownerId` - so a refresh keyed on a
  // free text field nothing binds to that id had two silent answers in it:
  // emptied it returned without reading, leaving the list looking freshly
  // re-read beside a visit just called off; retyped it swapped the panel for
  // somebody else's visits under this customer's id.
  const page = read('src/app/vaca-mgmt/send-service-quote/page.tsx');
  expect(page).toContain('const loadedEmail = useRef(\'\');');
  const refresh = page.slice(page.indexOf('const refreshBookings ='), page.indexOf('const lookup ='));
  expect(refresh).toContain('const who = loadedEmail.current;');
  expect(refresh).toContain('intake?email=${encodeURIComponent(who)}');
  expect(refresh, 'never the live box').not.toContain('email.trim()');
  // Nobody loaded is a read that could not happen, not a quiet return.
  expect(refresh).toContain('if (!who) throw new Error(');
  expect(refresh, 'no path out that skips the verdict').not.toContain('return;');
  // One exit, so the marking cannot be forgotten on a path added later.
  expect(refresh.indexOf("setBookingsRead('unavailable');")).toBeGreaterThan(refresh.indexOf('} catch (e) {'));

  // Both ways of becoming the customer on screen record it, and clearing the
  // screen clears it - a ref, because `schedule` books and refreshes in one
  // handler, where a setter's value would not be visible to the call it makes.
  const lookupFn = page.slice(page.indexOf('const lookup ='), page.indexOf('const toggle ='));
  expect(lookupFn).toContain('loadedEmail.current = email.trim();');
  const scheduleFn = page.slice(page.indexOf('const schedule = async ()'), page.indexOf('const runRowAction ='));
  expect(scheduleFn).toContain('await refreshBookings();');
  // The person just BOOKED, which the guard in AC107 has already established is
  // the one in the box. Recorded before the await, not through a setter, whose
  // value the call it makes would not see.
  expect(scheduleFn.indexOf('loadedEmail.current = who.email;')).toBeGreaterThan(-1);
  expect(scheduleFn.indexOf('loadedEmail.current = who.email;')).toBeLessThan(scheduleFn.indexOf('await refreshBookings();'));
  const reset = page.slice(page.indexOf('const clearCustomer = useCallback'), page.indexOf('const refreshBookings ='));
  expect(reset).toContain("loadedEmail.current = '';");
});

test('AC107 sending and booking act on the customer LOADED, never the lookup box', () => {
  // The last door left open on AC101: no second lookup is needed, only a box
  // retyped and left. Every other field on the card - the name, the address,
  // the phone, the ticked services - belongs to whoever was loaded, so taking
  // the IDENTITY from the box split one action between two people. It corrupts
  // rather than merely displaying: `ensureServiceHomeowner` writes the loaded
  // customer's phone and address onto the TYPED customer's record, the visit is
  // booked onto the loaded customer's services under them, the crew are mailed
  // one name for the other's homeowner, and their 7:30pm reminder names
  // services they never asked for.
  const page = read('src/app/vaca-mgmt/send-service-quote/page.tsx');

  // One answer to "who is this for?", for both buttons that write.
  expect(page).toContain('const actionCustomer = (): ');
  expect(page).toContain('? { email: loaded }\n        : { refusal: SPLIT_IDENTITY };');
  // A walk-in is not this state: with nobody loaded every field was typed here,
  // so the box is the only identity there is and it can be trusted. Its own
  // refusal, because a message about a customer nobody loaded would be a
  // banner asserting something the screen contradicts.
  expect(page).toContain('? { email: typed }');
  expect(page).toContain('There is nobody on this card yet');

  for (const [fn, next] of [
    ['const send = async (isTest: boolean)', 'const schedule = async ()'],
    ['const schedule = async ()', 'const runRowAction ='],
  ] as const) {
    const body = page.slice(page.indexOf(fn), page.indexOf(next));
    expect(body, `${fn} resolves the customer first`).toContain('const who = actionCustomer();');
    expect(body, `${fn} refuses rather than guessing`).toContain('description: who.refusal');
    // The refusal comes BEFORE the write, and before the busy flag that would
    // otherwise be left set.
    expect(body.indexOf('if (who.email === undefined) {')).toBeLessThan(body.indexOf('await fetch('));
    // ...and nothing in either handler reaches for the box again.
    expect(body, 'the box never names the customer').not.toContain('email.trim()');
  }
  expect(page).toContain('recipientName: name, recipientEmail: who.email, ccEmails: cc,');
  expect(page).toContain('email: who.email, name, phone:');

  // Switched off on screen as well as refused in the handler, and the line says
  // which two people the screen is holding rather than only that something is
  // wrong. A banner is not enough on its own - the handlers are what send.
  expect(page).toContain("const splitIdentity = loadedEmail.current !== ''\n    && email.trim().toLowerCase() !== loadedEmail.current.toLowerCase();");
  expect(page).toContain('data-testid="sq-identity-split"');
  expect(page).toContain('&& !splitIdentity;');
  expect(page).toContain('disabled={scheduling || splitIdentity ||');
});

test('AC109 one row-busy state, so a fourth row action cannot leave a button live', () => {
  // Three `useState<string | null>` held the same fact - which row is mid-write
  // - and were mutually exclusive by construction, with the disabled condition
  // spelled out identically at all three buttons.
  const page = read('src/app/vaca-mgmt/send-service-quote/page.tsx');
  expect(page).toContain('const [rowBusy, setRowBusy] = useState<{ action: RowAction; start: string } | null>(null);');
  for (const gone of ['setCompleting', 'setCancelling', 'setHandling']) {
    expect(page, `${gone} is no longer a separate state`).not.toContain(gone);
  }
  // One lock, one spelling, read by all three buttons.
  expect(page).toContain('const rowLocked = rowBusy !== null || !homeownerId;');
  expect((page.match(/disabled=\{rowLocked\}/g) ?? [])).toHaveLength(3);
  expect(page).not.toContain('completing !== null || cancelling !== null');

  // And the prelude and epilogue every row action shares are spelled once: the
  // customer this page holds, the question, the lock, and the failure toast.
  const runner = page.slice(page.indexOf('const runRowAction = async ('), page.indexOf('const complete ='));
  expect(runner).toContain('if (!homeownerId) return;');
  expect(runner).toContain('if (!window.confirm(copy.ask)) return;');
  expect(runner).toContain('setRowBusy({ action, start: booking.start });');
  expect(runner).toContain('setRowBusy(null);');
  const bare = code('src/app/vaca-mgmt/send-service-quote/page.tsx');
  for (const handler of ['const complete =', 'const cancel =', 'const markHandled =']) {
    expect(bare.slice(bare.indexOf(handler), bare.indexOf(handler) + 200)).toContain('runRowAction(');
  }
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
    name: 'Alex', confirm_token: 't', status: 'sent', confirmed_at: null, note: null,
    notified_at: null, ...over,
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
  // Confirm-gated, the same as "Mark completed" - through the one gate all
  // three row actions now share, so the question is asked by construction
  // rather than by each handler remembering to ask it.
  // The chase half of that question is conditioned on a chase actually being
  // left to stop - a visit today is out of the escalation's window entirely.
  // And the stages it names are the ones still ahead, never a fixed pair.
  expect(page).toContain("? `Mark this flag handled? ${chaseStageLabel(ahead)} will not chase this visit.`");
  expect(page).toContain('const ahead = chasesAhead({ visitStart: new Date(booking.start), now: new Date() });');
  expect(page).toContain('if (!window.confirm(copy.ask)) return;');
  expect(page).toContain("return runRowAction(\n      'handle',");
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
  // Naming the stages still ahead, not the fixed pair - AC113.
  expect(page).toContain('Another flag is still open on it, so ${chaseStageLabel(aheadNow)} will keep chasing it.');
  expect(page).toContain('Nobody on this visit has confirmed, so ${chaseStageLabel(aheadNow)} will still chase it.');
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
