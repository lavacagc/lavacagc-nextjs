/**
 * La Vaca Home Care — seasonal newsletter (monthly cron).
 *
 * Runs on the 1st of each month. Season-start months (Mar/Jun/Sep/Dec) send the
 * full seasonal checklist; other months send a lighter top-3 "nudge". One email
 * per active homeowner per calendar month (deduped via last_newsletter_at).
 *
 *   ?dryRun=1 — compute recipients/counts but send nothing.
 *
 * Auth: Bearer CRON_SECRET (also enforced by middleware on /api/cron/*).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { updateHomeowner } from '@/lib/homecare/homeowners';
import { currentSeason } from '@/lib/homecare/season';
import { buildNewsletter, type NewsletterTask } from '@/lib/homecare/newsletter';
import { filterTasksForProfile, type HomeSystems } from '@/lib/homecare/profile';
import { sendHomeCareNewsletterEmail } from '@/lib/notify/sendHomeCareEmails';
import { preferencesUrlFor } from '@/lib/preferences/preferences';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const SEASON_START_MONTHS = new Set([2, 5, 8, 11]); // Mar, Jun, Sep, Dec (0-indexed)
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MAX_PER_RUN = 400;

interface HomeownerRow {
  id: string;
  first_name: string | null;
  email: string;
  unsubscribe_token: string;
  last_newsletter_at: string | null;
}

function sameMonth(iso: string | null, now: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';
  const season = currentSeason(now);
  const isSeasonal = SEASON_START_MONTHS.has(now.getUTCMonth());
  const monthLabel = MONTHS[now.getUTCMonth()];
  const origin = request.nextUrl.origin;

  try {
    const tasks = (await supabaseRest<NewsletterTask[]>(
      'GET',
      `maintenance_catalog?select=key,title,blurb,bookable,diy_or_pro,priority,applies_to&active=eq.true&starter=eq.false&seasons=cs.%7B${season}%7D&order=priority.desc`,
    )) ?? [];

    const homeowners = (await supabaseRest<HomeownerRow[]>(
      'GET',
      'homeowners?select=id,first_name,email,unsubscribe_token,last_newsletter_at&status=eq.active',
    )) ?? [];

    // Per-homeowner personalization: filter the season tasks to each home's systems.
    const profiles = (await supabaseRest<{ homeowner_id: string; systems: HomeSystems }[]>(
      'GET',
      'home_profiles?select=homeowner_id,systems',
    )) ?? [];
    const systemsByOwner = new Map(profiles.map((p) => [p.homeowner_id, p.systems]));

    const eligible = homeowners.filter((h) => !sameMonth(h.last_newsletter_at, now)).slice(0, MAX_PER_RUN);

    let sent = 0;
    let suppressed = 0;
    const failures: string[] = [];
    if (!dryRun) {
      for (const h of eligible) {
        const personalTasks = filterTasksForProfile(tasks, systemsByOwner.get(h.id) ?? null);
        // Per-recipient preference-center link (best-effort — fall back to the
        // legacy unsubscribe link alone if the lookup fails).
        const preferencesUrl = await preferencesUrlFor(origin, h.email).catch(() => undefined);
        const { subject, html, text } = buildNewsletter({
          firstName: h.first_name,
          season,
          tasks: personalTasks,
          isSeasonal,
          baseUrl: origin,
          unsubscribeUrl: `${origin}/api/home-care/unsubscribe?token=${encodeURIComponent(h.unsubscribe_token)}`,
          preferencesUrl,
          monthLabel,
        });
        const res = await sendHomeCareNewsletterEmail({ to: h.email, subject, html, text, homeownerId: h.id });
        if (res.status === 'sent') {
          sent += 1;
          await updateHomeowner(h.id, { last_newsletter_at: now.toISOString() }).catch(() => {});
        } else if (res.status === 'skipped' && res.reason === 'unsubscribed') {
          // Preference opt-out that the legacy homeowners.status sync missed —
          // an intentional suppression, not a failure. Advance last_newsletter_at
          // so the row isn't re-attempted (and re-logged) every run this month.
          suppressed += 1;
          await updateHomeowner(h.id, { last_newsletter_at: now.toISOString() }).catch(() => {});
        } else {
          failures.push(`${h.email}:${res.status}`);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      type: isSeasonal ? 'seasonal' : 'nudge',
      season,
      month: monthLabel,
      tasks: tasks.length,
      active_homeowners: homeowners.length,
      eligible: eligible.length,
      sent,
      suppressed,
      failures: failures.length,
      dryRun,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('home-care-newsletter failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
