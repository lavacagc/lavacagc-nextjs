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
 * The queue slot a visit's reminder occupies, as an ISO instant.
 *
 * This is what ties a `follow_up_queue` row to ITS visit. Cancelling or marking
 * a reminder sent matches on the slot, so a customer with gutters on the 5th and
 * a furnace on the 20th never loses one visit's reminder by touching the other.
 */
export function reminderSlot(visitStart: Date): string {
  return reminderSendAt(visitStart).toISOString();
}

/** A visit in the past can never earn a reminder. */
export function reminderIsStillUseful(visitStart: Date, now: Date): boolean {
  return visitStart.getTime() > now.getTime();
}
