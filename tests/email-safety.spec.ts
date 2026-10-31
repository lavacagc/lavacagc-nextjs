import { test, expect } from '@playwright/test';
import { applyEmailSafety, audienceWritesAllowed, emailRedirectTarget, RESEND_TEST_SINK } from '../src/lib/notify/emailSafety';

const envelope = { to: ['homeowner@example.com'], cc: ['office@lavacagc.com'], subject: 'Confirm your email' };
const env = (v: Record<string, string>) => v as unknown as NodeJS.ProcessEnv;

test.describe('email safety outside production', () => {
  test('production sends to the real recipients and may write audiences', () => {
    const prod = env({ VERCEL_ENV: 'production' });
    expect(applyEmailSafety(envelope, prod)).toEqual(envelope);
    expect(audienceWritesAllowed(prod)).toBe(true);
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

  test('EMAIL_REDIRECT_TO picks the inbox, in any environment', () => {
    const out = applyEmailSafety(envelope, env({ VERCEL_ENV: 'preview', EMAIL_REDIRECT_TO: 'tests@example.com' }));
    expect(out.to).toEqual(['tests@example.com']);
    expect(audienceWritesAllowed(env({ EMAIL_REDIRECT_TO: 'tests@example.com' }))).toBe(false);
  });
});
