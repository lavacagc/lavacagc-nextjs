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

const RACHEL = {
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
};

/** The proposal the 200-row cap hides: reachable only through the search. */
const OFF_THE_PAGE = {
  ...RACHEL,
  id: '22222222-2222-2222-2222-222222222222',
  client_name: 'Zeta Vanterpool',
  client_email: 'zeta@example.com',
  title: 'Kitchen gut renovation',
  status: 'sent',
  token: 'b'.repeat(43),
  updated_at: '2025-01-01T00:00:00.000Z',
};

/**
 * One page of one, out of an estate of 312 - the truncated shape, carrying the
 * server's own `truncated` flag because that flag alone gates the notice.
 */
const ROSTER = { proposals: [RACHEL], counts_available: true, total: 312, truncated: true };

const CSV = [
  'title,description,price',
  'Demolition & prep,Strip to studs,4800.00',
  'Tile - heated floor upgrade,Ditra Heat under porcelain,2900.50',
  'Vanity - double sink,72in walnut with quartz top,3400.00',
].join('\n');

/** The same estimate plus a second optional finish, so a bundle can be re-bundled. */
const CSV_NESTED = [CSV, 'Faucet - matte black,Widespread lav faucet,900.00'].join('\n');

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
  // The glob keeps the query string in scope - the roster read carries ?search.
  await page.route('**/api/admin/proposals*', async (route) => {
    if (route.request().method() !== 'GET') { await route.fulfill({ json: { ok: true } }); return; }
    const term = new URL(route.request().url()).searchParams.get('search');
    if (!term) { await route.fulfill({ json: ROSTER }); return; }
    const hit = [RACHEL, OFF_THE_PAGE].filter((p) =>
      [p.client_name, p.client_email, p.title].some((f) => f.toLowerCase().includes(term.toLowerCase())));
    // A match set that fits on the page is genuinely untruncated - the server
    // sends the flag either way, so the stub does too.
    await route.fulfill({
      json: { proposals: hit, counts_available: true, total: hit.length, truncated: false },
    });
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

  test('B3: pasting imports; typing and clicking away afterwards leave the bundle alone', async ({ page, context, baseURL }) => {
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
    const asked: string[] = [];
    const spy = (d: { message(): string; dismiss(): Promise<void> }) => {
      asked.push(d.message()); void d.dismiss();
    };
    page.on('dialog', spy);
    await page.getByTestId('csv-paste').click();
    await page.keyboard.type('\n# note to self');
    await expect(page.getByTestId('bundle-row')).toHaveCount(1);
    await expect(page.getByTestId('line-row')).toHaveCount(1);

    // And then click away, which is the half the typing guarantee never covered:
    // the box parsed on BLUR, so the very next click anywhere - this field, the
    // Combine bar, a checkbox - rebuilt the preview from the edited text and
    // took the bundle, its name and every override with it, silently. Moving
    // focus is not a decision to re-import, so nothing happens and nothing asks.
    await page.getByTestId('client-name').click();
    await expect(page.getByTestId('bundle-row')).toHaveCount(1);
    await expect(page.getByTestId('bundle-row')).toContainText('$6,300.50');
    await expect(page.getByTestId('line-row')).toHaveCount(1);
    expect(asked).toEqual([]);
    page.off('dialog', spy);
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

  test('B6: a proposal past the roster cap is still reachable - and revocable - by search', async ({ page, context, baseURL }) => {
    await openProposals(page, context, baseURL!);

    // The page stops at the cap and says so rather than reading as the estate.
    await expect(page.getByTestId('roster-truncated')).toContainText('of 312');
    await expect(page.getByText('Zeta Vanterpool')).toHaveCount(0);

    // Search reaches it, and its lifecycle controls come with the row.
    await page.getByTestId('roster-search').fill('Zeta');
    await page.getByTestId('roster-search-btn').click();
    const row = page.getByTestId('proposal-22222222-2222-2222-2222-222222222222');
    await expect(row).toBeVisible();
    await expect(row.getByRole('button', { name: /revoke/i })).toBeEnabled();
    await expect(page.getByText('Rachel Morales')).toHaveCount(0);
    // One match is the whole result, so nothing claims to be truncated.
    await expect(page.getByTestId('roster-truncated')).toHaveCount(0);

    // Searching the email column finds it too.
    await page.getByTestId('roster-search').fill('zeta@example.com');
    await page.getByTestId('roster-search-btn').click();
    await expect(row).toBeVisible();

    // Clear puts the whole roster back.
    await page.getByTestId('roster-search-clear').click();
    await expect(page.getByText('Rachel Morales')).toBeVisible();
  });

  test('B7: making a locked bundle optional asks first and names the locked work', async ({ page, context, baseURL }) => {
    await openProposals(page, context, baseURL!);
    await pasteCsv(page, CSV);
    await expect(page.getByTestId('line-row')).toHaveCount(3);

    // Demolition (locked) + a vanity (optional): composeBundle's fail-safe locks
    // the bundle, and the override is what could undo that.
    await page.getByLabel('Select Demolition & prep').check();
    await page.getByLabel('Select Vanity - double sink').check();
    await page.getByTestId('combine-btn').click();
    const bundle = page.getByTestId('bundle-row');
    // The badge, not any button label that happens to carry the same word.
    const badge = (word: string) => bundle.getByText(word, { exact: true });
    await expect(badge('locked')).toBeVisible();

    // Dismissed: the badge does not move.
    let asked = '';
    page.once('dialog', (d) => { asked = d.message(); d.dismiss(); });
    await bundle.getByRole('button', { name: /make .* optional/i }).click();
    expect(asked).toContain('Demolition & prep');
    await expect(badge('locked')).toBeVisible();

    // Accepted: the override still works - it is the designed backstop.
    page.once('dialog', (d) => d.accept());
    await bundle.getByRole('button', { name: /make .* optional/i }).click();
    await expect(badge('optional')).toBeVisible();

    // What the admin agreed to is ONE toggle over this package - not an
    // individual client toggle on the demolition. Unbundling gives every member
    // back the verdict it was combined with, so the structural line comes back
    // locked and only the vanity stays the client's to decline.
    await bundle.getByRole('button', { name: /unbundle/i }).click();
    await expect(page.getByTestId('bundle-row')).toHaveCount(0);
    const row = (title: string) => page.getByTestId('line-row').filter({ hasText: title });
    await expect(row('Demolition & prep').getByText('locked', { exact: true })).toBeVisible();
    await expect(row('Vanity - double sink').getByText('optional', { exact: true })).toBeVisible();
  });

  test('B8: a badge the admin set on a LINE survives being bundled again', async ({ page, context, baseURL }) => {
    await openProposals(page, context, baseURL!);
    await pasteCsv(page, CSV_NESTED);
    await expect(page.getByTestId('line-row')).toHaveCount(4);
    const badge = (row: ReturnType<Page['getByTestId']>, word: string) =>
      row.getByText(word, { exact: true });

    // The admin overrules the registry on ONE LINE, where it is on screen under
    // its own name. That verdict is the member's own, and it is what every
    // later reading of it sees.
    const tile = page.getByTestId('line-row').filter({ hasText: 'Tile - heated floor upgrade' });
    await tile.getByRole('button', { name: /make .* locked/i }).click();
    await expect(badge(tile, 'locked')).toBeVisible();

    // Combining reads that flag, not the registry's: the package is locked
    // because a line inside it was locked by hand.
    await page.getByLabel('Select Tile - heated floor upgrade').check();
    await page.getByLabel('Select Vanity - double sink').check();
    await page.getByTestId('combine-btn').click();
    const inner = page.getByTestId('bundle-row');
    await expect(badge(inner, 'locked')).toBeVisible();

    // Bundling that bundle must not launder the lock away: the new package is
    // initialized from the flattened members, so it is locked too.
    await inner.getByRole('checkbox').check();
    await page.getByLabel('Select Faucet - matte black').check();
    await page.getByTestId('combine-btn').click();
    const outer = page.getByTestId('bundle-row');
    await expect(outer).toHaveCount(1);
    await expect(outer).toContainText('Includes: Tile - heated floor upgrade');
    await expect(badge(outer, 'locked')).toBeVisible();

    // And one level up the guard names exactly the work a flip would expose -
    // the hand-locked line, and not the two beside it that nothing calls
    // structural.
    let asked = '';
    page.once('dialog', (d) => { asked = d.message(); d.dismiss(); });
    await outer.getByRole('button', { name: /make .* optional/i }).click();
    expect(asked).toContain('Tile - heated floor upgrade');
    expect(asked).not.toContain('Vanity - double sink');
    expect(asked).not.toContain('Faucet - matte black');
    await expect(badge(outer, 'locked')).toBeVisible();
  });

  test('B9: locking a package and changing your mind asks nothing', async ({ page, context, baseURL }) => {
    await openProposals(page, context, baseURL!);
    await pasteCsv(page, CSV);
    await expect(page.getByTestId('line-row')).toHaveCount(3);

    // Two registry-optional finishes: the all-or-nothing negotiation posture.
    await page.getByLabel('Select Tile - heated floor upgrade').check();
    await page.getByLabel('Select Vanity - double sink').check();
    await page.getByTestId('combine-btn').click();
    const bundle = page.getByTestId('bundle-row');
    const badge = (word: string) => bundle.getByText(word, { exact: true });
    await expect(badge('optional')).toBeVisible();

    // Locking asks nothing - only the other direction can expose work.
    const asked: string[] = [];
    const spy = (d: { message(): string; dismiss(): Promise<void> }) => {
      asked.push(d.message()); void d.dismiss();
    };
    page.on('dialog', spy);
    await bundle.getByRole('button', { name: /make .* locked/i }).click();
    await expect(badge('locked')).toBeVisible();

    // And changing your mind straight back asks nothing either: nothing inside
    // this package is structural, whatever its own badge came to read. A guard
    // that fires falsely on an undo is what trains an admin to click through
    // the dialog that protects the demolition.
    await bundle.getByRole('button', { name: /make .* optional/i }).click();
    await expect(badge('optional')).toBeVisible();
    expect(asked).toEqual([]);
    page.off('dialog', spy);
  });

  test('B5: the Parse button re-imports on demand, asking first when that discards composed work', async ({ page, context, baseURL }) => {
    await openProposals(page, context, baseURL!);
    await pasteCsv(page, CSV);
    await expect(page.getByTestId('line-row')).toHaveCount(3);

    // A pristine preview has nothing to lose, so Parse just re-imports.
    const asked: string[] = [];
    const spy = (d: { message(): string; dismiss(): Promise<void> }) => {
      asked.push(d.message()); void d.dismiss();
    };
    page.on('dialog', spy);
    await page.getByTestId('parse-btn').click();
    await expect(page.getByTestId('line-row')).toHaveCount(3);
    expect(asked).toEqual([]);
    page.off('dialog', spy);

    await page.getByLabel('Select Tile - heated floor upgrade').check();
    await page.getByLabel('Select Vanity - double sink').check();
    await page.getByTestId('combine-btn').click();
    await expect(page.getByTestId('bundle-row')).toHaveCount(1);

    // Now it would discard the bundle, so it says so. Dismissed: nothing moves.
    let question = '';
    page.once('dialog', (d) => { question = d.message(); d.dismiss(); });
    await page.getByTestId('parse-btn').click();
    expect(question).toContain('bundles you composed');
    await expect(page.getByTestId('bundle-row')).toHaveCount(1);

    // Accepted: an explicit re-import is allowed to reset the preview.
    page.once('dialog', (d) => d.accept());
    await page.getByTestId('parse-btn').click();
    await expect(page.getByTestId('bundle-row')).toHaveCount(0);
    await expect(page.getByTestId('line-row')).toHaveCount(3);

    // Emptying the box empties the preview - it used to leave the old one up.
    // Nothing composed survives here, so it asks nothing.
    await page.getByTestId('csv-paste').fill('');
    await expect(page.getByTestId('preview')).toHaveCount(0);
    await expect(page.getByTestId('parse-btn')).toBeDisabled();
  });

  test('B11: emptying the box is a discard like any other - it asks, and Cancel keeps both', async ({ page, context, baseURL }) => {
    await openProposals(page, context, baseURL!);
    await pasteCsv(page, CSV);
    await expect(page.getByTestId('line-row')).toHaveCount(3);

    await page.getByLabel('Select Tile - heated floor upgrade').check();
    await page.getByLabel('Select Vanity - double sink').check();
    await page.getByTestId('combine-btn').click();
    await expect(page.getByTestId('bundle-row')).toHaveCount(1);

    // Select-all-and-delete in the box, to paste a corrected export over it.
    // This was the one door that discarded without asking - and because it left
    // nothing to lose, the paste that naturally followed never asked either.
    let question = '';
    page.once('dialog', (d) => { question = d.message(); d.dismiss(); });
    await page.getByTestId('csv-paste').fill('');
    expect(question).toContain('bundles you composed');

    // Cancelled: the bundle stays, and so does the text it was built from - a
    // box left empty beside a live preview is the mismatch clearing prevents.
    await expect(page.getByTestId('bundle-row')).toHaveCount(1);
    await expect(page.getByTestId('csv-paste')).toHaveValue(CSV);

    // Accepted: the preview goes, as an emptied box should mean.
    page.once('dialog', (d) => d.accept());
    await page.getByTestId('csv-paste').fill('');
    await expect(page.getByTestId('preview')).toHaveCount(0);
    await expect(page.getByTestId('csv-paste')).toHaveValue('');
  });

  test('B12: the row checkbox clears the house 44px touch target', async ({ page, context, baseURL }) => {
    await openProposals(page, context, baseURL!);
    await pasteCsv(page, CSV);
    await expect(page.getByTestId('line-row')).toHaveCount(3);

    // The mobile-first path's primary control, at the width the owner's mobile
    // note calls for. globals.css bumps buttons only, so this one was 20x20.
    await page.setViewportSize({ width: 390, height: 844 });
    const target = page.getByTestId('row-select-target').first();
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    // The visual stayed compact - the label grew, not the box.
    const input = target.getByRole('checkbox');
    const inner = await input.boundingBox();
    expect(inner!.width).toBeLessThanOrEqual(24);

    // And a tap on the padding, well outside the 20px box, selects the row -
    // the target is the whole 44px, not just what is painted.
    await page.mouse.click(box!.x + 3, box!.y + 3);
    await expect(input).toBeChecked();
  });
});
