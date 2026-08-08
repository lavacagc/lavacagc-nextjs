import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { test, expect, type Page } from '@playwright/test';

/**
 * Performance measurement actions - NOT correctness tests.
 *
 * Each test performs one key user action, counts every network request the
 * browser fires (bucketed: our app / Supabase / third-party), and reads the
 * database queries the action caused from the LOCAL Supabase stack's
 * pg_stat_statements (reset before each action, so the window is exact).
 * Results land in PERF_OUT as JSON; scripts/perf-run.mjs turns them into the
 * plain-language baseline/comparison report.
 *
 * Run only via `npm run perf`. Requirements this file assumes (the runner
 * provides them): the perf build (scripts/perf-build.sh), a `next start` on
 * :3000, PERF_DB_URL / PERF_SUPABASE_URL / PERF_OUT / PERF_RECAPTCHA_TOKEN.
 *
 * Third-party requests (analytics etc.) are counted but ABORTED before they
 * leave the machine, so a perf run is hermetic and repeatable.
 */

const DB_URL = process.env.PERF_DB_URL || '';
const SUPABASE_ORIGIN = (process.env.PERF_SUPABASE_URL || '').replace(/\/$/, '');
const OUT = process.env.PERF_OUT || path.join(process.cwd(), 'perf', '.tmp', 'actions.json');
const RECAPTCHA_TOKEN = process.env.PERF_RECAPTCHA_TOKEN || '';
const APP_HOSTS = new Set(['localhost:3000', '127.0.0.1:3000']);

interface QueryRow {
  query: string;
  calls: number;
  mean_ms: number;
}

interface RequestEntry {
  url: string;
  count: number;
}

interface ActionResult {
  requests: number;
  app: number;
  supabase: number;
  thirdParty: number;
  /** Next.js background preloads of OTHER pages (?_rsc requests fired as
   *  links enter the viewport). Real but not caused by the action itself,
   *  so they are counted apart to keep the headline numbers meaningful. */
  prefetch: number;
  browserSupabaseBlockedByCsp: number;
  urls: RequestEntry[];
  queries: QueryRow[] | null;
  queryCount: number | null;
  loadMs?: number;
}

function psql(sql: string): string {
  return execFileSync('psql', [DB_URL, '-tA', '-c', sql], { encoding: 'utf8' }).trim();
}

function resetQueryStats(): void {
  if (!DB_URL) return;
  psql('select pg_stat_statements_reset()');
}

/**
 * Queries the app caused in the current window. Filtered to the roles
 * PostgREST serves the app as (anon/authenticated/authenticator plus
 * service_role for server-side secret-key writes) so Postgres housekeeping
 * and this harness's own statements never pollute the numbers.
 */
function readQueryStats(): QueryRow[] | null {
  if (!DB_URL) return null;
  const raw = psql(`
    select coalesce(json_agg(t), '[]') from (
      select s.query, s.calls, round(s.mean_exec_time::numeric, 2) as mean_ms
      from pg_stat_statements s
      join pg_roles r on r.oid = s.userid
      where r.rolname in ('anon', 'authenticated', 'authenticator', 'service_role')
        and s.query !~* '^(set |begin|commit|show |select set_config|deallocate)'
      order by s.calls desc
      limit 25
    ) t`);
  return JSON.parse(raw) as QueryRow[];
}

/** Strip the origin from app URLs and drop query-string VALUES so the same
 *  logical call compares equal across runs. */
function normalizeUrl(url: string): string {
  const u = new URL(url);
  const params = [...u.searchParams.keys()].sort().join(',');
  const origin = APP_HOSTS.has(u.host) ? '' : `${u.protocol}//${u.host}`;
  return `${origin}${u.pathname}${params ? `?${params}` : ''}`;
}

function trackRequests(page: Page) {
  let urls: string[] = [];
  let cspBlocked = 0;
  page.on('request', (r) => {
    urls.push(r.url());
  });
  page.on('console', (m) => {
    const t = m.text();
    if (t.includes('Content Security Policy') && SUPABASE_ORIGIN && t.includes(SUPABASE_ORIGIN)) {
      cspBlocked += 1;
    }
  });
  return {
    reset() {
      urls = [];
      cspBlocked = 0;
    },
    summarize(): Omit<ActionResult, 'queries' | 'queryCount' | 'loadMs'> {
      let app = 0;
      let supabase = 0;
      let thirdParty = 0;
      let prefetch = 0;
      const counts = new Map<string, number>();
      for (const url of urls) {
        const u = new URL(url);
        if (u.searchParams.has('_rsc')) {
          prefetch += 1;
          continue;
        }
        if (APP_HOSTS.has(u.host)) app += 1;
        else if (SUPABASE_ORIGIN && url.startsWith(SUPABASE_ORIGIN)) supabase += 1;
        else thirdParty += 1;
        const n = normalizeUrl(url);
        counts.set(n, (counts.get(n) ?? 0) + 1);
      }
      const sorted = [...counts.entries()]
        .map(([url, count]) => ({ url, count }))
        .sort((a, b) => b.count - a.count);
      return {
        requests: app + supabase + thirdParty,
        app,
        supabase,
        thirdParty,
        prefetch,
        browserSupabaseBlockedByCsp: cspBlocked,
        urls: sorted,
      };
    },
  };
}

function record(name: string, data: ActionResult): void {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const current: Record<string, ActionResult> = fs.existsSync(OUT)
    ? (JSON.parse(fs.readFileSync(OUT, 'utf8')) as Record<string, ActionResult>)
    : {};
  current[name] = data;
  fs.writeFileSync(OUT, JSON.stringify(current, null, 2));
}

/** Count requests but abort anything that would leave this machine. */
async function blockThirdParties(page: Page): Promise<void> {
  await page.route('**/*', (route) => {
    const host = new URL(route.request().url()).host;
    const allowed =
      APP_HOSTS.has(host) || (SUPABASE_ORIGIN && route.request().url().startsWith(SUPABASE_ORIGIN));
    if (allowed) return route.continue();
    return route.abort();
  });
}

async function pageLoadMs(page: Page): Promise<number> {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    return Math.round(nav?.duration ?? 0);
  });
}

async function measurePageLoad(page: Page, name: string, url: string): Promise<void> {
  await blockThirdParties(page);
  const tracker = trackRequests(page);
  resetQueryStats();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const queries = readQueryStats();
  const loadMs = await pageLoadMs(page);
  record(name, {
    ...tracker.summarize(),
    queries,
    queryCount: queries === null ? null : queries.reduce((sum, q) => sum + q.calls, 0),
    loadMs,
  });
  await expect(page.locator('body')).toBeVisible();
}

test('load-homepage', async ({ page }) => {
  await measurePageLoad(page, 'load-homepage', '/');
});

test('load-request-estimate', async ({ page }) => {
  await measurePageLoad(page, 'load-request-estimate', '/request-estimate');
});

test('load-home-care', async ({ page }) => {
  await measurePageLoad(page, 'load-home-care', '/home-care');
});

test('load-service-interior', async ({ page }) => {
  // /services/[slug] pages are DB-driven and empty in the local stack;
  // interior-finishing is a real static route, so it measures the same shape.
  await measurePageLoad(page, 'load-service-interior', '/services/interior-finishing');
});

test('submit-estimate-request', async ({ page }) => {
  test.skip(!RECAPTCHA_TOKEN, 'PERF_RECAPTCHA_TOKEN not set (runner provides it)');

  // Same offline grecaptcha stub the form specs use, but returning the
  // server's E2E bypass token so the API route runs its REAL path: validate,
  // insert into the local leads table, attempt notifications. That makes the
  // measured query count the true cost of one submission.
  await page.addInitScript((token: string) => {
    // @ts-expect-error - runtime stub
    window.grecaptcha = {
      enterprise: {
        ready: (cb: () => void) => cb(),
        execute: async () => token,
        render: (_c: HTMLElement, params: { callback?: (t: string) => void }) => {
          setTimeout(() => params.callback && params.callback(token), 0);
          return 1;
        },
        reset: () => {},
      },
    };
  }, RECAPTCHA_TOKEN);

  await blockThirdParties(page);
  await page.goto('/request-estimate', { waitUntil: 'networkidle' });
  await page.locator('#name').fill('Perf Baseline');
  await page.locator('#phone').fill('(201) 555-0100');
  await page.locator('#email').fill('perf-baseline@example.com');
  await page.locator('#town').fill('Montclair, NJ');
  await page.getByText('Home safety audit').click();
  await page.locator('#when').selectOption({ label: 'This month' });

  // Measure ONLY the submit: everything before this line is page load,
  // already covered by load-request-estimate.
  const tracker = trackRequests(page);
  resetQueryStats();
  await page.getByRole('button', { name: /request availability/i }).click();
  await expect(page.getByText('Request received.')).toBeVisible({ timeout: 15000 });
  // Deterministic window end: wait for the network to go quiet so the
  // success view's asset loads are always included (a fixed pause sometimes
  // missed them, making the count flap run-to-run).
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);
  const queries = readQueryStats();
  record('submit-estimate-request', {
    ...tracker.summarize(),
    queries,
    queryCount: queries === null ? null : queries.reduce((sum, q) => sum + q.calls, 0),
  });
});
