import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON } from './helpers/liveBackend';
import { checkIngestToken, MIN_INGEST_TOKEN_LENGTH } from '../src/lib/projects/ingestAuth';
import { articleCreateSchema, articleUpdateSchema, parseFeedbackDays, readFaq } from '../src/lib/articles/schemas';
import { buildSeoFeedback, blogSlugOf, FEEDBACK_MAX_PAGES } from '../src/lib/articles/feedback';
import { faqPageJsonLd, jsonLdScript } from '../src/lib/articles/faqJsonLd';
import { checkPublishable } from '../src/lib/articles/publishGuard';
import { blogPagePaths, isRevalidatablePath, REVALIDATE_PREFIXES } from '../src/lib/revalidate';
import type { SeoMetricRow } from '../src/lib/seo/report';

/**
 * Phase 2 slice F: OpenAI removal (RM), article routes and CLI (ART), SEO
 * feedback (FB). docs/phase-2/acceptance-criteria.md.
 *
 * The first half needs no backend: source pins, the pure modules, and - in the
 * stub run, whose server has no PROJECT_INGEST_TOKEN - "token unset means every
 * article route is 404" over HTTP (ART1).
 *
 * The second half is live-backend: it drives the routes, the CLI and the admin
 * UI against the local Supabase rig. Run it against `next dev` AND against a
 * production build (`npm run build && npm run start`), because only the
 * production build caches pages, so only there does "on the next request"
 * prove revalidation rather than an uncached dev render:
 *
 *   TEST_URL=http://localhost:3112 E2E_LIVE_BACKEND=1 \
 *     node_modules/.bin/playwright test tests/articles-ingest.spec.ts --project=chromium
 *   TEST_URL=http://localhost:3113 E2E_LIVE_BACKEND=1 E2E_ISR=1 \
 *     node_modules/.bin/playwright test tests/articles-ingest.spec.ts --project=chromium
 *
 * E2E_ISR=1 adds a control: a post written straight to the table WITHOUT a
 * revalidation must stay invisible on the cached /blog, so a green run cannot
 * be an uncached server passing the check by accident.
 *
 * Every row it writes has a `slice-f-<run>` slug, title or query, and afterAll
 * removes only those rows (other builders share the database).
 */

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ARTICLE_ROUTES: Array<[string, string]> = [
  ['POST', '/api/articles/ingest'],
  ['PATCH', '/api/articles/ingest/00000000-0000-4000-8000-000000000000'],
  ['POST', '/api/articles/ingest/00000000-0000-4000-8000-000000000000/publish'],
  ['POST', '/api/articles/ingest/00000000-0000-4000-8000-000000000000/unpublish'],
  ['GET', '/api/articles/seo-feedback'],
];

// ---------------------------------------------------------------------------
// RM - OpenAI removal (source pins)
// ---------------------------------------------------------------------------

test.describe('RM: no OpenAI writer is left', () => {
  test('RM1: openai is gone from package.json and the lockfile', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.dependencies?.openai).toBeUndefined();
    expect(pkg.devDependencies?.openai).toBeUndefined();
    expect(read('package-lock.json')).not.toMatch(/node_modules\/openai"/);
  });

  test('RM1: no code under src mentions OpenAI except comments explaining the removal', () => {
    // The privacy policy is a legal disclosure, not code; its wording about the
    // retired chat assistant and content tools is Alex's to change (report).
    const code = walk(join(root, 'src')).filter((f) => /\.(ts|tsx|js|jsx|mjs)$/.test(f));
    for (const file of code) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (!/openai/i.test(line)) return;
        expect(/^\s*(\*|\/\/|\/\*)/.test(line), `${file}:${i + 1} mentions OpenAI outside a comment`).toBe(true);
      });
    }
  });

  test('RM2: the draft route, seo-maintain and its cron are deleted; maintained_articles stays', () => {
    expect(existsSync(join(root, 'src/app/api/admin/content-actions/draft'))).toBe(false);
    expect(existsSync(join(root, 'src/app/api/cron/seo-maintain'))).toBe(false);
    expect(read('vercel.json')).not.toContain('seo-maintain');
    expect(existsSync(join(root, 'supabase/migrations/20260806000000_maintained_articles.sql'))).toBe(true);
  });

  test('RM5: the edge functions, the generator and the editor AI buttons are gone', () => {
    for (const dir of ['generate-blog-post', 'enhance-blog-content', 'generate-blog-image']) {
      expect(existsSync(join(root, 'supabase/functions', dir)), dir).toBe(false);
    }
    expect(existsSync(join(root, 'supabase/functions/_shared/openai.ts'))).toBe(false);
    // Fix round 1: the scheduled-publish edge function duplicated /api/cron/publish
    // without published_at or revalidation, so it went too.
    expect(existsSync(join(root, 'supabase/functions/publish-scheduled-articles'))).toBe(false);
    expect(read('docs/phase-2/follow-ups.md')).toContain('supabase functions delete publish-scheduled-articles');
    expect(existsSync(join(root, 'src/components/admin/BlogPostGenerator.tsx'))).toBe(false);
    const editor = read('src/components/admin/BlogPostEditor.tsx');
    expect(editor).not.toContain('functions.invoke');
    expect(editor).not.toMatch(/generate-blog-seo|Generate Image|Generate SEO|Enhance Content|AI Enhancement/);
    const list = read('src/components/admin/BlogPostList.tsx');
    expect(list).not.toMatch(/BlogPostGenerator|Generate New/);
  });

  test('RM5: OPENAI_API_KEY is listed for deletion in the follow-ups', () => {
    const followUps = read('docs/phase-2/follow-ups.md');
    expect(followUps).toContain('OPENAI_API_KEY');
    expect(followUps).toMatch(/supabase functions delete/);
  });
});

// ---------------------------------------------------------------------------
// ART1 - the token check, pure and (stub run) over HTTP
// ---------------------------------------------------------------------------

test.describe('ART1: token unset or short means every article route is 404', () => {
  test('the shared token check reports disabled for unset, blank and short tokens', () => {
    expect(checkIngestToken('Bearer x', {})).toBe('disabled');
    expect(checkIngestToken('Bearer x', { PROJECT_INGEST_TOKEN: '   ' })).toBe('disabled');
    const short = 'y'.repeat(MIN_INGEST_TOKEN_LENGTH - 1);
    expect(checkIngestToken(`Bearer ${short}`, { PROJECT_INGEST_TOKEN: short })).toBe('disabled');
  });

  test('every article route is self-guarded by authorizeArticles and listed public in middleware', () => {
    // The one-tap unpublish route (slice G) is the exception: the signed link
    // is its credential, not the ingest token (tests/articles-publish-guard.spec.ts).
    const routes = walk(join(root, 'src/app/api/articles')).filter((f) => f.endsWith('route.ts') && !f.includes('/unpublish/[token]/'));
    expect(routes.length).toBe(5);
    for (const file of routes) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).toContain('await authorizeArticles(request)');
      expect(src, file).toContain("export const dynamic = 'force-dynamic'");
      expect(src, file).toContain("export const runtime = 'nodejs'");
    }
    expect(read('src/middleware.ts')).toContain("'/api/articles/',");
    const auth = read('src/lib/articles/auth.ts');
    expect(auth).toContain("if (verdict === 'disabled') return { ok: false, response: notFound() }");
    // The rate limit runs before the token comparison (ART7).
    expect(auth.indexOf('checkRateLimit(')).toBeLessThan(auth.indexOf("verdict === 'valid'"));
  });

  test('over HTTP, against a server with no token configured', async ({ request }) => {
    test.skip(!SKIP_WITHOUT_LIVE_BACKEND, 'The live rig has the token set; this half runs in the stub run, whose server has none.');
    for (const [method, path] of ARTICLE_ROUTES) {
      const res = await request.fetch(path, {
        method,
        headers: { Authorization: `Bearer ${'z'.repeat(64)}` },
        data: method === 'GET' ? undefined : {},
      });
      expect(res.status(), `${method} ${path}`).toBe(404);
    }
  });
});

// ---------------------------------------------------------------------------
// Pure modules: schemas, FAQ JSON-LD, feedback, revalidation paths, guard stub
// ---------------------------------------------------------------------------

test.describe('pure article modules', () => {
  test('ART6: the create schema names each bad field', () => {
    const bad = articleCreateSchema.safeParse({ title: '', category: 'x', slug: 'Not A Slug', faq: [{ q: 'only a question' }] });
    expect(bad.success).toBe(false);
    const paths = bad.success ? [] : bad.error.issues.map((i) => i.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['title', 'content', 'slug', 'faq.0.a']));
    expect(articleCreateSchema.safeParse({ title: 'T', content: 'C', category: 'K', published: true }).success).toBe(false);
    expect(articleUpdateSchema.safeParse({ action_id: '11111111-2222-4333-8444-555555555555' }).success).toBe(false);
    expect(articleUpdateSchema.safeParse({ title: 'New' }).success).toBe(true);
  });

  test('ART10: FAQPage JSON-LD from a FAQ, none without one, and script-safe', () => {
    const ld = faqPageJsonLd([{ q: 'Q1?', a: 'A1 </script><b>' }, { q: 'Q2?', a: 'A2' }], 'https://www.lavacagc.com/blog/x');
    expect(ld).toMatchObject({ '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'Q1?' }, { name: 'Q2?' }] });
    expect(jsonLdScript(ld)).not.toContain('</script>');
    expect(faqPageJsonLd(null, 'u')).toBeNull();
    expect(faqPageJsonLd([], 'u')).toBeNull();
    expect(faqPageJsonLd('not a list', 'u')).toBeNull();
    expect(readFaq([{ q: 'x' }])).toEqual([]);
  });

  test('FB1/FB2: pages from fixture rows, decaying on a negative 14-day trend, joined to posts', () => {
    const now = new Date('2026-10-29T12:00:00Z');
    const day = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString().slice(0, 10);
    const row = (url: string, date: string, clicks: number, impressions: number, position = 8): SeoMetricRow => ({
      source: 'gsc', url, query: null, date, impressions, clicks, position, ctr: null, users: 0, engaged_sessions: 0, conversions: 0,
    });
    const rows = [
      row('https://www.lavacagc.com/blog/kitchen-guide', day(20), 9, 300, 6),
      row('/blog/kitchen-guide', day(3), 2, 100, 10),
      row('/services/bathrooms', day(20), 1, 50),
      row('/services/bathrooms', day(2), 6, 50),
      { ...row('/blog/kitchen-guide', day(4), 0, 0), source: 'ga4' as const, conversions: 3 },
    ];
    const posts = [{ id: 'p1', slug: 'kitchen-guide', title: 'Kitchen guide', published_at: '2026-01-01T00:00:00Z' }];
    const fb = buildSeoFeedback({ rows, posts, actions: [], now, days: 28 });
    expect(fb.window).toEqual({ days: 28, startDate: day(28), endDate: day(0), trendSplitDate: day(14) });
    const kitchen = fb.pages.find((p) => p.path === '/blog/kitchen-guide')!;
    expect(kitchen).toMatchObject({ impressions: 400, clicks: 11, ctr: 0.0275, trend_delta: -7, decaying: true, post: posts[0] });
    expect(kitchen.position).toBe(7); // impression-weighted: (6*300 + 10*100) / 400
    const baths = fb.pages.find((p) => p.path === '/services/bathrooms')!;
    expect(baths).toMatchObject({ trend_delta: 5, decaying: false });
    expect(baths.post).toBeUndefined();
    expect(Object.keys(fb).sort()).toEqual([
      'new_article_candidates', 'open_actions', 'pages', 'pages_total', 'refresh_candidates', 'suggested_actions', 'truncated', 'window',
    ]);
    expect(blogSlugOf('/blog/preview')).toBeNull();
    expect(blogSlugOf('/blog/a-b')).toBe('a-b');
  });

  test('FB3: open actions are listed with their targets', () => {
    const now = new Date('2026-10-29T12:00:00Z');
    const posts = [{ id: 'p1', slug: 's', title: 'T', published_at: null }];
    const fb = buildSeoFeedback({
      rows: [], posts, now, days: 28,
      actions: [{ id: 'a1', action_type: 'refresh', target_post_id: 'p1', consolidate_into_id: null, target_query: 'q', rationale: { reason: 'r' }, status: 'approved' }],
    });
    expect(fb.open_actions).toEqual([{ id: 'a1', kind: 'refresh', status: 'approved', target: { query: 'q', post: posts[0] }, rationale: { reason: 'r' } }]);
  });

  test('FB4: at most 200 pages; days is 7 to 90; the route caps every read', () => {
    const now = new Date('2026-10-29T12:00:00Z');
    const rows: SeoMetricRow[] = Array.from({ length: 250 }, (_, i) => ({
      source: 'gsc', url: `/p/${i}`, query: null, date: '2026-10-20', impressions: i + 1, clicks: 0, position: 5,
      ctr: null, users: 0, engaged_sessions: 0, conversions: 0,
    }));
    const fb = buildSeoFeedback({ rows, posts: [], actions: [], now, days: 28, truncated: true });
    expect(fb.pages).toHaveLength(FEEDBACK_MAX_PAGES);
    expect(fb.pages_total).toBe(250);
    expect(fb.pages[0].path).toBe('/p/249');
    expect(fb.truncated).toBe(true);
    expect(parseFeedbackDays(null)).toBe(28);
    expect(parseFeedbackDays('90')).toBe(90);
    for (const bad of ['91', '6', 'abc', '-1', '1e2']) expect(parseFeedbackDays(bad), bad).toBeNull();
    const route = read('src/app/api/articles/seo-feedback/route.ts');
    expect(route).toContain('supabaseRestPagedCapped');
    expect(route).toMatch(/limit=\$\{MAX_POSTS\}/);
    expect(route).toMatch(/limit=\$\{MAX_OPEN_ACTIONS\}/);
  });

  test('revalidation paths: /blog is a prefix, the sitemap an exact path, one list for both sides', () => {
    expect(REVALIDATE_PREFIXES).toContain('/blog');
    expect(isRevalidatablePath('/sitemap.xml')).toBe(true);
    expect(isRevalidatablePath('/sitemap.xml/x')).toBe(false);
    expect(isRevalidatablePath('/blog/a-post')).toBe(true);
    expect(blogPagePaths('new-slug', 'old-slug', '../evil', null)).toEqual(['/blog', '/blog/new-slug', '/blog/old-slug', '/sitemap.xml']);
    // ART9: every blog writer calls it.
    expect(read('src/components/admin/BlogPostList.tsx')).toContain('requestRevalidate(blogPagePaths(');
    // Publishing from the list or editor goes through the guarded admin route, which revalidates server-side.
    expect(read('src/app/api/admin/articles/[id]/publish/route.ts')).toContain('revalidateArticlePages(');
    expect(read('src/components/admin/BlogPostEditor.tsx')).toContain('requestRevalidate(blogPagePaths(');
    expect(read('src/app/api/cron/publish/route.ts')).toContain('revalidateArticlePages(');
    expect(read('src/app/api/cron/seo-rollback/route.ts')).toContain('revalidateArticlePages(');
  });

  test('the publish guard is real since slice G (tests/articles-publish-guard.spec.ts), and the publish route runs it', () => {
    const verdict = checkPublishable({ title: 't', slug: 's', content: 'from $9,000', category: 'c' }, { contentFacts: [] });
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons).toContain('Price claim: "from $9,000" in paragraph 1');
    expect(read('src/app/api/articles/ingest/[id]/publish/route.ts')).toContain('checkPublishable(candidate, facts)');
  });
});

// ---------------------------------------------------------------------------
// Live backend
// ---------------------------------------------------------------------------

function localEnv(): Record<string, string> {
  const out: Record<string, string> = { ...process.env } as Record<string, string>;
  const p = join(root, '.env.local');
  if (!existsSync(p)) return out;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) out[m[1]] = m[2];
  }
  return out;
}

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin-f@local.test';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'LocalAdmin!2026';
const RUN = Date.now().toString(36);
const PREFIX = `slice-f-${RUN}`;
const ISR = process.env.E2E_ISR === '1';

/** A body that would pass the real guard too: answer-first opening, an H2, three internal links. */
function articleMarkdown(lead: string): string {
  return [
    `${lead} A kitchen remodel in Bergen County usually takes six to ten weeks from demolition to the last coat of paint, depending on the cabinets you choose and how quickly the town reviews the plans.`,
    '',
    '## What drives the timeline',
    '',
    'See [kitchen remodeling](/services/kitchen-remodeling), [bathroom remodeling](/services/bathroom-remodeling) and get a [free estimate](/free-estimate).',
  ].join('\n');
}

test.describe('article routes, CLI and feedback (live backend)', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);
  // A production build serves the admin with a CSP that only allows the
  // production Supabase origin; the rig is 127.0.0.1, so the browser half
  // bypasses CSP (the CSP itself is not what these checks are about).
  test.use({ bypassCSP: true });

  const env = localEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SECRET_KEY;
  const token = env.PROJECT_INGEST_TOKEN;
  const cronSecret = env.CRON_SECRET;
  const service = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  /**
   * Client IPs of THIS run (198.18.0.0/15, the benchmarking range), so the
   * rate-limit buckets `articles:<ip>` are ours alone. Runs from other
   * worktrees share the database; a cleanup that touched any bucket but these
   * two once reset another run's ART7 burst mid-test (401 where 429 was due).
   */
  const octet = () => Math.floor(Math.random() * 254) + 1;
  const ip = `198.18.${octet()}.${octet()}`;
  const burstIp = `198.19.${octet()}.${octet()}`;
  const auth = { Authorization: `Bearer ${token}`, 'cf-connecting-ip': ip };

  async function rest<T = unknown>(request: APIRequestContext, method: string, path: string, data?: unknown): Promise<T> {
    const res = await request.fetch(`${supabaseUrl}/rest/v1/${path}`, {
      method,
      headers: { ...service, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      data,
    });
    expect(res.ok(), `${method} ${path}: ${await res.text()}`).toBe(true);
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  async function clearRateLimit(request: APIRequestContext) {
    // Only this run's two buckets; never a wildcard over every `articles:` bucket.
    const own = [ip, burstIp].map((i) => `"articles:${i}"`).join(',');
    await request.delete(`${supabaseUrl}/rest/v1/rate_limits?ip_address=in.(${encodeURIComponent(own)})`, { headers: service });
  }

  async function signIn(page: Page) {
    await page.goto('/auth');
    await page.locator('#signin-email').fill(ADMIN_EMAIL);
    await page.locator('#signin-password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await page.waitForURL(/\/vaca-mgmt/, { timeout: 60_000 });
  }

  async function create(request: APIRequestContext, body: Record<string, unknown>) {
    const res = await request.post('/api/articles/ingest', { headers: auth, data: body });
    expect(res.status(), await res.text()).toBe(201);
    return res.json() as Promise<{ id: string; slug: string; adminUrl: string; previewUrl: string; action?: { status: string } }>;
  }

  const text = async (request: APIRequestContext, path: string) => (await request.get(path)).text();
  const status = async (request: APIRequestContext, path: string) => (await request.get(path, { maxRedirects: 0 })).status();

  /** The JSON-LD blocks a page emits, parsed. */
  function jsonLdBlocks(html: string): Array<Record<string, unknown>> {
    return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1]) as Record<string, unknown>);
  }

  test.beforeAll(async ({ request }) => {
    test.skip(!supabaseUrl || !serviceKey || !token || !cronSecret,
      'Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, PROJECT_INGEST_TOKEN and CRON_SECRET in .env.local');
    // The local GoTrue starts empty; 422 means this admin already exists.
    const res = await request.post(`${supabaseUrl}/auth/v1/admin/users`, {
      headers: { ...service, 'Content-Type': 'application/json' },
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, email_confirm: true },
    });
    expect([200, 201, 422]).toContain(res.status());
    await clearRateLimit(request);
  });

  // The suite makes more than 30 article calls a minute from one IP, which is
  // exactly what the limiter refuses (ART7). Each test starts with this run's
  // two buckets empty (other runs' buckets are never touched); ART7 then
  // proves the limit inside one test. The CLI test calls from the server's
  // own loopback address, a bucket shared with other runs; it makes six calls.
  test.beforeEach(async ({ request }) => {
    if (supabaseUrl && serviceKey) await clearRateLimit(request);
  });

  test.afterAll(async ({ request }) => {
    if (!supabaseUrl || !serviceKey) return;
    const like = encodeURIComponent(`${PREFIX}*`);
    await request.delete(`${supabaseUrl}/rest/v1/content_actions?target_query=like.${like}`, { headers: service });
    await request.delete(`${supabaseUrl}/rest/v1/seo_metrics?url=like.*${encodeURIComponent(PREFIX)}*`, { headers: service });
    await request.delete(`${supabaseUrl}/rest/v1/blog_posts?slug=like.${like}`, { headers: service });
    await clearRateLimit(request);
  });

  let postId = '';
  let postSlug = '';

  test('ART2: create returns the contract and an unpublished Claude draft the admin can preview', async ({ page, request }) => {
    const created = await create(request, {
      title: `${PREFIX} Kitchen Timeline Guide`,
      content: articleMarkdown('How long does a kitchen remodel take?'),
      category: 'Kitchen Remodeling',
      faq: [{ q: 'How long does a kitchen remodel take?', a: 'Usually six to ten weeks.' }, { q: 'Does the town review the plans?', a: 'Your town decides.' }],
    });
    expect(Object.keys(created).sort()).toEqual(['adminUrl', 'id', 'previewUrl', 'slug']);
    expect(created.id).toMatch(UUID);
    expect(created.slug).toBe(`${PREFIX}-kitchen-timeline-guide`);
    expect(created.adminUrl).toMatch(new RegExp(`/vaca-mgmt\\?tab=blog&post=${created.id}$`));
    expect(created.previewUrl).toMatch(new RegExp(`/blog/preview/${created.slug}$`));
    postId = created.id;
    postSlug = created.slug;

    const [row] = await rest<Array<Record<string, unknown>>>(request, 'GET', `blog_posts?select=*&id=eq.${postId}`);
    expect(row).toMatchObject({ published: false, source: 'claude', published_at: null, review_hold: null, category: 'Kitchen Remodeling' });
    // The default excerpt is the opening paragraph only, never the next heading.
    expect(row.excerpt).toMatch(/^How long does a kitchen remodel take\? A kitchen remodel/);
    expect(row.excerpt).not.toContain('What drives');
    expect(row.meta_description).toBeTruthy();
    expect(await status(request, `/blog/${postSlug}`)).toBe(404);

    await signIn(page);
    await page.goto(created.previewUrl.replace(/^https?:\/\/[^/]+/, ''));
    await expect(page.getByRole('heading', { level: 1, name: `${PREFIX} Kitchen Timeline Guide` })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Frequently asked questions' })).toBeVisible();
    // The adminUrl opens the post in the editor.
    await page.goto(created.adminUrl.replace(/^https?:\/\/[^/]+/, ''));
    await expect(page.locator('#title')).toHaveValue(`${PREFIX} Kitchen Timeline Guide`, { timeout: 30_000 });
  });

  test('ART6: a slug collision gets a numeric suffix; a bad body is a 400 with field errors', async ({ request }) => {
    const again = await create(request, { title: `${PREFIX} Kitchen Timeline Guide`, content: 'Body.', category: 'Kitchen Remodeling' });
    expect(again.slug).toBe(`${postSlug}-2`);
    const third = await create(request, { title: 'Anything', slug: postSlug, content: 'Body.', category: 'Kitchen Remodeling' });
    expect(third.slug).toBe(`${postSlug}-3`);

    const bad = await request.post('/api/articles/ingest', { headers: auth, data: { title: '', slug: 'Bad Slug', category: 'x' } });
    expect(bad.status()).toBe(400);
    const body = await bad.json();
    expect(body.error).toBe('Validation failed');
    expect(body.issues.map((i: { path: string }) => i.path)).toEqual(expect.arrayContaining(['title', 'slug', 'content']));
    const clash = await request.patch(`/api/articles/ingest/${third.id}`, { headers: auth, data: { slug: postSlug } });
    expect(clash.status()).toBe(409);
    const unauth = await request.post('/api/articles/ingest', { headers: { 'cf-connecting-ip': ip }, data: {} });
    expect(unauth.status()).toBe(401);
  });

  test('ART4: publish sets published and published_at; /blog, the post and sitemap.xml show it on the next request', async ({ request }) => {
    // Warm the cached copies first, so a production build has something stale to serve.
    expect(await text(request, '/blog')).not.toContain(postSlug);
    expect(await text(request, '/sitemap.xml')).not.toContain(postSlug);
    expect(await status(request, `/blog/${postSlug}`)).toBe(404);

    const res = await request.post(`/api/articles/ingest/${postId}/publish`, { headers: auth });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ published: true, id: postId, slug: postSlug });
    expect(body.url).toMatch(new RegExp(`/blog/${postSlug}$`));

    const [row] = await rest<Array<{ published: boolean; published_at: string | null }>>(request, 'GET', `blog_posts?select=published,published_at&id=eq.${postId}`);
    expect(row.published).toBe(true);
    expect(Date.now() - new Date(row.published_at!).getTime()).toBeLessThan(5 * 60_000);

    expect(await text(request, '/blog')).toContain(postSlug);
    expect(await status(request, `/blog/${postSlug}`)).toBe(200);
    expect(await text(request, '/sitemap.xml')).toContain(`/blog/${postSlug}</loc>`);
  });

  test('ART10: the FAQ renders as a section and FAQPage JSON-LD; datePublished is published_at; no FAQ, no FAQPage', async ({ request }) => {
    const html = await text(request, `/blog/${postSlug}`);
    expect(html).toContain('Frequently asked questions');
    const blocks = jsonLdBlocks(html);
    const faq = blocks.find((b) => b['@type'] === 'FAQPage') as { mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }> };
    expect(faq.mainEntity.map((q) => q.name)).toEqual(['How long does a kitchen remodel take?', 'Does the town review the plans?']);
    const [row] = await rest<Array<{ published_at: string }>>(request, 'GET', `blog_posts?select=published_at&id=eq.${postId}`);
    const posting = blocks.find((b) => b['@type'] === 'BlogPosting')!;
    expect(new Date(posting.datePublished as string).getTime()).toBe(new Date(row.published_at).getTime());

    const plain = await create(request, { title: `${PREFIX} No Faq Post`, content: articleMarkdown('Plain.'), category: 'Kitchen Remodeling' });
    expect((await request.post(`/api/articles/ingest/${plain.id}/publish`, { headers: auth })).status()).toBe(200);
    const plainHtml = await text(request, `/blog/${plain.slug}`);
    expect(jsonLdBlocks(plainHtml).some((b) => b['@type'] === 'FAQPage')).toBe(false);
    expect(plainHtml).not.toContain('Frequently asked questions');
    expect((await request.post(`/api/articles/ingest/${plain.id}/unpublish`, { headers: auth })).status()).toBe(200);
  });

  test('ART3: patch changes fields, keeps published, and a live post shows the edit on the next request', async ({ request }) => {
    expect(await text(request, `/blog/${postSlug}`)).not.toContain('Patched headline');
    const res = await request.patch(`/api/articles/ingest/${postId}`, {
      headers: auth,
      data: { title: `${PREFIX} Patched headline`, meta_description: 'Patched description.' },
    });
    expect(res.status(), await res.text()).toBe(200);
    expect(await res.json()).toMatchObject({ id: postId, slug: postSlug, published: true });
    const [row] = await rest<Array<{ published: boolean; title: string }>>(request, 'GET', `blog_posts?select=published,title&id=eq.${postId}`);
    expect(row).toEqual({ published: true, title: `${PREFIX} Patched headline` });
    expect(await text(request, `/blog/${postSlug}`)).toContain('Patched headline');
    expect(await text(request, '/blog')).toContain('Patched headline');

    // A draft stays a draft.
    const draft = await create(request, { title: `${PREFIX} Still Draft`, content: 'Body.', category: 'Kitchen Remodeling' });
    const patched = await request.patch(`/api/articles/ingest/${draft.id}`, { headers: auth, data: { content: 'New body.' } });
    expect((await patched.json()).published).toBe(false);
  });

  test('ART5: unpublish removes it from /blog, its page and sitemap.xml on the next request', async ({ request }) => {
    const res = await request.post(`/api/articles/ingest/${postId}/unpublish`, { headers: auth });
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ published: false, id: postId });
    expect(await text(request, '/blog')).not.toContain(postSlug);
    expect(await status(request, `/blog/${postSlug}`)).toBe(404);
    expect(await text(request, '/sitemap.xml')).not.toContain(postSlug);
  });

  test('ISR control: a write that skips revalidation stays invisible on the cached /blog', async ({ request }) => {
    test.skip(!ISR, 'Only meaningful against a production build (E2E_ISR=1); next dev never caches.');
    const slug = `${PREFIX}-control-no-revalidate`;
    expect(await text(request, '/blog')).not.toContain(slug);
    await rest(request, 'POST', 'blog_posts', [{
      title: `${PREFIX} Control`, slug, content: 'Body.', category: 'Kitchen Remodeling', published: true, published_at: new Date().toISOString(),
    }]);
    // Served from the ISR copy: the revalidate window is 300 s, and nothing asked for a refresh.
    expect(await text(request, '/blog')).not.toContain(slug);
    await rest(request, 'DELETE', `blog_posts?slug=eq.${slug}`);
  });

  test('ART9: the admin list toggle, the editor save and the publish cron revalidate at once', async ({ page, request }) => {
    const draft = await create(request, { title: `${PREFIX} Admin Toggle`, content: articleMarkdown('Toggle.'), category: 'Kitchen Remodeling' });
    expect(await text(request, '/blog')).not.toContain(draft.slug);

    await signIn(page);
    await page.goto('/vaca-mgmt?tab=blog');
    const row = page.getByRole('row').filter({ hasText: `${PREFIX} Admin Toggle` });
    await expect(row.getByText('From Claude Code')).toBeVisible({ timeout: 30_000 });
    // Since slice G the list publishes through the guarded admin route, which revalidates on the server.
    const revalidated = page.waitForResponse((r) => r.url().endsWith(`/api/admin/articles/${draft.id}/publish`) && r.request().method() === 'POST');
    await row.getByTitle('Publish', { exact: true }).click();
    expect((await revalidated).status()).toBe(200);
    expect(await text(request, '/blog')).toContain(draft.slug);
    const [stamped] = await rest<Array<{ published_at: string | null }>>(request, 'GET', `blog_posts?select=published_at&id=eq.${draft.id}`);
    expect(stamped.published_at).toBeTruthy();

    // The editor: deep link, change the title, save; the live page shows it at once.
    await page.goto(`/vaca-mgmt?tab=blog&post=${draft.id}`);
    await expect(page.locator('#title')).toHaveValue(`${PREFIX} Admin Toggle`, { timeout: 30_000 });
    await page.locator('#title').fill(`${PREFIX} Admin Toggle Edited`);
    // Typing a title re-derives the slug in the editor; keep the URL.
    await page.locator('#slug').fill(draft.slug);
    const saved = page.waitForResponse((r) => r.url().endsWith('/api/admin/revalidate') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save Post' }).click();
    expect((await saved).status()).toBe(200);
    expect(await text(request, `/blog/${draft.slug}`)).toContain('Admin Toggle Edited');

    await page.goto('/vaca-mgmt?tab=blog');
    const editedRow = page.getByRole('row').filter({ hasText: `${PREFIX} Admin Toggle Edited` });
    const down = page.waitForResponse((r) => r.url().endsWith('/api/admin/revalidate') && r.request().method() === 'POST');
    await editedRow.getByTitle('Unpublish', { exact: true }).click();
    expect((await down).status()).toBe(200);
    expect(await text(request, '/blog')).not.toContain(draft.slug);

    // The publish cron: a scheduled draft that is due goes live and shows at once.
    const scheduled = await create(request, { title: `${PREFIX} Scheduled`, content: articleMarkdown('Scheduled.'), category: 'Kitchen Remodeling' });
    expect(await text(request, '/blog')).not.toContain(scheduled.slug);
    await rest(request, 'PATCH', `blog_posts?id=eq.${scheduled.id}`, { scheduled_publish_at: new Date(Date.now() - 60_000).toISOString() });
    const cron = await request.get('/api/cron/publish', { headers: { Authorization: `Bearer ${cronSecret}` } });
    expect(cron.status(), await cron.text()).toBe(200);
    expect(await text(request, '/blog')).toContain(scheduled.slug);
    const [cronRow] = await rest<Array<{ published_at: string | null }>>(request, 'GET', `blog_posts?select=published_at&id=eq.${scheduled.id}`);
    expect(cronRow.published_at).toBeTruthy();
    await request.post(`/api/articles/ingest/${scheduled.id}/unpublish`, { headers: auth });
  });

  test('ART9: the rollback cron revalidates the post it reverts', async ({ request }) => {
    const live = await create(request, { title: `${PREFIX} Rollback Target`, content: articleMarkdown('Original body.'), category: 'Kitchen Remodeling' });
    expect((await request.post(`/api/articles/ingest/${live.id}/publish`, { headers: auth })).status()).toBe(200);
    // 20 days old, refreshed with a 50% baseline CTR, now earning 1%: the guard reverts it.
    const old = new Date(Date.now() - 20 * 86_400_000).toISOString();
    await rest(request, 'PATCH', `blog_posts?id=eq.${live.id}`, { created_at: old, content: 'Refreshed body that hurt CTR.' });
    expect(await text(request, `/blog/${live.slug}`)).toContain('Refreshed body that hurt CTR.');
    await rest(request, 'POST', 'blog_post_revisions', [{ post_id: live.id, title: `${PREFIX} Rollback Target`, content_html: 'Restored original body.', revised_by: 'apply' }]);
    await rest(request, 'POST', 'content_actions', [{
      action_type: 'refresh', target_post_id: live.id, target_query: `${PREFIX} rollback`, status: 'completed',
      published_post_id: live.id, draft_meta: { baseline_ctr: 0.5 },
    }]);
    const day = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    await rest(request, 'POST', 'seo_metrics', [{ source: 'gsc', url: `/blog/${live.slug}`, query: `${PREFIX} q`, date: day, impressions: 200, clicks: 2, position: 6 }]);

    const cron = await request.get('/api/cron/seo-rollback', { headers: { Authorization: `Bearer ${cronSecret}` } });
    expect(cron.status(), await cron.text()).toBe(200);
    expect((await cron.json()).reverted).toBeGreaterThanOrEqual(1);
    expect(await text(request, `/blog/${live.slug}`)).toContain('Restored original body.');
    await request.post(`/api/articles/ingest/${live.id}/unpublish`, { headers: auth });
  });

  // Runs before the other Stage calls: Stage refuses past 3 completed actions a
  // week, and this file completes several.
  test('Fix round 1: a publish naming an action this post already completed (staged by the admin) is a no-op on the action', async ({ page, request }) => {
    const [action] = await rest<Array<{ id: string }>>(request, 'POST', 'content_actions', [{
      action_type: 'new', target_query: `${PREFIX} staged then published`, status: 'approved',
    }]);
    const post = await create(request, { title: `${PREFIX} Staged Then Published`, content: articleMarkdown('Staged.'), category: 'Kitchen Remodeling', action_id: action.id });
    await signIn(page);
    const staged = await page.request.post('/api/admin/content-actions/stage', { data: { id: action.id } });
    expect(staged.status(), await staged.text()).toBe(200);
    const pub = await request.post(`/api/articles/ingest/${post.id}/publish`, { headers: auth, data: { action_id: action.id } });
    expect(pub.status(), await pub.text()).toBe(200);
    await request.post(`/api/articles/ingest/${post.id}/unpublish`, { headers: auth });
  });

  test('RM6 + FB3: Claude drafts a new action, the admin stages it, and publish marks it applied', async ({ page, request }) => {
    const [action] = await rest<Array<{ id: string }>>(request, 'POST', 'content_actions', [{
      action_type: 'new', target_query: `${PREFIX} basement cost`, status: 'approved', rationale: { reason: 'slice F spec' },
    }]);
    const before = await (await request.get('/api/articles/seo-feedback', { headers: auth })).json();
    expect(before.open_actions.map((a: { id: string }) => a.id)).toContain(action.id);

    const created = await create(request, {
      title: `${PREFIX} Basement Cost`, content: articleMarkdown('What does a basement cost?'), category: 'Basement Finishing', action_id: action.id,
    });
    expect(created.action?.status).toBe('drafted');
    const [drafted] = await rest<Array<{ status: string; draft_markdown: string; draft_meta: Record<string, unknown> }>>(
      request, 'GET', `content_actions?select=status,draft_markdown,draft_meta&id=eq.${action.id}`);
    expect(drafted.status).toBe('drafted');
    expect(drafted.draft_markdown.startsWith(`# ${PREFIX} Basement Cost\n`)).toBe(true);
    expect(drafted.draft_meta).toMatchObject({ source: 'claude', post_id: created.id, validation: { ok: true } });

    // The admin dashboard shows the Claude Code commands and the drafted action.
    await signIn(page);
    await page.goto('/vaca-mgmt?tab=seo');
    // The innermost card holding this action's query (an ancestor matches too, and comes first).
    const card = page.locator('div.rounded-lg').filter({ hasText: `${PREFIX} basement cost` }).last();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.getByRole('button', { name: /draft with Claude Code/i }).click();
    await expect(page.getByTestId('claude-code-panel')).toContainText(`create --action ${action.id}`);

    // Stage ("Send to blog") links the post Claude made instead of inserting a copy.
    const staged = await page.request.post('/api/admin/content-actions/stage', { data: { id: action.id } });
    const stagedBody = await staged.json();
    expect(staged.status(), JSON.stringify(stagedBody)).toBe(200);
    expect(stagedBody).toMatchObject({ ok: true, postId: created.id, linked: true });
    const copies = await rest<unknown[]>(request, 'GET', `blog_posts?select=id&title=eq.${encodeURIComponent(`${PREFIX} Basement Cost`)}`);
    expect(copies).toHaveLength(1);

    // A second new action, answered and published by Claude with action_id: it leaves the open list.
    const [second] = await rest<Array<{ id: string }>>(request, 'POST', 'content_actions', [{
      action_type: 'new', target_query: `${PREFIX} attic cost`, status: 'approved',
    }]);
    const post2 = await create(request, { title: `${PREFIX} Attic Cost`, content: articleMarkdown('Attics.'), category: 'Home Additions', action_id: second.id });
    const pub = await request.post(`/api/articles/ingest/${post2.id}/publish`, { headers: auth, data: { action_id: second.id } });
    expect(pub.status(), await pub.text()).toBe(200);
    const [done] = await rest<Array<{ status: string; published_post_id: string }>>(request, 'GET', `content_actions?select=status,published_post_id&id=eq.${second.id}`);
    expect(done).toEqual({ status: 'completed', published_post_id: post2.id });
    const after = await (await request.get('/api/articles/seo-feedback', { headers: auth })).json();
    expect(after.open_actions.map((a: { id: string }) => a.id)).not.toContain(second.id);
    await request.post(`/api/articles/ingest/${post2.id}/unpublish`, { headers: auth });
  });

  test('RM6: a Claude refresh draft is applied by the admin Apply, and by a publish with action_id', async ({ page, request }) => {
    const live = await create(request, { title: `${PREFIX} Bath Guide`, content: articleMarkdown('Bath original.'), category: 'Bathroom Renovation' });
    expect((await request.post(`/api/articles/ingest/${live.id}/publish`, { headers: auth })).status()).toBe(200);

    const [refresh] = await rest<Array<{ id: string }>>(request, 'POST', 'content_actions', [{
      action_type: 'refresh', target_post_id: live.id, target_query: `${PREFIX} bath guide`, status: 'approved',
    }]);
    const patch = await request.patch(`/api/articles/ingest/${live.id}`, {
      headers: auth, data: { content: articleMarkdown('Bath refreshed by Claude.'), action_id: refresh.id },
    });
    expect(patch.status(), await patch.text()).toBe(200);
    expect((await patch.json()).action.status).toBe('drafted');
    // The live post is untouched until the draft is applied.
    expect(await text(request, `/blog/${live.slug}`)).toContain('Bath original.');

    await signIn(page);
    const applied = await page.request.post('/api/admin/content-actions/apply', { data: { id: refresh.id } });
    const appliedBody = await applied.json();
    expect(applied.status(), JSON.stringify(appliedBody)).toBe(200);
    expect(appliedBody).toMatchObject({ ok: true, postId: live.id, status: 'completed' });
    expect(await text(request, `/blog/${live.slug}`)).toContain('Bath refreshed by Claude.');
    const revisions = await rest<Array<{ content_html: string; revised_by: string }>>(request, 'GET', `blog_post_revisions?select=content_html,revised_by&post_id=eq.${live.id}`);
    expect(revisions).toEqual([expect.objectContaining({ revised_by: 'apply' })]);
    expect(revisions[0].content_html).toContain('Bath original.');

    // Second refresh, applied by Claude's publish: the guard sees the draft, then it is applied.
    const [again] = await rest<Array<{ id: string }>>(request, 'POST', 'content_actions', [{
      action_type: 'refresh', target_post_id: live.id, target_query: `${PREFIX} bath guide again`, status: 'approved',
    }]);
    await request.patch(`/api/articles/ingest/${live.id}`, { headers: auth, data: { content: articleMarkdown('Bath second pass.'), action_id: again.id } });
    const pub = await request.post(`/api/articles/ingest/${live.id}/publish`, { headers: auth, data: { action_id: again.id } });
    expect(pub.status(), await pub.text()).toBe(200);
    expect(await text(request, `/blog/${live.slug}`)).toContain('Bath second pass.');
    const [done] = await rest<Array<{ status: string; draft_meta: { applied_by: string } }>>(request, 'GET', `content_actions?select=status,draft_meta&id=eq.${again.id}`);
    expect(done.status).toBe('completed');
    expect(done.draft_meta.applied_by).toBe('claude');
    // A refresh action cannot be answered by creating a new post.
    const wrong = await request.post('/api/articles/ingest', {
      headers: auth, data: { title: `${PREFIX} wrong`, content: 'x', category: 'x', action_id: refresh.id },
    });
    expect(wrong.status()).toBe(409);
    await request.post(`/api/articles/ingest/${live.id}/unpublish`, { headers: auth });
  });

  test('Fix round 1: a refresh draft the fact-lock rejected is refused on publish (422), the live post untouched', async ({ request }) => {
    // The reviewer's case: a refresh draft with a wrong phone and no internal links.
    const live = await create(request, { title: `${PREFIX} Factlock Target`, content: articleMarkdown('Factlock original.'), category: 'Kitchen Remodeling' });
    expect((await request.post(`/api/articles/ingest/${live.id}/publish`, { headers: auth })).status()).toBe(200);
    const [refresh] = await rest<Array<{ id: string }>>(request, 'POST', 'content_actions', [{
      action_type: 'refresh', target_post_id: live.id, target_query: `${PREFIX} factlock`, status: 'approved',
    }]);
    const patch = await request.patch(`/api/articles/ingest/${live.id}`, {
      headers: auth, data: { content: 'Call us at (973) 555-0199 for a quote. No links here at all.', action_id: refresh.id },
    });
    expect(patch.status(), await patch.text()).toBe(200);
    expect((await patch.json()).action.validation.ok).toBe(false);

    const pub = await request.post(`/api/articles/ingest/${live.id}/publish`, { headers: auth, data: { action_id: refresh.id } });
    expect(pub.status()).toBe(422);
    const body = await pub.json();
    expect(body.published).toBe(false);
    expect(body.issues.join(' ')).toMatch(/internal link/);
    expect(body.issues.join(' ')).toMatch(/\(973\) 555-0199/);

    expect(await text(request, `/blog/${live.slug}`)).toContain('Factlock original.');
    expect(await text(request, `/blog/${live.slug}`)).not.toContain('555-0199');
    const [action] = await rest<Array<{ status: string; published_post_id: string | null }>>(request, 'GET', `content_actions?select=status,published_post_id&id=eq.${refresh.id}`);
    expect(action).toEqual({ status: 'drafted', published_post_id: null });
    expect(await rest<unknown[]>(request, 'GET', `blog_post_revisions?select=id&post_id=eq.${live.id}`)).toHaveLength(0);

    // A plain publish runs the same check on the post itself.
    const bare = await create(request, { title: `${PREFIX} No Links`, content: 'Call (973) 555-0199 today.', category: 'Kitchen Remodeling' });
    const barePub = await request.post(`/api/articles/ingest/${bare.id}/publish`, { headers: auth });
    expect(barePub.status()).toBe(422);
    const [bareRow] = await rest<Array<{ published: boolean }>>(request, 'GET', `blog_posts?select=published&id=eq.${bare.id}`);
    expect(bareRow.published).toBe(false);
    await request.post(`/api/articles/ingest/${live.id}/unpublish`, { headers: auth });
  });

  test('Fix round 1 (SEC4): a held post is not published or cleared while the guard still fails; no route takes review_hold', async ({ request }) => {
    // Slice G made the guard real: a held post is re-checked on every publish,
    // stays held while its content still fails, and only a passing check clears it.
    const held = await create(request, { title: `${PREFIX} Held Post`, content: `${articleMarkdown('Held.')}\n\nKitchens from $9,000 are common.`, category: 'Kitchen Remodeling' });
    const reasons = ['Price claim: "from $9,000" in paragraph 4'];
    await rest(request, 'PATCH', `blog_posts?id=eq.${held.id}`, { review_hold: { reasons, checked_at: new Date().toISOString() } });

    const pub = await request.post(`/api/articles/ingest/${held.id}/publish`, { headers: auth });
    expect(pub.status()).toBe(409);
    expect(await pub.json()).toMatchObject({ published: false, hold: reasons });
    const [row] = await rest<Array<{ published: boolean; review_hold: { reasons: string[] } | null }>>(request, 'GET', `blog_posts?select=published,review_hold&id=eq.${held.id}`);
    expect(row.published).toBe(false);
    expect(row.review_hold?.reasons).toEqual(reasons);
    expect(await status(request, `/blog/${held.slug}`)).toBe(404);

    // review_hold is not an input anywhere.
    expect((await request.patch(`/api/articles/ingest/${held.id}`, { headers: auth, data: { review_hold: null } })).status()).toBe(400);
    expect((await request.post(`/api/articles/ingest/${held.id}/publish`, { headers: auth, data: { review_hold: null } })).status()).toBe(400);
    expect((await request.post('/api/articles/ingest', { headers: auth, data: { title: 't', content: 'c', category: 'k', review_hold: null } })).status()).toBe(400);
  });

  test('FB1/FB2: the feedback route returns the shape from seo_metrics, decaying pages joined to their posts', async ({ request }) => {
    const live = await create(request, { title: `${PREFIX} Decaying Post`, content: articleMarkdown('Decay.'), category: 'Kitchen Remodeling' });
    expect((await request.post(`/api/articles/ingest/${live.id}/publish`, { headers: auth })).status()).toBe(200);
    const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
    const m = (url: string, date: string, clicks: number, impressions: number) =>
      ({ source: 'gsc', url, query: null, date, clicks, impressions, position: 7 });
    await rest(request, 'POST', 'seo_metrics', [
      m(`/blog/${live.slug}`, day(20), 12, 400),
      m(`/blog/${live.slug}`, day(5), 3, 300),
      m(`/${PREFIX}-rising`, day(20), 1, 40),
      m(`/${PREFIX}-rising`, day(5), 9, 60),
    ]);

    const res = await request.get('/api/articles/seo-feedback?days=28', { headers: auth });
    expect(res.status()).toBe(200);
    const fb = await res.json();
    expect(fb.window.days).toBe(28);
    const decaying = fb.pages.find((p: { path: string }) => p.path === `/blog/${live.slug}`);
    expect(decaying).toMatchObject({ impressions: 700, clicks: 15, trend_delta: -9, decaying: true, position: 7 });
    expect(decaying.post).toMatchObject({ id: live.id, slug: live.slug, title: `${PREFIX} Decaying Post` });
    expect(decaying.post.published_at).toBeTruthy();
    const rising = fb.pages.find((p: { path: string }) => p.path === `/${PREFIX}-rising`);
    expect(rising).toMatchObject({ trend_delta: 8, decaying: false });
    expect(rising.post).toBeUndefined();
    expect(fb.pages.length).toBeLessThanOrEqual(200);
    for (const key of ['refresh_candidates', 'new_article_candidates', 'open_actions']) expect(Array.isArray(fb[key]), key).toBe(true);

    expect((await request.get('/api/articles/seo-feedback?days=91', { headers: auth })).status()).toBe(400);
    await request.post(`/api/articles/ingest/${live.id}/unpublish`, { headers: auth });
  });

  test('ART8: the CLI creates, patches, publishes, unpublishes and reads feedback end to end', async ({ request, baseURL }) => {
    const dir = join(root, 'test-results', `slice-f-cli-${RUN}`);
    mkdirSync(dir, { recursive: true });
    const md = join(dir, 'article.md');
    writeFileSync(md, `# ${PREFIX} Cli Article\n\n${articleMarkdown('From the CLI.')}\n`);
    const faq = join(dir, 'faq.json');
    writeFileSync(faq, JSON.stringify([{ q: 'Is this from the CLI?', a: 'Yes.' }, { q: 'Does it publish?', a: 'Yes.' }]));
    const cli = (...args: string[]) => spawnSync('node', ['scripts/ingest-article.mjs', ...args, '--site', baseURL!], {
      cwd: root, encoding: 'utf8', env: { ...process.env, PROJECT_INGEST_TOKEN: token },
    });

    const created = cli('create', '--file', md, '--category', 'Kitchen Remodeling', '--faq', faq);
    expect(created.status, created.stderr).toBe(0);
    const id = /Draft created: (\S+)/.exec(created.stdout)![1];
    const slug = /Slug:\s+(\S+)/.exec(created.stdout)![1];
    expect(slug).toBe(`${PREFIX}-cli-article`);

    const patched = cli('patch', id, '--meta-description', 'Patched from the CLI.');
    expect(patched.status, patched.stderr).toBe(0);
    expect(patched.stdout).toContain('(draft)');

    const published = cli('publish', id);
    expect(published.status, published.stderr).toBe(0);
    expect(published.stdout).toContain(`/blog/${slug}`);
    expect(await status(request, `/blog/${slug}`)).toBe(200);

    const feedback = cli('feedback', '--summary');
    expect(feedback.status, feedback.stderr).toBe(0);
    expect(feedback.stdout).toMatch(/Window: .* \(28 days\)/);

    const down = cli('unpublish', id);
    expect(down.status, down.stderr).toBe(0);
    expect(await status(request, `/blog/${slug}`)).toBe(404);

    const missing = cli('create', '--category', 'x');
    expect(missing.status).toBe(1);
    expect(read('docs/articles-ingest.md')).toContain('node scripts/ingest-article.mjs create');
  });

  test('ART7: the 31st call in a minute from one IP gets 429', async ({ request }) => {
    // This run's own burst IP; beforeEach emptied its bucket, and nothing else touches it.
    const burst = { 'cf-connecting-ip': burstIp };
    const statuses: number[] = [];
    for (let i = 0; i < 31; i += 1) {
      statuses.push((await request.get('/api/articles/seo-feedback', { headers: { ...burst, Authorization: 'Bearer wrong-token' } })).status());
    }
    expect(statuses.slice(0, 30).every((s) => s === 401), statuses.join(',')).toBe(true);
    expect(statuses[30]).toBe(429);
  });
});
