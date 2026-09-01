import { test, expect, type Response, type BrowserContext } from '@playwright/test';
import * as fs from 'fs';

/**
 * Coverage crawler (chaos-monkey phase 4), adapted to this app.
 *
 * Two roles only, because that is all this app has: an ANONYMOUS visitor, and
 * the ADMIN behind the Supabase session cookie. There is no customer login -
 * client-facing surfaces authenticate with an unguessable token in the URL
 * instead, which the adversarial spec covers rather than this one.
 *
 * The admin role fabricates the same `sb-127-auth-token` cookie the rest of
 * the admin suite uses, so this only means anything against the stub build
 * (`npm run test:build`); against a real build the cookie name derives from
 * the real Supabase URL and the crawl would silently run as anonymous. The
 * spec asserts it actually got in, rather than trusting that.
 *
 * The most useful output is not the failures - it is `unreached`, the routes
 * that exist in source but no link points at.
 *
 * Run: npx playwright test tests/chaos/crawler.spec.ts --project=chromium
 */

const MAX_PAGES = Number(process.env.MAX_PAGES ?? 80);
const ALL_ROUTES: string[] = JSON.parse(fs.readFileSync('chaos/routes.json', 'utf8'));

/** Anonymous visitors must never get a 200 here. */
const ADMIN_ONLY = /^\/vaca-mgmt/;

/**
 * STUB-BACKED REALITY. This runs against the build `npm run test:build` makes,
 * whose Supabase URL points at a local stub with an empty database. Two whole
 * classes of "failure" are therefore expected here and mean nothing:
 *
 *  - Route families rendered FROM the database (services, locations, blog
 *    posts, projects) 404, because the stub has no rows. These were verified
 *    200 in production during the chaos run; `npm run test:links` is the
 *    live-backend sweep that actually covers them.
 *  - Console CSP violations naming the stub host, because next.config's
 *    connect-src lists the real Supabase origin, not 127.0.0.1:9099.
 *
 * Filtering them is not lenience - a crawler that reports 158 known-good
 * artifacts is a crawler nobody reads, and then it catches nothing at all.
 */
const DB_DRIVEN = /^\/(services|locations|blog|projects|resources|cms)\//;
const STUB_HOST = /127\.0\.0\.1|localhost:9099/;

/** Hrefs that are not internal routes at all. */
const SKIP_HREF = /^(mailto:|tel:|javascript:|#|https?:\/\/(?!localhost|127\.0\.0\.1))/i;

/*
 * NOTE: this crawler deliberately does NOT click controls. The upstream
 * chaos-monkey crawler clicks buttons to find dead ones, which is valuable -
 * but the only build available here talks to a production database, so a
 * mis-clicked control writes real data. Dead-control detection belongs in a
 * seeded local stack; it is listed as untested in chaos/findings.json rather
 * than silently skipped.
 */

interface Issue { route: string; kind: string; detail: string }

async function signInAsAdmin(context: BrowserContext, baseURL: string) {
  const session = {
    access_token: 'stub-access-token',
    refresh_token: 'stub-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', role: 'authenticated' },
  };
  await context.addCookies([{
    name: 'sb-127-auth-token',
    value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'),
    url: baseURL,
  }]);
}

for (const role of ['anon', 'admin'] as const) {
  test(`crawl as ${role}`, async ({ page, context, request, baseURL }) => {
    test.setTimeout(12 * 60 * 1000);
    const base = baseURL!;
    if (role === 'admin') await signInAsAdmin(context, base);

    const issues: Issue[] = [];
    const visited = new Set<string>();
    const checkedLinks = new Set<string>();
    const queue: string[] = ['/'];

    page.on('console', (m) => {
      const txt = m.text();
      if (m.type() === 'error'
        && !/favicon|ResizeObserver|Failed to load resource/.test(txt)
        && !(STUB_HOST.test(txt) && /Content Security Policy|Fetch API cannot load/.test(txt))) {
        issues.push({ route: page.url(), kind: 'console-error', detail: txt.slice(0, 240) });
      }
    });
    page.on('pageerror', (e) => {
      issues.push({ route: page.url(), kind: 'uncaught', detail: e.message.slice(0, 240) });
    });

    // The admin crawl is meaningless if the cookie did not take - prove it did
    // before drawing any conclusion from what follows.
    if (role === 'admin') {
      const probe = await page.goto(`${base}/vaca-mgmt`);
      expect(probe?.status(), 'the stub admin cookie must actually authenticate - '
        + 'run against the stub build (npm run test:build), not a real one').toBe(200);
    }

    while (queue.length && visited.size < MAX_PAGES) {
      const route = queue.shift()!;
      if (visited.has(route)) continue;
      visited.add(route);

      let res: Response | null = null;
      try {
        res = await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      } catch (e) {
        issues.push({ route, kind: 'navigation-failed', detail: (e as Error).message.slice(0, 200) });
        continue;
      }
      const status = res?.status() ?? 0;

      // An anonymous visitor reaching the admin is the single worst outcome here.
      if (role === 'anon' && ADMIN_ONLY.test(route)) {
        if (status === 200) {
          issues.push({ route, kind: 'unauthorized-access', detail: 'anonymous got 200 on an admin route' });
        }
        continue;
      }
      if (status >= 400) {
        const kind = DB_DRIVEN.test(route)
          ? 'db-driven-empty'                       // stub has no rows; see npm run test:links
          : status === 404 ? 'not-found' : 'error-status';
        issues.push({ route, kind, detail: String(status) });
        continue;
      }

      const body = await page.content();
      for (const marker of ['Application error', 'Unhandled Runtime Error', 'ECONNREFUSED', 'PGRST', 'SUPABASE_SECRET_KEY']) {
        if (body.includes(marker)) issues.push({ route, kind: 'error-leak', detail: marker });
      }

      const text = (await page.locator('main, body').first().innerText().catch(() => '')) ?? '';
      if (text.trim().length < 20) issues.push({ route, kind: 'empty-page', detail: '200 but nothing rendered' });

      const brokenImgs = await page.evaluate(() =>
        [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src).slice(0, 5));
      for (const src of brokenImgs) issues.push({ route, kind: 'broken-image', detail: src });

      const hrefs = await page.locator('a[href]').evaluateAll((els) =>
        els.map((e) => (e as HTMLAnchorElement).getAttribute('href') ?? ''));
      for (const href of hrefs) {
        if (!href || SKIP_HREF.test(href)) continue;
        let p: string;
        try { p = new URL(href, base).pathname; } catch { continue; }
        if (!checkedLinks.has(p)) {
          checkedLinks.add(p);
          const head = await request.get(`${base}${p}`, { failOnStatusCode: false, maxRedirects: 3 }).catch(() => null);
          if (head && head.status() === 404) {
            issues.push({ route, kind: DB_DRIVEN.test(p) ? 'db-driven-empty' : 'broken-link', detail: p });
          }
        }
        if (!visited.has(p) && !queue.includes(p)) queue.push(p);
      }
    }

    const unreached = ALL_ROUTES.filter((r) => !visited.has(r));
    fs.mkdirSync('chaos', { recursive: true });
    fs.writeFileSync(`chaos/crawl-${role}.json`,
      JSON.stringify({ role, visited: [...visited].sort(), unreached, issues }, null, 2));

    console.log(`\n${role}: visited ${visited.size}, unreached ${unreached.length}, issues ${issues.length}`);
    for (const i of issues.slice(0, 40)) console.log(`  [${i.kind}] ${i.route} :: ${i.detail}`);

    const blocking = issues.filter((i) =>
      ['not-found', 'error-status', 'uncaught', 'unauthorized-access', 'broken-link', 'error-leak'].includes(i.kind));
    expect(blocking, `see chaos/crawl-${role}.json`).toHaveLength(0);
  });
}
