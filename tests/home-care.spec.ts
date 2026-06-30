import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { currentSeason, nextSeason } from '../src/lib/homecare/season';
import { signHomeAccess, verifyHomeAccess } from '../src/lib/homecare/accessCookie';

/**
 * Home Care Phase 1: opt-in flow. Pure logic + wiring guards (the flow itself
 * is cookie-gated / DB-backed, so end-to-end runs in the browser/admin).
 */

test('currentSeason maps months to NJ seasons', () => {
  expect(currentSeason(new Date('2026-01-15T00:00:00Z'))).toBe('winter');
  expect(currentSeason(new Date('2026-04-15T00:00:00Z'))).toBe('spring');
  expect(currentSeason(new Date('2026-07-15T00:00:00Z'))).toBe('summer');
  expect(currentSeason(new Date('2026-10-15T00:00:00Z'))).toBe('fall');
  expect(currentSeason(new Date('2026-12-15T00:00:00Z'))).toBe('winter');
  expect(nextSeason('summer')).toBe('fall');
});

test('hc_access cookie signs + verifies, and rejects tampering', async () => {
  process.env.LISTINGS_ACCESS_SECRET = 'test-secret-home-care';
  const token = await signHomeAccess('homeowner-123');
  const ok = await verifyHomeAccess(token);
  expect(ok?.homeownerId).toBe('homeowner-123');

  // Tampered signature → rejected.
  const tampered = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa');
  expect(await verifyHomeAccess(tampered)).toBeNull();
  expect(await verifyHomeAccess(undefined)).toBeNull();
  expect(await verifyHomeAccess('garbage')).toBeNull();
});

test('opt-in flow files are wired', () => {
  const root = process.cwd();
  for (const p of [
    'src/app/home-care/page.tsx',
    'src/app/home-care/checklist/page.tsx',
    'src/app/api/home-care/subscribe/route.ts',
    'src/app/api/home-care/verify/route.ts',
    'src/app/api/home-care/unsubscribe/route.ts',
    'src/components/homecare/HomeCareOptInForm.tsx',
    'src/lib/homecare/homeowners.ts',
    'src/lib/homecare/accessCookie.ts',
    'src/lib/notify/sendHomeCareEmails.ts',
    'supabase/migrations/20260725000000_home_care_phase1.sql',
    'src/app/home-care/book/page.tsx',
    'src/components/homecare/HomeCareBookingForm.tsx',
  ]) {
    expect(existsSync(join(root, p)), p).toBe(true);
  }
});

test('booking form posts a valid lead (constraint-safe values)', () => {
  const src = readFileSync(join(process.cwd(), 'src/components/homecare/HomeCareBookingForm.tsx'), 'utf8');
  expect(src).toContain('/api/leads/submit');
  expect(src).toContain("inquiry_type: 'estimate'"); // valid CHECK value
  expect(src).toContain("project_type: 'other'"); // valid CHECK value
  expect(src).toContain("'home_care_booking'"); // single-task booking source
  expect(src).toContain("'home_care_estimate_request'"); // multi-service estimate source
});

test('Home Care is linked in nav + footer', () => {
  const header = readFileSync(join(process.cwd(), 'src/components/Header.tsx'), 'utf8');
  const footer = readFileSync(join(process.cwd(), 'src/components/Footer.tsx'), 'utf8');
  expect(header).toContain('/home-care');
  expect(footer).toContain('/home-care');
});
