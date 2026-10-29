/**
 * Phase 2 slice H - experiments (docs/phase-2/acceptance-criteria.md, EX1-EX7,
 * "Experiments (slice H, decision 005)", SEC1).
 *
 * Two halves:
 *  - Units and source checks that run everywhere: the evaluator against
 *    hand-computed fixtures (EX4), the payload schema that cannot address a
 *    price, the assignment rule, the veto token, the messages, the wiring.
 *  - Live-backend checks against the LOCAL rig only (they write rows): every
 *    experiment they create is keyed `slice-h-*`, every request is named
 *    `slice-h*`, and afterAll deletes exactly those. `landing-hero` and the two
 *    homepage buttons are only read (and previewed), never changed.
 *
 * Run: TEST_URL=http://localhost:3120 E2E_LIVE_BACKEND=1 \
 *      node_modules/.bin/playwright test tests/experiments.spec.ts --project=chromium --workers=1
 * The env is read from the shell, else from .env.local.
 */
import { randomBytes, randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { test, expect, devices, request as pwRequest, type APIRequestContext, type Browser, type BrowserContext } from '@playwright/test';
import { SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON } from './helpers/liveBackend';
import { betaSample, evaluate, mulberry32, projectReadyOn } from '../src/lib/experiments/evaluate';
import { assignVariant, hashName, resolveAssignment } from '../src/lib/experiments/assign';
import { seedFromCookie, parsePreview } from '../src/lib/experiments/seed';
import { ctaIndex } from '../src/lib/cta/assign';
import {
  forbiddenClaim,
  NO_PRICE_SLOTS,
  PAYLOAD_SLOTS,
  payloadSchema,
  PRICE_FIELDS,
  type ExperimentPayload,
  type ExperimentVariant,
} from '../src/lib/experiments/types';
import { createExperimentSchema, priceFieldsIn } from '../src/lib/experiments/schemas';
import { createVetoToken, verifyVetoToken } from '../src/lib/experiments/vetoToken';
import { winnerProposedMessage } from '../src/lib/experiments/messages';
import { evaluate as evaluateFn } from '../src/lib/experiments/evaluate';

const ROOT = join(__dirname, '..');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Hand computation for EX4: exact Beta integrals on a fine grid, independent
// of the Monte Carlo the evaluator uses.
// ---------------------------------------------------------------------------
function lgamma(x: number): number {
  // Lanczos approximation (g = 7, n = 9).
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
function betaPdf(x: number, a: number, b: number): number {
  if (x <= 0 || x >= 1) return 0;
  return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) + lgamma(a + b) - lgamma(a) - lgamma(b));
}
/** P(B > A) and E[max(A - B, 0)] for independent Beta posteriors, by quadrature. */
function exactCompare(control: [number, number], challenger: [number, number], n = 20000) {
  const h = 1 / n;
  let cdfB = 0; // P(B <= x)
  let partialB = 0; // E[B; B <= x]
  let pBeat = 0;
  let loss = 0;
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * h;
    const fb = betaPdf(x, challenger[0], challenger[1]) * h;
    cdfB += fb / 2;
    partialB += (x * fb) / 2;
    const fa = betaPdf(x, control[0], control[1]) * h;
    pBeat += fa * (1 - cdfB);
    loss += fa * (x * cdfB - partialB);
    cdfB += fb / 2;
    partialB += (x * fb) / 2;
  }
  return { pBeat, loss };
}

const arm = (key: string, visitors: number, conversions: number, revenue_cents = 0) => ({ key, visitors, conversions, revenue_cents });

test.describe('experiments - units and source (EX4, payload, assignment)', () => {
  const now = new Date('2026-11-16T07:30:00Z');
  const started20 = new Date(now.getTime() - 20 * DAY).toISOString();

  test('EX4: a clear winner at 300 visitors per arm passes', () => {
    const r = evaluate({ control_key: 'A', arms: [arm('A', 300, 15), arm('B', 300, 45)], min_visitors: 200, min_days: 14, started_at: started20, now });
    expect(r.sample.guard_met).toBe(true);
    expect(r.verdict.kind).toBe('winner');
    expect(r.verdict).toMatchObject({ winner_key: 'B' });
    const b = r.arms.find((a) => a.key === 'B')!;
    expect(b.p_beat_control!).toBeGreaterThanOrEqual(0.95);
    expect(b.expected_loss!).toBeLessThanOrEqual(0.005);
    expect(r.draws).toBe(10_000);
  });

  test('EX4: the same rates at 50 visitors return "not enough data" with a date', () => {
    const started5 = new Date(now.getTime() - 5 * DAY).toISOString();
    const r = evaluate({ control_key: 'A', arms: [arm('A', 50, 3), arm('B', 50, 8)], min_visitors: 200, min_days: 14, started_at: started5, now });
    expect(r.verdict.kind).toBe('not_enough_data');
    // 50 visitors in 5 days is 10 a day: 150 more take 15 days, later than the 14-day mark (9 days away).
    expect(r.verdict).toMatchObject({ ready_on: '2026-12-01' });
    expect(r.verdict.reason).toContain('50 of 200 visitors');
    // The same rates with enough visitors but too young: still not enough, and the date is the day mark.
    const young = evaluate({ control_key: 'A', arms: [arm('A', 300, 15), arm('B', 300, 45)], min_visitors: 200, min_days: 14, started_at: started5, now });
    expect(young.verdict).toMatchObject({ kind: 'not_enough_data', ready_on: '2026-11-25' });
    // No start, no visitors: no date to promise.
    expect(projectReadyOn({ started_at: null, now, min_days: 14, min_visitors: 200, smallest_arm: 0 })).toBeNull();
  });

  test('EX4: a loser retires (two arms: the control wins; three arms: only the loser goes)', () => {
    const two = evaluate({ control_key: 'A', arms: [arm('A', 300, 45), arm('B', 300, 15)], min_visitors: 200, min_days: 14, started_at: started20, now });
    expect(two.verdict).toMatchObject({ kind: 'control_wins', winner_key: 'A', retire: ['B'] });
    expect(two.arms.find((a) => a.key === 'B')!.p_beat_control!).toBeLessThanOrEqual(0.05);
    const three = evaluate({
      control_key: 'A',
      arms: [arm('A', 300, 30), arm('B', 300, 9), arm('C', 300, 32)],
      min_visitors: 200, min_days: 14, started_at: started20, now,
    });
    expect(three.verdict).toMatchObject({ kind: 'retire_losers', retire: ['B'] });
  });

  test('EX4: p_beat_control and expected loss match the exact integrals; revenue per visitor is exact', () => {
    // A: 20 of 200, B: 26 of 200 -> posteriors Beta(21, 181) and Beta(27, 175).
    const exact = exactCompare([21, 181], [27, 175]);
    const r = evaluate({ control_key: 'A', arms: [arm('A', 200, 20, 600_000), arm('B', 200, 26, 1_050_000)], min_visitors: 200, min_days: 14, started_at: started20, now });
    const b = r.arms.find((a) => a.key === 'B')!;
    // Monte Carlo standard error at 10,000 draws is about 0.005 for p and far less for the loss.
    expect(Math.abs(b.p_beat_control! - exact.pBeat), `p mc=${b.p_beat_control} exact=${exact.pBeat}`).toBeLessThan(0.015);
    expect(Math.abs(b.expected_loss! - exact.loss), `loss mc=${b.expected_loss} exact=${exact.loss}`).toBeLessThan(0.0006);
    expect(exact.pBeat).toBeGreaterThan(0.8);
    expect(exact.pBeat).toBeLessThan(0.86);
    // Neither threshold crossed: keep running.
    expect(r.verdict.kind).toBe('keep_running');
    // Revenue per visitor: $6,000 over 200 visitors is $30.00; $10,500 over 200 is $52.50.
    expect(r.arms.find((a) => a.key === 'A')!.revenue_per_visitor_cents).toBe(3000);
    expect(b.revenue_per_visitor_cents).toBe(5250);
    expect(r.arms.find((a) => a.key === 'A')!.rate).toBeCloseTo(0.1, 10);
  });

  test('EX4: seeded and pure - the same input gives the same output, and the sampler matches the Beta mean', () => {
    const input = { control_key: 'A', arms: [arm('A', 210, 21), arm('B', 220, 30)], min_visitors: 200, min_days: 14, started_at: started20, now, seed: 42 };
    expect(evaluateFn(input)).toEqual(evaluateFn(input));
    const rand = mulberry32(7);
    let sum = 0;
    for (let i = 0; i < 20000; i++) sum += betaSample(3, 7, rand);
    expect(sum / 20000).toBeCloseTo(0.3, 2);
    // A single variant has nothing to compare.
    expect(evaluate({ ...input, arms: [arm('A', 500, 50)] }).verdict.kind).toBe('single_variant');
  });

  test('prices are unaddressable: no payload slot is a price, and the schema refuses every price field', () => {
    expect(NO_PRICE_SLOTS).toBe(true);
    for (const slot of PAYLOAD_SLOTS) expect(slot, slot).not.toMatch(/price|cents|minimum|amount|cost/i);
    for (const field of [...PRICE_FIELDS, 'price', 'startingPrice']) {
      expect(payloadSchema.safeParse({ [field]: { en: 'x', es: 'x' } }).success, field).toBe(false);
      expect(payloadSchema.safeParse({ title: { en: 'ok', es: 'ok' }, [field]: 1999 }).success, field).toBe(false);
    }
    // Type level: a payload object literal cannot carry a price field.
    // @ts-expect-error priceDisplay is not a payload slot
    const typed: ExperimentPayload = { title: { en: 'a' }, priceDisplay: { en: '$99' } };
    expect(typed).toBeTruthy();
    // Nested anywhere in a create body, a price-looking key is found before validation.
    expect(priceFieldsIn([{ key: 'A', payload: { title: { en: 'x' }, startingPriceCents: 1 } }, { payload: { deep: { minimumCents: 1 } } }]))
      .toEqual(['0.payload.startingPriceCents', '1.payload.deep.minimumCents']);
    // Copy cannot carry an amount, the phone number or the license either.
    expect(forbiddenClaim('Only $99 this week')).toMatch(/price/);
    expect(forbiddenClaim('Save 20% today')).toMatch(/percentage/);
    expect(forbiddenClaim('Call 201-212-4917')).toMatch(/phone/);
    expect(forbiddenClaim('NJ HIC licensed')).toMatch(/license/);
    expect(forbiddenClaim('Pick your services. See the price. Sit back.')).toBeNull();
    expect(payloadSchema.safeParse({ title: { en: 'From $149', es: 'Desde $149' } }).success).toBe(false);
    // The surfaces read through withExperiment never pass a price: the page reads prices from the catalog only.
    const page = src('src/app/home-services/page.tsx');
    const lines = page.split('\n');
    for (const field of ['priceDisplay', 'startingPriceCents', 'minimumCents']) {
      expect(lines.filter((l) => l.includes(field) && /payload|hero\.|heading\./.test(l)), field).toEqual([]);
    }
  });

  test('create schema: surface, both languages, the same slots, a full section order', () => {
    const v = (key: string, title: string, es = `${title} es`) => ({ key, label: key, payload: { title: { en: title, es } } });
    const base = { key: 'slice-h-unit', page: '/home-services', element: 'hero', hypothesis: 'A shorter hero title raises request starts.', expected_effect: 'request_submitted up about 10%' };
    expect(createExperimentSchema.safeParse({ ...base, variants: [v('A', 'One'), v('B', 'Two')] }).success).toBe(true);
    const issues = (body: unknown) => (createExperimentSchema.safeParse(body).error?.issues ?? []).map((i) => i.message).join(' | ');
    expect(issues({ ...base, element: 'price-table', variants: [v('A', 'One'), v('B', 'Two')] })).toMatch(/Nothing renders/);
    expect(issues({ ...base, variants: [v('A', 'One'), { key: 'B', label: 'B', payload: { title: { en: 'Two' } } }] })).toMatch(/Both languages/);
    expect(issues({ ...base, variants: [v('A', 'One'), { key: 'B', label: 'B', payload: { eyebrow: { en: 'x', es: 'y' } } }] })).toMatch(/same slots/);
    expect(issues({ ...base, variants: [v('A', 'One')] })).toMatch(/control and at least one challenger/);
    expect(issues({ ...base, hypothesis: 'short', variants: [v('A', 'One'), v('B', 'Two')] })).toMatch(/hypothesis/);
    const order = (key: string, ids: string[]) => ({ key, label: key, payload: { order: ids } });
    const full = ['services', 'how-it-works', 'trust', 'faq', 'home-care', 'closer'];
    expect(createExperimentSchema.safeParse({ ...base, element: 'sections', variants: [order('A', full), order('B', [full[1], full[0], ...full.slice(2)])] }).success).toBe(true);
    expect(issues({ ...base, element: 'sections', variants: [order('A', full), order('B', full.slice(1))] })).toMatch(/each section exactly once/);
    expect(issues({ ...base, key: 'backlog', variants: [v('A', 'One'), v('B', 'Two')] })).toMatch(/reserved/);
  });

  test('EX2 (unit): the assignment reuses the Phase 1 hash; a crawler and a seedless visitor get the control; a preview names its variant', () => {
    const variants: ExperimentVariant[] = ['A', 'B', 'C'].map((k) => ({ key: k as 'A', label: k, payload: { title: { en: k } } }));
    const seed = 'a2d5dd73ae634ca142e73a6855878688';
    expect(assignVariant(seed, 'landing-hero', variants)!.key).toBe(['A', 'B', 'C'][ctaIndex(seed, 'landing-hero', 3)]);
    // The migrated buttons keep their Phase 1 hash names, so nobody is moved.
    expect(hashName('hero-primary')).toBe('primary');
    expect(hashName('hero-secondary')).toBe('secondary');
    // A switched-off variant leaves the pool; order is by key.
    const withOff = variants.map((v) => (v.key === 'B' ? { ...v, active: false } : v));
    expect(['A', 'C']).toContain(assignVariant(seed, 'x', withOff)!.key);
    const human = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
    const base = { experimentKey: 'landing-hero', variants, controlKey: 'A', seed };
    expect(resolveAssignment({ ...base, userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' })).toMatchObject({ reason: 'crawler', track: false, variant: { key: 'A' } });
    expect(resolveAssignment({ ...base, userAgent: 'facebookexternalhit/1.1' })).toMatchObject({ reason: 'crawler', variant: { key: 'A' } });
    expect(resolveAssignment({ ...base, seed: null, userAgent: human })).toMatchObject({ reason: 'no_seed', track: false, variant: { key: 'A' } });
    expect(resolveAssignment({ ...base, userAgent: human })).toMatchObject({ reason: 'hash', track: true });
    expect(resolveAssignment({ ...base, userAgent: human, previewKey: 'C' })).toMatchObject({ reason: 'preview', track: false, variant: { key: 'C' } });
    // The seed reads from every form the cookie takes.
    expect(seedFromCookie(`P%3DA%3BS%3DA%3BR%3D${seed}`)).toBe(seed);
    expect(seedFromCookie(`R%3D${seed}`)).toBe(seed);
    expect(seedFromCookie(`P=B;S=A;R=${seed}`)).toBe(seed);
    expect(seedFromCookie('R%3Dnothex')).toBeNull();
    expect(parsePreview('landing-hero:B')).toEqual({ key: 'landing-hero', variant: 'B' });
    expect(parsePreview('landing-hero:Z')).toBeNull();
    expect(parsePreview('Landing:B')).toBeNull();
  });

  test('veto token: signed, timing-safe, 7 days, and bound to its proposal', () => {
    const env = { INTERNAL_WEBHOOK_SECRET: 'unit-test-secret-0123456789abcdef' };
    const at = '2026-11-16T07:30:00.000Z';
    const token = createVetoToken('landing-hero', at, env)!;
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    expect(verifyVetoToken(token, new Date(at), env)).toEqual({ ok: true, experimentKey: 'landing-hero', notifiedAtUnix: Date.parse(at) / 1000 });
    expect(verifyVetoToken(token, new Date(Date.parse(at) + 8 * DAY), env)).toEqual({ ok: false, reason: 'expired' });
    expect(verifyVetoToken(`${token.slice(0, -2)}AA`, new Date(at), env)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(verifyVetoToken(token, new Date(at), { INTERNAL_WEBHOOK_SECRET: 'another-secret-0123456789abcdef!' })).toEqual({ ok: false, reason: 'bad_signature' });
    expect(verifyVetoToken(token, new Date(at), {})).toEqual({ ok: false, reason: 'not_configured' });
    expect(verifyVetoToken('nodot', new Date(at), env)).toEqual({ ok: false, reason: 'malformed' });
    expect(src('src/lib/experiments/vetoToken.ts')).toContain('timingSafeEqual');
  });

  test('the winner message carries the veto link and the promotion time', () => {
    const text = winnerProposedMessage({
      row: { key: 'landing-hero', page: '/home-services', control_key: 'A', primary_metric: 'request_submitted', variants: [{ key: 'A', label: 'One-stop', payload: {} }, { key: 'B', label: 'Three <steps>', payload: {} }] as ExperimentVariant[] },
      winnerKey: 'B',
      evaluation: null,
      promoteAfter: '2026-11-17T07:30:00.000Z',
      vetoUrl: 'https://www.lavacagc.com/experiments/veto/abc.def',
      by: 'cron',
    });
    expect(text).toContain('Veto: https://www.lavacagc.com/experiments/veto/abc.def');
    expect(text).toContain('2026-11-17 07:30 UTC');
    expect(text).toContain('Three &lt;steps&gt;');
  });

  test('SEC1 + wiring: routes self-guarded and listed, the cron registered, the migration guarded, the preview header ours only', () => {
    const mw = src('src/middleware.ts');
    const publicBlock = mw.slice(mw.indexOf('const PUBLIC_ROUTES'), mw.indexOf('function isPublicRoute'));
    expect(publicBlock).toContain("'/api/experiments/'");
    expect(mw).toContain('requestHeaders.delete(PREVIEW_HEADER)');
    expect(mw).toMatch(/PREVIEW_RE\.test\(preview\)[\s\S]{0,120}verifySupabaseSession\(request\)/);
    for (const route of ['route.ts', 'report/route.ts', 'backlog/route.ts', 'notify/route.ts', '[key]/start/route.ts', '[key]/conclude/route.ts']) {
      const file = src(`src/app/api/experiments/${route}`);
      expect(file, route).toContain('authorizeExperiments(request)');
    }
    expect(src('src/lib/experiments/auth.server.ts')).toContain('`experiments:${getClientIp(request)}`');
    expect(src('src/app/api/experiments/event/route.ts')).toContain('checkRateLimit(`exp-event:');
    expect(src('src/app/api/experiments/veto/route.ts')).toContain('checkRateLimit(`exp-veto:');
    const cron = JSON.parse(src('vercel.json')).crons.find((c: { path: string }) => c.path === '/api/cron/experiments-evaluate');
    expect(cron?.schedule).toBe('30 7 * * 1');
    const migration = src('supabase/migrations/20261030000003_cta_to_experiments.sql');
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS visitor_id/);
    expect(migration).toMatch(/ON CONFLICT \(key\) DO NOTHING/);
    expect(migration).toMatch(/ON CONFLICT \(experiment_key, variant_key, visitor_id, event\) DO NOTHING/);
    expect(migration).toMatch(/to_regclass\('public\.cta_variants'\) IS NULL/);
    // cta_variants and cta_events are history: nothing in src writes them.
    expect(src('src/app/api/cta/event/route.ts')).not.toMatch(/'cta_events'/);
    expect(src('src/app/api/admin/cta/variants/route.ts')).not.toMatch(/'cta_variants'/);
    // The veto page is analytics-excluded and noindex.
    expect(src('src/lib/analytics/excluded.ts')).toContain('/^\\/experiments\\//');
    expect(src('src/app/experiments/veto/[token]/page.tsx')).toContain('robots: { index: false, follow: false }');
  });
});

// ---------------------------------------------------------------------------
// Live backend (local rig only)
// ---------------------------------------------------------------------------

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of ['.env.local', '.env.development.local']) {
    const file = join(ROOT, name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  return { ...env, ...(process.env as Record<string, string>) };
}

const ENV = loadEnv();
const SB_URL = (ENV.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const SB_KEY = (ENV.SUPABASE_SECRET_KEY || '').trim();
const TOKEN = (ENV.PROJECT_INGEST_TOKEN || '').trim();
const CRON = (ENV.CRON_SECRET || '').trim();
const BYPASS = ENV.RECAPTCHA_E2E_BYPASS_TOKEN || '';
const IS_LOCAL_DB = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(SB_URL);
const BASE = process.env.TEST_URL || 'http://localhost:3000';
const ADMIN = { email: 'slice-h-admin@local.test', password: 'LocalAdmin!2026' };
const DESKTOP = devices['Desktop Chrome'];
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const RUN = randomBytes(3).toString('hex');

async function rest<T = unknown>(method: string, path: string, body?: unknown, prefer = 'return=representation'): Promise<T> {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: prefer },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

interface Row { key: string; status: string; control_key: string; winner_key: string | null; variants: ExperimentVariant[]; decision: Record<string, unknown> & { pending?: { winner_key: string; notified_at: string; promote_after: string } | null; promoted?: { by: string; winner_key: string }; vetoed?: { by: string }; retired?: { by: string } } | null; started_at: string | null }
const experiment = async (key: string) => (await rest<Row[]>('GET', `experiments?select=*&key=eq.${key}`))[0];
interface EventRow { experiment_key: string; variant_key: string; visitor_id: string; event: string; value_cents: number | null }
const eventsOf = (visitor: string) => rest<EventRow[]>('GET', `experiment_events?select=experiment_key,variant_key,visitor_id,event,value_cents&visitor_id=eq.${visitor}&limit=100`);

let ipCounter = 0;
const ip = () => `10.${180 + (parseInt(RUN, 16) % 40)}.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

const apiClients: APIRequestContext[] = [];
async function api(headers: Record<string, string> = {}): Promise<APIRequestContext> {
  const a = ip();
  const ctx = await pwRequest.newContext({
    baseURL: BASE,
    extraHTTPHeaders: { 'cf-connecting-ip': a, 'x-forwarded-for': a, 'user-agent': DESKTOP.userAgent, ...headers },
  });
  apiClients.push(ctx);
  return ctx;
}
const agent = () => api({ Authorization: `Bearer ${TOKEN}` });
/**
 * A visitor API client whose jar starts with this assignment seed. Through the
 * jar, not a Cookie header: an explicit header would replace the jar on every
 * call and drop the cta_vid the server sets.
 */
async function visitorWithSeed(seed: string): Promise<APIRequestContext> {
  const a = ip();
  const host = new URL(BASE).hostname;
  const ctx = await pwRequest.newContext({
    baseURL: BASE,
    extraHTTPHeaders: { 'cf-connecting-ip': a, 'x-forwarded-for': a, 'user-agent': DESKTOP.userAgent },
    storageState: { cookies: [{ name: 'cta_v', value: encodeURIComponent(`R=${seed}`), domain: host, path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }], origins: [] },
  });
  apiClients.push(ctx);
  return ctx;
}

const contexts: BrowserContext[] = [];
async function browserContext(browser: Browser, extra: Parameters<Browser['newContext']>[0] = {}): Promise<BrowserContext> {
  const a = ip();
  const ctx = await browser.newContext({ ...DESKTOP, baseURL: BASE, extraHTTPHeaders: { 'cf-connecting-ip': a, 'x-forwarded-for': a }, ...extra });
  contexts.push(ctx);
  // The homepage gallery reads whatever other slices seeded; the hero never reads it.
  await ctx.route(/\/rest\/v1\/(projects|project_images)(\?|$)/, (route) => route.fulfill({ json: [] }));
  return ctx;
}

async function adminContext(browser: Browser): Promise<BrowserContext> {
  const res = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...ADMIN, email_confirm: true }),
  });
  if (!res.ok && res.status !== 422) throw new Error(`admin user: ${res.status} ${await res.text()}`);
  const ctx = await browserContext(browser);
  const page = await ctx.newPage();
  await page.goto('/auth');
  await page.locator('input[type=email]').fill(ADMIN.email);
  await page.locator('input[type=password]').fill(ADMIN.password);
  await page.locator('button[type=submit]').first().click();
  await page.waitForURL(/\/vaca-mgmt/, { timeout: 30_000 });
  await page.close();
  return ctx;
}

const HERO_KEY = `slice-h-hero-${RUN}`;
const HERO_COPY = {
  A: { eyebrow: { en: 'Slice H control eyebrow', es: 'Slice H control eyebrow es' }, title: { en: `Slice H control title ${RUN}`, es: `Slice H titulo control ${RUN}` } },
  B: { eyebrow: { en: 'Slice H challenger eyebrow', es: 'Slice H challenger eyebrow es' }, title: { en: `Slice H challenger title ${RUN}`, es: `Slice H titulo reto ${RUN}` } },
};
const heroVariants: ExperimentVariant[] = [
  { key: 'A', label: 'Slice H control', payload: HERO_COPY.A },
  { key: 'B', label: 'Slice H challenger', payload: HERO_COPY.B },
];
const heroBody = (key: string, extra: Record<string, unknown> = {}) => ({
  key,
  page: '/home-services',
  element: 'hero',
  hypothesis: 'A distinctive slice H hero title changes how many visitors send a request.',
  expected_effect: 'request_submitted per visitor moves either way; this is a test fixture.',
  variants: heroVariants,
  ...extra,
});
/** A seed whose hash gives `want` for the slice H hero (two active variants, key order). */
function seedFor(want: 'A' | 'B', experimentKey = HERO_KEY): string {
  for (let i = 0; i < 1000; i++) {
    const seed = randomBytes(16).toString('hex');
    if (['A', 'B'][ctaIndex(seed, experimentKey, 2)] === want) return seed;
  }
  throw new Error('no seed');
}
const uuidOf = (cookieValue: string | undefined) => cookieValue?.split('.')[0];

/** Insert a running experiment directly (fixture for the cron and admin tests), with synthetic events. */
async function seedRunning(key: string, page: string, arms: Record<string, { views: number; submitted: number }>, startedDaysAgo = 20) {
  await rest('POST', 'experiments', [{
    key, page, element: 'hero', hypothesis: 'Slice H fixture: a synthetic winner for the weekly evaluator.',
    expected_effect: 'B converts about three times as well as A (fixture).',
    variants: Object.keys(arms).map((k) => ({ key: k, label: `Fixture ${k}`, active: true, payload: { title: { en: `Fixture ${k}`, es: `Fixture ${k}` } } })),
    control_key: 'A', status: 'running', started_at: new Date(Date.now() - startedDaysAgo * DAY).toISOString(), created_by: 'slice-h-spec',
  }], 'return=minimal');
  const events: object[] = [];
  for (const [variant, n] of Object.entries(arms)) {
    for (let i = 0; i < n.views; i++) {
      const visitor = randomUUID();
      events.push({ experiment_key: key, variant_key: variant, visitor_id: visitor, event: 'view' });
      if (i < n.submitted) events.push({ experiment_key: key, variant_key: variant, visitor_id: visitor, event: 'request_submitted' });
    }
  }
  await rest('POST', 'experiment_events', events, 'return=minimal');
}

test.describe('experiments - live backend', () => {
  test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);
  test.skip(!SB_KEY || !IS_LOCAL_DB || !TOKEN || !CRON, `needs SUPABASE_SECRET_KEY, PROJECT_INGEST_TOKEN, CRON_SECRET and a LOCAL Supabase (got "${SB_URL}"); these tests write rows`);
  test.describe.configure({ mode: 'serial' });

  test.afterAll(async () => {
    for (const c of contexts) await c.close().catch(() => undefined);
    for (const a of apiClients) await a.dispose().catch(() => undefined);
    await new Promise((r) => setTimeout(r, 1500));
    // Events cascade with their experiment.
    await rest('DELETE', 'experiments?key=like.slice-h-*', undefined, 'return=minimal');
    await rest('DELETE', 'experiment_backlog?source=eq.slice-h-spec', undefined, 'return=minimal');
    await rest('DELETE', 'home_service_requests?first_name=like.slice-h*', undefined, 'return=minimal');
    await rest('DELETE', 'leads?first_name=like.slice-h*', undefined, 'return=minimal').catch(() => undefined);
  });

  test('EX1: the two Phase 1 buttons are running experiments with their variants and history; landing-hero is the seeded draft', async ({ browser }) => {
    const [primary, secondary, landing] = await Promise.all([experiment('hero-primary'), experiment('hero-secondary'), experiment('landing-hero')]);
    const legacy = await rest<Array<{ button: string; variant_key: string; wording: string; active: boolean }>>('GET', 'cta_variants?select=button,variant_key,wording,active&order=variant_key.asc');
    for (const [button, row] of [['primary', primary], ['secondary', secondary]] as const) {
      expect(row.status).toBe('running');
      const fromLegacy = legacy.filter((v) => v.button === button);
      // Every Phase 1 variant is there, with its wording; the CT specs may have switched some on or off since.
      for (const v of fromLegacy.filter((l) => !/^zztest/.test(l.wording))) {
        const migrated = row.variants.find((m) => m.key === v.variant_key);
        expect(migrated, `${button} ${v.variant_key}`).toBeTruthy();
      }
    }
    expect(primary.variants.find((v) => v.key === 'A')!.payload.wording).toEqual({ en: 'Explore My Service Options' });
    expect(landing.status).toBe('draft');
    expect(landing.variants.map((v) => v.payload.title?.en)).toEqual(['Pick your services. See the price. Sit back.', 'Pick a service. See the price. Send photos.']);

    // The admin tab lists them as experiments, with the homepage buttons' editor and history below.
    const admin = await adminContext(browser);
    const page = await admin.newPage();
    await page.goto('/vaca-mgmt?tab=experiments');
    await expect(page.getByRole('heading', { name: 'Experiments', level: 2 })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('exp-card-hero-primary')).toBeVisible();
    await expect(page.getByTestId('exp-card-hero-secondary')).toBeVisible();
    await expect(page.getByTestId('exp-card-landing-hero').getByTestId('exp-status')).toHaveText('Draft');
    await expect(page.getByRole('heading', { name: /Homepage buttons/ })).toBeVisible();
    await expect(page.getByTestId('cta-card-primary')).toBeVisible();
    // The old deep link lands on the same tab.
    await page.goto('/vaca-mgmt?tab=cta-tests');
    await expect(page.getByTestId('exp-card-hero-primary')).toBeVisible({ timeout: 30_000 });
    await page.close();
  });

  test('EX2 + EX6: the agent creates and starts the slice H hero; a second one on the page is refused', async () => {
    const a = await agent();
    const created = await a.post('/api/experiments', { data: heroBody(HERO_KEY) });
    expect(created.status(), await created.text()).toBe(201);
    const body = await created.json();
    expect(body.experiment).toMatchObject({ key: HERO_KEY, status: 'draft', created_by: 'agent' });
    expect(body.previewUrls).toEqual([`${new URL(body.adminUrl).origin}/home-services?exp=${HERO_KEY}:A`, `${new URL(body.adminUrl).origin}/home-services?exp=${HERO_KEY}:B`]);
    // A second draft on the same page, created while the page is free.
    expect((await a.post('/api/experiments', { data: heroBody(`slice-h-second-${RUN}`) })).status()).toBe(201);
    // Duplicate key.
    expect((await a.post('/api/experiments', { data: heroBody(HERO_KEY) })).status()).toBe(409);

    const started = await a.post(`/api/experiments/${HERO_KEY}/start`);
    expect(started.status(), await started.text()).toBe(200);
    const s = await started.json();
    expect(s.experiment.status).toBe('running');
    // Telegram is not configured on the rig; the message that would go out is returned.
    expect(s.telegram).toBe('not_configured');
    expect(s.message).toContain('Experiment started');
    expect(s.message).toContain('Hypothesis: A distinctive slice H hero title');

    // One per page: the second draft cannot start, and a new one cannot even be created.
    const second = await a.post(`/api/experiments/slice-h-second-${RUN}/start`);
    expect(second.status()).toBe(409);
    expect((await second.json()).error).toMatch(/already has a running experiment/);
    const third = await a.post('/api/experiments', { data: heroBody(`slice-h-third-${RUN}`) });
    expect(third.status()).toBe(409);
    // Starting twice is a 409 too.
    expect((await a.post(`/api/experiments/${HERO_KEY}/start`)).status()).toBe(409);
  });

  test('EX2: a visitor keeps the same variant across visits and pages, and the view is counted once', async ({ browser }) => {
    test.setTimeout(120_000);
    for (const want of ['A', 'B'] as const) {
      const ctx = await browserContext(browser);
      const seed = seedFor(want);
      await ctx.addCookies([{ name: 'cta_v', value: encodeURIComponent(`R=${seed}`), url: BASE }]);
      const page = await ctx.newPage();
      const views = page.waitForRequest((r) => r.url().endsWith('/api/experiments/event') && r.postDataJSON()?.event === 'view');
      await page.goto('/home-services', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('h1')).toHaveText(HERO_COPY[want].title.en);
      expect((await views).postDataJSON()).toEqual({ event: 'view', experiment_key: HERO_KEY, variant_key: want });
      const vid = uuidOf((await ctx.cookies()).find((c) => c.name === 'cta_vid')?.value)!;
      await expect.poll(async () => (await eventsOf(vid)).filter((e) => e.experiment_key === HERO_KEY).map((e) => `${e.variant_key}:${e.event}`), { timeout: 10_000 }).toEqual([`${want}:view`]);
      // Spanish, another page, the homepage, and back: same variant, same seed, still one view.
      await page.goto('/home-services?lang=es', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('h1')).toHaveText(HERO_COPY[want].title.es);
      await page.goto('/home-services/gutter-cleaning', { waitUntil: 'domcontentloaded' });
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.documentElement.hasAttribute('data-cta-p'), null, { timeout: 30_000 });
      await page.goto('/home-services?lang=en', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('h1')).toHaveText(HERO_COPY[want].title.en);
      expect(seedFromCookie((await ctx.cookies()).find((c) => c.name === 'cta_v')?.value)).toBe(seed);
      await page.waitForTimeout(1000);
      expect((await eventsOf(vid)).filter((e) => e.experiment_key === HERO_KEY && e.event === 'view')).toHaveLength(1);
      // A click on the hero button is counted once.
      await page.locator('[data-experiment] a[href="#services"]').first().click();
      await page.locator('[data-experiment] a[href="#services"]').first().click();
      await expect.poll(async () => (await eventsOf(vid)).filter((e) => e.experiment_key === HERO_KEY && e.event === 'click').length, { timeout: 10_000 }).toBe(1);
      await ctx.close();
    }
  });

  test('EX2: a brand-new visitor gets a seed from the first response, and the render already uses it', async ({ browser }) => {
    const ctx = await browserContext(browser);
    const page = await ctx.newPage();
    await page.goto('/home-services', { waitUntil: 'domcontentloaded' });
    const cookie = (await ctx.cookies()).find((c) => c.name === 'cta_v');
    expect(cookie?.value).toMatch(/^R%3D[0-9a-f]{32}$/);
    const seed = seedFromCookie(cookie!.value)!;
    const want = ['A', 'B'][ctaIndex(seed, HERO_KEY, 2)] as 'A' | 'B';
    await expect(page.locator('h1')).toHaveText(HERO_COPY[want].title.en);
    // The homepage pre-paint script adopts that seed as its own.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-cta-p'), null, { timeout: 30_000 });
    expect(seedFromCookie((await ctx.cookies()).find((c) => c.name === 'cta_v')?.value)).toBe(seed);
    await ctx.close();
  });

  test('EX2: a crawler gets the control and is never counted', async ({ browser }) => {
    const a = await api({ 'user-agent': GOOGLEBOT });
    const html = await (await a.get(`/home-services?r=${RUN}`)).text();
    expect(html).toContain(HERO_COPY.A.title.en);
    expect(html).not.toContain(HERO_COPY.B.title.en);
    // Whatever seed it carries, a crawler still gets the control.
    const seeded = await api({ 'user-agent': GOOGLEBOT, Cookie: `cta_v=${encodeURIComponent(`R=${seedFor('B')}`)}` });
    expect(await (await seeded.get('/home-services')).text()).toContain(HERO_COPY.A.title.en);

    const ctx = await browserContext(browser, { userAgent: GOOGLEBOT });
    await ctx.addCookies([{ name: 'cta_v', value: encodeURIComponent(`R=${seedFor('B')}`), url: BASE }]);
    const sent: string[] = [];
    ctx.on('request', (r) => { if (r.url().includes('/api/experiments/event')) sent.push(r.postData() ?? ''); });
    const page = await ctx.newPage();
    await page.goto('/home-services', { waitUntil: 'load' });
    await expect(page.locator('h1')).toHaveText(HERO_COPY.A.title.en);
    await page.waitForTimeout(1500);
    expect(sent).toEqual([]);
    // No visitor id is minted for a crawler, so nothing could be recorded under one.
    expect((await ctx.cookies()).find((c) => c.name === 'cta_vid')).toBeUndefined();
    await ctx.close();
  });

  test('EX2: an admin ?exp= preview shows the named variant (drafts too) and records nothing; anyone else gets their own variant', async ({ browser }) => {
    const admin = await adminContext(browser);
    await admin.addCookies([{ name: 'cta_v', value: encodeURIComponent(`R=${seedFor('A')}`), url: BASE }]);
    const sent: string[] = [];
    admin.on('request', (r) => { if (r.url().includes('/api/experiments/event')) sent.push(r.postData() ?? ''); });
    const page = await admin.newPage();
    await page.goto(`/home-services?exp=${HERO_KEY}:B`, { waitUntil: 'load' });
    await expect(page.locator('h1')).toHaveText(HERO_COPY.B.title.en);
    // The first experiment: control and variant B are the two hero copies of decision 005.
    await page.goto('/home-services?exp=landing-hero:A', { waitUntil: 'load' });
    await expect(page.locator('h1')).toHaveText('Pick your services. See the price. Sit back.');
    await page.goto('/home-services?exp=landing-hero:B&lang=es', { waitUntil: 'load' });
    await expect(page.locator('h1')).toHaveText('Elija un servicio. Vea el precio. Envíe fotos.');
    await page.goto('/home-services?exp=landing-hero:B', { waitUntil: 'load' });
    await expect(page.locator('h1')).toHaveText('Pick a service. See the price. Send photos.');
    await expect(page.locator('main p').first()).toHaveText('Home services, priced up front');
    await page.waitForTimeout(1500);
    expect(sent).toEqual([]);
    expect((await experiment('landing-hero')).status).toBe('draft');

    // Not signed in: the parameter is ignored (and a forged header is stripped).
    const visitor = await browserContext(browser);
    await visitor.addCookies([{ name: 'cta_v', value: encodeURIComponent(`R=${seedFor('A')}`), url: BASE }]);
    const vpage = await visitor.newPage();
    await vpage.setExtraHTTPHeaders({ 'x-exp-preview': `${HERO_KEY}:B` });
    await vpage.goto(`/home-services?exp=${HERO_KEY}:B`, { waitUntil: 'domcontentloaded' });
    await expect(vpage.locator('h1')).toHaveText(HERO_COPY.A.title.en);
    await visitor.close();
  });

  test('EX2: the event sink counts only the variant the seed hashes to', async () => {
    const a = await visitorWithSeed(seedFor('A'));
    await a.get('/home-services');
    const forged = await a.post('/api/experiments/event', { data: { event: 'view', experiment_key: HERO_KEY, variant_key: 'B' } });
    expect(forged.status()).toBe(204);
    const vid = uuidOf((await a.storageState()).cookies.find((c) => c.name === 'cta_vid')?.value)!;
    expect(await eventsOf(vid)).toEqual([]);
    const honest = await a.post('/api/experiments/event', { data: { event: 'view', experiment_key: HERO_KEY, variant_key: 'A' } });
    expect(honest.status()).toBe(200);
    // Unknown keys, extra fields and a body visitor id are refused.
    expect((await a.post('/api/experiments/event', { data: { event: 'view', experiment_key: HERO_KEY, variant_key: 'A', visitor_id: vid } })).status()).toBe(400);
    expect((await a.post('/api/experiments/event', { data: { event: 'job_paid' } })).status()).toBe(400);
    // The homepage buttons report through /api/cta/event, never here.
    expect((await a.post('/api/experiments/event', { data: { event: 'view', experiment_key: 'hero-primary', variant_key: 'A' } })).status()).toBe(204);
    expect((await eventsOf(vid)).map((e) => `${e.experiment_key}:${e.variant_key}:${e.event}`)).toEqual([`${HERO_KEY}:A:view`]);
  });

  test('EX3: request_started, request_submitted, quote_accepted and job_paid are recorded for the visitor\'s variant, once each', async ({ browser }) => {
    test.setTimeout(120_000);
    const a = await visitorWithSeed(seedFor('B'));
    await a.get('/home-services');
    expect((await a.post('/api/experiments/event', { data: { event: 'view', experiment_key: HERO_KEY, variant_key: 'B' } })).status()).toBe(200);
    const vid = uuidOf((await a.storageState()).cookies.find((c) => c.name === 'cta_vid')?.value)!;
    for (let i = 0; i < 2; i++) expect((await a.post('/api/experiments/event', { data: { event: 'request_started' } })).status()).toBe(200);

    const phone = `973555${String(1000 + Math.floor(Math.random() * 8999))}`;
    const body = {
      services: ['gutter-cleaning'], answers: { 'gutter-cleaning': { stories: '2' } }, address: `${RUN} Slice H Way`, zip: '07042', town: '',
      photo_ids: [], first_name: `slice-h-${RUN}`, phone, email: '', timing: 'flexible', notes: '', consent_sms: true, lang: 'en',
      started_at: Date.now() - 30_000, recaptchaToken: BYPASS, recaptchaAction: 'home_services_request',
    };
    const sent = await a.post('/api/home-services/request', { data: body });
    expect(sent.status(), await sent.text()).toBe(200);
    const requestId = (await sent.json()).request_id as string;
    // The same request again merges, and the step is still recorded once.
    expect((await a.post('/api/home-services/request', { data: { ...body, started_at: Date.now() - 30_000 } })).status()).toBe(200);
    const stored = (await rest<Array<{ id: string; visitor_id: string }>>('GET', `home_service_requests?select=id,visitor_id&id=eq.${requestId}`))[0];
    expect(stored.visitor_id).toBe(vid);

    const admin = await adminContext(browser);
    const patch = (data: object) => admin.request.patch(`/api/admin/service-requests/${requestId}`, { data });
    expect((await patch({ action: 'paid' })).status()).toBe(409); // not won yet
    expect((await patch({ action: 'won', customer_price_cents: 27900 })).status()).toBe(200);
    expect((await patch({ action: 'paid' })).status()).toBe(200);
    expect((await (await patch({ action: 'paid' })).json()).unchanged).toBe(true);
    expect((await patch({ action: 'won', customer_price_cents: 27900 })).status()).toBe(200);

    const mine = (await eventsOf(vid)).filter((e) => e.experiment_key === HERO_KEY);
    expect(mine.map((e) => `${e.variant_key}:${e.event}:${e.value_cents ?? ''}`).sort()).toEqual([
      'B:job_paid:27900', 'B:quote_accepted:27900', 'B:request_started:', 'B:request_submitted:', 'B:view:',
    ]);
    // The admin detail shows the paid date.
    const page = await admin.newPage();
    const detail = await (await admin.request.get(`/api/admin/service-requests/${requestId}`)).json();
    expect(detail.request.paid_at).toBeTruthy();
    await page.close();
  });

  test('EX6: every agent route answers 404 without the token, 400 on a bad body, and refuses any price field', async () => {
    const anon = await api();
    const wrong = await api({ Authorization: 'Bearer not-the-token-0123456789abcdef0123456789' });
    const routes: Array<[string, string]> = [
      ['GET', '/api/experiments/report'], ['POST', '/api/experiments'], ['POST', `/api/experiments/${HERO_KEY}/start`],
      ['POST', `/api/experiments/${HERO_KEY}/conclude`], ['GET', '/api/experiments/backlog'], ['POST', '/api/experiments/backlog'],
      ['POST', '/api/experiments/notify'],
    ];
    for (const client of [anon, wrong]) {
      for (const [method, path] of routes) {
        const res = method === 'GET' ? await client.get(path) : await client.post(path, { data: {} });
        expect(res.status(), `${method} ${path}`).toBe(404);
      }
    }
    const a = await agent();
    // Bad bodies.
    expect((await a.post('/api/experiments', { data: { key: 'slice-h-bad' } })).status()).toBe(400);
    expect((await a.post('/api/experiments', { headers: { 'Content-Type': 'application/json' }, data: '{nope' })).status()).toBe(400);
    expect((await a.post(`/api/experiments/${HERO_KEY}/conclude`, { data: { winner_key: 'Z' } })).status()).toBe(400);
    expect((await a.post(`/api/experiments/${HERO_KEY}/conclude`, { data: {} })).status()).toBe(400);
    expect((await a.post(`/api/experiments/${HERO_KEY}/start`, { data: { go: true } })).status()).toBe(400);
    expect((await a.post('/api/experiments/backlog', { data: { page: '/home-services' } })).status()).toBe(400);
    expect((await a.post('/api/experiments/notify', { data: { text: '' } })).status()).toBe(400);
    // Price fields, anywhere in the variants, and prices in copy.
    for (const payload of [
      { title: { en: 'a', es: 'a' }, priceDisplay: { en: '$99', es: '$99' } },
      { title: { en: 'a', es: 'a' }, startingPriceCents: 9900 },
      { title: { en: 'a', es: 'a' }, nested: { minimumCents: 1 } },
    ]) {
      const res = await a.post('/api/experiments', { data: heroBody(`slice-h-price-${RUN}`, { page: '/home-services/drywall-repair', variants: [heroVariants[0], { key: 'B', label: 'B', payload }] }) });
      expect(res.status()).toBe(400);
      expect((await res.json()).error).toMatch(/Prices are never an experiment variable/);
    }
    const copy = await a.post('/api/experiments', { data: heroBody(`slice-h-price-${RUN}`, { page: '/home-services/drywall-repair', variants: [heroVariants[0], { key: 'B', label: 'B', payload: { eyebrow: { en: 'x', es: 'x' }, title: { en: 'Now $99', es: 'Ahora $99' } } }] }) });
    expect(copy.status()).toBe(400);
    expect(JSON.stringify(await copy.json())).toMatch(/never tested/);
    expect(await experiment(`slice-h-price-${RUN}`)).toBeUndefined();

    // Report and backlog with the token.
    const report = await (await a.get('/api/experiments/report')).json();
    expect(report.pages_with_running_experiment).toContain('/home-services');
    const mine = report.experiments.find((e: { key: string }) => e.key === HERO_KEY);
    expect(mine.variants.map((v: { key: string }) => v.key)).toEqual(['A', 'B']);
    expect(mine.evaluation.verdict.kind).toBe('not_enough_data');
    expect(report.surfaces.map((s: { element: string }) => s.element)).toContain('hero');
    const added = await a.post('/api/experiments/backlog', { data: { page: '/home-services', element: 'faq-order', hypothesis: 'Slice H backlog fixture: the FAQ order matters.', priority: 5, source: 'slice-h-spec' } });
    expect(added.status()).toBe(201);
    expect((await (await a.get('/api/experiments/backlog')).json()).backlog.some((b: { source: string }) => b.source === 'slice-h-spec')).toBe(true);
    expect((await a.post('/api/experiments/backlog', { data: { page: '/', element: 'x', hypothesis: 'Show $49 off on the hero.' } })).status()).toBe(400);
    const notified = await a.post('/api/experiments/notify', { data: { text: `Slice H weekly summary ${RUN}` } });
    expect(await notified.json()).toMatchObject({ telegram: 'not_configured' });
  });

  test('EX5: the cron proposes with a veto link, waits 24 hours, then promotes; a vetoed winner is never promoted', async ({ browser }) => {
    test.setTimeout(120_000);
    const win = `slice-h-cron-${RUN}`;
    const veto = `slice-h-veto-${RUN}`;
    await seedRunning(win, `/slice-h-cron-${RUN}`, { A: { views: 300, submitted: 15 }, B: { views: 300, submitted: 45 } });
    await seedRunning(veto, `/slice-h-veto-${RUN}`, { A: { views: 300, submitted: 15 }, B: { views: 300, submitted: 45 } });
    const cron = await api({ Authorization: `Bearer ${CRON}` });
    const run = async (at: Date) => {
      const res = await cron.get(`/api/cron/experiments-evaluate?now=${encodeURIComponent(at.toISOString())}&keys=${win},${veto}`);
      expect(res.status(), await res.text()).toBe(200);
      return (await res.json()) as { results: Array<{ key: string; action: string; verdict?: string; telegram?: string; message?: string; status_after?: string }> };
    };
    const t0 = new Date();
    const first = await run(t0);
    const proposed = first.results.find((r) => r.key === win)!;
    expect(proposed).toMatchObject({ action: 'proposed', verdict: 'winner', status_after: 'pending_promotion', telegram: 'not_configured' });
    expect(proposed.message).toContain('Experiment winner');
    const link = /Veto: (\S+)/.exec(proposed.message!)?.[1];
    expect(link).toMatch(/\/experiments\/veto\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    const row = await experiment(win);
    expect(row.status).toBe('pending_promotion');
    expect(row.decision!.pending).toMatchObject({ winner_key: 'B' });
    expect(Date.parse(row.decision!.pending!.promote_after) - Date.parse(row.decision!.pending!.notified_at)).toBe(DAY);
    expect((row.decision!.verdict as { kind: string }).kind).toBe('winner');

    // Veto the other one through its link: the page is read-only, the button POSTs.
    const vetoLink = /Veto: (\S+)/.exec(first.results.find((r) => r.key === veto)!.message!)![1];
    const ctx = await browserContext(browser);
    const page = await ctx.newPage();
    await page.goto(new URL(vetoLink).pathname);
    await expect(page.getByRole('heading', { name: 'Veto this promotion?' })).toBeVisible();
    await expect(page.getByTestId('veto-summary')).toContainText(veto);
    expect((await experiment(veto)).status).toBe('pending_promotion');
    expect(await page.locator('meta[name="robots"]').getAttribute('content')).toMatch(/noindex/);
    await page.getByRole('button', { name: 'Veto' }).click();
    await expect(page.getByTestId('veto-done')).toContainText('Control A stays');
    const vetoed = await experiment(veto);
    expect(vetoed).toMatchObject({ status: 'concluded', control_key: 'A', winner_key: 'A' });
    expect(vetoed.decision!.vetoed).toMatchObject({ by: 'Telegram veto link' });
    // The link is spent.
    await page.reload();
    await expect(page.getByTestId('veto-dead')).toHaveText('Nothing to veto');
    await ctx.close();

    // An hour later: still waiting.
    const second = await run(new Date(t0.getTime() + 60 * 60 * 1000));
    expect(second.results.find((r) => r.key === win)).toMatchObject({ action: 'waiting_for_veto_window' });
    expect(second.results.find((r) => r.key === veto)).toBeUndefined();
    expect((await experiment(win)).status).toBe('pending_promotion');

    // A day later: promoted; the vetoed one is untouched.
    const third = await run(new Date(t0.getTime() + DAY + 60_000));
    expect(third.results.find((r) => r.key === win)).toMatchObject({ action: 'promoted', status_after: 'concluded', telegram: 'not_configured' });
    expect(third.results.find((r) => r.key === veto)).toBeUndefined();
    const promoted = await experiment(win);
    expect(promoted).toMatchObject({ status: 'concluded', control_key: 'B', winner_key: 'B' });
    expect(promoted.decision!.promoted).toMatchObject({ winner_key: 'B', previous_control: 'A' });
    expect((await experiment(veto))).toMatchObject({ status: 'concluded', control_key: 'A' });
  });

  test('EX7: the admin tab shows the funnel, probability and decision, and one tap promotes or retires with the admin id', async ({ browser }) => {
    test.setTimeout(120_000);
    const promo = `slice-h-admin-a-${RUN}`;
    const ret = `slice-h-admin-b-${RUN}`;
    await seedRunning(promo, `/slice-h-admin-a-${RUN}`, { A: { views: 260, submitted: 13 }, B: { views: 250, submitted: 40 } });
    await seedRunning(ret, `/slice-h-admin-b-${RUN}`, { A: { views: 40, submitted: 2 }, B: { views: 42, submitted: 3 } }, 3);
    const admin = await adminContext(browser);
    const page = await admin.newPage();
    await page.goto('/vaca-mgmt?tab=experiments');
    const card = page.getByTestId(`exp-card-${promo}`);
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByTestId(`exp-row-${promo}-A`)).toContainText('260');
    await expect(card.getByTestId(`exp-row-${promo}-B`)).toContainText('250');
    await expect(card.getByTestId(`exp-p-${promo}-B`)).toHaveText(/^(9\d|100)\.\d%$/);
    await expect(card.getByTestId('exp-verdict')).toContainText('beats control A');
    await expect(page.getByTestId(`exp-card-${ret}`).getByTestId('exp-verdict')).toContainText('Not enough data yet');
    await expect(page.getByTestId(`exp-card-${HERO_KEY}`).getByTestId('exp-status')).toHaveText('Running');
    await page.screenshot({ path: test.info().outputPath('ex7-experiments-tab.png'), fullPage: true });

    await card.getByTestId('exp-promote').click();
    await expect(page.getByTestId(`exp-card-${promo}`).getByTestId('exp-status')).toHaveText('Concluded', { timeout: 15_000 });
    await expect(page.getByTestId(`exp-card-${promo}`).getByTestId('exp-decision')).toContainText('Promoted B');
    await page.getByTestId(`exp-card-${ret}`).getByTestId('exp-retire').click();
    await expect(page.getByTestId(`exp-card-${ret}`).getByTestId('exp-status')).toHaveText('Retired', { timeout: 15_000 });

    const promoted = await experiment(promo);
    expect(promoted).toMatchObject({ status: 'concluded', control_key: 'B' });
    expect(promoted.decision!.promoted!.by).toMatch(/^admin:[0-9a-f-]{36}$/);
    expect((await experiment(ret)).decision!.retired!.by).toMatch(/^admin:[0-9a-f-]{36}$/);
    await page.close();
  });

  test('EX2 cleanup check: retiring the slice H hero puts the page default back', async () => {
    const a = await agent();
    const res = await a.post(`/api/experiments/${HERO_KEY}/conclude`, { data: { retire: true, reason: 'slice H spec done' } });
    expect(res.status()).toBe(200);
    expect((await res.json()).telegram).toBe('not_configured');
    const html = await (await (await visitorWithSeed(seedFor('B'))).get('/home-services')).text();
    expect(html).toContain('Pick your services. See the price. Sit back.');
    expect(html).not.toContain(HERO_COPY.B.title.en);
  });
});
