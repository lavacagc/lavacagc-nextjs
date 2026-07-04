import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import http from 'http';
import path from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { buildReleaseEmail, type ReleaseFeature } from '../src/lib/homecare/releaseEmail';
import { preflightReleaseAssets } from '../src/lib/homecare/releaseAssets';

/**
 * R1 release-notes email system:
 *  1. buildReleaseEmail() produces the branded "what's new" email (subject,
 *     absolute screenshot URLs, benefit copy, unsubscribe/preferences links,
 *     HTML escaping).
 *  2. The /vaca-mgmt/releases admin page lists the queued features, sends a
 *     test to the signed-in admin, and only emails all members after an
 *     explicit inline confirmation. Deleting a queue entry also requires an
 *     inline confirm.
 *  3. The send API rejects mode:'all' without confirm:true (400) and rejects
 *     unauthenticated callers (401 from middleware).
 *
 * The admin JSON APIs are mocked at the browser network layer — the flows
 * under test are client-side. The admin page is reached the same way as in
 * preferences-ui-fixes.spec.ts: NEXT_PUBLIC_SUPABASE_URL is baked to a local
 * GoTrue stub (127.0.0.1:9099) and a fabricated session cookie makes
 * middleware's getUser() succeed.
 */

const EVIDENCE_DIR = process.env.EVIDENCE_DIR || 'test-results/release-notes-evidence';
mkdirSync(EVIDENCE_DIR, { recursive: true });
const shot = (name: string) => path.join(EVIDENCE_DIR, name);

/** First-edition content: the Wave 1 growth features, with the repo screenshots. */
const WAVE1: ReleaseFeature[] = [
  {
    headline: "Dismiss tasks that don't apply",
    subhead:
      'Every checklist task now has a "Not relevant" link — dismissed tasks tuck into a collapsible strip at the bottom instead of cluttering your list.',
    benefit: 'Your checklist only shows work your home actually needs, so 100% done really means done.',
    screenshot_path: '/email/releases/dismiss-task.png',
  },
  {
    headline: 'Watch your season fill up',
    subhead:
      "A live progress bar tracks how much of the season's checklist you've knocked out — finish it and you get a little celebration.",
    benefit: 'You can see at a glance how close your home is to fully protected this season.',
    screenshot_path: '/email/releases/progress-bar.png',
  },
  {
    headline: 'Share your progress',
    subhead: 'Turn a finished season into a share card you can post or text with one tap.',
    benefit: "Show off the work you've put into your home — friends get their own free checklist.",
    screenshot_path: '/email/releases/share-card.png',
  },
];

const PROD = 'https://www.lavacagc.com';

test.describe('buildReleaseEmail()', () => {
  test('multi-feature edition: subject, absolute screenshots, copy, branding, links', () => {
    const { subject, html, text } = buildReleaseEmail({
      firstName: 'Alex',
      features: WAVE1,
      baseUrl: PROD,
      unsubscribeUrl: `${PROD}/api/home-care/unsubscribe?token=tok-123`,
      preferencesUrl: `${PROD}/preferences?token=tok-123`,
    });
    expect(subject).toBe('3 new things in your Home Care portal');
    expect(html).toContain('Hi Alex,');
    for (const f of WAVE1) {
      expect(html).toContain(`${PROD}${f.screenshot_path}`); // email clients need absolute URLs
      expect(html).toContain(f.benefit);
      expect(text).toContain(f.headline);
    }
    expect(html).toContain("What's new");
    expect(html).toContain('/home-care/checklist'); // CTA to the portal
    expect(html).toContain('unsubscribe?token=tok-123');
    expect(html).toContain('Manage email preferences');
    expect(html).toContain('13VH13373800'); // license
    expect(html).toContain('(201) 212-4917'); // phone
    expect(html).toContain('logo.png');
    expect(text).toContain('Unsubscribe:');
  });

  test('single-feature edition leads with the headline; no preferences link when absent', () => {
    const { subject, html } = buildReleaseEmail({
      firstName: null,
      features: [WAVE1[0]],
      baseUrl: PROD,
      unsubscribeUrl: `${PROD}/u`,
    });
    expect(subject).toBe("New in your Home Care portal: Dismiss tasks that don't apply");
    expect(html).toContain('Hi there,');
    expect(html).not.toContain('Manage email preferences');
  });

  test('assetVersion cache-busts every screenshot URL, and only those', () => {
    // AC: with assetVersion, each screenshot src carries ?v=<version> (URL-encoded)
    // so every send gets a fresh CDN cache key; the logo and all links stay
    // unversioned; omitting assetVersion keeps the old URLs byte-identical.
    const { html } = buildReleaseEmail({
      firstName: null,
      features: WAVE1,
      baseUrl: PROD,
      unsubscribeUrl: `${PROD}/u`,
      assetVersion: 'v 1',
    });
    for (const f of WAVE1) {
      expect(html).toContain(`src="${PROD}${f.screenshot_path}?v=v%201"`);
    }
    expect(html).toContain(`src="${PROD}/logo.png"`); // logo unversioned

    const { html: unversioned } = buildReleaseEmail({
      firstName: null,
      features: WAVE1,
      baseUrl: PROD,
      unsubscribeUrl: `${PROD}/u`,
    });
    expect(unversioned).not.toContain('?v=');
  });

  test('copy is HTML-escaped', () => {
    const { html } = buildReleaseEmail({
      firstName: '<b>Alex</b>',
      features: [
        {
          headline: 'Tags & "quotes" <script>alert(1)</script>',
          subhead: 'a < b',
          benefit: 'c > d',
          screenshot_path: null,
        },
      ],
      baseUrl: PROD,
      unsubscribeUrl: `${PROD}/u`,
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Hi &lt;b&gt;Alex&lt;/b&gt;,');
  });
});

test.describe('preflightReleaseAssets()', () => {
  // Local stand-in for the prod origin: /logo.png is the control, /good.png a
  // healthy screenshot, /missing.png a 404 (Cloudflare's frozen-error case
  // looks identical from the probe's perspective). Ephemeral port — chromium
  // and mobile workers run this block concurrently.
  const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
  let assetStub: http.Server;
  let ASSET_BASE = '';
  let requests: string[] = [];
  let controlBroken = false;

  test.beforeAll(async () => {
    assetStub = http.createServer((req, res) => {
      requests.push(req.url ?? '');
      const pathOnly = (req.url ?? '').split('?')[0];
      if (pathOnly === '/logo.png' && controlBroken) {
        res.writeHead(403).end();
      } else if (pathOnly === '/logo.png' || pathOnly === '/good.png' || pathOnly === '/good2.png') {
        res.writeHead(200, { 'content-type': 'image/png' }).end(PNG);
      } else {
        res.writeHead(404, { 'content-type': 'text/html' }).end('not found');
      }
    });
    await new Promise<void>((resolve, reject) => {
      assetStub.once('error', reject);
      assetStub.listen(0, '127.0.0.1', () => {
        assetStub.removeAllListeners('error');
        resolve();
      });
    });
    const addr = assetStub.address();
    if (!addr || typeof addr === 'string') throw new Error('asset stub did not bind a port');
    ASSET_BASE = `http://127.0.0.1:${addr.port}`;
  });
  test.afterAll(async () => {
    await new Promise((resolve) => assetStub.close(resolve));
  });
  test.beforeEach(() => {
    requests = [];
    controlBroken = false;
  });

  test('passes when every screenshot serves a real image, probing the cache-busted URLs', async () => {
    // AC: healthy screenshots → ok, no failures; probes hit the exact ?v= URLs
    // the email will embed (so a passing preflight warmed the same cache keys).
    const result = await preflightReleaseAssets(ASSET_BASE, ['/good.png', '/good2.png', null], 'ed1');
    expect(result).toEqual({ ok: true, failures: [] });
    expect(requests).toContain('/logo.png?v=ed1');
    expect(requests).toContain('/good.png?v=ed1');
    expect(requests).toContain('/good2.png?v=ed1');
  });

  test('fails naming exactly the unreachable screenshot', async () => {
    // AC: one broken screenshot blocks the send and the error names it with
    // its probe outcome; healthy ones are not listed.
    const result = await preflightReleaseAssets(ASSET_BASE, ['/good.png', '/missing.png'], 'ed2');
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual([`${ASSET_BASE}/missing.png → HTTP 404`]);
  });

  test('fail-opens with a loud warning when the control asset is blocked', async () => {
    // AC: if the long-deployed control fails, the CDN is blocking probes —
    // don't strand the send button on a false positive, but say so.
    controlBroken = true;
    const result = await preflightReleaseAssets(ASSET_BASE, ['/missing.png'], 'ed3');
    expect(result.ok).toBe(true);
    expect(result.warning).toContain('NOT verified');
    expect(requests).toEqual(['/logo.png?v=ed3']); // screenshots never probed
  });

  test('no screenshots → no probes at all', async () => {
    const result = await preflightReleaseAssets(ASSET_BASE, [null, null], 'ed4');
    expect(result).toEqual({ ok: true, failures: [] });
    expect(requests).toEqual([]);
  });
});

test('rendered email: first Wave 1 edition looks right in a mail-width viewport', async ({
  page,
  baseURL,
}) => {
  // Build against the local server origin so the repo screenshots actually load.
  const { html } = buildReleaseEmail({
    firstName: 'Alex',
    features: WAVE1,
    baseUrl: baseURL!,
    unsubscribeUrl: `${baseURL}/api/home-care/unsubscribe?token=tok-123`,
    preferencesUrl: `${baseURL}/preferences?token=tok-123`,
  });
  writeFileSync(shot('release-email.html'), html);

  await page.setViewportSize({ width: 700, height: 900 });
  // Serve the email from the app origin — the site sends CORP headers, so the
  // screenshots only load for a same-origin document (as they do in Gmail's
  // proxy, which fetches server-side).
  await page.route('**/__release-email-preview', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  );
  await page.goto('/__release-email-preview', { waitUntil: 'networkidle' });
  // Every feature screenshot must have decoded (naturalWidth > 0).
  const imgs = await page.$$eval('img', (els: HTMLImageElement[]) =>
    els.map((el) => ({ src: el.src, ok: el.complete && el.naturalWidth > 0 })),
  );
  expect(imgs.length).toBeGreaterThanOrEqual(4); // logo + 3 feature screenshots
  for (const img of imgs) expect(img.ok, `image failed to load: ${img.src}`).toBe(true);
  await page.screenshot({ path: shot('01-release-email-rendered.png'), fullPage: true });
});

// ---------------------------------------------------------------------------
// Admin page + send API
// ---------------------------------------------------------------------------

interface MockRow extends ReleaseFeature {
  id: string;
  status: 'queued' | 'sent';
  sort_order: number;
  created_at: string;
  sent_at: string | null;
}

function wave1Rows(): MockRow[] {
  return WAVE1.map((f, i) => ({
    ...f,
    id: `00000000-0000-4000-8000-00000000000${i + 1}`,
    status: 'queued' as const,
    sort_order: i,
    created_at: `2026-07-0${i + 1}T12:00:00Z`,
    sent_at: null,
  }));
}

interface SendCall {
  mode?: string;
  confirm?: boolean;
}

async function mockReleasesApi(page: Page, rows: MockRow[], sendCalls: SendCall[], deletes: string[]) {
  await page.route('**/api/admin/releases/send', async (route) => {
    const body = (route.request().postDataJSON() ?? {}) as SendCall;
    sendCalls.push(body);
    if (body.mode === 'all') {
      for (const r of rows) {
        if (r.status === 'queued') {
          r.status = 'sent';
          r.sent_at = '2026-07-03T15:00:00Z';
        }
      }
      await route.fulfill({
        json: { ok: true, mode: 'all', features: 3, recipients: 43, sent: 41, suppressed: 2, failures: 0 },
      });
      return;
    }
    await route.fulfill({
      json: { ok: true, mode: 'test', status: 'sent', features: rows.filter((r) => r.status === 'queued').length, to: 'admin@lavacagc.com' },
    });
  });
  await page.route('**/api/admin/releases*', async (route) => {
    const method = route.request().method();
    if (method === 'DELETE') {
      const id = new URL(route.request().url()).searchParams.get('id')!;
      deletes.push(id);
      const idx = rows.findIndex((r) => r.id === id && r.status === 'queued');
      if (idx >= 0) rows.splice(idx, 1);
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.fulfill({
      json: {
        queued: rows.filter((r) => r.status === 'queued'),
        sent: rows.filter((r) => r.status === 'sent'),
      },
    });
  });
}

test.describe('admin /vaca-mgmt/releases', () => {
  const STUB_PORT = 9099;
  let stub: http.Server;

  test.beforeAll(async () => {
    // Minimal GoTrue stand-in (same as preferences-ui-fixes.spec.ts):
    // middleware's supabase.auth.getUser() hits GET /auth/v1/user.
    stub = http.createServer((req, res) => {
      if (req.url?.startsWith('/auth/v1/user')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: '00000000-0000-0000-0000-000000000001',
            aud: 'authenticated',
            role: 'authenticated',
            email: 'admin@lavacagc.com',
            created_at: '2026-01-01T00:00:00Z',
            app_metadata: {},
            user_metadata: {},
          }),
        );
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
    // Another spec's worker may hold the port briefly — retry until free.
    const deadline = Date.now() + 60_000;
    for (;;) {
      try {
        await new Promise<void>((resolve, reject) => {
          stub.once('error', reject);
          stub.listen(STUB_PORT, '127.0.0.1', () => {
            stub.removeAllListeners('error');
            resolve();
          });
        });
        break;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE' || Date.now() > deadline) throw err;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  });

  test.afterAll(async () => {
    await new Promise((resolve) => stub.close(resolve));
  });

  async function signInAsAdmin(context: BrowserContext, baseURL: string) {
    const session = {
      access_token: 'stub-access-token',
      refresh_token: 'stub-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', role: 'authenticated' },
    };
    await context.addCookies([
      {
        // supabase-js default storage key for http://127.0.0.1:9099
        name: 'sb-127-auth-token',
        value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'),
        url: baseURL,
      },
    ]);
  }

  test('queue renders the Wave 1 entries with screenshots', async ({ page, context, baseURL }) => {
    await signInAsAdmin(context, baseURL!);
    await mockReleasesApi(page, wave1Rows(), [], []);

    await page.goto('/vaca-mgmt/releases');
    await expect(page.getByText('Release Notes')).toBeVisible();
    await expect(page.getByText('3 queued')).toBeVisible();
    for (const f of WAVE1) {
      await expect(page.getByText(f.headline)).toBeVisible();
    }
    // The manual-only promise is stated right on the screen.
    await expect(page.getByText('Nothing is ever emailed automatically')).toBeVisible();
    // Entry thumbnails decoded.
    const thumbs = await page.$$eval('img[src^="/email/releases/"]', (els: HTMLImageElement[]) =>
      els.map((el) => el.complete && el.naturalWidth > 0),
    );
    expect(thumbs).toHaveLength(3);
    for (const ok of thumbs) expect(ok).toBe(true);
    await page.screenshot({ path: shot('02-admin-queue.png'), fullPage: true });
  });

  test('send test to me posts mode:test and reports the admin inbox', async ({ page, context, baseURL }) => {
    await signInAsAdmin(context, baseURL!);
    const sendCalls: SendCall[] = [];
    await mockReleasesApi(page, wave1Rows(), sendCalls, []);

    await page.goto('/vaca-mgmt/releases');
    await expect(page.getByText('3 queued')).toBeVisible();
    await page.getByRole('button', { name: 'Send test to me' }).click();
    await expect(page.getByText('Test sent to admin@lavacagc.com').first()).toBeVisible();
    expect(sendCalls).toEqual([{ mode: 'test' }]);
    // Viewport shot — the toast is fixed to the viewport and fullPage crops it.
    // Let its slide-in animation settle first.
    await page.waitForTimeout(600);
    await page.screenshot({ path: shot('03-test-send-toast.png') });
  });

  test('send-to-all needs an inline confirm; confirmed send batches the whole queue', async ({
    page,
    context,
    baseURL,
  }) => {
    await signInAsAdmin(context, baseURL!);
    const sendCalls: SendCall[] = [];
    await mockReleasesApi(page, wave1Rows(), sendCalls, []);

    await page.goto('/vaca-mgmt/releases');
    await expect(page.getByText('3 queued')).toBeVisible();

    await page.getByRole('button', { name: 'Send to all members' }).click();
    await expect(page.getByText('Email every active member?')).toBeVisible();
    expect(sendCalls).toEqual([]); // nothing fired until the explicit confirm
    await page.screenshot({ path: shot('04-send-all-confirm.png'), fullPage: true });

    await page.getByRole('button', { name: 'Yes, send it' }).click();
    await expect(page.getByText('Release sent to 41 members').first()).toBeVisible();
    expect(sendCalls).toEqual([{ mode: 'all', confirm: true }]);

    // The queue is now empty and the entries moved to the sent history.
    await expect(page.getByText('0 queued')).toBeVisible();
    await expect(page.getByText('Nothing queued. New entries are added as features ship.')).toBeVisible();
    await expect(page.getByText('Previously announced')).toBeVisible();
    await expect(page.getByText('Sent 7/3/2026').first()).toBeVisible();
    await page.screenshot({ path: shot('05-sent-history.png'), fullPage: true });
  });

  test('deleting a queue entry requires an inline confirm', async ({ page, context, baseURL }) => {
    await signInAsAdmin(context, baseURL!);
    const deletes: string[] = [];
    await mockReleasesApi(page, wave1Rows(), [], deletes);

    await page.goto('/vaca-mgmt/releases');
    await expect(page.getByText('3 queued')).toBeVisible();

    await page.getByLabel('Delete entry').first().click();
    await expect(page.getByText('Remove this entry?')).toBeVisible();
    expect(deletes).toEqual([]); // no DELETE until confirmed

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Remove this entry?')).not.toBeVisible();
    expect(deletes).toEqual([]);

    await page.getByLabel('Delete entry').first().click();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByText('2 queued')).toBeVisible();
    expect(deletes).toEqual(['00000000-0000-4000-8000-000000000001']);
  });

  test('send API rejects mode:all without confirm (400) and anonymous callers (401)', async ({
    page,
    context,
    baseURL,
    request,
  }) => {
    // Anonymous: middleware turns the missing session into a JSON 401.
    const anon = await request.post('/api/admin/releases/send', { data: { mode: 'all', confirm: true } });
    expect(anon.status()).toBe(401);

    // Authenticated admin, but no confirm flag: the route's guard refuses
    // before anything is queued or sent.
    await signInAsAdmin(context, baseURL!);
    const res = await page.request.post('/api/admin/releases/send', { data: { mode: 'all' } });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('confirm required');
  });
});
