import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildServiceQuoteEmail, buildVisitReminderEmail, buildServiceCompletedEmail,
  GOOGLE_RATING, SERVICE_REPLY_TO, formatQuoteDate,
} from '../src/lib/homecare/serviceEmails';
import { buildIcs, escapeIcsText, easternWallClock, easternOffsetHours } from '../src/lib/homecare/ics';
import {
  parseTaskKeys, resolveServices, bookableCatalog, lastDoneFor, lastDoneLabel, scopeSummaryFrom,
  groupBookings, type ServiceCatalogRow,
} from '../src/lib/homecare/serviceIntake';
import { supersededBookings, orphanedVisitStarts, crossSeasonBookings } from '../src/lib/homecare/serviceScheduling';
import {
  tomorrowEasternWindow, visitDateLabel, visitTimeWindow, reminderSendAt, reminderRunAt,
  reminderIsStillUseful, visitKey, easternVisitInstant, ledgerKey, ledgerVerdict,
  visitEndsAt, easternDayOffset, VISIT_REMINDER_TYPE,
} from '../src/lib/homecare/visitSchedule';
import { BUSINESS_ADDRESS } from '../src/lib/homecare/emailShell';
import { seasonForTaskVisit } from '../src/lib/homecare/season';
import { checklistCompletionFields } from '../src/lib/homecare/selection';

/**
 * Acceptance criteria for Home Care service quotes.
 * See docs/service-quotes-acceptance-criteria.md - IDs below match that doc.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const UNSUB = 'https://www.lavacagc.com/api/home-care/unsubscribe?token=TOK';
const PREFS = 'https://www.lavacagc.com/preferences?token=PREF';
const QBO = 'https://app.qbo.intuit.com/app/estimate?txnId=1042';
const NOW = new Date(Date.UTC(2026, 6, 30, 15));

const quote = (over = {}) => buildServiceQuoteEmail({
  recipientName: 'Jordan Caruso',
  scopeSummary: 'Gutter clearing and a dryer-vent clean',
  estimateUrl: QBO,
  visitLength: 'About 2-3 hours, one visit',
  unsubscribeUrl: UNSUB, preferencesUrl: PREFS, now: NOW,
  ...over,
});
const reminder = (over = {}) => buildVisitReminderEmail({
  recipientName: 'Jordan Caruso',
  services: ['Clean gutters & downspouts', 'Clean the dryer vent'],
  address: '14 Maple Ave, West Orange, NJ',
  timeWindow: '8:00 - 11:00am', visitDateLabel: 'Wed 5 Aug',
  portalUrl: 'https://www.lavacagc.com/home-care/checklist',
  unsubscribeUrl: UNSUB, preferencesUrl: PREFS,
  ...over,
});
const completed = (over = {}) => buildServiceCompletedEmail({
  recipientName: 'Jordan Caruso',
  services: ['the gutters', 'the dryer vent'],
  feedbackUrl: 'https://www.lavacagc.com/feedback?token=F',
  unsubscribeUrl: UNSUB, preferencesUrl: PREFS,
  ...over,
});

/* ── SQ: the service quote email ─────────────────────────────────────────── */

test('SQ1: the quote renders on the shared shell chrome', () => {
  const h = quote().html;
  expect(h).toContain('Licensed, Bonded, &amp; Insured');
  expect(h).toContain('HIC# 13VH13373800');
  expect(h).toContain('max-width:600px');
  expect(h).toContain('Rather we handled it?'.replace('Rather we handled it?', 'Questions before you decide?'));
});

test('SQ2: none of the project-estimate machinery leaks in', () => {
  const h = quote().html;
  for (const gone of [
    'portal', 'Portal', 'Weekly progress', 'update cadence',
    'Schluter', 'Lifetime warranty', 'What you get with La Vaca',
    'Click <strong>View estimate', 'HOW TO ACCEPT',
  ]) {
    expect(h, `should not contain "${gone}"`).not.toContain(gone);
  }
});

test('SQ3: the CTA opens the QuickBooks estimate', () => {
  const n = quote();
  expect(n.html).toContain(`href="${QBO}"`);
  expect(n.html).toContain('Open your estimate');
  expect(n.text).toContain(QBO);
});

test('SQ4: exactly three credibility claims, and the rating comes from one constant', () => {
  const h = quote().html;
  expect(h).toContain("Who&#39;s doing the work".replace('&#39;', "'"));
  expect(h).toContain('Licensed, bonded &amp; insured');
  expect(h).toContain('1-year workmanship warranty');
  expect(h).toContain(`${GOOGLE_RATING} on Google`);
  // The rating must not be inlined anywhere - one constant, or it silently
  // becomes a false claim when the real rating moves.
  const src = read('src/lib/homecare/serviceEmails.ts');
  expect(src).toContain("export const GOOGLE_RATING");
  expect((src.match(/5\.0 on Google/g) || []).length).toBe(0);
});

test('SQ5: promises a 5-star finish, never asks for a review', () => {
  const n = quote();
  expect(n.html).toContain('5-star finish');
  expect(n.html).toContain("we'll ask how we did");
  for (const banned of ['review', 'Review', '5-star review', 'rate us', 'leave us']) {
    expect(n.html, `quote must not solicit: ${banned}`).not.toContain(banned);
    expect(n.text, `quote text must not solicit: ${banned}`).not.toContain(banned);
  }
});

test('SQ6: valid-until renders and defaults to 30 days out', () => {
  const n = quote();
  const expected = formatQuoteDate(new Date(NOW.getTime() + 30 * 86400_000));
  expect(n.html).toContain(expected);
  expect(n.text).toContain(expected);
  const explicit = quote({ validUntil: new Date(Date.UTC(2026, 8, 15)) });
  expect(explicit.html).toContain('15 Sep 2026');
});

test('SQ7: scope and visit length render, and are escaped', () => {
  const n = quote({ scopeSummary: 'Gutters & <script>x</script> vent' });
  expect(n.html).toContain('Gutters &amp; &lt;script&gt;');
  expect(n.html).not.toContain('<script>x</script>');
  expect(quote().html).toContain('About 2-3 hours, one visit');
});

test('SQ8: html and text carry the same facts', () => {
  const n = quote();
  for (const fact of ['Gutter clearing and a dryer-vent clean', QBO]) {
    expect(n.html).toContain(fact.replace('&', '&amp;'));
    expect(n.text).toContain(fact);
  }
});

/* ── IN: intake ──────────────────────────────────────────────────────────── */

const CATALOG: ServiceCatalogRow[] = [
  { key: 'clean_gutters', title: 'Clean gutters & downspouts', blurb: 'Clear them out.', bookable: true, priority: 10 },
  { key: 'clean_dryer_vent', title: 'Clean the dryer vent', blurb: 'Lint is a fire cause.', bookable: true, priority: 8 },
  { key: 'test_smoke_co', title: 'Test detectors', blurb: 'Press test.', bookable: false, priority: 9 },
];

test('IN1: task keys parse out of a Home Care lead message', () => {
  expect(parseTaskKeys('Home Care booking - Clean gutters (tasks: clean_gutters)')).toEqual(['clean_gutters']);
  expect(parseTaskKeys('x (tasks: clean_gutters, clean_dryer_vent )')).toEqual(['clean_gutters', 'clean_dryer_vent']);
  expect(parseTaskKeys('(TASKS: clean_gutters)')).toEqual(['clean_gutters']);
  expect(parseTaskKeys('A contact form message with no marker')).toEqual([]);
  expect(parseTaskKeys(null)).toEqual([]);
  expect(parseTaskKeys('(tasks: a,a,b)')).toEqual(['a', 'b']); // deduped
});

test('IN2: keys resolve to catalog rows; unknown keys are dropped', () => {
  const r = resolveServices(['clean_gutters', 'no_such_task', 'clean_dryer_vent'], CATALOG);
  expect(r.map((x) => x.key)).toEqual(['clean_gutters', 'clean_dryer_vent']);
});

test('IN3: the walk-in dropdown is bookable services by priority', () => {
  const r = bookableCatalog(CATALOG);
  expect(r.map((x) => x.key)).toEqual(['clean_gutters', 'clean_dryer_vent']);
  expect(r.every((x) => x.bookable)).toBe(true);
});

test('IN4: last-done ignores anything that is not a real completion', () => {
  const m = lastDoneFor([
    { task_key: 'clean_gutters', status: 'done', completed_at: '2025-10-04T00:00:00Z', completed_by: 'lavaca' },
    { task_key: 'clean_dryer_vent', status: 'booked', completed_at: null },
    { task_key: 'test_smoke_co', status: 'done', completed_at: null },
  ]);
  expect(m.get('clean_gutters')?.by).toBe('lavaca');
  expect(m.has('clean_dryer_vent')).toBe(false);
  expect(m.has('test_smoke_co')).toBe(false);
});

test('IN4: last-done reads the timestamp, so an untick does not erase the job', () => {
  // The row is current state AND history. A member unticking work La Vaca
  // performed means "this needs doing again" - it is not a claim that we never
  // came, and reading through status='done' turned one tap into "no record" for
  // a visit that was performed and invoiced. See CP10.
  const m = lastDoneFor([
    { task_key: 'clean_gutters', status: 'todo', completed_at: '2025-10-04T00:00:00Z', completed_by: 'lavaca' },
  ]);
  expect(lastDoneLabel(m.get('clean_gutters'))).toBe('last done Oct 2025 by La Vaca');
});

test('CP10: an untick keeps La Vaca\'s record and retracts the member\'s own', () => {
  const now = '2026-08-05T15:00:00.000Z';
  const ours = { completed_by: 'lavaca', completed_at: '2025-10-04T00:00:00Z' };

  // Unticking OUR work touches neither column: an empty object is what the
  // merge-duplicates upsert needs to leave them exactly as they were.
  expect(checklistCompletionFields(false, now, ours)).toEqual({});

  // Their own is theirs to retract - that is what unticking means.
  expect(checklistCompletionFields(false, now, { completed_by: 'homeowner', completed_at: now }))
    .toEqual({ completed_at: null, completed_by: 'homeowner' });
  // And a row with no completion at all has nothing to preserve.
  expect(checklistCompletionFields(false, now, null))
    .toEqual({ completed_at: null, completed_by: 'homeowner' });
  // An attribution with no date is not a record of a job either.
  expect(checklistCompletionFields(false, now, { completed_by: 'lavaca', completed_at: null }))
    .toEqual({ completed_at: null, completed_by: 'homeowner' });

  // A tick always reassigns the row to the member, whatever was there (CP2):
  // last-done then reports their job, which is the most recent one.
  expect(checklistCompletionFields(true, now, ours)).toEqual({ completed_at: now, completed_by: 'homeowner' });
});

test('IN5: last-done returns the newest completion for a multi-season task', () => {
  const m = lastDoneFor([
    { task_key: 'clean_gutters', status: 'done', completed_at: '2024-10-01T00:00:00Z' },
    { task_key: 'clean_gutters', status: 'done', completed_at: '2026-04-11T00:00:00Z' },
  ]);
  expect(m.get('clean_gutters')?.at.getUTCFullYear()).toBe(2026);
  expect(lastDoneLabel(m.get('clean_gutters'))).toBe('last done Apr 2026');
  expect(lastDoneLabel(undefined)).toBe('no record');
});

/* PostgREST renders `timestamptz` the way Postgres does; a Date does not. The
   same instant, spelled two ways, and every window comparison in this feature
   has to survive meeting both. */
const PG = '2026-08-05T12:00:00+00:00';
const JS = new Date(PG).toISOString(); // 2026-08-05T12:00:00.000Z

test('CP9: open bookings group into one entry per VISIT, keyed on the instant', () => {
  const byKey = new Map(CATALOG.map((c) => [c.key, c]));
  const later = '2026-08-12T13:30:00+00:00';
  const bookings = groupBookings([
    // Same window, two spellings: one visit, two services - not two visits.
    { task_key: 'clean_gutters', season: 'fall', scheduled_start: PG, scheduled_end: null, service_address: '9 Elm St' },
    { task_key: 'clean_dryer_vent', season: 'fall', scheduled_start: JS, scheduled_end: null, service_address: '9 Elm St' },
    { task_key: 'clean_gutters', season: 'spring', scheduled_start: later, scheduled_end: null, service_address: '9 Elm St' },
  ], byKey);

  expect(bookings.length, 'two visits, not three rows').toBe(2);
  expect(bookings[0].tasks.map((t) => t.key)).toEqual(['clean_gutters', 'clean_dryer_vent']);
  expect(bookings[0].tasks[0].title).toBe('Clean gutters & downspouts');
  // Normalised, because /complete matches the visit on exactly this value.
  expect(bookings[0].start).toBe(JS);
  expect(bookings[1].start).toBe(new Date(later).toISOString());
  // Earliest first: the next job the crew does is the one at the top.
  expect(new Date(bookings[0].start).getTime()).toBeLessThan(new Date(bookings[1].start).getTime());
});

test('SC10+SC12: a supersede compares windows as instants, and spares a shared one', () => {
  const fallGutters = [{ taskKey: 'clean_gutters', season: 'fall' }];
  const previous = [
    { task_key: 'clean_gutters', season: 'fall', scheduled_start: PG },
    { task_key: 'clean_dryer_vent', season: 'fall', scheduled_start: PG },
  ];
  // Re-submitting the SAME window supersedes nothing, even though PostgREST
  // spells it differently from the Date the caller holds.
  expect(supersededBookings({ previous, tasks: fallGutters, start: new Date(JS) })).toEqual([]);

  // Moving it does, and reads the row PostgREST actually returned.
  const moved = new Date('2026-09-05T12:00:00.000Z');
  const superseded = supersededBookings({ previous, tasks: fallGutters, start: moved });
  expect(superseded.map((r) => r.task_key)).toEqual(['clean_gutters']);

  // But the dryer vent is still booked into 5 Aug, so that visit is still
  // happening and its reminder must not be pulled.
  expect(orphanedVisitStarts({ previous, superseded })).toEqual([]);

  // With nothing else holding it, the window is retired and so is its reminder.
  const alone = [{ task_key: 'clean_gutters', season: 'fall', scheduled_start: PG }];
  expect(orphanedVisitStarts({
    previous: alone,
    superseded: supersededBookings({ previous: alone, tasks: fallGutters, start: moved }),
  }).map((d) => d.toISOString())).toEqual([JS]);
});

test('SC15: a service already booked in another season is refused', () => {
  // `seasonForTaskVisit` flips a fall+spring service on 1 Jun and 1 Dec, so a
  // SEVEN-DAY slip crosses it: 25 Nov files under fall, 3 Dec under spring.
  // Two rows, and the fall one keeps announcing 25 Nov.
  expect(seasonForTaskVisit(new Date('2026-11-25T12:00:00Z'), ['fall', 'spring'])).toBe('fall');
  expect(seasonForTaskVisit(new Date('2026-12-03T12:00:00Z'), ['fall', 'spring'])).toBe('spring');

  const now = new Date('2026-11-18T12:00:00Z');
  const previous = [{ task_key: 'clean_gutters', season: 'fall', scheduled_start: '2026-11-25T13:00:00+00:00' }];
  const conflicts = crossSeasonBookings({
    previous, tasks: [{ taskKey: 'clean_gutters', season: 'spring' }], now,
  });
  expect(conflicts.map((r) => r.season), 'the 25 Nov visit is named, not silently superseded').toEqual(['fall']);

  // Same season is a plain reschedule and passes straight through.
  expect(crossSeasonBookings({
    previous, tasks: [{ taskKey: 'clean_gutters', season: 'fall' }], now,
  })).toEqual([]);
  // A different service is nothing to do with this booking.
  expect(crossSeasonBookings({
    previous, tasks: [{ taskKey: 'clean_dryer_vent', season: 'spring' }], now,
  })).toEqual([]);
  // And a window already PAST announces nothing - its reminder run has fired
  // and the portal card filters to the future. Blocking on one would only mean
  // a visit nobody closed out can never be re-booked.
  expect(crossSeasonBookings({
    previous, tasks: [{ taskKey: 'clean_gutters', season: 'spring' }], now: new Date('2026-11-26T12:00:00Z'),
  })).toEqual([]);
});

test('SC10: the other half of a two-season service keeps its booking', () => {
  // `clean_gutters` is a fall AND a spring task, and a customer with both halves
  // of the year booked is normal - not a conflict to resolve. Matched on the
  // task alone, booking the spring clean unbooked the October one and pulled its
  // reminder while the toast still read "Visit scheduled".
  const previous = [{ task_key: 'clean_gutters', season: 'fall', scheduled_start: '2026-10-10T12:00:00+00:00' }];
  const spring = new Date('2027-04-15T12:00:00.000Z');
  const superseded = supersededBookings({
    previous, tasks: [{ taskKey: 'clean_gutters', season: 'spring' }], start: spring,
  });
  expect(superseded, 'a different season is a different booking, not a move').toEqual([]);
  expect(orphanedVisitStarts({ previous, superseded }), 'so October keeps its reminder').toEqual([]);

  // Within the season it still moves in place, and the vacated window retires.
  const moved = supersededBookings({
    previous, tasks: [{ taskKey: 'clean_gutters', season: 'fall' }], start: new Date('2026-10-17T12:00:00.000Z'),
  });
  expect(orphanedVisitStarts({ previous, superseded: moved }).map((d) => d.toISOString()))
    .toEqual(['2026-10-10T12:00:00.000Z']);
});

test('IN: scope summary reads naturally for 1, 2 and 3 services', () => {
  expect(scopeSummaryFrom([{ title: 'A' }])).toBe('A');
  expect(scopeSummaryFrom([{ title: 'A' }, { title: 'B' }])).toBe('A and B');
  expect(scopeSummaryFrom([{ title: 'A' }, { title: 'B' }, { title: 'C' }])).toBe('A, B and C');
});

/* ── ICS ─────────────────────────────────────────────────────────────────── */

const START = easternWallClock(new Date(Date.UTC(2026, 7, 5)), 8, 0);
const END = easternWallClock(new Date(Date.UTC(2026, 7, 5)), 11, 0);
const ics = (variant: 'owner' | 'customer') => buildIcs({
  uid: 'visit-1', start: START, end: END,
  services: ['Clean gutters & downspouts'], address: '14 Maple Ave, West Orange, NJ',
  customerName: 'Jordan Caruso', customerPhone: '201-555-0100', variant, now: NOW,
});

test('ICS1: a valid VEVENT with the required properties', () => {
  const s = ics('owner');
  for (const k of ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:', 'DTSTAMP:', 'DTSTART:', 'DTEND:', 'SUMMARY:', 'END:VCALENDAR']) {
    expect(s).toContain(k);
  }
  expect(s.includes('\r\n')).toBe(true); // RFC 5545 requires CRLF
});

test('ICS2: text is escaped per RFC 5545', () => {
  expect(escapeIcsText('a,b;c\\d')).toBe('a\\,b\\;c\\\\d');
  expect(escapeIcsText('line1\nline2')).toBe('line1\\nline2');
  expect(ics('owner')).toContain('14 Maple Ave\\, West Orange\\, NJ');
});

test('ICS3: two absolute alarms, never relative offsets', () => {
  const s = ics('owner');
  expect((s.match(/BEGIN:VALARM/g) || []).length).toBe(2);
  expect((s.match(/TRIGGER;VALUE=DATE-TIME:/g) || []).length).toBe(2);
  expect(s).not.toMatch(/TRIGGER:-PT/); // a relative trigger would drift by job time
  // Evening before = 7:30pm ET on 4 Aug = 23:30Z (EDT).
  expect(s).toContain('TRIGGER;VALUE=DATE-TIME:20260804T233000Z');
});

test('ICS3: an evening visit puts its alarms on the visit\'s Eastern days', () => {
  // 8pm ET on 5 Aug is already 6 Aug in UTC. Reading the raw UTC date would put
  // the "crew is on the way" alarm at 7am the day AFTER the job, and the
  // confirm alarm 30 minutes before it - so both resolve through Eastern.
  const evening = easternWallClock(new Date(Date.UTC(2026, 7, 5)), 20, 0);
  expect(evening.toISOString(), 'the UTC date has rolled over').toBe('2026-08-06T00:00:00.000Z');
  const s = buildIcs({
    uid: 'visit-evening', start: evening, end: new Date(evening.getTime() + 2 * 3600_000),
    services: ['Clean gutters & downspouts'], address: '14 Maple Ave, West Orange, NJ',
    customerName: 'Jordan Caruso', customerPhone: null, variant: 'owner', now: NOW,
  });
  // Confirm: 7:30pm ET on 4 Aug. Same instant the reminder email is queued for.
  expect(s).toContain('TRIGGER;VALUE=DATE-TIME:20260804T233000Z');
  expect(reminderSendAt(evening).toISOString()).toBe('2026-08-04T23:30:00.000Z');
  // On the way: 7am ET on 5 Aug, the morning OF the visit.
  expect(s).toContain('TRIGGER;VALUE=DATE-TIME:20260805T110000Z');
});

test('ICS4: alarms name the ops action', () => {
  const s = ics('owner');
  expect(s).toContain("Confirm tomorrow's visit");
  expect(s).toContain('when the crew is on the way');
});

test('ICS5: the customer copy has no alarms at all', () => {
  const s = ics('customer');
  expect(s).not.toContain('VALARM');
  expect(s).not.toContain('when the crew is on the way');
  expect(s).not.toContain('201-555-0100'); // no internal contact detail either
});

test('ICS6: LOCATION carries the service address', () => {
  expect(ics('customer')).toContain('LOCATION:14 Maple Ave');
});

/* ── RM: the night-before reminder ───────────────────────────────────────── */

test('RM2: the reminder states date, window, address and the text promise', () => {
  const n = reminder();
  expect(n.subject).toContain('Wed 5 Aug');
  expect(n.subject).toContain('8:00 - 11:00am');
  expect(n.html).toContain('14 Maple Ave, West Orange, NJ');
  expect(n.html).toContain("We&#39;ll text you when we&#39;re on our way".replace(/&#39;/g, "'"));
  expect(n.text).toContain("We'll text you when we're on our way");
});

test('RM3: reply-to is both alex@ and veronica@', () => {
  expect(SERVICE_REPLY_TO).toEqual(['alex@lavacagc.com', 'veronica@lavacagc.com']);
});

test('RM6: the cron is 30 23 * * * UTC - 7:30pm ET summer, 6:30pm winter', () => {
  const vercel = JSON.parse(read('vercel.json'));
  const cron = vercel.crons.find((c: { path: string }) => c.path.startsWith('/api/cron/visit-reminders'));
  expect(cron, 'visit-reminders cron must be registered').toBeTruthy();
  expect(cron.schedule).toBe('30 23 * * *');
  // 23:30Z in August is 19:30 ET; in January 18:30 ET. Both evening, neither
  // crosses midnight - which is what keeps "tomorrow" resolving correctly.
  expect(easternOffsetHours(new Date(Date.UTC(2026, 7, 4, 23, 30)))).toBe(4);
  expect(easternOffsetHours(new Date(Date.UTC(2026, 0, 4, 23, 30)))).toBe(5);
});

test('RM7: the cron window is tomorrow in EASTERN, not UTC', () => {
  // Cron fires 23:30Z on 4 Aug = 7:30pm ET on 4 Aug. "Tomorrow" is 5 Aug ET.
  const w = tomorrowEasternWindow(new Date(Date.UTC(2026, 7, 4, 23, 30)));
  const earlyTomorrow = easternWallClock(new Date(Date.UTC(2026, 7, 5)), 7, 0);
  const lateTomorrow = easternWallClock(new Date(Date.UTC(2026, 7, 5)), 20, 0);
  const today = easternWallClock(new Date(Date.UTC(2026, 7, 4)), 10, 0);
  const dayAfter = easternWallClock(new Date(Date.UTC(2026, 7, 6)), 9, 0);
  for (const [d, want, label] of [[earlyTomorrow, true, 'early tomorrow'], [lateTomorrow, true, 'late tomorrow'], [today, false, 'today'], [dayAfter, false, 'day after']] as const) {
    expect(d >= w.startUtc && d < w.endUtc, label).toBe(want);
  }
});

test('RM: helpers derive the labels and send time the emails use', () => {
  expect(visitDateLabel(START)).toBe('Wed 5 Aug');
  expect(visitTimeWindow(START, END)).toBe('8:00 - 11:00am');
  // Spanning the meridiem keeps both markers.
  const pmEnd = easternWallClock(new Date(Date.UTC(2026, 7, 5)), 13, 0);
  expect(visitTimeWindow(START, pmEnd)).toBe('8:00am - 1:00pm');
  expect(reminderSendAt(START).toISOString()).toBe('2026-08-04T23:30:00.000Z');
  expect(reminderIsStillUseful(START, new Date(Date.UTC(2026, 7, 1)))).toBe(true);
  expect(reminderIsStillUseful(START, new Date(Date.UTC(2026, 7, 9)))).toBe(false);
  expect(VISIT_REMINDER_TYPE).toBe('visit_reminder_1d');
});

test('PT7: a visit is over when its window closes, not when it opens', () => {
  const endMs = visitEndsAt(START.toISOString(), END.toISOString());
  expect(endMs).toBe(END.getTime());
  // Mid-window, the visit is still on: this is the hour the member is most
  // likely to open the portal to check the address.
  const midway = new Date(START.getTime() + 90 * 60_000);
  expect(endMs, 'still live at 9:30am on an 8-11am job').toBeGreaterThan(midway.getTime());
  expect(endMs).toBeLessThan(END.getTime() + 1);
  // A null scheduled_end falls back to two hours, in ONE place.
  expect(visitEndsAt(START.toISOString(), null)).toBe(START.getTime() + 2 * 3600_000);
  expect(visitEndsAt(START.toISOString(), undefined)).toBe(START.getTime() + 2 * 3600_000);
});

test('PT2: the day of the visit reads as today, in Eastern', () => {
  // 6am Eastern on the day of an 8am visit: same Eastern day, and the card
  // must say so rather than falling to the quiet "Scheduled" state.
  const morningOf = easternWallClock(new Date(Date.UTC(2026, 7, 5)), 6, 0);
  expect(easternDayOffset(START, morningOf)).toBe(0);
  expect(easternDayOffset(START, easternWallClock(new Date(Date.UTC(2026, 7, 4)), 20, 0))).toBe(1);
  expect(easternDayOffset(START, easternWallClock(new Date(Date.UTC(2026, 7, 1)), 12, 0))).toBe(4);
  // 11pm Eastern on 4 Aug is 03:00 UTC on 5 Aug - read in UTC this would call
  // an 8am visit "today" a day early.
  const lateNightBefore = easternWallClock(new Date(Date.UTC(2026, 7, 4)), 23, 0);
  expect(lateNightBefore.getUTCDate(), 'already the 5th in UTC').toBe(5);
  expect(easternDayOffset(START, lateNightBefore), 'still tomorrow in Eastern').toBe(1);
});

test('RM12: the reminder gate is the SEND time, not the visit', () => {
  // The cron only ever looks at "tomorrow, Eastern", so what decides whether a
  // reminder can be DELIVERED is whether its 7:30pm slot is still ahead.
  const slot = reminderSendAt(START); // 7:30pm ET on 4 Aug
  expect(reminderIsStillUseful(START, new Date(slot.getTime() - 60_000)), 'just before the slot').toBe(true);
  expect(reminderIsStillUseful(START, new Date(slot.getTime() + 60_000)), 'just after it').toBe(false);
  // Booked at 11pm the night before: the visit is 9 hours out, but the run that
  // would have carried its reminder fired hours ago.
  const lateNightBefore = easternWallClock(new Date(Date.UTC(2026, 7, 4)), 23, 0);
  expect(START.getTime(), 'the visit itself is still ahead').toBeGreaterThan(lateNightBefore.getTime());
  expect(reminderIsStillUseful(START, lateNightBefore)).toBe(false);
  // Same-day booking, likewise.
  expect(reminderIsStillUseful(START, easternWallClock(new Date(Date.UTC(2026, 7, 5)), 6, 0))).toBe(false);
});

test('RM14: the gate follows the cron under EST, not the nominal 7:30pm', () => {
  // The cron is one fixed UTC time with no DST logic, so it fires at 7:30pm
  // Eastern only under EDT - under EST it fires at 6:30pm, an HOUR before the
  // send time the queue row carries. Gated on the send time, a booking made in
  // that hour on any winter evening queued a row the covering run had already
  // passed: pending forever, while the admin was told a reminder was on its way.
  const winterVisit = easternWallClock(new Date(Date.UTC(2026, 11, 15)), 8, 0);
  const coveringRun = reminderRunAt(winterVisit);
  expect(coveringRun.toISOString(), 'the 23:30 UTC run the day before').toBe('2026-12-14T23:30:00.000Z');
  expect(reminderSendAt(winterVisit).toISOString(), 'the nominal slot, an hour later')
    .toBe('2026-12-15T00:30:00.000Z');

  // 7pm Eastern on 14 Dec: before the slot, after the run.
  const inTheGap = easternWallClock(new Date(Date.UTC(2026, 11, 14)), 19, 0);
  expect(inTheGap.getTime()).toBeGreaterThan(coveringRun.getTime());
  expect(inTheGap.getTime()).toBeLessThan(reminderSendAt(winterVisit).getTime());
  expect(reminderIsStillUseful(winterVisit, inTheGap), 'the run has gone - do not promise a reminder').toBe(false);
  expect(reminderIsStillUseful(winterVisit, new Date(coveringRun.getTime() - 60_000))).toBe(true);

  // Under EDT the two agree, which is why an August-only test missed this.
  expect(reminderRunAt(START).toISOString()).toBe(reminderSendAt(START).toISOString());
});

test('SC8: a booking is filed under a season the task actually renders in', () => {
  const jul = new Date(Date.UTC(2026, 6, 15)); // summer
  const sep = new Date(Date.UTC(2026, 8, 15)); // fall
  const jun = new Date(Date.UTC(2026, 5, 20)); // summer

  // The visit's own season wins when the task applies to it.
  expect(seasonForTaskVisit(sep, ['fall', 'spring'])).toBe('fall');
  expect(seasonForTaskVisit(jul, ['summer'])).toBe('summer');

  // Otherwise the nearest season the task DOES apply to. Gutters booked in July
  // are fall prep; filed under 'summer' the row matches no tab at all, because
  // the portal renders a task only in its catalog seasons.
  expect(seasonForTaskVisit(jul, ['fall', 'spring']), 'clean_gutters in July').toBe('fall');
  expect(seasonForTaskVisit(jul, ['fall']), 'hvac_furnace_tuneup in July').toBe('fall');
  // An A/C tune-up booked when it gets hot belongs to the spring row that is
  // still current, not to next year's.
  expect(seasonForTaskVisit(jun, ['spring']), 'hvac_ac_tuneup in June').toBe('spring');
  // A deck seal booked in September belongs to the summer row.
  expect(seasonForTaskVisit(sep, ['summer']), 'seal_deck in September').toBe('summer');
  // Two steps away is still resolved rather than dropped.
  expect(seasonForTaskVisit(jul, ['winter'])).toBe('winter');

  // Nothing to file it under - the caller must reject the booking rather than
  // write a row the member can never see.
  expect(seasonForTaskVisit(jul, [])).toBe(null);
  expect(seasonForTaskVisit(jul, ['new_construction'])).toBe(null);
});

test('RM11: two visits on ONE day are distinct rows, not one shared slot', () => {
  // Gutters at 8am and a dryer vent at 1pm on 5 Aug. Both reminders go out the
  // same evening, so the SEND TIME cannot tell them apart - which is exactly why
  // the queue row is keyed on the visit instead.
  const gutters = easternWallClock(new Date(Date.UTC(2026, 7, 5)), 8, 0);
  const dryerVent = easternWallClock(new Date(Date.UTC(2026, 7, 5)), 13, 0);
  expect(reminderSendAt(gutters).toISOString(), 'one send time for both')
    .toBe(reminderSendAt(dryerVent).toISOString());
  expect(visitKey(gutters)).not.toBe(visitKey(dryerVent));
  expect(visitKey(gutters)).toBe(gutters.toISOString());
});

test('RM8: the ledger verdict is order-independent and fails closed', () => {
  const row = (id: string, status: string, created_at: string) => ({ id, status, created_at });
  const pending = row('a', 'pending', '2026-08-04T10:00:00Z');
  const cancelled = row('b', 'cancelled', '2026-08-04T11:00:00Z');
  const sent = row('c', 'sent', '2026-08-04T12:00:00Z');
  const requeued = row('d', 'pending', '2026-08-04T13:00:00Z');

  // No row at all: nothing has happened, so the cron writes one and sends.
  expect(ledgerVerdict([])).toEqual({ claim: null, closed: false });
  expect(ledgerVerdict(undefined)).toEqual({ claim: null, closed: false });

  // One open row: claim it.
  expect(ledgerVerdict([pending]).claim).toBe(pending);
  expect(ledgerVerdict([row('a', 'failed', '2026-08-04T10:00:00Z')]).closed).toBe(false);

  // Rescheduled within the same day - one cancelled, one fresh. The customer's
  // visit is still on, so it must still send, whichever order Postgres returns.
  for (const rows of [[cancelled, requeued], [requeued, cancelled]]) {
    expect(ledgerVerdict(rows).claim, 'a live reminder survives a stale cancel').toBe(requeued);
  }

  // Already delivered, then rescheduled: a 'sent' row outranks the new pending
  // one in BOTH orders. This is the guarantee that stops a second reminder.
  for (const rows of [[sent, requeued], [requeued, sent]]) {
    expect(ledgerVerdict(rows)).toEqual({ claim: null, closed: true });
  }

  // Deliberately cancelled and never requeued: closed, not resurrected.
  expect(ledgerVerdict([cancelled])).toEqual({ claim: null, closed: true });

  // Several open rows: the newest wins, by a stable sort rather than row order.
  expect(ledgerVerdict([requeued, pending]).claim).toBe(requeued);
  expect(ledgerVerdict([pending, requeued]).claim).toBe(requeued);
});

test('RM11: the ledger key names one visit, not one send slot', () => {
  const gutters = easternWallClock(new Date(Date.UTC(2026, 7, 5)), 8, 0);
  const dryerVent = easternWallClock(new Date(Date.UTC(2026, 7, 5)), 13, 0);
  expect(ledgerKey('Busy@Example.com ', visitKey(gutters))).toBe(ledgerKey('busy@example.com', visitKey(gutters)));
  expect(ledgerKey('busy@example.com', visitKey(gutters)))
    .not.toBe(ledgerKey('busy@example.com', visitKey(dryerVent)));
});

test('SC7: the visit instant is built in Eastern, never in the local zone', () => {
  // 8am on 5 Aug in New Jersey is 12:00Z (EDT), whatever the admin's laptop is
  // set to. `new Date('2026-08-05T08:00')` would answer with the local zone.
  expect(easternVisitInstant('2026-08-05', '08:00').toISOString()).toBe('2026-08-05T12:00:00.000Z');
  expect(easternVisitInstant('2026-08-05', '11:00').toISOString()).toBe('2026-08-05T15:00:00.000Z');
  // EST, five hours back, and a half-hour window start.
  expect(easternVisitInstant('2026-01-05', '08:30').toISOString()).toBe('2026-01-05T13:30:00.000Z');
  // A window built here reads back as the same wall clock the admin typed.
  const start = easternVisitInstant('2026-08-05', '08:00');
  expect(visitTimeWindow(start, easternVisitInstant('2026-08-05', '11:00'))).toBe('8:00 - 11:00am');
  expect(visitDateLabel(start)).toBe('Wed 5 Aug');
  // Garbage in is loud, not silently midnight.
  expect(() => easternVisitInstant('2026-08-05', '')).toThrow();
  expect(() => easternVisitInstant('', '08:00')).toThrow();
});

/* ── CP: completion ──────────────────────────────────────────────────────── */

test('CP5: the completion email uses the owner-specified wording', () => {
  const n = completed();
  expect(n.subject).toBe('Please let us know how our team did');
  expect(n.html).toContain('Please let us know');
  expect(n.html).toContain('how our team did.');
});

test('CP6: "we come back" precedes any mention of a public word', () => {
  const n = completed();
  const fix = n.html.indexOf("isn&#39;t right".replace('&#39;', "'"));
  const publicWord = n.html.indexOf('helps other Northern NJ homeowners');
  expect(fix, 'the make-it-right line must be present').toBeGreaterThan(-1);
  expect(publicWord).toBeGreaterThan(fix);
  // And it never solicits a specifically positive rating.
  for (const banned of ['5-star review', 'five star review', 'good review', 'positive review']) {
    expect(n.html.toLowerCase()).not.toContain(banned);
  }
});

test('CP7: the service variant never uses the project copy', () => {
  const n = completed();
  expect(n.html).not.toContain('your recent project');
  expect(n.html).not.toContain('enjoying the results');
});

/* ── CM: compliance across every new email ───────────────────────────────── */

const allNew = () => ({ quote: quote(), reminder: reminder(), completed: completed() });

test('CM1+CM2+CM3: postal address, opt-out and a reason, in HTML and text', () => {
  for (const [name, m] of Object.entries(allNew())) {
    expect(m.html, `${name} address`).toContain(BUSINESS_ADDRESS);
    expect(m.text, `${name} text address`).toContain(BUSINESS_ADDRESS);
    expect(m.html, `${name} unsub`).toContain(UNSUB);
    expect(m.text, `${name} text unsub`).toContain(`Unsubscribe: ${UNSUB}`);
    expect(m.html, `${name} reason`).toMatch(/You're (getting|receiving) this because/);
  }
});

test('CM4: no emoji and no em dash', () => {
  for (const [name, m] of Object.entries(allNew())) {
    expect(m.html, `${name} emoji`).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(m.html, `${name} em dash`).not.toContain('—');
    expect(m.text, `${name} text em dash`).not.toContain('—');
  }
});

test('CM5: every new email uses the shared shell chrome', () => {
  for (const [name, m] of Object.entries(allNew())) {
    expect(m.html, `${name} card`).toContain('max-width:600px');
    expect(m.html, `${name} page`).toContain('#EFEBE6');
    expect(m.html, `${name} mso`).toContain('mso-line-height-rule:exactly');
    expect(m.html, `${name} mobile`).toContain('@media only screen and (max-width:620px)');
  }
});

test('CM6: no environment leaks into a built email', () => {
  const O = 'https://staging.example.com';
  const emails = [
    buildServiceQuoteEmail({ recipientName: 'A', scopeSummary: 'S', estimateUrl: `${O}/qbo`, unsubscribeUrl: `${O}/u`, preferencesUrl: `${O}/p`, now: NOW }),
    buildVisitReminderEmail({ recipientName: 'A', services: ['S'], address: 'X', timeWindow: '8-11am', visitDateLabel: 'Wed 5 Aug', portalUrl: `${O}/c`, unsubscribeUrl: `${O}/u`, preferencesUrl: `${O}/p` }),
    buildServiceCompletedEmail({ recipientName: 'A', services: ['S'], feedbackUrl: `${O}/f`, unsubscribeUrl: `${O}/u`, preferencesUrl: `${O}/p` }),
  ];
  for (const m of emails) {
    const off = [...m.html.matchAll(/href="(https?:[^"]+)"/g)].map((x) => x[1])
      .filter((h) => !h.startsWith(O) && !h.startsWith('tel:'));
    expect(off).toEqual([]);
    expect(m.html).toContain('https://www.lavacagc.com/logo.png'); // the one deliberate absolute
  }
});
