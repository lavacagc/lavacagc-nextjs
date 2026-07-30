/**
 * La Vaca Home Care - night-before visit reminders.
 *
 * Runs at `30 23 * * *` UTC: 7:30pm Eastern in summer, 6:30pm in winter. The
 * owner chose one fixed UTC time and accepted that hour of drift rather than
 * carry DST logic.
 *
 * 23:30 UTC is deliberate. It is still the SAME calendar date in Eastern, so
 * "visits scheduled for tomorrow" resolves correctly. An hour later (00:30 UTC)
 * would already be the next UTC day while Eastern is still today, and the query
 * would silently skip a day - and nobody notices a reminder that never sent.
 *
 * Separate from `send-follow-ups` (09:00 UTC = 4am Eastern) precisely because
 * that time is fine for a nurture email nobody times and useless for "we're
 * coming today".
 *
 *   ?dryRun=1 - report who would be reminded, send nothing.
 *
 * Auth: Bearer CRON_SECRET (also enforced by middleware on /api/cron/*).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { sendTrackedEmail } from '@/lib/notify/sendEmail';
import { HOME_CARE_FROM } from '@/lib/notify/sendHomeCareEmails';
import { buildVisitReminderEmail, SERVICE_REPLY_TO } from '@/lib/homecare/serviceEmails';
import { tomorrowEasternWindow, visitDateLabel, visitTimeWindow } from '@/lib/homecare/visitSchedule';
import { preferencesUrlFor } from '@/lib/preferences/preferences';
import { cleanEnv } from '@/lib/envClean';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const SITE_URL = cleanEnv(process.env.NEXT_PUBLIC_SITE_URL) || 'https://www.lavacagc.com';
const MAX_PER_RUN = 200;

interface VisitRow {
  id: string;
  homeowner_id: string;
  task_key: string;
  status: string;
  scheduled_start: string;
  scheduled_end: string | null;
  service_address: string | null;
  reminder_sent_at?: string | null;
}

interface OwnerRow {
  id: string;
  email: string;
  first_name: string | null;
  unsubscribe_token: string;
  address: string | null;
}

export async function GET(request: NextRequest) {
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
  const now = new Date();
  const { startUtc, endUtc } = tomorrowEasternWindow(now);

  try {
    const visits = (await supabaseRest<VisitRow[]>(
      'GET',
      `homeowner_maintenance?select=id,homeowner_id,task_key,status,scheduled_start,scheduled_end,service_address` +
        `&status=eq.booked&scheduled_start=gte.${startUtc.toISOString()}&scheduled_start=lt.${endUtc.toISOString()}` +
        `&order=scheduled_start.asc&limit=${MAX_PER_RUN}`,
    )) ?? [];

    if (visits.length === 0) {
      return NextResponse.json({ ok: true, window: { from: startUtc, to: endUtc }, visits: 0, sent: 0, dryRun });
    }

    // One visit per homeowner+window, even when several tasks share it -
    // a customer with three booked tasks gets ONE email listing all three.
    const byOwner = new Map<string, VisitRow[]>();
    for (const v of visits) {
      const key = `${v.homeowner_id}|${v.scheduled_start}`;
      if (!byOwner.has(key)) byOwner.set(key, []);
      byOwner.get(key)!.push(v);
    }

    const ownerIds = [...new Set(visits.map((v) => v.homeowner_id))];
    const owners = (await supabaseRest<OwnerRow[]>(
      'GET',
      `homeowners?select=id,email,first_name,unsubscribe_token,address&id=in.(${ownerIds.join(',')})`,
    )) ?? [];
    const ownerById = new Map(owners.map((o) => [o.id, o]));

    // Titles for the services being performed.
    const keys = [...new Set(visits.map((v) => v.task_key))];
    const catalog = (await supabaseRest<{ key: string; title: string }[]>(
      'GET',
      `maintenance_catalog?select=key,title&key=in.(${keys.map((k) => `"${k}"`).join(',')})`,
    )) ?? [];
    const titleFor = new Map(catalog.map((c) => [c.key, c.title]));

    let sent = 0;
    const skipped: string[] = [];
    const wouldSend: string[] = [];

    for (const [, rows] of byOwner) {
      const owner = ownerById.get(rows[0].homeowner_id);
      if (!owner?.email) { skipped.push(rows[0].homeowner_id); continue; }

      const start = new Date(rows[0].scheduled_start);
      const end = rows[0].scheduled_end ? new Date(rows[0].scheduled_end) : new Date(start.getTime() + 2 * 3600_000);
      const services = rows.map((r) => titleFor.get(r.task_key) ?? r.task_key);
      const address = rows[0].service_address ?? owner.address ?? '';

      wouldSend.push(owner.email);
      if (dryRun) continue;

      const preferencesUrl = await preferencesUrlFor(SITE_URL, owner.email).catch(() => undefined);
      const { subject, html, text } = buildVisitReminderEmail({
        recipientName: owner.first_name || owner.email,
        services,
        address,
        timeWindow: visitTimeWindow(start, end),
        visitDateLabel: visitDateLabel(start),
        portalUrl: `${SITE_URL}/home-care/checklist`,
        unsubscribeUrl: `${SITE_URL}/api/home-care/unsubscribe?token=${encodeURIComponent(owner.unsubscribe_token)}`,
        preferencesUrl,
      });

      const res = await sendTrackedEmail({
        from: HOME_CARE_FROM,
        to: owner.email,
        replyTo: SERVICE_REPLY_TO.join(', '),
        subject,
        html,
        text,
        category: 'visit_reminder',
        toName: owner.first_name ?? null,
        homeownerId: owner.id,
        campaign: { follow_up_type: 'visit_reminder_1d' },
      });
      if (res.status === 'sent') sent += 1; else skipped.push(owner.email);
    }

    return NextResponse.json({
      ok: true,
      window: { from: startUtc, to: endUtc },
      visits: visits.length,
      recipients: byOwner.size,
      would_send: wouldSend.length,
      sent,
      skipped: skipped.length,
      dryRun,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('visit-reminders failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
