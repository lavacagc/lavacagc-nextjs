#!/usr/bin/env node
/**
 * Suppression / unsubscribe validation loop (CAN-SPAM safety net).
 *
 * Exercises the REAL unsubscribe endpoints against a running server and asserts
 * the cross-stream invariants that prevent the "someone unsubscribed but still
 * gets emailed" leak class:
 *
 *   A. Follow-ups opt-out isolation   — turning off follow_ups must leave every
 *      marketing stream ON (a lead unsubscribing from sales follow-ups still
 *      gets the newsletter they asked for).
 *   B. Marketing opt-out isolation    — a general /unsub must turn off ALL
 *      marketing streams but leave follow_ups ON (transactional; owner policy).
 *   C. One-click header (RFC 8058)    — POST .../unsubscribe?stream=follow_ups
 *      turns off only follow_ups.
 *
 * Uses throwaway emails and deletes every row it creates. Verifies state by
 * reading email_preferences directly via the Supabase service key.
 *
 * Usage:  BASE_URL=http://localhost:3000 node scripts/validate-suppression.mjs
 * Exits non-zero on any failed assertion so it can gate a release.
 */
import fs from 'fs';

const env = {};
for (const f of ['.env.local', '.env.development.local']) {
  try {
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
    }
  } catch { /* file optional */ }
}
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SECRET_KEY || env.SUPABASE_SECRET_KEY;
if (!SB_URL || !SB_KEY) {
  console.error('Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY)');
  process.exit(2);
}
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

let failures = 0;
const assert = (cond, msg) => {
  console.log(`  ${cond ? '✅' : '❌'} ${msg}`);
  if (!cond) failures++;
};

const rest = async (method, path, body) => {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers: H,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, json: text ? JSON.parse(text) : null };
};
const readPref = async (email) => {
  const r = await rest('GET', `email_preferences?email=eq.${encodeURIComponent(email)}&limit=1`);
  return r.json?.[0] ?? null;
};
const cleanup = async (email) => {
  await rest('DELETE', `preference_events?email=eq.${encodeURIComponent(email)}`);
  await rest('DELETE', `email_preferences?email=eq.${encodeURIComponent(email)}`);
};
const post = (path, body) =>
  fetch(`${BASE_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const stamp = Date.now();
const A = `validate-followups-${stamp}@lavaca.link`;
const B = `validate-marketing-${stamp}@lavaca.link`;
const C = `validate-oneclick-${stamp}@lavaca.link`;

async function main() {
  console.log(`Validating suppression against ${BASE_URL}\n`);

  try {
    // ── A. Follow-ups opt-out must not touch marketing ──────────────────────
    console.log('A. Follow-ups opt-out isolation');
    const ra = await post('/api/preferences/unsubscribe-by-email', { email: A, stream: 'follow_ups' });
    assert(ra.status === 200, `follow_ups unsubscribe returns 200 (got ${ra.status})`);
    const pa = await readPref(A);
    assert(!!pa, 'email_preferences row was created');
    assert(pa?.follow_ups === false, 'follow_ups is OFF');
    assert(pa?.home_care === true && pa?.buy_remodel === true && pa?.announcements === true,
      'all marketing streams remain ON (no cross-stream leak the other way)');

    // ── B. Marketing opt-out must not touch follow_ups ──────────────────────
    console.log('\nB. Marketing opt-out isolation');
    const rb = await post('/api/preferences/unsubscribe-by-email', { email: B });
    assert(rb.status === 200, `marketing unsubscribe returns 200 (got ${rb.status})`);
    const pb = await readPref(B);
    assert(pb?.home_care === false && pb?.buy_remodel === false && pb?.announcements === false,
      'all marketing streams are OFF');
    assert(pb?.follow_ups === true, 'follow_ups stays ON (transactional, not silenced by marketing unsub)');

    // ── C. One-click List-Unsubscribe header path (stream=follow_ups) ────────
    console.log('\nC. One-click header honors follow_ups only');
    // Create the row (marketing unsub also creates it) then reset to a clean all-on state.
    await post('/api/preferences/unsubscribe-by-email', { email: C, stream: 'follow_ups' });
    const seed = await readPref(C);
    await rest('PATCH', `email_preferences?email=eq.${encodeURIComponent(C)}`,
      { home_care: true, buy_remodel: true, announcements: true, follow_ups: true });
    const token = seed?.preference_token;
    assert(!!token, 'preference_token available for one-click test');
    if (token) {
      const rc = await post(`/api/preferences/unsubscribe?token=${encodeURIComponent(token)}&stream=follow_ups`, {});
      assert(rc.status === 200, `one-click POST returns 200 (got ${rc.status})`);
      const pc = await readPref(C);
      assert(pc?.follow_ups === false, 'one-click turned follow_ups OFF');
      assert(pc?.home_care === true && pc?.buy_remodel === true && pc?.announcements === true,
        'one-click left marketing streams ON');
    }
  } finally {
    await Promise.all([cleanup(A), cleanup(B), cleanup(C)]);
    console.log('\nCleaned up throwaway rows.');
  }

  console.log(`\n${failures === 0 ? 'PASS — all suppression invariants held' : `FAIL — ${failures} assertion(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Validation script error:', e);
  process.exit(2);
});
