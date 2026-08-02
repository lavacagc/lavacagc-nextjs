/**
 * La Vaca Home Care - iCalendar (.ics) generation for scheduled service visits.
 *
 * Dependency-free by design: RFC 5545 is simple enough that a library would be
 * more surface than it saves.
 *
 * Three variants, and the differences matter:
 *
 *  - **owner**: carries two VALARM blocks that remind the team to confirm the
 *    visit the evening before and to text the customer when the crew is on the
 *    way. These are internal ops reminders.
 *  - **crew**: the same two alarms, attached to the dispatch email so they land
 *    on the phone of whoever is actually driving to the house. The 7:00am one
 *    IS the "text the customer we're on our way" instruction - the owner chose
 *    a real text sent by a person over an automated email, so nothing else in
 *    the system sends that message and this alarm is what makes it happen.
 *    METHOD:REQUEST with an ATTENDEE, because that is the shape Gmail renders
 *    its own "Add to calendar" control for; a PUBLISH file is offered as a
 *    plain download instead, which is the one route that is not one tap.
 *  - **customer**: no VALARM at all. The customer downloads their copy from the
 *    portal, and it must never contain "text the customer when on the way".
 *
 * A crew invite can also be RETRACTED - see `cancel` on IcsArgs. The alarms are
 * why that matters: the 7:00am one is an instruction to text a customer, and a
 * cancelled visit that keeps its event fires it anyway.
 *
 * The alarms use ABSOLUTE triggers, not relative offsets. A relative trigger
 * (say -PT13H) fires at a completely different clock time for an 8am job than
 * for a 2pm one, so "the evening before" would drift around the evening.
 */
import { HOME_CARE_FROM, fromAddress } from '@/lib/notify/senders';

export type IcsVariant = 'owner' | 'crew' | 'customer';

/**
 * The address a REQUEST is organized by.
 *
 * DERIVED from the address the dispatch is actually sent from, never written
 * out again here. Gmail and Outlook check that the sender is entitled to act as
 * the organizer before they render their own RSVP / "Add to calendar" control;
 * on a mismatch they fall back to offering the .ics as a plain download, which
 * is the exact outcome METHOD:REQUEST was chosen over METHOD:PUBLISH to avoid.
 * Replies still reach a human through the dispatch's Reply-To.
 */
export const ICS_ORGANIZER = fromAddress(HOME_CARE_FROM);

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
  /**
   * Who the invite is addressed to. `crew` only - a PUBLISH file has no
   * attendees, and putting the customer on one would invite them to their own
   * visit.
   */
  attendees?: { name?: string | null; email: string }[];
  /**
   * RETRACT the invite this UID names, rather than issue one: METHOD:CANCEL,
   * STATUS:CANCELLED, and no VALARM. `crew` only.
   *
   * Dropping the alarms is the whole point rather than a detail. The 7:00am one
   * reads "text the customer when the crew is on the way", and it is the only
   * thing in the system that produces that text - so a retraction carrying it
   * would tell somebody to text a customer about a visit that is off.
   *
   * The UID must be the one the original invite used, or a client files this as
   * a second, cancelled event and leaves the live one alone.
   */
  cancel?: boolean;
  /**
   * RFC 5545 §3.8.7.4. A client applies a re-send to the event it already holds
   * only when this number is HIGHER than the one it stored; equal, it is
   * entitled to treat the message as a duplicate and ignore it. So a retraction
   * or an updated invite must carry a bigger value than the send it supersedes,
   * which is why `visit_dispatch.ics_sequence` counts them.
   */
  sequence?: number;
  /**
   * Whether the customer's night-before reminder is actually queued.
   *
   * Only the 7:30pm alarm on the two internal variants reads it, and it fails
   * CLOSED: left unset, the alarm says nothing about the customer rather than
   * asserting they have been told. `requeueVisitReminder` answers 'skipped' for
   * a booking that missed its covering run and 'unavailable' when the queue
   * write failed, and in both the alarm would otherwise fire the night before
   * saying "the customer reminder email has gone out" when nothing went out.
   */
  customerReminded?: boolean;
  /** Stamped as DTSTAMP. Injected so output is deterministic in tests. */
  now?: Date;
}

/**
 * RFC 5545 §3.1: a PARAMETER value, which is not escaped the way a TEXT value
 * is. Backslash-escaping one produces `CN=Ramirez\, Jr`, which a parser reads as
 * two parameters or rejects outright - so a recipient whose name carries a
 * comma, a semicolon or a colon would break their own invite. The spec's answer
 * is a DQUOTE-wrapped value, and a quoted value has no escape of its own, so an
 * embedded DQUOTE has to come out.
 */
export function quoteIcsParam(value: string): string {
  return `"${value.replace(/"/g, '').replace(/\r?\n/g, ' ')}"`;
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
  const {
    uid, start, end, services, address, customerName, customerPhone, variant,
    attendees = [], sequence = 0, now = new Date(),
  } = args;

  // A retraction is a crew message: it names an ATTENDEE and an ORGANIZER, and
  // the other two variants have neither to cancel.
  const isCancel = args.cancel === true && variant === 'crew';

  // The two internal variants carry the ops alarms; the customer's copy never
  // does. Named rather than repeated so a fourth variant cannot accidentally
  // inherit "text the customer when the crew is on the way".
  const isInternal = variant === 'owner' || variant === 'crew';

  const summary = isInternal
    ? `La Vaca: ${services.join(', ')} - ${customerName}`
    : `La Vaca Home Care visit - ${services.join(', ')}`;

  const descriptionLines = [
    `Services: ${services.join(', ')}`,
    `Address: ${address}`,
    ...(isInternal && customerPhone ? [`Customer: ${customerName} - ${customerPhone}`] : []),
    ...(variant === 'customer' ? ["We'll text you when we're on our way. You don't need to be home."] : []),
  ];

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//La Vaca General Contractors//Home Care//EN',
    'CALSCALE:GREGORIAN',
    // REQUEST is what makes Gmail offer its native "Add to calendar" control on
    // the attachment. PUBLISH renders as a plain file download instead. CANCEL
    // is the only shape a client will act on to REMOVE an event it holds.
    isCancel ? 'METHOD:CANCEL' : variant === 'crew' ? 'METHOD:REQUEST' : 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(uid)}`,
    `DTSTAMP:${toIcsUtc(now)}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `LOCATION:${escapeIcsText(address)}`,
    `DESCRIPTION:${escapeIcsText(descriptionLines.join('\n'))}`,
    isCancel ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
  ];

  if (variant === 'crew') {
    // RFC 5545 §3.2: a REQUEST needs an ORGANIZER, and SEQUENCE is what lets a
    // later send supersede this one rather than land as a second event - see
    // `sequence` on IcsArgs for why it has to actually go up.
    lines.push(
      `SEQUENCE:${sequence}`,
      `ORGANIZER;CN=La Vaca General Contractors:mailto:${ICS_ORGANIZER}`,
      // A CANCEL still names its attendees: that is how a client knows which
      // invitation is being withdrawn, and from whom.
      ...attendees.map((a) =>
        `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT` +
        `${isCancel ? '' : ';PARTSTAT=NEEDS-ACTION;RSVP=TRUE'}` +
        `${a.name ? `;CN=${quoteIcsParam(a.name)}` : ''}:mailto:${a.email}`),
    );
  }

  if (isInternal && !isCancel) {
    // Absolute triggers so "the evening before" is genuinely the evening,
    // whatever time of day the visit itself is. Both days resolve through
    // easternDay, exactly as reminderSendAt does - reading the raw UTC date
    // would put an evening visit's alarms on the wrong side of midnight.
    const dayBefore = easternDay(new Date(start.getTime() - 24 * 3600_000));
    lines.push(
      ...alarm(
        easternWallClock(dayBefore, 19, 30),
        `Confirm tomorrow's visit for ${customerName}.`
          + (args.customerReminded ? ' The customer reminder email has gone out.' : ''),
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

/**
 * The MIME type a generated calendar file has to ride as.
 *
 * Gmail and Outlook decide whether to render their own "Add to calendar" / RSVP
 * card off the MIME PART, not off the bytes: a `text/calendar` part carrying
 * `method=REQUEST` gets the card, and an attachment with no declared type is
 * offered as a plain file download - the exact outcome METHOD:REQUEST was
 * chosen over METHOD:PUBLISH to avoid. Without this the whole decision is inert.
 *
 * Read off the file itself, so the header can never disagree with the body. A
 * CANCEL announced as a REQUEST is a retraction a client is entitled to ignore,
 * leaving the visit - and its 7:00am "text the customer" alarm - in place.
 */
export function icsContentType(ics: string): string {
  const method = /^METHOD:([A-Z]+)\r?$/m.exec(ics)?.[1];
  return `text/calendar; charset=utf-8${method ? `; method=${method}` : ''}`;
}

/**
 * A one-tap "Add to Google Calendar" link.
 *
 * Pure string building - no API, no auth, no Google integration of any kind.
 * It opens Google Calendar with the event pre-filled and a Save button, which
 * is the second of the two genuinely one-tap routes (the first is the attached
 * REQUEST above). It exists because the third route - a bare link to a hosted
 * .ics - only *looks* like one tap: on a phone it opens the calendar app, but
 * in Gmail on a desktop browser it downloads a file the recipient then has to
 * find and import. Both are offered so neither desktop nor mobile is the one
 * that gets the awkward path.
 *
 * Carries no alarms; Google's template URL has no parameter for them. The
 * attachment is the copy that brings the 7:00am "text the customer" reminder,
 * so this link is the fallback rather than the primary.
 */
export function googleCalendarUrl(args: {
  title: string;
  start: Date;
  end: Date;
  details: string;
  location: string;
}): string {
  const stamp = (d: Date) => toIcsUtc(d);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: args.title,
    dates: `${stamp(args.start)}/${stamp(args.end)}`,
    details: args.details,
    location: args.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
