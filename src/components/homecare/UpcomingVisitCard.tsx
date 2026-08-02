import { CalendarCheck, Clock, MapPin } from 'lucide-react';
import { visitDateLabel, visitTimeWindow, visitEndsAt, easternDayOffset } from '@/lib/homecare/visitSchedule';

/**
 * The scheduled-visit card at the top of a member's checklist.
 *
 * Three states, because "today", "tomorrow" and "three weeks out" deserve
 * different weight: today and tomorrow get the gradient header, anything
 * further out gets a quiet one in the same position.
 *
 * The day of the visit used to read as the quietest of the three - a grey
 * "Scheduled" band and a bare date - on the morning the member is most likely
 * to open the portal at all.
 *
 * The calendar file is served here rather than attached to the reminder email.
 * That keeps it one tap away instead of buried in an email they have to find
 * again, and it means the only .ics carrying the internal ops alarms is the
 * owner's - a customer can never receive "text the customer when on the way".
 */
export interface UpcomingVisit {
  start: string;
  end: string | null;
  address: string | null;
  services: string[];
}

export default function UpcomingVisitCard({ visit, now = new Date() }: { visit: UpcomingVisit; now?: Date }) {
  const start = new Date(visit.start);
  const end = new Date(visitEndsAt(visit.start, visit.end));
  // The page keeps the card up until the window closes, so a visit under way
  // still counts as today (a window spanning midnight reads negative).
  const daysAway = easternDayOffset(start, now);
  const today = daysAway <= 0;
  const soon = daysAway <= 1;

  const icsHref = `/api/home-care/visit.ics?${new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
    services: visit.services.join('|'),
    ...(visit.address ? { address: visit.address } : {}),
  })}`;

  const reschedule = `mailto:alex@lavacagc.com,veronica@lavacagc.com?subject=${encodeURIComponent(
    `Reschedule my ${visitDateLabel(start)} visit`,
  )}`;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card" data-testid="upcoming-visit">
      {/*
        Three tiers, not two. A visit still weeks out was grey, which read as
        disabled next to everything else on the checklist - a member scanning
        the page did not see they had a visit booked at all.

        It is orange now, but a SOFTER orange than the imminent band above it:
        the gradient has to stay the loudest thing on the card on the morning
        somebody needs to be home, and two identical bands would flatten that
        difference away.
      */}
      <div
        className={
          soon
            ? 'bg-gradient-to-r from-primary to-accent-sunset px-4 py-2.5 text-xs font-bold uppercase tracking-[0.11em] text-white'
            : 'border-b border-primary/20 bg-primary/10 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.11em] text-primary-dark'
        }
      >
        {today ? 'Today' : soon ? 'Coming up - tomorrow' : 'Scheduled'}
      </div>
      <div className="px-4 py-4">
        <div className="flex items-start gap-2.5">
          <CalendarCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="text-lg font-extrabold leading-tight text-text-primary">
              {today ? `Today, ${visitDateLabel(start)}` : soon ? `Tomorrow, ${visitDateLabel(start)}` : visitDateLabel(start)}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-sm font-bold text-primary">
              <Clock className="h-3.5 w-3.5" /> {visitTimeWindow(start, end)}
            </div>
          </div>
        </div>

        <p className="mt-3 text-sm text-text-secondary">{visit.services.join(' · ')}</p>

        {visit.address && (
          <p className="mt-1.5 flex items-start gap-1.5 text-xs text-text-muted">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {visit.address}
          </p>
        )}

        <p className="mt-3 text-sm text-text-secondary">
          <strong className="text-text-primary">We&apos;ll text you when we&apos;re on our way.</strong> You don&apos;t need to be home.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={icsHref}
            className="inline-flex min-h-[44px] items-center rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-button transition-all hover:-translate-y-[1px]"
          >
            Add to calendar
          </a>
          <a
            href={reschedule}
            className="inline-flex min-h-[44px] items-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-text-primary transition-colors hover:border-primary"
          >
            Need to reschedule?
          </a>
          <a
            href="tel:2012124917"
            className="inline-flex min-h-[44px] items-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-text-primary transition-colors hover:border-primary"
          >
            Or call us
          </a>
        </div>
      </div>
    </div>
  );
}
