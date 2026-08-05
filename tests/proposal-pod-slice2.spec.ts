import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { composeBundle, restoreMembers } from '../src/lib/proposals/bundles';
import { CreateProposalSchema, bundleSumError } from '../src/lib/proposals/store';
import { buildProposalDeliveryEmail, PROPOSAL_FROM } from '../src/lib/proposals/deliveryEmail';

/**
 * Proposal Pod - Slice 2 ACs (owner-approved plan of 2026-08-04, incl the
 * mid-review bundle request and the mobile-friendly note).
 *
 * Two halves per the approved AC contract:
 *  - REGRESSION: "as admins, everything we can do now, we can still do after."
 *    AC-R pins the sidebar inventory (adding Proposals removes nothing) and
 *    the untouched admin auth gate. The full Playwright suite at the shipping
 *    commit is the executable other half.
 *  - NEW CAPABILITY: bundling rules, store validation, delivery email, the
 *    schema's bundle constraints, and the page's mobile-first touch path.
 */

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

// ---------- REGRESSION HALF ----------

test('AC-R1: every pre-slice admin sidebar capability is still present', () => {
  const sidebar = read('src/components/admin/AdminSidebar.tsx');
  // The complete inventory as of the approved plan (2026-08-04), verbatim ids.
  const before = [
    'dashboard', 'diagnostics', 'ai',
    'blog', 'pages', 'services', 'service-areas', 'projects', 'listings', 'banners',
    'seo', 'seo-suggestions', 'analytics', 'gmb',
    'leads', 'subscribers', 'home-records', 'follow-ups', 'send-estimate',
    'send-service-quote', 'crew', 'estimate-log', 'emails', 'preferences', 'releases',
  ];
  for (const id of before) {
    expect(sidebar, `sidebar must keep '${id}'`).toContain(`id: '${id}'`);
  }
  // The slice adds exactly one entry.
  expect(sidebar).toContain(`id: 'proposals'`);
});

test('AC-R2: the admin auth gate is unchanged - proposals ride the existing /api/admin prefix', () => {
  const middleware = read('src/middleware.ts');
  // No proposals-specific carve-outs, allowlists, or public exceptions.
  expect(middleware).not.toContain('proposal');
  // The existing gate that covers /api/admin/* and /vaca-mgmt is still there.
  expect(middleware).toContain(`'/vaca-mgmt'`);
  expect(middleware).toContain('/api/admin/');
});

test('AC-R3: the new admin content tab mounts without touching other tabs', () => {
  const content = read('src/components/AdminContent.tsx');
  expect(content).toContain('<TabsContent value="proposals">');
  // Neighbors intact.
  expect(content).toContain('<TabsContent value="home-records">');
  expect(content).toContain('<TabsContent value="preferences">');
});

// ---------- NEW CAPABILITY HALF ----------

test('AC1: a bundle is the members sum, named by the admin, in integer cents', () => {
  const b = composeBundle([
    { title: 'Tile - heated floor upgrade', priceCents: 290050, optional: true, category: 'tile' },
    { title: 'Vanity - double sink', priceCents: 340000, optional: true, category: 'cabinets' },
  ], 'Complete spa bathroom package');
  expect(b).not.toBeNull();
  expect(b!.priceCents).toBe(630050);
  expect(b!.title).toBe('Complete spa bathroom package');
  expect(b!.members.map((m) => m.title)).toEqual([
    'Tile - heated floor upgrade', 'Vanity - double sink',
  ]);
  expect(b!.optional).toBe(true);
});

test('AC2: any locked member locks the bundle - the fail-safe direction', () => {
  const b = composeBundle([
    { title: 'Demolition & prep', priceCents: 480000, optional: false, category: 'demolition' },
    { title: 'Vanity - double sink', priceCents: 340000, optional: true, category: 'cabinets' },
  ]);
  expect(b!.optional).toBe(false);
  // The label follows structure too.
  expect(b!.category).toBe('demolition');
});

test('AC3: bundling a bundle flattens - sums never double-count', () => {
  const inner = composeBundle([
    { title: 'A', priceCents: 100, optional: true, category: 'tile' },
    { title: 'B', priceCents: 200, optional: true, category: 'tile' },
  ])!;
  const outer = composeBundle([
    { title: inner.title, priceCents: inner.priceCents, optional: inner.optional, category: inner.category, members: inner.members },
    { title: 'C', priceCents: 300, optional: true, category: 'fixtures' },
  ])!;
  expect(outer.priceCents).toBe(600);
  expect(outer.members).toHaveLength(3);
});

test('AC4: unbundle restores members re-badged by the registry, fail-safe locked', () => {
  const restored = restoreMembers([
    { title: 'Vanity - double sink', price_cents: 340000 },
    { title: 'Zorble calibration', price_cents: 100 },
  ]);
  expect(restored[0].optional).toBe(true);
  expect(restored[1].optional).toBe(false);
  expect(restored[1].category).toBe('general');
});

test('AC5: a single row cannot be a bundle, and mismatched sums are rejected by name', () => {
  expect(composeBundle([
    { title: 'A', priceCents: 100, optional: true, category: 'tile' },
  ])).toBeNull();
  const err = bundleSumError([{
    title: 'Bad bundle', description: '', price_cents: 500, optional: true, category: 'tile',
    bundle_members: [{ title: 'A', price_cents: 100 }, { title: 'B', price_cents: 200 }],
  }]);
  expect(err).toContain('Bad bundle');
  expect(err).toContain('300');
});

test('AC6: the create schema holds the money and size caps', () => {
  const good = CreateProposalSchema.safeParse({
    client_name: 'Rachel', client_email: 'r@example.com', title: 'Your bathroom remodel',
    lines: [{ title: 'Demo', description: '', price_cents: 480000, optional: false, category: 'demolition' }],
  });
  expect(good.success).toBe(true);
  const fractional = CreateProposalSchema.safeParse({
    client_name: 'R', title: 'T',
    lines: [{ title: 'X', description: '', price_cents: 19.99, optional: false, category: 'general' }],
  });
  expect(fractional.success).toBe(false);
  const negative = CreateProposalSchema.safeParse({
    client_name: 'R', title: 'T',
    lines: [{ title: 'X', description: '', price_cents: -1, optional: false, category: 'general' }],
  });
  expect(negative.success).toBe(false);
});

test('AC7: the delivery email carries the private link, warm sender, booking slot only when configured', () => {
  const withBooking = buildProposalDeliveryEmail({
    clientName: 'Rachel Morales', proposalTitle: 'Your bathroom remodel',
    proposalUrl: 'https://www.lavacagc.com/proposal/tok123', bookingUrl: 'https://cal.example/lavaca',
  });
  expect(withBooking.subject).toContain('Rachel');
  expect(withBooking.html).toContain('/proposal/tok123');
  expect(withBooking.html).toContain('Book a time');
  expect(withBooking.text).toContain('https://www.lavacagc.com/proposal/tok123');

  const without = buildProposalDeliveryEmail({
    clientName: 'Rachel', proposalTitle: 'T', proposalUrl: 'https://x/proposal/t',
  });
  expect(without.html).not.toContain('Book a time');
  // Warm customer-facing sender, per the house From convention.
  expect(PROPOSAL_FROM).toContain('Alex from La Vaca GC');
  expect(PROPOSAL_FROM).toContain('alex@email.lavaca.link');
});

test('AC8: bundle migration - shape, sum tie, least-privilege function, frozen-file rule', () => {
  const sql = read('supabase/migrations/20260825000000_proposal_bundles.sql');
  const ddl = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  expect(ddl).toContain('ADD COLUMN bundle_members JSONB');
  expect(ddl).toMatch(/jsonb_array_length\(bundle_members\) >= 2/);
  expect(ddl).toMatch(/proposal_bundle_total\(bundle_members\) = price_cents/);
  expect(ddl).toMatch(/REVOKE EXECUTE ON FUNCTION public\.proposal_bundle_total/);
  // Member cents carry the shared cap and whole-cents rule.
  expect(ddl).toContain('@.price_cents <= 1000000000');
  expect(ddl).toContain('@.price_cents.floor() == @.price_cents');
});

test('AC9: member prices are admin-side only - the page says so and the client render contract is pinned', () => {
  const page = read('src/app/vaca-mgmt/proposals/page.tsx');
  expect(page).toContain('client sees names, never member prices');
  const migration = read('supabase/migrations/20260825000000_proposal_bundles.sql');
  expect(migration).toContain('ADMIN-SIDE ONLY');
  // Slice 3's client page must render titles only; the contract lives in the
  // migration comment it will be reviewed against.
  expect(migration).toContain('never the member prices');
});

test('AC10: the touch path is first-class - select + Combine exists alongside drag', () => {
  const page = read('src/app/vaca-mgmt/proposals/page.tsx');
  expect(page).toContain('combine-btn');
  expect(page).toMatch(/type="checkbox"/);
  expect(page).toContain('draggable');
  // The sticky action bar keeps Combine reachable on a phone.
  expect(page).toContain('sticky bottom-2');
});

test('AC11: privacy policy v2.7 carries the proposal retention row', () => {
  const policy = read('src/content/privacy-policy-content.md');
  expect(policy).toContain('**Version: 2.7**');
  expect(policy).toContain('**Proposal Records**');
  expect(policy).toContain('the record of what was agreed');
});

test('AC12: no em dashes in the slice-2 modules (house style)', () => {
  for (const p of [
    'src/lib/proposals/bundles.ts',
    'src/lib/proposals/store.ts',
    'src/lib/proposals/deliveryEmail.ts',
    'src/app/vaca-mgmt/proposals/page.tsx',
    'src/app/api/admin/proposals/route.ts',
    'src/app/api/admin/proposals/[id]/route.ts',
    'supabase/migrations/20260825000000_proposal_bundles.sql',
  ]) {
    expect(read(p), `${p} must not contain an em dash`).not.toContain('—');
  }
});
