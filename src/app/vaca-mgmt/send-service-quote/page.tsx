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
import { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Loader2, CalendarPlus, CheckCircle2, XCircle, ShieldCheck } from 'lucide-react';
import { scopeSummaryFrom } from '@/lib/homecare/serviceIntake';
import { easternVisitInstant, chasesAhead, chaseStageLabel } from '@/lib/homecare/visitSchedule';

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
/**
 * The sub recorded on a visit.
 *
 * `unavailable` is a read that FAILED, and it cannot be shown as "no sub": the
 * Sub box is authoritative on every save and an empty one clears, so a blank
 * box drawn from a failed read deletes a name nobody was shown.
 */
interface BookingSub { read: 'ok' | 'unavailable'; name: string | null }
/** A visit on the books: one window, every service booked into it. */
interface Booking {
  start: string;
  end: string | null;
  address: string | null;
  tasks: { key: string; title: string; season: string }[];
  dispatch?: BookingDispatch;
  sub?: BookingSub;
}
interface Intake {
  services: Service[];
  requests: PastRequest[];
  history: Record<string, { at: string; by: string; label: string }>;
  homeowner: { id: string; first_name: string | null; phone: string | null; address: string | null; city: string | null; zip: string | null; status: string } | null;
  /**
   * Whether the customer RECORD could be read. `homeowner: null` is the same
   * answer for a walk-in nobody has booked before and for a read that failed,
   * and the two could not be more different here: the second one is an existing
   * customer whose name and address arrive blank and whose every visit action
   * is switched off, with nothing on screen saying why.
   */
  homeownerRead?: 'ok' | 'unavailable';
  /** Same rule for their past requests: empty is not "they have never asked". */
  requestsRead?: 'ok' | 'unavailable';
  /** And for what they last had done: empty renders "no record" on every service. */
  historyRead?: 'ok' | 'unavailable';
  bookings: Booking[];
  /**
   * `unavailable` is a read that FAILED, answered 200 alongside everything that
   * did load. It is not "this customer has nothing on the books" and must never
   * be shown as one - the empty list renders no panel at all, so a flagged
   * visit would vanish from the only screen a flag reaches.
   */
  bookingsRead?: 'ok' | 'unavailable';
  error?: string;
}

const todayPlus = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Said - and refused - when the lookup box names somebody other than the
 * customer the card was filled in for. Spelled once, because it is the answer
 * to the same question in three places: the warning on screen, "Send quote" and
 * "Schedule visit".
 */
const SPLIT_IDENTITY = 'The email box names somebody other than the customer loaded below, so this '
  + 'would have used one person\'s name, address, phone and services for another. Press "Look up" '
  + 'to load whoever is in the box.';

/** One booked visit, one write. */
type RowAction = 'complete' | 'cancel' | 'handle';

export default function SendServiceQuotePage() {
  const [email, setEmail] = useState('');
  const [intake, setIntake] = useState<Intake | null>(null);
  const [loading, setLoading] = useState(false);
  // What the customer's own REQUEST asked for. The default selection for a
  // window that is not yet on the books, and nothing more.
  const [requestTasks, setRequestTasks] = useState<Set<string>>(new Set());
  // What the admin has TICKED, or null while the boxes are still following the
  // visit the form is aimed at. Same shape as `subEdit` below, for a sharper
  // reason: these keys decide which (task, season) rows the save writes the
  // window onto, and they are what the crew dispatch and the customer's
  // reminder both list.
  const [taskEdit, setTaskEdit] = useState<Set<string> | null>(null);

  const [name, setName] = useState('');
  const [cc, setCc] = useState('');
  const [scope, setScope] = useState('');
  const [visitLength, setVisitLength] = useState('About 2-3 hours, one visit');
  const [estimateUrl, setEstimateUrl] = useState('');
  const [validUntil, setValidUntil] = useState(todayPlus(30));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<null | 'test' | 'send'>(null);

  const [address, setAddress] = useState('');
  // What the admin has TYPED into the Sub box, or null while the box is still
  // following the visit it is aimed at. The box is authoritative on save and an
  // empty one clears, so it has to show the stored sub before it can be trusted
  // to delete one - a box that always started blank made the destructive
  // direction the default, and the clear succeeded, so nothing reported it.
  const [subEdit, setSubEdit] = useState<string | null>(null);
  // Who the dispatch goes to. Loaded once and pre-ticked to everyone active,
  // so the default behaviour of the screen is "the crew is told".
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [crewPicked, setCrewPicked] = useState<Set<string>>(new Set());
  // A read that FAILED, which is the opposite of an empty list here: with no
  // list the booking omits `recipientIds` and the server dispatches to EVERY
  // active recipient, where a genuinely empty list dispatches to nobody. The
  // two cannot share a rendering.
  const [crewRead, setCrewRead] = useState<'ok' | 'unavailable'>('ok');
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
  // Whether that list could be read at all. An empty list from a failed read is
  // not "nothing on the books", and here it also means the Sub box has nothing
  // to fill itself from - which is a save away from clearing a stored sub.
  const [bookingsRead, setBookingsRead] = useState<'ok' | 'unavailable'>('ok');
  // And whether the customer record underneath it could be read. Kept in state
  // beside `bookingsRead` rather than read off `intake`, because a booking made
  // from a lookup that failed to read it does produce the id - so the warning
  // has to be able to come back down.
  const [homeownerRead, setHomeownerRead] = useState<'ok' | 'unavailable'>('ok');
  // Which booked row is mid-write, and what is being done to it. ONE state, not
  // one per action: they are mutually exclusive by construction - each button
  // is disabled while any of them is running - and spelled as three, that rule
  // was written out at every button, so a fourth action meant remembering four
  // places and forgetting one left a button live during another action's write.
  const [rowBusy, setRowBusy] = useState<{ action: RowAction; start: string } | null>(null);
  // Kept apart from `intake`, because a walk-in has no homeowner record until
  // the booking creates one - and completing that visit still needs the id.
  const [homeownerId, setHomeownerId] = useState<string | null>(null);
  /**
   * The address the customer ON SCREEN was loaded with, which is not the same
   * thing as what is in the lookup box.
   *
   * The box is a free text field: it can be cleared or retyped at any point
   * after a customer is loaded, and nothing binds it to the visits listed
   * below or to the id the buttons fire against - the same reason `cancel`
   * refuses to send it as the customer's address. Re-reading by the box let a
   * refresh answer with SOMEBODY ELSE's visits under this customer's id, and
   * swap the panel to them with nothing on screen marking the change.
   *
   * A ref, not state: `schedule` books a walk-in and refreshes in the same
   * handler, and a setter's value would not be visible to the refresh it just
   * called.
   */
  const loadedEmail = useRef('');

  /**
   * The box and the card have come apart: they name two different people.
   *
   * Reached without a lookup at all - load A, start typing B into the box, stop
   * short of pressing "Look up" - and every action on this card was split
   * between them, because only the IDENTITY came from the box while the name,
   * the address, the phone and the ticked services all belonged to A. Booking
   * there wrote A's phone and address onto B's customer record through
   * `ensureServiceHomeowner`, booked A's services at A's address under B, mailed
   * the crew "Customer: A" for a visit filed under B, and left B's night-before
   * reminder naming A's services. "Send quote" mailed B a scope sentence written
   * for A.
   *
   * So it is a state to resolve, never one to split: both buttons are switched
   * off, both handlers refuse, and the line below says which two people the
   * screen is holding. A walk-in is not this state - with nobody loaded, every
   * field on the card was typed here and the box is the only identity there is.
   */
  const splitIdentity = loadedEmail.current !== ''
    && email.trim().toLowerCase() !== loadedEmail.current.toLowerCase();

  /**
   * The visit this form is aimed at: the one already on the books for the
   * window the date and From time spell out.
   *
   * Saving that window re-writes THAT visit rather than adding a second one -
   * `visit_dispatch` is keyed on (homeowner, start) - so it is the visit whose
   * stored sub the box has to be showing.
   */
  const targetStart = date && from ? easternVisitInstant(date, from).getTime() : NaN;
  const targetVisit = Number.isFinite(targetStart)
    ? bookings.find((b) => new Date(b.start).getTime() === targetStart)
    : undefined;
  /**
   * The Sub box: what is stored on that visit, until the admin types over it.
   *
   * Following the stored value is what makes clearing one a deliberate act -
   * deleting a name that is on the screen - rather than the accident a box that
   * always opened blank made of it. The typed edit wins while it lasts, and is
   * dropped whenever the window, the customer, or what is stored changes.
   */
  const storedSub = targetVisit?.sub?.read === 'ok' ? targetVisit.sub.name ?? '' : '';
  const subName = subEdit ?? storedSub;
  // What is stored could NOT be read, so the box is not showing it - and an
  // empty box clears. Said out loud rather than left to look like "no sub",
  // but only once a window is named: with the visits unread this covers the
  // case where we cannot even tell whether that window is already booked.
  const subUnknown = Number.isFinite(targetStart)
    && (bookingsRead === 'unavailable' || (targetVisit !== undefined && targetVisit.sub?.read !== 'ok'));
  /**
   * The services this save writes the window onto: what the visit already holds,
   * until the admin ticks something.
   *
   * The same rule as the Sub box, because the field has the same shape - written
   * onto the window on every save, and previously never filled from it. Left to
   * the customer's last REQUEST, re-saving a booked window to add a crew member
   * or fix the address mailed the crew and re-queued the customer a service list
   * taken from what they once asked for rather than from what is booked, while
   * the rest of the visit stayed in the window unmentioned.
   */
  const storedTasks = targetVisit ? new Set(targetVisit.tasks.map((t) => t.key)) : null;
  const selected = taskEdit ?? storedTasks ?? requestTasks;
  // The visits could NOT be read, so what this window holds - or whether it is
  // booked at all - is unknown, and the ticks have quietly fallen back to the
  // customer's request. Nothing is deleted by that, but the crew and the
  // customer would be told a list nobody has checked against the visit.
  const tasksUnknown = Number.isFinite(targetStart) && bookingsRead === 'unavailable';

  /**
   * Aim the form at another window.
   *
   * What the admin has typed or ticked SURVIVES an ordinary correction - noticing
   * the From time reads 08:00 rather than 09:00 after filling the form is
   * ordinary, and dropping the edit on every keystroke threw away their input to
   * defend against something else. What it defends is still defended: a window
   * that carries its own stored value takes the box back, so a sub typed for one
   * visit can never overwrite another's.
   *
   * A window whose sub could NOT be read counts as carrying one. Treating an
   * unreadable value as an absent one is the mistake this screen closed
   * everywhere else, and here it would hand another visit's sub to this one.
   */
  const retarget = (nextDate: string, nextFrom: string) => {
    const at = nextDate && nextFrom ? easternVisitInstant(nextDate, nextFrom).getTime() : NaN;
    const visit = Number.isFinite(at)
      ? bookings.find((b) => new Date(b.start).getTime() === at)
      : undefined;
    const subless = visit === undefined || (visit.sub?.read === 'ok' && visit.sub.name === null);
    if (!subless) setSubEdit(null);
    // A window on the books always holds a definite set of services, and those
    // are the ones it should be showing.
    if (visit) setTaskEdit(null);
  };

  /**
   * Load the crew picker, and NEVER let a failed read pass for an empty list.
   *
   * `/api/admin/crew` answers a failure with a 500 whose body still parses, so
   * an unchecked `data.recipients ?? []` left `crew` empty - and the panel says
   * of an empty list "nobody is told about this visit". That is the INVERSE of
   * what happens: with no list the schedule POST omits `recipientIds` and the
   * server falls back to every active recipient, so the screen warned that
   * nobody would be dispatched at the exact moment everybody was.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/crew');
        const data: { recipients?: CrewMember[]; error?: string } = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not read the crew list');
        const active = (data.recipients ?? []).filter((r) => r.active);
        if (cancelled) return;
        setCrew(active);
        setCrewPicked(new Set(active.map((r) => r.id)));
      } catch (e) {
        if (cancelled) return;
        // Said out loud on the panel below rather than swallowed. Booking still
        // works and still reaches the crew - what is lost is the ability to
        // choose WHO, and that has to be the message.
        console.error('crew list could not be read:', e);
        setCrewRead('unavailable');
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

  /**
   * Take the customer currently on screen OFF it.
   *
   * Everything here was filled in from one lookup and belongs to one person -
   * their name, their address, what they asked for, the visits they have on the
   * books, and the id every one of "Mark completed", "Cancel visit" and "Mark
   * handled" fires against. Spelled once so the two paths that need it cannot
   * drift: a lookup that SUCCEEDED clears it before filling it back in, and a
   * lookup that FAILED clears it and leaves it cleared.
   *
   * The failure path is the one that was missing. Every setter sat inside the
   * `try`, above the throw, so a failed lookup left the previous customer's
   * identity live underneath an email box showing somebody else's address -
   * `homeownerId` still theirs, so all three buttons stayed enabled and would
   * have cancelled or completed THEIR visit, and the visits still listed as
   * this customer's. That is the same defect the success-path reset exists to
   * prevent, arriving through the other door.
   *
   * What is deliberately kept is what the admin typed for themselves and no
   * lookup fills: the CC line, the note, the estimate URL, the window. None of
   * it names a customer or aims an action at one.
   */
  const clearCustomer = useCallback(() => {
    setIntake(null);
    setName('');
    setAddress('');
    setScope('');
    setRequestTasks(new Set());
    // Ticks and a sub typed for the last customer are not this one's. Both go
    // back to following whatever this customer's visits carry.
    setTaskEdit(null);
    setSubEdit(null);
    setBookings([]);
    setHomeownerId(null);
    // The calendar link is for the visit booked for whoever was on screen.
    setScheduled(null);
    // Nobody is loaded now, so there is nobody to re-read.
    loadedEmail.current = '';
  }, []);

  /**
   * Re-read the visits on the books, and NEVER empty the list because the read
   * failed.
   *
   * The route answers a failure with a 500 whose body still parses, so an
   * unchecked `data.bookings ?? []` blanked the panel - and this runs straight
   * after a cancel or a completion, where a shrinking list is exactly what
   * success looks like. That made a failed refresh read as the write having
   * worked, on the only screen a crew flag ever reaches and the only place
   * "Mark handled" exists. So it keeps what it had and says the refresh failed,
   * failing closed the way the server now does.
   *
   * It re-reads the customer ON SCREEN, never whatever the lookup box happens
   * to hold. The box is free text and nothing binds it to the visits listed
   * below or to the id these writes just fired against, so reading by it made
   * two silent answers out of an edit nobody had submitted: emptied, the
   * refresh returned without running at all and left the list reading as
   * freshly re-read while "Visit cancelled - off the books" was toasted beside
   * the visit still on it; pointed at somebody else, it replaced the panel with
   * THEIR visits under this customer's id, with nothing marking the swap.
   *
   * And a refresh that cannot run - nobody loaded - fails like any other
   * unreadable answer rather than returning quietly. One exit, so a path added
   * later cannot skip the verdict.
   */
  const refreshBookings = useCallback(async () => {
    try {
      const who = loadedEmail.current;
      if (!who) throw new Error('No customer is loaded, so their visits could not be re-read');
      const res = await fetch(`/api/admin/service-quote/intake?email=${encodeURIComponent(who)}`);
      const data: Intake = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not read this customer\'s visits');
      // A 200 that could not read the visits is the same failure wearing a
      // success code, and replacing the list with its empty answer would hide
      // whatever is on it.
      if (data.bookingsRead === 'unavailable') throw new Error('Their visits could not be read');
      setBookings(data.bookings ?? []);
      setBookingsRead('ok');
      // The customer record came back with them - a failure on it is what makes
      // `bookingsRead` unavailable above - so a refresh that got this far is
      // also the answer that takes the record warning back off.
      setHomeownerRead('ok');
      if (data.homeowner?.id) setHomeownerId(data.homeowner.id);
    } catch (e) {
      // The list kept on screen is now of unknown age, and the Sub box fills
      // itself from it - so what it shows can no longer be called stored.
      setBookingsRead('unavailable');
      toast({
        title: 'The visit list could not be refreshed',
        description: `${e instanceof Error ? e.message : 'Unknown error'}. What is shown below may be `
          + 'out of date - look the customer up again before you rely on it.',
        variant: 'destructive',
      });
    }
  }, []);

  /**
   * Which lookup the screen is waiting on.
   *
   * The button is disabled while one runs, but pressing Enter in the box was
   * not, and no response was matched to its request - so a lookup for A that
   * settled AFTER a lookup for B had already loaded applied its own verdict over
   * the top. The identity was safe (each closure carries its own address), but
   * the verdict was not: A's failure ran `clearCustomer()` and wiped B off the
   * screen under "Whoever was on screen has been cleared off it", about a
   * customer who had just loaded correctly.
   *
   * So every lookup takes a ticket, and only the latest one is allowed to say
   * anything - including switching the spinner off. A stale answer is dropped
   * whole rather than half-applied.
   */
  const lookupTicket = useRef(0);

  const lookup = useCallback(async () => {
    if (!email.trim()) return;
    const ticket = ++lookupTicket.current;
    const mine = () => lookupTicket.current === ticket;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/service-quote/intake?email=${encodeURIComponent(email.trim())}`);
      const data: Intake = await res.json();
      // Checked before anything is replaced: a 500 body still parses, so an
      // unchecked read would swap a real list of visits for an empty one and
      // report nothing.
      if (!res.ok) throw new Error(data.error || 'Could not load this customer.');
      // A newer lookup is already on screen, so this answer is about somebody
      // nobody asked about any more. Dropped before the first setter, never
      // half-applied.
      if (!mine()) return;
      // CLEARED FIRST, then filled back in from whatever this lookup returned.
      // These resets used to sit inside branches - the services and the scope
      // behind "this lead named some tasks", the name and address behind "there
      // is a homeowner record" - so a walk-in with neither kept the LAST
      // customer's on screen. "Send quote" then mailed them a scope sentence
      // written for somebody else, and "Schedule visit" booked their window
      // onto somebody else's services at somebody else's address, both of which
      // the crew dispatch and the night-before reminder are built from.
      clearCustomer();
      setIntake(data);
      // THIS is who is on screen now, and who a refresh re-reads - not whatever
      // the box holds by the time one runs.
      loadedEmail.current = email.trim();
      // This IS a different customer, so the old list cannot stay on screen -
      // its windows belong to somebody else, and "Mark completed" would aim
      // them at this homeowner. It goes, and the gap is said out loud instead.
      setBookings(data.bookings ?? []);
      setBookingsRead(data.bookingsRead === 'unavailable' ? 'unavailable' : 'ok');
      setHomeownerRead(data.homeownerRead === 'unavailable' ? 'unavailable' : 'ok');
      setHomeownerId(data.homeowner?.id ?? null);
      if (data.bookingsRead === 'unavailable') {
        // The toast is the alert; the panel below is the record of it. A toast
        // that has faded is not enough to stop somebody acting on an empty
        // list, which is the whole reason this state is carried at all.
        toast({
          title: 'Their visits could not be read',
          description: 'Everything else loaded, but the visits on the books did not - so this is NOT '
            + '"nothing booked". Look them up again before you tell the customer anything.',
          variant: 'destructive',
        });
      }
      const latest = data.requests[0];
      if (latest) {
        setName(latest.name || '');
        setAddress([latest.address, latest.city, latest.zip].filter(Boolean).join(', '));
        if (latest.taskKeys.length) {
          setRequestTasks(new Set(latest.taskKeys));
          setScope(scopeSummaryFrom(latest.services));
        }
      } else if (data.homeowner) {
        setName(data.homeowner.first_name || '');
        setAddress([data.homeowner.address, data.homeowner.city, data.homeowner.zip].filter(Boolean).join(', '));
      }
    } catch (e) {
      // Same rule on the way out, and this is the path it was written for: an
      // older lookup failing must not clear a customer a newer one has already
      // loaded, nor mark their visits unread.
      if (!mine()) return;
      // Whoever was loaded last comes OFF the screen, exactly as a lookup that
      // succeeded takes them off. Left there, their visits were relabelled as
      // this customer's "list of unknown age" and their id kept aiming
      // "Mark completed", "Cancel visit" and "Mark handled" at their visits
      // while the box showed a different address - the same one-customer's-work
      // -on-another's mix-up the success-path reset was written to stop.
      clearCustomer();
      // And this customer's visits, their record, and the sub on them are all
      // unread until somebody looks again.
      setBookingsRead('unavailable');
      setHomeownerRead('unavailable');
      toast({
        title: 'Lookup failed',
        description: `${e instanceof Error ? e.message : 'Could not load this customer.'} `
          + 'Whoever was on screen has been cleared off it - nothing here belongs to either '
          + 'customer now. Look somebody up again before you send or book anything.',
        variant: 'destructive',
      });
    } finally {
      // Only the latest lookup owns the spinner - an older one settling would
      // otherwise switch it off while a newer one is still running, which is the
      // signal the "Look up" button is disabled on.
      if (mine()) setLoading(false);
    }
  }, [email, clearCustomer]);

  const toggle = (key: string) => {
    // Ticking is the admin taking the boxes off whatever they were following -
    // the visit on the books, or the customer's last request - so it is recorded
    // as an edit rather than folded back into either.
    const next = new Set(selected);
    if (next.has(key)) next.delete(key); else next.add(key);
    setTaskEdit(next);
    setScope(scopeSummaryFrom((intake?.services ?? []).filter((s) => next.has(s.key))));
  };

  /**
   * Who "Send quote" and "Schedule visit" act on, or why the screen cannot say
   * - the one place that question is answered.
   *
   * The customer who was LOADED, never the free-text box beside them: the box is
   * bound to nothing on this card, which is the same reason `cancel` refuses to
   * send it as the customer's address and the reason `refreshBookings` stopped
   * reading by it. With nobody loaded there is nothing to disagree with, so the
   * box IS the identity - that is the walk-in the admin has typed in front of
   * them, and it is the one shape where the box can be trusted.
   *
   * Two refusals, not one, because they are two different states and a refusal
   * that describes the wrong one is a banner asserting something the screen
   * contradicts.
   */
  const actionCustomer = (): { email: string; refusal?: undefined } | { email?: undefined; refusal: string } => {
    const typed = email.trim();
    const loaded = loadedEmail.current;
    if (loaded) {
      return typed.toLowerCase() === loaded.toLowerCase()
        ? { email: loaded }
        : { refusal: SPLIT_IDENTITY };
    }
    return typed
      ? { email: typed }
      : { refusal: 'There is nobody on this card yet - put the customer\'s email address in the box at the top.' };
  };

  const send = async (isTest: boolean) => {
    const who = actionCustomer();
    if (who.email === undefined) {
      toast({ title: 'Nothing was sent', description: who.refusal, variant: 'destructive' });
      return;
    }
    setBusy(isTest ? 'test' : 'send');
    try {
      const res = await fetch('/api/admin/service-quote/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientName: name, recipientEmail: who.email, ccEmails: cc,
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
          : isTest ? 'Check alex@lavacagc.com.' : `Sent to ${who.email}.`,
      });
    } catch (e) {
      toast({ title: 'Send failed', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const schedule = async () => {
    // Asked first, because it is the question the rest of the booking is built
    // on: the window, the services, the address and the sub all describe a
    // visit for one particular person, and this is the only thing that says
    // which one.
    const who = actionCustomer();
    if (who.email === undefined) {
      toast({ title: 'Nothing was booked', description: who.refusal, variant: 'destructive' });
      return;
    }
    if (!date) { toast({ title: 'Pick a date first', variant: 'destructive' }); return; }
    if (!from || !to) { toast({ title: 'Set the arrival window', variant: 'destructive' }); return; }
    setScheduling(true);
    const startAt = easternVisitInstant(date, from).toISOString();
    // The box is authoritative only when it is actually SHOWING the row. Left
    // untouched over a sub that could not be read it holds '', and sending that
    // is an explicit clear - a failed read turned into a destructive
    // instruction, which succeeds, so nothing downstream could report it. So the
    // field is left OUT instead and `ensureVisitDispatch` leaves the stored
    // value alone. A deliberate clear still works: typing in the box, including
    // emptying it, makes `subEdit` non-null.
    const subUnseen = subUnknown && subEdit === null;
    try {
      const res = await fetch('/api/admin/service-quote/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: who.email, name, phone: intake?.homeowner?.phone ?? intake?.requests[0]?.phone ?? '',
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
          // Sent whenever the box is showing the row, empty included: it is
          // authoritative on every save, so an empty one is a clear - omitting
          // the field means "leave whatever is stored alone", which is what made
          // a sub write-once per window and re-mailed a sub who had fallen
          // through. Omitted only when the box could not be filled from the row.
          ...(subUnseen ? {} : { subName: subName.trim() }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.issues?.[0]?.message || 'Scheduling failed');
      setScheduled({ icsUrl: data.icsUrl });
      setHomeownerId(data.homeownerId);
      // A booking loads a customer too - a walk-in booked without a lookup has
      // no other way of becoming the one on screen - so the refresh below has
      // somebody to re-read. Set before the await, not through a setter, which
      // this call would not see. The person just booked, never the box: those
      // are the same value here only because the guard above said so.
      loadedEmail.current = who.email;
      await refreshBookings();
      // Back to following the visit. The box and the ticks now show what the
      // row actually holds - which is the point when a write did NOT land: the
      // toast below says so, and the screen agrees with the row rather than with
      // the email that has already gone out.
      setSubEdit(null);
      setTaskEdit(null);
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
      // What was mailed and what was stored have diverged, in whichever
      // direction. The crew's email is built from what was typed here; the
      // confirm page and any flag alert read the row - and only this line ever
      // says the two disagree.
      const subLine = data.dispatchSubRecorded !== 'unavailable'
        ? ''
        : subName.trim()
          ? ` The sub (${subName.trim()}) is NOT stored on the visit - the crew email names them, but their confirm page and any flag alert will not. Re-save the visit.`
          : ' The sub could NOT be cleared from the visit - the crew email leaves them off, but their confirm page and any flag alert still name them. Re-save the visit.';
      // The save deliberately did not touch the sub, because the box was not
      // showing it. Said out loud: the crew email that just went out names
      // whatever is stored, which is a value nobody on this screen has seen.
      const subUnseenLine = subUnseen
        ? ' The sub was left as it is - what is stored could NOT be read, so this save did not '
          + 'touch it. The crew email names whatever is on the visit. Look the customer up again to see it.'
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
          + recordLine + subLine + subUnseenLine + movedLine + staleLine,
        variant: bad ? 'destructive' : undefined,
      });
    } catch (e) {
      toast({ title: 'Scheduling failed', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setScheduling(false);
    }
  };

  /**
   * Everything the three row actions do the same way, spelled once: they all
   * need the customer this page is holding, they all ask before they write,
   * they all lock every row for the duration, and they all report a throw the
   * same way. Only what happens in between differs, and that is what each
   * handler below is.
   *
   * The question and the failure title stay at the call site, where the reader
   * looking at "Cancel visit" can see what it asks.
   */
  const runRowAction = async (
    action: RowAction,
    booking: Booking,
    copy: { ask: string; failed: string },
    run: (homeownerId: string) => Promise<void>,
  ) => {
    if (!homeownerId) return;
    if (!window.confirm(copy.ask)) return;
    setRowBusy({ action, start: booking.start });
    try {
      await run(homeownerId);
    } catch (e) {
      toast({ title: copy.failed, description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setRowBusy(null);
    }
  };

  /**
   * Close out ONE booked visit. The window is named, so the completion cannot
   * reach another visit this customer has on the books, and the seasons come
   * from the rows themselves rather than from a booking made in this session.
   */
  const complete = (booking: Booking) => runRowAction(
    'complete',
    booking,
    {
      ask: 'Mark this service completed? The customer gets an email asking how the team did.',
      failed: 'Failed',
    },
    async (homeownerId) => {
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
    },
  );

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
  const cancel = (booking: Booking) => runRowAction(
    'cancel',
    booking,
    {
      ask: 'Cancel this visit? It comes off the customer\'s portal and the night-before reminder is pulled.',
      failed: 'Cancel failed',
    },
    async (homeownerId) => {
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
      // Nothing was sent at all, because the visit could not be read and a
      // cancellation that cannot name the job is worse than none: the crew get
      // "[CANCELLED]" with no customer, no address and no work. They are all
      // still holding it, so the admin is the one who has to tell them.
      const undescribed = data.dispatch?.retraction === 'unavailable';
      const crewLine = dispatchStale
        ? ' The crew record could NOT be cleared - nobody has been told it is off, and re-booking this slot may go unchased. Call them.'
        : stillHolding.length > 0
          ? ` The crew could NOT be told it is off (${stillHolding.join(', ')})${
            undescribed ? ' - the visit could not be read, so no cancellation was sent' : ''} - call them.`
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
    },
  );

  /**
   * Clear a crew flag once the office has dealt with it.
   *
   * Clearing is an admin action: the crew screen can raise a problem and raise
   * it again, but it cannot decide one is sorted, and the person who spotted it
   * is not necessarily the person who fixes it. A flag no longer counts as an
   * answer, so without this the visit is chased at 5pm and 6pm until its window
   * passes - three alerts for one problem already sorted, and no way to stop
   * them short of calling the visit off.
   */
  const markHandled = (booking: Booking) => {
    // WHICH stages are left, not merely whether any are. Both only ever read
    // TOMORROW'S window, so for a visit today - or one whose stages have already
    // fired - "the chases stop" describes nothing that was going to happen; and
    // at 5:30pm, the likeliest moment this button is ever pressed, the nudge has
    // run and naming it as still to come is the same defect in miniature.
    const ahead = chasesAhead({ visitStart: new Date(booking.start), now: new Date() });
    return runRowAction(
      'handle',
      booking,
      {
        ask: ahead.length > 0
          ? `Mark this flag handled? ${chaseStageLabel(ahead)} will not chase this visit.`
          : 'Mark this flag handled? No chase was left to run for this visit anyway - this only '
            + 'clears the flag off the list.',
        failed: 'Failed',
      },
      async (homeownerId) => {
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
        // Re-read after the write, and by NAME: the round trip can cross 5pm, and
        // a toast that answers "5pm and 6pm" for a visit only 6pm can still reach
        // promises an alert that is not coming - on the one screen from which a
        // flag can be acted on.
        const aheadNow = chasesAhead({ visitStart: new Date(booking.start), now: new Date() });
        const chaseLine = state === 'confirmed'
          ? 'This visit reads as confirmed now, so it will not be chased again.'
          : state === 'flagged'
            ? aheadNow.length > 0
              ? `Another flag is still open on it, so ${chaseStageLabel(aheadNow)} will keep chasing it.`
              : 'Another flag is still open on it, and no chase is left to run - nothing else will raise it.'
            // A re-read that FAILED, never the definite "nobody has confirmed":
            // the write landed, so the chase may well have stopped - what could
            // not be done is check.
            : state === 'unknown'
              ? 'What the visit reads as now could NOT be checked - look at it again before you rely on this.'
              : aheadNow.length > 0
                ? `Nobody on this visit has confirmed, so ${chaseStageLabel(aheadNow)} will still chase it.`
                : 'Nobody on this visit has confirmed, and no chase is left to run - nothing else will ask.';
        toast({
          title: cleared > 0 ? 'Flag cleared' : 'Nothing to clear',
          description: (cleared > 0
            ? `${cleared} flag${cleared === 1 ? '' : 's'} cleared. `
            : 'No flag was open on this visit - the list was out of date. ') + chaseLine,
          variant: state === 'confirmed' ? undefined : 'destructive',
        });
      },
    );
  };

  const visitLabel = (b: Booking) => {
    const fmt: Intl.DateTimeFormatOptions = { timeZone: 'America/New_York' };
    const day = new Date(b.start).toLocaleDateString('en-US', { ...fmt, weekday: 'short', day: 'numeric', month: 'short' });
    const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { ...fmt, hour: 'numeric', minute: '2-digit' });
    return `${day}, ${time(b.start)}${b.end ? ` - ${time(b.end)}` : ''}`;
  };

  // Every row action locks every row, because all three write to the same visit
  // list and each awaits a refresh that re-reads all of it. Spelled once, so
  // adding a fourth cannot leave a button live during another action's write.
  const rowLocked = rowBusy !== null || !homeownerId;
  const spinning = (action: RowAction, b: Booking) => rowBusy?.action === action && rowBusy.start === b.start;

  // Switched off across a split identity, on both buttons that write: this is
  // the only card where the customer's own details and the box that names them
  // can disagree, and neither a quote nor a booking may be split between two
  // people.
  const canSend = name.trim() && email.trim() && scope.trim() && estimateUrl.trim() && !splitIdentity;

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
              // Gated on `loading` exactly as the button is. The greyed-out
              // button was the only thing that looked like a lock, and Enter
              // walked straight past it.
              onKeyDown={(e) => { if (e.key === 'Enter' && !loading) lookup(); }}
              placeholder="customer@example.com" className="max-w-sm" data-testid="sq-email"
            />
            <Button variant="outline" onClick={lookup} disabled={loading} data-testid="sq-lookup">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Look up'}
            </Button>
          </div>

          {splitIdentity && (
            // The box is free text and nothing binds it to the card below it,
            // so it can be retyped at any point after a customer is loaded -
            // half of a second lookup, abandoned. Everything else here belongs
            // to whoever WAS loaded, so acting on this state split one action
            // between two people: it wrote the loaded customer's phone and
            // address onto the typed customer's record and booked the loaded
            // customer's services under them.
            <p className="text-xs font-medium text-destructive" data-testid="sq-identity-split">
              The box says <strong>{email.trim() || 'nothing'}</strong>, but the name, address,
              phone and services below were loaded for <strong>{loadedEmail.current}</strong>.
              Sending and booking are switched off until the two agree - press &quot;Look up&quot; to
              load whoever is in the box. The visits listed below still belong to{' '}
              {loadedEmail.current} and still act on them.
            </p>
          )}

          {homeownerRead === 'unavailable' && (
            // Their record read as `null`, which is also what a walk-in reads
            // as - so without this the screen shows a blank name, a blank
            // address and three greyed-out buttons for a customer we have on
            // file, and gives no reason for any of it.
            // What it says about those buttons is read off the same value that
            // GATES them, rather than asserted beside it. Stated flatly, the
            // claim was false wherever an id survived this state - a lookup
            // that failed used to leave the last customer's, and a booking made
            // after one still hands back a real one - and a banner promising a
            // safety the screen does not have is worse than no banner at all.
            <p className="text-xs font-medium text-destructive" data-testid="sq-homeowner-unread">
              Their customer record could NOT be read, so this is not a new customer. Their name and
              address are not filled in from it, and the visits they have on the books are unknown.
              {homeownerId
                ? ' Marking anything below completed, cancelled or handled still acts on the customer'
                  + ' record this page is holding - make sure that is the right one first.'
                : ' Nothing below can be marked completed, cancelled or handled.'}
              {' '}Look them up again.
            </p>
          )}

          {intake?.requestsRead === 'unavailable' && (
            // Not "they have never asked us for anything". The scope sentence
            // the quote mails and the services it is ticked for are both
            // pre-filled from this, so an empty answer is a blank form.
            <p className="text-xs font-medium text-destructive" data-testid="sq-requests-unread">
              Their past requests could NOT be read, so this is not &quot;they have never asked for
              anything&quot;. The scope summary and the ticked services below are NOT filled in from
              what they asked for - check them before you send anything.
            </p>
          )}

          {intake?.requests?.length ? (
            <div className="rounded-lg border border-border p-3">
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-text-muted">Their past requests</div>
              <div className="space-y-1.5">
                {intake.requests.slice(0, 5).map((r) => (
                  <button
                    key={r.id} type="button"
                    onClick={() => {
                      setName(r.name); setTaskEdit(new Set(r.taskKeys));
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
              {intake.historyRead === 'unavailable' && (
                // Otherwise every row underneath reads "no record", which is a
                // definite claim about a customer whose completions were never
                // read - and "you last had this done 14 months ago" is the line
                // the quote is argued from.
                <p className="mb-2 text-xs font-medium text-destructive" data-testid="sq-history-unread">
                  What they have had done could NOT be read, so &quot;not read&quot; below is not
                  &quot;never done&quot;.
                </p>
              )}
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
                        <span className="block text-xs text-text-muted">
                          {hist ? hist.label : intake.historyRead === 'unavailable' ? 'not read' : 'no record'}
                        </span>
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
            {targetVisit?.address && targetVisit.address !== address.trim() && (
              // This box fills from the CUSTOMER record, and `scheduleVisit`
              // writes it onto the window - so re-saving a visit booked at a
              // different address replaces the one stored on it. It cannot go
              // blank (the button is disabled empty), so unlike the sub this is
              // never a silent delete - but it is still a silent replacement,
              // and the stored one is not otherwise on screen.
              <p className="mt-1 text-xs font-medium text-destructive" data-testid="sq-address-differs">
                This visit is on the books at {targetVisit.address}. Saving replaces that with what is
                in the box.
              </p>
            )}
          </div>
          {/*
            The date and the From time name the visit. Changing either aims the
            form at a different one, and `retarget` decides what the Sub box and
            the ticks should be showing for it - keeping what was typed on an
            ordinary correction, handing the boxes back to a window that carries
            its own.
          */}
          <div><Label htmlFor="sq-date">Date</Label><Input id="sq-date" type="date" value={date} onChange={(e) => { setDate(e.target.value); retarget(e.target.value, from); }} data-testid="sq-date" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label htmlFor="sq-from">From</Label><Input id="sq-from" type="time" value={from} onChange={(e) => { setFrom(e.target.value); retarget(date, e.target.value); }} /></div>
            <div><Label htmlFor="sq-to">To</Label><Input id="sq-to" type="time" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </div>

          {tasksUnknown ? (
            // Not "this window holds nothing". The ticks have fallen back to the
            // customer's request, and only this line says the visit was never
            // checked against them.
            <p className="text-xs font-medium text-destructive md:col-span-2" data-testid="sq-tasks-unread">
              Whether this window is on the books, and what it holds, could NOT be read. The services
              ticked above come from what this customer asked for, not from the visit - look them up
              again, or the crew and the customer get a list nothing has checked.
            </p>
          ) : targetVisit ? (
            // Which services this window actually holds, said where the window
            // is named. The ticks are in the card above, so a date that lands on
            // a booked visit changes them out of sight otherwise - and they are
            // what the save writes the window onto.
            <p
              className={`text-xs md:col-span-2 ${taskEdit === null ? 'text-text-muted' : 'font-medium text-destructive'}`}
              data-testid="sq-tasks-stored"
            >
              {`This visit is on the books for ${targetVisit.tasks.map((t) => t.title).join(', ')}.`}
              {taskEdit === null
                ? ' Those are the services ticked above, and they are what the crew and the customer are told.'
                : ' Ticking adds a service to it; un-ticking one does NOT take it off the visit - it only'
                  + ' leaves it out of what the crew and the customer are told. Cancel the visit to drop a service.'}
            </p>
          ) : null}

          <div className="md:col-span-2">
            <Label htmlFor="sq-sub">Sub (optional)</Label>
            <Input
              id="sq-sub" value={subName} onChange={(e) => setSubEdit(e.target.value)}
              placeholder="Ramirez Exteriors" data-testid="sq-sub"
            />
            {subUnknown ? (
              // The box is authoritative and empty means CLEAR, so a box that
              // could not be filled from the row has to say so - saving now
              // would delete a sub nobody was shown.
              <p className="mt-1 text-xs font-medium text-destructive" data-testid="sq-sub-unread">
                What is stored on this window could NOT be read, so this box is not showing it.
                Saving with the box empty would clear any sub already on the visit - look the
                customer up again first.
              </p>
            ) : targetVisit ? (
              <p className="mt-1 text-xs text-text-muted" data-testid="sq-sub-stored">
                {storedSub
                  ? `Stored on this visit: ${storedSub}. Whatever is in the box wins - emptying it removes the sub.`
                  : 'No sub on this visit. Whatever is in the box wins.'}
              </p>
            ) : null}
          </div>

          {/*
            Who gets told. Untouched means everyone active - a booking made
            without opening this must still reach the crew, because a dispatch
            nobody receives is the gap this whole feature closes.
          */}
          <div className="md:col-span-2" data-testid="sq-crew">
            <Label>Dispatch to</Label>
            {crewRead === 'unavailable' ? (
              // Not "there is nobody" - the opposite of it. No selection is sent
              // when the list did not load, and the server reads that as "no
              // selection" and dispatches to everyone active.
              <p className="mt-1 text-xs font-medium text-destructive" data-testid="sq-crew-unread">
                The crew list could NOT be read, so this is not &quot;nobody to dispatch&quot;. Booking now
                still emails EVERY active crew member, including anyone you meant to leave off -
                reload the page if you need to pick.
              </p>
            ) : crew.length === 0 ? (
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
              disabled={scheduling || splitIdentity || selected.size === 0 || !address.trim() || (crew.length > 0 && crewPicked.size === 0)}
              data-testid="sq-schedule"
            >
              {scheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CalendarPlus className="mr-1.5 h-4 w-4" /> Schedule visit</>}
            </Button>
            {scheduled && (
              <Button variant="outline" asChild><a href={scheduled.icsUrl}>Add to my calendar</a></Button>
            )}
          </div>

          {/*
            Rendered on the LENGTH of the list, or on the list being unreadable -
            never on the length alone. A read that failed answers an empty list,
            and gated on length that empty list took the whole panel with it, so
            a visit the crew has flagged looked exactly like a customer with
            nothing booked. This is the only surface a flag ever reaches and the
            only place "Mark handled" exists, and the crew member who raised it
            has already been told the office has it.
          */}
          {(bookings.length > 0 || bookingsRead === 'unavailable') && (
            <div className="rounded-lg border border-border p-3 md:col-span-2" data-testid="sq-bookings">
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-text-muted">On the books</div>
              {bookingsRead === 'unavailable' && (
                // Persistent, and gated on nothing but the state it describes.
                // The toast that fires alongside it fades; the two warnings
                // about the ticks and the Sub box only speak once a window is
                // named, which a fresh lookup has not done - so this is what
                // stops somebody reading an empty panel as an answer.
                <p className="mb-2 text-xs font-medium text-destructive" data-testid="sq-bookings-unread">
                  {bookings.length > 0
                    ? 'These visits could NOT be re-read, so this list is of unknown age. A visit '
                      + 'cancelled, completed or flagged since is not shown here as one - look the '
                      + 'customer up again before you act on it.'
                    : 'Their visits could NOT be read. This is NOT "nothing on the books" - a visit '
                      + 'the crew has flagged looks exactly like this, and the crew member who '
                      + 'flagged it has been told the office has it. Look the customer up again.'}
                </p>
              )}
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
                          disabled={rowLocked}
                          data-testid="sq-handled"
                        >
                          {spinning('handle', b)
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <><ShieldCheck className="mr-1.5 h-4 w-4" /> Mark handled</>}
                        </Button>
                      )}
                      <Button
                        variant="outline" size="sm" onClick={() => complete(b)}
                        disabled={rowLocked} data-testid="sq-complete"
                      >
                        {spinning('complete', b)
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <><CheckCircle2 className="mr-1.5 h-4 w-4" /> Mark completed</>}
                      </Button>
                      <Button
                        variant="outline" size="sm" onClick={() => cancel(b)}
                        disabled={rowLocked}
                        className="text-destructive hover:border-destructive" data-testid="sq-cancel"
                      >
                        {spinning('cancel', b)
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
