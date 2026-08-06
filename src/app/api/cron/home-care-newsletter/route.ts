/**
 * La Vaca Home Care — seasonal newsletter (monthly cron).
 *
 * Runs on the 1st of each month. Season-start months (Mar/Jun/Sep/Dec) open the
 * season's checklist; other months send a lighter "nudge". Either way the email
 * shows the top three outstanding tasks and teases the remainder as "+N more on
 * your list" - see lib/homecare/newsletter. One email per active homeowner per
 * calendar month (deduped via last_newsletter_at), longest-waiting first and one
 * page of MAX_PER_RUN recipients per run (reported as due_page/capped; anyone
 * past the cap sorts first next run rather than being stranded).
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
 *   the classification runs on both paths and only the mail is conditional. It
 *   is one shared unit - see lib/homecare/newsletterRun - that puts each
 *   recipient in exactly one bucket, so the two runs reconcile line for line
 *   rather than each keeping its own tally of the same people.
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
import {
  classifyRecipient,
  createOutcomeTally,
  reconcileWithSend,
  type RecipientState,
} from '@/lib/homecare/newsletterRun';
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
  /** Null only for a row created before the backfill migration ran. */
  access_token: string | null;
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
 * The home_care stream opt-outs a send would honour. A member can sit at
 * status=eq.active in `homeowners` and still be off the stream (the legacy
 * status sync is best-effort), and sendTrackedEmail skips those rather than
 * sending.
 *
 * Read on every invocation, dry or live, because it is what classifies a
 * recipient: making the check itself conditional on dryRun is what let the same
 * person be counted as would_send by one path and suppressed by the other.
 *
 * Read-only by construction: getSuppressedEmails is a plain paginated select,
 * unlike the getOrCreateByEmail the sender uses, which writes a row on first
 * touch. Best-effort - null means "could not check". A live run still gets the
 * right buckets then (the sender re-checks per recipient); a dry run cannot, so
 * it says so via suppression_checked rather than passing the gap off as zero
 * opt-outs.
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
      // No est_cost columns: the email stopped quoting prices with the checklist
      // (2026-08-06), so asking for them would only mislead the next reader.
      `maintenance_catalog?select=key,title,blurb,bookable,diy_or_pro,priority,applies_to,stages&active=eq.true&starter=eq.false&seasons=cs.%7B${season}%7D&order=priority.desc`,
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
    //
    // `status=eq.active` is also load-bearing beyond double opt-in: booking a
    // service visit creates a lightweight homeowners row as status='pending',
    // source='service_quote' (see lib/homecare/serviceScheduling.ts), and a
    // customer who booked a gutter clean did not opt in to a monthly marketing
    // email. This filter is what STRUCTURALLY excludes them, so widening it to
    // take pending rows would silently enrol every service customer.
    const due = (await supabaseRest<HomeownerRow[]>(
      'GET',
      `homeowners?select=id,first_name,email,unsubscribe_token,access_token,last_newsletter_at&status=eq.active&order=last_newsletter_at.asc.nullsfirst,id.asc&limit=${MAX_PER_RUN}`,
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
    const failures: string[] = [];
    // One classification per recipient, recorded once - see newsletterRun. The
    // counters are not reachable from here, so no branch below can slip a
    // second bucket to the same person the way the send path used to.
    const tally = createOutcomeTally();
    const optedOut = await homeCareOptOuts();
    // The loop runs on every invocation, dry or not. Classification is the whole
    // question a dry run is asked before a send that happens once a month with
    // no retry - "who gets the checklist, who gets the caught-up note, who gets
    // nothing" - and the reads it needs already happened above. Only the mail is
    // gated: sends, email_log rows, the preference-centre lookup (which creates
    // a row) and every last_newsletter_at touch.
    for (const h of eligible) {
      const resolved = resolveMemberTasks({
        catalog: tasks,
        systems: systemsByOwner.get(h.id) ?? null,
        stage: stageByOwner.get(h.id) ?? null,
        rows: rowsByOwner.get(h.id) ?? [],
        season,
        now,
      });
      const state: RecipientState = {
        visible: resolved.visible.length,
        outstanding: resolved.outstanding.length,
        // Cleared the list by doing the work, so they get the short "all caught
        // up" note rather than silence - it still carries the booking CTA.
        caughtUp: isCaughtUp(resolved),
        optedOut: optedOut?.has(normalizeEmail(h.email)) ?? false,
      };
      let outcome = classifyRecipient(state);

      if (!dryRun) {
        // empty_skipped closes the month out with no mail - there is nothing
        // honest to write. Everyone else goes to the sender, INCLUDING a
        // recipient the opt-out snapshot already flagged: it refuses the send
        // itself and writes the email_log row that is the only per-recipient
        // evidence we honored the unsubscribe. Short-circuiting it here left
        // last_newsletter_at advanced and no trace at all, so an honored
        // opt-out looked exactly like a member the run never reached.
        // Sending closes the month out too; a failed send deliberately does
        // not, so the member stays due and retries next run.
        let closeOut = outcome === 'empty_skipped';
        if (outcome !== 'empty_skipped') {
          // Per-recipient preference-center link (best-effort — fall back to the
          // legacy unsubscribe link alone if the lookup fails).
          const preferencesUrl = await preferencesUrlFor(origin, h.email).catch(() => undefined);
          const { subject, html, text } = buildNewsletter({
            firstName: h.first_name,
            season,
            tasks: state.caughtUp ? [] : resolved.outstanding,
            isSeasonal,
            baseUrl: origin,
            // Without this every checklist link in a MONTHLY email lands on the
            // signup page for anyone whose 30-day portal cookie has lapsed -
            // which, at a monthly cadence, is much of the list by definition.
            accessToken: h.access_token,
            unsubscribeUrl: `${origin}/api/home-care/unsubscribe?token=${encodeURIComponent(h.unsubscribe_token)}`,
            preferencesUrl,
            monthLabel,
            year: now.getUTCFullYear(),
            heroImageUrl: homeCareHeroUrl(SITE_URL, now),
            caughtUp: state.caughtUp,
          });
          const res = await sendHomeCareNewsletterEmail({
            to: h.email,
            subject,
            html,
            text,
            homeownerId: h.id,
            // What the snapshot already decided. The sender refuses the send on
            // this alone rather than re-reading the preference, whose lookup
            // fails OPEN - so a DB hiccup cannot turn a known opt-out into a
            // delivered email - and logs the suppression either way.
            knownSuppressed: outcome === 'suppressed',
          });
          // A preference opt-out the snapshot above missed is an intentional
          // suppression, not a failure. It MOVES this recipient's bucket rather
          // than adding one, so the totals still come to `eligible`.
          outcome = reconcileWithSend(outcome, res);
          if (res.status === 'sent') {
            sent += 1;
            closeOut = true;
          } else if (outcome === 'suppressed') {
            closeOut = true;
          } else {
            failures.push(`${h.email}:${res.status}`);
          }
        }
        if (closeOut) await updateHomeowner(h.id, { last_newsletter_at: now.toISOString() }).catch(() => {});
      }

      tally.record(outcome, state);
    }
    const buckets = tally.counts();

    return NextResponse.json({
      ok: true,
      type: isSeasonal ? 'seasonal' : 'nudge',
      season,
      month: monthLabel,
      tasks: tasks.length,
      due_page: due.length,
      capped,
      eligible: eligible.length,
      // The classification, in the same buckets dry or live, each recipient in
      // exactly one of them: would_send + suppressed + empty_skipped ===
      // eligible, and caught_up is the share of would_send that gets the
      // no-task note. Only `sent` separates the two runs - it stays 0 on a dry
      // one, where the mail is what is skipped, not the counting.
      would_send: buckets.would_send,
      caught_up: buckets.caught_up,
      empty_skipped: buckets.empty_skipped,
      sent,
      suppressed: buckets.suppressed,
      // False only when a dry run could not read the opt-out list, i.e. when
      // would_send may still count members the live send would skip. A live run
      // is never in doubt: the sender re-checks every recipient it is handed.
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
