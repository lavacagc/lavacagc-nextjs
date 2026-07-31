/**
 * POST /api/admin/service-quote/schedule  - book a visit
 * GET  /api/admin/service-quote/schedule?... - download the owner's .ics
 *
 * Booking does four things:
 *   1. upserts a lightweight homeowners record (pending + service_quote, so it
 *      can never receive marketing - see serviceScheduling.ts),
 *   2. writes the window onto each task as status='booked',
 *   3. cancels any stale reminder and queues the night-before one,
 *   4. returns the owner's .ics, alarms included.
 *
 * Admin auth is enforced by middleware on /api/admin/*.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import {
  ensureServiceHomeowner, scheduleVisit, bookedVisitStarts, requeueVisitReminder, cancelVisitReminder,
} from '@/lib/homecare/serviceScheduling';
import { buildVisitReminderEmail } from '@/lib/homecare/serviceEmails';
import { visitDateLabel, visitTimeWindow } from '@/lib/homecare/visitSchedule';
import { buildIcs } from '@/lib/homecare/ics';
import { preferencesUrlFor } from '@/lib/preferences/preferences';
import { cleanEnv } from '@/lib/envClean';
import { scheduleSchema } from '../_schema';

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
  const { email, name, phone, taskKeys, season, start, end, address, city, zip } = parsed.data;
  const startAt = new Date(start);
  const endAt = new Date(end);

  try {
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

    // Read the windows we are about to overwrite, so the requeue can pull those
    // visits' reminders and only those.
    const supersedes = await bookedVisitStarts({ homeownerId: homeowner.id, taskKeys, season });

    await scheduleVisit({
      homeownerId: homeowner.id, taskKeys, season, start: startAt, end: endAt, address,
    });

    const catalog = (await supabaseRest<{ key: string; title: string }[]>(
      'GET',
      `maintenance_catalog?select=key,title&key=in.(${taskKeys.map((k) => `"${k}"`).join(',')})`,
    )) ?? [];
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

    return NextResponse.json({
      status: 'scheduled',
      homeownerId: homeowner.id,
      homeownerStatus: homeowner.status,
      services,
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
 */
export async function DELETE(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const homeownerId = q.get('homeownerId');
  const email = q.get('email');
  const season = q.get('season');
  const start = q.get('start');
  if (!homeownerId || !email || !season || !start) {
    return NextResponse.json({ error: 'homeownerId, email, season and start are required' }, { status: 400 });
  }
  const startAt = new Date(start);
  if (Number.isNaN(startAt.getTime())) {
    return NextResponse.json({ error: 'start must be an ISO date-time' }, { status: 400 });
  }
  try {
    await supabaseRest(
      'PATCH',
      `homeowner_maintenance?homeowner_id=eq.${homeownerId}&season=eq.${encodeURIComponent(season)}&status=eq.booked` +
        `&scheduled_start=eq.${encodeURIComponent(startAt.toISOString())}`,
      { status: 'todo', scheduled_start: null, scheduled_end: null },
    );
    await cancelVisitReminder(email, startAt);
    return NextResponse.json({ status: 'cancelled' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('service-quote cancel failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
