/**
 * La Vaca Home Care — seasonal newsletter (monthly cron).
 *
 * Runs on the 1st of each month. Season-start months (Mar/Jun/Sep/Dec) send the
 * full seasonal checklist; other months send a lighter top-3 "nudge". One email
 * per active homeowner per calendar month (deduped via last_newsletter_at).
 * Tasks a member dismissed ("not relevant to my home") are filtered out per
 * recipient; a member with no tasks left after filtering is skipped for the
 * month (reported as empty_skipped in the response).
 *
 *   ?dryRun=1 — compute recipients/counts but send nothing.
 *
 * Auth: Bearer CRON_SECRET (also enforced by middleware on /api/cron/*).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { updateHomeowner } from '@/lib/homecare/homeowners';
import { currentSeason } from '@/lib/homecare/season';
import { buildNewsletter, homeCareHeroUrl, type NewsletterTask } from '@/lib/homecare/newsletter';
import { stageFromLegacyType, type HomeSystems, type Stage } from '@/lib/homecare/profile';
import { resolveMemberTasks, type MaintenanceRow } from '@/lib/homecare/selection';
import { sendHomeCareNewsletterEmail } from '@/lib/notify/sendHomeCareEmails';
import { preferencesUrlFor } from '@/lib/preferences/preferences';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const SEASON_START_MONTHS = new Set([2, 5, 8, 11]); // Mar, Jun, Sep, Dec (0-indexed)
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MAX_PER_RUN = 400;
const DISMISSED_CHUNK = 20;

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
      `maintenance_catalog?select=key,title,blurb,bookable,diy_or_pro,priority,applies_to,stages,est_cost_low,est_cost_high&active=eq.true&starter=eq.false&seasons=cs.%7B${season}%7D&order=priority.desc`,
    )) ?? [];

    if (tasks.length === 0) {
      console.error('home-care-newsletter: seasonal catalog returned no tasks');
      return NextResponse.json({ ok: false, error: 'seasonal catalog returned no tasks' }, { status: 500 });
    }

    const homeowners = (await supabaseRest<HomeownerRow[]>(
      'GET',
      'homeowners?select=id,first_name,email,unsubscribe_token,last_newsletter_at&status=eq.active',
    )) ?? [];

    // Per-homeowner personalization: the season's tasks are filtered to each
    // home's systems AND life stage. `stage` matters because the catalog holds
    // pre-listing and new-construction tasks that must not go to everyone;
    // homeowner_type is the legacy column older rows still use.
    const profiles = (await supabaseRest<{
      homeowner_id: string;
      systems: HomeSystems;
      stage: string | null;
      homeowner_type: string | null;
    }[]>('GET', 'home_profiles?select=homeowner_id,systems,stage,homeowner_type')) ?? [];
    const systemsByOwner = new Map(profiles.map((p) => [p.homeowner_id, p.systems]));
    const stageByOwner = new Map<string, Stage | null>(
      profiles.map((p) => [p.homeowner_id, (p.stage as Stage | null) ?? stageFromLegacyType(p.homeowner_type)]),
    );

    const eligible = homeowners.filter((h) => !sameMonth(h.last_newsletter_at, now)).slice(0, MAX_PER_RUN);

    // Each member's task state: what they dismissed as irrelevant, what they've
    // already checked off, booked, or snoozed. All of it suppresses the task in
    // their email - nobody should be nudged about a job they finished last week.
    // We fetch EVERY status (not just dismissed) because the seasonal-reset rule
    // lives in resolveMemberTasks and needs `season` + `completed_at` to decide
    // whether a completion is still current or has expired for a new year.
    //
    // Fetched per chunk of this run's recipients to stay under PostgREST's
    // response-row cap and keep the in-list URLs a sane length.
    const rowsByOwner = new Map<string, MaintenanceRow[]>();
    for (let i = 0; i < eligible.length; i += DISMISSED_CHUNK) {
      const ids = eligible.slice(i, i + DISMISSED_CHUNK).map((h) => h.id).join(',');
      const rows = (await supabaseRest<(MaintenanceRow & { homeowner_id: string })[]>(
        'GET',
        `homeowner_maintenance?select=homeowner_id,task_key,season,status,completed_at&homeowner_id=in.(${ids})`,
      )) ?? [];
      for (const r of rows) {
        if (!rowsByOwner.has(r.homeowner_id)) rowsByOwner.set(r.homeowner_id, []);
        rowsByOwner.get(r.homeowner_id)!.push(r);
      }
    }

    let sent = 0;
    let suppressed = 0;
    let emptySkipped = 0;
    const failures: string[] = [];
    if (!dryRun) {
      for (const h of eligible) {
        const { visible, outstanding } = resolveMemberTasks({
          catalog: tasks,
          systems: systemsByOwner.get(h.id) ?? null,
          stage: stageByOwner.get(h.id) ?? null,
          rows: rowsByOwner.get(h.id) ?? [],
          now,
        });
        if (visible.length === 0) {
          // Nothing in the catalog even applies to this home (systems + stage
          // filtered everything out). There is no email to write, so skip and
          // advance last_newsletter_at so the row isn't retried every run.
          emptySkipped += 1;
          await updateHomeowner(h.id, { last_newsletter_at: now.toISOString() }).catch(() => {});
          continue;
        }
        // Everything that applies is already done/booked/snoozed/dismissed.
        // Rather than go silent on our most engaged members, send the short
        // "all caught up" note - it still carries the booking CTA.
        const caughtUp = outstanding.length === 0;
        const personalTasks = caughtUp ? [] : outstanding;
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
          year: now.getUTCFullYear(),
          heroImageUrl: homeCareHeroUrl(origin, now),
          caughtUp,
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
      empty_skipped: emptySkipped,
      failures: failures.length,
      dryRun,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('home-care-newsletter failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
