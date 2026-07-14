import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { HOME_DETAILS_CONSENT_TEXT } from '../src/lib/homecare/records';

/**
 * Home Care "My Home Systems" - Slice 3: inline capture UI on the checklist.
 *
 * A signed-in homeowner can save where a system is (or an appliance's make/model)
 * straight from the task row; the value prefills every task that maps to the same
 * canonical fact, and the first save takes affirmative consent. Like the other
 * home-care slices, the write path needs the home_records table (applied only at
 * go-live) and the checklist page needs a real homeowner session, so these are
 * source/contract assertions that guard the wiring, gates, and consent handling.
 * The privacy disclosure is asserted live in tests/privacy-policy.spec.ts.
 */

const root = process.cwd();
const readHelper = readFileSync(join(root, 'src/lib/homecare/homeRecords.ts'), 'utf8');
const page = readFileSync(join(root, 'src/app/home-care/checklist/page.tsx'), 'utf8');
const client = readFileSync(join(root, 'src/components/homecare/HomeCareChecklistClient.tsx'), 'utf8');
const capture = readFileSync(join(root, 'src/components/homecare/HomeCareRecordCapture.tsx'), 'utf8');
const registry = readFileSync(join(root, 'src/lib/homecare/records.ts'), 'utf8');

test('AC1: the prefill read is server-only and fail-soft (never 500s the checklist pre-go-live)', () => {
  // Returns [] when the secret key is missing, and swallows every error
  // (including a missing home_records table) so the page still renders.
  expect(readHelper).toContain('if (!process.env.SUPABASE_SECRET_KEY) return [];');
  expect(readHelper).toMatch(/try \{[\s\S]*catch \{[\s\S]*return \[\];[\s\S]*\}/);
  expect(readHelper).toContain("from '@/lib/notify/supabase-rest'");
  // It lives OUTSIDE records.ts so the pure registry stays client-importable
  // (a client bundle must never pull in the service-role supabaseRest).
  expect(registry).not.toContain("from '@/lib/notify/supabase-rest'");
});

test('AC2: the checklist page reads saved facts and passes prefill + consent state to the client', () => {
  expect(page).toContain("import { readHomeRecords } from '@/lib/homecare/homeRecords'");
  expect(page).toContain('readHomeRecords(homeowner.id)');
  // Consent-already-given is inferred only from a homeowner-authored row (the
  // write path logs the homeowner's consent before it stores a homeowner write;
  // a staff-entered row must not suppress the first-save consent checkbox).
  expect(page).toContain("const homeDetailsConsentGiven = (homeRecords ?? []).some((r) => r.updated_by === 'homeowner');");
  expect(page).toContain('homeRecordPrefill={homeRecordPrefill}');
  expect(page).toContain('homeDetailsConsentGiven={homeDetailsConsentGiven}');
});

test('AC3: the capture trigger + panel render only for a task that maps to a fact', () => {
  expect(client).toContain("import { getFactForTask } from '@/lib/homecare/records'");
  expect(client).toContain("import HomeCareRecordCapture, { type RecordValue } from '@/components/homecare/HomeCareRecordCapture'");
  expect(client).toContain('const fact = getFactForTask(t.key);');
  // Trigger is gated on `fact` and toggles the panel.
  expect(client).toMatch(/\{fact && \([\s\S]{0,400}toggleCapture\(panelKey\)/);
  // Panel is gated on fact + open, and wires prefill/consent/onSaved.
  expect(client).toMatch(/\{fact && captureOpen && \([\s\S]{0,400}HomeCareRecordCapture/);
  expect(client).toContain('prefill={records.get(fact.key)}');
  expect(client).toContain('showConsent={!consentGiven}');
});

test('AC4: one saved fact surfaces on every task that maps to it (canonical overlay)', () => {
  // The overlay is keyed by canonical fact_key, not task key, so a save from
  // one row prefills + relabels every sibling row for the same fact.
  expect(client).toContain('new Map(Object.entries(homeRecordPrefill))');
  expect(client).toContain('setRecords((prev) => new Map(prev).set(factKey, value))');
  expect(client).toContain('const saved = fact ? records.has(fact.key) : false;');
});

test('AC5: first-save consent uses the exact logged constant, only on the first save', () => {
  // The checkbox label is the imported constant (byte-identical to what the
  // server logs to consent_logs), never a hardcoded duplicate that could drift.
  expect(capture).toContain("import { HOME_DETAILS_CONSENT_TEXT, MAX_NOTE, type HomeFact } from '@/lib/homecare/records'");
  expect(capture).toContain('{HOME_DETAILS_CONSENT_TEXT}');
  expect(capture).not.toContain(HOME_DETAILS_CONSENT_TEXT.slice(0, 40));
  // Consent is sent only while it is still needed (first save, or after a 403
  // re-prompt), and Save is blocked until the box is checked then.
  expect(capture).toContain('...(needConsent ? { consent: true } : {})');
  expect(capture).toContain('(!needConsent || consentChecked)');
  // The consent block only renders while consent is still needed.
  expect(capture).toMatch(/\{needConsent && \([\s\S]{0,400}type="checkbox"/);
});

test('AC6: the save posts the right contract in-process, never a self-fetch to another route', () => {
  expect(capture).toContain("fetch('/api/home-care/record'");
  expect(capture).toContain("credentials: 'same-origin'");
  for (const field of ['fact_key: fact.key', 'source_task_key: sourceTaskKey', 'note: trimmedNote', 'detail: detailPayload']) {
    expect(capture, `record POST body should include ${field}`).toContain(field);
  }
  // Exactly one fetch, and never to the consent route (Cloudflare interstitials
  // a server-to-server call to our own domain - consent is logged in-process by
  // the record route itself).
  expect(capture).not.toContain('/api/consent/log');
  expect((capture.match(/fetch\(/g) ?? []).length).toBe(1);
  // Client maxlengths mirror the server caps so nothing is silently truncated.
  expect(capture).toContain('maxLength={MAX_NOTE}');
});

test('AC7: a consent-log failure keeps consent state so the retry re-sends it', () => {
  // The route 500s WITHOUT storing when the consent log fails; onSaved (which
  // flips the parent consentGiven) must fire only on a 200, so the next attempt
  // still sends consent:true. Guard: onSaved is called only after the ok check.
  const okIdx = capture.indexOf('if (!res.ok || !data.ok)');
  const savedIdx = capture.indexOf('onSaved({');
  expect(okIdx).toBeGreaterThan(-1);
  expect(savedIdx).toBeGreaterThan(okIdx);
});

test('AC8: capture buttons keep a full 44px tap target (visual shrink on a nested span)', () => {
  // The trigger button carries no height/width utility - its small look lives in
  // the nested span (globals.css forces every button to min 44px). Grab just the
  // button's own className value (up to its closing quote), not the nested icons.
  const triggerMatch = client.match(/onClick=\{\(\) => toggleCapture\(panelKey\)\}[\s\S]{0,140}?className="([^"]*)"/);
  expect(triggerMatch).not.toBeNull();
  const triggerButtonClass = triggerMatch?.[1] ?? '';
  expect(triggerButtonClass).toContain('inline-flex');
  expect(triggerButtonClass).not.toMatch(/\bh-\d/);
  expect(triggerButtonClass).not.toMatch(/\bw-\d/);
  // Save button sizes via padding, not a sub-44 height class.
  const saveMatch = capture.match(/onClick=\{save\}[\s\S]{0,140}?className="([^"]*)"/);
  expect(saveMatch).not.toBeNull();
  expect(saveMatch?.[1] ?? '').not.toMatch(/\bh-\d/);
});

test('AC9: no em dashes in any Slice 3 file (global style rule)', () => {
  // The two brand-new files are fully ours.
  expect(readHelper.includes('—'), 'homeRecords.ts').toBe(false);
  expect(capture.includes('—'), 'HomeCareRecordCapture.tsx').toBe(false);
  // The checklist client is legacy (its cards already use em dashes), so scan
  // only the three tightly-bounded Slice 3 blocks we added, not the whole file.
  const slice = (start: string, end: string) => {
    const s = client.indexOf(start);
    const e = client.indexOf(end, s);
    return client.slice(s, e + end.length);
  };
  const stateBlock = slice('// My Home Systems: an overlay', 'setConsentGiven(true);');
  const triggerBlock = slice('// My Home Systems: save where a system is', '{!isDone && (');
  const panelBlock = slice('{fact && captureOpen && (', 'handleRecordSaved(fact.key, value)');
  expect(stateBlock.includes('—'), 'checklist client state block').toBe(false);
  expect(triggerBlock.includes('—'), 'checklist client trigger block').toBe(false);
  expect(panelBlock.includes('—'), 'checklist client panel block').toBe(false);
  // Sanity: the blocks actually resolved (anchors still present).
  expect(stateBlock.length).toBeGreaterThan(40);
  expect(triggerBlock.length).toBeGreaterThan(40);
});
