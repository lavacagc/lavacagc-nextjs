/**
 * La Vaca Home Care — seasonal newsletter (monthly cron).
 *
 * Runs on the 1st of each month. Season-start months (Mar/Jun/Sep/Dec) send the
 * full seasonal checklist; other months send a lighter top-3 "nudge". One email
 * per active homeowner per calendar month (deduped via last_newsletter_at).
 * Tasks a member dismissed ("not relevant to my home"), already checked off,
 * booked or snoozed are filtered out per recipient. A member who has cleared
 * their list by doing the work gets the short "all caught up" note; one whose
 * list emptied without a single completion is skipped for the month (reported
 * as empty_skipped in the response).
 *
 *   ?dryRun=1 — classify every recipient and report what would happen, but
 *   write nothing: no sends, no email_log rows, no last_newsletter_at touches,
 *   no preference-centre rows. The outcome buckets (would_send, of which
 *   caught_up, plus suppressed and empty_skipped) are the point of the flag, so
 *   they are computed on a dry run too - the per-homeowner reads they need
 *   already ran - and they use the same names a live run reports, so the two
 *   reconcile line for line.
 *
 * Auth: Bearer CRON_SECRET (also enforced by middleware on /api/cron/*).
 */
import { NextRequest, NextResponse } from 'next/server';
import { cleanEnv } from '@/lib/envClean';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { updateHomeowner } from '@/lib/homecare/homeowners';
import { currentSeason } from '@/lib/homecare/season';
import { buildNewsletter, homeCareHeroUrl, type NewsletterTask } from '@/lib/homecare/newsletter';
import { catalogCarriesStages, stageFromLegacyType, type HomeSystems, type Stage } from '@/lib/homecare/profile';
import { isCaughtUp, resolveMemberTasks, type MaintenanceRow } from '@/lib/homecare/selection';
import { sendHomeCareNewsletterEmail } from '@/lib/notify/sendHomeCareEmails';
import { getSuppressedEmails, normalizeEmail, preferencesUrlFor } from '@/lib/preferences/preferences';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const SEASON_START_MONTHS = new Set([2, 5, 8, 11]); // Mar, Jun, Sep, Dec (0-indexed)
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MAX_PER_RUN = 400;
/** How many recipients each per-homeowner query covers - keeps responses under PostgREST's row cap. */
const OWNER_CHUNK = 20;
/**
 * Canonical host for anything a mail client fetches, resolved exactly the way
 * the sibling monthly-newsletter cron and the List-Unsubscribe header do. The
 * hero band must not ride on the request origin: invoke this route from a
 * preview deployment and every recipient gets an image URL on a host that may
 * 404 or 403 - and `/email/*` responses carry a one-week Cache-Control, so one
 * bad send freezes that month's hero at the CDN for days. The logo directly
 * above the hero has always been pinned; now both are.
 */
const SITE_URL = cleanEnv(process.env.NEXT_PUBLIC_SITE_URL) || 'https://www.lavacagc.com';

/**
 * The catalog row this cron selects. `stages` is required, not optional: it is
 * what the stage gate reads, and omitting it from the select once already sent
 * "get ready to sell your house" to every member. Declaring it here means the
 * type stops matching the moment the shape stops carrying it.
 */
type CatalogTask = NewsletterTask & { stages: string[] };

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

/**
 * The home_care stream opt-outs a live send would honour, for a dry run to
 * predict. A member can sit at status=eq.active in `homeowners` and still be off
 * the stream (the legacy status sync is best-effort), and sendTrackedEmail skips
 * those rather than sending - so without this a dry run counts them in
 * would_send and the live run then reports them under suppressed.
 *
 * Read-only by construction: getSuppressedEmails is a plain paginated select,
 * unlike the getOrCreateByEmail the sender uses, which writes a row on first
 * touch. Best-effort - null means "could not check", reported as
 * suppression_checked:false rather than passed off as zero opt-outs.
 */
async function homeCareOptOuts(): Promise<Set<string> | null> {
  try {
    const emails = await getSuppressedEmails('home_care');
    return new Set(emails.map(normalizeEmail));
  } catch (err) {
    console.error('home-care-newsletter: home_care opt-out lookup failed:', err instanceof Error ? err.message : err);
    return null;
  }
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
    const tasks = (await supabaseRest<CatalogTask[]>(
      'GET',
      `maintenance_catalog?select=key,title,blurb,bookable,diy_or_pro,priority,applies_to,stages,est_cost_low,est_cost_high&active=eq.true&starter=eq.false&seasons=cs.%7B${season}%7D&order=priority.desc`,
    )) ?? [];

    if (tasks.length === 0) {
      console.error('home-care-newsletter: seasonal catalog returned no tasks');
      return NextResponse.json({ ok: false, error: 'seasonal catalog returned no tasks' }, { status: 500 });
    }

    // The stage gate is only as strong as the column feeding it, and the
    // response above is an unchecked cast. Refuse to send rather than repeat
    // the leak silently - see catalogCarriesStages.
    if (!catalogCarriesStages(tasks)) {
      console.error('home-care-newsletter: catalog select is missing `stages` - the stage gate would not apply');
      return NextResponse.json({ ok: false, error: 'catalog select is missing stages' }, { status: 500 });
    }

    // Who gets mailed, ordered and bounded by Postgres rather than by whatever
    // slice of the table came back. An unordered, unbounded read that hits
    // PostgREST's row cap drops recipients arbitrarily, and because the same
    // members would sort into the same arbitrary tail every run they'd simply
    // never be mailed - a failure that looks exactly like "those people don't
    // want the newsletter". So: longest-waiting first (nobody can be starved
    // twice), and one page is one run's work.
    //
    // NOTE: kept as a single template literal with a flat filter on purpose, and
    // the month predicate deliberately stays on the client. An `or=(...)` clause
    // split across `+`-concatenated segments is what cost this repo a cron once
    // already - see the note in generate-renderings/route.ts - where a Turbopack
    // minifier bug dropped the trailing `))` from the production bundle and
    // PostgREST rejected the logic tree (PGRST100). Here the blast radius would
    // be worse: this runs once a month with no retry, so a mangled query means
    // nobody gets an email and nobody knows to complain.
    const due = (await supabaseRest<HomeownerRow[]>(
      'GET',
      `homeowners?select=id,first_name,email,unsubscribe_token,last_newsletter_at&status=eq.active&order=last_newsletter_at.asc.nullsfirst,id.asc&limit=${MAX_PER_RUN}`,
    )) ?? [];

    // The one-per-calendar-month rule. Nothing is lost by deduping here: anyone
    // already mailed this month carries the newest last_newsletter_at in the
    // table, so they sort behind every member who is actually due, and the page
    // fills with the due ones first.
    const eligible = due.filter((h) => !sameMonth(h.last_newsletter_at, now));
    // Conversely, a page that had no room for even one already-mailed row is a
    // page that may have cut off due members - report it rather than capping
    // silently. They sort first next run, so the backlog drains rather than
    // stranding the same people every month.
    const capped = eligible.length === MAX_PER_RUN;
    if (capped) {
      console.warn(`home-care-newsletter: hit the ${MAX_PER_RUN}-recipient page cap; the rest sort first next run`);
    }

    // Everything per-homeowner, fetched in chunks of this run's recipients so no
    // response can reach PostgREST's row cap and the in-list URLs stay a sane
    // length. Both queries are scoped: an unfiltered table read that silently
    // truncates is indistinguishable from a member having no data, and both of
    // these narrow the email when they come back empty.
    //
    //  - home_profiles: the season's tasks are filtered to each home's systems
    //    AND life stage. `stage` matters because the catalog holds pre-listing
    //    and new-construction tasks that must not go to everyone, and the gate
    //    fails closed - a missing profile row hides them rather than leaking
    //    them, so a truncated read would quietly shrink someone's list.
    //    homeowner_type is the legacy column older rows still use.
    //  - homeowner_maintenance: what they dismissed as irrelevant, checked off,
    //    booked or snoozed. All of it suppresses the task in their email -
    //    nobody should be nudged about a job they finished last week. We fetch
    //    every SUPPRESSING status (not just dismissed) because the seasonal-reset
    //    rule lives in resolveMemberTasks and needs `season` plus a timestamp to
    //    decide whether a row is still current or has expired for a new year.
    //    'todo' rows are excluded: the resolver never reads them, and pulling
    //    them would multiply the response size for nothing.
    const systemsByOwner = new Map<string, HomeSystems>();
    const stageByOwner = new Map<string, Stage | null>();
    const rowsByOwner = new Map<string, MaintenanceRow[]>();
    for (let i = 0; i < eligible.length; i += OWNER_CHUNK) {
      const ids = eligible.slice(i, i + OWNER_CHUNK).map((h) => h.id).join(',');
      const [profiles, rows] = await Promise.all([
        supabaseRest<{
          homeowner_id: string;
          systems: HomeSystems;
          stage: string | null;
          homeowner_type: string | null;
        }[]>('GET', `home_profiles?select=homeowner_id,systems,stage,homeowner_type&homeowner_id=in.(${ids})`),
        supabaseRest<(MaintenanceRow & { homeowner_id: string })[]>(
          'GET',
          `homeowner_maintenance?select=homeowner_id,task_key,season,status,completed_at,updated_at&homeowner_id=in.(${ids})&status=in.(done,booked,snoozed,dismissed)`,
        ),
      ]);
      for (const p of profiles ?? []) {
        systemsByOwner.set(p.homeowner_id, p.systems);
        stageByOwner.set(p.homeowner_id, (p.stage as Stage | null) ?? stageFromLegacyType(p.homeowner_type));
      }
      for (const r of rows ?? []) {
        if (!rowsByOwner.has(r.homeowner_id)) rowsByOwner.set(r.homeowner_id, []);
        rowsByOwner.get(r.homeowner_id)!.push(r);
      }
    }

    let sent = 0;
    let suppressed = 0;
    let emptySkipped = 0;
    let wouldSend = 0;
    let caughtUpCount = 0;
    const failures: string[] = [];
    // A live run learns each recipient's stream opt-out from the sender itself;
    // a dry run has to ask, or it reports as would_send people who would get
    // nothing. One select for the whole list, and only when it is needed.
    const optedOut = dryRun ? await homeCareOptOuts() : null;
    // Classification runs on every invocation, dry or not. It is the whole
    // question a dry run is asked before a send that happens once a month with
    // no retry - "who gets the checklist, who gets the caught-up note, who gets
    // nothing" - and the reads it needs already happened above. Only the writes
    // are gated: sends, email_log rows, the preference-centre lookup (which
    // creates a row) and every last_newsletter_at touch.
    for (const h of eligible) {
      const resolved = resolveMemberTasks({
        catalog: tasks,
        systems: systemsByOwner.get(h.id) ?? null,
        stage: stageByOwner.get(h.id) ?? null,
        rows: rowsByOwner.get(h.id) ?? [],
        season,
        now,
      });
      const { visible, outstanding } = resolved;
      // Everything that applies is already done/booked/snoozed/dismissed.
      // Members who cleared it by doing the work get the short "all caught
      // up" note rather than silence - it still carries the booking CTA.
      // Everyone else with an empty list (nothing applies to their home at
      // all, or they hid it all) has no honest email to write, so skip them
      // and advance last_newsletter_at so the row isn't retried every run.
      const caughtUp = isCaughtUp(resolved);
      if (visible.length === 0 || (outstanding.length === 0 && !caughtUp)) {
        emptySkipped += 1;
        if (!dryRun) await updateHomeowner(h.id, { last_newsletter_at: now.toISOString() }).catch(() => {});
        continue;
      }
      // Checked here rather than before the empty-list branch so the buckets
      // fall in the same order a live run fills them: an opted-out member whose
      // list is empty is counted as empty_skipped there too, because that run
      // never reaches the send.
      if (optedOut?.has(normalizeEmail(h.email))) {
        suppressed += 1;
        continue;
      }
      wouldSend += 1;
      if (caughtUp) caughtUpCount += 1;
      if (dryRun) continue;

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
        heroImageUrl: homeCareHeroUrl(SITE_URL, now),
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

    return NextResponse.json({
      ok: true,
      type: isSeasonal ? 'seasonal' : 'nudge',
      season,
      month: monthLabel,
      tasks: tasks.length,
      due_page: due.length,
      capped,
      eligible: eligible.length,
      // The classification, in the same buckets dry or live:
      // would_send + suppressed + empty_skipped === eligible, and caught_up is
      // the share of would_send that gets the no-task note. `sent` stays 0 on a
      // dry run; `suppressed` is measured by the sender on a live run and
      // predicted from the opt-out list on a dry one.
      would_send: wouldSend,
      caught_up: caughtUpCount,
      empty_skipped: emptySkipped,
      sent,
      suppressed,
      // False only when a dry run could not read the opt-out list, i.e. when
      // would_send may still count members the live send would skip.
      suppression_checked: dryRun ? optedOut !== null : true,
      failures: failures.length,
      dryRun,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('home-care-newsletter failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
