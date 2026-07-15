import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import './helpers/retentionEnvStub';
import { purgeHomeRecords, purgeHomeRecordsByEmail } from '../src/lib/homecare/retention';

/**
 * Home Care "My Home Systems" - Slice 8: the retention purge.
 *
 * The consent text + privacy policy v2.4 promise saved home details are
 * "deleted when you leave the program". Unsubscribing never deletes the
 * homeowners row (only status='unsubscribed'), so the schema's ON DELETE
 * CASCADE can't fulfill that promise - purgeHomeRecords is the explicit
 * enforcement, wired into EVERY leave path:
 *   1. /api/home-care/unsubscribe (legacy one-click link)
 *   2. syncLegacyStatus in preferences.ts (preference center,
 *      unsubscribe-by-email, admin Subscriptions, Resend webhook)
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

  test('AC1: deletes home_records AND home_record_access_log for the homeowner, reporting counts', async () => {
    const calls: string[] = [];
    stubFetch(async (url, init) => {
      calls.push(`${init?.method} ${url}`);
      if (url.includes('home_records?')) {
        return new Response(JSON.stringify([{ id: 'r1' }, { id: 'r2' }]), { status: 200 });
      }
      return new Response(JSON.stringify([{ id: 'a1' }]), { status: 200 });
    });

    const outcome = await purgeHomeRecords('11111111-2222-3333-4444-555555555555', 'spec');
    expect(outcome).toEqual({ ok: true, purgedRecords: 2, purgedAccessLogRows: 1 });
    // Both tables, both scoped to the homeowner, both id-only representations
    // (the purge must never echo sensitive values into logs/alerts).
    expect(calls.some((c) => c.startsWith('DELETE') && c.includes('/home_records?homeowner_id=eq.11111111') && c.includes('select=id'))).toBe(true);
    expect(calls.some((c) => c.startsWith('DELETE') && c.includes('/home_record_access_log?homeowner_id=eq.11111111') && c.includes('select=id'))).toBe(true);
  });

  test('AC2: a missing table (pre-go-live) is "nothing to purge", not a failure', async () => {
    stubFetch(async () => new Response('relation "public.home_records" does not exist', { status: 404 }));

    const outcome = await purgeHomeRecords('11111111-2222-3333-4444-555555555555', 'spec');
    expect(outcome).toEqual({ ok: true, purgedRecords: 0, purgedAccessLogRows: 0 });
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
    expect(outcome).toEqual({ ok: true, purgedRecords: 2, purgedAccessLogRows: 0 });
  });
});

test('AC5: the legacy unsubscribe route purges right after flipping the status', () => {
  const flipIdx = unsubRoute.indexOf("status: 'unsubscribed'");
  const purgeIdx = unsubRoute.indexOf("purgeHomeRecords(ho.id, 'home-care-unsubscribe-link')");
  expect(flipIdx).toBeGreaterThan(-1);
  expect(purgeIdx).toBeGreaterThan(flipIdx);
  expect(unsubRoute).toContain("from '@/lib/homecare/retention'");
});

test('AC6: every preference-pipeline leave path purges via syncLegacyStatus', () => {
  // Turning the home_care stream OFF purges; turning it back ON must not.
  const offBranch = preferences.slice(
    preferences.indexOf('if (!patch.home_care)'),
    preferences.indexOf("purgeHomeRecordsByEmail(email, 'preference-stream-off')") + 80,
  );
  expect(offBranch).toContain("purgeHomeRecordsByEmail(email, 'preference-stream-off')");
  // Exactly one purge call, guarded by the stream-off check.
  expect(preferences.match(/purgeHomeRecordsByEmail\(/g)?.length).toBe(1);
  expect(preferences).toContain("import { purgeHomeRecordsByEmail } from '@/lib/homecare/retention'");
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

test('AC8: re-consent stays coherent - a purge leaves no homeowner-authored rows behind', () => {
  // The whole point of deleting BOTH tables: after a purge the Slice-3 consent
  // inference (updated_by=eq.homeowner) finds nothing, so a returning
  // homeowner is asked for fresh consent before anything is stored again.
  expect(retention).toContain('home_records?homeowner_id=eq.');
  expect(retention).toContain('home_record_access_log?homeowner_id=eq.');
  // And the doc comment records the intent.
  expect(retention).toMatch(/re-joins[\s\S]*fresh consent|require fresh consent/i);
});
