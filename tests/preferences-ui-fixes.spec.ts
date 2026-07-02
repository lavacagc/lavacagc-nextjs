import { test, expect, type Page } from '@playwright/test';
import http from 'http';
import path from 'path';

/**
 * UI-level verification of the preference-center fixes:
 *  1. /preferences header logo uses relative /logo.png (served from public/ on
 *     any origin) instead of the hardcoded prod URL that CORP blocks elsewhere.
 *  2. .slider toggle track cannot be flex-compressed below its 50px design
 *     width, so the checked knob (translateX(24px), right edge at 47px) stays
 *     inside the track.
 *  3. Toggling a single stream POSTs only that stream's delta, not the whole
 *     state object.
 *  4. Admin page pins toggle writes to the looked-up contact (activeEmail),
 *     not whatever is currently typed in the lookup input.
 *
 * The preference JSON APIs are mocked at the browser network layer — the
 * behaviors under test are entirely client-side. The admin page is reached by
 * pointing NEXT_PUBLIC_SUPABASE_URL at a local auth stub and presenting a
 * fabricated session cookie so middleware's getUser() succeeds.
 */

const EVIDENCE_DIR = process.env.EVIDENCE_DIR || 'test-results/preferences-evidence';
const STREAM_KEYS = ['home_care', 'buy_remodel', 'announcements'] as const;

function shot(name: string) {
  return path.join(EVIDENCE_DIR, name);
}

type Streams = Record<(typeof STREAM_KEYS)[number], boolean>;

async function mockPublicPrefsApi(page: Page, posts: unknown[]) {
  const state: { streams: Streams } = {
    streams: { home_care: true, buy_remodel: true, announcements: true },
  };
  await page.route('**/api/preferences?*', async (route) => {
    await route.fulfill({
      json: { email: 'alex@vacamoo.com', streams: state.streams },
    });
  });
  await page.route('**/api/preferences', async (route) => {
    const body = route.request().postDataJSON();
    posts.push(body);
    state.streams = { ...state.streams, ...body.changes };
    await route.fulfill({ json: { ok: true, streams: state.streams } });
  });
  return state;
}

/** Track + knob geometry for every rendered switch, in track-local pixels. */
async function measureSwitches(page: Page, testidPrefix: string) {
  return page.evaluate((prefix) => {
    return [...document.querySelectorAll<HTMLElement>(`[data-testid^="${prefix}"]`)].map((btn) => {
      const track = btn.querySelector('.slider') as HTMLElement;
      const rect = track.getBoundingClientRect();
      const cs = getComputedStyle(track, '::before');
      const matrix = new DOMMatrixReadOnly(cs.transform === 'none' ? '' : cs.transform);
      const knobLeft = parseFloat(cs.left) + matrix.m41;
      const knobRight = knobLeft + parseFloat(cs.width);
      return {
        id: btn.dataset.testid,
        checked: btn.getAttribute('data-state') === 'checked',
        trackW: rect.width,
        knobRight,
      };
    });
  }, testidPrefix);
}

test.describe('public /preferences page', () => {
  test('logo renders from relative /logo.png and checked knobs stay inside 50px tracks', async ({
    page,
    baseURL,
  }) => {
    const posts: unknown[] = [];
    await mockPublicPrefsApi(page, posts);
    await page.goto('/preferences?token=test-token');
    await expect(page.getByTestId('pref-email')).toHaveText('alex@vacamoo.com');

    // 1. Logo: relative path, same origin, actually decoded (naturalWidth > 0).
    const logo = page.locator('img[alt="La Vaca"]');
    await expect(logo).toBeVisible();
    const logoInfo = await logo.evaluate((el: HTMLImageElement) => ({
      src: el.getAttribute('src'),
      currentSrc: el.currentSrc,
      naturalWidth: el.naturalWidth,
      complete: el.complete,
    }));
    expect(logoInfo.src).toBe('/logo.png');
    expect(logoInfo.currentSrc).toBe(new URL('/logo.png', baseURL).href);
    expect(logoInfo.naturalWidth).toBeGreaterThan(0);

    // 2. Toggle geometry: all three checked, track exactly 50px, knob inside.
    const geo = await measureSwitches(page, 'switch-');
    expect(geo).toHaveLength(3);
    for (const g of geo) {
      expect(g.checked).toBe(true);
      expect(g.trackW).toBe(50);
      expect(g.knobRight).toBeLessThanOrEqual(g.trackW);
    }

    await page.screenshot({ path: shot('01-preferences-desktop.png'), fullPage: true });
    await page
      .getByTestId('stream-home_care')
      .screenshot({ path: shot('02-toggle-row-closeup.png') });
  });

  test('narrow mobile viewport still cannot compress the track', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    const posts: unknown[] = [];
    await mockPublicPrefsApi(page, posts);
    await page.goto('/preferences?token=test-token');
    await expect(page.getByTestId('pref-email')).toHaveText('alex@vacamoo.com');

    const geo = await measureSwitches(page, 'switch-');
    for (const g of geo) {
      expect(g.trackW).toBe(50);
      expect(g.knobRight).toBeLessThanOrEqual(g.trackW);
    }
    await page.screenshot({ path: shot('03-preferences-mobile-360.png'), fullPage: true });
  });

  test('counterfactual: reverting the CSS fix reproduces the knob overflow', async ({ page }) => {
    const posts: unknown[] = [];
    await mockPublicPrefsApi(page, posts);
    await page.goto('/preferences?token=test-token');
    await expect(page.getByTestId('pref-email')).toHaveText('alex@vacamoo.com');

    // Undo exactly the two properties the fix added.
    await page.addStyleTag({
      content: '.slider{min-width:0!important}.toggle-switch{flex-shrink:1!important}',
    });
    const geo = await measureSwitches(page, 'switch-');
    const compressed = geo.filter((g) => g.trackW < 50);
    expect(compressed.length).toBeGreaterThan(0);
    for (const g of compressed) {
      // Knob right edge (47px for a checked switch) overflows the shrunk track.
      expect(g.knobRight).toBeGreaterThan(g.trackW);
    }
    await page
      .getByTestId('stream-home_care')
      .screenshot({ path: shot('04-counterfactual-overflow.png') });
  });

  test('single toggle POSTs a per-stream delta; unsubscribe-all POSTs all three', async ({
    page,
  }) => {
    const posts: { token?: string; changes?: Partial<Streams> }[] = [];
    await mockPublicPrefsApi(page, posts);
    await page.goto('/preferences?token=test-token');
    await expect(page.getByTestId('pref-email')).toHaveText('alex@vacamoo.com');

    await page.getByTestId('switch-home_care').click();
    await expect(page.getByTestId('saved-msg')).toHaveText('Saved.');
    expect(posts).toHaveLength(1);
    expect(posts[0].token).toBe('test-token');
    expect(posts[0].changes).toEqual({ home_care: false });

    await page.getByTestId('unsubscribe-all').click();
    await expect(page.getByTestId('saved-msg')).toContainText('unsubscribed from all');
    expect(posts).toHaveLength(2);
    expect(posts[1].changes).toEqual({
      home_care: false,
      buy_remodel: false,
      announcements: false,
    });
    for (const key of STREAM_KEYS) {
      await expect(page.getByTestId(`switch-${key}`)).toHaveAttribute('data-state', 'unchecked');
    }
    // Settle the 0.3s toggle CSS transition before capturing evidence.
    await page.waitForTimeout(600);
    await page.screenshot({ path: shot('05-unsubscribed-all.png'), fullPage: true });
  });
});

test.describe('admin /vaca-mgmt/preferences page', () => {
  const STUB_PORT = 9099;
  let stub: http.Server;

  test.beforeAll(async () => {
    // Minimal GoTrue stand-in: middleware's supabase.auth.getUser() hits
    // GET /auth/v1/user with the access token from our fabricated cookie.
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
    await new Promise<void>((resolve, reject) => {
      stub.once('error', reject);
      stub.listen(STUB_PORT, '127.0.0.1', resolve);
    });
  });

  test.afterAll(async () => {
    await new Promise((resolve) => stub.close(resolve));
  });

  test('toggles stay pinned to the looked-up contact even after retyping the input', async ({
    page,
    context,
    baseURL,
  }) => {
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
        url: baseURL!,
      },
    ]);

    const OWNER = 'owner@lavacagc.com';
    const adminPosts: { email?: string; changes?: Partial<Streams> }[] = [];
    const lookupEmails: string[] = [];
    const state: { streams: Streams } = {
      streams: { home_care: true, buy_remodel: true, announcements: true },
    };

    await page.route('**/api/admin/preferences?*', async (route) => {
      const url = new URL(route.request().url());
      const email = url.searchParams.get('email');
      if (email) {
        lookupEmails.push(email);
        await route.fulfill({
          json: {
            exists: true,
            preferences: state.streams,
            events: [
              {
                id: 'ev-1',
                stream: 'home_care',
                old_value: null,
                new_value: true,
                actor: 'user',
                actor_detail: null,
                created_at: '2026-07-01T12:00:00Z',
              },
            ],
          },
        });
        return;
      }
      await route.fulfill({ json: { rows: [], truncated: false } });
    });
    await page.route('**/api/admin/preferences', async (route) => {
      const body = route.request().postDataJSON();
      adminPosts.push(body);
      state.streams = { ...state.streams, ...body.changes };
      await route.fulfill({ json: { preferences: state.streams } });
    });

    await page.goto('/vaca-mgmt/preferences');
    await expect(page.getByRole('heading', { name: 'Subscription preferences' })).toBeVisible();

    await page.getByTestId('admin-pref-email').fill(OWNER);
    await page.getByRole('button', { name: 'Look up' }).click();
    await expect(page.getByText(OWNER)).toBeVisible();

    // Retype a different address WITHOUT submitting the lookup form…
    await page.getByTestId('admin-pref-email').fill('someone.else@example.com');
    // …then flip a switch: the write must target the looked-up contact.
    await page.getByTestId('admin-switch-home_care').click();
    await expect(page.getByTestId('admin-switch-home_care')).toHaveAttribute(
      'data-state',
      'unchecked',
    );

    expect(adminPosts).toHaveLength(1);
    expect(adminPosts[0].email).toBe(OWNER);
    expect(adminPosts[0].changes).toEqual({ home_care: false });
    // The post-save audit refresh also re-reads the pinned contact.
    expect(lookupEmails).toEqual([OWNER, OWNER]);
    // Card header still shows the contact being managed, not the input text.
    await expect(page.getByText(OWNER)).toBeVisible();

    // Let the 0.3s knob/track CSS transition finish so the screenshot shows
    // the settled off state, then confirm nothing flipped it back.
    await page.waitForTimeout(600);
    await expect(page.getByTestId('admin-switch-home_care')).toHaveAttribute(
      'data-state',
      'unchecked',
    );
    await page.screenshot({ path: shot('06-admin-pinned-contact.png'), fullPage: true });
  });
});
