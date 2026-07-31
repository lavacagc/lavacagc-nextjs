/**
 * GET /api/admin/service-quote/intake?email=...
 *
 * Everything the quote form needs to open pre-filled:
 *   - the bookable catalog (the dropdown for a walk-in),
 *   - this customer's past requests, newest first, with the task keys parsed
 *     out of each lead message,
 *   - when they last had each service done,
 *   - the visits they currently have on the books.
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
import {
  parseTaskKeys, bookableCatalog, lastDoneFor, lastDoneLabel, groupBookings,
  type ServiceCatalogRow, type CompletionRow, type BookedRow, type Booking,
} from '@/lib/homecare/serviceIntake';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface LeadRow {
  id: string; first_name: string | null; last_name: string | null;
  email: string; phone: string | null; address: string | null; city: string | null;
  zip_code: string | null; source: string | null; message: string | null; created_at: string;
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
      supabaseRest<LeadRow[]>(
        'GET',
        `leads?select=id,first_name,last_name,email,phone,address,city,zip_code,source,message,created_at` +
          `&email=eq.${enc}&order=created_at.desc&limit=10`,
      ).catch(() => [] as LeadRow[]),
      supabaseRest<{ id: string; first_name: string | null; phone: string | null; address: string | null; city: string | null; zip: string | null; status: string }[]>(
        'GET',
        `homeowners?select=id,first_name,phone,address,city,zip,status&email=eq.${enc}&limit=1`,
      ).catch(() => []),
    ]);

    const homeowner = owners?.[0] ?? null;

    // Their request history, with the services each one asked for resolved.
    const byKey = new Map(catalog.map((c) => [c.key, c]));
    const requests = (leads ?? []).map((l) => {
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
    let bookings: Booking[] = [];
    if (homeowner) {
      const [done, booked] = await Promise.all([
        supabaseRest<CompletionRow[]>(
          'GET',
          `homeowner_maintenance?select=task_key,status,completed_at,completed_by&homeowner_id=eq.${homeowner.id}&status=eq.done`,
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
      bookings = groupBookings(booked ?? [], byKey);
    }

    return NextResponse.json({ services, requests, history, homeowner, bookings });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('service-quote intake failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
