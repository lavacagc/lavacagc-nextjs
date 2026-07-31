/**
 * POST /api/admin/service-quote/schedule  - book a visit
 * GET  /api/admin/service-quote/schedule?... - download the owner's .ics
 *
 * Booking does five things:
 *   1. upserts a lightweight homeowners record (pending + service_quote, so it
 *      can never receive marketing - see serviceScheduling.ts),
 *   2. writes the window onto each task as status='booked',
 *   3. cancels any stale reminder and queues the night-before one,
 *   4. dispatches the crew - the email with the calendar invite attached and a
 *      per-person confirm link (see lib/homecare/dispatch.ts),
 *   5. returns the owner's .ics, alarms included.
 *
 * Admin auth is enforced by middleware on /api/admin/*.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import {
  ensureServiceHomeowner, scheduleVisit, bookedVisitRows, orphanedVisitStarts, supersededBookings,
  crossSeasonBookings, requeueVisitReminder, cancelVisitReminder, type VisitTask,
} from '@/lib/homecare/serviceScheduling';
import { buildVisitReminderEmail } from '@/lib/homecare/serviceEmails';
import { sendVisitDispatch, clearVisitDispatch, type SendDispatchResult } from '@/lib/homecare/dispatch';
import { visitDateLabel, visitTimeWindow, easternParts } from '@/lib/homecare/visitSchedule';
import { seasonForTaskVisit } from '@/lib/homecare/season';
import { buildIcs } from '@/lib/homecare/ics';
import { preferencesUrlFor } from '@/lib/preferences/preferences';
import { cleanEnv } from '@/lib/envClean';
import { cancelVisitSchema, scheduleSchema } from '../_schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SITE_URL = cleanEnv(process.env.NEXT_PUBLIC_SITE_URL) || 'https://www.lavacagc.com';

export async function POST(request: NextRequest) {
  let raw: unknown;
  try { raw = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = scheduleSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  const { email, name, phone, taskKeys, start, end, address, city, zip, recipientIds, subName } = parsed.data;
  const startAt = new Date(start);
  const endAt = new Date(end);

  try {
    const catalog = (await supabaseRest<{ key: string; title: string; seasons: string[] | null }[]>(
      'GET',
      `maintenance_catalog?select=key,title,seasons&key=in.(${taskKeys.map((k) => `"${k}"`).join(',')})`,
    )) ?? [];

    // The season is derived HERE, not by the caller: it needs the task's own
    // catalog seasons, which only the server reads. Noon on the visit's EASTERN
    // calendar date, so an evening window whose UTC date has already rolled over
    // is not filed a month - and sometimes a season - late.
    const p = easternParts(startAt);
    const visitDay = new Date(Date.UTC(p.y, p.m, p.day, 12));
    const tasks: VisitTask[] = [];
    const unfiled: string[] = [];
    for (const key of taskKeys) {
      const row = catalog.find((c) => c.key === key);
      const season = row ? seasonForTaskVisit(visitDay, row.seasons ?? []) : null;
      if (season) tasks.push({ taskKey: key, season }); else unfiled.push(key);
    }
    // Fail loudly rather than writing a row the member can never see: the portal
    // renders a task only in the seasons its catalog row lists.
    if (unfiled.length > 0) {
      return NextResponse.json({
        error: `No season to file these services under: ${unfiled.join(', ')}. `
          + 'Check the service exists in maintenance_catalog and lists at least one season.',
      }, { status: 400 });
    }

    const homeowner = await ensureServiceHomeowner({
      email, firstName: name.split(' ')[0] || name, phone, address, city, zip,
    });
    if (!homeowner) {
      return NextResponse.json({ error: 'Could not create or find the customer record' }, { status: 500 });
    }
    // The reminder we are about to queue carries an unsubscribe link. Refuse to
    // build one we know is dead rather than mail a footer whose opt-out 400s.
    if (!homeowner.unsubscribe_token) {
      return NextResponse.json(
        { error: 'Customer record has no unsubscribe token - refusing to queue an email without a working opt-out' },
        { status: 500 },
      );
    }

    // Read every window this customer is holding before the upsert overwrites
    // anything, so the requeue can pull exactly the reminders this booking
    // retires. One active booking per (task, season), which the table's unique
    // key already guarantees - so the upsert moves the row in place and all
    // that is left to work out is the window it vacated. A window another task
    // still holds is NOT retired: that visit is still happening and still
    // needs its reminder.
    const previous = await bookedVisitRows(homeowner.id);

    // A service already booked into a DIFFERENT season is refused, not
    // reconciled. The season is derived from the visit date, and for a
    // two-season service (gutters, roof) it flips on 1 Jun and 1 Dec - so a
    // seven-day slip across that line would file a second row and leave the old
    // window announcing itself. Telling a move from a deliberate second booking
    // is unknowable here; the admin knows, and Cancel visit is on this screen.
    const conflicts = crossSeasonBookings({ previous, tasks });
    if (conflicts.length > 0) {
      const held = conflicts.map((r) => {
        const title = catalog.find((c) => c.key === r.task_key)?.title ?? r.task_key;
        return `${title} on ${visitDateLabel(new Date(r.scheduled_start!))}`;
      });
      return NextResponse.json({
        error: `Already on the books for a different season: ${held.join('; ')}. `
          + 'If this visit replaces it, cancel that one first - then book this window.',
      }, { status: 409 });
    }

    const superseded = supersededBookings({ previous, tasks, start: startAt });
    const supersedes = orphanedVisitStarts({ previous, superseded });

    await scheduleVisit({ homeownerId: homeowner.id, tasks, start: startAt, end: endAt, address });

    const services = taskKeys.map((k) => catalog.find((c) => c.key === k)?.title ?? k);

    const preferencesUrl = await preferencesUrlFor(SITE_URL, email).catch(() => undefined);
    const { subject, html } = buildVisitReminderEmail({
      recipientName: name,
      services,
      address,
      timeWindow: visitTimeWindow(startAt, endAt),
      visitDateLabel: visitDateLabel(startAt),
      portalUrl: `${SITE_URL}/home-care/checklist`,
      unsubscribeUrl: `${SITE_URL}/api/home-care/unsubscribe?token=${encodeURIComponent(homeowner.unsubscribe_token)}`,
      preferencesUrl,
    });

    // Cancels the superseded reminder first: a reminder for a visit that moved
    // is worse than no reminder at all. Scoped to the windows this booking
    // replaces, so an unrelated visit's reminder survives.
    const reminder = await requeueVisitReminder({
      email, name, start: startAt, subject, html, supersedes,
    });

    // Tell the crew. Runs AFTER the booking is written and never throws: the
    // booking is the customer's commitment and it already succeeded, so a
    // dispatch that cannot go out is something the admin needs to be told
    // about - not a reason to report a booking failed that in fact happened.
    // Which is why the outcome is in the response and surfaced in the toast.
    const dispatch = await sendVisitDispatch({
      siteUrl: SITE_URL,
      homeownerId: homeowner.id,
      visitStart: startAt,
      visitEnd: endAt,
      customerName: name,
      customerPhone: phone,
      address,
      services,
      visitDateLabel: visitDateLabel(startAt),
      timeWindow: visitTimeWindow(startAt, endAt),
      subName,
      recipientIds,
    }).catch((err): SendDispatchResult => {
      const message = err instanceof Error ? err.message : String(err);
      console.error('crew dispatch threw after a successful booking:', message);
      return { outcome: 'unavailable', sentTo: [], error: message };
    });

    return NextResponse.json({
      status: 'scheduled',
      homeownerId: homeowner.id,
      homeownerStatus: homeowner.status,
      services,
      dispatch: dispatch.outcome,
      dispatchedTo: dispatch.sentTo,
      // What each task was actually filed under. "Mark complete" needs this:
      // the season is per task and derived here, so the caller cannot guess it.
      seasons: Object.fromEntries(tasks.map((t) => [t.taskKey, t.season])),
      reminder,
      icsUrl: `/api/admin/service-quote/schedule?${new URLSearchParams({
        uid: `${homeowner.id}-${startAt.getTime()}`,
        start: startAt.toISOString(),
        end: endAt.toISOString(),
        services: services.join('|'),
        address,
        name,
        ...(phone ? { phone } : {}),
      })}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('service-quote schedule failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** The owner's calendar file, with the two ops alarms. */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const start = q.get('start');
  const end = q.get('end');
  const address = q.get('address');
  const name = q.get('name');
  if (!start || !end || !address || !name) {
    return NextResponse.json({ error: 'start, end, address and name are required' }, { status: 400 });
  }

  const ics = buildIcs({
    uid: q.get('uid') || `lavaca-${Date.now()}`,
    start: new Date(start),
    end: new Date(end),
    services: (q.get('services') || 'Home Care service').split('|').filter(Boolean),
    address,
    customerName: name,
    customerPhone: q.get('phone'),
    variant: 'owner',
  });

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="lavaca-visit.ics"',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Cancel ONE visit: clear that window's schedule and pull its pending reminder.
 *
 * `start` is required and both the unbook and the reminder cancel filter on it.
 * A season-wide cancel would unbook every other visit the customer has booked in
 * the same season, which is never what "cancel this visit" means.
 *
 * (homeowner, window) is the whole filter - no season. One window can file its
 * tasks under different seasons, because each is reconciled against that task's
 * own catalog seasons, so a season filter would leave part of the visit booked.
 *
 * The address the reminder cancel matches on is READ HERE, never taken from the
 * caller. The unbook filters on `homeowner_id` and the cancel on the address, so
 * a caller-supplied one let the two name different people: the admin page sent
 * its lookup box, which is not bound to the customer whose bookings are on
 * screen, and a stale value cleared the window, matched no queue row, and
 * answered "cancelled" - leaving the customer to be told we were coming
 * tomorrow for a visit that was called off.
 */
export async function DELETE(request: NextRequest) {
  const parsed = cancelVisitSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  const { homeownerId, start } = parsed.data;
  const startAt = new Date(start);
  try {
    // Resolved before anything is written: a cancel that cannot pull the
    // reminder is the failure this route exists to prevent, so it must not
    // half-happen.
    const owners = (await supabaseRest<{ email: string }[]>(
      'GET', `homeowners?select=email&id=eq.${homeownerId}&limit=1`,
    )) ?? [];
    const owner = owners[0];
    if (!owner?.email) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

    const filter = `homeowner_maintenance?homeowner_id=eq.${homeownerId}` +
      `&scheduled_start=eq.${encodeURIComponent(startAt.toISOString())}`;
    // The window is what identifies the visit; `status` is shared with the
    // member's checkbox, so a row they ticked is still this visit. Only a row
    // still reading 'booked' goes back to 'todo' - their own completion stands.
    await supabaseRest('PATCH', `${filter}&status=eq.booked`, { status: 'todo' });
    await supabaseRest('PATCH', filter, { scheduled_start: null, scheduled_end: null });
    // Reported, never assumed. A cancel that could not pull the reminder leaves
    // a pending "we're coming tomorrow" for a visit that was called off, and
    // answering a flat "cancelled" is what hid it.
    const reminder = await cancelVisitReminder(owner.email, startAt);
    // The dispatch record goes with the visit. It is keyed on (homeowner,
    // window), so leaving it behind means re-booking that same window later
    // inherits this visit's escalation stamps - and a `nudged_at` already set
    // is what tells the 5pm stage it has nothing to do. The record of what was
    // actually sent lives in email_log, which this does not touch.
    const dispatch = await clearVisitDispatch(homeownerId, startAt);
    return NextResponse.json({ status: 'cancelled', reminder, dispatch });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('service-quote cancel failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
