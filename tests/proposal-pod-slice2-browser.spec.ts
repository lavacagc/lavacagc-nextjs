import { test, expect, type BrowserContext, type Page } from '@playwright/test';

/**
 * Proposal Pod - Slice 2, in a real browser.
 *
 * The owner's AC contract calls for browser-level admin verification, and the
 * behaviours the static half can only assert as source text - Send refused
 * while the client page is missing, the paste box no longer re-importing on a
 * keystroke, unbundle giving descriptions and the selection back - are state
 * machines. They are pinned here by driving them.
 *
 * Auth follows the house pattern for /vaca-mgmt specs: a stub session cookie
 * whose name derives from NEXT_PUBLIC_SUPABASE_URL's host, against the GoTrue
 * stub playwright.config.ts runs for the whole suite.
 */

const ROSTER = {
  proposals: [
    {
      id: '11111111-1111-1111-1111-111111111111',
      client_name: 'Rachel Morales',
      client_email: 'rachel@example.com',
      title: 'Your bathroom remodel',
      status: 'draft',
      token: 'a'.repeat(43),
      line_count: 4,
      submission_count: 0,
      latest_total_cents: null,
      updated_at: '2026-08-04T12:00:00.000Z',
    },
  ],
};

const CSV = [
  'title,description,price',
  'Demolition & prep,Strip to studs,4800.00',
  'Tile - heated floor upgrade,Ditra Heat under porcelain,2900.50',
  'Vanity - double sink,72in walnut with quartz top,3400.00',
].join('\n');

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

async function openProposals(page: Page, context: BrowserContext, baseURL: string) {
  await signInAsAdmin(context, baseURL);
  await page.route('**/api/admin/proposals', async (route) => {
    if (route.request().method() === 'GET') { await route.fulfill({ json: ROSTER }); return; }
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto('/vaca-mgmt/proposals');
  await expect(page.getByTestId('proposals-admin')).toBeVisible();
}

/**
 * A toast's visible title. Exact, because the toaster also renders an
 * aria-live announcer carrying the same words - matching loosely resolves to
 * both, and which one exists first is a race.
 */
const toastTitle = (page: Page, text: string) => page.getByText(text, { exact: true });

/** Paste text into the CSV box the way a human does, so onPaste is what fires. */
async function pasteCsv(page: Page, text: string) {
  const box = page.getByTestId('csv-paste');
  await box.click();
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
}

test.describe('proposals admin, in the browser', () => {
  test.use({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });

  test('B1: Send is refused while the client page does not exist; Copy link still works', async ({ page, context, baseURL }) => {
    await openProposals(page, context, baseURL!);

    // The roster rendered from the stubbed read.
    await expect(page.getByText('Rachel Morales')).toBeVisible();

    // Send is off, and says why - a mis-click cannot mail a dead link.
    const send = page.getByTestId('send-btn');
    await expect(send).toBeDisabled();
    await expect(send).toHaveAttribute('title', /not live yet/i);

    // Copy link is deliberately still available.
    const copy = page.getByRole('button', { name: /copy link/i });
    await expect(copy).toBeEnabled();
    await copy.click();
    await expect(toastTitle(page, 'Link copied')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText()))
      .toContain(`/proposal/${'a'.repeat(43)}`);
  });

  test('B2: a clipboard failure tells the admin instead of pretending it copied', async ({ page, context, baseURL }) => {
    await openProposals(page, context, baseURL!);
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error('denied')) },
      });
    });
    await page.getByRole('button', { name: /copy link/i }).click();
    await expect(toastTitle(page, 'Could not copy the link')).toBeVisible();
    await expect(page.getByText(/Copy it by hand: http.*\/proposal\/aaa/).first()).toBeVisible();
  });

  test('B3: pasting imports; typing afterwards does not destroy the composed bundle', async ({ page, context, baseURL }) => {
    await openProposals(page, context, baseURL!);
    await pasteCsv(page, CSV);
    await expect(page.getByTestId('line-row')).toHaveCount(3);

    // Bundle the two optional lines via the touch path.
    await page.getByLabel('Select Tile - heated floor upgrade').check();
    await page.getByLabel('Select Vanity - double sink').check();
    await expect(page.getByTestId('combine-btn')).toContainText('Combine 2 into a bundle');
    await page.getByTestId('combine-btn').click();
    await expect(page.getByTestId('bundle-row')).toHaveCount(1);
    await expect(page.getByTestId('bundle-row')).toContainText('$6,300.50');

    // Now type in the paste box - the natural reaction to a parse complaint.
    // This used to re-key every row and silently throw the bundle away.
    await page.getByTestId('csv-paste').click();
    await page.keyboard.type('\n# note to self');
    await expect(page.getByTestId('bundle-row')).toHaveCount(1);
    await expect(page.getByTestId('line-row')).toHaveCount(1);
  });

  test('B4: unbundle restores descriptions and frees the tick it was holding', async ({ page, context, baseURL }) => {
    await openProposals(page, context, baseURL!);
    await pasteCsv(page, CSV);
    await expect(page.getByTestId('line-row')).toHaveCount(3);

    await page.getByLabel('Select Tile - heated floor upgrade').check();
    await page.getByLabel('Select Vanity - double sink').check();
    await page.getByTestId('combine-btn').click();
    const bundle = page.getByTestId('bundle-row');
    await expect(bundle).toHaveCount(1);

    // Tick the bundle, then unbundle it: the stale key used to survive and make
    // Combine advertise a count it could not act on.
    await bundle.getByRole('checkbox').check();
    await bundle.getByRole('button', { name: /unbundle/i }).click();
    await expect(page.getByTestId('bundle-row')).toHaveCount(0);
    await expect(page.getByTestId('line-row')).toHaveCount(3);

    // The CSV's descriptions came back with the members. Scoped to the
    // preview: the paste box still holds the same text verbatim.
    const preview = page.getByTestId('preview');
    await expect(preview.getByText('Ditra Heat under porcelain')).toBeVisible();
    await expect(preview.getByText('72in walnut with quartz top')).toBeVisible();

    // One real row ticked is one, not two, so Combine stays disabled.
    await page.getByLabel('Select Demolition & prep').check();
    const combine = page.getByTestId('combine-btn');
    await expect(combine).toBeDisabled();
    await expect(combine).toContainText('(select 2+)');
  });

  test('B5: the Parse button re-imports on demand, and clearing the box clears the preview', async ({ page, context, baseURL }) => {
    await openProposals(page, context, baseURL!);
    await pasteCsv(page, CSV);
    await expect(page.getByTestId('line-row')).toHaveCount(3);

    // Bundle, then Parse: an explicit re-import is allowed to reset the preview.
    await page.getByLabel('Select Tile - heated floor upgrade').check();
    await page.getByLabel('Select Vanity - double sink').check();
    await page.getByTestId('combine-btn').click();
    await expect(page.getByTestId('bundle-row')).toHaveCount(1);
    await page.getByTestId('parse-btn').click();
    await expect(page.getByTestId('bundle-row')).toHaveCount(0);
    await expect(page.getByTestId('line-row')).toHaveCount(3);

    // Emptying the box empties the preview - it used to leave the old one up.
    await page.getByTestId('csv-paste').fill('');
    await expect(page.getByTestId('preview')).toHaveCount(0);
    await expect(page.getByTestId('parse-btn')).toBeDisabled();
  });
});
