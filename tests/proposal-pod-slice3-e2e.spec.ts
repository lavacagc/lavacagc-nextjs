import { test, expect, type Locator, type Page } from '@playwright/test';
import { PROPOSAL_CATEGORIES } from '../src/lib/proposals/categories';

/**
 * The client proposal page, end to end, in a real browser.
 *
 * /proposal/[token] is a SERVER component, so `page.route` cannot fake its
 * data the way the slice-2 admin specs fake the roster's fetch: the read
 * happens inside the Next process. This drives the real page, the real submit
 * route and the real owner alert against a Next server whose Supabase and
 * Telegram are both `tests/helpers/intake-stub.mjs` - the same generic
 * in-memory PostgREST the lead-intake E2E uses. So the rows this asserts are
 * the rows the product would really have written, and the Telegram text is the
 * text the owner's phone would really show.
 *
 * It owns every AC that only exists once React is mounted: the switches, the
 * running total, the zero-network guarantee (WEB-023), the member-price
 * absence in rendered HTML (WEB-025), the chrome suppression, and the 390px
 * geometry the owner's mobile note pinned in slice 2.
 *
 * OFF BY DEFAULT, like the other E2E suites: it needs a server started against
 * the stub, which the no-mistakes gate has no way to provide.
 *
 * Run recipe:
 *
 *   node tests/helpers/intake-stub.mjs &
 *
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9416 \
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb-stub-publishable \
 *   SUPABASE_SECRET_KEY=sb-stub-secret \
 *   TELEGRAM_BOT_TOKEN=stub-bot-token TELEGRAM_CHAT_ID=999 \
 *   LEAD_NOTIFICATION_EMAIL=owner@example.com \
 *   RESEND_API_KEY= \
 *   NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3100 \
 *   INTAKE_STUB_URL=http://127.0.0.1:9416 \
 *   NODE_OPTIONS='--require ./tests/helpers/outbound-fetch.cjs' \
 *   npx next dev -p 3100
 *
 *   PROPOSAL_E2E=1 TEST_URL=http://127.0.0.1:3100 \
 *   npx playwright test tests/proposal-pod-slice3-e2e.spec.ts --project=chromium
 *
 * RESEND_API_KEY is deliberately BLANK, not unset-and-forgotten: the alert path
 * runs for real and the email is skipped rather than delivered, so a full local
 * run cannot mail anybody.
 */

const RUN = process.env.PROPOSAL_E2E === '1';
const STUB = process.env.INTAKE_STUB_URL || 'http://127.0.0.1:9416';

test.skip(!RUN, 'Set PROPOSAL_E2E=1 and follow the run recipe in this file.');
test.describe.configure({ mode: 'serial' });

const PROPOSAL_ID = '44444444-4444-4444-4444-444444444444';
const TOKEN = 'a'.repeat(43);
const REVOKED_TOKEN = 'b'.repeat(43);
const STALE_DRAFT_TOKEN = 'c'.repeat(43);
const ALL_OPTIONAL_TOKEN = 'd'.repeat(43);
const ALL_OPTIONAL_ID = '66666666-6666-4666-8666-666666666666';

const HOUR_MS = 60 * 60 * 1000;
/**
 * Seeded timestamps are RELATIVE to the run, because the draft window is
 * relative to now (DRAFT_LINK_LIFETIME_MS): a hard-coded `updated_at` would
 * turn every draft in this fixture into an expired one the day after it was
 * written, and the failure would look like a regression in the page.
 */
const agoIso = (ms: number) => new Date(Date.now() - ms).toISOString();

const L = {
  demo: '11111111-1111-4111-8111-111111111111',
  plumbing: '22222222-2222-4222-8222-222222222222',
  waterproof: '33333333-3333-4333-8333-333333333333',
  tile: '44444444-4444-4444-8444-444444444444',
  fixtures: '55555555-5555-4555-8555-555555555555',
};

/** Two plain locked lines, a LOCKED bundle, and two optional ones (one bundle). */
const LINES = [
  {
    id: L.demo, position: 0, title: 'Demolition and debris removal',
    description: 'Strip to studs, protect adjacent rooms, haul and dump fees.',
    price_cents: 340000, optional: false, category: 'demolition', bundle_members: null,
  },
  {
    id: L.plumbing, position: 1, title: 'Rough plumbing relocation',
    description: 'Move supply and waste for the new vanity and shower valve.',
    price_cents: 480000, optional: false, category: 'plumbing_rough', bundle_members: null,
  },
  {
    id: L.waterproof, position: 2, title: 'Wet-wall waterproofing package',
    description: 'Everything behind the tile that keeps water out of the framing.',
    price_cents: 260000, optional: false, category: 'prep',
    bundle_members: [
      { title: 'Cement board substrate', price_cents: 90000 },
      { title: 'Liquid waterproof membrane', price_cents: 110000 },
      { title: 'Shower pan pre-slope and drain', price_cents: 60000 },
    ],
  },
  {
    id: L.tile, position: 3, title: 'Porcelain floor and wall tile',
    description: 'Large-format porcelain, herringbone shower floor.',
    price_cents: 680000, optional: true, category: 'tile', bundle_members: null,
  },
  {
    id: L.fixtures, position: 4, title: 'Designer fixture package',
    description: 'The finish set we specified together, priced as one package.',
    price_cents: 430000, optional: true, category: 'fixtures',
    bundle_members: [
      { title: 'Rain shower head and thermostatic valve', price_cents: 250000 },
      { title: 'Freestanding tub filler', price_cents: 180000 },
    ],
  },
];

/** A finish-only estimate: no locked line anywhere in it. */
const ALL_OPTIONAL_LINES = [
  {
    id: '66666666-6666-4666-8666-666666666661', position: 0, title: 'Interior repaint',
    description: 'Walls, trim and ceilings throughout.',
    price_cents: 240000, optional: true, category: 'painting', bundle_members: null,
  },
  {
    id: '66666666-6666-4666-8666-666666666662', position: 1, title: 'Cabinet hardware swap',
    description: 'Pulls and knobs, supplied and fitted.',
    price_cents: 60000, optional: true, category: 'hardware', bundle_members: null,
  },
];

const LOCKED_TOTAL = 340000 + 480000 + 260000;
const FULL_TOTAL = LOCKED_TOTAL + 680000 + 430000;
const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** Every member price, which must appear nowhere the client can reach. */
const MEMBER_PRICES = LINES
  .flatMap((l) => l.bundle_members ?? [])
  .map((m) => m.price_cents);

interface StubState {
  telegram: { text: string }[];
  tables: Record<string, Record<string, unknown>[]>;
}

const state = async (): Promise<StubState> =>
  (await (await fetch(`${STUB}/__state`)).json()) as StubState;

async function seed(table: string, rows: Record<string, unknown>[]) {
  const res = await fetch(`${STUB}/rest/v1/${table}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rows),
  });
  expect(res.ok, `seeding ${table}`).toBe(true);
}

test.beforeEach(async () => {
  await fetch(`${STUB}/__reset`, { method: 'POST' });
  await seed('proposals', [
    {
      id: PROPOSAL_ID, token: TOKEN, client_name: 'Sarah Whitfield',
      client_email: 'sarah@example.com', title: 'Primary bath remodel',
      status: 'draft', lead_id: null, sent_at: null, revoked_at: null,
      created_at: agoIso(48 * HOUR_MS), updated_at: agoIso(HOUR_MS),
    },
    {
      id: '55555555-5555-4555-8555-555555555556', token: REVOKED_TOKEN,
      client_name: 'Yusuf Adeyemi', client_email: 'yusuf@example.com',
      title: 'Primary suite addition', status: 'revoked', lead_id: null,
      sent_at: '2026-08-01T00:00:00Z', revoked_at: '2026-08-02T00:00:00Z',
      created_at: agoIso(96 * HOUR_MS), updated_at: agoIso(48 * HOUR_MS),
    },
    // A draft nobody has touched for more than a day: its link has run out.
    {
      id: '77777777-7777-4777-8777-777777777777', token: STALE_DRAFT_TOKEN,
      client_name: 'Marta Oyelaran', client_email: 'marta@example.com',
      title: 'Kitchen refresh', status: 'draft', lead_id: null,
      sent_at: null, revoked_at: null,
      created_at: agoIso(72 * HOUR_MS), updated_at: agoIso(25 * HOUR_MS),
    },
    // Finish-only work: every line is the client's to decline, so this is the
    // one shape where a client can end up with nothing selected.
    {
      id: ALL_OPTIONAL_ID, token: ALL_OPTIONAL_TOKEN,
      client_name: 'Dan Whitfield', client_email: 'dan@example.com',
      title: 'Finish package', status: 'sent', lead_id: null,
      sent_at: agoIso(2 * HOUR_MS), revoked_at: null,
      created_at: agoIso(4 * HOUR_MS), updated_at: agoIso(2 * HOUR_MS),
    },
  ]);
  await seed('proposal_lines', [
    ...LINES.map((l) => ({ ...l, proposal_id: PROPOSAL_ID })),
    ...ALL_OPTIONAL_LINES.map((l) => ({ ...l, proposal_id: ALL_OPTIONAL_ID })),
  ]);
});

/**
 * The fixture's categories are REAL registry slugs.
 *
 * They were not, at first, and the page rendered the unknown-category house on
 * four rows out of five - a screenshot that looked like broken icon wiring and
 * was a lying fixture. Asserted rather than merely corrected, because the next
 * person to add a line here will reach for the word the trade uses ('plumbing')
 * rather than the key the registry assigns it ('plumbing_rough').
 */
test('fixture integrity: every seeded category is a registry key', () => {
  const known = new Set(PROPOSAL_CATEGORIES.map((c) => c.key));
  for (const line of [...LINES, ...ALL_OPTIONAL_LINES]) {
    expect(known.has(line.category), `'${line.category}' is not a registry key`).toBe(true);
  }
});

const totalText = (page: Page) => page.getByTestId('proposal-total');
const switches = (page: Page) => page.getByRole('checkbox');

/** What a tap at the middle of this control actually hits. */
async function tapLandsOn(page: Page, target: Locator): Promise<string> {
  const box = await target.boundingBox();
  if (!box) return 'nothing - the control is not laid out';
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const { height, width } = page.viewportSize()!;
  if (point.y < 0 || point.y > height || point.x < 0 || point.x > width) {
    return 'nothing - the control is off screen';
  }
  return target.evaluate((el, p) => {
    const hit = document.elementFromPoint(p.x, p.y);
    if (!hit) return 'nothing - the control is off screen';
    return el.contains(hit) ? 'the control itself' : hit.outerHTML.slice(0, 140);
  }, point);
}

test('AC-S3-1e: an unknown token and a revoked one get the same dead end, word for word', async ({ page }) => {
  await page.goto(`/proposal/${'z'.repeat(43)}`);
  await expect(page.getByRole('heading')).toHaveText("This link isn't valid");
  const unknown = await page.locator('main').innerText();

  await page.goto(`/proposal/${REVOKED_TOKEN}`);
  await expect(page.getByRole('heading')).toHaveText("This link isn't valid");
  expect(await page.locator('main').innerText()).toBe(unknown);

  // A malformed token is the same answer, and never reaches the database.
  await page.goto('/proposal/not-a-token');
  await expect(page.getByRole('heading')).toHaveText("This link isn't valid");
});

test('AC-S3-18e: a draft past its 24-hour window is the same dead end, and takes no answer', async ({ page }) => {
  await page.goto(`/proposal/${'z'.repeat(43)}`);
  const unknown = await page.locator('main').innerText();

  // A draft whose updated_at is 25 hours old. Nothing on this page says it was
  // ever a proposal, let alone whose.
  await page.goto(`/proposal/${STALE_DRAFT_TOKEN}`);
  await expect(page.getByRole('heading')).toHaveText("This link isn't valid");
  expect(await page.locator('main').innerText()).toBe(unknown);
  expect(await page.content()).not.toContain('Marta');

  // The submit door is shut on it too, with the same sentence a token that was
  // never ours gets, and no row is written.
  const res = await page.request.post(`/api/proposal/${STALE_DRAFT_TOKEN}/submit`, {
    data: { included_line_ids: [L.demo], touched_line_ids: [] },
  });
  expect(res.status()).toBe(404);
  const unknownRes = await page.request.post(`/api/proposal/${'z'.repeat(43)}/submit`, {
    data: { included_line_ids: [L.demo], touched_line_ids: [] },
  });
  expect((await res.json()).error).toBe((await unknownRes.json()).error);
  expect(((await state()).tables.proposal_submissions ?? []).length).toBe(0);

  // The draft an admin is actually working on is untouched by any of this.
  await page.goto(`/proposal/${TOKEN}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Primary bath remodel');
});

test('AC-S3-20e: turning every line of a finish-only proposal off disables Send and says why', async ({ page }) => {
  await page.goto(`/proposal/${ALL_OPTIONAL_TOKEN}`);
  const send = page.getByRole('button', { name: /Send this back to Alex/ });
  await expect(send).toBeEnabled();

  // Both switches off: there is nothing left to send, and the page says so
  // instead of offering a button whose only possible answer is a refusal.
  for (const box of await switches(page).all()) await box.click();
  await expect(totalText(page)).toHaveText(usd(0));
  await expect(send).toBeDisabled();
  await expect(page.getByText(/Turn at least one choice on/)).toBeVisible();
  await expect(page.getByText('(201) 212-4917')).toBeVisible();
  // And a proposal with no locked work does not claim $0.00 of structural work.
  expect(await page.locator('main').innerText()).not.toContain('$0.00 of structural work');

  // One choice back on and the door opens again.
  await switches(page).first().click();
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sent to Alex');
  expect(((await state()).tables.proposal_submissions ?? []).length).toBe(1);
});

test('AC-S3-3e + AC-S3-8e: locked lines have nothing to flip, and only the all-optional bundle does', async ({ page }) => {
  await page.goto(`/proposal/${TOKEN}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Primary bath remodel');

  // Three locked lines, two optional ones: exactly two switches on the page.
  await expect(switches(page)).toHaveCount(2);
  await expect(page.getByLabel(/Include Porcelain floor and wall tile/)).toBeVisible();
  await expect(page.getByLabel(/Include Designer fixture package/)).toBeVisible();

  // The locked BUNDLE renders its members and still carries no control: any
  // locked member locks the package.
  await expect(page.getByText('Wet-wall waterproofing package')).toBeVisible();
  await expect(page.getByText('Cement board substrate')).toBeVisible();
  const lockedRow = page.locator('div', { hasText: 'Wet-wall waterproofing package' }).last();
  expect(await lockedRow.locator('input, button').count()).toBe(0);
});

test('AC-S3-4e: a toggle issues ZERO network requests and moves the total to the cent', async ({ page }) => {
  await page.goto(`/proposal/${TOKEN}`, { waitUntil: 'networkidle' });
  await expect(totalText(page)).toHaveText(usd(FULL_TOTAL));

  // Recording starts once the page has SETTLED, so what this counts is what the
  // toggles cause and not what the load was still finishing. Anything the page
  // issues after that point is the switches' doing.
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));

  const tile = page.getByLabel(/Include Porcelain floor and wall tile/);
  const fixtures = page.getByLabel(/Include Designer fixture package/);

  await tile.click();
  await expect(totalText(page)).toHaveText(usd(FULL_TOTAL - 680000));
  await fixtures.click();
  await expect(totalText(page)).toHaveText(usd(LOCKED_TOTAL));
  // AC-S3-5e: everything off leaves exactly the structural work.
  await expect(page.getByTestId('proposal-chosen-count')).toHaveText('0 of 2 on');

  await tile.click();
  await fixtures.click();
  await expect(totalText(page)).toHaveText(usd(FULL_TOTAL));
  await expect(page.getByTestId('proposal-chosen-count')).toHaveText('2 of 2 on');

  expect(requests, `a toggle must not talk to the server: ${requests.join(', ')}`).toEqual([]);
});

test('AC-S3-7e: no member price reaches the browser, in markup or in props', async ({ page }) => {
  await page.goto(`/proposal/${TOKEN}`);
  const html = await page.content();
  for (const cents of MEMBER_PRICES) {
    // Digit-bounded, because a bare substring search is not a leak test: the
    // waterproofing bundle's OWN price is 260000, which contains the member
    // price 60000, and a plain `toContain` calls that a leak. What must not
    // appear is the number itself.
    const bounded = new RegExp(`(?<![0-9])${cents}(?![0-9])`);
    expect(html, `member price ${cents} must not reach the page`).not.toMatch(bounded);
    expect(html, `member price ${usd(cents)} must not be rendered`).not.toContain(usd(cents));
  }
  // The member TITLES do, which is the whole point of a bundle.
  expect(html).toContain('Rain shower head and thermostatic valve');
  expect(html).toContain('Freestanding tub filler');
  // And the bundle's own single price is what shows.
  await expect(page.getByText(usd(430000)).first()).toBeVisible();
  // Nothing that is not rendered travels either.
  expect(html).not.toContain('sarah@example.com');
});

test('AC-S3-16e: the page carries no marketing chrome, and Send takes its own tap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`/proposal/${TOKEN}`);
  await page.waitForTimeout(1200);

  // The global widgets the root layout mounts on every page.
  await expect(page.getByRole('link', { name: /free estimate/i })).toHaveCount(0);
  await expect(page.getByTestId('newsletter-form')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /dismiss review/i })).toHaveCount(0);

  const send = page.getByRole('button', { name: 'Send this back to Alex' });
  expect(await tapLandsOn(page, send)).toBe('the control itself');
  expect(await page.locator('meta[name="robots"]').getAttribute('content')).toContain('noindex');
});

test('AC-S3-18e: nothing overflows or falls under 44px at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`/proposal/${TOKEN}`);

  // Measured against the page's own clipping container, not the document: the
  // body can be clipped by an ancestor and still report no overflow.
  const overflow = await page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) return 'no main';
    const wide = [...main.querySelectorAll<HTMLElement>('*')]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .map((el) => `${el.tagName}.${el.className}`.slice(0, 90));
    return wide.slice(0, 5).join(' | ');
  });
  expect(overflow, 'no element may extend past the viewport').toBe('');

  for (const control of await page.getByRole('checkbox').all()) {
    // The switch's own 44px target is the label wrapper it sits inside.
    const box = await control.evaluate((el) => {
      const rect = (el.parentElement as HTMLElement).getBoundingClientRect();
      return { w: rect.width, h: rect.height };
    });
    expect(box.h, 'touch target height').toBeGreaterThanOrEqual(44);
    expect(box.w, 'touch target width').toBeGreaterThanOrEqual(44);
  }
  const send = await page.getByRole('button', { name: 'Send this back to Alex' }).boundingBox();
  expect(send!.height).toBeGreaterThanOrEqual(44);
});

test('AC-S3-11e/13e/14e/17e: sending stores the composition, alerts the owner, and offers a re-send', async ({ page }) => {
  await page.goto(`/proposal/${TOKEN}`);

  // Decline the tile, keep the fixture package.
  await page.getByLabel(/Include Porcelain floor and wall tile/).click();
  const expected = FULL_TOTAL - 680000;
  await expect(totalText(page)).toHaveText(usd(expected));

  await page.getByRole('button', { name: 'Send this back to Alex' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sent to Alex');
  await expect(page.getByText(usd(expected))).toBeVisible();

  const after = await state();
  const rows = after.tables.proposal_submissions ?? [];
  expect(rows).toHaveLength(1);
  const row = rows[0] as { total_cents: number; included_lines: { id: string; optional: boolean }[]; touched_lines: { id: string }[]; user_agent: string };
  expect(row.total_cents).toBe(expected);
  // The WHOLE composition: three locked lines plus the one optional they kept.
  expect(row.included_lines.map((l) => l.id).sort()).toEqual(
    [L.demo, L.plumbing, L.waterproof, L.fixtures].sort(),
  );
  expect(row.included_lines.filter((l) => !l.optional)).toHaveLength(3);
  // Telemetry recorded the switch they actually weighed up.
  expect(row.touched_lines.map((l) => l.id)).toEqual([L.tile]);
  expect(row.user_agent).toBeTruthy();

  // The owner's phone, in the words it would really show.
  expect(after.telegram).toHaveLength(1);
  expect(after.telegram[0].text).toContain('Proposal accepted');
  expect(after.telegram[0].text).toContain('Sarah Whitfield');
  expect(after.telegram[0].text).toContain(usd(expected));
  // Member prices do not reach the owner alert's itemization either - it prints
  // the bundle as one line, the same way the client agreed to it.
  for (const cents of MEMBER_PRICES) {
    expect(after.telegram[0].text).not.toContain(usd(cents));
  }

  // The limiter charged its OWN bucket, and no other feature's.
  const buckets = (after.tables.rate_limits ?? []).map((r) => String(r.ip_address));
  expect(buckets.some((b) => b.startsWith('proposal-submit:')), buckets.join(',')).toBe(true);
  expect(buckets.some((b) => b.startsWith('hc-access:'))).toBe(false);
  expect(buckets.some((b) => b.startsWith('lead-submit:'))).toBe(false);

  // AC-S3-17e / AC-S3-11e: adjust and send again stores a SECOND row, and the
  // alert says revised rather than announcing a first answer.
  await page.getByRole('button', { name: 'Change something and send again' }).click();
  await page.getByLabel(/Include Porcelain floor and wall tile/).click();
  await expect(totalText(page)).toHaveText(usd(FULL_TOTAL));
  await page.getByRole('button', { name: 'Send this back to Alex' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sent to Alex');

  const second = await state();
  expect(second.tables.proposal_submissions).toHaveLength(2);
  expect(second.telegram).toHaveLength(2);
  expect(second.telegram[1].text).toContain('Proposal revised');
  // The first record is untouched: each submission IS the record of what was
  // agreed at that moment.
  expect((second.tables.proposal_submissions![0] as { total_cents: number }).total_cents).toBe(expected);
});

test('AC-S3-9e: a hand-made payload that drops a locked line is refused, and stores nothing', async ({ page, request }) => {
  await page.goto(`/proposal/${TOKEN}`);
  const res = await request.post(`/api/proposal/${TOKEN}/submit`, {
    data: { included_line_ids: [L.tile, L.fixtures], touched_line_ids: [] },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toContain('not optional');
  expect((await state()).tables.proposal_submissions ?? []).toHaveLength(0);
});
