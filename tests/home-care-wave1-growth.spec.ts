import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import http from 'http';
import { createHmac } from 'crypto';
import { currentSeason, nextSeason, seasonStart, SEASON_LABEL } from '@/lib/homecare/season';
import { buildNewsletter, homeCareHeroUrl, type NewsletterTask } from '@/lib/homecare/newsletter';
import { catalogCarriesStages } from '@/lib/homecare/profile';

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const EVIDENCE_DIR = process.env.HC_EVIDENCE_DIR || join(root, 'test-results', 'hc-wave1-growth');
const SHARE_URL = 'https://www.lavacagc.com/home-care?utm_source=member_share&utm_medium=portal&utm_campaign=home_care_share';
const SHARE_TEXT = 'I use this free seasonal checklist to stay on top of the house — takes 20 seconds to set up, no account.';
const SHARE_PAYLOAD = `${SHARE_TEXT} ${SHARE_URL}`;

// ---------------------------------------------------------------------------
// File-level guards (run everywhere, no server needed) — Wave 1 wiring.
// ---------------------------------------------------------------------------

test('migration 20260803 adds dismissed to the homeowner_maintenance status CHECK', () => {
  const sql = read('supabase/migrations/20260803000000_dismissed_task_status.sql');
  expect(sql).toContain("CHECK (status IN ('todo', 'done', 'snoozed', 'booked', 'dismissed'))");
  // Idempotent for the by-hand prod apply followed by db push.
  expect(sql).toContain('DROP CONSTRAINT IF EXISTS homeowner_maintenance_status_check');
});

test('newsletter cron selects the stage column the stage gate depends on', () => {
  const src = read('src/app/api/cron/home-care-newsletter/route.ts');
  // The bug this guards: `stages` was dropped from this select, filterTasksForProfile
  // saw undefined for every task, and the two highest-priority pre-listing jobs went
  // out as items 01 and 02 to every member. The column is asserted verbatim here, the
  // row type requires it, and the route refuses to send if the response lacks the key.
  expect(src).toContain('select=key,title,blurb,bookable,diy_or_pro,priority,applies_to,stages,est_cost_low,est_cost_high');
  expect(src).toContain('type CatalogTask = NewsletterTask & { stages: string[] }');
  expect(src).toContain('supabaseRest<CatalogTask[]>');
  expect(src).toContain('if (!catalogCarriesStages(tasks))');
});

test('checklist page carries the same stage-select guard as the cron', () => {
  // The page reads the same catalog through the same unchecked cast, so it has
  // the same exposure: drop `stages` from its select and every pre-listing task
  // renders for every member, silently. Guarded by the same predicate, and the
  // column is pinned here so the regression fails in CI rather than in prod.
  const src = read('src/app/home-care/checklist/page.tsx');
  expect(src).toContain('select=key,title,blurb,applies_to,stages,seasons');
  expect(src).toContain('stages: string[]');
  expect(src).toContain('if (!catalogCarriesStages(allTasks ?? []))');
});

test('the stage guard is one predicate, not a copy per surface', () => {
  const src = read('src/lib/homecare/profile.ts');
  expect(src).toContain('export function catalogCarriesStages');
  // Present but empty is not a leak - each caller handles "no tasks" itself.
  expect(catalogCarriesStages([])).toBe(true);
  expect(catalogCarriesStages([{ stages: ['all'] }])).toBe(true);
  expect(catalogCarriesStages([{} as { stages?: string[] }])).toBe(false);
});

test('newsletter cron filters task state per homeowner, chunk-scoped to eligible recipients', () => {
  const src = read('src/app/api/cron/home-care-newsletter/route.ts');
  // Still chunk-scoped to this run's recipients (PostgREST row cap / URL length).
  // Both per-homeowner reads are scoped: an unbounded home_profiles read that hit
  // the row cap would silently null out stage for everyone past it.
  expect(src).toContain('home_profiles?select=homeowner_id,systems,stage,homeowner_type&homeowner_id=in.(${ids})');
  expect(src).toContain('&homeowner_id=in.(${ids})&status=in.(done,booked,snoozed,dismissed)');
  // The fetch is no longer dismissed-only: the seasonal-reset rule needs season
  // + a timestamp to tell a live row from one that expired this year. It is
  // still scoped to the statuses the resolver reads, so 'todo' rows (the bulk
  // of the table) never come back and can't push the response past the row cap.
  expect(src).toContain('select=homeowner_id,task_key,season,status,completed_at,updated_at');
  expect(src).toContain('&status=in.(done,booked,snoozed,dismissed)');
  // Suppression + the stage gate now live in the shared resolver that the
  // checklist page also uses - see tests/home-care-selection.spec.ts. It is
  // given the season being built so a completion from another season can't
  // suppress a multi-season task here.
  expect(src).toContain('resolveMemberTasks');
  expect(src).toContain('stage: stageByOwner.get(h.id)');
  expect(src).toMatch(/season,\s*\n\s*now,/);
  // Members for whom nothing in the catalog applies are skipped and not
  // re-attempted this month, as are members whose list emptied without a single
  // completion. Only members who did the work get the caught-up note.
  expect(src).toContain('empty_skipped');
  expect(src).toMatch(/caughtUp: isCaughtUp\(resolved\)/);
  // The empty-list rule itself lives in the shared classifier, so a dry run and
  // a live run cannot answer it differently - see tests/home-care-newsletter-run.
  expect(read('src/lib/homecare/newsletterRun.ts'))
    .toMatch(/state\.visible === 0 \|\| \(state\.outstanding === 0 && !state\.caughtUp\)/);
});

test('newsletter recipients are deduped, ordered and bounded by the database', () => {
  const src = read('src/app/api/cron/home-care-newsletter/route.ts');
  // The failure this guards is silent: an unordered, unbounded read that hits
  // PostgREST's row cap drops recipients arbitrarily, and the same members sort
  // into the same arbitrary tail every month - indistinguishable from "those
  // people never signed up". Ordering longest-waiting first makes starvation
  // self-correcting; the bound keeps one run's work to one run.
  expect(src).toContain('&order=last_newsletter_at.asc.nullsfirst,id.asc&limit=${MAX_PER_RUN}');
  // Dedup is client-side by design (see the minifier guard below). It rides on
  // that ordering: already-mailed rows carry the newest last_newsletter_at, so
  // they sort behind every due member and can't push one off the page.
  expect(src).toContain('due.filter((h) => !sameMonth(h.last_newsletter_at, now))');
  expect(src).toMatch(/d\.getUTCFullYear\(\) === now\.getUTCFullYear\(\) && d\.getUTCMonth\(\) === now\.getUTCMonth\(\)/);
  // No silent caps - a truncated page is reported in the response and the log.
  // Measured on `eligible`: room left for an already-mailed row proves no due
  // member was cut off, whereas a page of 400 due rows may have more behind it.
  expect(src).toContain('const capped = eligible.length === MAX_PER_RUN');
  expect(src).toContain('capped,');
});

test('the newsletter recipient query cannot be mangled by the minifier', () => {
  // This repo has already lost a cron to exactly one construction: a PostgREST
  // `or=(...)` logic tree built from `+`-concatenated template segments, where
  // a Turbopack minifier bug dropped the trailing `))` from the production
  // bundle and PostgREST answered PGRST100 (see tests/renderings-cron.spec.ts
  // and generate-renderings/route.ts). The newsletter is the worse place for it
  // to come back: it runs `0 14 1 * *` with no retry, so a malformed query
  // means every member silently misses the month with nobody to complain.
  const src = read('src/app/api/cron/home-care-newsletter/route.ts');
  const call = src.match(/supabaseRest<HomeownerRow\[\]>\(\s*'GET',\s*([\s\S]*?)\)\) \?\? \[\]/);
  expect(call, 'expected the homeowners GET call to be present').toBeTruthy();
  const queryArg = call![1];
  // One unbroken backtick literal - no `+` splice for the minifier to truncate.
  expect(queryArg).not.toContain('` +');
  expect(queryArg).not.toContain('+ `');
  // And no logic tree at all: `status=eq.active` plus an order/limit is flat,
  // so there are no parens left to lose.
  expect(queryArg).not.toContain('or=(');
  expect(queryArg).toContain('status=eq.active');
  // Whatever the query is, its parens balance.
  expect(queryArg.split('(').length).toBe(queryArg.split(')').length);
});

test('a dry run classifies every recipient and writes nothing', () => {
  // ?dryRun=1 exists to answer "who gets the checklist, who gets the caught-up
  // note, who gets nothing" BEFORE a send that fires once a month with no
  // retry. Classification used to sit inside `if (!dryRun)`, so a dry run
  // always answered "0 and 0" - the reads were paid for and thrown away.
  const src = read('src/app/api/cron/home-care-newsletter/route.ts');
  const at = (needle: string) => src.indexOf(needle);

  // The loop is not wrapped in a dry-run guard any more...
  expect(src).not.toMatch(/if \(!dryRun\) \{\s*\n\s*for \(const h of eligible\)/);
  // ...and the outcome is reported either way, out of the one tally.
  expect(src).toContain('would_send: buckets.would_send');
  expect(src).toContain('caught_up: buckets.caught_up');
  expect(src).toContain('empty_skipped: buckets.empty_skipped');
  expect(src).toContain('suppressed: buckets.suppressed');

  // Every write sits inside the one `if (!dryRun)` block: the mail, the audit
  // row it writes, the preference-centre lookup (which creates a row as a side
  // effect) and every last_newsletter_at touch. Classification and the tally
  // sit outside it.
  //
  // Anchored on the guard itself, not on its indentation: pinning the six
  // leading spaces made this assertion track the block's NESTING DEPTH, so
  // hoisting the loop body into a helper would return -1 and the ordering
  // checks below would then pass vacuously against a bogus anchor. Requiring
  // exactly one occurrence also pins that there is a single block, which is
  // what "every write is inside it" depends on.
  const guards = [...src.matchAll(/if \(!dryRun\) \{/g)];
  expect(guards, 'expected a single !dryRun block around the send half').toHaveLength(1);
  const guard = guards[0].index!;
  expect(at('await preferencesUrlFor(')).toBeGreaterThan(guard);
  expect(at('await sendHomeCareNewsletterEmail(')).toBeGreaterThan(guard);
  for (const m of src.matchAll(/updateHomeowner\(/g)) {
    expect(m.index!, `updateHomeowner outside the !dryRun block`).toBeGreaterThan(guard);
  }
  // The tally is recorded after the guard closes, so both paths reach it.
  expect(at('tally.record(outcome, state);')).toBeGreaterThan(guard);
});

test('a dry run predicts the stream opt-outs the live send would honour', () => {
  // would_send used to count every classified recipient, but the send applies
  // one more filter: sendTrackedEmail skips anyone with pref.home_care ===
  // false. That is a real state rather than a corner case - a member can sit at
  // status=eq.active in `homeowners` and still be off the stream, which is why
  // the suppressed bucket exists at all. So a dry run reported as "would send"
  // the very people a live run reports as suppressed, at exactly the moment the
  // number is used to sanity-check a one-shot monthly send.
  const src = read('src/app/api/cron/home-care-newsletter/route.ts');
  const at = (needle: string) => src.indexOf(needle);

  // Consulted on BOTH paths, through the read-only select. Making the check
  // itself conditional on dryRun is what let one person land in two buckets.
  expect(src).toContain('const optedOut = await homeCareOptOuts();');
  expect(src).not.toContain('dryRun ? await homeCareOptOuts()');
  const helper = src.slice(at('async function homeCareOptOuts'), at('export async function GET'));
  expect(helper).toContain("await getSuppressedEmails('home_care')");
  // ...never through the sender's lookup, which writes a row on first touch.
  expect(src).not.toMatch(/getOrCreateByEmail\(/);
  // A failed lookup is reported as such, not passed off as zero opt-outs.
  expect(helper).toMatch(/catch[\s\S]*return null;/);
  expect(src).toContain('suppression_checked: dryRun ? optedOut !== null : true');

  // The opt-out feeds the shared classifier as one more field of the
  // recipient's state, rather than being a branch that increments a counter.
  expect(src).toContain('optedOut: optedOut?.has(normalizeEmail(h.email)) ?? false,');
  expect(src).toContain('let outcome = classifyRecipient(state);');
});

test('the outcome buckets are single-sourced - no counter is incremented outside the tally', () => {
  // The regression this pins: `optedOut` was consulted only on a dry run, so a
  // live run did `wouldSend += 1` for a recipient the sender then counted under
  // `suppressed` - one person, two buckets, and a total that overshot
  // `eligible`. Identical data reported would_send=2 dry and would_send=3 live.
  const src = read('src/app/api/cron/home-care-newsletter/route.ts');
  // No ad-hoc bucket counters left in the route at all.
  expect(src).not.toMatch(/(wouldSend|suppressed|emptySkipped|caughtUpCount)\s*(\+=|--|\+\+)/);
  expect(src).not.toMatch(/let (wouldSend|suppressed|emptySkipped|caughtUpCount)/);
  // Exactly one record() call, reached by both paths.
  expect(src.match(/tally\.record\(/g)).toHaveLength(1);
  // A live-only opt-out moves the bucket instead of adding one.
  expect(src).toContain('outcome = reconcileWithSend(outcome, res);');
});

test('a suppressed recipient still goes through the sender, so the opt-out is audited', () => {
  // Single-sourcing the buckets had a side effect: once the snapshot
  // classified somebody as suppressed, the route stopped calling the sender for
  // them - and the sender is what writes the email_log row for an honoured
  // unsubscribe. last_newsletter_at was still advanced, so the member's row
  // looked exactly like one that was mailed and /vaca-mgmt/emails lost every
  // suppression record for the stream. For mail governed by an unsubscribe,
  // that row is the compliance evidence.
  const src = read('src/app/api/cron/home-care-newsletter/route.ts');
  const sendEmail = read('src/lib/notify/sendEmail.ts');
  const sendHomeCare = read('src/lib/notify/sendHomeCareEmails.ts');

  // Only an empty list skips the sender now; suppressed goes through it...
  expect(src).toContain("let closeOut = outcome === 'empty_skipped';");
  expect(src).toContain("if (outcome !== 'empty_skipped') {");
  expect(src).not.toMatch(/if \(outcome === 'would_send'\) \{/);
  // ...carrying the snapshot's verdict, so the send is refused inside the
  // sender (which logs it) rather than at the call site (which cannot).
  expect(src).toContain("knownSuppressed: outcome === 'suppressed',");
  expect(sendHomeCare).toContain('knownSuppressed?: boolean');
  expect(sendHomeCare).toContain("'home_care', args.knownSuppressed)");

  // Both ways of learning about an opt-out end in one suppression path, so the
  // row's shape cannot drift between them.
  expect(sendEmail).toContain('if (input.knownSuppressed) return suppress(input, toList, ccList);');
  expect(sendEmail).toContain('if (pref[input.preferenceStream] === false) return suppress(input, toList, ccList);');
  const suppressFn = sendEmail.slice(
    sendEmail.indexOf('async function suppress('),
    sendEmail.indexOf('export async function sendTrackedEmail'),
  );
  expect(suppressFn, 'expected a single suppress() helper above sendTrackedEmail').toContain("reason: 'unsubscribed'");
  expect(suppressFn).toContain('await writeEmailLog(input, toList, ccList, result)');
  // The known opt-out is refused BEFORE the preference lookup, which fails open
  // - a DB hiccup there must not turn an unsubscribe into a delivered email -
  // and outside the stream guard, so it cannot be skipped for want of a stream.
  expect(sendEmail.indexOf('if (input.knownSuppressed)')).toBeLessThan(sendEmail.indexOf('await getOrCreateByEmail('));
  expect(sendEmail.indexOf('if (input.knownSuppressed)'))
    .toBeLessThan(sendEmail.search(/if \(input\.preferenceStream && toList\[0\]\)/));
  // And the two travel together in the type: a suppression is a verdict about a
  // stream, so there is no shape that carries one without naming the other.
  expect(sendEmail).toMatch(/preferenceStream: SuppressionKey;[\s\S]{0,700}knownSuppressed\?: boolean;/);
  expect(sendEmail).toContain('{ preferenceStream?: never; knownSuppressed?: never }');
});

test('the newsletter hero is pinned to the production host, like the logo above it', () => {
  // The hero used to be built from request.nextUrl.origin while the logo
  // directly above it was absolute, so the two biggest images in one email
  // resolved differently. Invoked from a preview origin that means a broken
  // hero - and /email/* carries a one-week Cache-Control, so a single bad send
  // freezes the 404 at the CDN for days.
  const src = read('src/app/api/cron/home-care-newsletter/route.ts');
  expect(src).toContain("const SITE_URL = cleanEnv(process.env.NEXT_PUBLIC_SITE_URL) || 'https://www.lavacagc.com'");
  expect(src).toContain('homeCareHeroUrl(SITE_URL, now)');
  expect(src).not.toContain('homeCareHeroUrl(origin');
  // Resolved the same way as the sibling cron and the List-Unsubscribe header.
  expect(read('src/app/api/cron/monthly-newsletter/route.ts'))
    .toContain("cleanEnv(process.env.NEXT_PUBLIC_SITE_URL) || 'https://www.lavacagc.com'");
  // The builder keeps taking a base so tests and local previews can still point
  // it at localhost - only the cron stopped passing the request origin.
  expect(homeCareHeroUrl('http://localhost:3000', new Date(Date.UTC(2026, 7, 1))))
    .toBe('http://localhost:3000/email/home-care/hero-08.jpg');
});

test('welcome email carries the forward-to-a-friend line with email UTM tags', () => {
  const src = read('src/lib/notify/sendHomeCareEmails.ts');
  expect(src).toContain('utm_source=member_share&utm_medium=email&utm_campaign=home_care_share');
  expect(src).toContain("Know someone who'd want this? They can get their own free plan: https://www.lavacagc.com/home-care");
});

test('wave-1 portal UI uses lucide icons only — no emoji', () => {
  const src = read('src/components/homecare/HomeCareChecklistClient.tsx');
  expect(src).not.toMatch(/\p{Extended_Pictographic}/u);
  for (const icon of ['EyeOff', 'RotateCcw', 'PartyPopper', 'Share2']) expect(src).toContain(icon);
});

// ---------------------------------------------------------------------------
// Seasonal newsletter share line (buildNewsletter is pure) + rendered evidence.
// ---------------------------------------------------------------------------

const NL_TASKS: NewsletterTask[] = [
  { key: 'test_smoke_co', title: 'Test smoke & CO detectors', blurb: 'Press test on every alarm.', bookable: false, diy_or_pro: 'diy', priority: 10, applies_to: ['all'] },
  { key: 'replace_hvac_filter', title: 'Replace the HVAC filter', blurb: 'A fresh filter protects the system.', bookable: false, diy_or_pro: 'diy', priority: 8, applies_to: ['all'] },
  { key: 'clean_dryer_vent', title: 'Clean the dryer vent', blurb: 'Lint buildup is a top home-fire cause.', bookable: true, diy_or_pro: 'pro', priority: 7, applies_to: ['all'] },
];

test('seasonal newsletter HTML + text carry the forward-to-a-friend line with email UTM tags', async ({ page }) => {
  const n = buildNewsletter({
    firstName: 'Dana', season: currentSeason(), tasks: NL_TASKS, isSeasonal: true,
    baseUrl: 'https://www.lavacagc.com', unsubscribeUrl: 'https://www.lavacagc.com/api/home-care/unsubscribe?token=abc',
  });
  expect(n.html).toContain('Forward this email');
  expect(n.html).toContain('utm_source=member_share&amp;utm_medium=email&amp;utm_campaign=home_care_share');
  expect(n.text).toContain("Know someone who'd want this? They can get their own free plan: https://www.lavacagc.com/home-care");
  expect(n.html).not.toMatch(/\p{Extended_Pictographic}/u);

  // Reviewer-visible evidence: the rendered email with the share line.
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(join(EVIDENCE_DIR, 'newsletter-share-line.html'), n.html);
  // The brand logo is absolute on the production host by design (a mail client
  // fetches it itself). Serve it from this checkout so the capture shows what a
  // recipient sees: the live site's bot filter 403s an automated browser, which
  // would leave a broken image in the middle of the evidence screenshot.
  await page.route('https://www.lavacagc.com/**', (route) =>
    route.fulfill({ path: join(root, 'public', new URL(route.request().url()).pathname) }),
  );
  await page.setViewportSize({ width: 700, height: 1200 });
  await page.setContent(n.html, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Forward this email')).toBeVisible();
  await page.screenshot({ path: join(EVIDENCE_DIR, '09-newsletter-forward-line.png'), fullPage: true });
});

// ---------------------------------------------------------------------------
// Live portal E2E — real server + stubbed Supabase REST (summer-catchup recipe):
//
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9413 \
//   SUPABASE_SECRET_KEY=sb-stub-secret \
//   LISTINGS_ACCESS_SECRET=hc-e2e-secret \
//   npx next dev -p 3100
//
//   HC_PORTAL_E2E=1 TEST_URL=http://127.0.0.1:3100 \
//   npx playwright test tests/home-care-wave1-growth.spec.ts --project=chromium
// ---------------------------------------------------------------------------

const RUN_PORTAL_E2E = process.env.HC_PORTAL_E2E === '1';
const STUB_PORT = Number(process.env.HC_E2E_STUB_PORT || 9413);
const ACCESS_SECRET = process.env.HC_E2E_ACCESS_SECRET || 'hc-e2e-secret';
const BASE = process.env.TEST_URL || 'http://localhost:3000';

const SEASON_NOW = currentSeason();
const LABEL_NOW = SEASON_LABEL[SEASON_NOW];
const LABEL_NEXT = SEASON_LABEL[nextSeason(SEASON_NOW)];

const MEMBER_ID = 'cccccccc-3333-4333-8333-333333333333';
const DISMISS_KEY = 'water_softener_service';
const DISMISS_TITLE = 'Service the water softener';

interface CatalogRow {
  key: string; title: string; blurb: string; applies_to: string[]; stages: string[];
  seasons: string[]; frequency: string; diy_or_pro: string; bookable: boolean;
  est_cost_low: number | null; est_cost_high: number | null; priority: number; starter: boolean;
}

// Four year-round tasks so every season tab shows the same list — makes the
// "dismissed disappears from every tab" claim directly observable.
const ALL_SEASONS = ['spring', 'summer', 'fall', 'winter'];
const CATALOG: CatalogRow[] = [
  { key: 'test_smoke_co', title: 'Test smoke & CO detectors', blurb: 'Press test on every alarm and swap batteries.', applies_to: ['all'], stages: ['all'], seasons: ALL_SEASONS, frequency: 'quarterly', diy_or_pro: 'diy', bookable: false, est_cost_low: null, est_cost_high: null, priority: 10, starter: false },
  { key: 'replace_hvac_filter', title: 'Replace the HVAC filter', blurb: 'A fresh filter every few months protects the system.', applies_to: ['all'], stages: ['all'], seasons: ALL_SEASONS, frequency: 'quarterly', diy_or_pro: 'diy', bookable: false, est_cost_low: null, est_cost_high: null, priority: 8, starter: false },
  { key: 'clean_dryer_vent', title: 'Clean the dryer vent', blurb: 'Lint buildup is a top home-fire cause.', applies_to: ['all'], stages: ['all'], seasons: ALL_SEASONS, frequency: 'annual', diy_or_pro: 'pro', bookable: true, est_cost_low: 100, est_cost_high: 200, priority: 7, starter: false },
  { key: DISMISS_KEY, title: DISMISS_TITLE, blurb: 'Top up salt and run a clean cycle.', applies_to: ['all'], stages: ['all'], seasons: ALL_SEASONS, frequency: 'annual', diy_or_pro: 'pro', bookable: true, est_cost_low: 150, est_cost_high: 300, priority: 5, starter: false },
];

test.describe('Home Care Wave 1: dismiss, progress + celebration, share (live UI)', () => {
  test.skip(!RUN_PORTAL_E2E, 'Needs the stub-backed portal server — see the run recipe in this spec.');
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  // Joined mid-season → no catch-up card in the way of Wave-1 screenshots.
  const HOMEOWNER = {
    id: MEMBER_ID, email: 'dana@example.com', first_name: 'Dana', phone: null, zip: '07901',
    home_type: 'single_family', status: 'active', verify_token: null, verify_token_expires_at: null,
    unsubscribe_token: 'tok-wave1', verified_at: new Date().toISOString(), unsubscribed_at: null,
    source: 'home_care', created_at: new Date(seasonStart().getTime() + 24 * 3600 * 1000).toISOString(),
    updated_at: null,
  };

  // (task_key|season) -> status, exactly like the homeowner_maintenance upsert key.
  const maintStore = new Map<string, string>();
  const maintWrites: Array<{ task_key: string; season: string; status: string }> = [];
  let stub: http.Server;

  test.beforeAll(async () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    stub = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${STUB_PORT}`);
      const json = (status: number, body: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        if (url.pathname === '/rest/v1/maintenance_catalog') return json(200, CATALOG);
        if (url.pathname === '/rest/v1/homeowners') {
          if (req.method === 'PATCH') return json(204, undefined); // last_seen_at touch
          return json(200, [HOMEOWNER]);
        }
        if (url.pathname === '/rest/v1/home_profiles') {
          return json(200, [{ systems: { hvac: true }, stage: 'established', homeowner_type: null }]);
        }
        if (url.pathname === '/rest/v1/homeowner_maintenance') {
          if (req.method === 'POST') {
            try {
              const b = JSON.parse(raw) as { task_key: string; season: string; status: string };
              maintStore.set(`${b.task_key}|${b.season}`, b.status);
              maintWrites.push({ task_key: b.task_key, season: b.season, status: b.status });
            } catch { /* ignore malformed */ }
            res.writeHead(201).end();
            return;
          }
          // Page query: select task_key,season,status ... status=in.(done,dismissed)
          const rows = [...maintStore.entries()]
            .filter(([, status]) => status === 'done' || status === 'dismissed')
            .map(([k, status]) => {
              const [task_key, season] = k.split('|');
              return { task_key, season, status };
            });
          return json(200, rows);
        }
        json(404, { message: `stub: unhandled ${req.method} ${url.pathname}` });
      });
    });
    await new Promise<void>((resolve, reject) => {
      stub.once('error', reject);
      stub.listen(STUB_PORT, '127.0.0.1', resolve);
    });
  });

  test.afterAll(async () => {
    if (stub) await new Promise((resolve) => stub.close(resolve));
  });

  // Mint an hc_access cookie exactly the way accessCookie.ts signs it.
  const b64url = (b: Buffer) => b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  function mintCookie(homeownerId: string): string {
    const payload = b64url(Buffer.from(`${homeownerId}.${Math.floor(Date.now() / 1000)}`));
    const sig = b64url(createHmac('sha256', ACCESS_SECRET).update(payload).digest());
    return `${payload}.${sig}`;
  }

  async function openChecklist(page: Page) {
    await page.context().addCookies([{ name: 'hc_access', value: mintCookie(MEMBER_ID), url: BASE }]);
    await page.goto('/home-care/checklist', { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await expect(page).toHaveURL(/home-care\/checklist/); // no bounce to /home-care means the cookie verified
    await expect(page.getByText('Welcome back, Dana')).toBeVisible();
  }

  async function shot(page: Page, name: string) {
    await page.evaluate(() => document.querySelector('nextjs-portal')?.remove()); // dev-only badge
    await page.screenshot({ path: join(EVIDENCE_DIR, name), fullPage: true });
  }

  const noEmoji = async (page: Page) => {
    const text = (await page.locator('main').innerText()) ?? '';
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  };

  const progressLabel = (page: Page) => page.getByText(new RegExp(`${LABEL_NOW} · \\d+ of \\d+ done`));
  const taskRow = (page: Page, title: string) =>
    page.locator('div.rounded-xl', { has: page.getByRole('heading', { name: title, exact: true }) });

  test('G1: seasonal progress bar renders with count, %, and progressbar role', async ({ page }) => {
    await openChecklist(page);
    await expect(progressLabel(page)).toHaveText(`${LABEL_NOW} · 0 of 4 done`);
    const bar = page.getByRole('progressbar', { name: `${LABEL_NOW} progress` });
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute('aria-valuenow', '0');
    await expect(page.getByText('4 to go — progress is saved.')).toBeVisible();
    await noEmoji(page);
    await shot(page, '01-progress-bar-0-of-4.png');
  });

  test('D1: dismissing a task hides it on every tab, drops the denominator, and persists', async ({ page }) => {
    await openChecklist(page);
    await taskRow(page, DISMISS_TITLE).getByRole('button', { name: 'Not relevant' }).click();

    // Gone from the list, out of the denominator, into the Hidden strip.
    await expect(page.getByRole('heading', { name: DISMISS_TITLE, exact: true })).toHaveCount(0);
    await expect(progressLabel(page)).toHaveText(`${LABEL_NOW} · 0 of 3 done`);
    const hidden = page.locator('details', { hasText: 'marked not relevant to your home' });
    await expect(hidden.locator('summary')).toContainText('Hidden (1)');
    await shot(page, '02-dismissed-hidden-strip.png');

    // The API wrote one season='all' marker row with status='dismissed'.
    expect(maintWrites).toContainEqual({ task_key: DISMISS_KEY, season: 'all', status: 'dismissed' });

    // Hidden on other season tabs too.
    await page.getByRole('button', { name: LABEL_NEXT, exact: true }).click();
    await expect(page.getByRole('heading', { name: DISMISS_TITLE, exact: true })).toHaveCount(0);
    await expect(hidden.locator('summary')).toContainText('Hidden (1)');

    // Persists across a full reload (served back from the store, not local state).
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Welcome back, Dana')).toBeVisible();
    await expect(page.getByRole('heading', { name: DISMISS_TITLE, exact: true })).toHaveCount(0);
    await expect(progressLabel(page)).toHaveText(`${LABEL_NOW} · 0 of 3 done`);
    await expect(hidden.locator('summary')).toContainText('Hidden (1)');
    await shot(page, '03-dismissal-persists-after-reload.png');
  });

  test('D1: one-tap Restore brings the task back into the list and denominator', async ({ page }) => {
    await openChecklist(page);
    const hidden = page.locator('details', { hasText: 'marked not relevant to your home' });
    await hidden.locator('summary').click();
    await expect(hidden.getByText(DISMISS_TITLE)).toBeVisible();
    await hidden.getByRole('button', { name: 'Restore' }).click();

    await expect(page.getByRole('heading', { name: DISMISS_TITLE, exact: true })).toBeVisible();
    await expect(progressLabel(page)).toHaveText(`${LABEL_NOW} · 0 of 4 done`);
    await expect(page.locator('details', { hasText: 'marked not relevant to your home' })).toHaveCount(0);
    expect(maintWrites).toContainEqual({ task_key: DISMISS_KEY, season: 'all', status: 'todo' });
    await shot(page, '04-restored-from-hidden.png');
  });

  test('G1+S1: 100% completion shows the celebration card and share copies the UTM link', async ({ page }) => {
    await openChecklist(page);

    // Halfway: bar and copy track live progress.
    for (const t of CATALOG.slice(0, 2)) {
      await taskRow(page, t.title).getByRole('button', { name: 'Mark done' }).click();
      await expect(taskRow(page, t.title).getByRole('button', { name: 'Mark not done' })).toBeVisible();
    }
    await expect(progressLabel(page)).toHaveText(`${LABEL_NOW} · 2 of 4 done`);
    await expect(page.getByText('50%', { exact: true })).toBeVisible();
    await shot(page, '05-progress-bar-50-percent.png');

    // The final check-off completes the plan, which minimizes the list into
    // the summary strip — that last row's "Mark not done" state never becomes
    // visible, so assert the strip instead.
    for (const t of CATALOG.slice(2, -1)) {
      await taskRow(page, t.title).getByRole('button', { name: 'Mark done' }).click();
      await expect(taskRow(page, t.title).getByRole('button', { name: 'Mark not done' })).toBeVisible();
    }
    await taskRow(page, CATALOG[CATALOG.length - 1].title).getByRole('button', { name: 'Mark done' }).click();
    await expect(page.getByText(`All ${CATALOG.length} tasks handled — nothing left to do right now.`)).toBeVisible();
    await expect(progressLabel(page)).toHaveText(`${LABEL_NOW} · 4 of 4 done`);
    await expect(page.getByRole('progressbar', { name: `${LABEL_NOW} progress` })).toHaveAttribute('aria-valuenow', '100');
    await expect(page.getByText('Everything handled — progress is saved.')).toBeVisible();

    // Celebration card: PartyPopper lucide icon, no emoji anywhere.
    const card = page.locator('div.rounded-2xl', { hasText: `${LABEL_NOW}: done.` });
    await expect(card).toBeVisible();
    await expect(card.locator('svg.lucide-party-popper')).toBeVisible();
    await noEmoji(page);
    await shot(page, '06-season-complete-celebration.png');

    // Desktop share = clipboard copy + "Link copied" flip, with portal UTM tags.
    await card.getByRole('button', { name: 'Share Home Care' }).click();
    await expect(card.getByRole('button', { name: 'Link copied' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(SHARE_PAYLOAD);
    await shot(page, '07-celebration-share-link-copied.png');
  });

  test('S1: portal share card copies the UTM link and announces it', async ({ page }) => {
    await openChecklist(page);
    const shareCard = page.locator('div.rounded-2xl', { hasText: 'Know someone drowning in house stuff?' });
    await shareCard.scrollIntoViewIfNeeded();
    await shareCard.getByRole('button', { name: 'Share Home Care' }).click();
    await expect(shareCard.getByRole('button', { name: 'Link copied — paste it anywhere' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(SHARE_PAYLOAD);
    await shot(page, '08-share-card-link-copied.png');
  });
});
