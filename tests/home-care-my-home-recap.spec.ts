import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Home Care "My Home Systems" - Slice 4: the "My Home" recap + delete.
 *
 * A collapsed recap on the checklist lists every home fact the homeowner has
 * saved, and lets them edit in place or delete one - the "view or delete these
 * anytime" half of the consent promise. Delete goes through a new DELETE method
 * on the record route, scoped to the signed-in homeowner. Like the other
 * home-care slices, a live checklist render needs a real session + the
 * go-live-only home_records table, so these are source/contract assertions; the
 * rendered recap + edit/delete flow are verified in a browser before commit.
 */

const root = process.cwd();
const route = readFileSync(join(root, 'src/app/api/home-care/record/route.ts'), 'utf8');
const client = readFileSync(join(root, 'src/components/homecare/HomeCareChecklistClient.tsx'), 'utf8');

test('AC1: DELETE route is cookie-gated, re-checks active, validates the fact, and is homeowner-scoped', () => {
  expect(route).toContain('export async function DELETE(request: NextRequest)');
  // Same auth + fail-closed active re-check as the write path.
  expect(route).toMatch(/export async function DELETE[\s\S]{0,220}verifyHomeAccess\(request\.cookies\.get\(HC_ACCESS_COOKIE\)\?\.value\)/);
  expect(route).toMatch(/export async function DELETE[\s\S]{0,600}homeowner\.status !== 'active'[\s\S]{0,120}401/);
  // Unknown fact is rejected (chokepoint), and the delete is scoped to the
  // signed-in homeowner's own row via homeowner_id in the filter.
  expect(route).toMatch(/export async function DELETE[\s\S]{0,900}getFact\(factKey\)[\s\S]{0,120}400/);
  expect(route).toMatch(/supabaseRest\(\s*'DELETE',\s*`home_records\?homeowner_id=eq\.\$\{access\.homeownerId\}&fact_key=eq\.\$\{encodeURIComponent\(factKey\)\}`/);
});

test('AC2: the recap renders only when something is saved, in registry order, with a value summary', () => {
  expect(client).toContain('const savedFacts = HOME_FACTS.filter((f) => records.has(f.key));');
  expect(client).toContain('{savedFacts.length > 0 && (');
  // Each entry shows the fact label and a one-line value summary.
  expect(client).toContain('factValueSummary(fact, val)');
  expect(client).toContain('{fact.label}');
  // factValueSummary is the shared registry helper (Slice 5 lifted it into
  // records.ts so the booking rider renders a saved detail identically); the
  // recap imports it rather than defining its own copy.
  expect(client).toMatch(/import\s*\{[^}]*factValueSummary[^}]*\}\s*from\s*'@\/lib\/homecare\/records'/);
  expect(client).not.toMatch(/function factValueSummary/);
  // Location facts show the note; appliance facts join filled fields.
  const records = readFileSync(join(__dirname, '..', 'src/lib/homecare/records.ts'), 'utf8');
  expect(records).toMatch(/export function factValueSummary[\s\S]{0,160}kind === 'location'[\s\S]{0,60}val\.note/);
});

test('AC3: recap entries edit in place by reusing the capture component', () => {
  // The edit panel reuses HomeCareRecordCapture with the saved value prefilled,
  // keyed in the same open-set under a recap: namespace so it does not collide
  // with the per-task panels.
  expect(client).toContain('const editKey = `recap:${fact.key}`;');
  expect(client).toMatch(/editing && \([\s\S]{0,300}HomeCareRecordCapture/);
  expect(client).toMatch(/HomeCareRecordCapture[\s\S]{0,220}prefill=\{val\}[\s\S]{0,120}onSaved=/);
  expect(client).toContain('showConsent={!consentGiven}');
});

test('AC4: delete is a two-tap confirm, optimistic with revert, in-process DELETE', () => {
  // Two-tap confirm so a saved detail is never lost by an accidental tap.
  expect(client).toContain('confirmDelete === fact.key ?');
  // First tap arms the confirm for this fact (the trigger also clears any prior
  // delete error). Assert the state-setter, not the exact handler body.
  expect(client).toContain('setConfirmDelete(fact.key)');
  // Optimistic remove from the overlay Map, DELETE to the record route, revert on failure.
  expect(client).toContain("method: 'DELETE'");
  expect(client).toContain("fetch('/api/home-care/record'");
  expect(client).toContain("credentials: 'same-origin'");
  expect(client).toMatch(/catch \{[\s\S]{0,160}if \(prev\) setRecords\(\(m\) => new Map\(m\)\.set\(factKey, prev\)\)/);
  // Never a self-fetch to another domain route.
  expect(client).not.toContain('/api/consent/log');
});

test('AC5: recap action buttons keep a full 44px tap target (visual on a nested span)', () => {
  // The Edit/Remove buttons carry no height/width utility - the small look lives
  // in the nested span (globals.css forces every button to min 44px).
  const editMatch = client.match(/onClick=\{\(\) => toggleCapture\(editKey\)\}[\s\S]{0,120}?className="([^"]*)"/);
  expect(editMatch).not.toBeNull();
  expect(editMatch?.[1] ?? '').not.toMatch(/\bh-\d/);
  expect(editMatch?.[1] ?? '').not.toMatch(/\bw-\d/);
});

test('AC6: no em dashes in the Slice 4 additions', () => {
  // The DELETE route section we added.
  const del = route.slice(route.indexOf('export async function DELETE'));
  expect(del.includes('—'), 'record route DELETE').toBe(false);
  // The recap block and the delete handler in the (legacy) client.
  const recap = client.slice(client.indexOf('"My Home" recap:'), client.indexOf('Sticky plan header'));
  const helper = client.slice(client.indexOf('// One-line value summary'), client.indexOf('function factValueSummary') + 400);
  const del2 = client.slice(client.indexOf('// "My Home" recap delete'), client.indexOf('const handleRecordDelete') + 900);
  expect(recap.includes('—'), 'recap block').toBe(false);
  expect(helper.includes('—'), 'factValueSummary').toBe(false);
  expect(del2.includes('—'), 'delete handler').toBe(false);
});
