import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const root = process.cwd();

// Wiring guards for the Home Care portal re-access pieces (magic-link login,
// returning-member block, "My Home Care" header link). File-level assertions in
// the same style as home-care.spec.ts — the runtime flow is cookie/DB-gated.

test('login route exists, is non-enumerating, and reuses the magic-link flow', () => {
  const p = join(root, 'src/app/api/home-care/login/route.ts');
  expect(existsSync(p)).toBe(true);
  const src = readFileSync(p, 'utf8');
  expect(src).toContain("existing.status === 'active'"); // only actives get a link
  expect(src).toContain('sendHomeCareVerificationEmail');
  expect(src).toContain('home_care_login');
  expect(src).toContain('honeypot');
  expect(src).toContain('checkRateLimit');
  // Always returns generic success (never reveals membership).
  expect(src).toContain('return NextResponse.json({ ok: true })');
});

test('opt-in form has an email-only login mode posting to the login route', () => {
  const src = readFileSync(join(root, 'src/components/homecare/HomeCareOptInForm.tsx'), 'utf8');
  expect(src).toContain("'/api/home-care/login'");
  expect(src).toContain("useState<'signup' | 'login'>");
  expect(src).toContain('RECAPTCHA_LOGIN_ACTION');
  // name/zip are not required in login mode
  expect(src).toContain('!isLogin && !state.first_name.trim()');
});

test('home-care page renders a returning-member block gated by the access cookie', () => {
  const src = readFileSync(join(root, 'src/app/home-care/page.tsx'), 'utf8');
  expect(src).toContain('verifyHomeAccess');
  expect(src).toContain('HC_ACCESS_COOKIE');
  expect(src).toContain('Open my checklist');
  expect(src).toContain("export const dynamic = 'force-dynamic'");
});

test('header shows a My Home Care link derived from the hc_known cookie', () => {
  const src = readFileSync(join(root, 'src/components/Header.tsx'), 'utf8');
  expect(src).toContain('hc_known');
  expect(src).toContain('My Home Care');
  expect(src).toContain('/home-care/checklist');
});
