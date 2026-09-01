#!/usr/bin/env node
/**
 * Local performance baseline runner - `npm run perf`.
 *
 * Orchestrates EXISTING tools, adds no profiler of its own:
 *   - Lighthouse CLI       -> page performance + page weight, key pages
 *   - Playwright           -> network requests fired by key actions (perf/actions.spec.ts)
 *   - local Supabase       -> real query counts + timings via pg_stat_statements
 *
 * First run: records perf/baseline.json and reports it in plain language.
 * Later runs: compares against the baseline, flags anything meaningfully
 * worse, and suggests why. Absolute best-practice sanity checks run every
 * time, baseline or not.
 *
 * Everything runs on this machine: the app is built against the local
 * Supabase stack (scripts/perf-build.sh) and the browser's third-party
 * requests are counted but aborted before leaving the machine.
 *
 * `npm run perf -- --reset-baseline` re-records the baseline on purpose
 * (after an intentional change, e.g. you added a feature that legitimately
 * costs one more query).
 */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, 'perf', '.tmp');
const BASELINE_PATH = path.join(ROOT, 'perf', 'baseline.json');
const ACTIONS_OUT = path.join(TMP, 'actions.json');
const RESET_BASELINE = process.argv.includes('--reset-baseline');
const SKIP_BUILD = process.argv.includes('--skip-build');

// >= 32 chars so src/app/api/leads/submit accepts it as the E2E bypass token
// (local only - VERCEL_ENV is never 'production' here).
const RECAPTCHA_TOKEN = 'perf-local-recaptcha-bypass-token-00001';

const PAGES = [
  { slug: 'homepage', label: 'Homepage', urlPath: '/' },
  { slug: 'request-estimate', label: 'Request-estimate form page', urlPath: '/request-estimate' },
  { slug: 'home-care', label: 'Home Care page', urlPath: '/home-care' },
  { slug: 'service-interior', label: 'Interior finishing service page', urlPath: '/services/interior-finishing' },
];

const ACTION_LABELS = {
  'load-homepage': 'Loading the homepage',
  'load-request-estimate': 'Loading the request-estimate page',
  'load-home-care': 'Loading the Home Care page',
  'load-service-interior': 'Loading the interior-finishing service page',
  'submit-estimate-request': 'Submitting the estimate request form',
};

// "Meaningfully worse" thresholds (relative to baseline) and absolute
// best-practice sanity limits. Deliberately conservative so the report only
// speaks up when something is worth a look.
const WORSE = {
  count: (base, cur) => cur > base + Math.max(2, Math.ceil(base * 0.25)),
  queryCount: (base, cur) => cur > base + Math.max(1, Math.ceil(base * 0.25)),
  timeMs: (base, cur) => cur > base * 1.3 + 250,
  score: (base, cur) => cur < base - 5,
  bytes: (base, cur) => cur > base * 1.2 + 100_000,
};
const SANITY = {
  // A full page load legitimately fetches dozens of assets (JS, CSS, images,
  // fonts); a single click should not. Separate budgets per action kind.
  maxRequestsPerPageLoad: 60,
  maxRequestsPerAction: 12,
  maxQueriesPerAction: 8,
  duplicateQueryCalls: 5,
  duplicateRequestCount: 3,
  maxLcpMs: 4000,
  maxTbtMs: 600,
  minScore: 70,
  maxPageBytes: 3_000_000,
};

const log = (msg) => console.log(msg);
const fail = (msg) => {
  console.error(`perf: ${msg}`);
  process.exit(1);
};

function supabaseEnv() {
  let out;
  try {
    out = execFileSync('supabase', ['status', '-o', 'env'], { cwd: ROOT, encoding: 'utf8' });
  } catch {
    fail('the local Supabase stack is not running. Start it with: supabase start');
  }
  const env = {};
  for (const line of out.split('\n')) {
    const m = line.match(/^([A-Z_]+)="(.*)"$/);
    if (m) env[m[1]] = m[2];
  }
  for (const key of ['API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY', 'DB_URL']) {
    if (!env[key]) fail(`supabase status did not report ${key}`);
  }
  return env;
}

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 perf-run local' } });
      if (res.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  fail('the local server never came up on :3000 (see perf/.tmp/server.log)');
}

function runLighthouse(urlPath, slug) {
  const outPath = path.join(TMP, `lh-${slug}.json`);
  execFileSync(
    path.join(ROOT, 'node_modules', '.bin', 'lighthouse'),
    [
      `http://localhost:3000${urlPath}`,
      '--preset=desktop',
      '--only-categories=performance',
      '--output=json',
      `--output-path=${outPath}`,
      // headless=new keeps a real Chrome UA (src/middleware.ts 403s
      // /headlesschrome/i, and measuring the bot filter would be meaningless).
      '--chrome-flags=--headless=new',
      '--quiet',
    ],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] }
  );
  const lhr = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  if (lhr.runtimeError) fail(`Lighthouse failed on ${urlPath}: ${lhr.runtimeError.message}`);
  const audit = (id) => lhr.audits[id]?.numericValue ?? null;
  return {
    score: Math.round((lhr.categories.performance.score ?? 0) * 100),
    lcpMs: Math.round(audit('largest-contentful-paint') ?? 0),
    fcpMs: Math.round(audit('first-contentful-paint') ?? 0),
    tbtMs: Math.round(audit('total-blocking-time') ?? 0),
    cls: Number((audit('cumulative-layout-shift') ?? 0).toFixed(3)),
    totalBytes: Math.round(audit('total-byte-weight') ?? 0),
    requestCount: lhr.audits['network-requests']?.details?.items?.length ?? null,
  };
}

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
const sec = (ms) => `${(ms / 1000).toFixed(1)}s`;
const shortQuery = (q) => q.replace(/\s+/g, ' ').trim().slice(0, 110);

function describeAction(name, a) {
  const label = ACTION_LABELS[name] ?? name;
  const parts = [`fires ${a.requests} network request${a.requests === 1 ? '' : 's'}`];
  const buckets = [];
  if (a.app) buckets.push(`${a.app} to your site`);
  if (a.supabase) buckets.push(`${a.supabase} to Supabase`);
  if (a.thirdParty) buckets.push(`${a.thirdParty} third-party (blocked locally, would fire in production)`);
  if (buckets.length) parts.push(`(${buckets.join(', ')})`);
  if (a.queryCount !== null && a.queryCount !== undefined) {
    const mean =
      a.queries && a.queries.length
        ? `, averaging ${(
            a.queries.reduce((s, q) => s + q.mean_ms * q.calls, 0) /
            Math.max(1, a.queries.reduce((s, q) => s + q.calls, 0))
          ).toFixed(1)} ms each`
        : '';
    if (a.queryCount === 0 && name.startsWith('load-')) {
      parts.push('and runs 0 database queries (this page is pre-built, so viewing it costs nothing)');
    } else {
      parts.push(`and runs ${a.queryCount} database quer${a.queryCount === 1 ? 'y' : 'ies'}${mean}`);
    }
  }
  if (a.prefetch) {
    parts.push(
      `plus ${a.prefetch} background page-preloads (Next.js prefetching links as they scroll into view - normal)`
    );
  }
  const load = a.loadMs ? ` The page finished loading in ${sec(a.loadMs)}.` : '';
  const csp = a.browserSupabaseBlockedByCsp
    ? ` (${a.browserSupabaseBlockedByCsp} browser call(s) to Supabase were blocked by the security policy in this local setup - they are attempts the browser makes in production.)`
    : '';
  return `  ${label}: ${parts.join(' ')}.${load}${csp}`;
}

function sanityFlags(current) {
  const flags = [];
  for (const [name, a] of Object.entries(current.actions)) {
    const label = ACTION_LABELS[name] ?? name;
    const isPageLoad = name.startsWith('load-');
    const budget = isPageLoad ? SANITY.maxRequestsPerPageLoad : SANITY.maxRequestsPerAction;
    if (a.requests > budget) {
      flags.push(
        `${label} fires ${a.requests} network requests - that is a lot for ${isPageLoad ? 'a page load' : 'one action'} regardless of baseline (rule of thumb: keep it under ${budget}). Look for calls that can be combined or cached.`
      );
    }
    if ((a.queryCount ?? 0) > SANITY.maxQueriesPerAction) {
      flags.push(
        `${label} runs ${a.queryCount} database queries - more than the ${SANITY.maxQueriesPerAction} a single action should normally need. Look for queries that can be combined.`
      );
    }
    for (const q of a.queries ?? []) {
      if (q.calls >= SANITY.duplicateQueryCalls) {
        flags.push(
          `${label} runs the SAME query ${q.calls} times ("${shortQuery(q.query)}"). That pattern usually means a loop is querying once per item (an "N+1" problem) - fetch the list in one query instead.`
        );
      }
    }
    for (const u of a.urls ?? []) {
      if (u.count >= SANITY.duplicateRequestCount) {
        flags.push(
          `${label} fires the same request ${u.count} times (${u.url}) - a duplicated call; it should be made once and shared/cached.`
        );
      }
    }
  }
  for (const [slug, p] of Object.entries(current.lighthouse)) {
    const label = PAGES.find((x) => x.slug === slug)?.label ?? slug;
    if (p.score < SANITY.minScore)
      flags.push(`${label} scores ${p.score}/100 on performance - below the ${SANITY.minScore} healthy floor.`);
    if (p.lcpMs > SANITY.maxLcpMs)
      flags.push(
        `${label} takes ${sec(p.lcpMs)} to show its biggest content - users perceive anything over ${sec(SANITY.maxLcpMs)} as slow. Usually an unoptimized hero image or slow data fetch.`
      );
    if (p.tbtMs > SANITY.maxTbtMs)
      flags.push(`${label} blocks interaction for ${p.tbtMs} ms while JavaScript runs - over the ${SANITY.maxTbtMs} ms guideline.`);
    if (p.totalBytes > SANITY.maxPageBytes)
      flags.push(`${label} weighs ${kb(p.totalBytes)} - heavier than the ~${kb(SANITY.maxPageBytes)} guideline. Check image sizes first.`);
  }
  return flags;
}

function compare(baseline, current) {
  const findings = [];
  for (const [name, cur] of Object.entries(current.actions)) {
    const base = baseline.actions?.[name];
    const label = ACTION_LABELS[name] ?? name;
    if (!base) {
      findings.push({ worse: false, text: `${label} is new since the baseline - baseline updated to include it.` });
      continue;
    }
    if (WORSE.count(base.requests, cur.requests)) {
      const baseUrls = new Map((base.urls ?? []).map((u) => [u.url, u.count]));
      const newUrls = (cur.urls ?? []).filter((u) => !baseUrls.has(u.url)).map((u) => u.url);
      const grown = (cur.urls ?? []).filter((u) => (baseUrls.get(u.url) ?? 0) > 0 && u.count > baseUrls.get(u.url));
      let why = '';
      if (newUrls.length) why += ` New calls that were not there before: ${newUrls.slice(0, 5).join(', ')}.`;
      for (const g of grown.slice(0, 3))
        why += ` ${g.url} now fires ${g.count} times (was ${baseUrls.get(g.url)}) - a duplicated call; make it once and reuse the result.`;
      findings.push({
        worse: true,
        text: `${label} now fires ${cur.requests} network requests (baseline: ${base.requests}).${why || ' Compare recent changes to this page.'}`,
      });
    }
    if (
      base.queryCount !== null &&
      cur.queryCount !== null &&
      WORSE.queryCount(base.queryCount ?? 0, cur.queryCount ?? 0)
    ) {
      const baseQ = new Map((base.queries ?? []).map((q) => [shortQuery(q.query), q.calls]));
      const newQ = (cur.queries ?? []).filter((q) => !baseQ.has(shortQuery(q.query)));
      const grownQ = (cur.queries ?? []).filter(
        (q) => baseQ.has(shortQuery(q.query)) && q.calls > baseQ.get(shortQuery(q.query))
      );
      let why = '';
      if (newQ.length)
        why += ` New quer${newQ.length === 1 ? 'y' : 'ies'}: ${newQ
          .slice(0, 3)
          .map((q) => `"${shortQuery(q.query)}"`)
          .join('; ')} - added by a recent change?`;
      for (const g of grownQ.slice(0, 3))
        why += ` "${shortQuery(g.query)}" now runs ${g.calls} times (was ${baseQ.get(shortQuery(g.query))}) - likely a loop querying per item; batch it into one query.`;
      findings.push({
        worse: true,
        text: `${label} now runs ${cur.queryCount} database queries (baseline: ${base.queryCount}).${why}`,
      });
    }
    if (cur.loadMs && base.loadMs && WORSE.timeMs(base.loadMs, cur.loadMs)) {
      findings.push({
        worse: true,
        text: `${label} now takes ${sec(cur.loadMs)} (baseline: ${sec(base.loadMs)}). If requests/queries did not grow, the server is doing more work per request - check recently added data fetching on this page, or a missing cache.`,
      });
    }
  }
  for (const [slug, cur] of Object.entries(current.lighthouse)) {
    const base = baseline.lighthouse?.[slug];
    const label = PAGES.find((x) => x.slug === slug)?.label ?? slug;
    if (!base) continue;
    if (WORSE.score(base.score, cur.score))
      findings.push({
        worse: true,
        text: `${label} performance score dropped to ${cur.score}/100 (baseline: ${base.score}).`,
      });
    if (WORSE.timeMs(base.lcpMs, cur.lcpMs))
      findings.push({
        worse: true,
        text: `${label} shows its biggest content in ${sec(cur.lcpMs)} (baseline: ${sec(base.lcpMs)}) - usually a bigger hero image, a new blocking script, or a slower data fetch.`,
      });
    if (WORSE.bytes(base.totalBytes, cur.totalBytes))
      findings.push({
        worse: true,
        text: `${label} now weighs ${kb(cur.totalBytes)} (baseline: ${kb(base.totalBytes)}) - something new is being shipped to the browser; check recently added images or libraries.`,
      });
  }
  return findings;
}

async function main() {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });

  const sb = supabaseEnv();

  if (!(await portFree(3000))) {
    fail('something is already listening on :3000 (a dev server?). Stop it first so the perf server measures the right build.');
  }

  if (SKIP_BUILD) {
    log('perf: --skip-build - reusing the existing .next build (must be a perf build).');
  } else {
    log('perf: building the app against the local Supabase stack...');
    execFileSync('bash', [path.join(ROOT, 'scripts', 'perf-build.sh')], { cwd: ROOT, stdio: 'inherit' });
  }

  const serverEnv = {
    ...process.env,
    NODE_ENV: 'production',
    // Local stack only; blank keys so no email/AI call can ever fire from here.
    SUPABASE_SECRET_KEY: sb.SERVICE_ROLE_KEY,
    RESEND_API_KEY: '',
    OPENAI_API_KEY: '',
    RECAPTCHA_E2E_BYPASS_TOKEN: RECAPTCHA_TOKEN,
  };

  log('perf: starting the production server on :3000...');
  const serverLog = fs.openSync(path.join(TMP, 'server.log'), 'w');
  const server = spawn('npm', ['run', 'start'], {
    cwd: ROOT,
    env: serverEnv,
    stdio: ['ignore', serverLog, serverLog],
    detached: true,
  });
  const stopServer = () => {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  };
  process.on('exit', stopServer);

  try {
    await waitForServer('http://localhost:3000/', 90_000);

    const lighthouse = {};
    for (const p of PAGES) {
      log(`perf: Lighthouse on ${p.urlPath} ...`);
      lighthouse[p.slug] = runLighthouse(p.urlPath, p.slug);
    }

    log('perf: measuring key actions with Playwright + pg_stat_statements...');
    execFileSync(
      path.join(ROOT, 'node_modules', '.bin', 'playwright'),
      ['test', '-c', 'perf/playwright.perf.config.ts'],
      {
        cwd: ROOT,
        stdio: 'inherit',
        env: {
          ...serverEnv,
          PERF_DB_URL: sb.DB_URL,
          PERF_SUPABASE_URL: sb.API_URL,
          PERF_OUT: ACTIONS_OUT,
          PERF_RECAPTCHA_TOKEN: RECAPTCHA_TOKEN,
        },
      }
    );

    const actions = JSON.parse(fs.readFileSync(ACTIONS_OUT, 'utf8'));
    const current = { lighthouse, actions };
    fs.writeFileSync(path.join(TMP, 'last-run.json'), JSON.stringify(current, null, 2));

    const hasBaseline = fs.existsSync(BASELINE_PATH) && !RESET_BASELINE;
    log('');
    log('==============================================================');
    if (!hasBaseline) {
      const baseline = {
        recordedAt: new Date().toISOString(),
        note: 'Recorded by npm run perf. Re-record on purpose with: npm run perf -- --reset-baseline',
        ...current,
      };
      fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2));
      log('YOUR PERFORMANCE BASELINE (first run - nothing to compare yet)');
      log('');
      log('Pages (Lighthouse, desktop):');
      for (const p of PAGES) {
        const m = lighthouse[p.slug];
        log(
          `  ${p.label}: performance score ${m.score}/100 - biggest content visible in ${sec(m.lcpMs)}, total page weight ${kb(m.totalBytes)}, ${m.requestCount} requests.`
        );
      }
      log('');
      log('Key actions (Playwright + local Supabase):');
      for (const [name, a] of Object.entries(actions)) log(describeAction(name, a));
      log('');
      log(`These numbers are now your baseline (saved to perf/baseline.json).`);
      log('Every later `npm run perf` compares against them and flags anything meaningfully worse.');
    } else {
      const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
      const findings = compare(baseline, current);
      const worse = findings.filter((f) => f.worse);
      log(`PERFORMANCE CHECK vs baseline recorded ${baseline.recordedAt?.slice(0, 10) ?? '(unknown)'}`);
      log('');
      if (worse.length === 0) {
        log('Nothing is meaningfully worse than your baseline. Current numbers:');
        for (const p of PAGES) {
          const m = lighthouse[p.slug];
          const b = baseline.lighthouse?.[p.slug];
          log(`  ${p.label}: score ${m.score}/100 (baseline ${b?.score ?? '-'}), weight ${kb(m.totalBytes)}.`);
        }
        for (const [name, a] of Object.entries(actions)) log(describeAction(name, a));
      } else {
        log(`${worse.length} thing(s) got meaningfully worse:`);
        for (const f of worse) log(`  - ${f.text}`);
      }
      for (const f of findings.filter((x) => !x.worse)) log(`  note: ${f.text}`);
    }

    const flags = sanityFlags(current);
    log('');
    if (flags.length) {
      log('Best-practice sanity check (applies regardless of baseline):');
      for (const f of flags) log(`  - ${f}`);
    } else {
      log('Best-practice sanity check: nothing looks excessive.');
    }
    log('==============================================================');
    log('');
    log('perf: note - .next now holds the perf build. Run `npm run build` (or');
    log('perf: `npm run test:build` before the test suite) before other work.');
  } finally {
    stopServer();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
