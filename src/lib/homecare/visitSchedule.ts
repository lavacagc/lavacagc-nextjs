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

/** Types belonging to the visit sequence, for type-scoped cancelling. */
export const VISIT_FOLLOW_UP_TYPES = VISIT_REMINDER_FOLLOW_UP_TYPES;

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

/** A visit in the past can never earn a reminder. */
export function reminderIsStillUseful(visitStart: Date, now: Date): boolean {
  return visitStart.getTime() > now.getTime();
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
