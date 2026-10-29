import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON } from './helpers/liveBackend';
import {
  checkIngestToken, configuredIngestToken, tokensMatch, bearerToken, MIN_INGEST_TOKEN_LENGTH,
} from '../src/lib/projects/ingestAuth';
import { sniffMedia, isHeic } from '../src/lib/projects/media';
import { defaultAltText, defaultMetaDescription, defaultSeoTitle, deriveSlug, slugify } from '../src/lib/projects/slug';
import { formatMonthYear, parseDateOnly } from '../src/lib/projects/dates';

/**
 * Slice D: portfolio projects as drafts, no AI, and an ingest API for Claude Code.
 * Acceptance criteria PF1-PF8, SEC1, SEC4 (docs/home-services/acceptance-criteria.md).
 *
 * The first half needs no backend: source pins and the pure helpers (the
 * ingest token check above all, because "token unset means 404" cannot be shown
 * against a server that has the token set). The second half is live-backend:
 * it signs in as a real local admin, drives the API and the admin UI, and checks
 * the public pages. Run it with:
 *
 *   TEST_URL=http://localhost:3104 E2E_LIVE_BACKEND=1 \
 *     node_modules/.bin/playwright test tests/project-drafts.spec.ts --project=chromium
 *
 * against `npm run dev -- -p 3104` with the local Supabase env in .env.local.
 * Every row it creates is titled `ZZTEST-D-SPEC ...` and removed in afterAll,
 * together with the storage objects it wrote.
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

// ---------------------------------------------------------------------------
// Source pins (PF1, PF8)
// ---------------------------------------------------------------------------

test.describe('no AI in the project upload path (source checks)', () => {
  test('the analyze-project route and the four-step wizard are gone', () => {
    expect(existsSync(join(root, 'src/app/api/admin/analyze-project'))).toBe(false);
    expect(existsSync(join(root, 'src/components/admin/project-steps'))).toBe(false);
  });

  test('no Gemini, AI-assistant or Sparkles reference in the project components', () => {
    const files = [
      ...walk(join(root, 'src/components/admin/projects')),
      join(root, 'src/components/admin/ProjectUploadSystem.tsx'),
      join(root, 'src/components/admin/PortfolioManager.tsx'),
      ...walk(join(root, 'src/lib/projects')),
      ...walk(join(root, 'src/app/api/admin/projects')),
      ...walk(join(root, 'src/app/api/projects/ingest')),
    ];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/analyze-project|GEMINI|gemini|ai-project-assistant|Sparkles|keyword-research/);
    }
  });

  test('the form is one page: no step indicator, no progress bar, Save draft is the action', () => {
    const src = read('src/components/admin/ProjectUploadSystem.tsx');
    expect(src).not.toMatch(/Step \{|currentStep|<Progress/);
    expect(src).toContain("'Save draft'");
    expect(src).toContain('list="pf-location-options"');
    expect(read('src/components/admin/projects/MoreDetailsSection.tsx')).toContain('type="month"');
  });

  test('every public reader of projects filters active = true (a draft never renders)', () => {
    const readers = [
      'src/app/projects/[slug]/page.tsx',
      'src/app/portfolio/page.tsx',
      'src/app/free-estimate/page.tsx',
      'src/components/ProjectGallery.tsx',
      'src/app/sitemap.ts',
    ];
    for (const f of readers) {
      const src = read(f);
      const reads = src.split(".from('projects')").length - 1;
      const filters = src.split(".eq('active', true)").length - 1;
      expect(reads, `${f} reads projects`).toBeGreaterThan(0);
      expect(filters, `${f}: every .from('projects') needs .eq('active', true)`).toBeGreaterThanOrEqual(reads);
    }
  });

  test('the manager View link uses url_slug, not the id', () => {
    const src = read('src/components/admin/PortfolioManager.tsx');
    expect(src).toContain('/projects/${p.url_slug}');
    expect(src).not.toContain('/projects/${project.id}');
  });
});

// ---------------------------------------------------------------------------
// Pure helpers (PF5 "token unset is 404", SEC4, SEC2 magic bytes, defaults)
// ---------------------------------------------------------------------------

test.describe('ingest token check (direct import)', () => {
  const good = 'x'.repeat(MIN_INGEST_TOKEN_LENGTH);

  test('unset, blank or short token disables the route for everyone', () => {
    expect(configuredIngestToken({})).toBeNull();
    expect(configuredIngestToken({ PROJECT_INGEST_TOKEN: '   ' })).toBeNull();
    expect(configuredIngestToken({ PROJECT_INGEST_TOKEN: 'x'.repeat(31) })).toBeNull();
    expect(checkIngestToken(`Bearer ${'x'.repeat(31)}`, { PROJECT_INGEST_TOKEN: 'x'.repeat(31) })).toBe('disabled');
    expect(checkIngestToken(null, {})).toBe('disabled');
  });

  test('a configured token: valid, invalid, absent', () => {
    const env = { PROJECT_INGEST_TOKEN: good };
    expect(checkIngestToken(`Bearer ${good}`, env)).toBe('valid');
    expect(checkIngestToken(`bearer ${good}`, env)).toBe('valid');
    expect(checkIngestToken(`Bearer ${good}x`, env)).toBe('invalid');
    expect(checkIngestToken('Bearer short', env)).toBe('invalid');
    expect(checkIngestToken(good, env)).toBe('absent');
    expect(checkIngestToken(null, env)).toBe('absent');
  });

  test('comparison works across unequal lengths without throwing', () => {
    expect(tokensMatch('a', 'a'.repeat(64))).toBe(false);
    expect(tokensMatch('same-token', 'same-token')).toBe(true);
    expect(bearerToken('Bearer  abc ')).toBe('abc');
    expect(bearerToken('Basic abc')).toBeNull();
  });

  test('the comparison is constant time (timingSafeEqual on fixed-length digests)', () => {
    const src = read('src/lib/projects/ingestAuth.ts');
    expect(src).toContain('timingSafeEqual');
    expect(src).toContain("createHash('sha256')");
  });
});

test.describe('media sniffing and deterministic defaults', () => {
  test('magic bytes decide the type, not the name', () => {
    expect(sniffMedia(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe('jpg');
    expect(sniffMedia(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.ext).toBe('png');
    const ftyp = (brand: string) => new Uint8Array([0, 0, 0, 0x18, ...Buffer.from('ftyp'), ...Buffer.from(brand)]);
    expect(sniffMedia(ftyp('isom'))?.kind).toBe('video');
    expect(sniffMedia(ftyp('qt  '))?.ext).toBe('mov');
    expect(sniffMedia(ftyp('heic'))).toBeNull();
    expect(isHeic(ftyp('heic'))).toBe(true);
    expect(sniffMedia(new Uint8Array(Buffer.from('<html>hi</html>')))).toBeNull();
  });

  test('date_completed shows its own month in a US timezone (was one month early)', () => {
    const before = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      // The defect: a bare date parses as UTC midnight, the evening before in New York.
      expect(new Date('2026-10-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' })).toBe('September 2026');
      expect(parseDateOnly('2026-10-01').getMonth()).toBe(9);
      expect(formatMonthYear('2026-10-01')).toBe('October 2026');
      expect(formatMonthYear('2026-01-01', 'short')).toBe('Jan 2026');
      expect(formatMonthYear('')).toBe('');
    } finally {
      if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
    }
  });

  test('slug, SEO title, meta description and alt text defaults', () => {
    expect(slugify('Modern Kitchen & Bath!')).toBe('modern-kitchen-and-bath');
    expect(deriveSlug('Modern Kitchen', 'Clifton')).toBe('modern-kitchen-clifton');
    expect(deriveSlug('Clifton Kitchen', 'Clifton')).toBe('clifton-kitchen');
    expect(defaultSeoTitle('Modern Kitchen', 'Clifton')).toBe('Modern Kitchen in Clifton');
    // Rendered with the layout's " | La Vaca GC" suffix, the title stays within 60.
    const long = defaultSeoTitle('An Extremely Long Project Title That Goes On And On', 'West Caldwell');
    expect(`${long} | La Vaca GC`.length).toBeLessThanOrEqual(60);
    expect(defaultMetaDescription('a'.repeat(100), 'b '.repeat(60), [], '').length).toBeLessThanOrEqual(155);
    expect(defaultAltText('before', ['Kitchen Remodeling'], 'Clifton')).toBe('Before - Kitchen Remodeling in Clifton');
  });
});

// ---------------------------------------------------------------------------
// Live backend (PF1-PF7, SEC1)
// ---------------------------------------------------------------------------

/** .env.local is not loaded into the test process; read the few values the setup needs. */
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

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin-d@local.test';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'LocalAdmin!2026';
const RUN = Date.now().toString(36);
const PREFIX = `ZZTEST-D-SPEC ${RUN}`;

// A real 64x48 green JPEG (676 bytes): decodes in the browser and passes the sniffer.
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAwAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDhqKKK5j5oKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD/2Q==',
  'base64',
);

test.describe('drafts, publish and ingest (live backend)', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);
  // A US timezone, where a UTC-parsed date shows the month before.
  test.use({ timezoneId: 'America/New_York' });

  const env = localEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SECRET_KEY;
  const ingestToken = env.PROJECT_INGEST_TOKEN;
  const draftPaths = [0, 1].map((n) => `drafts/zztest-d-spec-${RUN}-${n}.jpg`);
  const service = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  async function clearIngestRateLimit(request: APIRequestContext) {
    // Only this suite's bucket family; other builders share the database.
    await request.delete(`${supabaseUrl}/rest/v1/rate_limits?ip_address=like.project-ingest:*`, { headers: service });
  }

  async function signIn(page: Page) {
    await page.goto('/auth');
    await page.locator('#signin-email').fill(ADMIN_EMAIL);
    await page.locator('#signin-password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await page.waitForURL(/\/vaca-mgmt/, { timeout: 30_000 });
  }

  async function publicStatus(request: APIRequestContext, slug: string) {
    return (await request.get(`/projects/${slug}`, { maxRedirects: 0 })).status();
  }

  test.beforeAll(async ({ request }) => {
    test.skip(!supabaseUrl || !serviceKey || !ingestToken, 'Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and PROJECT_INGEST_TOKEN in .env.local');
    for (const path of draftPaths) {
      const res = await request.post(`${supabaseUrl}/storage/v1/object/project-images/${path}`, {
        headers: { ...service, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
        data: TINY_JPEG,
      });
      expect(res.ok(), await res.text()).toBe(true);
    }
    await clearIngestRateLimit(request);
  });

  test.afterAll(async ({ request }) => {
    if (!supabaseUrl || !serviceKey) return;
    const rows = await (await request.get(
      `${supabaseUrl}/rest/v1/projects?select=id,project_images!project_images_project_id_fkey(image_url)&title=like.${encodeURIComponent(`${PREFIX}*`)}`,
      { headers: service },
    )).json() as Array<{ id: string; project_images: Array<{ image_url: string }> }>;
    const marker = '/storage/v1/object/public/project-images/';
    const objects = new Set<string>(draftPaths);
    for (const r of rows) {
      for (const img of r.project_images ?? []) {
        const path = img.image_url.split(marker)[1];
        // Only objects this suite wrote: its drafts and the projects/ uploads made for its rows.
        if (path && path.startsWith('projects/')) objects.add(decodeURIComponent(path));
      }
      await request.patch(`${supabaseUrl}/rest/v1/projects?id=eq.${r.id}`, { headers: service, data: { featured_image_id: null } });
      await request.delete(`${supabaseUrl}/rest/v1/projects?id=eq.${r.id}`, { headers: service });
    }
    await request.delete(`${supabaseUrl}/storage/v1/object/project-images`, { headers: service, data: { prefixes: [...objects] } });
    await clearIngestRateLimit(request);
  });

  let draftId = '';
  let draftSlug = '';

  test('PF3: an admin-saved draft is status=draft, active=false, and never renders publicly', async ({ page }) => {
    await signIn(page);
    const title = `${PREFIX} Api Draft`;
    const res = await page.request.post('/api/admin/projects', {
      data: {
        title,
        location: 'Clifton',
        service_types: ['Kitchen Remodeling'],
        images: [{ url: `${supabaseUrl}/storage/v1/object/public/project-images/${draftPaths[0]}`, category: 'after' }],
      },
    });
    expect(res.status(), await res.text()).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('draft');
    draftId = body.id;
    draftSlug = body.url_slug;

    const got = await (await page.request.get(`/api/admin/projects/${draftId}`)).json();
    expect(got.project).toMatchObject({ status: 'draft', active: false, featured: false, source: 'admin' });
    expect(got.project.project_images).toHaveLength(1);

    expect(await publicStatus(page.request, draftSlug)).toBe(404);
    expect(await publicStatus(page.request, draftId)).toBe(404);
    // /portfolio and /free-estimate render their project lists on the server.
    for (const path of ['/portfolio', '/free-estimate']) {
      const html = await (await page.request.get(path)).text();
      expect(html, `${path} must not show a draft`).not.toContain(title);
    }
  });

  test('PF4: Publish makes it live; Unpublish takes it back down', async ({ page }) => {
    await signIn(page);
    const pub = await page.request.post(`/api/admin/projects/${draftId}/publish`, { data: {} });
    expect(pub.status(), await pub.text()).toBe(200);
    const got = (await (await page.request.get(`/api/admin/projects/${draftId}`)).json()).project;
    expect(got).toMatchObject({ status: 'published', active: true, featured: false });
    expect(got.published_at).toBeTruthy();
    expect(await publicStatus(page.request, draftSlug)).toBe(200);
    expect(await (await page.request.get('/portfolio')).text()).toContain(`${PREFIX} Api Draft`);

    const down = await page.request.post(`/api/admin/projects/${draftId}/unpublish`);
    expect(down.status()).toBe(200);
    expect(await publicStatus(page.request, draftSlug)).toBe(404);

    const feat = await page.request.post(`/api/admin/projects/${draftId}/publish`, { data: { feature: true } });
    expect((await feat.json()).status).toBe('published');
    expect((await (await page.request.get(`/api/admin/projects/${draftId}`)).json()).project.featured).toBe(true);

    // The homepage gallery loads in the browser (featured AND active). A draft
    // that is somehow flagged featured (bulk "Feature" can do that) must still
    // stay off it, while the featured published project shows.
    const hidden = await page.request.post('/api/admin/projects', {
      data: {
        title: `${PREFIX} Featured Draft`,
        location: 'Clifton',
        service_types: ['Kitchen Remodeling'],
        images: [{ url: `${supabaseUrl}/storage/v1/object/public/project-images/${draftPaths[1]}` }],
      },
    });
    const hiddenId = (await hidden.json()).id;
    await page.request.patch(`${supabaseUrl}/rest/v1/projects?id=eq.${hiddenId}`, { headers: service, data: { featured: true } });
    await page.goto('/');
    await page.locator('#projects').scrollIntoViewIfNeeded();
    await expect(page.getByText(`${PREFIX} Api Draft`, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(`${PREFIX} Featured Draft`)).toHaveCount(0);
  });

  test('PF7: editing a published project keeps it published, and the edit renders', async ({ page }) => {
    await signIn(page);
    const res = await page.request.patch(`/api/admin/projects/${draftId}`, {
      data: { title: `${PREFIX} Api Draft Edited`, challenge: 'Edited in PF7.' },
    });
    expect(res.status(), await res.text()).toBe(200);
    const got = (await (await page.request.get(`/api/admin/projects/${draftId}`)).json()).project;
    expect(got).toMatchObject({ status: 'published', active: true, title: `${PREFIX} Api Draft Edited`, url_slug: draftSlug });
    const html = await (await page.request.get(`/projects/${draftSlug}`)).text();
    expect(html).toContain(`${PREFIX} Api Draft Edited`);
  });

  test('PF5: ingest with the token, from a storage path and from a multipart file; 401 without', async ({ request }) => {
    const auth = { Authorization: `Bearer ${ingestToken}` };

    const noToken = await request.post('/api/projects/ingest', { data: { title: 'x' } });
    expect(noToken.status()).toBe(401);
    const badToken = await request.post('/api/projects/ingest', {
      headers: { Authorization: 'Bearer not-the-token-not-the-token-not-the-token' }, data: { title: 'x' },
    });
    expect(badToken.status()).toBe(401);
    expect(await badToken.text()).not.toMatch(/supabase|postgres|stack/i);

    const json = await request.post('/api/projects/ingest', {
      headers: auth,
      data: {
        title: `${PREFIX} Ingest Json`,
        location: 'Bloomfield',
        service_types: ['Bathroom Renovation'],
        images: [
          { path: draftPaths[0], category: 'before', pair_key: 'p1', caption: 'Bath' },
          { url: `${supabaseUrl}/storage/v1/object/public/project-images/${draftPaths[1]}`, category: 'after', pair_key: 'p1' },
        ],
      },
    });
    expect(json.status(), await json.text()).toBe(201);
    const created = await json.json();
    expect(created).toMatchObject({ status: 'draft' });
    expect(created.admin_url).toContain(`/vaca-mgmt?project=${created.id}`);
    expect(await publicStatus(request, created.url_slug)).toBe(404);

    const row = await (await request.get(
      `${supabaseUrl}/rest/v1/projects?select=status,active,source,project_images!project_images_project_id_fkey(image_category,pair_key,alt_text)&id=eq.${created.id}`,
      { headers: service },
    )).json();
    expect(row[0]).toMatchObject({ status: 'draft', active: false, source: 'api' });
    expect(row[0].project_images).toHaveLength(2);
    expect(row[0].project_images.every((i: { pair_key: string }) => i.pair_key === 'p1')).toBe(true);

    const multipart = await request.post('/api/projects/ingest', {
      headers: auth,
      multipart: {
        project: JSON.stringify({ title: `${PREFIX} Ingest Multipart`, location: 'Clifton', service_types: ['Home Additions'] }),
        'files[]': { name: 'after.jpg', mimeType: 'image/jpeg', buffer: TINY_JPEG },
      },
    });
    expect(multipart.status(), await multipart.text()).toBe(201);
    const mp = await multipart.json();
    const mpRow = await (await request.get(
      `${supabaseUrl}/rest/v1/project_images?select=image_url,image_category&project_id=eq.${mp.id}`, { headers: service },
    )).json();
    expect(mpRow).toHaveLength(1);
    expect(mpRow[0].image_url).toContain(`/projects/${mp.id}_0.jpg`);
    expect(mpRow[0].image_category).toBe('after');

    // SEC2: the bytes decide. A text file named .jpg is refused and nothing is created.
    const fake = await request.post('/api/projects/ingest', {
      headers: auth,
      multipart: {
        project: JSON.stringify({ title: `${PREFIX} Fake`, location: 'Clifton', service_types: ['Home Additions'] }),
        'files[]': { name: 'fake.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('<html>not a photo</html>') },
      },
    });
    expect(fake.status()).toBe(415);

    // Published projects are refused by the ingest PATCH unless allow_published.
    await request.post(`/api/projects/ingest/${mp.id}/publish`, { headers: auth });
    const refused = await request.patch(`/api/projects/ingest/${mp.id}`, { headers: auth, data: { challenge: 'x' } });
    expect(refused.status()).toBe(409);
    const allowed = await request.patch(`/api/projects/ingest/${mp.id}`, { headers: auth, data: { challenge: 'x', allow_published: true } });
    expect((await allowed.json()).status).toBe('published');
  });

  test('SEC1: ingest validates bodies and caps their size', async ({ request }) => {
    const auth = { Authorization: `Bearer ${ingestToken}` };
    const invalid = await request.post('/api/projects/ingest', {
      headers: auth, data: { title: '', location: 'Clifton', service_types: ['Kitchens'], images: [] },
    });
    expect(invalid.status()).toBe(400);
    const big = await request.post('/api/projects/ingest', {
      headers: { ...auth, 'Content-Type': 'application/json' }, data: JSON.stringify({ title: 'x'.repeat(300 * 1024) }),
    });
    expect(big.status()).toBe(413);
    const escape = await request.post('/api/projects/ingest', {
      headers: auth,
      data: { title: `${PREFIX} Escape`, location: 'Clifton', service_types: ['Home Additions'], images: [{ path: '../secrets.jpg' }] },
    });
    expect(escape.status()).toBe(400);
  });

  test('PF6: the draft-photos listing returns objects under drafts/', async ({ page }) => {
    await signIn(page);
    const res = await page.request.get('/api/admin/projects/draft-photos');
    expect(res.status()).toBe(200);
    const { photos } = await res.json() as { photos: Array<{ path: string; url: string; in_use: boolean; size: number }> };
    for (const path of draftPaths) {
      const hit = photos.find((p) => p.path === path);
      expect(hit, path).toBeTruthy();
      expect(hit!.url).toContain(`/project-images/${path}`);
      // Both were attached to drafts above, so both read as in use.
      expect(hit!.in_use).toBe(true);
    }
  });

  test('PF1, PF2, PF4, PF6 in the browser: one-page form saves a draft, the card publishes it', async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page);
    await page.getByRole('button', { name: 'Content' }).click();
    await page.getByRole('button', { name: 'Projects' }).click();
    await expect(page.getByTestId('portfolio-manager')).toBeVisible();

    // PF6: the storage panel opens the form with the picked photo attached, no upload.
    await page.getByTestId('draft-photos-panel').getByRole('button', { name: /Draft photos in storage/ }).click();
    await page.getByRole('button', { name: /Show \d+ already used/ }).click();
    await page.getByLabel(`Select zztest-d-spec-${RUN}-0.jpg`).check();
    await page.getByTestId('start-draft-from-photos').click();
    await expect(page.getByTestId('project-form')).toBeVisible();
    await expect(page.getByTestId('project-photo')).toHaveCount(1);
    await page.getByRole('button', { name: 'Back to Portfolio' }).click();

    // PF1: Add New Project, one file, title, location, one service, Save draft.
    await page.getByTestId('add-project').click();
    const form = page.getByTestId('project-form');
    await expect(form).toBeVisible();
    await expect(form.getByText(/Step \d of/)).toHaveCount(0);
    const dir = mkdtempSync(join(tmpdir(), 'zztest-d-'));
    const file = join(dir, 'after.jpg');
    writeFileSync(file, TINY_JPEG);
    await page.getByTestId('project-file-input').setInputFiles(file);
    await form.getByLabel('Title').fill(`${PREFIX} Browser Draft`);
    await form.getByLabel('Location').fill('Parsippany');
    await form.getByText('Basement Finishing', { exact: true }).click();

    // PF2: each thumbnail has the stage toggle (After by default), a star and a remove.
    const thumb = page.getByTestId('project-photo').first();
    await expect(thumb.getByRole('radio', { name: 'After' })).toHaveAttribute('aria-checked', 'true');
    await expect(thumb.getByRole('button', { name: /featured photo/i })).toBeVisible();
    await expect(thumb.getByRole('button', { name: 'Remove' })).toBeVisible();
    await expect(thumb.getByPlaceholder('Alt text')).toHaveValue('After - Basement Finishing in Parsippany');
    await expect(page.getByText('Uploading')).toHaveCount(0, { timeout: 30_000 });

    const saved = page.waitForResponse((r) => r.url().endsWith('/api/admin/projects') && r.request().method() === 'POST');
    await page.getByTestId('project-save').click();
    expect((await saved).status()).toBe(201);

    // Back in the manager, in Drafts, with Publish and Publish + feature.
    const card = page.getByTestId('draft-card').filter({ hasText: `${PREFIX} Browser Draft` });
    await expect(card).toBeVisible();
    await expect(card.getByTestId('publish-feature-draft')).toBeVisible();
    const published = page.waitForResponse((r) => /\/api\/admin\/projects\/[^/]+\/publish$/.test(r.url()));
    await card.getByTestId('publish-draft').click();
    const pub = await published;
    expect(pub.status()).toBe(200);
    const { url_slug: slug } = await pub.json();
    await expect(card).toHaveCount(0);
    await expect(page.getByTestId('project-card').filter({ hasText: `${PREFIX} Browser Draft` }).getByTestId('project-status')).toHaveText('Published');
    expect(await publicStatus(page.request, slug)).toBe(200);

    // The form defaulted the month to this one; the public page must say so.
    const now = new Date();
    const thisMonth = formatMonthYear(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
    await page.goto(`/projects/${slug}`);
    await expect(page.locator('time').first()).toHaveText(thisMonth);
    await expect(page.getByText('(5/5 stars)')).toHaveCount(0);
  });
});
