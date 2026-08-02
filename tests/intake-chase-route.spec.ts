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

const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id, lead_id: `lead-${id}`, first_name: 'Sarah', project_type: 'Kitchen Remodeling',
  answers: {}, created_at: '2020-01-01T00:00:00Z', opened_at: '2020-01-01T00:00:00Z',
  updated_at: '2020-01-01T00:00:00Z', ...extra,
});

async function run(stage: string) {
  const res = await GET(new NextRequest(`https://lavacagc.test/api/cron/intake-chase?stage=${stage}`));
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
