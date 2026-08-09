/**
 * Chaos static checks - the invariants behind the findings in chaos/findings.json,
 * encoded so they are enforced by a runner instead of by somebody remembering.
 *
 * WHY STATIC. This repo's real gate is .husky/pre-push, not CI, because Actions
 * minutes are scarce (see .github/workflows/lint.yml). These checks parse source
 * and finish in about a second, so they can run on every push for free - which
 * makes them the right home for the *class* of each bug found, rather than the
 * one instance of it.
 *
 * Each check maps to a systemic acceptance criterion. When a finding is fixed,
 * its check should go from failing to passing and STAY passing forever; that is
 * the whole point of graduating a finding into a runner.
 *
 * Run:  npm run chaos:static          (report + exit 1 on any violation)
 *       npm run chaos:static -- --baseline   (rewrite the accepted baseline)
 *
 * BASELINE. Several of these classes have many known instances that are not
 * fixed yet (CM-14 alone spans ~45 call sites). Failing the build on all of
 * them today would just get the check disabled, so known violations live in
 * chaos/static-baseline.json and only NEW ones fail. Shrink the baseline as
 * findings close; never grow it silently.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = process.cwd();
const BASELINE_PATH = 'chaos/static-baseline.json';

interface Violation { check: string; file: string; line: number; detail: string }

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

const files = walk(join(ROOT, 'src'));
const read = (f: string) => readFileSync(f, 'utf8');
const rel = (f: string) => relative(ROOT, f);
const lineOf = (src: string, idx: number) => src.slice(0, idx).split('\n').length;

const violations: Violation[] = [];
const add = (check: string, file: string, line: number, detail: string) =>
  violations.push({ check, file: rel(file), line, detail });

/**
 * Tables whose row count grows with the business. A read of one of these with
 * no explicit ceiling silently inherits the server's own page limit, which is
 * how CM-07 shipped a truncation counter that can never fire.
 */
const GROWING_TABLES = [
  'leads', 'email_log', 'follow_up_queue', 'homeowners', 'seo_metrics', 'content_actions',
  'click_tracking', 'proposals', 'proposal_lines', 'proposal_submissions', 'referrals',
  'newsletter_subscribers', 'email_preferences', 'review_sync_log', 'homeowner_maintenance',
  'home_records', 'lead_intake_sessions', 'subscriber_activity', 'visit_dispatch',
];

// ---- CM-14 / CM-07: reads of growing tables with no explicit row cap --------
for (const file of files) {
  const src = read(file);

  // supabaseRest('GET', 'table?select=...')  - the server-side PostgREST helper
  const restCalls = [...src.matchAll(/supabaseRest(?:Counted)?[^(]*\(\s*['"]GET['"]\s*,\s*[`'"]([^`'"]+)[`'"]/g)];
  for (const m of restCalls) {
    const path = m[1];
    const table = path.split('?')[0].split('/')[0];
    if (!GROWING_TABLES.includes(table)) continue;
    if (/[?&]limit=/.test(path)) continue;
    add('uncapped-read', file, lineOf(src, m.index!), `${table} read with no limit= (inherits the server page ceiling)`);
  }

  // .from('table')... without .limit(/.range( before the statement ends
  const fromCalls = [...src.matchAll(/\.from\(\s*['"]([a-z_]+)['"]\s*\)/g)];
  for (const m of fromCalls) {
    const table = m[1];
    if (!GROWING_TABLES.includes(table)) continue;
    const tail = src.slice(m.index!, m.index! + 700);
    const stmt = tail.split(/;\n|\n\n/)[0];
    if (/\.(limit|range)\(/.test(stmt)) continue;
    if (/head:\s*true/.test(stmt)) continue; // count-only, handled below
    if (/\.(insert|update|upsert|delete)\(/.test(stmt)) continue;
    if (!/\.select\(/.test(stmt)) continue;
    add('uncapped-read', file, lineOf(src, m.index!), `${table} select with no .limit()/.range()`);
  }
}

// ---- CM-11: guards that fail OPEN when their own secret is missing ----------
for (const file of files.filter((f) => f.includes('/api/'))) {
  const src = read(file);
  // `const k = process.env.X; if (k) { ...check... }` - no key means no check
  for (const m of src.matchAll(/const\s+(\w+)\s*=\s*process\.env\.(\w*(?:KEY|SECRET|TOKEN))\s*;?[\s\S]{0,120}?if\s*\(\s*\1\s*\)\s*\{/g)) {
    add('fail-open-guard', file, lineOf(src, m.index!),
      `guard runs only when ${m[2]} is set - unset means unguarded, not unavailable`);
  }
}

// ---- CM-05: token-authenticated pages must be excluded from analytics ------
{
  const analytics = files.find((f) => f.endsWith('components/Analytics.tsx'));
  const layout = files.find((f) => f.endsWith('app/layout.tsx'));
  // Every dynamic route segment literally named [token]
  const tokenRoutes = walk(join(ROOT, 'src/app'))
    .filter((f) => /\[token\]/.test(f) && /page\.tsx$/.test(f))
    .map((f) => rel(f).replace('src/app', '').replace('/page.tsx', ''));

  const analyticsSrc = analytics ? read(analytics) : '';
  const layoutSrc = layout ? read(layout) : '';
  for (const route of tokenRoutes) {
    const seg = route.split('/').filter(Boolean)[0];
    if (!seg) continue;
    const excluded = analyticsSrc.includes(`/${seg}`) || /isAnalyticsExcluded/.test(analyticsSrc);
    if (!excluded) {
      add('analytics-on-token-page', analytics ?? 'src/components/Analytics.tsx', 1,
        `/${seg} is token-authenticated but is not in the analytics exclusion list`);
    }
  }
  // Clarity / Meta Pixel are mounted in the root layout with no path condition
  if (/clarity\.ms/.test(layoutSrc) && !/isAnalyticsExcluded|usePathname/.test(layoutSrc)) {
    add('analytics-on-token-page', layout!, lineOf(layoutSrc, layoutSrc.indexOf('clarity.ms')),
      'session recording is mounted globally with no path exclusion');
  }
}

// ---- CM-12: the browser must not duplicate a server-side notification ------
for (const file of files.filter((f) => f.includes('/components/'))) {
  const src = read(file);
  const i = src.indexOf('send-lead-notification');
  if (i >= 0) {
    add('duplicate-owner-alert', file, lineOf(src, i),
      'browser invokes send-lead-notification; /api/leads/submit already notifies server-side');
  }
}

// ---- CM-01 / CM-08: public routes that spend or send need a gate -----------
{
  const mwSrc = read(join(ROOT, 'src/middleware.ts'));
  const publicBlock = mwSrc.slice(mwSrc.indexOf('const PUBLIC_ROUTES'), mwSrc.indexOf('function isPublicRoute'));
  const publicPrefixes = [...publicBlock.matchAll(/['"](\/api\/[^'"]+)['"]/g)].map((m) => m[1]);

  const SPENDS = /sendTrackedEmail|sendTelegram|createLeadFollowUpSequence|resend\.emails|sendNewLeadEmail|sendFormFailureAlert/;
  /** Anything that authenticates the CALLER. */
  const AUTH_GATES = /verifyInternalSecret|new Webhook\(|\.verify\(|verifyRecaptcha|assessRecaptcha|requestChallenge/;
  /** A per-request capability token in the URL - authentication, but guessable in principle. */
  const TOKEN_GATE = /lookupByToken|\[token\]|params.*token|token=eq\./;
  /** Anything that bounds how OFTEN. */
  const RATE_GATE = /checkRateLimit/;

  for (const file of files.filter((f) => f.includes('/app/api/'))) {
    const routePath = '/' + rel(file).replace('src/app/', '').replace('/route.ts', '');
    const isPublic = publicPrefixes.some((p) => routePath.startsWith(p));
    if (!isPublic) continue;
    const src = read(file);
    if (!SPENDS.test(src)) continue;

    const authed = AUTH_GATES.test(src);
    const tokened = TOKEN_GATE.test(src) || /\[token\]/.test(file);
    const limited = RATE_GATE.test(src);

    if (!authed && !tokened && !limited) {
      // Nothing at all stands between the internet and an outbound send.
      add('ungated-spend-path', file, 1,
        `${routePath} is public and can send outbound, with no auth, token, captcha or rate limit`);
    } else if (tokened && !limited && !authed) {
      // The token is the only thing between a guesser and a send. Sound only
      // while the token has real entropy, and unbounded guessing is free.
      add('unthrottled-token-spend', file, 1,
        `${routePath} authenticates by URL token but has no rate limit - token guessing is unbounded`);
    }
  }
}

// ---------------------------------------------------------------------------
const baseline: Violation[] = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  : [];
const key = (v: Violation) => `${v.check}|${v.file}|${v.detail}`;
const baselineKeys = new Set(baseline.map(key));

if (process.argv.includes('--baseline')) {
  writeFileSync(BASELINE_PATH, JSON.stringify(violations, null, 2));
  console.log(`baseline rewritten: ${violations.length} known violations recorded in ${BASELINE_PATH}`);
  process.exit(0);
}

const fresh = violations.filter((v) => !baselineKeys.has(key(v)));
const fixed = baseline.filter((b) => !violations.some((v) => key(v) === key(b)));

const byCheck = new Map<string, number>();
for (const v of violations) byCheck.set(v.check, (byCheck.get(v.check) ?? 0) + 1);

console.log('\nchaos static checks');
console.log('-------------------');
for (const [check, n] of [...byCheck].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${check.padEnd(26)} ${n} instance${n === 1 ? '' : 's'}`);
}
console.log(`\n  total ${violations.length}, baselined ${baseline.length}, NEW ${fresh.length}, fixed since baseline ${fixed.length}`);

if (fixed.length) {
  console.log('\nfixed since the baseline was taken - re-run with --baseline to lock the improvement in:');
  for (const f of fixed.slice(0, 10)) console.log(`  ${f.check} ${f.file} ${f.detail}`);
}
if (fresh.length) {
  console.log('\nNEW violations (these fail the build):');
  for (const v of fresh) console.log(`  [${v.check}] ${v.file}:${v.line}  ${v.detail}`);
  process.exit(1);
}
console.log('\nno new violations.\n');
