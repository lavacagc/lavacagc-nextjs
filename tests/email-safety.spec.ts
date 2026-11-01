import { test, expect } from '@playwright/test';
import { applyEmailSafety, audienceWritesAllowed, emailRedirectTarget, RESEND_TEST_SINK } from '../src/lib/notify/emailSafety';

const envelope = { to: ['homeowner@example.com'], cc: ['office@lavacagc.com'], subject: 'Confirm your email' };
const env = (v: Record<string, string>) => v as unknown as NodeJS.ProcessEnv;

test.describe('email safety outside production', () => {
  test('production sends to the real recipients and may write audiences', () => {
    const prod = env({ VERCEL_ENV: 'production', VERCEL_REGION: 'iad1' });
    expect(applyEmailSafety(envelope, prod)).toEqual(envelope);
    expect(audienceWritesAllowed(prod)).toBe(true);
  });

  test('production env pulled into .env.local (no VERCEL_REGION) never mails a real person', () => {
    const pulled = env({ VERCEL_ENV: 'production' });
    expect(emailRedirectTarget(pulled)).toBe(RESEND_TEST_SINK);
    const out = applyEmailSafety(envelope, pulled);
    expect(out.to).toEqual([RESEND_TEST_SINK]);
    expect(out.cc).toEqual([]);
    expect(out.subject).toBe('[production → homeowner@example.com, office@lavacagc.com] Confirm your email');
    expect(audienceWritesAllowed(pulled)).toBe(false);
    expect(emailRedirectTarget(env({ VERCEL_ENV: 'production', VERCEL_REGION: ' ' }))).toBe(RESEND_TEST_SINK);
  });

  test('a preview with no setting still never mails a real person', () => {
    const preview = env({ VERCEL_ENV: 'preview' });
    expect(emailRedirectTarget(preview)).toBe(RESEND_TEST_SINK);
    const out = applyEmailSafety(envelope, preview);
    expect(out.to).toEqual([RESEND_TEST_SINK]);
    expect(out.cc).toEqual([]);
    expect(out.subject).toBe('[preview → homeowner@example.com, office@lavacagc.com] Confirm your email');
    expect(audienceWritesAllowed(preview)).toBe(false);
  });

  test('local next dev or next start (VERCEL_ENV unset) never mails a real person', () => {
    const local = env({});
    expect(emailRedirectTarget(local)).toBe(RESEND_TEST_SINK);
    const out = applyEmailSafety(envelope, local);
    expect(out.to).toEqual([RESEND_TEST_SINK]);
    expect(out.cc).toEqual([]);
    expect(out.subject).toBe('[local → homeowner@example.com, office@lavacagc.com] Confirm your email');
    expect(audienceWritesAllowed(local)).toBe(false);
  });

  test('vercel dev (VERCEL_ENV development) never mails a real person', () => {
    const development = env({ VERCEL_ENV: 'development' });
    expect(emailRedirectTarget(development)).toBe(RESEND_TEST_SINK);
    expect(applyEmailSafety(envelope, development).to).toEqual([RESEND_TEST_SINK]);
    expect(audienceWritesAllowed(development)).toBe(false);
  });

  test('EMAIL_REDIRECT_TO picks the inbox, in any environment', () => {
    const out = applyEmailSafety(envelope, env({ VERCEL_ENV: 'preview', EMAIL_REDIRECT_TO: 'tests@example.com' }));
    expect(out.to).toEqual(['tests@example.com']);
    expect(audienceWritesAllowed(env({ EMAIL_REDIRECT_TO: 'tests@example.com' }))).toBe(false);
    const prodEnv = env({ VERCEL_ENV: 'production', VERCEL_REGION: 'iad1', EMAIL_REDIRECT_TO: 'tests@example.com' });
    expect(applyEmailSafety(envelope, prodEnv).to).toEqual(['tests@example.com']);
    expect(audienceWritesAllowed(prodEnv)).toBe(false);
  });
});
