import { test, expect } from '@playwright/test';

/**
 * AC1-AC4: /contact must stop throwing React #418 on production.
 *
 * The cause was never in our React tree. Cloudflare Scrape Shield's Email
 * Address Obfuscation rewrites addresses in our HTML at the edge, and the TCPA
 * consent label in ContactForm renders `info@lavacagc.com` as BARE TEXT, which
 * Cloudflare replaces with an `<a class="__cf_email__">[email protected]</a>`
 * element. React then hydrates that DOM against an RSC payload still carrying
 * the real address, finds markup where it sent text, and throws minified error
 * #418 - discarding the server render and rebuilding the page on the client.
 *
 * The fix is Cloudflare's documented opt-out, `<!--email_off-->`, bracketing
 * the whole <body> in src/app/layout.tsx.
 *
 * WHAT THESE SPECS CAN AND CANNOT PROVE. Cloudflare is not in front of a local
 * build or a Vercel preview, so no local spec can exercise the real rewriter.
 * These prove the two halves we own: our HTML carries the opt-out around every
 * address (AC1/AC2), and a rewriter that follows Cloudflare's published
 * contract therefore has nothing to rewrite (AC3) - with AC4 showing the same
 * rewriter DOES reproduce #418 when the opt-out is not honoured, so AC3 is not
 * passing vacuously. That Cloudflare's own implementation honours a comment
 * nested inside a <span> is the one link in the chain only production can
 * settle, and docs/prod-defects-2026-08-06-acceptance-criteria.md records the
 * post-deploy check that settles it.
 */

const ADDRESS = 'info@lavacagc.com';
const OFF = '<!--email_off-->';
const ON = '<!--email_on-->';

/** How Cloudflare rewrites a bare-text address. */
const CF_REPLACEMENT =
  '<a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="aec7c0c8c1eec2cfd8cfcdcfc9cd80cdc1c3">[email&#160;protected]</a>';

const SCRIPT_BLOCK = /(<script[\s\S]*?<\/script>)/gi;

/**
 * Blanks out `<script>` bodies while keeping every other character at its
 * original index, so a position found in the result is still a position in
 * `html`.
 *
 * Needed because the address legitimately appears inside scripts that
 * Cloudflare does not touch and React does not hydrate as text: the JSON-LD
 * business schema, and the RSC flight payload Next.js appends after the app
 * markup (which lands AFTER the closing opt-out marker). Asserting on those
 * would be asserting on the wrong thing.
 */
function maskScripts(html: string): string {
  return html.replace(SCRIPT_BLOCK, (block) => ' '.repeat(block.length));
}

/**
 * Stands in for Cloudflare's edge rewriter.
 *
 * `honourOptOut` is the whole point of the pair: true is the documented
 * behaviour, false is the behaviour we were getting before the opt-out existed
 * in our HTML at all. Both modes leave `<script>` bodies alone, because the
 * real one does - that is exactly why the obfuscation protected nothing here
 * while still costing us a hydration pass.
 */
function rewriteLikeCloudflare(html: string, honourOptOut: boolean): string {
  let insideOptOut = false;

  return html
    .split(SCRIPT_BLOCK)
    .map((part) => {
      if (/^<script/i.test(part)) return part;
      if (!honourOptOut) return part.split(ADDRESS).join(CF_REPLACEMENT);

      // Walk the markers, carrying the open/closed state ACROSS parts: the
      // opt-out window opens before the JSON-LD script and closes long after.
      let out = '';
      let rest = part;
      for (;;) {
        if (insideOptOut) {
          const onAt = rest.indexOf(ON);
          if (onAt === -1) {
            out += rest;
            break;
          }
          out += rest.slice(0, onAt + ON.length);
          rest = rest.slice(onAt + ON.length);
          insideOptOut = false;
        } else {
          const offAt = rest.indexOf(OFF);
          if (offAt === -1) {
            out += rest.split(ADDRESS).join(CF_REPLACEMENT);
            break;
          }
          out += rest.slice(0, offAt).split(ADDRESS).join(CF_REPLACEMENT);
          out += OFF;
          rest = rest.slice(offAt + OFF.length);
          insideOptOut = true;
        }
      }
      return out;
    })
    .join('');
}

test.describe('/contact hydration (React #418)', () => {
  test('AC1: every rendered address on /contact sits inside the Cloudflare opt-out window', async ({
    request,
  }) => {
    const html = await (await request.get('/contact')).text();
    const markup = maskScripts(html);

    const offAt = markup.indexOf(OFF);
    const onAt = markup.indexOf(ON);
    expect(offAt, 'layout must open the opt-out').toBeGreaterThan(-1);
    expect(onAt, 'layout must close the opt-out').toBeGreaterThan(offAt);

    // The address appears several times in this page's markup: the consent
    // label's bare text (the one that broke), the contact-details mailto, and
    // the footer. Every one of them has to be inside the window, not just the
    // first - Cloudflare rewrites all of them, not the first.
    const occurrences: number[] = [];
    for (let i = markup.indexOf(ADDRESS); i !== -1; i = markup.indexOf(ADDRESS, i + 1)) {
      occurrences.push(i);
    }
    expect(occurrences.length, 'the address should render on /contact').toBeGreaterThan(0);
    for (const at of occurrences) {
      expect(at, `address at index ${at} is outside the opt-out window`).toBeGreaterThan(offAt);
      expect(at, `address at index ${at} is outside the opt-out window`).toBeLessThan(onAt);
    }
  });

  test('AC2: the opt-out is layout-level, so it covers pages nobody remembered to fix', async ({
    request,
  }) => {
    // Same assertion on a page that renders the address only through the shared
    // Footer. If this ever has to be re-added per page, the next page to render
    // an address will ship the bug again.
    for (const path of ['/', '/about']) {
      const markup = maskScripts(await (await request.get(path)).text());
      const offAt = markup.indexOf(OFF);
      const onAt = markup.indexOf(ON);
      expect(offAt, `${path} must open the opt-out`).toBeGreaterThan(-1);
      expect(onAt, `${path} must close the opt-out`).toBeGreaterThan(offAt);
      for (let i = markup.indexOf(ADDRESS); i !== -1; i = markup.indexOf(ADDRESS, i + 1)) {
        expect(i, `${path}: address at ${i} escapes the opt-out`).toBeGreaterThan(offAt);
        expect(i, `${path}: address at ${i} escapes the opt-out`).toBeLessThan(onAt);
      }
    }
  });

  test('AC3: a Cloudflare-faithful rewriter finds nothing to rewrite, and /contact hydrates clean', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    let rewritten = false;
    await page.route('**/contact', async (route) => {
      const response = await route.fetch();
      const original = await response.text();
      const body = rewriteLikeCloudflare(original, true);
      rewritten = body !== original;
      await route.fulfill({ response, body });
    });

    await page.goto('/contact', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: /Talk About Your Project/i }).waitFor();
    // Give hydration room to run and report.
    await page.waitForTimeout(2000);

    expect(rewritten, 'the opt-out should leave the rewriter with nothing to do').toBe(false);
    expect(pageErrors.join('\n')).not.toContain('418');
    expect(pageErrors, 'no uncaught errors during hydration').toEqual([]);
  });

  test('AC4: the same rewriter ignoring the opt-out still reproduces #418 - AC3 is not vacuous', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.route('**/contact', async (route) => {
      const response = await route.fetch();
      const body = rewriteLikeCloudflare(await response.text(), false);
      await route.fulfill({ response, body });
    });

    await page.goto('/contact', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: /Talk About Your Project/i }).waitFor();
    await page.waitForTimeout(2000);

    // A production build reports it as minified #418; a dev build spells the
    // mismatch out instead. Accept either so this spec is not tied to how the
    // app under test happened to be built.
    const joined = pageErrors.join('\n');
    expect(
      /#418|did not match|didn't match|Hydration failed/i.test(joined),
      `expected a hydration failure, got: ${joined || '(no page errors)'}`
    ).toBe(true);
  });
});
