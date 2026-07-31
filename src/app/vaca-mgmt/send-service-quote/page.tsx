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
import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Loader2, CalendarPlus, CheckCircle2, XCircle } from 'lucide-react';
import { scopeSummaryFrom } from '@/lib/homecare/serviceIntake';
import { easternVisitInstant } from '@/lib/homecare/visitSchedule';

interface Service { key: string; title: string; blurb: string; priority: number }
interface PastRequest {
  id: string; createdAt: string; source: string | null; name: string; phone: string | null;
  address: string | null; city: string | null; zip: string | null;
  taskKeys: string[]; services: { key: string; title: string }[];
}
/** A visit on the books: one window, every service booked into it. */
interface Booking {
  start: string;
  end: string | null;
  address: string | null;
  tasks: { key: string; title: string; season: string }[];
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
  // Kept apart from `intake`, because a walk-in has no homeowner record until
  // the booking creates one - and completing that visit still needs the id.
  const [homeownerId, setHomeownerId] = useState<string | null>(null);

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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.issues?.[0]?.message || 'Scheduling failed');
      setScheduled({ icsUrl: data.icsUrl });
      setHomeownerId(data.homeownerId);
      await refreshBookings();
      toast({
        title: 'Visit scheduled',
        description: data.reminder === 'queued'
          ? 'Reminder queued for 7:30pm the night before.'
          : data.reminder === 'unavailable'
            ? 'Booked, but the reminder could not be queued - text the customer yourself.'
            : 'Booked. Too late for the 7:30pm reminder - text the customer yourself.',
        variant: data.reminder === 'unavailable' ? 'destructive' : undefined,
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
      toast({
        title: 'Marked complete',
        description: (data.feedback === 'sent' ? 'Feedback request sent.' : `Feedback ${data.feedback}.`)
          + (stranded ? ' The night-before reminder could NOT be pulled - stop it on the Follow-Ups page.' : ''),
        variant: stranded ? 'destructive' : undefined,
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
      toast({
        title: 'Visit cancelled',
        description: stranded
          ? 'Off the books, but the night-before reminder could NOT be pulled - stop it on the Follow-Ups page.'
          : 'Off the books, and the reminder is pulled.',
        variant: stranded ? 'destructive' : undefined,
      });
    } catch (e) {
      toast({ title: 'Cancel failed', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setCancelling(null);
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
          <CardDescription>Queues the 7:30pm night-before reminder and gives you a calendar invite with confirm/text alarms.</CardDescription>
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
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button onClick={schedule} disabled={scheduling || selected.size === 0 || !address.trim()} data-testid="sq-schedule">
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
                    </span>
                    <span className="flex flex-wrap gap-2">
                      <Button
                        variant="outline" size="sm" onClick={() => complete(b)}
                        disabled={completing !== null || cancelling !== null || !homeownerId} data-testid="sq-complete"
                      >
                        {completing === b.start
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <><CheckCircle2 className="mr-1.5 h-4 w-4" /> Mark completed</>}
                      </Button>
                      <Button
                        variant="outline" size="sm" onClick={() => cancel(b)}
                        disabled={completing !== null || cancelling !== null || !homeownerId}
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
