import { test, expect } from '@playwright/test';
import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/cron/intake-chase/route';

/**
 * The chase cron, exercised through the route itself (AC8).
 *
 * See docs/lead-routing-acceptance-criteria.md. The rest of the acceptance
 * criteria live in lead-routing.spec.ts, which covers `chaseOne` directly; this
 * file exists for the two properties that only hold at the level of the LOOP -
 * that one bad row cannot take the run down with it, and that the `degraded`
 * name a run reports is the fault rather than the stage after it. Both were
 * previously asserted by grepping the route source, which passes just as
 * happily when the behaviour is absent.
 *
 * Every request is stubbed, so nothing here reaches Supabase or Telegram.
 */
type Call = { method: string; url: string; body: Record<string, unknown> | undefined };

const realFetch = global.fetch;
const realEnv = { ...process.env };

test.beforeEach(() => {
  process.env.SUPABASE_SECRET_KEY = 'test-key';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.TELEGRAM_BOT_TOKEN = 'test-bot';
  process.env.TELEGRAM_CHAT_ID = '123';
});

test.afterEach(() => {
  global.fetch = realFetch;
  process.env = { ...realEnv };
});

/** Answer every outbound request from a table, and keep what was asked. */
function stub(handler: (c: Call) => { status?: number; body?: unknown }): Call[] {
  const calls: Call[] = [];
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      method: init?.method ?? 'GET',
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const { status = 200, body = [] } = handler(call);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return calls;
}

const isCandidateRead = (c: Call) => c.method === 'GET' && c.url.includes('lead_intake_sessions?select=');
const isTelegram = (c: Call) => c.url.includes('api.telegram.org');

/** Hours before this run started, so rows sit either side of the age ceiling. */
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id, lead_id: `lead-${id}`, first_name: 'Sarah', project_type: 'Kitchen Remodeling',
  answers: {}, created_at: ago(8), opened_at: ago(8), updated_at: ago(6), ...extra,
});

async function run(stage: string, extra = '') {
  const res = await GET(
    new NextRequest(`https://lavacagc.test/api/cron/intake-chase?stage=${stage}${extra}`),
  );
  return { status: res.status, body: await res.json() };
}

test('a run whose claims Supabase refused names the database, not Telegram', async () => {
  stub((c) => (isCandidateRead(c) ? { body: [row('a'), row('b')] } : { status: 500, body: { message: 'boom' } }));

  const { status, body } = await run('abandoned');
  expect(status).toBe(200);
  expect(body.ok).toBe(false);
  // 'chase_send_failed' here would send the reader to look at a Telegram that
  // was never even asked to do anything.
  expect(body.degraded).toEqual(['chase_claim_failed']);
  expect(body.failed).toBe(2);
  expect(body.sent).toBe(0);
});

test('a send Telegram refused is reported as a send failure', async () => {
  stub((c) => {
    if (isCandidateRead(c)) return { body: [row('a')] };
    if (isTelegram(c)) return { status: 400, body: { ok: false } };
    return { body: [{ id: 'a' }] };
  });

  const { body } = await run('abandoned');
  expect(body.ok).toBe(false);
  expect(body.degraded).toEqual(['chase_send_failed']);
});

test('ONE BAD ROW RELEASES ITS CLAIM AND THE REST OF THE PAGE STILL GOES', async () => {
  // The stamp is written before the send, so a throw between the two leaves a
  // claimed, unsent candidate that no future run can see - and an unguarded
  // loop would take every candidate behind it down the same way.
  const calls = stub((c) => {
    if (isCandidateRead(c)) return { body: [row('bad', { answers: null }), row('good')] };
    if (isTelegram(c)) return { body: { ok: true } };
    return { body: [{ id: 'x' }] };
  });

  const { status, body } = await run('abandoned');
  expect(status).toBe(200);
  expect(body.sent).toBe(1);
  expect(body.failed).toBe(1);
  expect(body.degraded).toEqual(['chase_threw']);

  const released = calls.filter((c) => c.method === 'PATCH' && c.body?.abandoned_alert_at === null);
  expect(released, 'the claimed-but-unsent row must get its stamp back').toHaveLength(1);
  expect(released[0].url).toContain('id=eq.bad');
  expect(calls.filter(isTelegram)).toHaveLength(1);
});

test('a candidate list that could not be read is a 503, not a quiet run', async () => {
  stub((c) => (isCandidateRead(c) ? { status: 500, body: { message: 'down' } } : { body: [] }));

  const { status, body } = await run('low_intent');
  expect(status).toBe(503);
  expect(body.ok).toBe(false);
  expect(body.error).toContain('nothing was chased');
});

test('A LEAD PAST THE AGE CEILING IS STAMPED AND NOT SENT, AND THE RUN SAYS SO', async () => {
  // "Submitted 700 hours ago, link never opened - worth one manual follow-up"
  // is advice nobody can act on, and a channel that delivers it gets ignored.
  const calls = stub((c) => {
    if (isCandidateRead(c)) return { body: [row('stale', { updated_at: ago(100) }), row('fresh')] };
    if (isTelegram(c)) return { body: { ok: true } };
    return { body: [{ id: 'x' }] };
  });

  const { body } = await run('abandoned');
  expect(body.retired).toBe(1);
  expect(body.sent).toBe(1);
  // Ending a lead's chase with nobody told is a decision, not a quiet run.
  expect(body.ok).toBe(false);
  expect(body.degraded).toContain('chase_retired_stale');

  // Stamped once and never released, so it leaves the queue for good - and the
  // stamp says it was a retirement, not an alert nobody received.
  const stale = calls.filter((c) => c.method === 'PATCH' && c.url.includes('id=eq.stale'));
  expect(stale).toHaveLength(1);
  expect(stale[0].body?.abandoned_alert_at).toEqual(expect.any(String));
  expect(stale[0].body?.abandoned_retired_at).toEqual(stale[0].body?.abandoned_alert_at);
  // ...and the only message that went was for the row still worth chasing.
  expect(calls.filter(isTelegram)).toHaveLength(1);
});

test('MISSING TELEGRAM CREDENTIALS STOP THE RUN INSTEAD OF DRAINING THE PAGE', async () => {
  // An unset token is not transient. Retrying the rest of the page against it
  // claims and releases every row to no purpose, and reports a Telegram fault
  // for sends that were never attempted.
  delete process.env.TELEGRAM_BOT_TOKEN;
  const calls = stub((c) => (isCandidateRead(c) ? { body: [row('a'), row('b')] } : { body: [{ id: 'x' }] }));

  const { body } = await run('abandoned');
  expect(body.ok).toBe(false);
  expect(body.degraded).toEqual(['telegram_not_configured']);
  expect(body.failed).toBe(1);
  // The second candidate was never touched, and the run says one was left.
  expect(body.unprocessed).toBe(1);
  expect(calls.filter((c) => c.url.includes('id=eq.b'))).toEqual([]);

  // Nothing was delivered, so the claim goes back: both are candidates again
  // for the run after the configuration is fixed.
  const released = calls.filter((c) => c.method === 'PATCH' && c.body?.abandoned_alert_at === null);
  expect(released).toHaveLength(1);
  expect(released[0].url).toContain('id=eq.a');
});

test('the dry run previews a row it cannot render instead of 500ing on it', async () => {
  // The diagnostic surface is where a malformed row is first noticed, so it is
  // the last place that should answer a bare 500 naming no row at all.
  stub((c) => (isCandidateRead(c) ? { body: [row('bad', { answers: null }), row('good')] } : { body: [] }));

  const { status, body } = await run('abandoned', '&dry=1');
  expect(status).toBe(200);
  expect(body.ok).toBe(false);
  expect(body.degraded).toEqual(['preview_render_failed']);
  expect(body.preview[0].session).toBe('bad');
  expect(body.preview[0].error).toBeTruthy();
  expect(body.preview[1].message).toContain('Started the intake and stopped');
});

test('THE DRY RUN PREVIEWS WHAT WOULD BE SENT, NOT WHAT WOULD BE RETIRED', async () => {
  // The queue drains oldest first, so the head of the list is exactly where
  // rows past the ceiling collect. Previewing them would render fully-formed
  // "submitted 700 hours ago" alerts that will never be sent, on the one
  // surface that exists to say what the run is about to do.
  stub((c) => (isCandidateRead(c) ? { body: [row('stale', { updated_at: ago(100) }), row('fresh')] } : { body: [] }));

  const { body } = await run('abandoned', '&dry=1');
  expect(body.wouldChase).toBe(1);
  expect(body.wouldRetire).toBe(1);

  // The message shown is the one that would actually go...
  expect(body.preview).toHaveLength(1);
  expect(body.preview[0].session).toBe('fresh');
  // ...and the retirement is shown as a retirement, with no message at all.
  expect(body.retiring).toHaveLength(1);
  expect(body.retiring[0].session).toBe('stale');
  expect(body.retiring[0].message).toBeUndefined();
  expect(body.retiring[0].verdict).toContain('nothing sent');
});

test('a dry run with nothing to retire says nothing about retirements', async () => {
  stub((c) => (isCandidateRead(c) ? { body: [row('fresh')] } : { body: [] }));

  const { body } = await run('abandoned', '&dry=1');
  expect(body.wouldChase).toBe(1);
  expect(body.wouldRetire).toBeUndefined();
  expect(body.retiring).toBeUndefined();
});

test('a clean run says so, and stamps every candidate exactly once', async () => {
  const calls = stub((c) => {
    if (isCandidateRead(c)) return { body: [row('a'), row('b')] };
    if (isTelegram(c)) return { body: { ok: true } };
    return { body: [{ id: 'x' }] };
  });

  const { body } = await run('abandoned');
  expect(body.ok).toBe(true);
  expect(body.degraded).toBeUndefined();
  expect(body.sent).toBe(2);
  expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(2);
  expect(calls.filter(isTelegram)).toHaveLength(2);
});
