import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getClientIp } from '@/lib/rateLimit';

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

// Regression guards for the portal-access hardening (security review 2026-07-01):
// 1) trusted client-IP source, 2) generic API errors (no schema leak),
// 3) status re-check on authed writes, 4) constant-time login send via after().

test('getClientIp prefers edge-set headers over spoofable X-Forwarded-For', () => {
  const mk = (h: Record<string, string>) => new Request('http://x', { headers: h });
  // Cloudflare fronts prod: cf-connecting-ip is authoritative even when a client
  // spoofs X-Forwarded-For to try to rotate rate-limit buckets.
  expect(getClientIp(mk({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))).toBe('203.0.113.7');
  // No Cloudflare (direct Vercel): x-real-ip still beats spoofed XFF.
  expect(getClientIp(mk({ 'x-real-ip': '198.51.100.5', 'x-forwarded-for': '1.2.3.4' }))).toBe('198.51.100.5');
  // Local/dev fallback only when no trusted header is present.
  expect(getClientIp(mk({ 'x-forwarded-for': '127.0.0.1' }))).toBe('127.0.0.1');
  expect(getClientIp(mk({}))).toBe('unknown');
});

test('authed write routes re-check active status and never echo raw DB errors', () => {
  for (const rel of ['src/app/api/home-care/task/route.ts', 'src/app/api/home-care/profile/route.ts']) {
    const src = read(rel);
    // Revocation: a signed cookie outlives unsubscribe, so re-verify the account.
    expect(src).toContain('findHomeownerById(access.homeownerId)');
    expect(src).toContain("homeowner.status !== 'active'");
    // The 500 branch must NOT leak the internal error message to the client.
    expect(src).not.toContain('error: message }, { status: 500 }');
    expect(src).toContain("error: 'Something went wrong. Please try again.' }, { status: 500 }");
  }
});

test('login send runs after() so response latency does not reveal membership', () => {
  const src = read('src/app/api/home-care/login/route.ts');
  expect(src).toContain("import { NextRequest, NextResponse, after } from 'next/server'");
  expect(src).toContain('after(async () => {');
  // The membership-dependent work (lookup + email) is inside the deferred block,
  // and the generic success returns unconditionally after scheduling it.
  const afterIdx = src.indexOf('after(async () => {');
  const returnIdx = src.lastIndexOf('return NextResponse.json({ ok: true })');
  expect(afterIdx).toBeGreaterThan(-1);
  expect(returnIdx).toBeGreaterThan(afterIdx);
  expect(src.slice(afterIdx, returnIdx)).toContain('sendHomeCareVerificationEmail');
});
