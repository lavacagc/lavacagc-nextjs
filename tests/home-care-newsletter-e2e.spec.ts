import { test, expect, type Page } from '@playwright/test';
import http from 'http';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Home Care monthly newsletter - end-to-end through the real cron route.
 *
 * Everything else in the suite exercises the builder and the resolver as pure
 * functions. This drives the thing an end user actually receives: a real Next
 * server runs `GET /api/cron/home-care-newsletter`, backed by a stub that plays
 * BOTH Supabase REST and the Resend API, so the emails this captures are the
 * exact bytes the sender would put on the wire on the 1st of the month.
 *
 * The catalog it serves is not a fixture - it is the live summer catalog
 * reconstructed from supabase/migrations (phase1 seed + stage personalization +
 * summer additions + catalog v2), which is what makes the stage-gate assertion
 * meaningful: `sell_curb_appeal` (priority 10) and `sell_quick_repairs`
 * (priority 9) really are the two highest-priority summer rows, so a broken
 * gate puts "get ready to sell your house" at 01 and 02 in every member's mail.
 *
 * Run recipe (mirrors the portal E2E recipe in home-care-wave1-growth.spec.ts):
 *
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9414 \
 *   SUPABASE_SECRET_KEY=sb-stub-secret \
 *   RESEND_API_KEY=re_stub_key \
 *   RESEND_BASE_URL=http://127.0.0.1:9414 \
 *   CRON_SECRET=stub-cron-secret \
 *   NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3100 \
 *   npx next dev -p 3100
 *
 *   HC_NEWSLETTER_E2E=1 TEST_URL=http://127.0.0.1:3100 \
 *   npx playwright test tests/home-care-newsletter-e2e.spec.ts --project=chromium
 */

const RUN = process.env.HC_NEWSLETTER_E2E === '1';
const STUB_PORT = Number(process.env.HC_NL_STUB_PORT || 9414);
const BASE = process.env.TEST_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.HC_NL_CRON_SECRET || 'stub-cron-secret';
const EVIDENCE_DIR =
  process.env.HC_EVIDENCE_DIR || join(process.cwd(), 'test-results', 'hc-newsletter-e2e');

/* ── The live summer catalog, straight out of supabase/migrations ──────────── */

interface CatalogRow {
  key: string;
  title: string;
  blurb: string;
  applies_to: string[];
  stages: string[];
  seasons: string[];
  frequency: string;
  diy_or_pro: 'diy' | 'pro' | 'either';
  bookable: boolean;
  est_cost_low: number | null;
  est_cost_high: number | null;
  priority: number;
  starter: boolean;
  active: boolean;
}

const c = (
  key: string,
  title: string,
  blurb: string,
  applies_to: string[],
  seasons: string[],
  diy_or_pro: 'diy' | 'pro' | 'either',
  bookable: boolean,
  est_cost_low: number | null,
  est_cost_high: number | null,
  priority: number,
  stages: string[] = ['all'],
  starter = false,
): CatalogRow => ({
  key, title, blurb, applies_to, stages, seasons,
  frequency: 'annual', diy_or_pro, bookable, est_cost_low, est_cost_high, priority, starter, active: true,
});

const ALL4 = ['spring', 'summer', 'fall', 'winter'];

/** Every active, non-starter row whose `seasons` includes summer. */
const CATALOG: CatalogRow[] = [
  // 20260729 - pre-listing tasks, the two highest-priority summer rows there are.
  c('sell_curb_appeal', 'Refresh curb appeal', 'First impressions sell homes. Power-wash the exterior, touch up trim paint, mulch the beds, and make the front door pop.', ['exterior', 'all'], ['spring', 'summer', 'fall'], 'either', true, null, null, 10, ['selling']),
  c('sell_quick_repairs', 'Knock out quick-win repairs', 'Buyers notice the little things — leaky faucets, sticky doors, cracked caulk, burnt-out bulbs. We can handle a punch-list in one visit.', ['all'], ALL4, 'pro', true, null, null, 9, ['selling']),
  c('sell_pre_inspection', 'Consider a pre-listing inspection', "A pre-listing inspection surfaces what a buyer's inspector will find, so there are no surprises that stall your sale. We can prioritize the fixes that matter.", ['all'], ALL4, 'pro', true, null, null, 8, ['selling']),
  // 20260802 - summer additions.
  c('rinse_ac_condenser', 'Rinse the A/C condenser coils', "Cut power at the disconnect, then gently hose down the outdoor unit's coils. A clogged coil makes the system work harder — and quit in a heatwave.", ['hvac'], ['summer'], 'diy', false, null, null, 9),
  c('flush_ac_condensate', 'Clear the A/C condensate drain line', "Pour a cup of distilled vinegar down the condensate line at the air handler. A clogged line overflows the drain pan — that's a ceiling stain (or worse) in August.", ['hvac'], ['summer'], 'diy', false, null, null, 8),
  c('summer_gutter_check', 'Check gutters after big downpours', 'Summer storms drop leaves, seed pods, and shingle grit fast. A ten-minute walk-around beats water backing up under the fascia.', ['gutters'], ['summer'], 'diy', false, null, null, 8),
  c('prune_trees_house', 'Trim branches off the roof & siding', 'Branches touching the house are a highway for squirrels and carpenter ants — and a roof puncture waiting for the next thunderstorm.', ['exterior'], ['summer'], 'either', true, null, null, 7),
  c('washing_machine_hoses', 'Inspect washing-machine & icemaker hoses', 'Rubber supply hoses fail from the inside out, and a burst one can dump hundreds of gallons. Braided stainless replacements are a cheap swap.', ['plumbing'], ['summer'], 'diy', false, null, null, 7),
  c('wasp_nest_check', 'Check eaves & decks for wasp nests', 'Walk the eaves, soffits, shutters, and deck rails early in the season — while nests are golf-ball sized, not football sized.', ['exterior'], ['summer'], 'diy', false, null, null, 6),
  c('basement_humidity', 'Keep the basement under 60% humidity', 'NJ summers push basements into mold territory. A cheap hygrometer plus a dehumidifier protects the framing, the finishes, and everything you store down there.', ['all'], ['summer'], 'diy', false, null, null, 6),
  c('bath_fan_clean', 'Clean bathroom exhaust fans', "A dust-choked fan can't clear shower steam — and that's how ceilings grow mildew. Pop the cover, vacuum the grille and blades, done.", ['all'], ['summer'], 'diy', false, null, null, 5),
  // 20260725 phase-1 seed, with the 20260730 catalog-v2 high-end widening applied.
  c('clean_dryer_vent', 'Clean the dryer vent', 'Lint buildup is a top home-fire cause and makes the dryer work harder.', ['all'], ['fall', 'summer'], 'pro', true, 100, 300, 7),
  c('replace_hvac_filter', 'Replace the HVAC filter', 'A fresh filter every few months protects the system and your air quality.', ['hvac', 'all'], ALL4, 'diy', false, null, null, 6),
  c('seal_deck', 'Clean & seal the deck', 'Wash and reseal to protect the wood through another season of weather.', ['deck'], ['summer'], 'pro', true, 400, 1800, 5),
  c('reseal_driveway', 'Seal-coat the driveway', 'A fresh seal-coat protects asphalt from cracks and water in the off-season.', ['driveway'], ['summer'], 'pro', true, 300, 1200, 4),
  // 20260730 - catalog v2 additions.
  c('trim_paint_touchup', 'Touch up exterior trim & paint', 'Catch peeling or bare trim before the wood weathers. A summer touch-up protects it — or we can repaint the whole exterior.', ['exterior'], ['summer'], 'either', true, null, null, 4),
];

/* ── The members this run mails ────────────────────────────────────────────── */

interface Member {
  id: string;
  first_name: string | null;
  email: string;
  unsubscribe_token: string;
  last_newsletter_at: string | null;
  status: string;
}

const FULL_SYSTEMS = {
  hvac: true, lawn: true, deck: true, sump_pump: true, fireplace: true,
  driveway: true, pool: false, septic: false, garage: true,
};

/**
 * The clock the SERVER is running on. The run recipe can shift the app's clock
 * to a specific cron slot (e.g. the August 1 launch), and "already mailed this
 * calendar month" has to be computed against that same month or the dedupe
 * fixture stops meaning anything. Defaults to now when nothing is shifted.
 */
const NOW = new Date(process.env.HC_NL_NOW || Date.now());
const LAST_MONTH = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - 1, 12)).toISOString();
const THIS_MONTH = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), 2)).toISOString();

const MEMBERS: Member[] = [
  { id: '11111111-1111-4111-8111-111111111111', first_name: 'Dana', email: 'dana@example.com', unsubscribe_token: 'tok-dana', last_newsletter_at: LAST_MONTH, status: 'active' },
  { id: '22222222-2222-4222-8222-222222222222', first_name: 'Marcus', email: 'marcus@example.com', unsubscribe_token: 'tok-marcus', last_newsletter_at: null, status: 'active' },
  { id: '33333333-3333-4333-8333-333333333333', first_name: 'Priya', email: 'priya@example.com', unsubscribe_token: 'tok-priya', last_newsletter_at: LAST_MONTH, status: 'active' },
  { id: '44444444-4444-4444-8444-444444444444', first_name: 'Ellen', email: 'ellen@example.com', unsubscribe_token: 'tok-ellen', last_newsletter_at: LAST_MONTH, status: 'active' },
  { id: '55555555-5555-4555-8555-555555555555', first_name: 'Sam', email: 'sam@example.com', unsubscribe_token: 'tok-sam', last_newsletter_at: LAST_MONTH, status: 'active' },
  { id: '66666666-6666-4666-8666-666666666666', first_name: 'Tom', email: 'tom@example.com', unsubscribe_token: 'tok-tom', last_newsletter_at: LAST_MONTH, status: 'active' },
  { id: '77777777-7777-4777-8777-777777777777', first_name: 'Rita', email: 'rita@example.com', unsubscribe_token: 'tok-rita', last_newsletter_at: THIS_MONTH, status: 'active' },
];
const byEmail = (e: string) => MEMBERS.find((m) => m.email === e)!;

const PROFILES: Record<string, { systems: Record<string, boolean>; stage: string | null; homeowner_type: string | null }> = {
  // Established owner with a full profile - the ordinary case.
  [MEMBERS[0].id]: { systems: FULL_SYSTEMS, stage: 'established', homeowner_type: 'experienced' },
  // Never finished the questionnaire: no systems, NO STAGE. Must still not see
  // pre-listing work (the fail-closed decision).
  [MEMBERS[1].id]: { systems: {}, stage: null, homeowner_type: null },
  // Cleared her list by doing the work -> the caught-up note.
  [MEMBERS[2].id]: { systems: { ...FULL_SYSTEMS, deck: false, driveway: false }, stage: 'established', homeowner_type: null },
  // Actually selling - the stage gate is targeting, not blanket suppression.
  [MEMBERS[3].id]: { systems: FULL_SYSTEMS, stage: 'selling', homeowner_type: null },
  [MEMBERS[4].id]: { systems: FULL_SYSTEMS, stage: 'established', homeowner_type: null },
  // Hid everything as "not relevant to my home" -> nothing honest to send.
  [MEMBERS[5].id]: { systems: {}, stage: 'established', homeowner_type: null },
  [MEMBERS[6].id]: { systems: FULL_SYSTEMS, stage: 'established', homeowner_type: null },
};

const SEASON_NOW = (() => {
  const m = NOW.getUTCMonth();
  const start: Record<string, number> = { winter: 11, spring: 2, summer: 5, fall: 8 };
  return (['spring', 'summer', 'fall', 'winter'] as const).find((s) => (m - start[s] + 12) % 12 < 3)!;
})();

const nowIso = () => NOW.toISOString();

interface MaintRow { homeowner_id: string; task_key: string; season: string; status: string; completed_at: string | null; updated_at: string }
const maint = (homeowner_id: string, task_key: string, status: string): MaintRow => ({
  homeowner_id, task_key, season: status === 'dismissed' ? 'all' : SEASON_NOW, status,
  completed_at: status === 'done' ? nowIso() : null, updated_at: nowIso(),
});

/** Keys a member's systems+stage make visible, so "everything" can be marked off. */
const UNIVERSAL = new Set(['all', 'roof', 'water_heater', 'windows', 'exterior', 'plumbing', 'gutters']);
function visibleKeys(memberId: string): string[] {
  const p = PROFILES[memberId];
  return CATALOG.filter((t) => {
    if (t.stages.length && !t.stages.includes('all')) {
      if (!p.stage || !t.stages.includes(p.stage)) return false;
    }
    if (!Object.keys(p.systems).length) return true;
    return t.applies_to.some((a) => UNIVERSAL.has(a) || p.systems[a] === true);
  }).map((t) => t.key);
}

const MAINT: MaintRow[] = [
  // Dana is a few weeks into the season: two A/C jobs and the hoses checked off,
  // the tree work snoozed. All four must drop out of her August mail.
  maint(MEMBERS[0].id, 'rinse_ac_condenser', 'done'),
  maint(MEMBERS[0].id, 'flush_ac_condensate', 'done'),
  maint(MEMBERS[0].id, 'washing_machine_hoses', 'done'),
  maint(MEMBERS[0].id, 'prune_trees_house', 'snoozed'),
  // Priya cleared the lot: mostly done, one booked, one snoozed.
  ...visibleKeys(MEMBERS[2].id).map((k, i) =>
    maint(MEMBERS[2].id, k, i === 0 ? 'booked' : i === 1 ? 'snoozed' : 'done'),
  ),
  // Tom hid every one of them.
  ...visibleKeys(MEMBERS[5].id).map((k) => maint(MEMBERS[5].id, k, 'dismissed')),
];

/** Sam is off the home_care stream. */
const PREFS = [
  { email: 'dana@example.com', preference_token: 'pref-dana', home_care: true, buy_remodel: true, announcements: true, newsletter: false, follow_ups: true },
  { email: 'marcus@example.com', preference_token: 'pref-marcus', home_care: true, buy_remodel: true, announcements: true, newsletter: false, follow_ups: true },
  { email: 'priya@example.com', preference_token: 'pref-priya', home_care: true, buy_remodel: true, announcements: true, newsletter: false, follow_ups: true },
  { email: 'ellen@example.com', preference_token: 'pref-ellen', home_care: true, buy_remodel: true, announcements: true, newsletter: false, follow_ups: true },
  { email: 'sam@example.com', preference_token: 'pref-sam', home_care: false, buy_remodel: true, announcements: true, newsletter: false, follow_ups: true },
  { email: 'tom@example.com', preference_token: 'pref-tom', home_care: true, buy_remodel: true, announcements: true, newsletter: false, follow_ups: true },
];

/* ── Captures ──────────────────────────────────────────────────────────────── */

interface SentEmail { to: string; subject: string; html: string; text: string; headers: Record<string, string>; from: string }
const sent: SentEmail[] = [];
const emailLog: Array<Record<string, unknown>> = [];
const patches: Array<{ path: string; body: unknown }> = [];
const posts: Array<{ path: string; body: unknown }> = [];

test.describe('Home Care newsletter: the real cron, end to end', () => {
  test.skip(!RUN, 'Needs the stub-backed server - see the run recipe at the top of this spec.');
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  let stub: http.Server;
  let dry: Record<string, unknown>;
  let live: Record<string, unknown>;
  /** Replays the original production failure: a catalog response with no `stages`. */
  let dropStages = false;

  test.beforeAll(async () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    stub = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${STUB_PORT}`);
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        const send = (status: number, body?: unknown) => {
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(body === undefined ? '' : JSON.stringify(body));
        };
        const p = url.pathname;
        const q = url.searchParams;

        // --- Resend ---------------------------------------------------------
        if (p === '/emails' && req.method === 'POST') {
          const body = JSON.parse(raw) as { to: string[] | string; subject: string; html: string; text: string; headers?: Record<string, string>; from: string };
          sent.push({
            to: Array.isArray(body.to) ? body.to[0] : body.to,
            subject: body.subject, html: body.html, text: body.text,
            headers: body.headers ?? {}, from: body.from,
          });
          return send(200, { id: `stub-${sent.length}` });
        }

        // --- Supabase REST --------------------------------------------------
        const table = p.startsWith('/rest/v1/') ? p.slice('/rest/v1/'.length) : '';

        if (req.method === 'PATCH') {
          patches.push({ path: `${table}?${url.search.slice(1)}`, body: raw ? JSON.parse(raw) : null });
          // Reflect an unsubscribe back into the in-memory table so a later read sees it.
          const idEq = q.get('id')?.replace('eq.', '');
          const emailEq = q.get('email')?.replace('eq.', '');
          const patch = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
          const target = MEMBERS.find((m) => m.id === idEq || m.email === emailEq);
          if (target && typeof patch.status === 'string') target.status = patch.status as string;
          if (target && typeof patch.last_newsletter_at === 'string') target.last_newsletter_at = patch.last_newsletter_at;
          return send(200);
        }

        if (req.method === 'POST') {
          const body = raw ? JSON.parse(raw) : null;
          posts.push({ path: table, body });
          if (table.startsWith('email_log')) emailLog.push(body as Record<string, unknown>);
          return send(201);
        }

        if (table.startsWith('maintenance_catalog')) {
          const season = /seasons=cs\.%7B(\w+)%7D/.exec(url.search)?.[1] ?? SEASON_NOW;
          const cols = (q.get('select') ?? '*').split(',').filter((k) => !(dropStages && k === 'stages'));
          const rows = CATALOG
            .filter((t) => t.active && !t.starter && t.seasons.includes(season))
            .sort((a, b) => b.priority - a.priority)
            // PostgREST omits unselected columns entirely - the exact shape that
            // let a forgotten `stages` read as "applies to everyone".
            .map((t) => Object.fromEntries(cols.map((k) => [k, (t as unknown as Record<string, unknown>)[k]])));
          return send(200, rows);
        }

        if (table.startsWith('homeowners')) {
          const rows = MEMBERS
            .filter((m) => m.status === 'active')
            .filter((m) => {
              const tok = q.get('unsubscribe_token')?.replace('eq.', '');
              return !tok || m.unsubscribe_token === tok;
            })
            .sort((a, b) => {
              const av = a.last_newsletter_at ?? '';
              const bv = b.last_newsletter_at ?? '';
              return av === bv ? a.id.localeCompare(b.id) : av.localeCompare(bv);
            });
          return send(200, rows);
        }

        if (table.startsWith('home_profiles')) {
          const ids = /homeowner_id=in\.\(([^)]*)\)/.exec(decodeURIComponent(url.search))?.[1].split(',') ?? [];
          return send(200, ids.filter((id) => PROFILES[id]).map((id) => ({ homeowner_id: id, ...PROFILES[id] })));
        }

        if (table.startsWith('homeowner_maintenance')) {
          const ids = /homeowner_id=in\.\(([^)]*)\)/.exec(decodeURIComponent(url.search))?.[1].split(',') ?? [];
          const statuses = /status=in\.\(([^)]*)\)/.exec(decodeURIComponent(url.search))?.[1].split(',') ?? [];
          return send(200, MAINT.filter((r) => ids.includes(r.homeowner_id) && (!statuses.length || statuses.includes(r.status))));
        }

        if (table.startsWith('email_preferences')) {
          const offset = Number(q.get('offset') ?? 0);
          if (q.get('home_care') === 'eq.false') {
            return send(200, offset > 0 ? [] : PREFS.filter((r) => !r.home_care).map((r) => ({ email: r.email })));
          }
          const email = q.get('email')?.replace('eq.', '');
          const token = q.get('preference_token')?.replace('eq.', '');
          return send(200, PREFS.filter((r) => (email ? r.email === email : true) && (token ? r.preference_token === token : true)));
        }

        return send(200, []);
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

  const cron = async (queryString = '') => {
    const res = await fetch(`${BASE}/api/cron/home-care-newsletter${queryString}`, {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  test('dry run classifies every recipient and writes absolutely nothing', async () => {
    const res = await cron('?dryRun=1');
    expect(res.status).toBe(200);
    dry = res.body;
    writeFileSync(join(EVIDENCE_DIR, 'cron-dry-run.json'), JSON.stringify(dry, null, 2));

    expect(dry.ok).toBe(true);
    expect(dry.dryRun).toBe(true);
    // 7 active members, one already mailed this calendar month.
    expect(dry.due_page).toBe(7);
    expect(dry.eligible).toBe(6);
    // Dana, Marcus, Priya, Ellen | Sam opted out | Tom hid everything.
    expect(dry.would_send).toBe(4);
    expect(dry.suppressed).toBe(1);
    expect(dry.empty_skipped).toBe(1);
    expect(dry.caught_up).toBe(1);
    expect(dry.suppression_checked).toBe(true);
    expect(dry.sent).toBe(0);
    // The invariant the buckets exist to hold.
    expect((dry.would_send as number) + (dry.suppressed as number) + (dry.empty_skipped as number)).toBe(dry.eligible);

    // Nothing written: no mail, no email_log row, no last_newsletter_at touch.
    expect(sent).toEqual([]);
    expect(emailLog).toEqual([]);
    expect(patches).toEqual([]);
    expect(posts).toEqual([]);
  });

  test('live run mails exactly the recipients the dry run predicted', async () => {
    const res = await cron();
    expect(res.status).toBe(200);
    live = res.body;
    writeFileSync(join(EVIDENCE_DIR, 'cron-live-run.json'), JSON.stringify(live, null, 2));

    expect(live.ok).toBe(true);
    expect(live.failures).toBe(0);
    expect(live.sent).toBe(4);
    // Line for line with the dry run, which is the whole point of running one.
    for (const k of ['type', 'season', 'month', 'eligible', 'would_send', 'suppressed', 'empty_skipped', 'caught_up']) {
      expect({ [k]: live[k] }).toEqual({ [k]: dry[k] });
    }

    expect(sent.map((e) => e.to).sort()).toEqual(['dana@example.com', 'ellen@example.com', 'marcus@example.com', 'priya@example.com']);
    // Sam is refused at the sender and audited; Tom gets no row at all.
    const samLog = emailLog.filter((r) => r.to_email === 'sam@example.com');
    expect(samLog).toHaveLength(1);
    expect(samLog[0]).toMatchObject({ category: 'home_care_newsletter', status: 'skipped', sent_at: null });
    expect(emailLog.filter((r) => r.to_email === 'tom@example.com')).toEqual([]);
    // Only closed-out members had the month stamped: the 4 sends + Sam + Tom.
    expect(patches.filter((p) => p.path.startsWith('homeowners'))).toHaveLength(6);
  });

  test('STAGE GATE: pre-listing work reaches the seller and nobody else', async () => {
    const dana = sent.find((e) => e.to === 'dana@example.com')!;
    const marcus = sent.find((e) => e.to === 'marcus@example.com')!;
    const ellen = sent.find((e) => e.to === 'ellen@example.com')!;

    // sell_curb_appeal (p10) and sell_quick_repairs (p9) top the summer catalog,
    // so a dead gate makes them items 01 and 02 for everyone.
    for (const mail of [dana, marcus]) {
      expect(mail.html, `${mail.to} must not see pre-listing work`).not.toContain('Refresh curb appeal');
      expect(mail.html).not.toContain('Knock out quick-win repairs');
      expect(mail.html).not.toContain('pre-listing inspection');
      expect(mail.text).not.toContain('Refresh curb appeal');
    }
    // Marcus has no stage at all - the gate fails closed rather than open.
    expect(marcus.html).toContain('Hi Marcus,');
    // Ellen said she is selling, so she gets exactly that work, at 01 and 02.
    expect(ellen.html).toContain('Refresh curb appeal');
    expect(ellen.html).toContain('Knock out quick-win repairs');
  });

  test('TEASER + COSTS + COMPLETIONS: three jobs, a real range, nothing already done', async () => {
    const dana = sent.find((e) => e.to === 'dana@example.com')!;
    const rows = (dana.html.match(/width="30" valign="top"/g) || []).length;
    expect(rows).toBe(3);
    // Done, and snoozed, this season - she must not be nudged about any of them.
    // The builder escapes catalog text for the HTML part, so each title is
    // checked in the spelling that part actually uses.
    const escaped = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    for (const gone of [
      'Rinse the A/C condenser coils',
      'Clear the A/C condensate drain line',
      'Inspect washing-machine & icemaker hoses',
      'Trim branches off the roof & siding',
    ]) {
      expect(dana.html, `${gone} is already handled`).not.toContain(escaped(gone));
      expect(dana.text, `${gone} is already handled`).not.toContain(gone);
    }
    // ...so her top three start further down the list, and the rest is teased.
    expect(dana.html).toContain('Check gutters after big downpours');
    expect(dana.html).toContain('Clean the dryer vent');
    expect(dana.html).toMatch(/\+ \d+ more jobs on your \w+ list/);
    // The one catalog range among them renders; nothing is invented for the rest.
    expect(dana.html).toContain('$100&ndash;$300');
    expect(dana.text).toContain('$100-$300');
    expect(dana.html).toContain('Add to plan');
  });

  test('CAUGHT-UP: a cleared list gets the note, not silence, with the CTA intact', async () => {
    const priya = sent.find((e) => e.to === 'priya@example.com')!;
    expect(priya.subject).toMatch(/you're all caught up, Priya$/);
    expect(priya.subject).toContain(live.month as string);
    expect(priya.html).toContain('all caught up.');
    expect((priya.html.match(/width="30" valign="top"/g) || []).length).toBe(0); // no task panel
    expect(priya.html).toContain("While you're ahead");
    expect(priya.html).toContain('/portfolio?utm_source=home_care_newsletter');
    expect(priya.html).toContain('Call (201) 212-4917'); // booking CTA survives
    expect(priya.html).toContain('51 Crestmont Rd, West Orange, NJ 07052'); // and the footer
  });

  test('CAN-SPAM: every delivered email carries address, opt-out and one-click headers', async () => {
    for (const mail of sent) {
      expect(mail.from).toBe('La Vaca Home Care <alex@email.lavaca.link>');
      expect(mail.html).toContain('51 Crestmont Rd, West Orange, NJ 07052');
      expect(mail.text).toContain('51 Crestmont Rd, West Orange, NJ 07052');
      expect(mail.html).toContain(`/api/home-care/unsubscribe?token=${byEmail(mail.to).unsubscribe_token}`);
      expect(mail.html).toContain("You're getting this because you're enrolled in La Vaca Home Care");
      expect(mail.html).toContain('/preferences?token=');
      expect(mail.headers['List-Unsubscribe']).toMatch(/^<https?:\/\/.+\/api\/preferences\/unsubscribe\?token=.+&stream=home_care>$/);
      expect(mail.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    }
  });

  test('every link in a delivered email resolves', async () => {
    const dana = sent.find((e) => e.to === 'dana@example.com')!;
    const priya = sent.find((e) => e.to === 'priya@example.com')!;
    const urls = new Set<string>();
    for (const mail of [dana, priya]) {
      for (const m of mail.html.matchAll(/(?:href|src)="(https?:[^"]+)"/g)) urls.add(m[1].replace(/&amp;/g, '&'));
    }
    const results: Array<{ url: string; status: number; finalUrl: string }> = [];
    for (const url of [...urls].sort()) {
      // The unsubscribe link is exercised on its own below - following it here
      // would unsubscribe the member mid-suite.
      if (url.includes('/api/home-care/unsubscribe')) continue;
      const res = await fetch(url);
      results.push({ url, status: res.status, finalUrl: res.url });
    }
    writeFileSync(join(EVIDENCE_DIR, 'link-check.json'), JSON.stringify(results, null, 2));
    expect(results.filter((r) => r.status >= 400)).toEqual([]);
    expect(results.length).toBeGreaterThan(4);
  });

  test('the hero and the logo are fetchable from a mail client, not blocked by CORP', async () => {
    const dana = sent.find((e) => e.to === 'dana@example.com')!;
    const hero = /<img src="([^"]*\/email\/home-care\/hero-\d\d\.jpg)"/.exec(dana.html)?.[1];
    expect(hero, 'the email must carry a month hero').toBeTruthy();

    const checks: Array<{ url: string; corp: string | null; type: string | null; status: number }> = [];
    for (const url of [hero!, `${BASE}/logo.png`, `${BASE}/home-care`]) {
      const res = await fetch(url);
      checks.push({
        url, status: res.status,
        corp: res.headers.get('cross-origin-resource-policy'),
        type: res.headers.get('content-type'),
      });
    }
    writeFileSync(join(EVIDENCE_DIR, 'corp-headers.json'), JSON.stringify(checks, null, 2));
    // Email assets opt out of the site-wide same-origin policy...
    expect(checks[0]).toMatchObject({ status: 200, corp: 'cross-origin' });
    expect(checks[1]).toMatchObject({ status: 200, corp: 'cross-origin' });
    // ...and nothing else does.
    expect(checks[2].corp).toBe('same-origin');
  });

  test('the tokenized opt-out in the footer actually unsubscribes', async () => {
    const dana = sent.find((e) => e.to === 'dana@example.com')!;
    const unsub = /href="([^"]*\/api\/home-care\/unsubscribe\?token=[^"]+)"/.exec(dana.html)![1].replace(/&amp;/g, '&');
    const res = await fetch(unsub, { redirect: 'manual' });
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/home-care?unsub=ok');
    // The member is off the list in the database, not just in the UI.
    await expect.poll(() => byEmail('dana@example.com').status).toBe('unsubscribed');
    writeFileSync(
      join(EVIDENCE_DIR, 'unsubscribe-click.json'),
      JSON.stringify({ clicked: unsub, redirect: res.headers.get('location'), homeowner_status: byEmail('dana@example.com').status }, null, 2),
    );
  });

  test('capture what each member actually sees', async ({ page }) => {
    // The brand logo is absolute on the production host by design (a mail client
    // fetches it itself). Serve it from this checkout's public/ so the capture
    // shows what a recipient sees without reaching out to the live site - whose
    // bot filter would 403 an automated browser and leave a broken image here.
    await page.route('https://www.lavacagc.com/**', (route) =>
      route.fulfill({ path: join(process.cwd(), 'public', new URL(route.request().url()).pathname) }),
    );
    const shot = async (p: Page, mail: SentEmail, file: string) => {
      await p.setContent(mail.html, { waitUntil: 'load' });
      await p.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 15_000 }).catch(() => {});
      await p.screenshot({ path: join(EVIDENCE_DIR, file), fullPage: true });
    };
    const label: Record<string, string> = {
      'dana@example.com': 'dana-nudge-established',
      'marcus@example.com': 'marcus-no-stage-fails-closed',
      'priya@example.com': 'priya-caught-up',
      'ellen@example.com': 'ellen-selling-stage',
    };
    for (const mail of sent) {
      const name = label[mail.to];
      writeFileSync(join(EVIDENCE_DIR, `email-${name}.html`), mail.html);
      writeFileSync(join(EVIDENCE_DIR, `email-${name}.txt`), `Subject: ${mail.subject}\nFrom: ${mail.from}\nTo: ${mail.to}\nList-Unsubscribe: ${mail.headers['List-Unsubscribe'] ?? ''}\n\n${mail.text}`);
      await page.setViewportSize({ width: 700, height: 1200 });
      await shot(page, mail, `email-${name}-desktop.png`);
      await page.setViewportSize({ width: 390, height: 844 });
      await shot(page, mail, `email-${name}-mobile.png`);
    }
    writeFileSync(
      join(EVIDENCE_DIR, 'sent-summary.json'),
      JSON.stringify(sent.map((e) => ({ to: e.to, subject: e.subject, listUnsubscribe: e.headers['List-Unsubscribe'] })), null, 2),
    );
  });

  test('a catalog response without `stages` aborts the run instead of leaking', async () => {
    // The original bug, replayed: PostgREST omits an unselected column rather
    // than nulling it, so a forgotten `stages` read as "applies to everyone" and
    // put pre-listing work at 01/02 in every member's mail. The run now refuses.
    const before = sent.length;
    dropStages = true;
    try {
      const res = await cron('?dryRun=1');
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ ok: false, error: 'catalog select is missing stages' });
      writeFileSync(join(EVIDENCE_DIR, 'cron-missing-stages-guard.json'), JSON.stringify(res.body, null, 2));
      // And a live run refuses too - no partial send goes out first.
      const liveRes = await cron();
      expect(liveRes.status).toBe(500);
      expect(sent).toHaveLength(before);
    } finally {
      dropStages = false;
    }
  });
});
