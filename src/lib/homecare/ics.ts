/**
 * La Vaca Home Care - iCalendar (.ics) generation for scheduled service visits.
 *
 * Dependency-free by design: RFC 5545 is simple enough that a library would be
 * more surface than it saves.
 *
 * Two variants, and the difference matters:
 *
 *  - **owner**: carries two VALARM blocks that remind the team to confirm the
 *    visit the evening before and to text the customer when the crew is on the
 *    way. These are internal ops reminders.
 *  - **customer**: no VALARM at all. The customer downloads their copy from the
 *    portal, and it must never contain "text the customer when on the way".
 *
 * The alarms use ABSOLUTE triggers, not relative offsets. A relative trigger
 * (say -PT13H) fires at a completely different clock time for an 8am job than
 * for a 2pm one, so "the evening before" would drift around the evening.
 */

export type IcsVariant = 'owner' | 'customer';

export interface IcsArgs {
  uid: string;
  start: Date;
  end: Date;
  /** Service titles, e.g. ['Clean gutters & downspouts', 'Clean the dryer vent']. */
  services: string[];
  address: string;
  customerName: string;
  customerPhone?: string | null;
  variant: IcsVariant;
  /** Stamped as DTSTAMP. Injected so output is deterministic in tests. */
  now?: Date;
}

/** RFC 5545 §3.3.11: escape backslash, semicolon, comma; newlines become \n. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** UTC basic format: 20260805T120000Z. */
export function toIcsUtc(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}` +
    `T${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}${String(d.getUTCSeconds()).padStart(2, '0')}Z`;
}

/**
 * Eastern offset in hours for a given instant. New Jersey only, so a full
 * tz database is overkill: EDT runs from the second Sunday in March to the
 * first Sunday in November.
 */
export function easternOffsetHours(d: Date): number {
  const year = d.getUTCFullYear();
  const secondSundayMarch = nthSunday(year, 2, 2);
  const firstSundayNovember = nthSunday(year, 10, 1);
  const isEdt = d.getTime() >= secondSundayMarch.getTime() && d.getTime() < firstSundayNovember.getTime();
  return isEdt ? 4 : 5;
}

function nthSunday(year: number, monthIndex: number, n: number): Date {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const offsetToSunday = (7 - first.getUTCDay()) % 7;
  const day = 1 + offsetToSunday + (n - 1) * 7;
  // DST switches at 2am local; 07:00Z is a safe stand-in either side.
  return new Date(Date.UTC(year, monthIndex, day, 7));
}

/** The instant corresponding to a given Eastern wall-clock time on `day`. */
export function easternWallClock(day: Date, hour: number, minute = 0): Date {
  const guess = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute));
  return new Date(guess.getTime() + easternOffsetHours(guess) * 3600_000);
}

/**
 * Eastern calendar date parts for an instant.
 *
 * Lives here rather than in visitSchedule so both modules read an instant's day
 * the same way. Anything that pairs a date with an Eastern wall-clock hour must
 * go through this first: for an Eastern-evening instant the UTC calendar date
 * has already rolled over, so `getUTCDate()` would name tomorrow.
 */
export function easternParts(d: Date): { y: number; m: number; day: number; hour: number; minute: number } {
  const shifted = new Date(d.getTime() - easternOffsetHours(d) * 3600_000);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** Midnight UTC on the Eastern calendar date containing `d` - the day `easternWallClock` keys off. */
export function easternDay(d: Date): Date {
  const p = easternParts(d);
  return new Date(Date.UTC(p.y, p.m, p.day));
}

function alarm(trigger: Date, description: string): string[] {
  return [
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `TRIGGER;VALUE=DATE-TIME:${toIcsUtc(trigger)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    'END:VALARM',
  ];
}

export function buildIcs(args: IcsArgs): string {
  const { uid, start, end, services, address, customerName, customerPhone, variant, now = new Date() } = args;

  const summary = variant === 'owner'
    ? `La Vaca: ${services.join(', ')} - ${customerName}`
    : `La Vaca Home Care visit - ${services.join(', ')}`;

  const descriptionLines = [
    `Services: ${services.join(', ')}`,
    `Address: ${address}`,
    ...(variant === 'owner' && customerPhone ? [`Customer: ${customerName} - ${customerPhone}`] : []),
    ...(variant === 'customer' ? ["We'll text you when we're on our way. You don't need to be home."] : []),
  ];

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//La Vaca General Contractors//Home Care//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(uid)}`,
    `DTSTAMP:${toIcsUtc(now)}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `LOCATION:${escapeIcsText(address)}`,
    `DESCRIPTION:${escapeIcsText(descriptionLines.join('\n'))}`,
    'STATUS:CONFIRMED',
  ];

  if (variant === 'owner') {
    // Absolute triggers so "the evening before" is genuinely the evening,
    // whatever time of day the visit itself is. Both days resolve through
    // easternDay, exactly as reminderSendAt does - reading the raw UTC date
    // would put an evening visit's alarms on the wrong side of midnight.
    const dayBefore = easternDay(new Date(start.getTime() - 24 * 3600_000));
    lines.push(
      ...alarm(
        easternWallClock(dayBefore, 19, 30),
        `Confirm tomorrow's visit for ${customerName}. The customer reminder email has gone out.`,
      ),
      ...alarm(
        easternWallClock(easternDay(start), 7, 0),
        `Text ${customerName} when the crew is on the way${customerPhone ? ` - ${customerPhone}` : ''}.`,
      ),
    );
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');
  // RFC 5545 requires CRLF.
  return lines.join('\r\n') + '\r\n';
}
