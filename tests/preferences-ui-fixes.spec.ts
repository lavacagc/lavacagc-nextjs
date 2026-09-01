import { test, expect, type Page } from '@playwright/test';
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
const STREAM_KEYS = ['newsletter', 'home_care', 'buy_remodel', 'announcements'] as const;

function shot(name: string) {
  return path.join(EVIDENCE_DIR, name);
}

type Streams = Record<(typeof STREAM_KEYS)[number], boolean>;

async function mockPublicPrefsApi(page: Page, posts: unknown[]) {
  const state: { streams: Streams } = {
    streams: { newsletter: true, home_care: true, buy_remodel: true, announcements: true },
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

    // 2. Toggle geometry: all four checked, track exactly 50px, knob inside.
    const geo = await measureSwitches(page, 'switch-');
    expect(geo).toHaveLength(4);
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

  test('the Home Care toggle warns that turning it off deletes saved home details', async ({
    page,
  }) => {
    // Slice 8 makes this toggle destructive: turning it off is an intentional
    // leave, which permanently purges the homeowner's saved home details. The
    // row must say so - a customer throttling email volume would otherwise read
    // it as a plain subscription switch and lose their shut-off map.
    const posts: unknown[] = [];
    await mockPublicPrefsApi(page, posts);
    await page.goto('/preferences?token=test-token');
    await expect(page.getByTestId('pref-email')).toHaveText('alex@vacamoo.com');

    const notice = page.getByTestId('home-care-purge-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(/permanently deletes/i);
    await expect(notice).toContainText(/ends your Home Care membership/i);

    // Scoped to Home Care: it is the only stream whose opt-out destroys data.
    await expect(page.getByTestId('home-care-purge-notice')).toHaveCount(1);
    await expect(page.getByTestId('stream-home_care')).toContainText(/permanently deletes/i);
    for (const key of ['newsletter', 'buy_remodel', 'announcements'] as const) {
      await expect(page.getByTestId(`stream-${key}`)).not.toContainText(/permanently deletes/i);
    }

    // The warning reaches a screen reader AT the control it describes - this is
    // the one switch whose flip destroys data, so the aria-label alone ("Toggle
    // La Vaca Home Care") would announce none of the consequence.
    await expect(notice).toHaveAttribute('id', 'home-care-purge-notice');
    await expect(page.getByTestId('switch-home_care')).toHaveAttribute(
      'aria-describedby',
      'home-care-purge-notice',
    );

    await page
      .getByTestId('stream-home_care')
      .screenshot({ path: shot('05-home-care-purge-notice.png') });

    // Already left: the details are gone, so warning about deleting them is
    // both alarming and untrue. The notice describes an available action only.
    await page.getByTestId('switch-home_care').click();
    await expect(page.getByTestId('home-care-purge-notice')).toHaveCount(0);
    await expect(page.getByTestId('switch-home_care')).not.toHaveAttribute(
      'aria-describedby',
      /.*/,
    );
  });

  test('the unsubscribe confirm card warns about the purge before the destructive click', async ({
    page,
  }) => {
    // This card - not the stream row - is what an email footer link lands on,
    // and "Yes, unsubscribe" is the click that destroys the data. The Home Care
    // footer link redirects here with confirm=home_care rather than acting on
    // the GET itself, so this is the last screen before an irreversible delete.
    const posts: unknown[] = [];
    await mockPublicPrefsApi(page, posts);

    for (const confirm of ['home_care', 'all'] as const) {
      await page.goto(`/preferences?token=test-token&confirm=${confirm}`);
      const card = page.getByTestId('confirm-unsubscribe');
      await expect(card).toBeVisible();
      // Above the CTA, in the card the user is actually reading.
      const warning = page.getByTestId('confirm-home-care-purge-notice');
      await expect(warning).toBeVisible();
      await expect(warning).toContainText(/permanently deletes/i);
      await expect(warning).toContainText(/ends your Home Care membership/i);
      await expect(card).toContainText(/permanently deletes/i);
    }

    await page.screenshot({ path: shot('06-confirm-card-purge-notice.png'), fullPage: true });

    // A confirm that cannot reach home_care must not borrow the scare copy.
    await page.goto('/preferences?token=test-token&confirm=newsletter');
    await expect(page.getByTestId('confirm-unsubscribe')).toBeVisible();
    await expect(page.getByTestId('confirm-home-care-purge-notice')).toHaveCount(0);

    // Already left: nothing left to delete, so the warning would be untrue.
    await page.goto('/preferences?token=test-token');
    await page.getByTestId('switch-home_care').click();
    await expect(page.getByTestId('home-care-purge-notice')).toHaveCount(0);
    await page.goto('/preferences?token=test-token&confirm=all');
    await expect(page.getByTestId('confirm-unsubscribe')).toBeVisible();
    await expect(page.getByTestId('confirm-home-care-purge-notice')).toHaveCount(0);
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

  test('single toggle POSTs a per-stream delta; unsubscribe-all POSTs all four', async ({
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

    // Unsubscribe-all routes through the same confirm card as a footer link, so
    // the deletion warning can never be bypassed; the POST fires only on the
    // confirmed "Yes, unsubscribe" click.
    await page.getByTestId('unsubscribe-all').click();
    await expect(page.getByTestId('confirm-unsubscribe')).toBeVisible();
    expect(posts).toHaveLength(1);
    await page.getByTestId('confirm-unsubscribe-yes').click();
    await expect(page.getByTestId('saved-msg')).toContainText('unsubscribed from all');
    expect(posts).toHaveLength(2);
    expect(posts[1].changes).toEqual({
      newsletter: false,
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
      streams: { newsletter: true, home_care: true, buy_remodel: true, announcements: true },
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

    // The data-state flip above is optimistic, so the POST lands
    // asynchronously — wait for it.
    await expect.poll(() => adminPosts.length).toBe(1);
    expect(adminPosts[0].email).toBe(OWNER);
    expect(adminPosts[0].changes).toEqual({ home_care: false });
    // Exactly ONE lookup: the toggle applies the POST response directly, and
    // the 2026-08 admin simplification removed the redundant post-save
    // re-lookup (it re-downloaded the 100-row audit trail per switch flip).
    expect(lookupEmails).toEqual([OWNER]);
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
