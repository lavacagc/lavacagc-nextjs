'use client';

/**
 * /vaca-mgmt/send-service-quote
 *
 * The lighter sibling of Send Estimate, for one-visit service work. Same three
 * cards, same controls, so there is nothing new to learn - but no Portal URL
 * and no update cadence, and three fields that only make sense for a visit:
 * scope summary, visit length and a quote expiry.
 *
 * The scope summary pre-fills from the customer's own request: a Home Care
 * booking writes its task keys into the lead message, and those keys resolve to
 * catalog titles. Their service history ("last done Oct 2025") comes from
 * completions the checklist has been recording since launch.
 */
import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Loader2, CalendarPlus, CheckCircle2, XCircle, ShieldCheck } from 'lucide-react';
import { scopeSummaryFrom } from '@/lib/homecare/serviceIntake';
import { easternVisitInstant } from '@/lib/homecare/visitSchedule';

interface Service { key: string; title: string; blurb: string; priority: number }
/** Someone a visit dispatch can be sent to. Managed on /vaca-mgmt/crew. */
interface CrewMember { id: string; name: string; email: string; active: boolean }
interface PastRequest {
  id: string; createdAt: string; source: string | null; name: string; phone: string | null;
  address: string | null; city: string | null; zip: string | null;
  taskKeys: string[]; services: { key: string; title: string }[];
}
/**
 * What the crew has said about a visit.
 *
 * A flag OUTRANKS a confirmation here, exactly as it does on the server: a
 * colleague having confirmed silences the 5pm and 6pm chases, which is precisely
 * why the problem somebody raised has to stay visible on this screen.
 */
interface BookingDispatch {
  /** `unknown` is a read that FAILED - never the same answer as "none". */
  state: 'unknown' | 'none' | 'awaiting' | 'confirmed' | 'flagged';
  confirmedBy: string[];
  flags: { by: string; note: string | null }[];
}
/** A visit on the books: one window, every service booked into it. */
interface Booking {
  start: string;
  end: string | null;
  address: string | null;
  tasks: { key: string; title: string; season: string }[];
  dispatch?: BookingDispatch;
}
interface Intake {
  services: Service[];
  requests: PastRequest[];
  history: Record<string, { at: string; by: string; label: string }>;
  homeowner: { id: string; first_name: string | null; phone: string | null; address: string | null; city: string | null; zip: string | null; status: string } | null;
  bookings: Booking[];
}

const todayPlus = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export default function SendServiceQuotePage() {
  const [email, setEmail] = useState('');
  const [intake, setIntake] = useState<Intake | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [name, setName] = useState('');
  const [cc, setCc] = useState('');
  const [scope, setScope] = useState('');
  const [visitLength, setVisitLength] = useState('About 2-3 hours, one visit');
  const [estimateUrl, setEstimateUrl] = useState('');
  const [validUntil, setValidUntil] = useState(todayPlus(30));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<null | 'test' | 'send'>(null);

  const [address, setAddress] = useState('');
  const [subName, setSubName] = useState('');
  // Who the dispatch goes to. Loaded once and pre-ticked to everyone active,
  // so the default behaviour of the screen is "the crew is told".
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [crewPicked, setCrewPicked] = useState<Set<string>>(new Set());
  const [date, setDate] = useState('');
  const [from, setFrom] = useState('08:00');
  const [to, setTo] = useState('11:00');
  const [scheduling, setScheduling] = useState(false);
  // Only the calendar link, which is the one thing that exists solely for the
  // booking just made. "Mark completed" is driven off the customer's booked
  // visits instead: a job is booked on Monday and performed on Thursday, so a
  // button that needed a schedule POST from this page load meant re-booking a
  // finished job just to close it out.
  const [scheduled, setScheduled] = useState<{ icsUrl: string } | null>(null);
  // The visits this customer has on the books, refreshed after every write.
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [completing, setCompleting] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [handling, setHandling] = useState<string | null>(null);
  // Kept apart from `intake`, because a walk-in has no homeowner record until
  // the booking creates one - and completing that visit still needs the id.
  const [homeownerId, setHomeownerId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/crew');
        const data: { recipients?: CrewMember[] } = await res.json();
        const active = (data.recipients ?? []).filter((r) => r.active);
        if (cancelled) return;
        setCrew(active);
        setCrewPicked(new Set(active.map((r) => r.id)));
      } catch {
        // The picker is a convenience: with no list the schedule POST omits
        // recipientIds entirely, and the server falls back to everyone active.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const toggleCrew = (id: string) => {
    setCrewPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const refreshBookings = useCallback(async () => {
    if (!email.trim()) return;
    try {
      const res = await fetch(`/api/admin/service-quote/intake?email=${encodeURIComponent(email.trim())}`);
      const data: Intake = await res.json();
      setBookings(data.bookings ?? []);
      if (data.homeowner?.id) setHomeownerId(data.homeowner.id);
    } catch {
      // A stale list is not worth a toast on top of whatever just succeeded.
    }
  }, [email]);

  const lookup = useCallback(async () => {
    if (!email.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/service-quote/intake?email=${encodeURIComponent(email.trim())}`);
      const data: Intake = await res.json();
      setIntake(data);
      setBookings(data.bookings ?? []);
      setHomeownerId(data.homeowner?.id ?? null);
      const latest = data.requests[0];
      if (latest) {
        setName(latest.name || '');
        setAddress([latest.address, latest.city, latest.zip].filter(Boolean).join(', '));
        if (latest.taskKeys.length) {
          setSelected(new Set(latest.taskKeys));
          setScope(scopeSummaryFrom(latest.services));
        }
      } else if (data.homeowner) {
        setName(data.homeowner.first_name || '');
        setAddress([data.homeowner.address, data.homeowner.city, data.homeowner.zip].filter(Boolean).join(', '));
      }
    } catch {
      toast({ title: 'Lookup failed', description: 'Could not load this customer.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [email]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      const titles = (intake?.services ?? []).filter((s) => next.has(s.key));
      setScope(scopeSummaryFrom(titles));
      return next;
    });
  };

  const send = async (isTest: boolean) => {
    setBusy(isTest ? 'test' : 'send');
    try {
      const res = await fetch('/api/admin/service-quote/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientName: name, recipientEmail: email.trim(), ccEmails: cc,
          scopeSummary: scope, taskKeys: [...selected], visitLength,
          estimateUrl, validUntil, personalNote: note, isTest,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.issues?.[0]?.message || 'Send failed');
      toast({
        title: data.status === 'idempotent' ? 'Already sent' : isTest ? 'Test sent' : 'Quote sent',
        description: data.status === 'idempotent'
          ? 'An identical quote went out in the last 30 seconds.'
          : isTest ? 'Check alex@lavacagc.com.' : `Sent to ${email}.`,
      });
    } catch (e) {
      toast({ title: 'Send failed', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const schedule = async () => {
    if (!date) { toast({ title: 'Pick a date first', variant: 'destructive' }); return; }
    if (!from || !to) { toast({ title: 'Set the arrival window', variant: 'destructive' }); return; }
    setScheduling(true);
    const startAt = easternVisitInstant(date, from).toISOString();
    try {
      const res = await fetch('/api/admin/service-quote/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(), name, phone: intake?.homeowner?.phone ?? intake?.requests[0]?.phone ?? '',
          taskKeys: [...selected],
          // Eastern, not the browser's zone. Everything downstream reads the
          // stored instant as an Eastern wall-clock time, and a bare
          // `new Date('2026-08-05T08:00')` is parsed locally - so booking from a
          // laptop on Pacific would silently store an 11am window.
          start: startAt,
          end: easternVisitInstant(date, to).toISOString(),
          address,
          // Only when the list actually loaded. Sending [] would be read as
          // "no selection" and fall back to everyone active - which is right
          // for a failed load, and wrong for a deliberate empty pick. The
          // button is disabled in that second case, so it cannot arise.
          ...(crew.length > 0 ? { recipientIds: [...crewPicked] } : {}),
          ...(subName.trim() ? { subName: subName.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.issues?.[0]?.message || 'Scheduling failed');
      setScheduled({ icsUrl: data.icsUrl });
      setHomeownerId(data.homeownerId);
      await refreshBookings();
      // A reschedule takes the old window off the crew's calendars. When that
      // could not be delivered they are still holding it - and its 7:00am "text
      // the customer" alarm - so it is named here rather than logged.
      const stillHolding: string[] = data.stillHolding ?? [];
      // Two independent outcomes, both reported. The booking succeeded either
      // way; what the admin needs to know is which of the two people who were
      // supposed to be told actually were.
      const reminderLine = data.reminder === 'queued'
        ? 'Reminder queued for 7:30pm the night before.'
        : data.reminder === 'unavailable'
          ? 'The reminder could NOT be queued - text the customer yourself.'
          : 'Too late for the 7:30pm reminder - text the customer yourself.';
      // 'sent_degraded' still went out - what failed is the record around it, and
      // each of those has its own line below. Reading it as "could not be
      // recorded" would tell the admin to call people who were in fact emailed.
      const dispatchLine = data.dispatch === 'sent' || data.dispatch === 'sent_degraded'
        ? ` Crew dispatched to ${data.dispatchedTo?.join(', ') || 'the crew'}.`
        : data.dispatch === 'no_recipients'
          ? ' NOBODY was dispatched - there are no active crew members. Add one on the Crew page.'
          : data.dispatch === 'send_failed'
            ? ' The crew dispatch FAILED to send - call them.'
            : ' The crew dispatch could not be recorded - call them.';
      // Un-ticking somebody is how a mis-addressed visit is corrected, and a
      // retirement that did not land leaves them able to answer for a visit
      // they are not on - which stops both chases for everybody else.
      const crewStillLive: string[] = data.crewStillLive ?? [];
      const stillLiveLine = crewStillLive.length > 0
        ? ` ${crewStillLive.join(', ')} could NOT be taken off this visit - their confirm link still works, and one tap from them would stop the 5pm and 6pm chases. Re-save the visit without them.`
        : '';
      // Ticked, never written to: their assignment row could not be prepared, so
      // the only other clue would be a shorter "dispatched to" list.
      const crewNotMailed: string[] = data.crewNotMailed ?? [];
      const notMailedLine = crewNotMailed.length > 0
        ? ` ${crewNotMailed.join(', ')} got NOTHING - their crew record could not be written. Call them.`
        : '';
      const recordLine = data.dispatchRecorded === 'unavailable'
        ? ' The dispatch is NOT recorded on the visit - 5pm will chase it as never sent, and cancelling it will not take it off their calendars.'
        : '';
      const movedLine = stillHolding.length > 0
        ? ` The OLD window could not be taken off ${stillHolding.join(', ')}'s calendar - call them, or they will text the customer about it at 7:00am.`
        : '';
      // The row not coming off is the other verdict, and it means nothing was
      // retracted for that window either.
      const unretiredWindows: string[] = data.unretiredWindows ?? [];
      const staleLine = unretiredWindows.length > 0
        ? ' The crew record for the OLD window could NOT be retired - nobody was told it is off, and re-booking that slot may go unchased.'
        : '';
      const bad = data.reminder === 'unavailable' || data.dispatch !== 'sent'
        || stillHolding.length > 0 || unretiredWindows.length > 0;
      toast({
        title: 'Visit scheduled',
        description: reminderLine + dispatchLine + stillLiveLine + notMailedLine
          + recordLine + movedLine + staleLine,
        variant: bad ? 'destructive' : undefined,
      });
    } catch (e) {
      toast({ title: 'Scheduling failed', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setScheduling(false);
    }
  };

  /**
   * Close out ONE booked visit. The window is named, so the completion cannot
   * reach another visit this customer has on the books, and the seasons come
   * from the rows themselves rather than from a booking made in this session.
   */
  const complete = async (booking: Booking) => {
    if (!homeownerId) return;
    if (!window.confirm('Mark this service completed? The customer gets an email asking how the team did.')) return;
    setCompleting(booking.start);
    try {
      const res = await fetch('/api/admin/service-quote/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeownerId,
          taskKeys: booking.tasks.map((t) => t.key),
          seasons: Object.fromEntries(booking.tasks.map((t) => [t.key, t.season])),
          start: booking.start,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      await refreshBookings();
      const stranded = data.reminder === 'unavailable';
      // The route has always answered with this and the screen never read it. A
      // dispatch row that would not come off hands the next booking of the same
      // slot an already-confirmed assignment and a `nudged_at` that tells the
      // 5pm stage it has nothing to do.
      const dispatchStale = data.dispatch === 'unavailable';
      // 'suppressed' is not a fault to chase: this customer used the opt-out the
      // quote offered them, so no review request is the correct outcome.
      const feedbackLine =
        data.feedback === 'sent' ? 'Feedback request sent.'
          : data.feedback === 'suppressed'
            ? 'No feedback request - this customer opted out of follow-up emails.'
            : `Feedback ${data.feedback}.`;
      toast({
        title: 'Marked complete',
        description: feedbackLine
          + (stranded ? ' The night-before reminder could NOT be pulled - stop it on the Follow-Ups page.' : '')
          + (dispatchStale ? ' The crew record could NOT be cleared - re-booking this slot may go unchased.' : ''),
        variant: stranded || dispatchStale ? 'destructive' : undefined,
      });
    } catch (e) {
      toast({ title: 'Failed', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setCompleting(null);
    }
  };

  /**
   * Call OFF one booked visit.
   *
   * The gap this fills was the worst outcome in the feature: a customer phones
   * to cancel, the DELETE route exists but nothing reaches it, and the booking
   * stays live - the member's portal keeps showing the visit and the cron sends
   * "we're coming tomorrow" for a job nobody is attending. The two workarounds
   * available were both wrong: reschedule it to a fake date, or "Mark completed",
   * which writes the job into the service history and mails the customer asking
   * how the team did on work never performed.
   */
  const cancel = async (booking: Booking) => {
    if (!homeownerId) return;
    if (!window.confirm('Cancel this visit? It comes off the customer\'s portal and the night-before reminder is pulled.')) return;
    setCancelling(booking.start);
    try {
      // No email: the route reads it off the homeowner row. This box is the
      // LOOKUP field, not a value bound to the customer whose bookings are on
      // screen, so sending it let the unbook and the reminder cancel name
      // different people - the visit came off the books and the "we're coming
      // tomorrow" stayed queued.
      const res = await fetch(`/api/admin/service-quote/schedule?${new URLSearchParams({
        homeownerId, start: booking.start,
      })}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.issues?.[0]?.message || 'Failed');
      await refreshBookings();
      // The reminder is the half that can fail on its own, and a cancel that
      // could not pull it leaves the customer to be told we are coming for a
      // visit that was called off. Never reported as done unless it was.
      const stranded = data.reminder === 'unavailable';
      // So is the crew's calendar. A retraction that did not land leaves them
      // holding the visit and the 7:00am alarm telling them to text the
      // customer about it - the exact thing the retraction exists to stop - so
      // it is never reported as clean.
      const stillHolding: string[] = data.dispatch?.unretracted ?? [];
      // The other half of that verdict, and the one that used to be silent: when
      // the read-or-delete threw, NOTHING was retracted either - the catch
      // returns before the cancellation goes out - so an empty `unretracted`
      // there means nobody was told, not that everybody was.
      const dispatchStale = data.dispatch?.status === 'unavailable';
      const crewLine = dispatchStale
        ? ' The crew record could NOT be cleared - nobody has been told it is off, and re-booking this slot may go unchased. Call them.'
        : stillHolding.length > 0
          ? ` The crew could NOT be told it is off (${stillHolding.join(', ')}) - call them.`
          : data.dispatch?.retraction === 'sent'
            ? ' The crew has been sent a calendar cancellation.'
            : '';
      toast({
        title: 'Visit cancelled',
        description: (stranded
          ? 'Off the books, but the night-before reminder could NOT be pulled - stop it on the Follow-Ups page.'
          : 'Off the books, and the reminder is pulled.') + crewLine,
        variant: stranded || dispatchStale || stillHolding.length > 0 ? 'destructive' : undefined,
      });
    } catch (e) {
      toast({ title: 'Cancel failed', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setCancelling(null);
    }
  };

  /**
   * Clear a crew flag once the office has dealt with it.
   *
   * The crew screen cannot do this: it is terminal by design, and the person who
   * spotted the problem is not necessarily the person who fixes it. But a flag
   * no longer counts as an answer, so without this the visit is chased at 5pm
   * and 6pm until its window passes - three alerts for one problem already
   * sorted, and no way to stop them short of calling the visit off.
   */
  const markHandled = async (booking: Booking) => {
    if (!homeownerId) return;
    if (!window.confirm('Mark this flag handled? The 5pm and 6pm chases stop for this visit.')) return;
    setHandling(booking.start);
    try {
      const res = await fetch('/api/admin/service-quote/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ homeownerId, start: booking.start }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      await refreshBookings();
      // Both halves of the route's answer, neither assumed: how many flags
      // actually moved, and what the visit reads as NOW. Zero rows means the
      // list was stale - the flag was cleared elsewhere, or the assignment
      // retired - and only the re-read state can say whether the chase has
      // really stopped, because a visit nobody has confirmed is still chased.
      const cleared: number = data.handled ?? 0;
      const state: string | undefined = data.dispatch?.state;
      const chaseLine = state === 'confirmed'
        ? 'This visit reads as confirmed now, so it will not be chased again.'
        : state === 'flagged'
          ? 'Another flag is still open on it, so 5pm and 6pm will keep chasing it.'
          : 'Nobody on this visit has confirmed, so 5pm and 6pm will still chase it.';
      toast({
        title: cleared > 0 ? 'Flag cleared' : 'Nothing to clear',
        description: (cleared > 0
          ? `${cleared} flag${cleared === 1 ? '' : 's'} cleared. `
          : 'No flag was open on this visit - the list was out of date. ') + chaseLine,
        variant: state === 'confirmed' ? undefined : 'destructive',
      });
    } catch (e) {
      toast({ title: 'Failed', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setHandling(null);
    }
  };

  const visitLabel = (b: Booking) => {
    const fmt: Intl.DateTimeFormatOptions = { timeZone: 'America/New_York' };
    const day = new Date(b.start).toLocaleDateString('en-US', { ...fmt, weekday: 'short', day: 'numeric', month: 'short' });
    const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { ...fmt, hour: 'numeric', minute: '2-digit' });
    return `${day}, ${time(b.start)}${b.end ? ` - ${time(b.end)}` : ''}`;
  };

  const canSend = name.trim() && email.trim() && scope.trim() && estimateUrl.trim();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Send a service quote</CardTitle>
          <CardDescription>
            For one-visit work - gutters, dryer vent, furnace tune-up. Build the QuickBooks estimate first, then send this.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">1. Who is it for?</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input
              value={email} onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && lookup()}
              placeholder="customer@example.com" className="max-w-sm" data-testid="sq-email"
            />
            <Button variant="outline" onClick={lookup} disabled={loading} data-testid="sq-lookup">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Look up'}
            </Button>
          </div>

          {intake?.requests?.length ? (
            <div className="rounded-lg border border-border p-3">
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-text-muted">Their past requests</div>
              <div className="space-y-1.5">
                {intake.requests.slice(0, 5).map((r) => (
                  <button
                    key={r.id} type="button"
                    onClick={() => {
                      setName(r.name); setSelected(new Set(r.taskKeys));
                      setScope(scopeSummaryFrom(r.services));
                      setAddress([r.address, r.city, r.zip].filter(Boolean).join(', '));
                    }}
                    className="block w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:border-primary"
                  >
                    <span className="font-semibold">{new Date(r.createdAt).toLocaleDateString()}</span>
                    {' - '}{r.services.map((s) => s.title).join(', ') || r.source || 'request'}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {intake?.services?.length ? (
            <div className="rounded-lg border border-border p-3">
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-text-muted">Services</div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {intake.services.map((s) => {
                  const hist = intake.history[s.key];
                  return (
                    <label key={s.key} className="flex cursor-pointer items-start gap-2 rounded-md border border-border px-3 py-2 text-sm hover:border-primary">
                      <input
                        type="checkbox" checked={selected.has(s.key)} onChange={() => toggle(s.key)}
                        className="mt-0.5 h-4 w-4 accent-primary"
                      />
                      <span className="min-w-0">
                        <span className="font-semibold">{s.title}</span>
                        <span className="block text-xs text-text-muted">{hist ? hist.label : 'no record'}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">2. Quote details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div><Label htmlFor="sq-name">Recipient name</Label><Input id="sq-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label htmlFor="sq-cc">CC (optional)</Label><Input id="sq-cc" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="spouse@example.com" /></div>
          <div className="md:col-span-2">
            <Label htmlFor="sq-scope">Scope summary</Label>
            <Input id="sq-scope" value={scope} onChange={(e) => setScope(e.target.value)} placeholder="Gutter clearing and a dryer-vent clean" data-testid="sq-scope" />
            <p className="mt-1 text-xs text-text-muted">Plain language - this is the sentence the customer reads.</p>
          </div>
          <div><Label htmlFor="sq-length">Visit length</Label><Input id="sq-length" value={visitLength} onChange={(e) => setVisitLength(e.target.value)} /></div>
          <div><Label htmlFor="sq-valid">Quote valid until</Label><Input id="sq-valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></div>
          <div className="md:col-span-2">
            <Label htmlFor="sq-qbo">QuickBooks estimate URL</Label>
            <Input id="sq-qbo" value={estimateUrl} onChange={(e) => setEstimateUrl(e.target.value)} placeholder="https://app.qbo.intuit.com/..." data-testid="sq-qbo" />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="sq-note">Personal note (optional)</Label>
            <Textarea id="sq-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </div>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button variant="outline" onClick={() => send(true)} disabled={!canSend || busy !== null}>
              {busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send a test to me'}
            </Button>
            <Button onClick={() => send(false)} disabled={!canSend || busy !== null} data-testid="sq-send">
              {busy === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send quote'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">3. Schedule the visit</CardTitle>
          <CardDescription>Emails the crew with the calendar invite and a confirm link, queues the customer&apos;s 7:30pm night-before reminder, and gives you your own calendar invite.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label htmlFor="sq-addr">Service address</Label>
            <Input id="sq-addr" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="14 Maple Ave, West Orange, NJ" data-testid="sq-address" />
          </div>
          <div><Label htmlFor="sq-date">Date</Label><Input id="sq-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="sq-date" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label htmlFor="sq-from">From</Label><Input id="sq-from" type="time" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><Label htmlFor="sq-to">To</Label><Input id="sq-to" type="time" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="sq-sub">Sub (optional)</Label>
            <Input
              id="sq-sub" value={subName} onChange={(e) => setSubName(e.target.value)}
              placeholder="Ramirez Exteriors" data-testid="sq-sub"
            />
          </div>

          {/*
            Who gets told. Untouched means everyone active - a booking made
            without opening this must still reach the crew, because a dispatch
            nobody receives is the gap this whole feature closes.
          */}
          <div className="md:col-span-2" data-testid="sq-crew">
            <Label>Dispatch to</Label>
            {crew.length === 0 ? (
              <p className="mt-1 text-xs text-text-muted">
                No active crew members. Add them on the Crew page - without one, nobody is told about this visit.
              </p>
            ) : (
              <div className="mt-1.5 flex flex-wrap gap-2">
                {crew.map((c) => {
                  const on = crewPicked.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCrew(c.id)}
                      data-testid={`sq-crew-${c.id}`}
                      aria-pressed={on}
                      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                        on
                          ? 'border-primary bg-primary/10 font-semibold text-primary'
                          : 'border-border text-text-muted'
                      }`}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            )}
            {crew.length > 0 && crewPicked.size === 0 && (
              <p className="mt-1.5 text-xs font-medium text-destructive" data-testid="sq-crew-none">
                Nobody selected - nobody will be told to go. Pick at least one.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button
              onClick={schedule}
              disabled={scheduling || selected.size === 0 || !address.trim() || (crew.length > 0 && crewPicked.size === 0)}
              data-testid="sq-schedule"
            >
              {scheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CalendarPlus className="mr-1.5 h-4 w-4" /> Schedule visit</>}
            </Button>
            {scheduled && (
              <Button variant="outline" asChild><a href={scheduled.icsUrl}>Add to my calendar</a></Button>
            )}
          </div>

          {bookings.length > 0 && (
            <div className="rounded-lg border border-border p-3 md:col-span-2" data-testid="sq-bookings">
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-text-muted">On the books</div>
              <div className="space-y-1.5">
                {bookings.map((b) => (
                  <div
                    key={b.start}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="font-semibold">{visitLabel(b)}</span>
                      <span className="block text-xs text-text-muted">
                        {b.tasks.map((t) => t.title).join(', ')}
                      </span>
                      {/*
                        Whether the people doing the work have answered. This is
                        the only screen a flag ever reaches - the crew's own page
                        is terminal - and a flagged visit is chased at 5pm and
                        6pm until somebody here clears it.
                      */}
                      {b.dispatch && b.dispatch.state !== 'none' && (
                        <span className="mt-1 block text-xs" data-testid="sq-dispatch-state">
                          {b.dispatch.state === 'unknown' ? (
                            // Said out loud rather than shown as "not
                            // dispatched": a flag that vanished because a read
                            // failed takes its "Mark handled" button with it.
                            <span className="font-semibold text-destructive">
                              Could not read what the crew has said - look again before you rely on this.
                            </span>
                          ) : b.dispatch.state === 'flagged' ? (
                            <span className="font-semibold text-destructive">
                              Flagged by {b.dispatch.flags.map((f) => f.by).join(', ')}
                              {b.dispatch.flags.some((f) => f.note)
                                ? `: ${b.dispatch.flags.map((f) => f.note).filter(Boolean).join(' / ')}`
                                : ' (no note)'}
                            </span>
                          ) : b.dispatch.state === 'confirmed' ? (
                            <span className="font-medium text-text-muted">
                              Crew confirmed - {b.dispatch.confirmedBy.join(', ')}
                            </span>
                          ) : (
                            <span className="font-medium text-text-muted">Crew has not answered yet</span>
                          )}
                        </span>
                      )}
                    </span>
                    <span className="flex flex-wrap gap-2">
                      {b.dispatch?.state === 'flagged' && (
                        <Button
                          variant="outline" size="sm" onClick={() => markHandled(b)}
                          disabled={completing !== null || cancelling !== null || handling !== null || !homeownerId}
                          data-testid="sq-handled"
                        >
                          {handling === b.start
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <><ShieldCheck className="mr-1.5 h-4 w-4" /> Mark handled</>}
                        </Button>
                      )}
                      <Button
                        variant="outline" size="sm" onClick={() => complete(b)}
                        disabled={completing !== null || cancelling !== null || handling !== null || !homeownerId} data-testid="sq-complete"
                      >
                        {completing === b.start
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <><CheckCircle2 className="mr-1.5 h-4 w-4" /> Mark completed</>}
                      </Button>
                      <Button
                        variant="outline" size="sm" onClick={() => cancel(b)}
                        disabled={completing !== null || cancelling !== null || handling !== null || !homeownerId}
                        className="text-destructive hover:border-destructive" data-testid="sq-cancel"
                      >
                        {cancelling === b.start
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <><XCircle className="mr-1.5 h-4 w-4" /> Cancel visit</>}
                      </Button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
