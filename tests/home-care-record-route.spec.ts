import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { HOME_DETAILS_CONSENT_TYPE, HOME_DETAILS_CONSENT_TEXT } from '../src/lib/homecare/records';

/**
 * Home Care "My Home Systems" - Slice 2: capture API + consent + privacy.
 *
 * The homeowner write path for saving a home fact (where the water shut-off is,
 * the HVAC filter size). Cookie-gated, active-status re-checked, validated
 * through the records.ts chokepoint, upserted one canonical row per fact. First
 * save logs affirmative consent to consent_logs IN-PROCESS (never a self-fetch)
 * before writing the sensitive record. These guard the route's gates + wiring
 * (source assertions, like the other home-care route specs, since a live write
 * needs the home_records table which is applied to Supabase at go-live) and the
 * consent constant. The privacy-policy disclosure is asserted live in
 * tests/privacy-policy.spec.ts.
 */

const root = process.cwd();
const route = readFileSync(join(root, 'src/app/api/home-care/record/route.ts'), 'utf8');
const registrySrc = readFileSync(join(root, 'src/lib/homecare/records.ts'), 'utf8');

test('AC1: route is cookie-gated and re-checks the account is active (fail closed)', () => {
  expect(route).toContain("verifyHomeAccess(request.cookies.get(HC_ACCESS_COOKIE)?.value)");
  expect(route).toMatch(/if \(!access\)[\s\S]{0,160}401/);
  expect(route).toContain('findHomeownerById(access.homeownerId)');
  expect(route).toMatch(/homeowner\.status !== 'active'[\s\S]{0,160}401/);
  // Writes are scoped to the signed-in homeowner (never a client-supplied id).
  expect(route).toContain('homeowner_id: access.homeownerId');
});

test('AC2: unknown facts and empty saves are rejected; detail runs through the chokepoint', () => {
  expect(route).toContain('getFact(factKey)');
  expect(route).toMatch(/if \(!fact\)[\s\S]{0,80}Unknown fact[\s\S]{0,40}400/);
  expect(route).toContain('validateFactDetail(factKey, body.detail)');
  expect(route).toContain('sanitizeNote(body.note)');
  // A save must carry a note or at least one detail field.
  expect(route).toMatch(/Nothing to save[\s\S]{0,40}400/);
});

test('AC3: it upserts one canonical row per fact', () => {
  expect(route).toContain("'home_records?on_conflict=homeowner_id,fact_key'");
  expect(route).toContain("resolution=merge-duplicates,return=minimal");
  expect(route).toContain("updated_by: 'homeowner'");
});

test('AC4: first-save consent is logged in-process, before the record, and blocks on failure', () => {
  // Logs to consent_logs with the sensitive-category type...
  expect(route).toContain("if (body.consent === true)");
  expect(route).toContain("'consent_logs'");
  expect(route).toContain('HOME_DETAILS_CONSENT_TYPE');
  expect(route).toContain('HOME_DETAILS_CONSENT_TEXT');
  // ...and if consent can't be recorded, the sensitive data is NOT stored (500).
  expect(route).toMatch(/Could not record consent[\s\S]{0,80}500/);
  // The logged consent proof includes the IP address the privacy policy promises,
  // validated as a real inet value (consent_logs.ip_address is a Postgres inet
  // column). An unparseable header drops the field rather than 422ing the insert
  // and blocking a consented save.
  expect(route).toContain('clientInetOrNull(request)');
  expect(route).toContain('consentRow.ip_address = ip');
  // NOT via a self-fetch to our own domain (Cloudflare would interstitial it).
  expect(route).not.toContain('/api/consent/log');
  expect(route).not.toMatch(/fetch\(/);
  // The consent write is ordered before the record upsert.
  expect(route.indexOf("'consent_logs'")).toBeLessThan(route.indexOf("'home_records?on_conflict"));
  // Home-details is a data-storage consent, not a telephone-marketing one, so the
  // proof must NOT claim TCPA consent (mirrors newsletter_home_care, which omits it).
  expect(route).not.toContain('tcpa_consent');
});

test('AC4b: without consent, the route requires a prior homeowner-authored row before storing', () => {
  // Non-consent path checks prior consent via a homeowner-scoped home_records read.
  expect(route).toContain('home_records?select=fact_key&homeowner_id=eq.');
  expect(route).toContain('updated_by=eq.homeowner');
  // No prior consent -> 403 Consent required, and the data is NOT stored.
  expect(route).toMatch(/Consent required[\s\S]{0,40}403/);
  // The prior-consent check is ordered before the record upsert.
  expect(route.indexOf('updated_by=eq.homeowner')).toBeLessThan(route.indexOf("'home_records?on_conflict"));
});

test('AC5: consent constant is the sensitive-details type with v1-accurate text', () => {
  expect(HOME_DETAILS_CONSENT_TYPE).toBe('home_care_home_details');
  expect(HOME_DETAILS_CONSENT_TEXT.length).toBeGreaterThan(60);
  // Names the data, that staff can see it, and the delete/leave controls.
  expect(HOME_DETAILS_CONSENT_TEXT).toMatch(/shut-offs/i);
  expect(HOME_DETAILS_CONSENT_TEXT).toMatch(/delete/i);
  expect(HOME_DETAILS_CONSENT_TEXT).toMatch(/leave the program/i);
  // v1 scope: no photos, no serials yet (those ship with the photo slice).
  expect(HOME_DETAILS_CONSENT_TEXT).not.toMatch(/photo/i);
  expect(HOME_DETAILS_CONSENT_TEXT).not.toMatch(/serial/i);
});

test('AC6: no em dashes in the newly authored Slice 2 files (global style rule)', () => {
  expect(route.includes('—'), 'record route').toBe(false);
  // The consent constants added to records.ts must be clean too.
  const consentBlock = registrySrc.slice(registrySrc.indexOf('HOME_DETAILS_CONSENT_TYPE'));
  expect(consentBlock.includes('—'), 'consent constants').toBe(false);
});
