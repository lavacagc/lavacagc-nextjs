import { test, expect, type BrowserContext, type Page } from '@playwright/test';

/**
 * Proposal Pod - Slice 2, in a real browser.
 *
 * The owner's AC contract calls for browser-level admin verification, and the
 * importer is a set of state machines that only exist once React is mounted:
 * Send refused while the client page is missing, the paste box no longer
 * re-importing on a keystroke, unbundle giving descriptions and the selection
 * back. This file OWNS those ACs - the static spec points at the test id here
 * rather than asserting how the page's source is spelled, because a rename is
 * not a regression and a green string match is not a working importer.
 *
 * The AC each test carries is named in its title. Between them they cover
 * AC9, AC10, AC10b, AC10c, AC10e (the page half), AC10g, AC10h, AC10i, AC10j,
 * AC10k, AC10m, AC10n, AC6h, AC6j, AC6m and AC6n.
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

/** A revoked proposal: re-importing onto one is refused, so its row says so. */
const REVOKED = {
  ...RACHEL,
  id: '33333333-3333-3333-3333-333333333333',
  client_name: 'Yusuf Adeyemi',
  client_email: 'yusuf@example.com',
  title: 'Primary suite addition',
  status: 'revoked',
  token: 'c'.repeat(43),
  updated_at: '2025-06-01T00:00:00.000Z',
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

/**
 * Open the admin page with one fixed roster payload behind it - for the ACs
 * about what the roster SAYS (its counts, its truncation notice) rather than
 * about searching it.
 */
async function openRoster(
  page: Page, context: BrowserContext, baseURL: string, roster: unknown,
) {
  await signInAsAdmin(context, baseURL);
  await page.route('**/api/admin/proposals*', async (route) => {
    if (route.request().method() !== 'GET') { await route.fulfill({ json: { ok: true } }); return; }
    await route.fulfill({ json: roster });
  });
  await page.goto('/vaca-mgmt/proposals');
  await expect(page.getByTestId('proposals-admin')).toBeVisible();
}

async function openProposals(page: Page, context: BrowserContext, baseURL: string) {
  await signInAsAdmin(context, baseURL);
  // The glob keeps the query string in scope - the roster read carries ?search.
  await page.route('**/api/admin/proposals*', async (route) => {
    if (route.request().method() !== 'GET') { await route.fulfill({ json: { ok: true } }); return; }
    const term = new URL(route.request().url()).searchParams.get('search');
    if (!term) { await route.fulfill({ json: ROSTER }); return; }
    const hit = [RACHEL, OFF_THE_PAGE, REVOKED].filter((p) =>
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

/**
 * Paste text into the CSV box the way a human does, so onPaste is what fires.
 * Select-all first, so a paste over an existing import REPLACES it the way
 * pasting a corrected export does, rather than splicing at the caret.
 */
async function pasteCsv(page: Page, text: string) {
  const box = page.getByTestId('csv-paste');
  await box.click();
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+A`);
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
  await page.keyboard.press(`${mod}+V`);
}

test.describe('proposals admin, in the browser', () => {
  test.use({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });

  test('B1 (AC10e): Send is refused while the client page does not exist; Copy link still works', async ({ page, context, baseURL }) => {
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

  test('B2 (AC10d): a clipboard failure tells the admin instead of pretending it copied', async ({ page, context, baseURL }) => {
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

  test('B3 (AC10, AC10c, AC9): pasting imports; typing and clicking away afterwards leave the bundle alone', async ({ page, context, baseURL }) => {
    await openProposals(page, context, baseURL!);
    await pasteCsv(page, CSV);
    await expect(page.getByTestId('line-row')).toHaveCount(3);

    // Bundle the two optional lines via the touch path.
    await page.getByLabel('Select Tile - heated floor upgrade').check();
    await page.getByLabel('Select Vanity - double sink').check();
    await expect(page.getByTestId('combine-btn')).toContainText('Combine 2 into a bundle');
    await page.getByTestId('combine-btn').click();
    const bundle = page.getByTestId('bundle-row');
    await expect(bundle).toHaveCount(1);
    await expect(bundle).toContainText('$6,300.50');

    // AC9, on screen: the bundle shows its members BY NAME and one summed
    // price. Neither member's own price is rendered anywhere on the row - that
    // is the client-facing contract, and the preview is where it is composed.
    await expect(bundle).toContainText('Includes: Tile - heated floor upgrade · Vanity - double sink');
    await expect(bundle).toContainText('client sees names, never member prices');
    await expect(bundle).not.toContainText('$2,900.50');
    await expect(bundle).not.toContainText('$3,400.00');

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

  test('B4 (AC10b): unbundle restores descriptions and frees the tick it was holding', async ({ page, context, baseURL }) => {
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

  test('B6 (AC6j): a proposal past the roster cap is still reachable - and revocable - by search', async ({ page, context, baseURL }) => {
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

  test('B7 (AC10i, AC10j): making a locked bundle optional asks first and names the locked work', async ({ page, context, baseURL }) => {
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

  test('B8 (AC10i, AC10j): a badge the admin set on a LINE survives being bundled again', async ({ page, context, baseURL }) => {
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

  test('B9 (AC10i): locking a package and changing your mind asks nothing', async ({ page, context, baseURL }) => {
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

  test('B5 (AC10c): the Parse button re-imports on demand, asking first when that discards composed work', async ({ page, context, baseURL }) => {
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

  test('B11 (AC10c): emptying the box is a discard like any other - it asks, and Cancel keeps both', async ({ page, context, baseURL }) => {
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

  test('B13 (AC10c, AC10g): arming a re-import is a discard like any other - it asks, and Cancel keeps the preview', async ({ page, context, baseURL }) => {
    await openProposals(page, context, baseURL!);
    await pasteCsv(page, CSV);
    await expect(page.getByTestId('line-row')).toHaveCount(3);

    await page.getByLabel('Select Tile - heated floor upgrade').check();
    await page.getByLabel('Select Vanity - double sink').check();
    await page.getByTestId('combine-btn').click();
    await expect(page.getByTestId('bundle-row')).toHaveCount(1);

    // Re-import is a small outline button up in the roster, scroll-lengths away
    // from the preview it empties. It used to take every bundle, name and
    // override the moment it was clicked - no dialog, no toast, no undo.
    let question = '';
    page.once('dialog', (d) => { question = d.message(); d.dismiss(); });
    await page.getByTestId('reimport-btn').first().click();
    expect(question).toContain('bundles you composed');

    // Declined: the preview stands AND the re-import is not armed - a half-armed
    // importer would be its own mismatch.
    await expect(page.getByTestId('bundle-row')).toHaveCount(1);
    await expect(page.getByTestId('reimport-armed')).toHaveCount(0);

    // Accepted: it arms and empties, which is what the armed card promises.
    page.once('dialog', (d) => d.accept());
    await page.getByTestId('reimport-btn').first().click();
    await expect(page.getByTestId('reimport-armed')).toBeVisible();
    await expect(page.getByTestId('preview')).toHaveCount(0);
    await expect(page.getByTestId('csv-paste')).toHaveValue('');

    // And Cancel is the same door one step later - on a preview composed FOR
    // the armed target, which makes it worth more, not less.
    await pasteCsv(page, CSV);
    await page.getByLabel('Select Tile - heated floor upgrade').check();
    await page.getByLabel('Select Vanity - double sink').check();
    await page.getByTestId('combine-btn').click();
    await expect(page.getByTestId('bundle-row')).toHaveCount(1);

    question = '';
    page.once('dialog', (d) => { question = d.message(); d.dismiss(); });
    await page.getByRole('button', { name: /cancel re-import/i }).click();
    expect(question).toContain('bundles you composed');
    await expect(page.getByTestId('bundle-row')).toHaveCount(1);
    await expect(page.getByTestId('reimport-armed')).toBeVisible();
  });

  test('B14 (AC10c): a declined paste leaves the box and the preview agreeing', async ({ page, context, baseURL }) => {
    await openProposals(page, context, baseURL!);
    await pasteCsv(page, CSV);
    await expect(page.getByTestId('line-row')).toHaveCount(3);

    await page.getByLabel('Select Tile - heated floor upgrade').check();
    await page.getByLabel('Select Vanity - double sink').check();
    await page.getByTestId('combine-btn').click();
    await expect(page.getByTestId('bundle-row')).toHaveCount(1);

    // Paste a corrected export over it, then think better of it. The box used to
    // commit the new text before the confirm ran, so cancelling left the
    // corrected CSV on screen above a preview built from the OLD one - and
    // Create wrote the old rows, with nothing saying the two panes disagreed.
    let question = '';
    page.once('dialog', (d) => { question = d.message(); d.dismiss(); });
    await pasteCsv(page, CSV_NESTED);
    expect(question).toContain('bundles you composed');
    await expect(page.getByTestId('bundle-row')).toHaveCount(1);
    await expect(page.getByTestId('line-row')).toHaveCount(1);
    await expect(page.getByTestId('csv-paste')).toHaveValue(CSV);

    // Accepted, the paste imports and the box is the text behind it.
    page.once('dialog', (d) => d.accept());
    await pasteCsv(page, CSV_NESTED);
    await expect(page.getByTestId('bundle-row')).toHaveCount(0);
    await expect(page.getByTestId('line-row')).toHaveCount(4);
    await expect(page.getByTestId('csv-paste')).toHaveValue(CSV_NESTED);
  });

  test('B15 (AC10k): Re-import is refused on a revoked row before any work is composed', async ({ page, context, baseURL }) => {
    await openProposals(page, context, baseURL!);
    await page.getByTestId('roster-search').fill('Yusuf');
    await page.getByTestId('roster-search-btn').click();
    const row = page.getByTestId('proposal-33333333-3333-3333-3333-333333333333');
    await expect(row).toBeVisible();
    await expect(row.getByText('revoked', { exact: true })).toBeVisible();

    // replaceLines refuses a revoked proposal outright (409). The row already
    // carries the status, so the refusal is knowable now rather than after the
    // admin has pasted the corrected CSV and composed it.
    const reimport = row.getByTestId('reimport-btn');
    await expect(reimport).toBeDisabled();
    // And the remedy it names is one the admin can act on. Send is disabled on
    // every row while the client page is missing, so pointing at Re-send left
    // this row frozen: Revoke hides itself once used, and Copy link was the only
    // thing left that did anything.
    await expect(reimport).toHaveAttribute('title', /restore it to draft before re-importing/i);
    await expect(row.getByTestId('send-btn')).toBeDisabled();
    await expect(row.getByTestId('restore-btn')).toBeEnabled();

    // A live proposal is unaffected.
    await page.getByTestId('roster-search-clear').click();
    await expect(page.getByTestId('reimport-btn').first()).toBeEnabled();
  });

  test('B16 (AC10m): a revoked proposal can be restored to draft, and asks first', async ({ page, context, baseURL }) => {
    await openProposals(page, context, baseURL!);
    // This spec's own roster, so the restored status is this test's state and
    // nothing is mutated for anyone else. Registered after openProposals, which
    // is what makes it the route that answers.
    const posted: unknown[] = [];
    let status = 'revoked';
    // The action route is its own pattern: a glob's `*` stops at a path
    // separator, so the roster's pattern never reaches /proposals/<id>.
    await page.route(`**/api/admin/proposals/${REVOKED.id}`, async (route) => {
      posted.push(JSON.parse(route.request().postData() ?? 'null'));
      status = 'draft';
      await route.fulfill({ json: { ok: true, status: 'draft' } });
    });
    await page.route('**/api/admin/proposals*', async (route) => {
      await route.fulfill({
        json: {
          proposals: [{ ...REVOKED, status }],
          counts_available: true,
          total: 1,
          truncated: false,
        },
      });
    });
    await page.getByTestId('roster-search-btn').click();
    const row = page.getByTestId(`proposal-${REVOKED.id}`);
    await expect(row.getByText('revoked', { exact: true })).toBeVisible();

    // Same confirm posture as Revoke, in the other direction: it changes what a
    // link the client may be holding does.
    let asked = '';
    page.once('dialog', (d) => { asked = d.message(); d.dismiss(); });
    await row.getByTestId('restore-btn').click();
    expect(asked).toContain('Restore Yusuf Adeyemi');
    expect(posted, 'a dismissed confirm sends nothing').toEqual([]);
    await expect(row.getByText('revoked', { exact: true })).toBeVisible();

    page.once('dialog', (d) => d.accept());
    await row.getByTestId('restore-btn').click();
    await expect(toastTitle(page, 'Restored to draft')).toBeVisible();
    expect(posted).toEqual([{ action: 'restore' }]);

    // Back to draft, which is what unfreezes the row: re-import is offered
    // again, and Revoke has taken Restore's place.
    await expect(row.getByText('draft', { exact: true })).toBeVisible();
    await expect(row.getByTestId('reimport-btn')).toBeEnabled();
    await expect(row.getByTestId('restore-btn')).toHaveCount(0);
    await expect(row.getByRole('button', { name: /revoke/i })).toBeEnabled();
  });

  test('B17 (AC10n): an abandoned drag disarms, and a stray file never becomes a bundle', async ({ page, context, baseURL }) => {
    await openProposals(page, context, baseURL!);
    await pasteCsv(page, CSV);
    await expect(page.getByTestId('line-row')).toHaveCount(3);

    // Start dragging a row and release it somewhere that is not a row - the
    // shrug that used to leave the key armed with nothing on screen saying so.
    await page.evaluate(() => {
      const rows = document.querySelectorAll('[data-testid="line-row"]');
      const dt = new DataTransfer();
      const opts = { bubbles: true, cancelable: true, dataTransfer: dt };
      rows[0].dispatchEvent(new DragEvent('dragstart', opts));
      rows[0].dispatchEvent(new DragEvent('dragend', opts));
    });

    // Now drop a FILE on a different row - the CSV dragged from Finder, aimed at
    // the drop zone and landing a few pixels low. The row's handler used to read
    // the armed key and combine two unrelated lines, swallowing the file: no
    // toast, no dialog, no undo short of Unbundle.
    await page.evaluate(() => {
      const rows = document.querySelectorAll('[data-testid="line-row"]');
      const dt = new DataTransfer();
      dt.items.add(new File(['title,description,price\n'], 'corrected.csv', { type: 'text/csv' }));
      rows[2].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    });
    await expect(page.getByTestId('bundle-row')).toHaveCount(0);
    await expect(page.getByTestId('line-row')).toHaveCount(3);
    // Inert, but not silent.
    await expect(toastTitle(page, 'Nothing was imported')).toBeVisible();

    // And the gesture itself still works: the drag carries its own payload, and
    // a row dropped on a row is a bundle.
    await page.evaluate(() => {
      const rows = document.querySelectorAll('[data-testid="line-row"]');
      const dt = new DataTransfer();
      const opts = { bubbles: true, cancelable: true, dataTransfer: dt };
      rows[0].dispatchEvent(new DragEvent('dragstart', opts));
      rows[1].dispatchEvent(new DragEvent('drop', opts));
    });
    await expect(page.getByTestId('bundle-row')).toHaveCount(1);
    await expect(page.getByTestId('line-row')).toHaveCount(1);
  });

  test('B12 (AC10c4): the row checkbox clears the house 44px touch target', async ({ page, context, baseURL }) => {
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

  test('B19 (AC6h): a counts outage costs the roster its numbers, never its controls', async ({ page, context, baseURL }) => {
    // The aggregate is down - the window between this code deploying and its
    // migration being applied, or simply a failing function. The counts are a
    // decoration; Copy link, Re-import and above all Revoke are the panel's job.
    await openRoster(page, context, baseURL!, {
      proposals: [{ ...RACHEL, line_count: null, submission_count: null, latest_total_cents: null }],
      counts_available: false,
      total: null,
      truncated: false,
    });

    await expect(page.getByTestId('counts-unavailable')).toBeVisible();
    const row = page.getByTestId(`proposal-${RACHEL.id}`);
    // Unknown, said out loud - never a confident 0 the admin would act on.
    await expect(row).toContainText('Counts unavailable');
    await expect(row).not.toContainText('0 lines');
    await expect(row.getByRole('button', { name: /copy link/i })).toBeEnabled();
    await expect(row.getByTestId('reimport-btn')).toBeEnabled();
    await expect(row.getByRole('button', { name: /revoke/i })).toBeEnabled();
  });

  test('B20 (AC6m): a truncated roster says so even when the exact total is unreadable', async ({ page, context, baseURL }) => {
    // Content-Range can go missing three ways (no header, PostgREST's uncounted
    // `*`, a proxy that mangles it), and a page that stopped at the cap with
    // nothing saying so is the silent cut-off the search box exists to answer.
    await openRoster(page, context, baseURL!, {
      proposals: [RACHEL], counts_available: true, total: null, truncated: true,
    });

    const notice = page.getByTestId('roster-truncated');
    await expect(notice).toContainText('Showing the first 1 proposals');
    await expect(notice).toContainText('Search by client name, email or title');
    // The number only fills in when it is known - no "of null", no invented total.
    await expect(notice).not.toContainText('of null');
    await expect(notice).not.toContainText('undefined');
  });

  test('B21 (AC6n): a created proposal is visible on the roster, never hidden by the search that was open', async ({ page, context, baseURL }) => {
    await signInAsAdmin(context, baseURL!);
    const terms: (string | null)[] = [];
    const posted: unknown[] = [];
    await page.route('**/api/admin/proposals*', async (route) => {
      if (route.request().method() !== 'GET') {
        posted.push(JSON.parse(route.request().postData() ?? 'null'));
        await route.fulfill({ json: { ok: true, id: 'new', token: 'n'.repeat(43) } });
        return;
      }
      const term = new URL(route.request().url()).searchParams.get('search');
      terms.push(term);
      const hit = term ? [OFF_THE_PAGE] : [RACHEL];
      await route.fulfill({
        json: { proposals: hit, counts_available: true, total: hit.length, truncated: false },
      });
    });
    await page.goto('/vaca-mgmt/proposals');
    await expect(page.getByTestId('proposals-admin')).toBeVisible();

    // A search is open, as it would be after reaching a client to check their
    // existing proposal before writing the next one.
    await page.getByTestId('roster-search').fill('Zeta');
    await page.getByTestId('roster-search-btn').click();
    await expect(page.getByText('Zeta Vanterpool')).toBeVisible();

    await pasteCsv(page, CSV);
    await expect(page.getByTestId('line-row')).toHaveCount(3);
    await page.getByTestId('client-name').fill('Priya Raman');
    await page.getByTestId('proposal-title').fill('Kitchen refresh');
    await page.getByTestId('create-btn').click();
    await expect(toastTitle(page, 'Proposal created (draft)')).toBeVisible();
    expect(posted).toHaveLength(1);

    // Reloading under whatever term happened to be in the box hid the brand new
    // proposal entirely - and a create that looks like it did nothing gets
    // pressed again, which is a duplicate proposal for a real client. So the
    // search clears and the whole roster comes back.
    await expect(page.getByTestId('roster-search')).toHaveValue('');
    await expect(page.getByText('Rachel Morales')).toBeVisible();
    expect(terms[terms.length - 1], 'the reload after Create carries no term').toBeNull();
  });

  test('B22 (AC10c): choosing a file is a discard like any other - it asks, and Cancel keeps the preview', async ({ page, context, baseURL }) => {
    await openProposals(page, context, baseURL!);
    await pasteCsv(page, CSV);
    await expect(page.getByTestId('line-row')).toHaveCount(3);

    await page.getByLabel('Select Tile - heated floor upgrade').check();
    await page.getByLabel('Select Vanity - double sink').check();
    await page.getByTestId('combine-btn').click();
    await expect(page.getByTestId('bundle-row')).toHaveCount(1);

    const chooseFile = () => page.getByTestId('csv-file-input').setInputFiles({
      name: 'corrected.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV_NESTED),
    });
    // The confirm is raised from a promise chain (the file is read first), so
    // the dialog is awaited rather than assumed to have fired by now.
    const asked = () => new Promise<string>((resolve) => {
      page.once('dialog', (d) => { resolve(d.message()); void d.dismiss(); });
    });

    const question = asked();
    await chooseFile();
    expect(await question).toContain('bundles you composed');
    // Declined: the bundle stands, and so does the text it was built from.
    await expect(page.getByTestId('bundle-row')).toHaveCount(1);
    await expect(page.getByTestId('csv-paste')).toHaveValue(CSV);

    const accepted = new Promise<void>((resolve) => {
      page.once('dialog', (d) => { void d.accept(); resolve(); });
    });
    await chooseFile();
    await accepted;
    await expect(page.getByTestId('bundle-row')).toHaveCount(0);
    await expect(page.getByTestId('line-row')).toHaveCount(4);
    await expect(page.getByTestId('csv-paste')).toHaveValue(CSV_NESTED);
  });

  test('B23 (AC10h): a bundle cannot be sent with its name deleted', async ({ page, context, baseURL }) => {
    await openProposals(page, context, baseURL!);
    await pasteCsv(page, CSV);
    await expect(page.getByTestId('line-row')).toHaveCount(3);

    await page.getByLabel('Select Tile - heated floor upgrade').check();
    await page.getByLabel('Select Vanity - double sink').check();
    await page.getByTestId('combine-btn').click();
    const name = page.getByTestId('bundle-row').getByLabel('Bundle name');
    await name.fill('Complete spa bathroom package');

    // The client fields filled, so the name is the only thing left that can
    // refuse the button.
    await page.getByTestId('client-name').fill('Rachel Morales');
    await page.getByTestId('proposal-title').fill('Your bathroom remodel');
    const create = page.getByTestId('create-btn');
    await expect(create).toBeEnabled();

    // Typing through empty is how anyone replaces a name, so it is allowed -
    // but an empty title is what the schema rejects with a message about a line
    // the admin never sees, so the button refuses while the box is still there.
    await name.fill('');
    await expect(create).toBeDisabled();
    await expect(create).toHaveAttribute('title', /needs a name/i);

    // And leaving the box empty puts the last real name back.
    await page.getByTestId('client-name').click();
    await expect(name).toHaveValue('Complete spa bathroom package');
    await expect(create).toBeEnabled();
  });

  test('B26 (AC10c): a badge set by hand is composed work too, before and after a bundle', async ({ page, context, baseURL }) => {
    await openProposals(page, context, baseURL!);
    await pasteCsv(page, CSV);
    await expect(page.getByTestId('line-row')).toHaveCount(3);
    const row = (title: string) => page.getByTestId('line-row').filter({ hasText: title });

    // No bundle anywhere - just the admin overruling the registry on one line.
    // A re-parse re-badges every row off the registry again, so that verdict is
    // exactly as losable as a bundle and the discard has to ask about it.
    await row('Vanity - double sink').getByRole('button', { name: /make .* locked/i }).click();
    await expect(row('Vanity - double sink').getByText('locked', { exact: true })).toBeVisible();

    let question = '';
    page.once('dialog', (d) => { question = d.message(); d.dismiss(); });
    await page.getByTestId('parse-btn').click();
    expect(question).toContain('badges you set by hand');
    await expect(row('Vanity - double sink').getByText('locked', { exact: true })).toBeVisible();

    // And it is still the admin's verdict after a round trip through a bundle,
    // which is the other way a row reaches the preview: Unbundle hands back the
    // override, not the registry's answer, so the next discard asks again.
    await page.getByLabel('Select Vanity - double sink').check();
    await page.getByLabel('Select Demolition & prep').check();
    await page.getByTestId('combine-btn').click();
    await page.getByTestId('bundle-row').getByRole('button', { name: /unbundle/i }).click();
    await expect(page.getByTestId('line-row')).toHaveCount(3);
    await expect(row('Vanity - double sink').getByText('locked', { exact: true })).toBeVisible();

    question = '';
    page.once('dialog', (d) => { question = d.message(); d.dismiss(); });
    await page.getByTestId('parse-btn').click();
    expect(question).toContain('badges you set by hand');

    // Accepted, the re-import is allowed to take it: the registry's own verdict
    // is what a fresh parse produces, and this line is the client's again.
    page.once('dialog', (d) => d.accept());
    await page.getByTestId('parse-btn').click();
    await expect(row('Vanity - double sink').getByText('optional', { exact: true })).toBeVisible();
  });

  test('B24 (AC10n): the drop zone takes a dropped file, and a dragged text imports through the paste door', async ({ page, context, baseURL }) => {
    await openProposals(page, context, baseURL!);

    /** Drop something on an element, and report whether the default was taken away. */
    const dropOn = (selector: string, payload: { file?: string; text?: string }) =>
      page.evaluate(({ selector: sel, payload: p }) => {
        const box = document.querySelector('[data-testid="csv-paste"]')!;
        const target = sel === 'box' ? box : box.parentElement!;
        const dt = new DataTransfer();
        if (p.file != null) dt.items.add(new File([p.file], 'estimate.csv', { type: 'text/csv' }));
        if (p.text != null) dt.setData('text/plain', p.text);
        const ev = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
        target.dispatchEvent(ev);
        return ev.defaultPrevented;
      }, { selector, payload });

    /**
     * Drop text into the paste box the way a browser does it: the drop event,
     * then the insert its default action performs and the input event that
     * announces it - all in one task, which is the ordering the import flag is
     * armed and dropped by. A synthetic event performs no native insert, so
     * this stands in for it; the value it writes is the whole dropped text,
     * which is what a drop into an EMPTY box produces.
     *
     * Reports whether the drop kept its default, since a cancelled one is a
     * cancelled insert and nothing after it would happen at all.
     */
    const dropTextIntoBox = (text: string) =>
      page.evaluate((t) => {
        const box = document.querySelector('[data-testid="csv-paste"]') as HTMLTextAreaElement;
        const dt = new DataTransfer();
        dt.setData('text/plain', t);
        const ev = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
        box.dispatchEvent(ev);
        if (ev.defaultPrevented) return false;
        const setValue = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, 'value',
        )!.set!;
        setValue.call(box, t);
        box.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }, text);

    // A CSV dropped on the dashed box imports, and the browser's own handling
    // of it - navigating away from the page, preview and all - is cancelled.
    expect(await dropOn('zone', { file: CSV }), 'a dropped file is ours to handle').toBe(true);
    await expect(page.getByTestId('line-row')).toHaveCount(3);

    // Released on the zone AROUND the box a text drop is still stopped, so a
    // dragged link cannot navigate the importer away with the preview still in it.
    expect(await dropOn('zone', { text: 'https://example.com/estimate.csv' })).toBe(true);
    await expect(page.getByTestId('line-row')).toHaveCount(3);

    // Into the BOX it keeps its default - the insert is the browser's to
    // perform, and cancelling it was the one drag path that failed with no
    // file, no preview and no word. Composed work first, because a drop is an
    // import and the one-door rule says an import asks before taking it.
    await page.getByLabel('Select Demolition & prep').check();
    await page.getByLabel('Select Tile - heated floor upgrade').check();
    await page.getByTestId('combine-btn').click();
    await expect(page.getByTestId('bundle-row')).toHaveCount(1);

    let question = '';
    page.once('dialog', (d) => { question = d.message(); d.dismiss(); });
    expect(await dropTextIntoBox(CSV_NESTED), 'a text drop into the box is the browser\'s to insert')
      .toBe(true);
    expect(question, 'a dropped CSV asks before discarding composed work').toContain('bundles you composed');
    // Declined: the bundle stands, and the box is put back to the text THAT
    // preview was built from - never the dropped text above a stale preview.
    await expect(page.getByTestId('bundle-row')).toHaveCount(1);
    await expect(page.getByTestId('csv-paste')).toHaveValue(CSV);

    // Accepted, the dropped text is what the preview and the box both hold -
    // the same end state a paste of it reaches, through the other door.
    page.once('dialog', (d) => d.accept());
    expect(await dropTextIntoBox(CSV_NESTED)).toBe(true);
    await expect(page.getByTestId('bundle-row')).toHaveCount(0);
    await expect(page.getByTestId('line-row')).toHaveCount(4);
    await expect(page.getByTestId('csv-paste')).toHaveValue(CSV_NESTED);

    // And the keystroke AFTER a drop is still typing: the flag a drop arms is
    // dropped on the next task either way, so an edit here neither re-imports
    // nor asks to. Composed work again, so a stray re-import would have to.
    await page.getByLabel('Select Demolition & prep').check();
    await page.getByLabel('Select Faucet - matte black').check();
    await page.getByTestId('combine-btn').click();
    await expect(page.getByTestId('bundle-row')).toHaveCount(1);

    const asked: string[] = [];
    const spy = (d: { message(): string; dismiss(): Promise<void> }) => {
      asked.push(d.message()); void d.dismiss();
    };
    page.on('dialog', spy);
    await page.getByTestId('csv-paste').click();
    await page.keyboard.type('\n# note to self');
    await expect(page.getByTestId('bundle-row')).toHaveCount(1);
    expect(asked, 'the keystroke after a drop is typing, not an import').toEqual([]);
    page.off('dialog', spy);
  });

  test('B25: a slow search that lands last never overwrites the search that replaced it', async ({ page, context, baseURL }) => {
    await signInAsAdmin(context, baseURL!);
    // The first search is held open until the second has answered, so the two
    // land in the OPPOSITE order to the one they were asked in. This is the
    // ordinary shape of two searches typed a moment apart.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    const answer = (proposals: unknown[]) => ({
      proposals, counts_available: true, total: proposals.length, truncated: false,
    });
    await page.route('**/api/admin/proposals*', async (route) => {
      const term = new URL(route.request().url()).searchParams.get('search');
      if (term === 'Zeta') {
        await held;
        await route.fulfill({ json: answer([OFF_THE_PAGE]) });
        return;
      }
      await route.fulfill({ json: term ? answer([REVOKED]) : ROSTER });
    });
    await page.goto('/vaca-mgmt/proposals');
    await expect(page.getByTestId('proposals-admin')).toBeVisible();

    await page.getByTestId('roster-search').fill('Zeta');
    await page.getByTestId('roster-search-btn').click();
    await page.getByTestId('roster-search').fill('Yusuf');
    await page.getByTestId('roster-search-btn').click();
    await expect(page.getByText('Yusuf Adeyemi')).toBeVisible();

    // Now let the superseded one answer. Whichever response lands last used to
    // win, so the box read "Yusuf" above Zeta's row - and on a roster whose
    // whole job past the cap is reaching a proposal in order to revoke it, the
    // wrong row under the right search term is not cosmetic.
    const stale = page.waitForResponse((r) => r.url().includes('search=Zeta'));
    release();
    await stale;
    await page.waitForTimeout(300);

    await expect(page.getByTestId('roster-search')).toHaveValue('Yusuf');
    await expect(page.getByText('Yusuf Adeyemi')).toBeVisible();
    await expect(page.getByText('Zeta Vanterpool')).toHaveCount(0);
  });

  test('B18: at 390px a line name keeps its width whether or not the toggle wrapped', async ({ page, context, baseURL }) => {
    await openProposals(page, context, baseURL!);
    await pasteCsv(page, CSV_NESTED);
    await expect(page.getByTestId('line-row')).toHaveCount(4);

    // The width the owner's mobile note calls out. The name used to be the only
    // flexible item on the row, so a line whose price and short "Lock" toggle
    // fit beside it collapsed to a single letter while its neighbours - whose
    // longer "Make optional" wrapped - kept ~100px.
    await page.setViewportSize({ width: 390, height: 844 });
    const widths = await page.getByTestId('line-row').evaluateAll((els) => els.map((el) => {
      const name = el.querySelector('span.truncate') as HTMLElement;
      return Math.round(name.getBoundingClientRect().width);
    }));
    expect(widths).toHaveLength(4);
    for (const w of widths) expect(w).toBeGreaterThanOrEqual(150);

    // Buying that floor must not push the row off the side of the phone.
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
  });
});
