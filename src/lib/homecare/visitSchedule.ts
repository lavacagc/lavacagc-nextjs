/**
 * La Vaca Home Care - visit scheduling windows (pure, testable).
 *
 * The reminder cron runs at `30 23 * * *` UTC, which is 7:30pm Eastern in
 * summer and 6:30pm in winter. The owner chose one fixed UTC time and accepted
 * that hour of drift rather than carry DST logic.
 *
 * 23:30 UTC is deliberate, not arbitrary: it is still the SAME calendar date in
 * Eastern, so "visits scheduled for tomorrow" resolves correctly. An hour later
 * (00:30 UTC) would already be the next UTC day while Eastern is still today,
 * and the query would silently skip a day - nobody notices a reminder that
 * never sent.
 *
 * Everything here works in Eastern wall-clock terms for that reason.
 */
import { easternOffsetHours, easternWallClock, easternParts, easternDay } from './ics';
import { VISIT_REMINDER_FOLLOW_UP_TYPES } from '@/lib/notify/cancelFollowUps';

/** Eastern calendar date parts for an instant. Defined in ics.ts so the ICS
 *  alarms and the reminder send time read a day the same way. */
export { easternParts };

/**
 * The queue type carrying visit reminders.
 *
 * Sourced from the shared follow_up_queue registry rather than spelled out
 * again here: that registry is what tells the shared send-follow-ups cron to
 * leave these rows alone, and a second copy of the string is how the two drift.
 */
export const VISIT_REMINDER_TYPE = VISIT_REMINDER_FOLLOW_UP_TYPES[0];

/**
 * The window covering "tomorrow, Eastern" as UTC instants, for the cron's
 * `scheduled_start` range query.
 */
export function tomorrowEasternWindow(now: Date): { startUtc: Date; endUtc: Date } {
  const t = easternParts(now);
  const tomorrowNoonEastern = new Date(Date.UTC(t.y, t.m, t.day + 1, 12));
  const p = easternParts(new Date(tomorrowNoonEastern.getTime() + easternOffsetHours(tomorrowNoonEastern) * 3600_000));
  const dayStart = new Date(Date.UTC(p.y, p.m, p.day));
  return {
    startUtc: easternWallClock(dayStart, 0, 0),
    endUtc: easternWallClock(new Date(Date.UTC(p.y, p.m, p.day + 1)), 0, 0),
  };
}

/** "Tue 5 Aug" - the date label used in the reminder subject and body. */
export function visitDateLabel(start: Date): string {
  const p = easternParts(start);
  const d = new Date(Date.UTC(p.y, p.m, p.day));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][p.m];
  return `${dow} ${p.day} ${mon}`;
}

/** "8:00 - 11:00am" in Eastern, collapsing a shared meridiem. */
export function visitTimeWindow(start: Date, end: Date): string {
  const fmt = (d: Date, withMeridiem: boolean) => {
    const p = easternParts(d);
    const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
    const mer = p.hour < 12 ? 'am' : 'pm';
    return `${h12}:${String(p.minute).padStart(2, '0')}${withMeridiem ? mer : ''}`;
  };
  const sameMeridiem = (easternParts(start).hour < 12) === (easternParts(end).hour < 12);
  return `${fmt(start, !sameMeridiem)} - ${fmt(end, true)}`;
}

/** A visit with no `scheduled_end` runs this long. */
const DEFAULT_VISIT_MS = 2 * 3600_000;

/**
 * When a visit's window closes, as an epoch millisecond value.
 *
 * `scheduled_end` is nullable, and the two-hour fallback was written out three
 * times - the portal card, the portal query and the reminder cron - which is
 * three chances for the page to decide a visit is over while the email still
 * says it is on.
 */
export function visitEndsAt(startIso: string, endIso: string | null | undefined): number {
  return endIso ? Date.parse(endIso) : Date.parse(startIso) + DEFAULT_VISIT_MS;
}

/**
 * How many Eastern calendar days away a visit is: 0 today, 1 tomorrow.
 *
 * Eastern, not local: a member in another zone must see the same day the crew
 * and the reminder email do.
 */
export function easternDayOffset(start: Date, now: Date): number {
  const s = easternParts(start);
  const n = easternParts(now);
  return Math.round((Date.UTC(s.y, s.m, s.day) - Date.UTC(n.y, n.m, n.day)) / 86_400_000);
}

/**
 * When the run that covers a visit fires, for a cron on a fixed UTC hour.
 *
 * Every scheduled job in this feature reads "tomorrow, Eastern" and fires on a
 * fixed UTC time - 21:00 nudge, 22:00 escalate, 23:30 customer reminder - so the
 * run that ever looks at a given visit is the one on the Eastern calendar day
 * BEFORE it. 21:00, 22:00 and 23:30 UTC all fall on the same Eastern date as
 * their UTC date, so that day is `visitDate - 1` in both seasons.
 *
 * This is the fact every "we will chase it later" sentence has to be conditioned
 * on, and it is spelled here once rather than assumed at each of them.
 */
function runCoveringVisit(visitStart: Date, utcHour: number, utcMinute = 0): number {
  const p = easternParts(visitStart);
  return Date.UTC(p.y, p.m, p.day - 1, utcHour, utcMinute);
}

/** The two chases, in the order they run. */
export type ChaseStage = 'nudge' | 'escalate';

/**
 * Which of the 5pm/6pm chases can still run for this visit - never a guess.
 *
 * A stage is ahead only when its stamp is unclaimed AND its run has not yet
 * fired for this visit. Both halves matter, and both were previously assumed:
 * the escalation reads TOMORROW'S window only, so a visit today is structurally
 * out of scope and every stage for it fired last night, and a stamp already set
 * means that stage is spent whatever the clock says.
 *
 * A released stamp - a send that failed and put its claim back - reads as spent
 * too, and correctly: only a manual re-hit can use it, and no scheduled run ever
 * looks at that visit again.
 */
export function chasesAhead(args: {
  visitStart: Date;
  now: Date;
  nudgedAt?: string | null;
  escalatedAt?: string | null;
}): ChaseStage[] {
  const at = args.now.getTime();
  const ahead: ChaseStage[] = [];
  if (!args.nudgedAt && at < runCoveringVisit(args.visitStart, 21)) ahead.push('nudge');
  if (!args.escalatedAt && at < runCoveringVisit(args.visitStart, 22)) ahead.push('escalate');
  return ahead;
}

/**
 * The stages still ahead, named by the clock - "5pm and 6pm", "5pm", "6pm".
 *
 * Every sentence about a coming chase names the times, and they are read off
 * `chasesAhead`'s answer rather than written out as a fixed phrase. The moment
 * that distinction bites is the likeliest one: the owner gets the 5pm Telegram,
 * opens the flag list at 5:30pm and clears it - the nudge has fired, only the
 * escalation is left, and "5pm and 6pm" would name a chase that already ran as
 * one still to come.
 *
 * `[]` has no label on purpose. Nothing coming is a different sentence, not a
 * shorter list of times, and the caller has to say so.
 */
export function chaseStageLabel(ahead: ChaseStage[]): string {
  return ahead.map((s) => (s === 'nudge' ? '5pm' : '6pm')).join(' and ');
}

/**
 * What is still coming for this visit, said in one sentence.
 *
 * Lives here rather than beside the Telegram builders that first needed it: the
 * admin flag list says the same thing about the same stages, and a client screen
 * must not import a module that pulls `escapeTelegram` into the bundle to find
 * out what time the chase runs.
 *
 * `[]` is the one that had to be written down: with nothing ahead, the message
 * carrying this line is the last thing anybody will hear about the visit, and
 * the reader has to know that rather than wait for a chase that is not coming.
 */
export function chaseSentence(ahead: ChaseStage[]): string {
  if (ahead.length === 0) {
    return 'Nothing else will chase this visit - no stage is left to run, so this alert is all you get.';
  }
  if (ahead.length === 2) return `${chaseStageLabel(ahead)} will chase it until somebody does.`;
  return ahead[0] === 'nudge'
    ? `${chaseStageLabel(ahead)} will chase it.`
    : `${chaseStageLabel(ahead)} is the last chase before the customer is told at 7:30pm.`;
}

/**
 * Whether a reminder queued for this visit would still be DELIVERED.
 *
 * The covering RUN, which is the same gate `reminderIsStillUseful` queues on -
 * one predicate, so a page cannot promise a reminder the booking never queued.
 * Deliberately not `reminderSendAt`: in winter the two are an hour apart, and
 * that hour is exactly when a page would tell a crew member the customer is
 * about to be told about a visit they were told about already.
 *
 * Half the answer, never the whole one. It says what the CLOCK allows; whether
 * anything is actually going to be sent inside that window is the ledger's
 * answer, which is what `customerReminderState` reads.
 */
export function customerReminderAhead(visitStart: Date, now: Date): boolean {
  return reminderIsStillUseful(visitStart, now);
}

/**
 * When that reminder lands, as a phrase - "at 7:30pm tonight", "at 7:30pm on
 * Tue 4 Aug".
 *
 * A dispatch goes out the moment a visit is booked, which is routinely days or
 * weeks ahead, so "tonight" is true for exactly one of those days. The date is
 * named rather than softened to "the night before": the crew need to know WHEN,
 * and a vague sentence is no more use than a wrong one.
 *
 * Only meaningful while `customerReminderAhead` holds - the caller has a
 * different sentence for a customer who has already been told.
 */
export function customerReminderWhen(visitStart: Date, now: Date): string {
  return easternDayOffset(visitStart, now) === 1
    ? 'at 7:30pm tonight'
    : `at 7:30pm on ${visitDateLabel(reminderSendAt(visitStart))}`;
}

/**
 * Whether the calendar invite's 7:30pm "confirm tomorrow's visit" alarm is
 * still ahead.
 *
 * The ALARM's own instant, not the customer-reminder run: `buildIcs` sets it
 * with `reminderSendAt`'s arithmetic, and under EST the run fires a full hour
 * earlier - an hour in which an email would describe an alarm that has gone.
 */
export function confirmAlarmAhead(visitStart: Date, now: Date): boolean {
  return now.getTime() < reminderSendAt(visitStart).getTime();
}

/**
 * Whether the calendar invite's 7:00am "text the customer when you are on the
 * way" alarm is still ahead.
 *
 * Through the same helpers `buildIcs` sets that alarm with, so the confirm
 * screen cannot promise a reminder at a moment the invite does not carry one.
 */
export function morningAlarmAhead(visitStart: Date, now: Date): boolean {
  return now.getTime() < easternWallClock(easternDay(visitStart), 7, 0).getTime();
}

/** When that alarm fires, as a phrase - "at 7:00am tomorrow", "at 7:00am on Wed 5 Aug". */
export function morningAlarmWhen(visitStart: Date, now: Date): string {
  const offset = easternDayOffset(visitStart, now);
  if (offset === 0) return 'at 7:00am this morning';
  if (offset === 1) return 'at 7:00am tomorrow';
  return `at 7:00am on ${visitDateLabel(visitStart)}`;
}

/**
 * When the reminder row should be sent: 7:30pm Eastern the evening before.
 *
 * The cron fires at that time anyway, so this is really a marker the cron
 * compares against - but storing it makes the queue row self-describing and
 * lets a missed run catch up rather than silently skipping.
 */
export function reminderSendAt(visitStart: Date): Date {
  return easternWallClock(easternDay(new Date(visitStart.getTime() - 24 * 3600_000)), 19, 30);
}

/**
 * The visit a `follow_up_queue` reminder row belongs to, as an ISO instant.
 *
 * Stored on the row as `visit_start`, and paired with the address it names
 * exactly one visit - which is what cancelling and claiming both match on.
 *
 * It is deliberately the visit's OWN start and not `reminderSendAt`: every visit
 * on a given day shares that 7:30pm send time, so keying on it would make
 * gutters at 8am and a dryer vent at 1pm the same row. Booking the second would
 * cancel the first's reminder, and the one email that survived would name only
 * the earlier job.
 */
export function visitKey(visitStart: Date): string {
  return visitStart.toISOString();
}

/**
 * The instant for an Eastern wall-clock date and time - ('2026-08-05', '08:00').
 *
 * Everything downstream reads a stored visit instant as Eastern wall-clock:
 * `tomorrowEasternWindow`, `reminderSendAt`, `visitTimeWindow` and the ICS
 * alarms all assume it. A date-time string with no offset is parsed in the
 * BROWSER's zone per the ES spec, so `new Date('2026-08-05T08:00')` on a laptop
 * set to Pacific stores an 11am Eastern window and nothing downstream can tell.
 * Admin scheduling builds its instants here instead.
 */
export function easternVisitInstant(isoDate: string, time: string): Date {
  const [rawHour, rawMinute] = time.split(':');
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate) || !Number.isFinite(hour) || !Number.isFinite(minute)) {
    throw new Error(`Not a date and time: "${isoDate}" "${time}"`);
  }
  return easternWallClock(new Date(`${isoDate}T00:00:00Z`), hour, minute);
}

/**
 * The daily run that would carry this visit's reminder.
 *
 * Not the same instant as `reminderSendAt`. The cron is one fixed UTC time with
 * no DST logic, so it fires at 7:30pm Eastern only under EDT - under EST it
 * fires at 6:30pm, a full hour BEFORE the nominal send time. 23:30 UTC always
 * lands on the same Eastern calendar date (18:30 or 19:30), so the run covering
 * a visit on Eastern date D is 23:30 UTC on D-1.
 *
 * Through `runCoveringVisit` rather than working the date out a second time.
 * This instant decides both whether a reminder was queued at booking and whether
 * the crew screen says the customer has already been told, and a schedule or DST
 * correction applied to one copy and not the other would be invisible: the
 * booking would skip the reminder while the screen still promised it.
 */
export function reminderRunAt(visitStart: Date): Date {
  return new Date(runCoveringVisit(visitStart, 23, 30));
}

/**
 * Whether a night-before reminder for this visit can still be DELIVERED.
 *
 * The gate is the covering RUN, not the visit and not the nominal send time.
 * The cron only ever looks at "tomorrow, Eastern", so a visit booked at 11pm on
 * 4 Aug for 8am on 5 Aug - or any same-day booking - is carried by a run that
 * already fired. The next run's window is 6 Aug, so the row would never be
 * claimed and never sent: pending forever, while the admin was told a reminder
 * was queued.
 *
 * Gating on `reminderSendAt` left an hour of that hole open for the five months
 * of EST, where the run fires at 6:30pm and the send time reads 7:30pm.
 */
export function reminderIsStillUseful(visitStart: Date, now: Date): boolean {
  return reminderRunAt(visitStart).getTime() > now.getTime();
}

/** The part of a `follow_up_queue` reminder row the send-once ledger reads. */
export interface ReminderLedgerRow {
  id: string;
  status: string;
  created_at: string | null;
}

/** Ledger rows are keyed on (address, visit start), the pair that names one visit. */
export function ledgerKey(email: string, visitStartIso: string): string {
  return `${email.trim().toLowerCase()}|${new Date(visitStartIso).toISOString()}`;
}

/**
 * The ledger's verdict for one visit, read off every row it holds.
 *
 * A visit can legitimately hold more than one row - rescheduling into the same
 * window cancels its pending row and inserts a fresh one - and Postgres returns
 * them in no defined order, so taking whichever came back last would flip
 * between sending and skipping at random.
 *
 * The verdict is computed from the whole set instead, and it fails CLOSED: a
 * delivered reminder outranks everything, so a retry can never produce a second
 * "we're coming tomorrow". A visit left holding only cancelled rows is closed
 * too - someone pulled that reminder deliberately.
 */
export function ledgerVerdict<T extends ReminderLedgerRow>(
  rows: T[] | undefined,
): { claim: T | null; closed: boolean } {
  if (!rows || rows.length === 0) return { claim: null, closed: false };
  if (rows.some((r) => r.status === 'sent' || r.status === 'responded')) return { claim: null, closed: true };
  const open = rows
    .filter((r) => r.status === 'pending' || r.status === 'failed')
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id));
  if (open.length === 0) return { claim: null, closed: true };
  return { claim: open[open.length - 1], closed: false };
}

/**
 * What the customer has actually been told about this visit.
 *
 * `unavailable` is the ledger read FAILING and is never folded into one of the
 * other three: "we could not look" is not "nobody is telling them", and the
 * crew screen this reaches is the one that decides whether somebody picks up
 * the phone.
 */
export type CustomerReminderState = 'told' | 'coming' | 'none' | 'unavailable';

/**
 * That verdict, read off the reminder ledger rather than inferred from the clock.
 *
 * The clock alone gets it wrong in an ordinary case, and wrong in the direction
 * that costs a phone call: a SAME-DAY booking is past the covering run, so
 * `requeueVisitReminder` answers 'skipped' and no queue row is ever written -
 * and a screen reading only the clock says "the customer has ALREADY been told
 * we are coming" about a customer nobody has told anything.
 *
 * So the rows decide, and they are read the way the REMINDER CRON reads them,
 * because that cron is the thing that does or does not send. A delivered row is
 * 'told'. Rows it would skip - all cancelled, `ledgerVerdict`'s `closed` - are
 * 'none': somebody pulled that reminder deliberately.
 *
 * Everything else is a visit that cron will send for, and that includes NO ROW
 * AT ALL: finding none, it backfills a fresh row and mails the customer. Reading
 * an empty ledger as 'none' was the trap - a queue write that failed at booking
 * ('unavailable') leaves nothing behind, and these surfaces then told the owner
 * nobody was telling the customer about a visit the cron announces ninety
 * minutes later. Open row or no row, it is 'coming' only while a run that can
 * carry it is still ahead; past that nothing will ever send it, which is the
 * same answer as never having queued one.
 */
export function customerReminderState(
  rows: ReminderLedgerRow[] | undefined,
  visitStart: Date,
  now: Date,
): Exclude<CustomerReminderState, 'unavailable'> {
  if (rows?.some((r) => r.status === 'sent' || r.status === 'responded')) return 'told';
  if (ledgerVerdict(rows).closed) return 'none';
  return customerReminderAhead(visitStart, now) ? 'coming' : 'none';
}
