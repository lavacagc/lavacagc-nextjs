import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import { buildProposalDeliveryEmail, PROPOSAL_FROM } from '@/lib/proposals/deliveryEmail';

/**
 * Reviewer-visible evidence for Proposal Pod - Slice 2.
 *
 * Everything here is a CAPTURE, not a new assertion of behaviour: the
 * acceptance criteria are covered by proposal-pod-slice2.spec.ts and
 * proposal-pod-slice2-browser.spec.ts. This walks the admin surfaces a human
 * actually uses and writes them out so a reviewer can look at them:
 *
 *   A. the Customers -> Proposals screen, driven end to end at 1440px -
 *      import, badge overrides, bundling by tick + Combine, unbundle, Create,
 *      Revoke, Restore to draft, Re-import,
 *   B. the same flow at 390px, with the 44px tick target measured,
 *   C. the delivery email rendered from the pure builder, with and without the
 *      D5 booking slot (no email is ever sent - the builder is called direct),
 *   D. the dashboard sidebar's new Customers -> Proposals entry, and the Crew
 *      tab beside it that rendered blank until this slice wired its content.
 *
 * The roster API is a stateful stand-in, the same posture as the browser spec:
 * create/revoke/restore/re-import mutate it, so what is on screen at each shot
 * is the state the previous step left behind.
 *
 * Capture-only, so it is skipped unless asked for. Run recipe:
 *
 *   npm run test:build && npx next start -p 3100     # the build the suite needs
 *   PROPOSAL_EVIDENCE=1 TEST_URL=http://localhost:3100 \
 *     npx playwright test tests/proposal-pod-slice2-evidence.spec.ts --project=chromium
 */
const OUT = process.env.PROPOSAL_EVIDENCE_DIR
  || join(process.cwd(), 'test-results', 'proposal-pod-slice2-evidence');

test.skip(!process.env.PROPOSAL_EVIDENCE, 'capture-only run - set PROPOSAL_EVIDENCE=1');

/**
 * Full-page capture, scrolled to the foot of the page first: the Combine bar is
 * `sticky bottom-2`, so a full-page shot taken from the top renders it across
 * whichever row happens to sit at the bottom of the first viewport. From the
 * foot it renders where the admin actually sees it, over nothing.
 */
async function shot(page: Page, name: string, full = true) {
  if (full) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(150);
  }
  await page.screenshot({ path: join(OUT, name), fullPage: full });
}

const notes: string[] = [];
const note = (line: string) => { notes.push(line); };

/** The estimator's client-safe export: title,description,price and nothing else. */
const CSV = [
  'title,description,price',
  'Demolition and debris haul-off,Strip the hall bath to studs and subfloor,4800.00',
  'Relocate shower drain and supply,New drain and PEX runs for the enlarged shower,3250.00',
  'Heated floor upgrade,Ditra Heat mat under the porcelain tile,2900.50',
  'Vanity - double sink,72in walnut vanity with quartz top,3400.00',
  'Frameless glass shower door,Low-iron frameless panel and door,2150.00',
  'Matte black faucet package,Widespread lav faucets and shower trim,900.00',
].join('\n');

interface Row {
  id: string; client_name: string; client_email: string | null; title: string;
  status: 'draft' | 'sent' | 'revoked'; token: string;
  line_count: number | null; submission_count: number | null;
  latest_total_cents: number | null; updated_at: string;
}

/**
 * Fixture timestamps RELATIVE to the run, because the draft link window is
 * relative to now.
 *
 * A hard-coded date ages: a draft seeded at a fixed instant renders the
 * link-expired hint from the day after these captures were written, which grows
 * an extra line on the row and moves every identity-column measurement written
 * to responsive-measurements.txt - and changes the screenshots a reviewer is
 * comparing against, for a reason that has nothing to do with what changed.
 */
const agoIso = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

const seed = (): Row[] => ([
  {
    id: '11111111-1111-1111-1111-111111111111', client_name: 'Rachel Morales',
    client_email: 'rachel@example.com', title: 'Your primary bath remodel', status: 'sent',
    token: 'a'.repeat(43), line_count: 9, submission_count: 2, latest_total_cents: 2841500,
    updated_at: agoIso(26),
  },
  {
    id: '33333333-3333-3333-3333-333333333333', client_name: 'Yusuf Adeyemi',
    client_email: 'yusuf@example.com', title: 'Primary suite addition', status: 'revoked',
    token: 'c'.repeat(43), line_count: 14, submission_count: 1, latest_total_cents: 8620000,
    updated_at: agoIso(8 * 24),
  },
]);

const NEW_ID = '44444444-4444-4444-4444-000000000002';

/** A stateful stand-in for the roster + lifecycle API. */
function mountApi(page: Page, store: { rows: Row[]; posts: unknown[] }) {
  return page.route('**/api/admin/proposals**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const idMatch = url.pathname.match(/proposals\/([0-9a-f-]+)$/i);

    if (req.method() === 'GET') {
      const term = (url.searchParams.get('search') || '').toLowerCase();
      const hits = store.rows.filter((p) => !term
        || [p.client_name, p.client_email || '', p.title].some((f) => f.toLowerCase().includes(term)));
      await route.fulfill({
        json: { proposals: hits, counts_available: true, total: hits.length, truncated: false },
      });
      return;
    }

    const body = req.postDataJSON();
    if (!idMatch) {
      store.posts.push({ endpoint: 'POST /api/admin/proposals', body });
      store.rows.unshift({
        id: NEW_ID, client_name: body.client_name, client_email: body.client_email,
        title: body.title, status: 'draft', token: 'd'.repeat(43),
        line_count: body.lines.length, submission_count: 0, latest_total_cents: null,
        updated_at: agoIso(0),
      });
      await route.fulfill({ json: { ok: true, id: NEW_ID, token: 'd'.repeat(43) } });
      return;
    }

    const target = store.rows.find((p) => p.id === idMatch[1])!;
    store.posts.push({ endpoint: `POST /api/admin/proposals/${target.id}`, body });
    // The server-side rule the roster mirrors: a revoked link is never repointed.
    if (body.action === 'reimport' && target.status === 'revoked') {
      await route.fulfill({
        status: 409,
        json: { error: 'This proposal is revoked - restore it to draft before replacing its lines.' },
      });
      return;
    }
    if (body.action === 'revoke') target.status = 'revoked';
    if (body.action === 'restore') target.status = 'draft';
    if (body.action === 'reimport') target.line_count = body.lines.length;
    await route.fulfill({ json: { ok: true, status: target.status } });
  });
}

async function signIn(context: BrowserContext, baseURL: string) {
  const session = {
    access_token: 'stub-access-token', refresh_token: 'stub-refresh-token',
    token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', role: 'authenticated' },
  };
  await context.addCookies([{
    name: 'sb-127-auth-token',
    value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'),
    url: baseURL,
  }]);
}

/** Paste the way a human does, so onPaste is what fires. */
async function pasteCsv(page: Page, text: string) {
  // The importer is collapsed behind one click since round 9 - open it the way
  // an admin does when the box is not already on screen.
  const opener = page.getByTestId('open-importer');
  if (await opener.isVisible()) await opener.click();
  await page.getByTestId('csv-paste').click();
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+A`);
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
  await page.keyboard.press(`${mod}+V`);
}

const nameBundle = async (row: ReturnType<Page['getByTestId']>, name: string) => {
  await row.getByLabel('Bundle name').fill(name);
  await row.getByLabel('Bundle name').blur();
};

/**
 * The surface an admin actually reaches: the dashboard shell at /vaca-mgmt,
 * opened through its Customers -> Proposals entry.
 *
 * Capture E uses this rather than the bare /vaca-mgmt/proposals route for the
 * same reason the browser suite's geometry tests do - the bare route has no
 * shell at all, while the dashboard spends 64px on the sidebar rail before the
 * container and card padding. A row photographed on the bare route is ~150px
 * wider at 768px than the one the owner reviewed.
 */
async function openProposalsTab(page: Page, context: BrowserContext, baseURL: string) {
  await signIn(context, baseURL);
  await page.goto('/vaca-mgmt');
  await expect(page.getByText('Content Management')).toBeVisible();
  // The rail is collapsed to icons and opens on hover; there is no other way
  // to reach a leaf entry.
  await page.mouse.move(30, 400);
  await page.getByRole('button', { name: 'Customers' }).click();
  await page.getByRole('button', { name: 'Proposals' }).click();
  await expect(page.getByTestId('proposals-admin')).toBeVisible();
  // Back off the rail so it collapses to the 64px it occupies in use, and let
  // its 500ms transition finish before anything is measured.
  const size = page.viewportSize()!;
  await page.mouse.move(size.width - 40, size.height - 40);
  await page.waitForTimeout(700);
}

/**
 * Everything the owner's crowding pass asked about, read off the rendered box
 * model rather than off the class list: what sticks out past the viewport, what
 * an ancestor is quietly clipping, which control is under the house 44px, and
 * the three widths the two rounds of review turned on - the bundle name field,
 * the Search/Clear pair, and the client's identity column.
 */
const geometry = (page: Page) => page.evaluate(() => {
  const root = document.querySelector('[data-testid="proposals-admin"]');
  if (!root) throw new Error('the proposals page is not on screen');
  const label = (el: Element) => {
    const testid = (el as HTMLElement).dataset?.testid;
    if (testid) return `[${testid}]`;
    const first = (el.className || '').toString().trim().split(/\s+/)[0];
    return `${el.tagName.toLowerCase()}${first ? `.${first}` : ''}`;
  };
  const box = (sel: string) => {
    const el = root.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { width: Math.round(r.width), height: Math.round(r.height), top: Math.round(r.top) };
  };

  const viewport = document.documentElement.clientWidth;
  let widest = { what: '', right: 0 };
  root.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    if (r.right > widest.right) widest = { what: label(el), right: Math.round(r.right) };
  });

  // An `overflow-x: hidden` box still reports the width it is hiding, which is
  // the only place an overrun is observable on this shell: globals.css clips
  // html and body, so the document can never grow a scrolling area to measure.
  const clipping: string[] = [];
  for (let el: Element | null = root; el; el = el.parentElement) {
    const overflowX = getComputedStyle(el).overflowX;
    if (!['hidden', 'auto', 'scroll'].includes(overflowX)) continue;
    const over = el.scrollWidth - el.clientWidth;
    if (over > 1) clipping.push(`${label(el)} clips ${Math.round(over)}px of its own content`);
  }

  const undersized: string[] = [];
  root.querySelectorAll('button').forEach((btn) => {
    const r = btn.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    if (r.width < 44 || r.height < 44) {
      const name = (btn.getAttribute('aria-label') || btn.textContent || '?').trim();
      undersized.push(`"${name}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  });

  return {
    viewport,
    widest,
    clipping,
    undersized,
    tick: box('[data-testid="row-select-target"]'),
    // The field, by its accessible name - the first input in a bundle row is
    // the row's tick, and measuring that reports a 20px checkbox as the name.
    bundleName: box('[data-testid="bundle-row"] input[aria-label="Bundle name"]'),
    identity: box('[data-testid="roster-identity"]'),
    // Round 9 folded Search/Clear into the one people-search bar.
    searchBox: box('[data-testid="roster-search"]'),
  };
});

test.beforeAll(() => { mkdirSync(OUT, { recursive: true }); });

test.describe.configure({ mode: 'serial' });

test.describe('Proposal Pod slice 2 - evidence capture', () => {
  test.use({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });

  test('A: the admin screen, end to end', async ({ page, context, baseURL }) => {
    const store = { rows: seed(), posts: [] as unknown[] };
    await signIn(context, baseURL!);
    await mountApi(page, store);
    await page.goto('/vaca-mgmt/proposals');
    await expect(page.getByTestId('proposals-admin')).toBeVisible();
    await expect(page.getByText('Rachel Morales')).toBeVisible();

    // SLICE 3 SHIPPED, so this reads the other way round now. These captures
    // were written while the client page was still dark, when Send was disabled
    // on every row and its title said so; `CLIENT_PAGE_LIVE` was flipped true
    // when slice 3 went live, and the gate that remains is the one that was
    // always there - a row with nobody to mail it to.
    const send = page.getByTestId('send-btn').first();
    await expect(send).toBeEnabled();
    note('Send is live (slice 3). It stays disabled only on a row with no client '
      + `email, whose title then reads:\n  No client email - use Copy link`);
    await shot(page, '01-roster.png');

    // The import preview, straight off the estimator CSV.
    await pasteCsv(page, CSV);
    await expect(page.getByTestId('line-row')).toHaveCount(6);
    // The BADGE, not the row text - every row also carries a "Make optional" button.
    const verdicts = await page.getByTestId('line-row').evaluateAll((rows) => rows.map((r) => {
      const badge = r.querySelector('div.inline-flex')?.textContent ?? '?';
      const title = r.querySelector('[data-testid="line-title"]')?.textContent ?? '';
      return `  ${badge.padEnd(9)} ${title}`;
    }));
    note('Registry verdict on every imported line:\n' + verdicts.join('\n'));
    await shot(page, '02-import-preview.png');

    // The touch path: tick two finish lines, Combine into one admin-named price.
    await page.getByLabel('Select Heated floor upgrade').check();
    await page.getByLabel('Select Frameless glass shower door').check();
    await expect(page.getByTestId('combine-btn')).toContainText('Combine 2 into a bundle');
    await shot(page, '03-two-rows-ticked.png');

    await page.getByTestId('combine-btn').click();
    const bundle = page.getByTestId('bundle-row');
    await expect(bundle).toHaveCount(1);
    await nameBundle(bundle, 'Spa shower package');
    await expect(bundle).toContainText('$5,050.50');
    await expect(bundle).toContainText('client sees names, never member prices');
    note('Bundle: $2,900.50 + $2,150.00 composed into one price of '
      + `${(await bundle.locator('span.tabular-nums').first().textContent())?.trim()}, `
      + 'members listed by title only.');
    await shot(page, '04-bundle-composed.png');

    // An all-optional bundle is the deliberate negotiation posture: ONE
    // all-or-nothing toggle over the whole package, no member-level switches.
    await page.getByLabel('Select Vanity - double sink').check();
    await page.getByLabel('Select Matte black faucet package').check();
    await page.getByTestId('combine-btn').click();
    const finishes = page.getByTestId('bundle-row').filter({ hasText: 'Vanity' });
    await nameBundle(finishes, 'Fixture and vanity package');
    await expect(finishes.getByText('optional', { exact: true })).toBeVisible();
    await expect(finishes).toContainText('$4,300.00');
    note('An all-optional bundle stays optional: one all-or-nothing toggle over '
      + '"Vanity - double sink" + "Matte black faucet package", priced at $4,300.00 as a package.');
    await shot(page, '04b-all-optional-bundle.png');
    await finishes.getByRole('button', { name: /unbundle/i }).click();
    await expect(page.getByTestId('bundle-row')).toHaveCount(1);

    // A bundle holding structural work locks, and asks before it is opened up.
    await page.getByLabel('Select Spa shower package').check();
    await page.getByLabel('Select Demolition and debris haul-off').check();
    await page.getByTestId('combine-btn').click();
    const mixed = page.getByTestId('bundle-row');
    await nameBundle(mixed, 'Tear-out and spa shower');
    await expect(mixed.getByText('locked', { exact: true })).toBeVisible();
    let asked = '';
    page.once('dialog', (d) => { asked = d.message(); d.dismiss(); });
    await mixed.getByRole('button', { name: /make .* optional/i }).click();
    note(`Making a locked bundle optional asks first:\n---\n${asked}\n---`);
    await expect(mixed.getByText('locked', { exact: true })).toBeVisible();
    await shot(page, '05-locked-bundle.png');

    // Unbundle gives every member back its own verdict, and its description.
    await mixed.getByRole('button', { name: /unbundle/i }).click();
    await expect(page.getByTestId('bundle-row')).toHaveCount(0);
    await expect(page.getByTestId('line-row')).toHaveCount(6);
    await expect(page.getByTestId('line-row').filter({ hasText: 'Demolition and debris haul-off' })
      .getByText('locked', { exact: true })).toBeVisible();
    await expect(page.getByTestId('preview')).toContainText('Strip the hall bath to studs and subfloor');
    note('Unbundle restored all three members: the demolition came back locked, with its CSV description.');
    await shot(page, '06-unbundled.png');

    // Re-compose the finish package and create the proposal.
    await page.getByLabel('Select Heated floor upgrade').check();
    await page.getByLabel('Select Frameless glass shower door').check();
    await page.getByTestId('combine-btn').click();
    await nameBundle(page.getByTestId('bundle-row'), 'Spa shower package');
    await page.getByTestId('client-name').fill('Chelsea Whitaker');
    await page.getByTestId('client-email').fill('chelsea@example.com');
    await page.getByTestId('proposal-title').fill('Your hall bath remodel');
    await shot(page, '07-ready-to-create.png');

    await page.getByTestId('create-btn').click();
    await expect(page.getByText('Proposal created (draft)', { exact: true })).toBeVisible();
    await expect(page.getByText('Chelsea Whitaker')).toBeVisible();
    await shot(page, '08-created.png');
    writeFileSync(join(OUT, 'create-payload.json'),
      JSON.stringify(store.posts.find((p) => (p as { endpoint: string }).endpoint.endsWith('/proposals')), null, 2));

    // Revoke - the D3 kill switch - and the door back out of it.
    const row = page.getByTestId(`proposal-${NEW_ID}`);
    page.once('dialog', (d) => { note(`Revoke asks:\n---\n${d.message()}\n---`); d.accept(); });
    await row.getByRole('button', { name: /^revoke$/i }).click();
    await expect(page.getByText('Revoked', { exact: true })).toBeVisible();
    await expect(row.getByTestId('restore-btn')).toBeVisible();
    await expect(row.getByTestId('reimport-btn')).toBeDisabled();
    note('On a revoked row Re-import is disabled - "'
      + await row.getByTestId('reimport-btn').getAttribute('title') + '"');
    await shot(page, '09-revoked.png');

    page.once('dialog', (d) => { note(`Restore asks:\n---\n${d.message()}\n---`); d.accept(); });
    await row.getByTestId('restore-btn').click();
    await expect(page.getByText('Restored to draft', { exact: true })).toBeVisible();
    await shot(page, '10-restored-to-draft.png');

    // Re-import: same link, corrected lines.
    await row.getByTestId('reimport-btn').click();
    await expect(page.getByTestId('reimport-armed')).toContainText('Chelsea Whitaker');
    await pasteCsv(page, CSV.replace('4800.00', '5100.00'));
    await expect(page.getByTestId('line-row')).toHaveCount(6);
    await shot(page, '11-reimport-armed.png');
    await page.getByTestId('create-btn').click();
    await expect(page.getByText('Proposal updated', { exact: true })).toBeVisible();
    await shot(page, '12-reimport-done.png');

    writeFileSync(join(OUT, 'api-calls.json'), JSON.stringify(store.posts, null, 2));
    writeFileSync(join(OUT, 'walkthrough-notes.txt'), notes.join('\n\n') + '\n');
  });

  test('B: the same flow at 390px', async ({ page, context, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const store = { rows: seed(), posts: [] as unknown[] };
    await signIn(context, baseURL!);
    await mountApi(page, store);
    await page.goto('/vaca-mgmt/proposals');
    await expect(page.getByTestId('proposals-admin')).toBeVisible();
    await shot(page, '20-mobile-roster.png');

    await pasteCsv(page, CSV);
    await expect(page.getByTestId('line-row')).toHaveCount(6);
    await page.getByLabel('Select Heated floor upgrade').check();
    await page.getByLabel('Select Frameless glass shower door').check();
    await page.getByTestId('combine-btn').click();
    await expect(page.getByTestId('bundle-row')).toHaveCount(1);
    await nameBundle(page.getByTestId('bundle-row'), 'Spa shower package');
    await shot(page, '21-mobile-bundle.png');

    const tick = (await page.getByTestId('row-select-target').first().boundingBox())!;
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    // How much of each line's name actually survives at this width.
    const titles = await page.getByTestId('line-row').evaluateAll((els) => els.map((el) => {
      const span = el.querySelector('[data-testid="line-title"]') as HTMLElement | null;
      // Loudly, not as an "n/a" row: a capture that cannot find the name is the
      // one thing this evidence is for, so it must not pass as a green run.
      if (!span) throw new Error('line-row carries no [data-testid="line-title"] to measure');
      // The name clamps to two lines now, so what gets cut is height, not width.
      return `  ${String(Math.round(span.getBoundingClientRect().width)).padStart(4)}px `
        + `${span.scrollHeight > span.clientHeight + 1 ? 'CLIPPED' : 'full   '} `
        + `"${(span.textContent || '').trim()}"`;
    }));
    appendFileSync(join(OUT, 'walkthrough-notes.txt'),
      `\nAt 390px: the row tick target measures ${tick.width}x${tick.height}px `
      + `(house minimum 44), horizontal overflow ${overflow}px.\n`
      + `Line-name width per row at 390px:\n${titles.join('\n')}\n`);
    expect(tick.width).toBeGreaterThanOrEqual(44);
    expect(tick.height).toBeGreaterThanOrEqual(44);
    expect(overflow).toBe(0);
  });

  /**
   * The dashboard's own sidebar: the new Customers -> Proposals entry, and the
   * Crew tab beside it - which had no TabsContent since PR #77 and rendered a
   * blank panel until this change wired it like its neighbours.
   */
  test('D: the sidebar entry and the Crew tab that used to render blank', async ({ page, context, baseURL }) => {
    await signIn(context, baseURL!);
    await page.route('**/api/admin/proposals**', (route) =>
      route.fulfill({ json: { proposals: [], counts_available: true, total: 0, truncated: false } }));
    await page.goto('/vaca-mgmt');
    await expect(page.getByText('Content Management')).toBeVisible();
    // The rail expands on hover; there is no other way to reach the leaves.
    const openSidebar = () => page.mouse.move(30, 400);

    await openSidebar();
    await page.getByRole('button', { name: 'Customers' }).click();
    await expect(page.getByRole('button', { name: 'Proposals' })).toBeVisible();
    await shot(page, '50-sidebar-customers.png', false);

    await page.getByRole('button', { name: 'Proposals' }).click();
    await expect(page.getByTestId('proposals-admin')).toBeVisible();
    await shot(page, '51-tab-proposals.png', false);

    await openSidebar();
    await page.getByRole('button', { name: 'Crew', exact: true }).click();
    await page.mouse.move(900, 500);
    await expect(page.getByRole('heading', { name: 'Crew', exact: true })).toBeVisible();
    await expect(page.getByText('On the list')).toBeVisible();
    await shot(page, '52-tab-crew.png', false);
  });

  test('C: the delivery email, rendered from the builder', async ({ page }) => {
    const withSlot = buildProposalDeliveryEmail({
      clientName: 'Chelsea Whitaker',
      proposalTitle: 'Your hall bath remodel',
      proposalUrl: 'https://www.lavacagc.com/proposal/' + 'd'.repeat(43),
      bookingUrl: 'https://cal.com/lavacagc/walkthrough',
    });
    const without = buildProposalDeliveryEmail({
      clientName: 'Chelsea Whitaker',
      proposalTitle: 'Your hall bath remodel',
      proposalUrl: 'https://www.lavacagc.com/proposal/' + 'd'.repeat(43),
      bookingUrl: null,
    });

    // The brand logo is absolute on the production host by design; serve it
    // from this checkout so the capture shows what the recipient sees.
    await page.route('https://www.lavacagc.com/**', (route) =>
      route.fulfill({ path: join(process.cwd(), 'public', new URL(route.request().url()).pathname) })
        .catch(() => route.abort()));

    for (const [name, mail] of [['40-email-with-booking', withSlot], ['41-email-no-booking', without]] as const) {
      writeFileSync(join(OUT, `${name}.html`), mail.html);
      await page.setViewportSize({ width: 700, height: 1100 });
      await page.setContent(mail.html, { waitUntil: 'load' });
      await shot(page, `${name}.png`);
    }
    writeFileSync(join(OUT, '42-email.txt'),
      `From: ${PROPOSAL_FROM}\nTo: chelsea@example.com\nSubject: ${withSlot.subject}\n`
      + `Category: proposal_delivery\n\n${withSlot.text}\n`);
    expect(withSlot.html).toContain('cal.com/lavacagc/walkthrough');
    expect(without.html).not.toContain('Book a time');
  });

  /**
   * E. The two rounds of the owner's design review, photographed on the shell
   * they were reviewed on, at the widths they were reviewed at.
   *
   * One composed screen - a roster carrying both row shapes, a search with its
   * Clear showing, and a preview holding a bundle beside plain lines - resized
   * through 320 / 360 / 768 / 1024 / 1440. Round one is the phone shape (icon
   * actions, Send on its own full-width button, tick and name on one line with
   * the badge top right); round two is the single md line and the crowding pass
   * (the bundle name field on its own line below sm, Search and Clear sharing
   * one). Each width is measured as well as shot, so the picture is not the
   * only thing claiming the row fits.
   */
  test('E: the reviewed layout at 320, 360, 768, 1024 and 1440', async ({ page, context, baseURL }) => {
    const store = { rows: seed(), posts: [] as unknown[] };
    await mountApi(page, store);
    await page.setViewportSize({ width: 1024, height: 1000 });
    await openProposalsTab(page, context, baseURL!);

    // A preview with both shapes in it: a bundle the admin named, and the plain
    // lines around it.
    await pasteCsv(page, CSV);
    await expect(page.getByTestId('line-row')).toHaveCount(6);
    await page.getByLabel('Select Heated floor upgrade').check();
    await page.getByLabel('Select Frameless glass shower door').check();
    await page.getByTestId('combine-btn').click();
    await expect(page.getByTestId('bundle-row')).toHaveCount(1);
    await nameBundle(page.getByTestId('bundle-row'), 'Spa shower package');

    // Both rows are on screen already - the fresh page lists the most recent
    // proposals, and the seed holds two.
    await expect(page.getByText('Rachel Morales')).toBeVisible();
    await expect(page.getByText('Yusuf Adeyemi')).toBeVisible();

    const lines: string[] = [];
    for (const width of [320, 360, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForTimeout(400);
      await shot(page, `60-shell-${width}.png`);
      const seen = await geometry(page);

      lines.push([
        `${width}px (${width >= 1024 ? 'desktop, labels open on hover' : width >= 768 ? 'tablet, one line per row' : 'phone, stacked'})`,
        `  widest element ends at ${seen.widest.right}px of a ${seen.viewport}px viewport - ${seen.widest.what}`,
        `  ancestors clipping content: ${seen.clipping.length ? seen.clipping.join('; ') : 'none'}`,
        `  controls under the house 44px: ${seen.undersized.length ? seen.undersized.join('; ') : 'none'}`,
        `  row tick target ${seen.tick!.width}x${seen.tick!.height}px`,
        `  bundle name field ${seen.bundleName!.width}px wide`,
        `  client identity column ${seen.identity!.width}px wide`,
        `  people-search bar ${seen.searchBox!.width}px wide`,
      ].join('\n'));

      expect(seen.widest.right, `${width}px: nothing is wider than the viewport`)
        .toBeLessThanOrEqual(seen.viewport + 1);
      expect(seen.clipping, `${width}px: no ancestor is hiding an overrun`).toEqual([]);
      expect(seen.undersized, `${width}px: every control clears the house 44px`).toEqual([]);
      expect(seen.tick!.width, `${width}px: the tick target`).toBeGreaterThanOrEqual(44);
      expect(seen.tick!.height, `${width}px: the tick target`).toBeGreaterThanOrEqual(44);
      expect(seen.searchBox!.height, `${width}px: the search bar keeps the house 44px`).toBeGreaterThanOrEqual(44);
    }

    // The nice-to-have the owner asked for: on a desktop the icon opens its
    // label on hover, and it opens into room that was already reserved, so the
    // client's name beside it does not move.
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.waitForTimeout(400);
    const row = page.getByTestId(`proposal-${seed()[0].id}`);
    await row.scrollIntoViewIfNeeded();
    // Park the cursor away from BOTH the actions and the sidebar rail: the rail
    // is fixed and expands on hover, so resting at 0,0 photographs the row with
    // the open rail lying over its left end.
    await page.mouse.move(1240, 960);
    await page.waitForTimeout(700);
    const atRest = await geometry(page);
    await row.screenshot({ path: join(OUT, '61-desktop-icons-at-rest.png') });

    const copy = row.getByRole('button', { name: 'Copy link', exact: true });
    const shut = await copy.evaluate((el) => Math.round(el.getBoundingClientRect().width));
    await copy.hover();
    await page.waitForTimeout(300);
    const open = await copy.evaluate((el) => Math.round(el.getBoundingClientRect().width));
    await row.screenshot({ path: join(OUT, '62-desktop-icon-hover-label.png') });
    const hovered = await geometry(page);

    lines.push([
      '1280px, hover:',
      `  "Copy link" grows ${shut}px -> ${open}px when the cursor lands on it`,
      `  the client identity column beside it: ${atRest.identity!.width}px at rest, `
      + `${hovered.identity!.width}px while the label is open`,
    ].join('\n'));
    writeFileSync(join(OUT, 'responsive-measurements.txt'), lines.join('\n\n') + '\n');

    expect(open, 'the hover label opens on a desktop').toBeGreaterThan(shut);
    expect(hovered.identity!.width, 'and it opens into reserved room, moving nothing')
      .toBe(atRest.identity!.width);
  });
});
