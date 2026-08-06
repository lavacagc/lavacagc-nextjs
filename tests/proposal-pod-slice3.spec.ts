import { test, expect } from '@playwright/test';
import { NextRequest } from 'next/server';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { draftLinkHasExpired } from '../src/lib/proposals/linkWindow';
import {
  lookupPublicProposal, proposalLinkIsLive, DRAFT_LINK_LIFETIME_MS, PROPOSAL_TOKEN_RE,
  type ProposalStatus,
} from '../src/lib/proposals/publicView';
import { submitProposal, ProposalSubmitSchema, type SubmissionRecord } from '../src/lib/proposals/submit';
import {
  buildProposalSubmissionEmail, buildProposalSubmissionTelegram, alertOwnerOfSubmission,
  PROPOSAL_ALERT_FROM,
} from '../src/lib/proposals/ownerAlert';
import { usd } from '../src/lib/proposals/money';
import { CLIENT_PAGE_LIVE } from '../src/lib/proposals/clientPage';
import { PROPOSAL_CATEGORIES } from '../src/lib/proposals/categories';
import { isPrivateTokenPage, PRIVATE_TOKEN_PATHS } from '../src/lib/privatePages';
import { POST as proposalSubmit } from '../src/app/api/proposal/[token]/submit/route';
import { POST as proposalAction } from '../src/app/api/admin/proposals/[id]/route';

/**
 * Proposal Pod - Slice 3 ACs (owner decisions of 5 Aug 2026: one slice
 * including submit-back, drafts resolve, confirm-then-adjust, analytics left
 * as-is).
 *
 * Two halves, the same contract as slice 2:
 *  - REGRESSION (AC-R): nothing that works today is lost. This slice flips a
 *    constant four admin controls read, punches a public route through a
 *    catch-all middleware, extends an email union shared by every send, and
 *    starts writing a table the roster already counts. Each is a place
 *    something could quietly break, and each has a test here.
 *  - NEW CAPABILITY (AC-S3): the lookup's three states, the WEB-022 refusals,
 *    the server re-sum, the member-price contract, and the owner alert.
 *
 * WHAT IS ASSERTED, AND HOW - inherited from slice 2 and worth restating.
 * Behaviour is DRIVEN: the modules are called, and the routes run against a
 * PostgREST stubbed at the fetch boundary, so what these tests observe is the
 * request the product would really have sent. Reading source text is reserved
 * for what has no runtime to observe here: the middleware's route lists, the
 * page's static metadata, the icon map inside a client component, the
 * migrations directory, and the analytics files this slice must NOT touch.
 *
 * Everything that only exists once React is mounted - the switches, the running
 * total, the zero-network guarantee, the 390px geometry - is owned by
 * tests/proposal-pod-slice3-e2e.spec.ts, which drives a real browser against a
 * real Next server. Its test titles carry the AC ids it owns.
 */

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

interface RestCall { method: string; url: string; body: unknown }

const restJson = (payload: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(payload), {
    status, headers: { 'Content-Type': 'application/json', ...headers },
  });

/** Run `body` with every outbound fetch answered by `respond`. */
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

const TOKEN = 'a'.repeat(43);
const PROPOSAL_ID = '44444444-4444-4444-4444-444444444444';
const L = (n: number) => `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${n.toString().repeat(12)}`;

/** Two locked lines and two optional ones, one of which is a bundle. */
const LINES = [
  {
    id: L(1), position: 0, title: 'Demolition and debris removal', description: 'Strip to studs.',
    price_cents: 340000, optional: false, category: 'demolition', bundle_members: null,
  },
  {
    id: L(2), position: 1, title: 'Rough plumbing relocation', description: '',
    price_cents: 480000, optional: false, category: 'plumbing_rough', bundle_members: null,
  },
  {
    id: L(3), position: 2, title: 'Porcelain floor and wall tile', description: 'Large format.',
    price_cents: 680000, optional: true, category: 'tile', bundle_members: null,
  },
  {
    id: L(4), position: 3, title: 'Designer fixture package', description: 'Priced as one package.',
    price_cents: 430000, optional: true, category: 'fixtures',
    bundle_members: [
      { title: 'Rain shower head', price_cents: 250000 },
      { title: 'Freestanding tub filler', price_cents: 180000 },
    ],
  },
];

const LOCKED_TOTAL = 340000 + 480000;
const FULL_TOTAL = LOCKED_TOTAL + 680000 + 430000;

const HOUR_MS = 60 * 60 * 1000;
/**
 * Fixture timestamps are RELATIVE to the run, because the draft window is
 * relative to now: a hard-coded `updated_at` would quietly turn every draft
 * fixture here into an expired one the day after it was written.
 */
const agoIso = (ms: number) => new Date(Date.now() - ms).toISOString();

const proposalRow = (over: Record<string, unknown> = {}) => ({
  id: PROPOSAL_ID, token: TOKEN, client_name: 'Sarah Whitfield',
  client_email: 'sarah@example.com', title: 'Primary bath remodel', status: 'draft',
  lead_id: null, sent_at: null, revoked_at: null,
  created_at: agoIso(96 * HOUR_MS), updated_at: agoIso(HOUR_MS),
  ...over,
});

/** Answer the reads the client page and the submit route make, in order. */
const serveProposal = (over: Record<string, unknown> = {}) => (call: RestCall): Response => {
  if (call.url.includes('/proposals?')) return restJson([proposalRow(over)]);
  if (call.url.includes('/proposal_lines?')) return restJson(LINES);
  if (call.url.includes('/proposal_submissions?')) return restJson([]);
  if (call.url.includes('/rate_limits')) return restJson([]);
  return restJson([]);
};

const submitRequest = (token: string, payload: unknown) => proposalSubmit(
  new NextRequest(`http://localhost/api/proposal/${token}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'user-agent': 'spec-agent' },
    body: JSON.stringify(payload),
  }),
  { params: Promise.resolve({ token }) },
);

/** The roster's Send button, as the route sees it. */
const sendAction = () => proposalAction(
  new NextRequest(`http://localhost/api/admin/proposals/${PROPOSAL_ID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'send' }),
  }),
  { params: Promise.resolve({ id: PROPOSAL_ID }) },
);

const isDelivery = (c: RestCall) => c.url.includes('api.resend.com');
/** The link-window refresh: the only PATCH on the row that carries a status filter. */
const isRefresh = (c: RestCall) => c.method === 'PATCH' && c.url.includes('status=eq.');
const isStatusWrite = (c: RestCall) => c.method === 'PATCH'
  && c.url.includes('proposals?id=') && !c.url.includes('status=eq.');

const record = (over: Partial<SubmissionRecord> = {}): SubmissionRecord => ({
  proposalId: PROPOSAL_ID,
  clientName: 'Sarah Whitfield',
  proposalTitle: 'Primary bath remodel',
  leadId: null,
  totalCents: FULL_TOTAL,
  included: LINES.map((l) => ({
    id: l.id, title: l.title, price_cents: l.price_cents, optional: l.optional,
  })),
  declined: [],
  touched: [],
  isRevision: false,
  priorSubmissions: 0,
  ...over,
});

// ---------------------------------------------------------------- REGRESSION

test('AC-R1: every pre-slice admin sidebar capability is still present', () => {
  const sidebar = read('src/components/admin/AdminSidebar.tsx');
  const before = [
    'dashboard', 'diagnostics', 'ai',
    'blog', 'pages', 'services', 'service-areas', 'projects', 'listings', 'banners',
    'seo', 'seo-suggestions', 'analytics', 'gmb',
    'leads', 'subscribers', 'home-records', 'follow-ups', 'send-estimate',
    'send-service-quote', 'crew', 'estimate-log', 'emails', 'preferences', 'releases',
    'proposals',
  ];
  for (const id of before) {
    expect(sidebar, `sidebar must keep '${id}'`).toContain(`id: '${id}'`);
  }
});

test('AC-R2: the admin gate is untouched, and the client route is registered PUBLIC', () => {
  const middleware = read('src/middleware.ts');
  // The gates that existed before this slice.
  expect(middleware).toContain(`'/vaca-mgmt'`);
  expect(middleware).toContain('/api/admin/');
  // The client submit route is self-guarded by its token, and says so in the
  // PUBLIC list rather than relying on not matching an admin prefix - so a
  // later broad rule cannot sweep it into the admin gate.
  expect(middleware).toContain(`'/api/proposal/',`);
  const adminBlock = middleware.slice(
    middleware.indexOf('const ADMIN_AUTH_ROUTES'),
    middleware.indexOf('const CRON_AUTH_ROUTES'),
  );
  expect(adminBlock).not.toContain('proposal');
});

test('AC-R3: the admin content tabs are unchanged', () => {
  const content = read('src/components/AdminContent.tsx');
  for (const tab of ['proposals', 'home-records', 'preferences', 'crew']) {
    expect(content).toContain(`<TabsContent value="${tab}">`);
  }
});

test('AC-R4: Send is live now, and every OTHER refusal it had still holds', async () => {
  expect(CLIENT_PAGE_LIVE).toBe(true);

  // A proposal with no client email is still a 400, not a silent no-op.
  await withPostgrest(
    () => restJson([proposalRow({ client_email: null })]),
    async () => {
      const res = await proposalAction(
        new NextRequest(`http://localhost/api/admin/proposals/${PROPOSAL_ID}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'send' }),
        }),
        { params: Promise.resolve({ id: PROPOSAL_ID }) },
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain('No client email');
    },
  );

  // Re-import onto a revoked proposal is still refused with a typed 409.
  await withPostgrest(
    () => restJson([proposalRow({ status: 'revoked', revoked_at: '2026-08-05T00:00:00Z' })]),
    async () => {
      const res = await proposalAction(
        new NextRequest(`http://localhost/api/admin/proposals/${PROPOSAL_ID}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'reimport',
            lines: [{ title: 'Demo', description: '', price_cents: 100, optional: false, category: 'demolition' }],
          }),
        }),
        { params: Promise.resolve({ id: PROPOSAL_ID }) },
      );
      expect(res.status).toBe(409);
    },
  );
});

test('AC-R5: the importer keeps the guard that produced its not-live notice', () => {
  // The sentence is conditional on the flag, so flipping the flag removed it
  // from the screen without touching the page - and putting the flag back would
  // bring both the notice and the refusal back together.
  const page = read('src/app/vaca-mgmt/proposals/page.tsx');
  expect(page).toContain('CLIENT_PAGE_LIVE ? null :');
  expect(page).toContain('CLIENT_PAGE_NOT_LIVE_MESSAGE');
  const route = read('src/app/api/admin/proposals/[id]/route.ts');
  expect(route).toContain('if (!CLIENT_PAGE_LIVE)');
});

test('AC-R6: every prior email category survives, and the audit filter offers the new one', () => {
  const sendEmail = read('src/lib/notify/sendEmail.ts');
  const before = [
    'verification', 'welcome', 'estimate', 'lead_followup', 'lead_notification',
    'home_care_newsletter', 'buy_remodel', 'seo_report', 'staged_draft', 'rollback_digest',
    'form_error', 'feedback_request', 'broadcast', 'release', 'service_quote',
    'visit_reminder', 'crew_dispatch', 'crew_dispatch_cancelled', 'proposal_delivery', 'other',
  ];
  for (const c of before) {
    expect(sendEmail, `EmailCategory must keep '${c}'`).toContain(`| '${c}'`);
  }
  expect(sendEmail).toContain(`| 'proposal_submission'`);
  // The admin filter is a Record over the union, so it fails the build when it
  // drifts; this pins that it was updated rather than widened.
  const emailsPage = read('src/app/vaca-mgmt/emails/page.tsx');
  expect(emailsPage).toContain('proposal_submission: true');
  expect(emailsPage).toContain('proposal_delivery: true');
});

test('AC-R7: analytics is left exactly as it was (owner decision, 5 Aug 2026)', () => {
  const layout = read('src/app/layout.tsx');
  // Both tags, and the GPC guard that is the only thing gating them today.
  expect(layout).toContain('clarity.ms/tag/');
  expect(layout).toContain("fbq('init'");
  expect(layout.match(/navigator\.globalPrivacyControl/g)?.length).toBe(2);
  // Neither analytics file learned about proposals or about the chrome helper:
  // the decision was to leave the third-party tags alone, and a test is how it
  // stays left alone.
  expect(layout).not.toContain('privatePages');
  const analytics = read('src/components/Analytics.tsx');
  expect(analytics).toContain("pathname.startsWith('/admin')");
  expect(analytics).toContain("pathname.startsWith('/vaca-mgmt')");
  expect(analytics).toContain("pathname.startsWith('/auth')");
  expect(analytics).not.toContain('proposal');
  expect(analytics).not.toContain('privatePages');
});

test('AC-R8: the pod needed no DDL - its schema still ends at 20260827000000', () => {
  const files = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql'));

  // The pod's OWN migrations, all four from slices 1 and 2. Slice 3 added none,
  // which is what let it go live by merge-and-deploy with nothing hand-applied.
  const POD = [
    '20260824000000_proposals.sql',
    '20260825000000_proposal_bundles.sql',
    '20260826000000_proposal_roster_counts.sql',
    '20260827000000_proposal_bundle_check_guards.sql',
  ];
  for (const m of POD) expect(files, `${m} must still be present`).toContain(m);

  // And nothing since has changed the pod's schema underneath the code.
  //
  // SCOPED TO THE POD'S TABLES, deliberately. This began as "the newest
  // migration in the repo is 20260827000000", which was true the day it was
  // written and is a claim about the WHOLE repository: the next migration any
  // unrelated feature adds fails it, having changed nothing about this pod. A
  // sibling branch adding 20260828000000_home_care_products.sql was already
  // queued to trip it. What the AC means is that slice 3 needed no DDL and that
  // the schema it runs against is still the one it was written for, and that is
  // what this now says.
  // Comments are stripped first, and that is not a detail. These migrations
  // argue for their own shape at length and cite each other while doing it -
  // the home-care products migration names `proposals` three times explaining
  // why it copies the pod's deny-by-default RLS and its no-existence-guard
  // rule. Matching prose would fail this AC for a file that quotes the pod as
  // precedent without touching a single one of its tables, which is the
  // opposite of the point.
  const POD_TABLES = /\b(public\.)?(proposals|proposal_lines|proposal_submissions)\b/;
  const newer = files.filter((f) => f.slice(0, 14) > '20260827000000');
  for (const f of newer) {
    const sql = read(`supabase/migrations/${f}`)
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n');
    expect(POD_TABLES.test(sql), `${f} must not touch the proposal pod's tables`).toBe(false);
  }
});

test('AC-R9: the security headers are unchanged', () => {
  const config = read('next.config.ts');
  expect(config).toContain("key: 'Referrer-Policy'");
  expect(config).toContain("value: 'strict-origin-when-cross-origin'");
  expect(config).toContain("key: 'Content-Security-Policy'");
  expect(config).toContain("key: 'X-Content-Type-Options'");
});

test('AC-R10: the new rate-limit buckets are namespaced away from every existing one', () => {
  const view = read('src/app/proposal/[token]/page.tsx');
  const submit = read('src/app/api/proposal/[token]/submit/route.ts');
  expect(view).toContain('`proposal-view:${');
  expect(submit).toContain('`proposal-submit:${');
  // Buckets already spent by other features, which must keep their own budgets.
  for (const taken of ['hc-access:', 'lead-submit:', 'chat:']) {
    expect(view).not.toContain(taken);
    expect(submit).not.toContain(taken);
  }
});

test('AC-R11: chrome suppression ADDS to each widget without removing what it already hid', () => {
  const sticky = read('src/components/StickyCTA.tsx');
  expect(sticky).toContain("pathname.startsWith('/home-care')");
  expect(sticky).toContain("pathname.startsWith('/vaca-mgmt')");
  expect(sticky).toContain('isPrivateTokenPage(pathname)');
  for (const p of ['/contact', '/services', '/home-services', '/commercial-services', '/request-estimate']) {
    expect(sticky).toContain(`'${p}'`);
  }
  const exit = read('src/components/ExitIntentPopup.tsx');
  for (const p of ['/admin', '/vaca-mgmt', '/auth', '/blog', '/do-not-sell', '/privacy-policy', '/terms-and-conditions', '/home-care']) {
    expect(exit).toContain(`pathname.startsWith('${p}')`);
  }
  expect(exit).toContain('isPrivateTokenPage(pathname)');
  const toast = read('src/components/ReviewToast.tsx');
  expect(toast).toContain('isHighIntentRoute');
  expect(toast).toContain('isAdminSession');
  expect(toast).toContain('isPrivateTokenPage(pathname)');
  const banner = read('src/components/SmartBanner.tsx');
  expect(banner).toContain("pathname.startsWith('/home-care')");
  expect(banner).toContain('isPrivateTokenPage(pathname)');
});

test('AC-R12: the private-page list covers the tokenized routes and nothing adjacent', () => {
  expect([...PRIVATE_TOKEN_PATHS]).toEqual(['/proposal', '/intake', '/crew']);
  expect(isPrivateTokenPage('/proposal/abc')).toBe(true);
  expect(isPrivateTokenPage('/intake/abc')).toBe(true);
  expect(isPrivateTokenPage('/crew/confirm/abc')).toBe(true);
  // A marketing page that merely starts with the same letters keeps its chrome.
  expect(isPrivateTokenPage('/proposals-explained')).toBe(false);
  expect(isPrivateTokenPage('/')).toBe(false);
  expect(isPrivateTokenPage(null)).toBe(false);
});

// ---------------------------------------------------------- NEW CAPABILITY

test('AC-S3-1: the lookup keeps its three states apart, and revoked reads as missing', async () => {
  await withPostgrest(serveProposal(), async () => {
    const ok = await lookupPublicProposal(TOKEN);
    expect(ok.state).toBe('ok');
  });
  // A draft resolves inside its 24-hour window (owner decision, 5 Aug 2026),
  // and a sent proposal resolves with no lifetime at all. AC-S3-18 owns the
  // window itself.
  for (const status of ['draft', 'sent']) {
    await withPostgrest(serveProposal({ status }), async () => {
      expect((await lookupPublicProposal(TOKEN)).state).toBe('ok');
    });
  }
  // Revoked gets the SAME answer as a token that was never ours.
  await withPostgrest(serveProposal({ status: 'revoked' }), async () => {
    expect((await lookupPublicProposal(TOKEN)).state).toBe('missing');
  });
  await withPostgrest(() => restJson([]), async () => {
    expect((await lookupPublicProposal(TOKEN)).state).toBe('missing');
  });
  // A database we could not read is NOT a verdict about anybody's token.
  await withPostgrest(() => restJson({ message: 'boom' }, 500), async () => {
    expect((await lookupPublicProposal(TOKEN)).state).toBe('unreadable');
  });
  // Neither is a proposal that resolved but holds no lines.
  await withPostgrest(
    (call) => (call.url.includes('/proposals?') ? restJson([proposalRow()]) : restJson([])),
    async () => {
      expect((await lookupPublicProposal(TOKEN)).state).toBe('unreadable');
    },
  );
});

test('AC-S3-18: a draft link lives 24 hours from updated_at; a sent one has no lifetime', async () => {
  // Inside the window. This is the link an admin pastes into a text message,
  // and the client on the other end has to be able to open it.
  await withPostgrest(serveProposal({ updated_at: agoIso(23 * HOUR_MS) }), async () => {
    expect((await lookupPublicProposal(TOKEN)).state).toBe('ok');
  });

  // Past it, and the answer is the one an unknown token gets, to the field.
  // Anything that told them apart would let somebody test a token for life.
  let unknownAnswer: unknown;
  await withPostgrest(() => restJson([]), async () => {
    unknownAnswer = await lookupPublicProposal('z'.repeat(43));
  });
  await withPostgrest(serveProposal({ updated_at: agoIso(25 * HOUR_MS) }), async () => {
    expect(await lookupPublicProposal(TOKEN)).toEqual(unknownAnswer);
  });

  // Re-importing a draft's lines moves updated_at through
  // proposal_lines_touch_proposal, which is WHY the window is measured from it
  // rather than created_at: a week-old draft whose lines were just corrected is
  // live again for another day.
  await withPostgrest(
    serveProposal({ created_at: agoIso(20 * 24 * HOUR_MS), updated_at: agoIso(5 * 60 * 1000) }),
    async () => {
      expect((await lookupPublicProposal(TOKEN)).state).toBe('ok');
    },
  );

  // A SENT proposal is governed by D3 instead - no hard expiry, revocable from
  // the admin - and a month of silence does not touch it.
  await withPostgrest(
    serveProposal({
      status: 'sent', sent_at: agoIso(30 * 24 * HOUR_MS), updated_at: agoIso(30 * 24 * HOUR_MS),
    }),
    async () => {
      expect((await lookupPublicProposal(TOKEN)).state).toBe('ok');
    },
  );

  // ONE number, and one rule, which is what keeps the page and the submit route
  // from ever disagreeing about whether a link is live.
  expect(DRAFT_LINK_LIFETIME_MS).toBe(24 * 60 * 60 * 1000);
  const live = (status: ProposalStatus, ago: number) =>
    proposalLinkIsLive({ status, updated_at: agoIso(ago) });
  expect(live('draft', 0)).toBe(true);
  expect(live('draft', DRAFT_LINK_LIFETIME_MS - 60 * 1000)).toBe(true);
  expect(live('draft', DRAFT_LINK_LIFETIME_MS + 60 * 1000)).toBe(false);
  expect(live('sent', 365 * 24 * HOUR_MS)).toBe(true);
  expect(live('revoked', 0)).toBe(false);
  // A timestamp we cannot read CLOSES the window: a draft that stops resolving
  // is recoverable, a draft that never stops is not.
  expect(proposalLinkIsLive({ status: 'draft', updated_at: null })).toBe(false);
  expect(proposalLinkIsLive({ status: 'draft', updated_at: 'whenever' })).toBe(false);
});

test('AC-S3-19: an expired draft accepts no answer, and says only what a dead link says', async () => {
  const env = { ...process.env };
  delete process.env.RESEND_API_KEY;
  delete process.env.TELEGRAM_BOT_TOKEN;
  try {
    let deadEnd: string | undefined;
    await withPostgrest(() => restJson([]), async () => {
      const res = await submitRequest('z'.repeat(43), { included_line_ids: [L(1)] });
      expect(res.status).toBe(404);
      deadEnd = (await res.json()).error;
    });

    // The submit door is closed on exactly the links the page has stopped
    // serving, with the identical sentence, and nothing is written.
    await withPostgrest(serveProposal({ updated_at: agoIso(25 * HOUR_MS) }), async (calls) => {
      const res = await submitRequest(TOKEN, { included_line_ids: LINES.map((l) => l.id) });
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe(deadEnd);
      expect(calls.some((c) => c.method === 'POST' && c.url.includes('proposal_submissions'))).toBe(false);
    });

    // Still a window and not a ban: the same draft an hour after a re-import
    // takes the answer it was sent to collect.
    await withPostgrest(serveProposal({ updated_at: agoIso(HOUR_MS) }), async (calls) => {
      const res = await submitRequest(TOKEN, { included_line_ids: LINES.map((l) => l.id) });
      expect(res.status).toBe(200);
      expect(calls.some((c) => c.method === 'POST' && c.url.includes('proposal_submissions'))).toBe(true);
    });
  } finally {
    process.env = env;
  }
});

test('AC-S3-20: an empty selection is never offered, and is refused if it is sent anyway', async () => {
  // The page's own guard (owner decision, 5 Aug 2026): a client who turns every
  // line of an all-optional proposal off gets a disabled Send and a sentence
  // saying why, rather than a refusal about an unreadable payload for a payload
  // this page produced. The DOM half is the e2e spec's.
  const view = read('src/app/proposal/[token]/ProposalView.tsx');
  expect(view).toContain('const nothingChosen = includedLines.length === 0');
  expect(view).toContain('disabled={phase === \'sending\' || nothingChosen}');
  expect(view).toContain('Turn at least one choice on');
  expect(view).toContain('(201) 212-4917');
  // The sentence beside it asks whether there ARE locked lines, not what they
  // come to: proposal_lines_price_range permits a zero-priced locked line (a
  // no-charge dumpster, permits carried by the owner), and 'every line here is
  // yours to choose' is false while a section nobody can touch sits above it.
  expect(view).toContain('locked.length > 0');
  expect(view).not.toContain('lockedTotalCents > 0');

  // And the server keeps every guard it had. The UI is the explanation, not the
  // enforcement: the schema refuses an empty array...
  expect(ProposalSubmitSchema.safeParse({ included_line_ids: [] }).success).toBe(false);
  // ...the route answers 400 rather than storing anything...
  await withPostgrest(serveProposal(), async (calls) => {
    const res = await submitRequest(TOKEN, { included_line_ids: [], touched_line_ids: [] });
    expect(res.status).toBe(400);
    expect(calls.some((c) => c.method === 'POST' && c.url.includes('proposal_submissions'))).toBe(false);
  });
  // ...and the table itself could not hold one.
  expect(read('supabase/migrations/20260824000000_proposals.sql'))
    .toContain('proposal_submissions_included_lines_present');
});

test('AC-S3-21: Send refreshes the link window BEFORE it delivers, and never fails on it', async () => {
  const env = { ...process.env };
  process.env.RESEND_API_KEY = 'stub';

  try {
    // The refresh is issued FIRST, and the delivery-before-status-write
    // ordering behind it is untouched.
    await withPostgrest(
      (call) => (isDelivery(call)
        ? restJson({ id: 'stub-email-id' })
        : serveProposal({ updated_at: agoIso(25 * HOUR_MS) })(call)),
      async (calls) => {
        expect((await sendAction()).status).toBe(200);
        const refresh = calls.findIndex(isRefresh);
        const delivery = calls.findIndex(isDelivery);
        const status = calls.findIndex(isStatusWrite);
        expect(refresh, 'the window was refreshed').toBeGreaterThan(-1);
        expect(delivery, 'the refresh comes before the delivery').toBeGreaterThan(refresh);
        expect(status, 'the status write still comes after the delivery').toBeGreaterThan(delivery);
        // It moves the timestamp by writing back the status it read, and lets
        // proposals_set_updated_at own the column (slice 2's AC6l).
        expect(calls[refresh].body).toEqual({ status: 'draft' });
        expect(calls[refresh].url).toContain('status=eq.draft');
      },
    );

    // A refresh that FAILS is not a reason to refuse an admin who asked to send
    // a proposal: the delivery happens and the status is still written.
    await withPostgrest(
      (call) => {
        if (isRefresh(call)) return restJson({ message: 'nope' }, 500);
        if (isDelivery(call)) return restJson({ id: 'stub-email-id' });
        return serveProposal()(call);
      },
      async (calls) => {
        const res = await sendAction();
        expect(res.status).toBe(200);
        expect((await res.json()).status).toBe('sent');
        expect(calls.some(isDelivery), 'it still delivered').toBe(true);
        expect(calls.some(isStatusWrite), 'it still marked sent').toBe(true);
      },
    );

    // The case the refresh exists for: the status write fails after the email
    // is already in the client's inbox. The proposal still reads 'draft', and
    // its link has to open anyway.
    let live = proposalRow({ updated_at: agoIso(25 * HOUR_MS) });
    await withPostgrest(
      (call) => {
        if (isDelivery(call)) return restJson({ id: 'stub-email-id' });
        if (isRefresh(call)) {
          live = { ...live, updated_at: new Date().toISOString() };
          // The UPDATED ROW, the way PostgREST answers a PATCH that matched
          // one: the refresh reports whether it wrote anything, and an empty
          // array is how a status changed underneath it arrives.
          return restJson([live]);
        }
        if (isStatusWrite(call)) return restJson({ message: 'down' }, 500);
        if (call.url.includes('/proposals?')) return restJson([live]);
        if (call.url.includes('/proposal_lines?')) return restJson(LINES);
        return restJson([]);
      },
      async () => {
        // A draft last touched 25 hours ago: before the send, its link is dead.
        expect((await lookupPublicProposal(TOKEN)).state).toBe('missing');

        const res = await sendAction();
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.delivered).toBe(true);
        expect(body.error).toContain('The email WAS delivered');
        // The admin is told what the client sees, and that the retry has a
        // deadline on it.
        expect(body.error).toContain('24 hours from this send');
        expect(body.error).toContain('Press Send again');

        // And the client holding that email opens their proposal rather than
        // the generic dead end.
        expect((await lookupPublicProposal(TOKEN)).state).toBe('ok');
      },
    );
  } finally {
    process.env = env;
  }
});

test('AC-S3-22: the post-delivery failure describes the access it actually established', async () => {
  const env = { ...process.env };
  process.env.RESEND_API_KEY = 'stub';

  /** Drive the send to its post-delivery failure and hand back what the admin reads. */
  const failedStatusWrite = async (
    over: Record<string, unknown>,
    refreshLands: boolean,
  ): Promise<string> => {
    let message = '';
    await withPostgrest(
      (call) => {
        if (isDelivery(call)) return restJson({ id: 'stub-email-id' });
        // A landed refresh answers with the row it matched; a PATCH that
        // matched nothing would be an empty array, and is not a refresh.
        if (isRefresh(call)) {
          return refreshLands ? restJson([proposalRow(over)]) : restJson({ message: 'nope' }, 500);
        }
        if (isStatusWrite(call)) return restJson({ message: 'down' }, 500);
        return serveProposal(over)(call);
      },
      async () => {
        const res = await sendAction();
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.delivered).toBe(true);
        message = body.error;
      },
    );
    return message;
  };

  try {
    // A draft whose window WAS refreshed: the client has the whole window, and
    // the repair has that long to happen.
    const refreshed = await failedStatusWrite({ updated_at: agoIso(25 * HOUR_MS) }, true);
    expect(refreshed).toContain('24 hours from this send');

    // The same failure with the refresh gone too - the likeliest shape of this
    // branch, because both writes are PATCHes on one row seconds apart. It must
    // NOT promise a window it did not buy.
    const unrefreshed = await failedStatusWrite({ updated_at: agoIso(25 * HOUR_MS) }, false);
    expect(unrefreshed).not.toBe(refreshed);
    expect(unrefreshed).not.toContain('24 hours');
    expect(unrefreshed).toContain('does not open right now');
    expect(unrefreshed).toContain('Press Send again');

    // A re-send of an already-sent proposal: D3 gives that link no expiry at
    // all, so there is no deadline to invent. What is stale is the record.
    const resent = await failedStatusWrite(
      { status: 'sent', sent_at: agoIso(72 * HOUR_MS), updated_at: agoIso(72 * HOUR_MS) },
      true,
    );
    expect(resent).not.toContain('24 hours');
    expect(resent).toContain('does not expire');
    expect(resent).toContain('the record, not their access');

    // And a revoked one still says the link is shut, which it is whatever the
    // refresh did.
    const revoked = await failedStatusWrite(
      { status: 'revoked', revoked_at: agoIso(2 * HOUR_MS) },
      true,
    );
    expect(revoked).toContain('does NOT open');
    expect(revoked).not.toContain('24 hours');
  } finally {
    process.env = env;
  }
});

test('AC-S3-2: a malformed token is answered without a database round trip', async () => {
  await withPostgrest(() => restJson([]), async (calls) => {
    for (const bad of ['', 'abc', 'a'.repeat(42), 'a'.repeat(44), `${'a'.repeat(42)}!`]) {
      expect((await lookupPublicProposal(bad)).state).toBe('missing');
    }
    expect(calls).toHaveLength(0);
  });
  // The regex is the schema's own recipe, not a looser guess.
  expect(PROPOSAL_TOKEN_RE.source).toBe('^[A-Za-z0-9_-]{43}$');
  expect(read('supabase/migrations/20260824000000_proposals.sql'))
    .toContain("token ~ '^[A-Za-z0-9_-]{43}$'");
});

test('AC-S3-7: the client projection carries member TITLES and never member prices', async () => {
  await withPostgrest(serveProposal(), async () => {
    const found = await lookupPublicProposal(TOKEN);
    if (found.state !== 'ok') throw new Error('expected ok');
    const bundle = found.proposal.lines.find((l) => l.includes.length > 0);
    expect(bundle?.includes).toEqual(['Rain shower head', 'Freestanding tub filler']);
    // What the server component serializes into the page is this object, so the
    // absence has to hold over the whole of it rather than over one field.
    const serialized = JSON.stringify(found.proposal);
    expect(serialized).not.toContain('250000');
    expect(serialized).not.toContain('180000');
    expect(serialized).not.toContain('price_cents":250000');
    // And nothing the page never renders travels either.
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain('lead_id');
    expect(serialized).not.toContain('client_email');
  });
});

test('AC-S3-5: the locked subtotal and the full total are the lines arithmetic', async () => {
  await withPostgrest(serveProposal(), async () => {
    const found = await lookupPublicProposal(TOKEN);
    if (found.state !== 'ok') throw new Error('expected ok');
    expect(found.proposal.lockedTotalCents).toBe(LOCKED_TOTAL);
    expect(found.proposal.lines.reduce((a, l) => a + l.price_cents, 0)).toBe(FULL_TOTAL);
  });
  expect(usd(FULL_TOTAL)).toBe('$19,300.00');
  expect(usd(0)).toBe('$0.00');
  expect(usd(1)).toBe('$0.01');
});

test('AC-S3-6: every icon the registry can name has a glyph on the client page', () => {
  const view = read('src/app/proposal/[token]/ProposalView.tsx');
  const map = view.slice(view.indexOf('const ICONS'), view.indexOf('function LineIcon'));
  for (const cat of PROPOSAL_CATEGORIES) {
    const key = /^[a-z]+$/.test(cat.icon) ? `${cat.icon}:` : `'${cat.icon}':`;
    expect(map, `ICONS must draw '${cat.icon}'`).toContain(key);
  }
  // The unrecognized-category fallback is the same house the registry uses.
  expect(view).toContain('ICONS[name] ?? House');
});

test('AC-S3-9: a submission that drops a locked line, or names a foreign one, is refused', async () => {
  await withPostgrest(serveProposal(), async (calls) => {
    const dropped = await submitProposal({
      token: TOKEN,
      // Only the optional lines: both locked lines dropped.
      input: { included_line_ids: [L(3), L(4)], touched_line_ids: [] },
      ipAddress: null, userAgent: null,
    });
    expect(dropped.status).toBe('refused');
    expect(calls.some((c) => c.method === 'POST' && c.url.includes('proposal_submissions'))).toBe(false);
  });

  await withPostgrest(serveProposal(), async (calls) => {
    const foreign = await submitProposal({
      token: TOKEN,
      input: {
        included_line_ids: [...LINES.map((l) => l.id), '99999999-9999-4999-8999-999999999999'],
        touched_line_ids: [],
      },
      ipAddress: null, userAgent: null,
    });
    expect(foreign.status).toBe('refused');
    expect(calls.some((c) => c.method === 'POST' && c.url.includes('proposal_submissions'))).toBe(false);
  });

  // A revoked proposal accepts nothing, and says only what a dead link says.
  await withPostgrest(serveProposal({ status: 'revoked' }), async () => {
    const res = await submitProposal({
      token: TOKEN,
      input: { included_line_ids: LINES.map((l) => l.id), touched_line_ids: [] },
      ipAddress: null, userAgent: null,
    });
    expect(res.status).toBe('missing');
  });
});

test('AC-S3-10: the stored snapshot and total are built from the ROWS, not the payload', async () => {
  await withPostgrest(serveProposal(), async (calls) => {
    const res = await submitProposal({
      token: TOKEN,
      // The client declines the tile; everything else stays. Ids repeated on
      // purpose: a doubled switch must not double-count.
      input: { included_line_ids: [L(1), L(2), L(4), L(4)], touched_line_ids: [L(3)] },
      ipAddress: '203.0.113.9', userAgent: 'x'.repeat(900),
    });
    expect(res.status).toBe('ok');
    if (res.status !== 'ok') return;

    const expected = LOCKED_TOTAL + 430000;
    expect(res.record.totalCents).toBe(expected);
    expect(res.record.included.map((l) => l.id)).toEqual([L(1), L(2), L(4)]);
    expect(res.record.declined.map((l) => l.title)).toEqual(['Porcelain floor and wall tile']);

    const write = calls.find((c) => c.method === 'POST' && c.url.includes('proposal_submissions'));
    const row = (write?.body as Record<string, unknown>[])[0];
    expect(row.total_cents).toBe(expected);
    // The snapshot shape the domain requires, on every element.
    for (const el of row.included_lines as Record<string, unknown>[]) {
      expect(Object.keys(el).sort()).toEqual(['id', 'optional', 'price_cents', 'title']);
      expect(Number.isInteger(el.price_cents)).toBe(true);
    }
    // Which is also what the schema's CHECK recomputes.
    expect((row.included_lines as { price_cents: number }[])
      .reduce((a, l) => a + l.price_cents, 0)).toBe(row.total_cents);
    // The whole composition, locked lines included - not the toggles alone.
    expect((row.included_lines as { optional: boolean }[]).filter((l) => !l.optional))
      .toHaveLength(2);
    // An attacker-length user agent is bounded before it reaches a TEXT column.
    expect(String(row.user_agent)).toHaveLength(500);
    expect(row.ip_address).toBe('203.0.113.9');
  });
});

test('AC-S3-12: touched telemetry is filtered to optional lines that exist', async () => {
  await withPostgrest(serveProposal(), async () => {
    const res = await submitProposal({
      token: TOKEN,
      input: {
        included_line_ids: LINES.map((l) => l.id),
        // A locked line and a stranger, alongside one real optional line.
        touched_line_ids: [L(1), L(3), '99999999-9999-4999-8999-999999999999'],
      },
      ipAddress: null, userAgent: null,
    });
    expect(res.status).toBe('ok');
    if (res.status !== 'ok') return;
    expect(res.record.touched.map((l) => l.id)).toEqual([L(3)]);
  });
  // An empty array is a legitimate answer, and the schema accepts it.
  expect(ProposalSubmitSchema.parse({ included_line_ids: [L(1)] }).touched_line_ids).toEqual([]);
});

test('AC-S3-11: a re-submit is stored alongside the first and counted as a revision', async () => {
  await withPostgrest(
    (call) => {
      if (call.url.includes('/proposals?')) return restJson([proposalRow({ status: 'sent' })]);
      if (call.url.includes('/proposal_lines?')) return restJson(LINES);
      // One prior submission, reported through Content-Range as PostgREST does.
      if (call.url.includes('/proposal_submissions?')) {
        return restJson([{ id: 'prior' }], 200, { 'content-range': '0-0/1' });
      }
      return restJson([]);
    },
    async (calls) => {
      const res = await submitProposal({
        token: TOKEN,
        input: { included_line_ids: LINES.map((l) => l.id), touched_line_ids: [] },
        ipAddress: null, userAgent: null,
      });
      expect(res.status).toBe('ok');
      if (res.status !== 'ok') return;
      expect(res.record.priorSubmissions).toBe(1);
      expect(res.record.isRevision).toBe(true);
      // Stored, never overwritten: an INSERT, with no filter naming an old row.
      const write = calls.find((c) => c.method === 'POST' && c.url.includes('proposal_submissions'));
      expect(write).toBeDefined();
      expect(calls.some((c) => c.method === 'PATCH' && c.url.includes('proposal_submissions'))).toBe(false);
      expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
      // And the alert says "revised" rather than announcing a first answer.
      expect(buildProposalSubmissionEmail(record({ isRevision: true, priorSubmissions: 1 })).subject)
        .toContain('Proposal revised');
    },
  );
});

test('AC-S3-13: the owner alert is itemized, sent on both channels, and never self-fetches', async () => {
  const email = buildProposalSubmissionEmail(record({
    declined: [{ id: L(3), title: 'Porcelain floor and wall tile', price_cents: 680000, optional: true }],
    touched: [{ id: L(3), title: 'Porcelain floor and wall tile', price_cents: 680000, optional: true }],
  }));
  expect(email.subject).toBe('Proposal accepted: Sarah Whitfield - $19,300.00');
  for (const line of LINES) {
    expect(email.html, `email must itemize '${line.title}'`).toContain(line.title);
    expect(email.text).toContain(line.title);
  }
  expect(email.html).toContain('$19,300.00');
  expect(email.text).toContain('They turned down (1)');
  // Internal mail keeps the noreply identity; the warm sender is the client's.
  expect(PROPOSAL_ALERT_FROM).toContain('noreply@');

  const telegram = buildProposalSubmissionTelegram(record());
  expect(telegram).toContain('Proposal accepted');
  expect(telegram).toContain('$19,300.00');
  expect(telegram.length).toBeLessThanOrEqual(4096);
  // A 200-line estimate clips the ITEMS, never the total in the header.
  const huge = buildProposalSubmissionTelegram(record({
    included: Array.from({ length: 200 }, (_, i) => ({
      id: L(1), title: `Line item number ${i} with a deliberately long title`, price_cents: 100000, optional: false,
    })),
  }));
  expect(huge.length).toBeLessThanOrEqual(4096);
  expect(huge).toContain('$19,300.00');

  // Both channels escape ONCE. A CSV is where every one of these strings comes
  // from, so an ampersand in a line title or a client's name is ordinary, and
  // escaping it twice does not corrupt the markup - it prints '&amp;' at the
  // owner, in the one message he reads on a phone in a van.
  const amp = buildProposalSubmissionTelegram(record({
    clientName: 'Smith & Sons', included: [
      { id: L(1), title: 'Demo & haul away', price_cents: 340000, optional: false },
    ],
  }));
  expect(amp).toContain('Smith &amp; Sons');
  expect(amp).toContain('Demo &amp; haul away');
  expect(amp).not.toContain('&amp;amp;');

  const ampEmail = buildProposalSubmissionEmail(record({
    clientName: 'Smith & Sons', included: [
      { id: L(1), title: 'Demo & haul away', price_cents: 340000, optional: false },
    ],
  }));
  expect(ampEmail.html).toContain('Demo &amp; haul away');
  expect(ampEmail.html).not.toContain('&amp;amp;');
  // Including the hidden preheader, which the shell drops in verbatim: it is
  // the one interpolation in this email that is not inside a rendered cell, and
  // the one that had no esc() around it.
  expect(ampEmail.html).toContain('Smith &amp; Sons landed on');

  // Both channels are attempted, and nothing is addressed at our own origin.
  const env = { ...process.env };
  process.env.RESEND_API_KEY = 'stub';
  process.env.TELEGRAM_BOT_TOKEN = 'stub-bot';
  process.env.TELEGRAM_CHAT_ID = '999';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.lavacagc.com';
  try {
    await withPostgrest(() => restJson({ id: 'stub-email-id' }), async (calls) => {
      const outcome = await alertOwnerOfSubmission(record());
      expect(outcome.email).toBe('sent');
      expect(outcome.telegram).toBe('sent');
      const hosts = calls.map((c) => new URL(c.url).host);
      expect(hosts).toContain('api.resend.com');
      expect(hosts).toContain('api.telegram.org');
      // Cloudflare 403s a deployment's requests to itself - the notify modules
      // are imported in-process, and this is what proves it stayed that way.
      expect(hosts.some((h) => h.includes('lavacagc.com'))).toBe(false);
      expect(hosts.some((h) => h.includes('localhost'))).toBe(false);
    });
  } finally {
    process.env = env;
  }
});

test('AC-S3-13b: a failed alert is logged and never turns a stored agreement into an error', async () => {
  const env = { ...process.env };
  delete process.env.RESEND_API_KEY;
  delete process.env.TELEGRAM_BOT_TOKEN;
  try {
    await withPostgrest(() => restJson([]), async () => {
      const outcome = await alertOwnerOfSubmission(record());
      expect(outcome.email).not.toBe('sent');
      expect(outcome.telegram).toBe('not_configured');
    });
  } finally {
    process.env = env;
  }
});

test('AC-S3-14: the route answers each failure as itself, and charges its own bucket', async () => {
  // The happy path, end to end through the handler.
  const env = { ...process.env };
  delete process.env.RESEND_API_KEY;
  delete process.env.TELEGRAM_BOT_TOKEN;
  try {
    await withPostgrest(serveProposal(), async (calls) => {
      const res = await submitRequest(TOKEN, {
        included_line_ids: LINES.map((l) => l.id), touched_line_ids: [],
      });
      expect(res.status).toBe(200);
      expect((await res.json()).total_cents).toBe(FULL_TOTAL);
      // The submission itself is written, and nothing else's bucket is spent.
      expect(calls.some((c) => c.method === 'POST' && c.url.includes('proposal_submissions'))).toBe(true);
      expect(calls.some((c) => c.url.includes('hc-access:'))).toBe(false);
      // The bucket the limiter charges is NOT observable here: rateLimit.ts
      // reads NEXT_PUBLIC_SUPABASE_URL at module scope, so in this process it
      // is already fixed by the time the stub sets one, and the limiter fails
      // open without issuing a request. That is its designed behaviour (it is
      // availability-protective, not an auth gate) and it is exactly why the
      // real bucket is asserted where a real server has a real URL: AC-R10
      // pins the strings, and the e2e spec reads the row back off the stub.
    });

    // Unknown token: the generic dead end, and the identical answer a revoked
    // proposal gets - nothing here tells one from the other.
    await withPostgrest(() => restJson([]), async () => {
      const unknown = await submitRequest('z'.repeat(43), { included_line_ids: [L(1)] });
      expect(unknown.status).toBe(404);
      const unknownBody = await unknown.json();
      await withPostgrest(serveProposal({ status: 'revoked' }), async () => {
        const revoked = await submitRequest(TOKEN, { included_line_ids: LINES.map((l) => l.id) });
        expect(revoked.status).toBe(404);
        expect((await revoked.json()).error).toBe(unknownBody.error);
      });
    });

    // A malformed body is the caller's 400.
    await withPostgrest(serveProposal(), async () => {
      const res = await submitRequest(TOKEN, { included_line_ids: 'not-an-array' });
      expect(res.status).toBe(400);
    });

    // WEB-022 at the API is a 400 with a sentence, not a constraint name.
    await withPostgrest(serveProposal(), async () => {
      const res = await submitRequest(TOKEN, { included_line_ids: [L(3)] });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain('not optional');
    });

    // Our outage is a 503 and is never reported as a bad link.
    await withPostgrest(
      (call) => (call.url.includes('rate_limits')
        ? restJson([])
        : restJson({ message: 'down' }, 500)),
      async () => {
        const res = await submitRequest(TOKEN, { included_line_ids: [L(1)] });
        expect(res.status).toBe(503);
        expect((await res.json()).error).toContain('our end');
      },
    );
  } finally {
    process.env = env;
  }
});

test('AC-S3-16: the page is noindex, and its metadata names no client', () => {
  const page = read('src/app/proposal/[token]/page.tsx');
  expect(page).toContain('robots: { index: false, follow: false }');
  expect(page).toContain("export const dynamic = 'force-dynamic'");
  expect(page).toContain("title: 'Your proposal | La Vaca General Contractors'");
  // The sitemap has never enumerated a tokenized route, and must not start.
  expect(read('src/app/sitemap.ts')).not.toContain('proposal');
});

test('AC-S3-3: locked lines reach the page with nothing to flip', () => {
  // The DOM half of this is owned by the e2e spec; what belongs here is that
  // the component has no control to render for a locked line in the first
  // place - LockedLine takes no toggle and is given none.
  const view = read('src/app/proposal/[token]/ProposalView.tsx');
  const locked = view.slice(view.indexOf('function LockedLine'), view.indexOf('function OptionalLine'));
  expect(locked).not.toContain('input');
  expect(locked).not.toContain('onToggle');
  expect(locked).not.toContain('<button');
});

test('AC-S3-15: the booking line renders only when the booking URL is configured', () => {
  const view = read('src/app/proposal/[token]/ProposalView.tsx');
  expect(view).toContain('bookingUrl ?');
  const page = read('src/app/proposal/[token]/page.tsx');
  expect(page).toContain('NEXT_PUBLIC_BOOKING_URL');
  // cleanEnv, like every other read of a dashboard-pasted value.
  expect(page).toContain('cleanEnv(process.env.NEXT_PUBLIC_BOOKING_URL)');
});

test('AC-S3-17: the confirmation states what was sent and offers to send again', () => {
  const view = read('src/app/proposal/[token]/ProposalView.tsx');
  expect(view).toContain('Sent to Alex');
  expect(view).toContain('Change something and send again');
  expect(view).toContain('What you sent');
});

test('house style: no em dashes in anything this slice ships', () => {
  const files = [
    'src/lib/privatePages.ts',
    'src/lib/proposals/publicView.ts',
    'src/lib/proposals/submit.ts',
    'src/lib/proposals/ownerAlert.ts',
    'src/lib/proposals/money.ts',
    'src/lib/proposals/clientPage.ts',
    'src/lib/proposals/linkWindow.ts',
    'src/app/proposal/[token]/page.tsx',
    'src/app/proposal/[token]/ProposalView.tsx',
    'src/app/api/proposal/[token]/submit/route.ts',
    // This slice registers /api/proposal/ in PUBLIC_ROUTES, so middleware is a
    // file the slice ships and the house rule covers it like any other.
    'src/middleware.ts',
  ];
  for (const f of files) {
    expect(read(f), `${f} must not use an em dash`).not.toContain('—');
  }
});

// ------------------------------------------- STALE DRAFT LINK (follow-up fix)
//
// Numbered from 23, after the ACs slice 3 shipped. AC-S3-21 and AC-S3-22 are
// already taken above (the send path's window refresh, and the wording of its
// post-delivery failure), and the doc names them for that - so reusing those
// two ids would have put two different claims behind one name in both places.

test('AC-S3-23: the window rule is one pure module, reachable without the server client', () => {
  // The roster runs in a browser and has to ask the same question the server
  // doors ask. Importing it from publicView would have pulled the secret-key
  // REST client into the client bundle to reach a function that does
  // arithmetic on a timestamp, so the rule lives in a module that imports
  // nothing.
  const win = read('src/lib/proposals/linkWindow.ts');
  expect(win, 'linkWindow must import nothing').not.toMatch(/^\s*import\s/m);
  expect(win).toContain('export const DRAFT_LINK_LIFETIME_MS');
  // And there is still exactly one of it: publicView re-exports rather than
  // restating, so the two doors and the roster cannot drift apart.
  const view = read('src/lib/proposals/publicView.ts');
  expect(view).toContain("from './linkWindow'");
  expect(view).not.toMatch(/export const DRAFT_LINK_LIFETIME_MS\s*=/);
  expect(DRAFT_LINK_LIFETIME_MS).toBe(24 * 60 * 60 * 1000);

  // Including the unit an admin reads it in. Both screens that name a number of
  // hours - the roster's toast and hint, and the send route's post-delivery
  // failure - used to derive it themselves from the milliseconds, with the same
  // arithmetic and the same comment in two files. That is a second definition
  // of the rule this module exists to own.
  expect(win).toContain('export const DRAFT_WINDOW_HOURS');
  for (const f of [
    'src/app/vaca-mgmt/proposals/page.tsx',
    'src/app/api/admin/proposals/[id]/route.ts',
  ]) {
    expect(read(f), `${f} must read the window in hours, not re-derive it`)
      .not.toMatch(/DRAFT_WINDOW_HOURS\s*=/);
  }
});

test('AC-S3-24: draftLinkHasExpired describes only a stale DRAFT, never a revoked row', () => {
  const fresh = new Date(Date.now() - 60_000).toISOString();
  const stale = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();

  expect(draftLinkHasExpired({ status: 'draft', updated_at: stale })).toBe(true);
  expect(draftLinkHasExpired({ status: 'draft', updated_at: fresh })).toBe(false);
  // A sent link has no expiry (D3), so it is never "expired".
  expect(draftLinkHasExpired({ status: 'sent', updated_at: stale })).toBe(false);
  // And a revoked row is a DIFFERENT situation with a different remedy - the
  // roster already renders it as revoked, and must not also call it expired.
  expect(draftLinkHasExpired({ status: 'revoked', updated_at: stale })).toBe(false);
  expect(proposalLinkIsLive({ status: 'revoked', updated_at: fresh })).toBe(false);
  // An unreadable timestamp closes the window rather than opening it.
  expect(draftLinkHasExpired({ status: 'draft', updated_at: null })).toBe(true);
});

test('AC-S3-25: refresh moves a draft window, and is refused on anything else', async () => {
  const action = (id: string, body: unknown) => proposalAction(
    new NextRequest(`http://localhost/api/admin/proposals/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

  // A draft: the write is a PATCH filtered on the status it writes back, so
  // proposals_set_updated_at owns the column and no lifecycle CHECK can reject
  // it, and a concurrent status change updates nothing rather than reverting.
  await withPostgrest(
    () => restJson([proposalRow({ status: 'draft' })]),
    async (calls) => {
      const res = await action(PROPOSAL_ID, { action: 'refresh' });
      expect(res.status).toBe(200);
      const patch = calls.find((c) => c.method === 'PATCH');
      expect(patch?.url).toContain('status=eq.draft');
      expect(patch?.body).toEqual({ status: 'draft' });
      // Nothing was mailed: this is the door that refreshes WITHOUT sending.
      expect(calls.some((c) => c.url.includes('api.resend.com'))).toBe(false);
    },
  );

  // A sent proposal has no window to move, and a revoked one must not be
  // quietly revived by a button that promises to change nothing a client sees.
  for (const status of ['sent', 'revoked'] as const) {
    await withPostgrest(
      () => restJson([proposalRow({
        status,
        sent_at: status === 'sent' ? '2026-08-05T00:00:00Z' : null,
        revoked_at: status === 'revoked' ? '2026-08-05T00:00:00Z' : null,
      })]),
      async (calls) => {
        const res = await action(PROPOSAL_ID, { action: 'refresh' });
        expect(res.status).toBe(409);
        expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
      },
    );
  }

  // A refresh whose write fails is reported, never claimed as done: an admin
  // told "refreshed" over a failed write pastes the link anyway.
  await withPostgrest(
    (call) => (call.method === 'PATCH'
      ? restJson({ message: 'down' }, 500)
      : restJson([proposalRow({ status: 'draft' })])),
    async () => {
      const res = await action(PROPOSAL_ID, { action: 'refresh' });
      expect(res.status).toBe(502);
      expect((await res.json()).error).toMatch(/may still be expired/i);
    },
  );

  // And a write that SUCCEEDS while matching no row is not a refresh either.
  // The PATCH is filtered on status=eq.draft, so a status changed between the
  // read above and the write updates nothing at all - and PostgREST answers
  // that with 200 and an empty array, not an error. Reported as a refresh, it
  // would have put "it opens for the next 24 hours" over a link whose window
  // never moved, which is the exact dishonesty this action exists to remove.
  await withPostgrest(
    (call) => (call.method === 'PATCH'
      ? restJson([])
      : restJson([proposalRow({ status: 'draft' })])),
    async () => {
      const res = await action(PROPOSAL_ID, { action: 'refresh' });
      expect(res.status).toBe(502);
      expect((await res.json()).error).toMatch(/may still be expired/i);
    },
  );
});

test('AC-S3-26: Copy link copies inside the click, then refreshes the draft it copied', () => {
  const page = read('src/app/vaca-mgmt/proposals/page.tsx');
  const copy = page.slice(page.indexOf('const copyLink'), page.indexOf('return (', page.indexOf('const copyLink')));
  // The whole statement, so what is measured is everything ahead of the write
  // rather than everything ahead of its method name.
  const write = copy.indexOf('await navigator.clipboard.writeText');
  expect(write, 'copyLink must write to the clipboard').toBeGreaterThan(-1);

  // THE REASON, not just the sequence. A clipboard write is only permitted
  // while the click's user activation is live, and WebKit drops that activation
  // across an awaited network round trip - so a refresh awaited in front of the
  // write made it reject with NotAllowedError on Safari for every draft, which
  // is the row this feature exists for. Nothing may be awaited ahead of it.
  const before = copy.slice(0, write);
  expect(before, 'the clipboard write must not sit behind an await').not.toMatch(/\bawait\b/);
  expect(before, 'nor behind a network call').not.toMatch(/\bfetch\(|refreshDraftWindow\(/);

  // The refresh still happens - it just follows.
  expect(copy).toContain('refreshDraftWindow(p.id)');
  expect(write).toBeLessThan(copy.indexOf('refreshDraftWindow(p.id)'));
  // Only a draft is refreshed; a sent link has no window to move.
  expect(copy).toContain("p.status === 'draft'");

  // A failed clipboard write does NOT skip the refresh: the admin copies the
  // URL out of the fallback toast by hand, and it has to resolve for them too.
  expect(copy).toContain('copied = false');
  expect(copy.indexOf('copied = false')).toBeLessThan(copy.indexOf('refreshDraftWindow(p.id)'));

  // A failed refresh still leaves the link copied, and the toast says what that
  // failure means FOR THE LINK. That sentence is the reason the toast exists,
  // so it lives in one constant and every failure branch reports it - a branch
  // composing its own wording is how it went missing before.
  expect(copy).toContain('refresh.reason');
  const helper = page.slice(page.indexOf('async function refreshDraftWindow'), page.indexOf('export default'));
  const impact = page.match(/const REFRESH_FAILED = ([\s\S]*?);\n/)?.[1] ?? '';
  expect(impact, 'the failure sentence must say the link may not open').toMatch(/may not open/);
  expect(impact, 'and name the remedy').toMatch(/re-import/);
  expect(helper.match(/REFRESH_FAILED/g)?.length, 'every failure branch reports it')
    .toBeGreaterThanOrEqual(3);

  // The SERVER's sentence displaces it only on a 409 - the one status whose
  // messages were written for this action, and the only two that are more
  // accurate than it (a sent link never expires; a revoked one is shut until it
  // is restored). Everything else - the route's generic 'Could not complete
  // that action' for any outage, a gateway's HTML error page, an empty body -
  // explains nothing to an admin, so it is never read for its words.
  expect(helper).toContain('res.status !== 409');
  expect(helper.indexOf('res.status !== 409'), 'the body is parsed only past that guard')
    .toBeLessThan(helper.indexOf('res.json()'));
  expect(helper).toContain("typeof body?.error === 'string'");
  // A 404 is the row being gone, which is the roster's problem rather than the
  // write's, exactly like a 409.
  expect(helper).toContain('res.status === 404');

  // The copied row is updated in place. A re-read would reorder the roster
  // (it is ordered updated_at.desc, and a refresh writes that column), and the
  // only reload left on this path is the one a 409 triggers - which must use
  // the term the roster on screen answers, never the unsubmitted search box.
  expect(copy).toContain('setRoster(');
  expect(copy).not.toContain('loadRoster(search)');
  expect(copy).toContain('loadRoster(activeSearch)');
});
