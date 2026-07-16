import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { NextRequest } from 'next/server';
import './helpers/retentionEnvStub';
import { purgeHomeRecords, purgeHomeRecordsByEmail } from '../src/lib/homecare/retention';
import { applyUpdate } from '../src/lib/preferences/preferences';
import { GET as homeCareUnsubscribeGET } from '../src/app/api/home-care/unsubscribe/route';

/**
 * Home Care "My Home Systems" - Slice 8: the retention purge.
 *
 * The consent text + privacy policy v2.4 promise saved home details are
 * "deleted when you leave the program". Unsubscribing never deletes the
 * homeowners row (only status='unsubscribed'), so the schema's ON DELETE
 * CASCADE can't fulfill that promise - purgeHomeRecords is the explicit
 * enforcement, wired into every DELIBERATE leave path. Per the owner's
 * 2026-07-16 decisions: the staff access log is deliberately KEPT on an
 * ordinary leave (staff-accountability data, categories only, still cascades
 * away on a true homeowners-row deletion), and the purge fires on intentional
 * human departure with PROVEN identity ONLY - never on machine-driven Resend
 * suppression, and never on the public tokenless /unsub form, where the address
 * is merely claimed by whoever typed it. Every leave funnels through one place:
 *   syncLegacyStatus in preferences.ts, gated on actor self/admin
 *   (token-bearing preference center, admin Subscriptions). The legacy
 *   /api/home-care/unsubscribe footer link mutates nothing on GET - link
 *   scanners fetch it - and redirects to the preference center's confirm
 *   prompt, so it reaches the purge only via a human's confirmed POST.
 *
 * The purge itself is exercised for real here (actual supabaseRest, stubbed
 * global fetch): happy path, pre-go-live missing table, hard failure. The
 * failure posture is the crux: an unsubscribe must always stick, so the purge
 * never throws - but a real failure must alert internally, never silently
 * break the deletion promise.
 */

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const retention = read('src/lib/homecare/retention.ts');
const unsubRoute = read('src/app/api/home-care/unsubscribe/route.ts');
const preferences = read('src/lib/preferences/preferences.ts');

type FetchStub = (url: string, init?: { method?: string }) => Promise<Response>;

const realFetch = globalThis.fetch;

function stubFetch(handler: FetchStub) {
  (globalThis as { fetch: unknown }).fetch = (input: unknown, init?: { method?: string }) =>
    handler(String(input), init);
}

test.describe('purgeHomeRecords (real function, stubbed fetch)', () => {
  test.afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test('AC1: deletes home_records for the homeowner - and deliberately NOT the access log', async () => {
    const calls: string[] = [];
    stubFetch(async (url, init) => {
      calls.push(`${init?.method} ${url}`);
      return new Response(JSON.stringify([{ id: 'r1' }, { id: 'r2' }]), { status: 200 });
    });

    const outcome = await purgeHomeRecords('11111111-2222-3333-4444-555555555555', 'spec');
    expect(outcome).toEqual({ ok: true, purgedRecords: 2 });
    // Scoped to the homeowner, id-only representation (the purge must never
    // echo sensitive values into logs/alerts).
    expect(calls.some((c) => c.startsWith('DELETE') && c.includes('/home_records?homeowner_id=eq.11111111') && c.includes('select=id'))).toBe(true);
    // Owner decision (2026-07-16): the staff access log survives an ordinary
    // leave - no delete may touch it here.
    expect(calls.some((c) => c.includes('home_record_access_log'))).toBe(false);
  });

  test('AC2: a missing table (pre-go-live) is "nothing to purge", not a failure', async () => {
    stubFetch(async () => new Response('relation "public.home_records" does not exist', { status: 404 }));

    const outcome = await purgeHomeRecords('11111111-2222-3333-4444-555555555555', 'spec');
    expect(outcome).toEqual({ ok: true, purgedRecords: 0 });
  });

  test('AC3: a hard failure never throws - it reports ok:false (and alerts internally)', async () => {
    stubFetch(async (url) => {
      // The purge DELETE fails; any alert-pipeline traffic just succeeds quietly.
      if (url.includes('home_record')) return new Response('boom', { status: 500 });
      return new Response('{}', { status: 200 });
    });

    const outcome = await purgeHomeRecords('11111111-2222-3333-4444-555555555555', 'spec');
    expect(outcome.ok).toBe(false);
  });

  test('AC4: purgeHomeRecordsByEmail resolves ids then purges each, aggregating', async () => {
    stubFetch(async (url, init) => {
      if (init?.method === 'GET' && url.includes('/homeowners?email=eq.')) {
        return new Response(JSON.stringify([{ id: 'h1' }, { id: 'h2' }]), { status: 200 });
      }
      if (url.includes('/home_records?')) {
        return new Response(JSON.stringify([{ id: 'r' }]), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const outcome = await purgeHomeRecordsByEmail('  Rachel@Example.com ', 'spec');
    expect(outcome).toEqual({ ok: true, purgedRecords: 2 });
  });
});

test.describe('AC5: the legacy unsubscribe GET mutates nothing and redirects to confirm', () => {
  // Link scanners and mail-client prefetchers (SafeLinks, Mimecast, Proofpoint)
  // GET every footer URL, so a genuine unsubscribe token arrives with no human
  // behind it. The purge is irreversible, so the leave cannot start from a GET:
  // this route resolves the token read-only and hands off to the preference
  // center's confirm prompt. The leave itself happens on the confirmed POST
  // (AC6), which proves identity AND intent.
  test.afterEach(() => {
    globalThis.fetch = realFetch;
  });

  /** Drive the real route handler; returns every Supabase call it made. */
  async function scannerFetchesTheLink(token: string, homeowner: unknown) {
    const calls: string[] = [];
    stubFetch(async (url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.includes('/homeowners?')) {
        return new Response(JSON.stringify(homeowner ? [homeowner] : []), { status: 200 });
      }
      if (url.includes('/email_preferences?')) {
        return new Response(JSON.stringify([{ email: 'rachel@example.com', preference_token: 'pt-1' }]), {
          status: 200,
        });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });
    const res = await homeCareUnsubscribeGET(
      new NextRequest(`https://www.lavacagc.com/api/home-care/unsubscribe?token=${token}`),
    );
    return { res, calls };
  }

  test('a valid token redirects to the confirm prompt without unsubscribing or purging', async () => {
    const { res, calls } = await scannerFetchesTheLink('tok-1', {
      id: 'h1',
      email: 'rachel@example.com',
      status: 'active',
    });

    expect(res.status).toBe(307);
    const dest = new URL(res.headers.get('location') ?? '');
    expect(dest.pathname).toBe('/preferences');
    expect(dest.searchParams.get('confirm')).toBe('home_care');
    expect(dest.searchParams.get('token')).toBe('pt-1');

    // The crux: nothing was destroyed and nobody was unsubscribed.
    expect(calls.some((c) => c.startsWith('DELETE'))).toBe(false);
    expect(calls.some((c) => c.startsWith('PATCH'))).toBe(false);
    expect(calls.some((c) => c.includes('/home_records'))).toBe(false);
  });

  test('an unknown token redirects to the invalid-link state, still mutating nothing', async () => {
    const { res, calls } = await scannerFetchesTheLink('garbage', null);
    const dest = new URL(res.headers.get('location') ?? '');
    expect(dest.pathname).toBe('/preferences');
    expect(dest.searchParams.get('invalid')).toBe('1');
    expect(calls.some((c) => c.startsWith('DELETE') || c.startsWith('PATCH'))).toBe(false);
  });

  test('the purge is not reachable from this route at all', () => {
    expect(unsubRoute).not.toContain('purgeHomeRecords');
    expect(unsubRoute).not.toContain("from '@/lib/homecare/retention'");
    expect(unsubRoute).not.toContain('updateHomeowner');
    expect(unsubRoute).not.toContain('setStreamByEmail');
  });
});

test.describe('AC6: syncLegacyStatus purges on an INTENTIONAL leave only', () => {
  test.afterEach(() => {
    globalThis.fetch = realFetch;
  });

  // Exercised through the real applyUpdate: the acting party must reach the
  // purge gate, so a refactor that drops the actor thread fails here.
  async function leaveHomeCare(actor: 'self' | 'self_unverified' | 'admin' | 'webhook' | 'system') {
    const calls: string[] = [];
    stubFetch(async (url, init) => {
      calls.push(`${init?.method} ${url}`);
      if (init?.method === 'GET' && url.includes('/homeowners?email=eq.')) {
        return new Response(JSON.stringify([{ id: 'h1' }]), { status: 200 });
      }
      if (init?.method === 'DELETE' && url.includes('/home_records?')) {
        return new Response(JSON.stringify([{ id: 'r1' }]), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });
    await applyUpdate({
      current: {
        email: 'rachel@example.com',
        preference_token: 't',
        home_care: true,
        buy_remodel: false,
        announcements: false,
        newsletter: false,
        follow_ups: false,
      },
      changes: { home_care: false },
      actor,
    });
    return calls;
  }

  const purged = (calls: string[]) =>
    calls.some((c) => c.startsWith('DELETE') && c.includes('/home_records?'));
  const suppressed = (calls: string[]) =>
    calls.some((c) => c.startsWith('PATCH') && c.includes('/homeowners?email=eq.'));

  for (const actor of ['self', 'admin'] as const) {
    test(`a deliberate leave by '${actor}' purges the saved home details`, async () => {
      const calls = await leaveHomeCare(actor);
      expect(purged(calls)).toBe(true);
      expect(suppressed(calls)).toBe(true);
    });
  }

  // The crux of the owner's 2026-07-16 decision: Resend's auto-suppression
  // fires on a hard bounce, a spam complaint about an unrelated newsletter, or
  // a deleted contact. None is the homeowner leaving, and the purge is
  // irreversible - so it must stop the mail WITHOUT destroying the data.
  for (const actor of ['webhook', 'system'] as const) {
    test(`automated suppression by '${actor}' suppresses but never purges`, async () => {
      const calls = await leaveHomeCare(actor);
      expect(purged(calls)).toBe(false);
      expect(calls.some((c) => c.includes('/homeowners?email=eq.') && c.startsWith('GET'))).toBe(false);
      expect(suppressed(calls)).toBe(true);
    });
  }

  // The public /unsub form is tokenless: the address is CLAIMED, never proven,
  // so an anonymous POST of a victim's email must not reach the irreversible
  // purge. It must still suppress exactly as before (CAN-SPAM).
  test("a tokenless 'self_unverified' unsubscribe suppresses but never purges", async () => {
    const calls = await leaveHomeCare('self_unverified');
    expect(purged(calls)).toBe(false);
    expect(calls.some((c) => c.includes('/homeowners?email=eq.') && c.startsWith('GET'))).toBe(false);
    expect(suppressed(calls)).toBe(true);
  });

  test('the tokenless unsubscribe-by-email route acts as self_unverified', () => {
    const byEmail = read('src/app/api/preferences/unsubscribe-by-email/route.ts');
    expect(byEmail).toContain("actor: 'self_unverified'");
    expect(byEmail).not.toMatch(/actor: 'self'/);
    // The token-bearing paths keep proving identity, so they still purge.
    expect(read('src/app/api/preferences/route.ts')).toContain('findByToken');
    expect(read('src/app/api/preferences/unsubscribe/route.ts')).toContain('findByToken');
  });

  test('re-enabling the stream never purges, whoever does it', async () => {
    const calls: string[] = [];
    stubFetch(async (url, init) => {
      calls.push(`${init?.method} ${url}`);
      return new Response(JSON.stringify([]), { status: 200 });
    });
    await applyUpdate({
      current: {
        email: 'rachel@example.com',
        preference_token: 't',
        home_care: false,
        buy_remodel: false,
        announcements: false,
        newsletter: false,
        follow_ups: false,
      },
      changes: { home_care: true },
      actor: 'self',
    });
    expect(purged(calls)).toBe(false);
  });

  test('the purge is wired to exactly one intent-gated call site', () => {
    expect(preferences.match(/purgeHomeRecordsByEmail\(/g)?.length).toBe(1);
    expect(preferences).toContain('if (!patch.home_care && isIntentionalLeaveActor(actor))');
    expect(preferences).toContain("import { purgeHomeRecordsByEmail } from '@/lib/homecare/retention'");
    // The gate itself: automated actors are excluded by construction.
    expect(preferences).toMatch(
      /INTENTIONAL_LEAVE_ACTORS: readonly PrefActor\[\] = \['self', 'admin'\]/,
    );
  });
});

test('AC7: the purge never throws and alerts loudly on real failure', () => {
  // Never-throwing posture: both public functions catch and return ok:false.
  expect(retention).toMatch(/return \{ \.\.\.outcome, ok: false \}/);
  // Loud failure: internal alert with a manual-remediation message.
  expect(retention).toContain('alertPurgeFailure');
  expect(retention).toContain('home-care-retention-purge');
  expect(retention).toMatch(/saved home details may still exist/);
  // The alert import is lazy - a static import would close the
  // preferences -> retention -> formErrorAlert -> sendEmail -> preferences cycle.
  expect(retention).toContain("await import('@/lib/notify/formErrorAlert')");
  expect(retention).not.toMatch(/^import .*formErrorAlert/m);
});

test('AC8: re-consent stays coherent, and the access log is kept by explicit owner decision', () => {
  // After a purge the Slice-3 consent inference (updated_by=eq.homeowner)
  // finds nothing, so a returning homeowner is asked for fresh consent before
  // anything is stored again.
  expect(retention).toContain('home_records?homeowner_id=eq.');
  expect(retention).toMatch(/re-joins[\s\S]*fresh consent|require fresh consent/i);
  // Owner decision (2026-07-16): no delete against the access log on an
  // ordinary leave - it survives as staff-accountability data and only
  // cascades away on a true homeowners-row deletion.
  expect(retention).not.toContain('home_record_access_log?');
  expect(retention).toMatch(/deliberately KEPT/);
});
