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
  dispatchStateOf, VISIT_DISPATCH_COLUMNS, DISPATCH_ASSIGNMENT_COLUMNS,
  type DispatchAssignment, type VisitDispatchRow, type VisitDispatchState,
} from '@/lib/homecare/dispatch';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface LeadRow {
  id: string; first_name: string | null; last_name: string | null;
  email: string; phone: string | null; address: string | null; city: string | null;
  zip_code: string | null; source: string | null; message: string | null; created_at: string;
}

/** A booking with what the crew has said about it, for the "On the books" list. */
type BookedVisit = Booking & { dispatch: VisitDispatchState };

/**
 * Attach each visit's dispatch state - awaiting, confirmed, or flagged.
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
 * without the scheduling columns - so a failure leaves the state unknown rather
 * than failing the whole read.
 */
async function withDispatchState(homeownerId: string, bookings: Booking[]): Promise<BookedVisit[]> {
  const blank: VisitDispatchState = { state: 'none', confirmedBy: [], flags: [] };
  if (bookings.length === 0) return [];

  const dispatches = (await supabaseRest<VisitDispatchRow[]>(
    'GET',
    `visit_dispatch?select=${VISIT_DISPATCH_COLUMNS}&homeowner_id=eq.${homeownerId}`,
  ).catch(() => [] as VisitDispatchRow[])) ?? [];
  if (dispatches.length === 0) return bookings.map((b) => ({ ...b, dispatch: blank }));

  const assignments = (await supabaseRest<DispatchAssignment[]>(
    'GET',
    `visit_dispatch_recipients?select=${DISPATCH_ASSIGNMENT_COLUMNS}` +
      `&dispatch_id=in.(${dispatches.map((d) => d.id).join(',')})`,
  ).catch(() => [] as DispatchAssignment[])) ?? [];

  const byDispatch = new Map<string, DispatchAssignment[]>();
  for (const a of assignments) {
    const bucket = byDispatch.get(a.dispatch_id);
    if (bucket) bucket.push(a); else byDispatch.set(a.dispatch_id, [a]);
  }
  // Matched on the INSTANT, never the string: PostgREST renders `timestamptz`
  // as "+00:00" where the booking carries a `Date`'s "Z", and the same moment
  // spelled two ways would leave every visit reading "not dispatched".
  const stateByStart = new Map<number, VisitDispatchState>();
  for (const d of dispatches) {
    const at = new Date(d.visit_start).getTime();
    if (Number.isFinite(at)) stateByStart.set(at, dispatchStateOf(byDispatch.get(d.id) ?? []));
  }

  return bookings.map((b) => ({
    ...b,
    dispatch: stateByStart.get(new Date(b.start).getTime()) ?? blank,
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
    if (!email) return NextResponse.json({ services, requests: [], history: {}, homeowner: null, bookings: [] });

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
      supabaseRest<LeadRow[]>(
        'GET',
        `leads?select=id,first_name,last_name,email,phone,address,city,zip_code,source,message,created_at` +
          `&email=ilike.${encodeURIComponent(escapeLikePattern(email))}&order=created_at.desc&limit=50`,
      ).catch(() => [] as LeadRow[]),
      supabaseRest<{ id: string; first_name: string | null; phone: string | null; address: string | null; city: string | null; zip: string | null; status: string }[]>(
        'GET',
        `homeowners?select=id,first_name,phone,address,city,zip,status&email=eq.${enc}&limit=1`,
      ).catch(() => []),
    ]);

    const homeowner = owners?.[0] ?? null;

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
    if (homeowner) {
      const [done, booked] = await Promise.all([
        // Selected on the TIMESTAMP, not on `status`. The two answer different
        // questions on one row: a member unticking a task La Vaca performed sets
        // it back to 'todo' - "this needs doing again" - while the job itself
        // still happened. Narrowed to `status=eq.done`, that tap took an
        // invoiced visit out of the history and this panel read "no record".
        supabaseRest<CompletionRow[]>(
          'GET',
          `homeowner_maintenance?select=task_key,status,completed_at,completed_by` +
            `&homeowner_id=eq.${homeowner.id}&completed_at=not.is.null`,
        ).catch(() => [] as CompletionRow[]),
        // The scheduling columns are hand-applied (20260815), as every migration
        // here is. A lookup is still worth answering without them.
        supabaseRest<BookedRow[]>(
          'GET',
          `homeowner_maintenance?select=task_key,season,scheduled_start,scheduled_end,service_address` +
            `&homeowner_id=eq.${homeowner.id}&scheduled_start=not.is.null&order=scheduled_start.asc`,
        ).catch(() => [] as BookedRow[]),
      ]);
      history = Object.fromEntries(
        [...lastDoneFor(done ?? []).entries()].map(([k, v]) => [k, { at: v.at.toISOString(), by: v.by, label: lastDoneLabel(v) }]),
      );
      bookings = await withDispatchState(homeowner.id, groupBookings(booked ?? [], byKey));
    }

    return NextResponse.json({ services, requests, history, homeowner, bookings });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('service-quote intake failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
