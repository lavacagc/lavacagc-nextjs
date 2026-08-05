import { test, expect } from '@playwright/test';
import { NextRequest } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  composeBundle, lockedMemberTitles, restoreMembers, toStoredMembers,
  type PreviewBundleMember,
} from '../src/lib/proposals/bundles';
import {
  CreateProposalSchema, ProposalLinesSchema, ProposalConflictError, bundleSumError,
  listProposals, markSent, replaceLines, restoreProposal, revokeProposal, searchPattern,
  ROSTER_LIMIT,
} from '../src/lib/proposals/store';
import { MAX_LINES } from '../src/lib/proposals/csv';
import { CLIENT_PAGE_LIVE } from '../src/lib/proposals/clientPage';
import { buildProposalDeliveryEmail, PROPOSAL_FROM } from '../src/lib/proposals/deliveryEmail';
import { POST as proposalAction } from '../src/app/api/admin/proposals/[id]/route';
import {
  GET as proposalRoster, POST as proposalCreate,
} from '../src/app/api/admin/proposals/route';

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
 *
 * WHAT IS ASSERTED, AND HOW. Behaviour is DRIVEN wherever it can be: the pure
 * modules are called, the store and both routes run against a stubbed PostgREST
 * at the fetch boundary, and everything that only exists once React is mounted
 * is driven in a real browser by proposal-pod-slice2-browser.spec.ts - whose
 * test titles carry the AC ids they own, so the contract stays traceable.
 *
 * Reading source text is reserved for what has no runtime to observe:
 *  - the SQL migrations, because the gate has no database to apply them to;
 *  - the pre-slice sidebar inventory and the middleware gate, which are
 *    regression pins on files this slice deliberately barely touches;
 *  - copy that only renders on a path this slice switches off (the delivery
 *    email's failure wording, behind CLIENT_PAGE_LIVE);
 *  - the house em-dash rule, which is a style check by nature.
 * An assertion that pins how a TypeScript file is spelled, where the same
 * invariant can be watched happening, is not a test of the product - it turns a
 * rename into a red suite and says nothing about behaviour.
 */

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/** One request the code under test made to the stubbed PostgREST. */
interface RestCall { method: string; url: string; body: unknown }

const restJson = (payload: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(payload), {
    status, headers: { 'Content-Type': 'application/json', ...headers },
  });

/**
 * Run `body` with PostgREST stubbed at the FETCH boundary, and hand it every
 * request the code under test made.
 *
 * The store, the routes and supabaseRest are all real: only the far side of the
 * wire is a fixture, so what these tests observe is the request the product
 * would actually have sent and the state it would actually have written. That
 * is the difference between asserting a behaviour and asserting a spelling.
 */
async function withPostgrest(
  respond: (call: RestCall) => Response,
  body: (calls: RestCall[]) => Promise<void>,
): Promise<void> {
  const env = { ...process.env };
  const realFetch = globalThis.fetch;
  process.env.SUPABASE_SECRET_KEY = 'stub-key';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://postgrest.stub';
  const calls: RestCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: RestCall = {
      method: init?.method ?? 'GET',
      url: decodeURIComponent(String(input)),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  try {
    await body(calls);
  } finally {
    globalThis.fetch = realFetch;
    process.env = env;
  }
}

/** A lifecycle POST to /api/admin/proposals/[id], as the roster's buttons send it. */
const lifecycle = (id: string, body: unknown) => proposalAction(
  new NextRequest(`http://localhost/api/admin/proposals/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
  { params: Promise.resolve({ id }) },
);

const PROPOSAL_ID = '44444444-4444-4444-4444-444444444444';

/** A proposals row as PostgREST returns it. */
const proposalRow = (over: Record<string, unknown> = {}) => ({
  id: PROPOSAL_ID, token: 'a'.repeat(43), client_name: 'Rachel Morales',
  client_email: 'rachel@example.com', title: 'Your bathroom remodel', status: 'draft',
  lead_id: null, sent_at: null, revoked_at: null,
  created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-04T00:00:00Z',
  ...over,
});

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
    { title: 'Tile - heated floor upgrade', priceCents: 290050, optional: true },
    { title: 'Vanity - double sink', priceCents: 340000, optional: true },
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
    { title: 'Demolition & prep', priceCents: 480000, optional: false },
    { title: 'Vanity - double sink', priceCents: 340000, optional: true },
  ]);
  expect(b!.optional).toBe(false);
  // The label follows structure too.
  expect(b!.category).toBe('demolition');
});

test('AC3: bundling a bundle flattens - sums never double-count', () => {
  const inner = composeBundle([
    { title: 'A', priceCents: 100, optional: true },
    { title: 'B', priceCents: 200, optional: true },
  ])!;
  const outer = composeBundle([
    { title: inner.title, priceCents: inner.priceCents, optional: inner.optional, members: inner.members },
    { title: 'C', priceCents: 300, optional: true },
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
    { title: 'Tile - heated floor upgrade', description: 'Ditra Heat under porcelain', priceCents: 290050, optional: true },
    { title: 'Vanity - double sink', description: '72in walnut, quartz top', priceCents: 340000, optional: true },
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
    { title: 'A', priceCents: 100, optional: true },
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

test('AC6b: every line-array write path carries the same MAX_LINES bound', async () => {
  const line = (i: number) => ({
    title: `Line ${i}`, description: '', price_cents: 100, optional: false, category: 'general',
  });
  const atCap = Array.from({ length: MAX_LINES }, (_, i) => line(i));
  expect(ProposalLinesSchema.safeParse(atCap).success).toBe(true);
  expect(ProposalLinesSchema.safeParse([...atCap, line(MAX_LINES)]).success).toBe(false);
  expect(ProposalLinesSchema.safeParse([]).success).toBe(false);

  // And BOTH write routes hold that bound in front of the database rather than
  // beside it: driven, so what is pinned is the refusal and the untouched
  // database, not the name of the schema either route happens to validate with.
  await withPostgrest(() => restJson([]), async (calls) => {
    const overCap = [...atCap, line(MAX_LINES)];

    const reimport = await lifecycle(PROPOSAL_ID, { action: 'reimport', lines: overCap });
    expect(reimport.status).toBe(400);
    expect((await reimport.json()).error).toContain('lines');

    const create = await proposalCreate(new NextRequest('http://localhost/api/admin/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: 'R', title: 'T', lines: overCap }),
    }));
    expect(create.status).toBe(400);
    expect((await create.json()).error).toContain('lines');

    expect(calls, 'an over-cap write never reaches the database').toEqual([]);
  });
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
  const calls: { method: string; url: string; body: unknown; prefer?: string }[] = [];
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
    calls.push({ method, url, body, prefer: (init?.headers as Record<string, string>)?.Prefer });
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
    await expect(replaceLines('p1', [
      { title: 'New', description: '', price_cents: 1, optional: false, category: 'general' },
    ])).rejects.toThrow(/failed: 400/);
  } finally {
    globalThis.fetch = realFetch;
    process.env = env;
  }

  const del = calls.find((c) => c.method === 'DELETE');
  expect(del, 'the old lines are deleted').toBeTruthy();
  // And asked for nothing back. The rows being deleted are already held in the
  // snapshot this restore is built from, so PostgREST's default of returning
  // the representation ships up to MAX_LINES of rows - bundle_members blobs and
  // all - across the wire and through JSON.parse for a value no caller reads.
  expect(del!.prefer, 'the DELETE asks for no representation').toContain('return=minimal');
  const restore = calls.find((c) =>
    c.method === 'POST' && Array.isArray(c.body) && (c.body as { id?: string }[])[0]?.id);
  expect(restore, 'the snapshot is re-inserted after the failed insert').toBeTruthy();
  expect(restore!.body).toEqual(previous);
  // The snapshot read is bounded, so it cannot silently under-restore.
  expect(calls.find((c) => c.url.includes('/proposal_lines?select='))!.url).toContain('limit=200');
  // And the proposal is never marked updated - a failed re-import is not an
  // update. Nor is a SUCCESSFUL one written by hand: proposal_lines_touch_
  // proposal moves updated_at from the trigger, so the module writes no PATCH
  // at all and cannot fail after the lines are already correct. The request log
  // is the whole proof; AC6l drives the same rule across the other writers.
  expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
});

test('AC6d2: when the restore fails too, the log states what the proposal ACTUALLY holds', async () => {
  // The one log line written to be read during an incident, and the operator's
  // only signal. It used to assert "the proposal now has no lines" without ever
  // looking - but an insert whose RESPONSE was lost commits anyway, and then the
  // snapshot going back collides with proposal_lines_position and throws for the
  // one reason that means the NEW lines are already in place. So the count is
  // read back and the wording follows it.
  const previous = [
    { id: 'l1', proposal_id: 'p1', position: 0, title: 'Demolition & prep', description: '', price_cents: 480000, optional: false, category: 'demolition', bundle_members: null },
    { id: 'l2', proposal_id: 'p1', position: 1, title: 'Tile', description: 'porcelain', price_cents: 120000, optional: true, category: 'tile', bundle_members: null },
  ];
  const newLines = [
    { title: 'New A', description: '', price_cents: 1, optional: false, category: 'general' },
    { title: 'New B', description: '', price_cents: 2, optional: false, category: 'general' },
    { title: 'New C', description: '', price_cents: 3, optional: false, category: 'general' },
  ];

  const runWithHeld = async (held: number | null): Promise<string> => {
    const env = { ...process.env };
    const realFetch = globalThis.fetch;
    const realError = console.error;
    process.env.SUPABASE_SECRET_KEY = 'stub-key';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://postgrest.stub';
    const logged: string[] = [];
    console.error = (...args: unknown[]) => { logged.push(args.map(String).join(' ')); };
    const json = (payload: unknown, status = 200, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify(payload), {
        status, headers: { 'Content-Type': 'application/json', ...headers },
      });

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'GET' && url.includes('/proposals?')) return json([{ id: 'p1', status: 'sent' }]);
      // The count read back, bounded: rows say "some", Content-Range says how many.
      if (method === 'GET' && url.includes('select=id&proposal_id=')) {
        return json(held === 0 ? [] : [{ id: 'x' }], 200,
          held == null ? {} : { 'content-range': `0-0/${held}` });
      }
      if (method === 'GET' && url.includes('/proposal_lines?')) return json(previous);
      if (method === 'DELETE') return json([]);
      // Both the new set AND the snapshot going back fail - the shape this log
      // line is written for.
      if (method === 'POST') return json({ message: 'violates constraint proposal_lines_position' }, 409);
      return json([]);
    }) as typeof fetch;

    try {
      await expect(replaceLines('p1', newLines)).rejects.toThrow(/failed: 409/);
    } finally {
      globalThis.fetch = realFetch;
      console.error = realError;
      process.env = env;
    }
    return logged.join('\n');
  };

  // The lines the re-import was writing are all there: it landed, and only its
  // response was lost. Telling the operator the proposal is empty here would
  // send them to overwrite a correct set.
  const landed = await runWithHeld(newLines.length);
  expect(landed).toContain('PROPOSAL LINES AT RISK');
  expect(landed).toMatch(/holds 3 line\(s\), the count the re-import was writing/);
  expect(landed).not.toMatch(/holds NO lines/);
  // Genuinely empty: the loud claim is true, and so is the repair.
  const empty = await runWithHeld(0);
  expect(empty).toMatch(/it now holds NO lines: re-import its CSV to repair it/);
  // Something else entirely - neither set - is named as such, not guessed at.
  const partial = await runWithHeld(1);
  expect(partial).toMatch(/holds 1 line\(s\), neither the 2 it started with nor the 3/);
  expect(partial).toMatch(/READ its lines before repairing/);
  // And when even the count cannot be read, that is what it says.
  const unknown = await runWithHeld(null);
  expect(unknown).toMatch(/line count could not be read either/);
  // Every case carries the constraint the restore died on, and the rows a
  // repair would be built from.
  for (const log of [landed, empty, partial, unknown]) {
    expect(log).toContain('proposal_lines_position');
    expect(log).toContain('Demolition & prep');
  }
});

test('AC6e: a refused transition is a typed conflict, not a matched substring', async () => {
  const err = new ProposalConflictError('proposal is revoked - restore it to draft before re-importing');
  expect(err).toBeInstanceOf(Error);

  // Driven end to end: re-importing onto a REVOKED proposal is the refusal the
  // type exists for. It comes back 409 carrying the store's own message - which
  // is written for the admin - and, decisively, the old lines are still there:
  // a dead link cannot be repointed at new content.
  await withPostgrest(
    (call) => (call.method === 'GET' ? restJson([proposalRow({
      status: 'revoked', sent_at: '2026-08-01T00:00:00Z', revoked_at: '2026-08-02T00:00:00Z',
    })]) : restJson([])),
    async (calls) => {
      const res = await lifecycle(PROPOSAL_ID, {
        action: 'reimport',
        lines: [{ title: 'New', description: '', price_cents: 1, optional: false, category: 'general' }],
      });
      expect(res.status).toBe(409);
      expect((await res.json()).error).toMatch(/revoked - restore it to draft before re-importing/);
      expect(calls.some((c) => c.method === 'DELETE'), 'nothing is deleted').toBe(false);
      expect(calls.some((c) => c.method === 'POST'), 'nothing is written').toBe(false);
    },
  );

  // Everything that is NOT a refused transition stays a generic 500 with the
  // detail in the server log: supabaseRest messages embed the PostgREST body,
  // table, column and constraint names included. AC10l2 drives that half on the
  // same route, so the two verdicts are pinned by what the route answers rather
  // than by how its catch block is written.
});

test('AC6f: the roster counts in Postgres, bounded, instead of counting fetched rows', async () => {
  // What the roster ASKS FOR is the whole point: one bounded page of proposals
  // and one aggregate keyed by their ids. The shape it replaced pulled every
  // line and every submission back to count them in JS, which PostgREST's
  // max-rows quietly truncated once the estate grew - so the assertion is that
  // those reads are not issued, watched on the wire rather than read in source.
  await withPostgrest(
    (call) => (call.url.includes('/rpc/')
      ? restJson([{ proposal_id: 'p1', line_count: 7, submission_count: 2, latest_total_cents: 630050 }])
      : restJson([proposalRow({ id: 'p1' })], 200, { 'Content-Range': '0-0/1' })),
    async (calls) => {
      const roster = await listProposals();
      expect(roster.proposals[0].line_count).toBe(7);
      expect(roster.proposals[0].submission_count).toBe(2);

      expect(calls).toHaveLength(2);
      const [page, counts] = calls;
      expect(page.method).toBe('GET');
      expect(page.url).toContain('/proposals?');
      expect(page.url, 'the page of proposals is bounded').toContain('limit=200');
      expect(counts.method).toBe('POST');
      expect(counts.url).toContain('/rpc/proposal_roster_counts');
      expect(counts.body).toEqual({ proposal_ids: ['p1'] });
      // No fan-out read of the rows being counted, at any bound.
      for (const c of calls) {
        expect(c.url).not.toMatch(/\/proposal_lines\?/);
        expect(c.url).not.toMatch(/\/proposal_submissions\?/);
      }
    },
  );

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

    // An aggregate that ANSWERS but has no row for a proposal is the same
    // "not known" - a response cut short by max-rows, a proposal deleted
    // between the two reads, an empty body behind a 200. The function returns
    // one row per proposal that exists and COUNT(*) is never null, so a missing
    // row is never evidence of zero, and printing 0 lines / 0 submissions on a
    // live proposal reads to an admin as the lines having been lost.
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/rpc/proposal_roster_counts')) return json([]);
      if (url.includes('/proposals?')) return json([proposal]);
      return json([]);
    }) as typeof fetch;
    const short = await listProposals();
    expect(short.proposals[0].line_count).toBeNull();
    expect(short.proposals[0].submission_count).toBeNull();
    expect(short.proposals[0].latest_total_cents).toBeNull();
    // The aggregate itself arrived, so the whole-roster banner stays down: the
    // row says it does not know, and nothing over-claims on the rest's behalf.
    expect(short.counts_available).toBe(true);
  } finally {
    globalThis.fetch = realFetch;
    process.env = env;
  }

  // The page's half of this - the notice, "Counts unavailable" in place of a
  // confident 0, and every lifecycle button still working - is driven in the
  // browser spec (B19), where those are things that can be looked at.
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

    // A term carrying PostgREST's own grammar cannot reach the parser as
    // syntax, and each neutralized character stands for exactly ONE character,
    // so the term keeps the shape the admin typed instead of widening.
    expect(searchPattern('Smith, Jane')).toBe('*Smith_ Jane*');
    expect(searchPattern('a)b(c"d\\e')).toBe('*a_b_c_d_e*');
    expect(searchPattern('100%_off')).toBe('*100__off*');
    // The asterisk above all: PostgREST turns it INTO %, so leaving it live
    // meant the only wildcard reaching the matcher was one an admin typed.
    expect(searchPattern('Kitchen *phase 2*')).toBe('*Kitchen _phase 2_*');
    // An email still matches literally: dots are data inside a filter value.
    expect(searchPattern('rachel@example.com')).toBe('*rachel@example.com*');
    // Bounded: a filter, not a document.
    expect(searchPattern('x'.repeat(500)).length).toBeLessThanOrEqual(82);

    // And a term of nothing but wildcards matches NOTHING rather than the whole
    // estate - a search box that silently means "everything" is the opposite of
    // the one thing this one is for.
    await listProposals('***');
    const wildcardUrl = seen.filter((u) => u.includes('/proposals?')).pop()!;
    expect(wildcardUrl).toContain('id=is.null');
    expect(wildcardUrl).not.toContain('or=(');
  } finally {
    globalThis.fetch = realFetch;
    process.env = env;
  }

  // The route carries the page's term through to that filter rather than
  // dropping it - driven, because a search that silently lists everything is
  // exactly as reachable a bug as one that lists nothing.
  await withPostgrest(
    (call) => (call.url.includes('/rpc/')
      ? restJson({ message: 'nope' }, 500)
      : restJson([], 200, { 'Content-Range': '*/0' })),
    async (calls) => {
      const res = await proposalRoster(
        new NextRequest('http://localhost/api/admin/proposals?search=Zeta'),
      );
      expect(res.status).toBe(200);
      expect(calls[0].url).toContain('client_name.ilike.*Zeta*');
      expect(calls[0].url).toContain('client_email.ilike.*Zeta*');
      expect(calls[0].url).toContain('title.ilike.*Zeta*');
    },
  );

  // The page's half - the search box, the truncation notice, and reaching a
  // capped-off proposal in order to revoke it - is driven in the browser spec
  // (B6), against this same payload shape.
});

test('AC6m: a truncated roster says so even when the exact total is unreadable', async () => {
  const proposal = (id: string) => ({
    id, token: 'a'.repeat(43), client_name: `Client ${id}`, client_email: null,
    title: 'Your bathroom remodel', status: 'sent', lead_id: null, sent_at: null,
    revoked_at: null, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-04T00:00:00Z',
  });
  const env = { ...process.env };
  const realFetch = globalThis.fetch;
  process.env.SUPABASE_SECRET_KEY = 'stub-key';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://postgrest.stub';

  /** range = whatever Content-Range the stack returns, or none at all. */
  const stub = (count: number, range: string | null) => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes('/rpc/')) return new Response('[]', { status: 500 });
      return new Response(JSON.stringify(Array.from({ length: count }, (_, i) => proposal(`p${i}`))), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...(range ? { 'Content-Range': range } : {}),
        },
      });
    }) as typeof fetch;
  };

  try {

    // The three ways the count goes missing: no header, PostgREST's uncounted
    // `*`, and a proxy that mangles it. A full page must still say it is full.
    for (const range of [null, '0-199/*', '0-199/not-a-number']) {
      stub(ROSTER_LIMIT, range);
      const page = await listProposals();
      expect(page.total, `range ${String(range)} yields no total`).toBeNull();
      expect(page.truncated, `range ${String(range)} must still report truncation`).toBe(true);
    }

    // Counted and truncated: both signals agree.
    stub(ROSTER_LIMIT, `0-199/312`);
    const counted = await listProposals();
    expect(counted.total).toBe(312);
    expect(counted.truncated).toBe(true);

    // An estate of EXACTLY the cap is not truncated. The count is authoritative
    // whenever it arrives, and the full-page heuristic is wrong here: it told
    // the admin to search for older proposals while every one was on screen.
    stub(ROSTER_LIMIT, `0-199/${ROSTER_LIMIT}`);
    const exact = await listProposals();
    expect(exact.total).toBe(ROSTER_LIMIT);
    expect(exact.proposals).toHaveLength(ROSTER_LIMIT);
    expect(exact.truncated, 'a full page that is the whole estate is not truncated').toBe(false);
    // Same page, no readable count: the heuristic is all there is, so it applies.
    stub(ROSTER_LIMIT, null);
    expect((await listProposals()).truncated).toBe(true);

    // A short page is NOT truncated, with or without a count.
    stub(3, '0-2/3');
    expect((await listProposals()).truncated).toBe(false);
    stub(3, null);
    expect((await listProposals()).truncated).toBe(false);
    stub(0, null);
    expect((await listProposals()).truncated).toBe(false);
  } finally {
    globalThis.fetch = realFetch;
    process.env = env;
  }

  // Both signals reach the page, because the notice is gated on the flag and
  // only decorated by the total: a truncated roster whose count went missing
  // still has to say so. Driven through the route, so the payload asserted here
  // is the payload the page actually receives.
  await withPostgrest(
    (call) => (call.url.includes('/rpc/')
      ? restJson({ message: 'nope' }, 500)
      : restJson([proposalRow({ id: 'p1' })])),
    async () => {
      const body = await (await proposalRoster(
        new NextRequest('http://localhost/api/admin/proposals'),
      )).json();
      expect(Object.keys(body).sort())
        .toEqual(['counts_available', 'proposals', 'total', 'truncated']);
      expect(body.total, 'no Content-Range, so no total').toBeNull();
      expect(body.counts_available).toBe(false);
    },
  );

  // The page renders that notice in both shapes - counted ("of 312") and
  // uncounted ("Showing the first N") - in the browser spec (B6 and B20). Its
  // stub therefore has to carry the same flag the server sends, or the AC would
  // pass against a payload the product never produces.
  expect(read('tests/proposal-pod-slice2-browser.spec.ts')).toContain('truncated: true');
});

/*
 * AC6n - a created proposal is visible on the roster, never hidden by the
 * search that was open - is a page state machine end to end: the term in the
 * box, the reload that follows Create, and which row is on screen afterwards.
 * It is driven in the browser spec (B21), where all three can be observed.
 */

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

  // The delivery half cannot be driven while CLIENT_PAGE_LIVE is false: the
  // route refuses every send before it reaches the mailer (AC10e drives that),
  // so nothing can reach the wording below until Slice 3 flips the constant and
  // this test can run the branch instead of reading it.
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

test('AC6l: no lifecycle writer hand-maintains updated_at - the trigger owns it', async () => {
  // proposals_set_updated_at (20260824000000) overwrites anything sent from
  // here, so a hand-written value is dead payload - and dead payload that can
  // still fail a request. Every writer is driven and its body inspected: the
  // lifecycle columns each one owns are written, and nothing else is.
  await withPostgrest(() => restJson([proposalRow({ status: 'draft' })]), async (calls) => {
    await revokeProposal(PROPOSAL_ID);
    await restoreProposal(PROPOSAL_ID);
    await markSent(PROPOSAL_ID);

    const bodies = calls.filter((c) => c.method === 'PATCH')
      .map((c) => c.body as Record<string, unknown>);
    expect(bodies).toHaveLength(3);
    const [revoked, restored, sent] = bodies;

    expect(revoked.status).toBe('revoked');
    expect(typeof revoked.revoked_at).toBe('string');
    expect(restored).toEqual({ status: 'draft', revoked_at: null });
    expect(sent.status).toBe('sent');
    expect(typeof sent.sent_at).toBe('string');
    expect(sent.revoked_at).toBeNull();

    for (const body of bodies) expect(Object.keys(body)).not.toContain('updated_at');
  });
});

test('AC6i: a rejected write names the rule and the field, not just "Invalid <verb>"', async () => {
  // An empty bundle name is the reachable case, and the path names which line.
  const bad = ProposalLinesSchema.safeParse([
    { title: 'Demo', description: '', price_cents: 100, optional: false, category: 'general' },
    { title: '', description: '', price_cents: 100, optional: false, category: 'general' },
  ]);
  expect(bad.success).toBe(false);
  if (!bad.success) expect(bad.error.issues[0].path.join('.')).toBe('1.title');

  // Both routes then have to SAY that, because the page renders body.error and
  // nothing else - a bare verdict is as blind as no message at all. Driven, so
  // what is pinned is the sentence the admin reads.
  await withPostgrest(() => restJson([]), async (calls) => {
    // The re-import route's reachable case: a bundle whose name was deleted.
    const reimport = await lifecycle(PROPOSAL_ID, {
      action: 'reimport',
      lines: [
        { title: 'Demo', description: '', price_cents: 100, optional: false, category: 'general' },
        { title: '', description: '', price_cents: 100, optional: false, category: 'general' },
      ],
    });
    expect(reimport.status).toBe(400);
    const reimportBody = await reimport.json();
    expect(reimportBody.error).toContain('lines.1.title');
    expect(reimportBody.error).not.toBe('Invalid action');
    expect(reimportBody.details.fieldErrors).toBeTruthy();

    // The create route's needs no malformed input at all: the client fields are
    // not inside a <form>, so `type="email"` never validates natively and a
    // half-typed address goes to the wire with a composed preview behind it.
    const create = await proposalCreate(new NextRequest('http://localhost/api/admin/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Rachel', client_email: 'rachel@', title: 'Your bathroom remodel',
        lines: [{ title: 'Demo', description: '', price_cents: 100, optional: false, category: 'general' }],
      }),
    }));
    expect(create.status).toBe(400);
    const createBody = await create.json();
    expect(createBody.error).toContain('client_email');
    expect(createBody.error).not.toBe('Invalid proposal');
    expect(createBody.details.fieldErrors.client_email).toBeTruthy();

    expect(calls, 'neither rejection touched the database').toEqual([]);
  });
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

  // Both hrefs are escaped for the attribute they sit in, the same as the
  // shell's cta() does. A booking URL normally carries a query string, and a
  // raw & there is one parameter name away from a legacy named reference a
  // mail client resolves silently - a broken link only the recipient sees.
  const query = buildProposalDeliveryEmail({
    clientName: 'Rachel', proposalTitle: 'T',
    proposalUrl: 'https://www.lavacagc.com/proposal/tok123?utm_source=email&utm_medium=proposal',
    bookingUrl: 'https://cal.example/lavaca?hide_gdpr_banner=1&primary_color=ff6a1a',
  });
  expect(query.html).toContain('href="https://cal.example/lavaca?hide_gdpr_banner=1&amp;primary_color=ff6a1a"');
  expect(query.html).toContain('href="https://www.lavacagc.com/proposal/tok123?utm_source=email&amp;utm_medium=proposal"');
  // The plain text copy is not markup - it carries the URLs verbatim.
  expect(query.text).toContain('?hide_gdpr_banner=1&primary_color=ff6a1a');

  // A quote cannot break out of the attribute and hang new markup off it.
  const hostile = buildProposalDeliveryEmail({
    clientName: 'Rachel', proposalTitle: 'T', proposalUrl: 'https://x/p" onmouseover="alert(1)',
  });
  expect(hostile.html).not.toContain('onmouseover="alert(1)"');
  expect(hostile.html).toContain('&quot; onmouseover=&quot;alert(1)');
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

test('AC9: member prices are admin-side only - the client render contract is pinned', () => {
  // What a composed bundle hands onward is titles and prices for the ADMIN, and
  // titles and one summed price for the client. The persisted shape is asserted
  // in AC4b; the rendered one - member names on the bundle row, no member price
  // anywhere near it - is driven in the browser spec (B3).
  const migration = read('supabase/migrations/20260825000000_proposal_bundles.sql');
  expect(migration).toContain('ADMIN-SIDE ONLY');
  // Slice 3's client page must render titles only; the contract lives in the
  // migration comment it will be reviewed against.
  expect(migration).toContain('never the member prices');
});

/*
 * The importer's own ACs are state machines that exist only once React is
 * mounted, so every one of them is DRIVEN in the browser spec against the real
 * page instead of being read out of its source here:
 *
 *   AC10  - the touch path is first-class: tick rows and press Combine (B3,
 *           B4) alongside the drag gesture (B17), with the tick target
 *           measured at 390px (B12).
 *   AC10b - Combine reads the rows a tick resolves to, and Unbundle frees the
 *           tick it was holding (B4).
 *   AC10c - the paste box imports on a paste and on the Parse button, never on
 *           a keystroke and never on a click away (B3) - and EVERY door into a
 *           discard asks first: Parse (B5), emptying the box (B11), arming or
 *           cancelling a re-import (B13), pasting over composed work (B14) and
 *           choosing a file (B22). Each also pins that declining leaves the box
 *           and the preview agreeing rather than showing two different imports,
 *           and B26 pins that a badge set by hand counts as composed work at
 *           every door - with or without a bundle, before or after one.
 *   AC10g - arming a re-import empties the importer and names its target (B13).
 *   AC10h - a bundle cannot be sent with its name deleted (B23).
 *   AC10k - Re-import is refused on a revoked row by the row itself (B15), and
 *           by replaceLines behind it (AC6e).
 *   AC10m - a revoked proposal has a way back (B16; AC10m2 for the write).
 *   AC10n - a drag only combines rows, an abandoned one disarms itself, and a
 *           mis-aimed file is inert but never silent (B17, B24).
 */

test('AC10c2: re-picking the same file always re-fires, so a declined confirm is not a dead end', () => {
  const page = read('src/app/vaca-mgmt/proposals/page.tsx');
  // A file input remembers its selection and emits no change event for the same
  // file twice. With the discard confirm in front of it, an admin who cancels to
  // think it over and then picks that same file again would get nothing at all.
  expect(page).toContain(`onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }}`);
  expect(page).not.toContain('onChange={(e) => onFile(e.target.files?.[0])}');
});

/*
 * AC10c3 - combine takes only the keys, and composeBundle keeps the name
 * parameter its own callers use - is a type-level fact the compiler checks and
 * AC1 exercises by composing a named bundle; the gesture itself is B3.
 * AC10c4 - the selection checkbox meets the house 44px touch target - is
 * MEASURED at 390px in B12, on the rendered control rather than on the class
 * list that was meant to produce it.
 */

test('AC10d: an unreadable file reports instead of vanishing', () => {
  const page = read('src/app/vaca-mgmt/proposals/page.tsx');
  // A File whose text() rejects cannot be handed to a browser through the file
  // input, so this one path stays a source assertion: an unreadable drop must
  // not fail as a preview that simply never appears. Its sibling - a denied
  // clipboard - IS drivable, and B2 drives it.
  expect(page).toContain(`title: 'Could not read that file'`);
  expect(page).toMatch(/f\.text\(\)[\s\S]*?\.catch\(/);
});

test('AC10m2: driven - restore moves a revoked proposal to draft, and refuses any other', async () => {
  const env = { ...process.env };
  const realFetch = globalThis.fetch;
  const realError = console.error;
  process.env.SUPABASE_SECRET_KEY = 'stub-key';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://postgrest.stub';
  console.error = () => {};
  const id = '33333333-3333-3333-3333-333333333333';
  const proposal = {
    id, token: 'c'.repeat(43), client_name: 'Yusuf Adeyemi', client_email: 'yusuf@example.com',
    title: 'Primary suite addition', status: 'revoked', lead_id: null,
    sent_at: '2026-08-01T00:00:00Z', revoked_at: '2026-08-02T00:00:00Z',
    created_at: '2026-07-01T00:00:00Z', updated_at: '2026-08-02T00:00:00Z',
  };
  const calls: { method: string; url: string; body: unknown }[] = [];
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });

  const restore = () => proposalAction(
    new NextRequest(`http://localhost/api/admin/proposals/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restore' }),
    }),
    { params: Promise.resolve({ id }) },
  );

  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body });
      if (method === 'GET') return json([proposal]);
      // PostgREST applies the filter: a row that is still revoked is updated.
      if (method === 'PATCH') {
        return url.includes('status=eq.revoked')
          ? json([{ ...proposal, status: 'draft', revoked_at: null }])
          : json([]);
      }
      return json([]);
    }) as typeof fetch;

    const ok = await restore();
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, status: 'draft' });
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.url).toContain('status=eq.revoked');
    expect(patch.body).toEqual({ status: 'draft', revoked_at: null });
    // sent_at survives the round trip - the record of a delivery that happened.
    expect(JSON.stringify(patch.body)).not.toContain('sent_at');

    // A proposal that is NOT revoked matches no row, and that is the refusal:
    // 409, not a silent 200 claiming a transition that never happened.
    calls.length = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET') return json([{ ...proposal, status: 'draft', revoked_at: null }]);
      return json([]);
    }) as typeof fetch;
    const refused = await restore();
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toMatch(/only a revoked proposal can be restored/);
  } finally {
    globalThis.fetch = realFetch;
    console.error = realError;
    process.env = env;
  }
});

test('AC10o: a malformed id is answered as one, without touching the database', async () => {
  const env = { ...process.env };
  const realFetch = globalThis.fetch;
  process.env.SUPABASE_SECRET_KEY = 'stub-key';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://postgrest.stub';
  let fetched = 0;
  globalThis.fetch = (async () => {
    fetched += 1;
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    // 36 characters of hex and dashes that Postgres cannot cast to UUID. The
    // loose guard let these through to PostgREST, whose 400 threw into the
    // catch and came back as a 500 'Could not complete that action' - an outage
    // message, and a logged error, for a client's own malformed input.
    for (const bad of ['-'.repeat(36), 'a'.repeat(36), '1111111-1111-1111-1111-1111111111111']) {
      const res = await proposalAction(
        new NextRequest(`http://localhost/api/admin/proposals/${bad}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'revoke' }),
        }),
        { params: Promise.resolve({ id: bad }) },
      );
      expect(res.status, bad).toBe(400);
      expect((await res.json()).error).toBe('Bad id');
    }
    expect(fetched, 'a malformed id never reaches the database').toBe(0);
  } finally {
    globalThis.fetch = realFetch;
    process.env = env;
  }
});

/*
 * AC10l - a failed proposal read is an outage, never "No such proposal" - is
 * the same claim AC10l2 below drives on the running route: the pre-flight read
 * used to swallow EVERY failure into null and answer 404, so an unreachable
 * Supabase told an admin pressing the D3 kill switch that their proposal did
 * not exist, with nothing logged to correct them. Both verdicts and the log
 * line are asserted there, from the outside.
 */

test('AC10l2: driven - a revoke during an outage answers 500, and only a missing row answers 404', async () => {
  const env = { ...process.env };
  const realFetch = globalThis.fetch;
  const realError = console.error;
  process.env.SUPABASE_SECRET_KEY = 'stub-key';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://postgrest.stub';
  const logged: string[] = [];
  console.error = (...args: unknown[]) => { logged.push(args.map(String).join(' ')); };
  const id = '11111111-1111-1111-1111-111111111111';

  try {
    const revoke = () => proposalAction(
      new NextRequest(`http://localhost/api/admin/proposals/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke' }),
      }),
      { params: Promise.resolve({ id }) },
    );

    // The outage: Supabase answers 503, so supabaseRest throws. This used to be
    // swallowed into null and reported as 'No such proposal' - to an admin
    // pressing the kill switch on a row that is plainly on their roster.
    globalThis.fetch = (async () => new Response('{"message":"boom"}', { status: 503 })) as typeof fetch;
    const outage = await revoke();
    expect(outage.status).toBe(500);
    expect((await outage.json()).error).toBe('Could not complete that action');
    // And it is diagnosable, which the silent catch never was.
    expect(logged.join('\n')).toMatch(/proposal revoke failed:[\s\S]*503/);

    // Absence: the read succeeds and the row genuinely is not there.
    logged.length = 0;
    globalThis.fetch = (async () =>
      new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
    const missing = await revoke();
    expect(missing.status).toBe(404);
    expect((await missing.json()).error).toBe('No such proposal');
  } finally {
    globalThis.fetch = realFetch;
    console.error = realError;
    process.env = env;
  }
});

test('AC10h: the fallback name a cleared bundle box restores is composeBundle own', () => {
  // The page's half - typing through empty is allowed, leaving it empty is not,
  // and Create refuses while an unnamed row is on screen - is driven in B23.
  // This is the default that backs it, from the module that generates it.
  const b = composeBundle([
    { title: 'A', priceCents: 100, optional: true },
    { title: 'B', priceCents: 200, optional: true },
  ])!;
  expect(b.title).toBe('Bundle (2 items)');
});

test('AC10i: turning a locked bundle optional asks first, and names what it would expose', () => {
  // The override itself stays - it is the admin's designed backstop over the
  // registry - but a bundle shows only its own name, so flipping one composed
  // from structural work hands the client an all-or-nothing toggle over work
  // whose titles are no longer on screen.
  const b = composeBundle([
    { title: 'Demolition & prep', priceCents: 480000, optional: false },
    { title: 'Vanity - double sink', priceCents: 340000, optional: true },
  ])!;
  expect(b.optional).toBe(false);
  expect(lockedMemberTitles(b.members)).toEqual(['Demolition & prep']);

  // The case a registry re-derivation silently missed: BOTH lines are
  // registry-optional, and the admin locked one BY HAND before combining. The
  // bundle is locked because composeBundle read that override, so the guard has
  // to read the same flag - asking off the registry instead returned [] and let
  // the flip through with nothing asked, in the one case it was written for.
  const adminLocked = composeBundle([
    { title: 'Vanity - double sink', priceCents: 340000, optional: false },
    { title: 'Tile - heated floor upgrade', priceCents: 290050, optional: true },
  ])!;
  expect(adminLocked.optional).toBe(false);
  expect(lockedMemberTitles(adminLocked.members)).toEqual(['Vanity - double sink']);

  // One source of truth, read at ONE moment: composeBundle INITIALIZES the
  // badge from the members it just flattened. That is where the two agree, and
  // it is not a standing invariant - the next line is the admin taking the
  // badge over, which is the whole point of the confirm.
  for (const composed of [b, adminLocked]) {
    expect(composed.optional).toBe(lockedMemberTitles(composed.members).length === 0);
  }
  // The confirmed flip, as the page performs it: THAT ROW and nothing else. The
  // members still name the structural work, so every later reading of them -
  // Unbundle, re-bundling, the guard itself - still sees it.
  const opened = { ...b, optional: true };
  expect(lockedMemberTitles(opened.members)).toEqual(['Demolition & prep']);

  // And a PER-LINE override survives the round trip instead of being re-badged
  // away. It is the one thing that changes a member's own verdict, and it is
  // set before combining, while the line is on screen under its own name.
  expect(restoreMembers(adminLocked.members).map((m) => [m.title, m.optional])).toEqual([
    ['Vanity - double sink', false], ['Tile - heated floor upgrade', true],
  ]);
  // It is preview-only: the persisted contract is still titles and prices.
  for (const m of toStoredMembers(adminLocked.members)) {
    expect(Object.keys(m).sort()).toEqual(['price_cents', 'title']);
  }

  // A bundle read back from STORAGE carries no flags, so there the registry is
  // the fallback - same fail-safe: an unrecognized title counts as locked.
  expect(lockedMemberTitles([
    { title: 'Zorble calibration', price_cents: 1 },
    { title: 'Vanity - double sink', price_cents: 2 },
  ])).toEqual(['Zorble calibration']);

  // An all-optional bundle is the negotiation posture and asks nothing.
  const allOptional = composeBundle([
    { title: 'Tile - heated floor upgrade', priceCents: 290050, optional: true },
    { title: 'Vanity - double sink', priceCents: 340000, optional: true },
  ])!;
  expect(lockedMemberTitles(allOptional.members)).toEqual([]);

  // Every fixture above is judged the same way by the badge and by the guard,
  // which is what "ONE predicate" means where it can be observed - the two
  // cannot drift apart while they keep agreeing on the storage-read case, the
  // hand-locked case and the all-optional case alike. The page's half - the
  // dialog, its contents, and that it only ever asks in the exposing direction
  // - is driven in B7, B8 and B9.
});

test('AC10j: a bundle owns its badge; its members own their verdicts', () => {
  /** The page's flip: THAT ROW, never the members underneath it. */
  const flip = <T extends { optional: boolean; members: PreviewBundleMember[] }>(b: T): T =>
    ({ ...b, optional: !b.optional });

  const inner = composeBundle([
    { title: 'Demolition & prep', priceCents: 480000, optional: false },
    { title: 'Vanity - double sink', priceCents: 340000, optional: true },
  ], 'Bathroom package')!;
  expect(inner.optional).toBe(false);
  expect(lockedMemberTitles(inner.members)).toEqual(['Demolition & prep']);

  // The admin reads the confirm naming the demolition and accepts: ONE
  // all-or-nothing toggle over this package is what they agreed to.
  const opened = flip(inner);
  expect(opened.optional).toBe(true);

  // UNBUNDLE gives every member back its own verdict, not the package's. The
  // demolition is the line the registry fail-safe is written to protect, and an
  // individual client toggle on it is exactly the cherry-picking the bundle
  // posture exists to prevent - which is not what "one toggle over all of it"
  // asked for.
  expect(restoreMembers(opened.members).map((m) => [m.title, m.optional])).toEqual([
    ['Demolition & prep', false], ['Vanity - double sink', true],
  ]);
  // The same reading in the other direction: locking an all-optional package
  // cannot quietly strip the selections the estimator marked optional.
  const allOptional = composeBundle([
    { title: 'Tile - heated floor upgrade', priceCents: 290050, optional: true },
    { title: 'Vanity - double sink', priceCents: 340000, optional: true },
  ])!;
  expect(restoreMembers(flip(allOptional).members).map((m) => m.optional)).toEqual([true, true]);

  // A LOCK-THEN-UNLOCK round trip on that package asks nothing. Nothing inside
  // is structural; the badge reads locked only because the admin clicked Lock
  // one action earlier, and a guard that fires falsely on an undo is what
  // trains an admin to click through the dialog that protects the demolition.
  expect(lockedMemberTitles(flip(allOptional).members)).toEqual([]);

  // NESTING flattens the intrinsic verdicts and initializes the new package
  // from them, so the demolition inside `opened` locks whatever it is combined
  // into - and the guard, which only asks on a locked bundle, is reached again
  // for the package actually being sent rather than answered once, elsewhere,
  // about a different one.
  const nested = composeBundle([
    { title: opened.title, priceCents: opened.priceCents, optional: opened.optional, members: opened.members },
    { title: 'Tile - heated floor upgrade', priceCents: 290050, optional: true },
  ])!;
  expect(lockedMemberTitles(nested.members)).toEqual(['Demolition & prep']);
  expect(nested.optional, 'a locked member locks the bundle it is nested into').toBe(false);
  expect(nested.optional).toBe(lockedMemberTitles(nested.members).length === 0);
  // The label comes off that same member, so an optional package can never wear
  // a structural slug (nor the reverse) while the badge says otherwise.
  expect(nested.category).toBe('demolition');
  expect(composeBundle([
    { title: 'Tile - heated floor upgrade', priceCents: 290050, optional: true },
    { title: 'Vanity - double sink', priceCents: 340000, optional: true },
  ])!.category).toBe('tile');
  // Money still flattens rather than double-counting, at either depth.
  expect(nested.priceCents).toBe(480000 + 340000 + 290050);
  expect(nested.members).toHaveLength(3);

  // A category handed IN would be a stale label the moment a bundle was nested,
  // and every category asserted above is instead the one composeBundle derived
  // from the member that decided the badge. Nothing carries one in: BundleInput
  // has no such field, which the compiler enforces on every call site.

  // The page's half - flipping a bundle writes THAT ROW and never cascades onto
  // its members, so unbundling gives the demolition back locked - is driven in
  // B7, and the nesting round trip in B8.
});

test('AC10e: Send is refused while the client page does not exist', async () => {
  // Slice 2 ships the admin side only. Flipping this constant is Slice 3's job,
  // in the same commit that adds /proposal/[token].
  expect(CLIENT_PAGE_LIVE).toBe(false);

  // Driven, because the UI's disabled button is not the guard: a mis-click, a
  // stale tab or a hand-made request must not be able to put a link that 404s
  // into a client's inbox. The route refuses before anything reaches the
  // mailer, and it refuses a proposal that is otherwise perfectly sendable.
  await withPostgrest(
    () => restJson([proposalRow({ client_email: 'rachel@example.com' })]),
    async (calls) => {
      const res = await lifecycle(PROPOSAL_ID, { action: 'send' });
      expect(res.status).toBe(409);
      expect((await res.json()).error).toMatch(/not live yet/i);
      // Nothing was written either: the proposal does not come back reading
      // 'sent' behind an email that was never sent.
      expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
      expect(calls.some((c) => c.url.includes('email')), 'no delivery was attempted').toBe(false);
    },
  );

  // Copy link stays unconditional beside it - holding a link is not sending one
  // - which is B1, where both buttons are on screen together.
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
