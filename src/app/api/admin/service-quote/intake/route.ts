/**
 * GET /api/admin/service-quote/intake?email=...
 *
 * Everything the quote form needs to open pre-filled:
 *   - the bookable catalog (the dropdown for a walk-in),
 *   - this customer's past requests, newest first, with the task keys parsed
 *     out of each lead message,
 *   - when they last had each service done,
 *   - the visits they currently have on the books, each with what the crew has
 *     said about it - awaiting, confirmed, or flagged with the note.
 *
 * That last one is what makes "mark completed" reachable. A visit is booked on
 * Monday and performed on Thursday, in a different session - so gating the
 * button on a schedule POST from the same page load meant re-booking a job
 * already done just to close it out, which wiped the member's own tick off the
 * row and queued a reminder for a window that had passed.
 *
 * That last one is the interesting part: `homeowner_maintenance.completed_at`
 * has been recorded every time someone ticks a task on the checklist since
 * launch, and has never been surfaced anywhere. "You last had these done 14
 * months ago" justifies a quote better than any copy we could write.
 *
 * Admin auth is enforced by middleware on /api/admin/*.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { escapeLikePattern } from '@/lib/notify/cancelFollowUps';
import {
  parseTaskKeys, bookableCatalog, lastDoneFor, lastDoneLabel, groupBookings,
  type ServiceCatalogRow, type CompletionRow, type BookedRow, type Booking,
} from '@/lib/homecare/serviceIntake';
import {
  dispatchStateOf, UNKNOWN_DISPATCH_STATE, UNKNOWN_VISIT_SUB, VISIT_DISPATCH_COLUMNS,
  DISPATCH_ASSIGNMENT_COLUMNS,
  type DispatchAssignment, type VisitDispatchRow, type VisitDispatchState, type VisitSubState,
} from '@/lib/homecare/dispatch';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface LeadRow {
  id: string; first_name: string | null; last_name: string | null;
  email: string; phone: string | null; address: string | null; city: string | null;
  zip_code: string | null; source: string | null; message: string | null; created_at: string;
}

/** A booking with what the crew has said about it, for the "On the books" list. */
type BookedVisit = Booking & { dispatch: VisitDispatchState; sub: VisitSubState };

/**
 * Whether one of the reads behind this answer actually happened. `unavailable`
 * is a read that FAILED, handed back alongside everything that did load.
 */
type ReadVerdict = 'ok' | 'unavailable';

/**
 * One read, one verdict: `null` when it FAILED, never the empty answer, and
 * which read it was said out loud on the way past.
 *
 * Spelled once because it is the rule this whole route turns on. Every panel
 * this answer feeds renders an empty value as a definite claim - no visits, no
 * record, never asked us for anything, never had it done - so a read that
 * swallows itself to `[]` becomes a sentence the screen states about a customer
 * nobody managed to look up. Written out per read, a fifth one added later
 * could quietly get it wrong with nothing in the file objecting.
 */
async function readOrNull<T>(what: string, read: Promise<T | null>): Promise<T | null> {
  return read.catch((err) => {
    console.error(
      `service-quote intake could not read ${what}:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  });
}

/**
 * Attach each visit's dispatch state - awaiting, confirmed, or flagged - and
 * the sub recorded on it.
 *
 * This is the ONLY admin surface a flag reaches. The crew screen is terminal by
 * design, and a flag no longer counts as an answer, so a visit somebody raised
 * a problem on is chased at 5pm and 6pm until it is confirmed or called off -
 * and nothing else in the product shows it, or offers a way to close it.
 *
 * Every dispatch row this customer holds is read in one go rather than filtered
 * by window: cancelling or completing a visit deletes its row, so the set is at
 * most the visits they have on the books.
 *
 * Best-effort. The lookup is worth answering without it - as it already is
 * without the scheduling columns - so a failure leaves the state UNKNOWN rather
 * than failing the whole read.
 *
 * Unknown, never 'none'. Failing closed to "we could not read this" is safe;
 * failing open to "never dispatched" is what hides a flag, because the screen
 * renders nothing at all for a visit in that state - and this is the only
 * surface a flag ever reaches, along with the button that clears it.
 *
 * The sub follows the same rule, for a sharper reason: the Sub box is
 * authoritative on every save and an empty one CLEARS, so the screen has to
 * fill it from what is stored. A sub reported as absent because the read failed
 * would be deleted by the next save of that window, silently - the write would
 * succeed, so nothing downstream could say it had happened.
 */
async function withDispatchState(homeownerId: string, bookings: Booking[]): Promise<BookedVisit[]> {
  const blank: VisitDispatchState = { state: 'none', confirmedBy: [], flags: [] };
  const noSub: VisitSubState = { read: 'ok', name: null };
  if (bookings.length === 0) return [];

  const read = await readOrNull('the crew records on their visits', supabaseRest<VisitDispatchRow[]>(
    'GET',
    `visit_dispatch?select=${VISIT_DISPATCH_COLUMNS}&homeowner_id=eq.${homeownerId}`,
  ));
  // Nothing was read, so neither answer is knowable.
  if (read === null) {
    return bookings.map((b) => ({ ...b, dispatch: UNKNOWN_DISPATCH_STATE, sub: UNKNOWN_VISIT_SUB }));
  }

  const dispatches = read ?? [];
  // Matched on the INSTANT, never the string: PostgREST renders `timestamptz`
  // as "+00:00" where the booking carries a `Date`'s "Z", and the same moment
  // spelled two ways would leave every visit reading "not dispatched".
  const subByStart = new Map<number, string | null>();
  for (const d of dispatches) {
    const at = new Date(d.visit_start).getTime();
    if (Number.isFinite(at)) subByStart.set(at, d.sub_name);
  }
  // A window with no dispatch row has no sub, and that IS an answer: this read
  // succeeded.
  const subFor = (b: Booking): VisitSubState => ({
    read: 'ok', name: subByStart.get(new Date(b.start).getTime()) ?? null,
  });

  if (dispatches.length === 0) return bookings.map((b) => ({ ...b, dispatch: blank, sub: noSub }));

  const answered = await readOrNull('what the crew has said', supabaseRest<DispatchAssignment[]>(
    'GET',
    `visit_dispatch_recipients?select=${DISPATCH_ASSIGNMENT_COLUMNS}` +
      `&dispatch_id=in.(${dispatches.map((d) => d.id).join(',')})`,
  ));
  // Only what the crew has said is unknown here - the sub came off the row
  // above, which read fine, and blanking it would be the silent clear.
  if (answered === null) {
    return bookings.map((b) => ({ ...b, dispatch: UNKNOWN_DISPATCH_STATE, sub: subFor(b) }));
  }

  const assignments = answered ?? [];

  const byDispatch = new Map<string, DispatchAssignment[]>();
  for (const a of assignments) {
    const bucket = byDispatch.get(a.dispatch_id);
    if (bucket) bucket.push(a); else byDispatch.set(a.dispatch_id, [a]);
  }
  const stateByStart = new Map<number, VisitDispatchState>();
  for (const d of dispatches) {
    const at = new Date(d.visit_start).getTime();
    if (Number.isFinite(at)) stateByStart.set(at, dispatchStateOf(byDispatch.get(d.id) ?? []));
  }

  return bookings.map((b) => ({
    ...b,
    dispatch: stateByStart.get(new Date(b.start).getTime()) ?? blank,
    sub: subFor(b),
  }));
}

export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get('email')?.trim().toLowerCase();

  try {
    const catalog = (await supabaseRest<ServiceCatalogRow[]>(
      'GET',
      'maintenance_catalog?select=key,title,blurb,bookable,priority,est_cost_low,est_cost_high&active=eq.true&order=priority.desc',
    )) ?? [];

    const services = bookableCatalog(catalog);
    if (!email) {
      return NextResponse.json({
        services, requests: [], history: {}, homeowner: null,
        homeownerRead: 'ok', requestsRead: 'ok', historyRead: 'ok',
        bookings: [], bookingsRead: 'ok',
      });
    }

    const enc = encodeURIComponent(email);

    const [leads, owners] = await Promise.all([
      // `leads.email` is stored exactly as the customer typed it - the booking
      // form only trims - so a case-sensitive `eq.` against the lowercased
      // lookup silently returns nothing for anyone whose address autofilled as
      // `Jane.Smith@Gmail.com`. The past-requests panel, the pre-selected
      // services and the scope summary all just fail to appear, which reads as
      // "this customer has no history" rather than as a bug.
      //
      // Same shape as cancelPendingFollowUps, and for the same reason: an
      // escaped ilike narrows the candidates, then a JS equality check picks the
      // true matches, because PostgREST reads `*` as an alias for `%` with no
      // way to escape it. The limit is raised because the prefilter is the wider
      // net; the exact matches are cut back to ten below.
      //
      // Null, never an empty list, when it FAILS. An empty answer renders as
      // "this customer has never asked us for anything" - no past-requests
      // panel at all - and the scope sentence and the pre-ticked services are
      // both drawn from it, so a failed read quietly becomes a blank form for a
      // customer with history.
      readOrNull('their past requests', supabaseRest<LeadRow[]>(
        'GET',
        `leads?select=id,first_name,last_name,email,phone,address,city,zip_code,source,message,created_at` +
          `&email=ilike.${encodeURIComponent(escapeLikePattern(email))}&order=created_at.desc&limit=50`,
      )),
      // Null, never an empty list, when this one FAILS. Everything the admin
      // acts on hangs off the customer record - the visits, the crew state on
      // them, and the buttons that complete, cancel or clear a flag - so
      // swallowing it to `[]` rendered "no record for this customer" and took
      // the whole "On the books" panel with it, flag and all. Reported below as
      // the visits being unreadable, which is exactly what it means.
      readOrNull('the customer record', supabaseRest<{ id: string; first_name: string | null; phone: string | null; address: string | null; city: string | null; zip: string | null; status: string }[]>(
        'GET',
        `homeowners?select=id,first_name,phone,address,city,zip,status&email=eq.${enc}&limit=1`,
      )),
    ]);

    const homeowner = owners?.[0] ?? null;
    // Whether the customer RECORD could be read, said in its own right. A
    // failed read answers `homeowner: null`, which is indistinguishable from a
    // walk-in nobody has booked before - and the screen fills the name and the
    // address from it, and hangs every visit action off its id. Reported as a
    // read that failed, so the screen can say so rather than draw a blank form
    // for a customer we have on file.
    const homeownerRead: ReadVerdict = owners === null ? 'unavailable' : 'ok';
    const requestsRead: ReadVerdict = leads === null ? 'unavailable' : 'ok';

    // Their request history, with the services each one asked for resolved.
    // The ilike prefilter above can over-match (a stored `a*@example.com` is a
    // wildcard to PostgREST), so the address is re-checked exactly here.
    const byKey = new Map(catalog.map((c) => [c.key, c]));
    const mine = (leads ?? []).filter((l) => (l.email ?? '').trim().toLowerCase() === email).slice(0, 10);
    const requests = mine.map((l) => {
      const keys = parseTaskKeys(l.message);
      return {
        id: l.id,
        createdAt: l.created_at,
        source: l.source,
        message: l.message,
        name: [l.first_name, l.last_name].filter(Boolean).join(' '),
        phone: l.phone,
        address: l.address,
        city: l.city,
        zip: l.zip_code,
        taskKeys: keys,
        services: keys.map((k) => byKey.get(k)).filter(Boolean).map((c) => ({ key: c!.key, title: c!.title })),
      };
    });

    // Service history and open bookings - only meaningful once they have a
    // homeowner record.
    let history: Record<string, { at: string; by: string; label: string }> = {};
    let bookings: BookedVisit[] = [];
    // Whether the visits themselves could be read, handed back rather than left
    // to look like a customer with nothing on the books. The read below is
    // deliberately best-effort - the scheduling columns are hand-applied, and a
    // lookup is worth answering without them - but "no visits" and "we could
    // not read their visits" are not the same answer, and the second one hides
    // a flag: this list is the only surface a flag reaches, and the empty state
    // renders nothing at all. The same rule `withDispatchState` follows.
    //
    // A customer record that could not be read starts here too: with no
    // homeowner there is nothing to read visits against, so answering 'ok'
    // would say "nothing on the books" about a customer we never looked up.
    let bookingsRead: ReadVerdict = owners === null ? 'unavailable' : 'ok';
    // The same rule for what they last had done. Every service the catalog
    // offers reads "no record" against an empty history, which is a definite
    // claim about a customer whose completions were never read - and it is the
    // line the quote is argued from.
    let historyRead: ReadVerdict = owners === null ? 'unavailable' : 'ok';
    if (homeowner) {
      const [done, booked] = await Promise.all([
        // Selected on the TIMESTAMP, not on `status`. The two answer different
        // questions on one row: a member unticking a task La Vaca performed sets
        // it back to 'todo' - "this needs doing again" - while the job itself
        // still happened. Narrowed to `status=eq.done`, that tap took an
        // invoiced visit out of the history and this panel read "no record".
        readOrNull('their service history', supabaseRest<CompletionRow[]>(
          'GET',
          `homeowner_maintenance?select=task_key,status,completed_at,completed_by` +
            `&homeowner_id=eq.${homeowner.id}&completed_at=not.is.null`,
        )),
        // The scheduling columns are hand-applied (20260815), as every migration
        // here is. A lookup is still worth answering without them.
        readOrNull('the visits on the books', supabaseRest<BookedRow[]>(
          'GET',
          `homeowner_maintenance?select=task_key,season,scheduled_start,scheduled_end,service_address` +
            `&homeowner_id=eq.${homeowner.id}&scheduled_start=not.is.null&order=scheduled_start.asc`,
        )),
      ]);
      if (done === null) historyRead = 'unavailable';
      if (booked === null) bookingsRead = 'unavailable';
      history = Object.fromEntries(
        [...lastDoneFor(done ?? []).entries()].map(([k, v]) => [k, { at: v.at.toISOString(), by: v.by, label: lastDoneLabel(v) }]),
      );
      bookings = await withDispatchState(homeowner.id, groupBookings(booked ?? [], byKey));
    }

    return NextResponse.json({
      services, requests, history, homeowner,
      homeownerRead, requestsRead, historyRead, bookings, bookingsRead });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('service-quote intake failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
