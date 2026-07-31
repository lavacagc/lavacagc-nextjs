import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildIcs, googleCalendarUrl, ICS_ORGANIZER } from '../src/lib/homecare/ics';
import { buildDispatchEmail, dispatchSubject, ACTION_PREFIX } from '../src/lib/homecare/dispatchEmail';
import { escapeTelegram } from '../src/lib/notify/telegramMessage';
import { SERVICE_REPLY_TO } from '../src/lib/homecare/serviceEmails';

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

test('AC4 a crew invite carries SEQUENCE so a re-send supersedes it', () => {
  expect(ics()).toContain('SEQUENCE:0');
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
  expect(fn).not.toContain("status: 'sent'");
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
  expect(del).toContain('clearVisitDispatch(homeownerId, startAt)');
  expect(read('src/lib/homecare/dispatch.ts')).toContain("'DELETE',\n      `visit_dispatch?homeowner_id=eq.");
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

test('AC55 a flag counts as answered, exactly like a confirm', () => {
  expect(cron()).toContain("mine.some((a) => a.status === 'confirmed' || a.status === 'flagged')");
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
