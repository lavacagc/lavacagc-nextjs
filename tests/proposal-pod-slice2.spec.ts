import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  composeBundle, lockedMemberTitles, restoreMembers, toStoredMembers,
} from '../src/lib/proposals/bundles';
import {
  CreateProposalSchema, ProposalLinesSchema, ProposalConflictError, bundleSumError,
} from '../src/lib/proposals/store';
import { MAX_LINES } from '../src/lib/proposals/csv';
import { CLIENT_PAGE_LIVE } from '../src/lib/proposals/clientPage';
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
  // No description carried in means none comes back out - never undefined.
  expect(restored[0].description).toBe('');
});

test('AC4b: unbundle is lossless in the preview, and descriptions never reach storage', () => {
  const b = composeBundle([
    { title: 'Tile - heated floor upgrade', description: 'Ditra Heat under porcelain', priceCents: 290050, optional: true, category: 'tile' },
    { title: 'Vanity - double sink', description: '72in walnut, quartz top', priceCents: 340000, optional: true, category: 'cabinets' },
  ], 'Complete spa bathroom package')!;

  // In-memory: bundle, change your mind, unbundle - the CSV's descriptions survive.
  const restored = restoreMembers(b.members);
  expect(restored.map((m) => m.description)).toEqual([
    'Ditra Heat under porcelain', '72in walnut, quartz top',
  ]);

  // Persisted: titles and prices only - the client-facing storage contract.
  const stored = toStoredMembers(b.members);
  expect(stored).toEqual([
    { title: 'Tile - heated floor upgrade', price_cents: 290050 },
    { title: 'Vanity - double sink', price_cents: 340000 },
  ]);
  for (const m of stored) expect(Object.keys(m).sort()).toEqual(['price_cents', 'title']);
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

test('AC6b: every line-array write path carries the same MAX_LINES bound', () => {
  const line = (i: number) => ({
    title: `Line ${i}`, description: '', price_cents: 100, optional: false, category: 'general',
  });
  const atCap = Array.from({ length: MAX_LINES }, (_, i) => line(i));
  expect(ProposalLinesSchema.safeParse(atCap).success).toBe(true);
  expect(ProposalLinesSchema.safeParse([...atCap, line(MAX_LINES)]).success).toBe(false);
  expect(ProposalLinesSchema.safeParse([]).success).toBe(false);
  // The re-import route validates with this exact schema, so it cannot be the
  // one door that writes an unbounded number of proposal_lines rows.
  const route = read('src/app/api/admin/proposals/[id]/route.ts');
  expect(route).toContain('lines: ProposalLinesSchema');
});

test('AC6c: bundle_members is bounded above as well as below', () => {
  const member = (i: number) => ({ title: `m${i}`, price_cents: 1 });
  const bundleOf = (n: number) => ({
    title: 'B', description: '', price_cents: n, optional: false, category: 'general',
    bundle_members: Array.from({ length: n }, (_, i) => member(i)),
  });
  const base = { client_name: 'R', title: 'T' };
  expect(CreateProposalSchema.safeParse({ ...base, lines: [bundleOf(MAX_LINES)] }).success).toBe(true);
  expect(CreateProposalSchema.safeParse({ ...base, lines: [bundleOf(MAX_LINES + 1)] }).success).toBe(false);
  expect(CreateProposalSchema.safeParse({ ...base, lines: [bundleOf(1)] }).success).toBe(false);
});

test('AC6d: a re-import that cannot insert restores the lines it deleted', async () => {
  // Drive the REAL replaceLines (and the real supabaseRest) against a stubbed
  // PostgREST at the fetch boundary: the DELETE succeeds, the INSERT of the new
  // set fails, and the previous rows must go back. A proposal that is 'sent'
  // must never be left with zero lines behind a live client link.
  const previous = [
    { id: 'l1', proposal_id: 'p1', position: 0, title: 'Demolition & prep', description: '', price_cents: 480000, optional: false, category: 'demolition', bundle_members: null },
    { id: 'l2', proposal_id: 'p1', position: 1, title: 'Tile', description: 'porcelain', price_cents: 120000, optional: true, category: 'tile', bundle_members: null },
  ];
  const calls: { method: string; url: string; body: unknown }[] = [];
  const env = { ...process.env };
  const realFetch = globalThis.fetch;
  process.env.SUPABASE_SECRET_KEY = 'stub-key';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://postgrest.stub';
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    if (method === 'GET' && url.includes('/proposals?')) return json([{ id: 'p1', status: 'sent' }]);
    if (method === 'GET' && url.includes('/proposal_lines?')) return json(previous);
    if (method === 'DELETE') return json([]);
    if (method === 'POST' && url.includes('/proposal_lines')) {
      // The NEW set is the insert that fails. The restore that follows carries
      // the snapshot's own ids, and must be allowed through.
      const rows = body as { id?: string }[];
      if (!rows[0]?.id) return json({ message: 'violates constraint proposal_lines_bundle_sum' }, 400);
      return json([]);
    }
    return json([]);
  }) as typeof fetch;

  try {
    const { replaceLines } = await import('../src/lib/proposals/store');
    await expect(replaceLines('p1', [
      { title: 'New', description: '', price_cents: 1, optional: false, category: 'general' },
    ])).rejects.toThrow(/failed: 400/);
  } finally {
    globalThis.fetch = realFetch;
    process.env = env;
  }

  expect(calls.some((c) => c.method === 'DELETE'), 'the old lines are deleted').toBe(true);
  const restore = calls.find((c) =>
    c.method === 'POST' && Array.isArray(c.body) && (c.body as { id?: string }[])[0]?.id);
  expect(restore, 'the snapshot is re-inserted after the failed insert').toBeTruthy();
  expect(restore!.body).toEqual(previous);
  // The snapshot read is bounded, so it cannot silently under-restore.
  expect(calls.find((c) => c.url.includes('/proposal_lines?select='))!.url).toContain('limit=200');
  // And the proposal is never marked updated - a failed re-import is not an
  // update. Nor is a SUCCESSFUL one written by hand: proposal_lines_touch_
  // proposal moves updated_at from the trigger, so the module writes no PATCH
  // at all and cannot fail after the lines are already correct.
  expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  expect(read('src/lib/proposals/store.ts'))
    .not.toMatch(/PATCH', `proposals\?id=eq\.\$\{proposalId\}`, \{\s*\n?\s*updated_at/);
});

test('AC6e: a refused transition is a typed conflict, not a matched substring', () => {
  const err = new ProposalConflictError('proposal is revoked - re-send it before re-importing');
  expect(err).toBeInstanceOf(Error);
  const route = read('src/app/api/admin/proposals/[id]/route.ts');
  expect(route).toContain('err instanceof ProposalConflictError');
  expect(route).not.toContain(`message.includes('revoked - re-send')`);
  // The 500 path stays generic: supabaseRest messages embed the PostgREST body
  // (table, column and constraint names), which is the server log's business.
  expect(route).toContain(`{ error: 'Could not complete that action' }`);
  expect(route).not.toMatch(/NextResponse\.json\(\{ error: message \}/);
});

test('AC6f: the roster counts in Postgres, bounded, instead of counting fetched rows', () => {
  const store = read('src/lib/proposals/store.ts');
  expect(store).toContain('rpc/proposal_roster_counts');
  // The unbounded fan-out reads that PostgREST's max-rows would truncate are gone.
  expect(store).not.toMatch(/proposal_lines\?select=proposal_id&proposal_id=in\./);
  expect(store).not.toMatch(/proposal_submissions\?select=proposal_id,total_cents/);

  const sql = read('supabase/migrations/20260826000000_proposal_roster_counts.sql');
  const ddl = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  expect(ddl).toContain('CREATE FUNCTION public.proposal_roster_counts');
  expect(ddl).toMatch(/REVOKE EXECUTE ON FUNCTION public\.proposal_roster_counts/);
  // The upper bound the bundle shape CHECK was missing, in a NEW migration -
  // 20260825000000 has landed in a database and is frozen.
  expect(ddl).toContain('proposal_lines_bundle_member_cap');
  expect(ddl).toMatch(/jsonb_array_length\(bundle_members\) <= 200/);
  expect(read('supabase/migrations/20260825000000_proposal_bundles.sql'))
    .not.toContain('bundle_member_cap');
});

test('AC6g: both pod functions keep service_role EXECUTE and an empty search_path', () => {
  const sql = read('supabase/migrations/20260826000000_proposal_roster_counts.sql');
  const ddl = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  // A REVOKE without the paired GRANT relies on Supabase's bootstrap default
  // privileges, which a self-hosted stack or a restored database may never have
  // applied - and there the revoke removes service_role's last path in.
  expect(ddl).toMatch(/GRANT EXECUTE ON FUNCTION public\.proposal_roster_counts\(UUID\[\]\) TO service_role/);
  // proposal_bundle_total sits inside a CHECK, where EXECUTE is tested at INSERT
  // time: without this, a bundled line cannot be written at all.
  expect(ddl).toMatch(/GRANT EXECUTE ON FUNCTION public\.proposal_bundle_total\(JSONB\) TO service_role/);
  // Pinned search_path on both, per 20260824000000's stated rule. 20260825000000
  // has landed in a database, so its function is pinned by ALTER from here.
  expect(ddl).toMatch(/CREATE FUNCTION public\.proposal_roster_counts[\s\S]*?SET search_path = ''[\s\S]*?AS \$\$/);
  expect(ddl).toMatch(/ALTER FUNCTION public\.proposal_bundle_total\(JSONB\) SET search_path = ''/);
  expect(read('supabase/migrations/20260825000000_proposal_bundles.sql'))
    .not.toContain('service_role');
});

test('AC6h: a counts outage costs the roster its numbers, never its lifecycle controls', async () => {
  const proposal = {
    id: 'p1', token: 'a'.repeat(43), client_name: 'Rachel Morales', client_email: null,
    title: 'Your bathroom remodel', status: 'sent', lead_id: null, sent_at: '2026-08-04T00:00:00Z',
    revoked_at: null, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-04T00:00:00Z',
  };
  const env = { ...process.env };
  const realFetch = globalThis.fetch;
  process.env.SUPABASE_SECRET_KEY = 'stub-key';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://postgrest.stub';
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });

  /** countsStatus 404 = the migration has not been hand-applied yet. */
  const stub = (countsStatus: number) => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/rpc/proposal_roster_counts')) {
        return countsStatus === 200
          ? json([{ proposal_id: 'p1', line_count: 7, submission_count: 2, latest_total_cents: 630050 }])
          : json({ message: 'Not Found' }, countsStatus);
      }
      if (url.includes('/proposals?')) return json([proposal]);
      return json([]);
    }) as typeof fetch;
  };

  try {
    const { listProposals } = await import('../src/lib/proposals/store');

    stub(404);
    const degraded = await listProposals();
    expect(degraded.counts_available).toBe(false);
    // The row survives - Copy link, Re-import and above all Revoke stay reachable.
    expect(degraded.proposals).toHaveLength(1);
    expect(degraded.proposals[0].id).toBe('p1');
    expect(degraded.proposals[0].token).toBe(proposal.token);
    // Unknown, not a confident zero.
    expect(degraded.proposals[0].line_count).toBeNull();
    expect(degraded.proposals[0].submission_count).toBeNull();
    expect(degraded.proposals[0].latest_total_cents).toBeNull();

    stub(500);
    expect((await listProposals()).counts_available).toBe(false);

    stub(200);
    const healthy = await listProposals();
    expect(healthy.counts_available).toBe(true);
    expect(healthy.proposals[0].line_count).toBe(7);
    expect(healthy.proposals[0].latest_total_cents).toBe(630050);
  } finally {
    globalThis.fetch = realFetch;
    process.env = env;
  }

  // And the page renders the degraded state rather than printing zeros.
  const page = read('src/app/vaca-mgmt/proposals/page.tsx');
  expect(page).toContain('data-testid="counts-unavailable"');
  expect(page).toContain('p.line_count == null || p.submission_count == null');
});

test('AC6j: every proposal stays reachable past the roster cap, by search and by count', async () => {
  const proposal = (id: string, name: string) => ({
    id, token: 'a'.repeat(43), client_name: name, client_email: `${id}@example.com`,
    title: 'Your bathroom remodel', status: 'sent', lead_id: null, sent_at: null,
    revoked_at: null, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-04T00:00:00Z',
  });
  const env = { ...process.env };
  const realFetch = globalThis.fetch;
  process.env.SUPABASE_SECRET_KEY = 'stub-key';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://postgrest.stub';
  const seen: string[] = [];

  // An estate of 312, of which the roster page can hold 200. The 312th by
  // updated_at is NOT on the unfiltered page - only a search reaches it.
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = decodeURIComponent(String(input));
    seen.push(url);
    if (url.includes('/rpc/')) return new Response('[]', { status: 500 });
    const searching = url.includes('or=(');
    const rows = searching
      ? [proposal('deadbeef', 'Zeta Vanterpool')]
      : Array.from({ length: 200 }, (_, i) => proposal(`p${i}`, `Client ${i}`));
    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Content-Range': `0-${rows.length - 1}/${searching ? 1 : 312}` },
    });
  }) as typeof fetch;

  try {
    const { listProposals, ROSTER_LIMIT, searchPattern } = await import('../src/lib/proposals/store');

    // Unfiltered: a full page, and the exact total that says it is not everything.
    const page = await listProposals();
    expect(page.proposals).toHaveLength(ROSTER_LIMIT);
    expect(page.total).toBe(312);
    expect(page.total! > page.proposals.length, 'the page is truncated and says so').toBe(true);
    expect(page.proposals.some((p) => p.id === 'deadbeef')).toBe(false);

    // Searched: the proposal the cap hid comes back, so Revoke reaches it.
    const found = await listProposals('Zeta');
    expect(found.proposals.map((p) => p.id)).toEqual(['deadbeef']);
    expect(found.total).toBe(1);
    // All three searchable columns, server-side.
    const searchUrl = seen.filter((u) => u.includes('/proposals?')).pop()!;
    expect(searchUrl).toContain('client_name.ilike.*Zeta*');
    expect(searchUrl).toContain('client_email.ilike.*Zeta*');
    expect(searchUrl).toContain('title.ilike.*Zeta*');

    // A term carrying PostgREST's own grammar cannot reach the parser as syntax.
    expect(searchPattern('Smith, Jane')).toBe('*Smith* Jane*');
    expect(searchPattern('a)b(c"d\\e')).toBe('*a*b*c*d*e*');
    expect(searchPattern('100%_off')).toBe('*100**off*');
    // An email still matches literally: dots are data inside a filter value.
    expect(searchPattern('rachel@example.com')).toBe('*rachel@example.com*');
    // Bounded: a filter, not a document.
    expect(searchPattern('x'.repeat(500)).length).toBeLessThanOrEqual(82);
  } finally {
    globalThis.fetch = realFetch;
    process.env = env;
  }

  // And the page offers the search and says how much it is not showing.
  const pageSrc = read('src/app/vaca-mgmt/proposals/page.tsx');
  expect(pageSrc).toContain('data-testid="roster-search"');
  expect(pageSrc).toContain('data-testid="roster-truncated"');
  expect(pageSrc).toContain('?search=${encodeURIComponent(q)}');
  expect(pageSrc).toContain('rosterTotal != null && rosterTotal > roster.length');
  expect(read('src/app/api/admin/proposals/route.ts'))
    .toContain(`request.nextUrl.searchParams.get('search')`);
});

test('AC6k: a delivered email whose status write fails is reported as delivered, and retried', async () => {
  const env = { ...process.env };
  const realFetch = globalThis.fetch;
  process.env.SUPABASE_SECRET_KEY = 'stub-key';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://postgrest.stub';
  const patches: string[] = [];
  /** failures = how many PATCHes fail before one succeeds. */
  const stub = (failures: number) => {
    let seen = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'PATCH') {
        patches.push(String(input));
        seen += 1;
        if (seen <= failures) return new Response('{"message":"boom"}', { status: 503 });
      }
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
  };

  try {
    const { markSent } = await import('../src/lib/proposals/store');
    // The email is already out by the time markSent runs, so a transient failure
    // is retried rather than costing the admin a second delivery.
    stub(1);
    await markSent('p1');
    expect(patches).toHaveLength(2);

    // A durable failure still surfaces - it must not be swallowed into "sent".
    patches.length = 0;
    stub(99);
    await expect(markSent('p1')).rejects.toThrow(/failed: 503/);
  } finally {
    globalThis.fetch = realFetch;
    process.env = env;
  }

  const route = read('src/app/api/admin/proposals/[id]/route.ts');
  // Send stays FIRST: a failed send must never leave a proposal reading 'sent'.
  expect(route.indexOf('sendTrackedEmail({')).toBeLessThan(route.indexOf('await markSent(id)'));
  // But its failure is its own event, not the generic action failure - the
  // admin has to know a client is already holding the link.
  expect(route).toContain('The email WAS delivered');
  expect(route).toContain('Press Send again to repair it');
  expect(route).toContain('delivered: true');
  // And a non-send names its cause: a missing RESEND_API_KEY fills `reason`
  // only, so reading `error` alone reported "(skipped)" and nothing else.
  expect(route).toContain('const detail = res.error || res.reason');
});

test('AC6l: no lifecycle writer hand-maintains updated_at - the trigger owns it', () => {
  const store = read('src/lib/proposals/store.ts');
  // proposals_set_updated_at (20260824000000) overwrites anything sent from
  // here, so a hand-written value is dead payload in every one of these paths.
  expect(store).not.toContain('updated_at: new Date().toISOString()');
  // The lifecycle columns these two DO own are still written.
  expect(store).toContain(`status: 'revoked'`);
  expect(store).toContain('revoked_at: new Date().toISOString()');
  expect(store).toContain(`status: 'sent'`);
  expect(store).toContain('sent_at: new Date().toISOString()');
});

test('AC6i: a rejected action names the rule and the line, not just "Invalid action"', () => {
  const route = read('src/app/api/admin/proposals/[id]/route.ts');
  // The sibling create route's shape: a flattened detail alongside the message.
  expect(route).toContain('details: parsed.error.flatten()');
  expect(route).toContain(`issue.path.join('.')`);
  // An empty bundle name is the reachable case, and the path names which line.
  const bad = ProposalLinesSchema.safeParse([
    { title: 'Demo', description: '', price_cents: 100, optional: false, category: 'general' },
    { title: '', description: '', price_cents: 100, optional: false, category: 'general' },
  ]);
  expect(bad.success).toBe(false);
  if (!bad.success) expect(bad.error.issues[0].path.join('.')).toBe('1.title');
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

test('AC10b: Combine reads the rows a tick resolves to, and unbundle prunes its key', () => {
  const page = read('src/app/vaca-mgmt/proposals/page.tsx');
  // Derived from rows, never from selected.size - a key left behind by a
  // removed row cannot advertise a bundle that cannot be composed.
  expect(page).toContain('const selectedRows = useMemo(');
  expect(page).toContain('disabled={selectedRows.length < 2}');
  expect(page).not.toContain('disabled={selected.size < 2}');
  // And unbundle prunes anyway, so the selection never holds a dead key.
  expect(page).toMatch(/setSelected\(\(prev\) => \{\s*\n\s*if \(!prev\.has\(key\)\)/);
});

test('AC10c: the paste box parses on paste, blur and an explicit button - never on a keystroke', () => {
  const page = read('src/app/vaca-mgmt/proposals/page.tsx');
  expect(page).toContain('data-testid="parse-btn"');
  expect(page).toContain('onPaste=');
  expect(page).toContain('onBlur={(e) => parsePastedText(e.target.value)}');
  // The old shape re-parsed (and re-keyed every row) on every change.
  expect(page).not.toContain('if (e.target.value.trim()) ingestCsv(e.target.value)');
  // Emptying the box clears the preview rather than leaving a stale one up.
  expect(page).toContain('if (!text.trim()) clearPreview(text)');
});

test('AC10d: the fire-and-forget async paths report failure instead of vanishing', () => {
  const page = read('src/app/vaca-mgmt/proposals/page.tsx');
  // A clipboard denial must not leave the admin believing they hold the link.
  expect(page).toContain('await navigator.clipboard.writeText(url)');
  expect(page).toContain(`title: 'Could not copy the link'`);
  // An unreadable dropped file must not fail as a preview that simply never appears.
  expect(page).toContain(`title: 'Could not read that file'`);
  expect(page).toMatch(/f\.text\(\)[\s\S]*?\.catch\(/);
});

test('AC10g: arming a re-import empties the importer and names its target', () => {
  const page = read('src/app/vaca-mgmt/proposals/page.tsx');
  // The old shape only set the target, so a preview built for a DIFFERENT
  // client stayed loaded and became the payload for whichever row was clicked -
  // at the same moment the client fields that identified it were hidden.
  expect(page).not.toContain('onClick={() => { setReimportTarget(p);');
  expect(page).toContain('onClick={() => armReimport(p)}');
  expect(page).toMatch(/const armReimport = useCallback\(\(p: RosterEntry\) => \{\s*\n\s*resetImporter\(\);/);
  // Cancel restores a clean importer rather than leaving the armed preview up.
  expect(page).toContain('onClick={cancelReimport}');
  expect(page).toMatch(/const cancelReimport = useCallback\(\(\) => \{[\s\S]*?resetImporter\(\);/);
  // And the target is named where the admin is working, not only in the title.
  expect(page).toContain('data-testid="reimport-armed"');
  expect(page).toContain(`Replace ${'${reimportTarget.client_name}'}'s lines`);
});

test('AC10h: a bundle cannot be sent with its name deleted', () => {
  const page = read('src/app/vaca-mgmt/proposals/page.tsx');
  // Typing through empty is allowed; leaving the box empty is not - the last
  // non-empty name comes back on blur, and composeBundle's default backs it.
  expect(page).toContain('onBlur={() => commitBundleName(r.key)}');
  expect(page).toContain('lastBundleName.current.get(key)');
  expect(page).toContain('`Bundle (${r.members?.length ?? 0} items)`');
  // Belt and braces: the button refuses while an empty name is still on screen.
  expect(page).toContain('const hasUnnamedRow = useMemo(');
  expect(page).toContain('hasUnnamedRow');
  // The default name the fallback restores is the one composeBundle gives.
  const b = composeBundle([
    { title: 'A', priceCents: 100, optional: true, category: 'tile' },
    { title: 'B', priceCents: 200, optional: true, category: 'tile' },
  ])!;
  expect(b.title).toBe('Bundle (2 items)');
});

test('AC10i: turning a locked bundle optional asks first, and names what it would expose', () => {
  // The override itself stays - it is the admin's designed backstop over the
  // registry - but a bundle shows only its own name, so flipping one composed
  // from structural work hands the client an all-or-nothing toggle over work
  // whose titles are no longer on screen.
  const b = composeBundle([
    { title: 'Demolition & prep', priceCents: 480000, optional: false, category: 'demolition' },
    { title: 'Vanity - double sink', priceCents: 340000, optional: true, category: 'cabinets' },
  ])!;
  expect(b.optional).toBe(false);
  expect(lockedMemberTitles(b.members)).toEqual(['Demolition & prep']);
  // Re-derived from the registry, same fail-safe as restoreMembers: a title the
  // registry does not recognize counts as locked.
  expect(lockedMemberTitles([{ title: 'Zorble calibration', price_cents: 1 }]))
    .toEqual(['Zorble calibration']);
  // An all-optional bundle is the negotiation posture and asks nothing.
  const allOptional = composeBundle([
    { title: 'Tile - heated floor upgrade', priceCents: 290050, optional: true, category: 'tile' },
    { title: 'Vanity - double sink', priceCents: 340000, optional: true, category: 'cabinets' },
  ])!;
  expect(lockedMemberTitles(allOptional.members)).toEqual([]);

  const page = read('src/app/vaca-mgmt/proposals/page.tsx');
  expect(page).toContain('lockedMemberTitles(row.members)');
  expect(page).toMatch(/locked\.length > 0 && !window\.confirm\(/);
  // Only that direction, and only for bundles: locking anything is never a risk.
  expect(page).toContain('if (row?.members && !row.optional)');
});

test('AC10e: Send is refused while the client page does not exist; Copy link is not', () => {
  // Slice 2 ships the admin side only. Flipping this constant is Slice 3's job,
  // in the same commit that adds /proposal/[token].
  expect(CLIENT_PAGE_LIVE).toBe(false);

  const route = read('src/app/api/admin/proposals/[id]/route.ts');
  expect(route).toContain('if (!CLIENT_PAGE_LIVE)');
  expect(route).toContain('CLIENT_PAGE_NOT_LIVE_MESSAGE }, { status: 409 }');
  // Server-side, and BEFORE anything is handed to the mailer.
  expect(route.indexOf('if (!CLIENT_PAGE_LIVE)')).toBeLessThan(route.indexOf('sendTrackedEmail({'));

  const page = read('src/app/vaca-mgmt/proposals/page.tsx');
  expect(page).toContain('disabled={busy || !CLIENT_PAGE_LIVE || !p.client_email}');
  // Copy link stays unconditional - holding a link is not sending one.
  expect(page).toContain('onClick={() => copyLink(p)}');
});

test('AC10f: a proposal delivery is attributed to the admin who sent it', () => {
  const route = read('src/app/api/admin/proposals/[id]/route.ts');
  // The house pattern from the sibling admin send routes.
  expect(route).toContain('await supabase.auth.getUser()');
  expect(route).toContain('sentBy = user?.email ?? null');
  expect(route).toMatch(/sendTrackedEmail\(\{[\s\S]*?sentBy,[\s\S]*?\}\)/);
});

test('AC11: privacy policy v2.7 carries a BOUNDED proposal retention row', () => {
  const policy = read('src/content/privacy-policy-content.md');
  expect(policy).toContain('**Version: 2.7**');
  expect(policy).toContain('**Proposal Records**');
  expect(policy).toContain('the record of what was agreed');
  // Every other row in the table commits to a window; so does this one.
  expect(policy).toContain('up to 24 months after it closes or is superseded');
  expect(policy).toContain('deleted sooner with the proposal on request');
  expect(policy).not.toContain('for the project record thereafter');
});

test('AC12: no em dashes in the slice-2 modules (house style)', () => {
  for (const p of [
    'src/lib/proposals/bundles.ts',
    'src/lib/proposals/store.ts',
    'src/lib/proposals/deliveryEmail.ts',
    'src/app/vaca-mgmt/proposals/page.tsx',
    'src/app/api/admin/proposals/route.ts',
    'src/app/api/admin/proposals/[id]/route.ts',
    'src/lib/proposals/clientPage.ts',
    'supabase/migrations/20260825000000_proposal_bundles.sql',
    'supabase/migrations/20260826000000_proposal_roster_counts.sql',
  ]) {
    expect(read(p), `${p} must not contain an em dash`).not.toContain('—');
  }
});
