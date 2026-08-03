import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { checklistUrl, hasAccessToken, GOOGLE_REVIEW_URL } from '../src/lib/homecare/emailLinks';
import { safeDestination } from '../src/app/api/home-care/access/route';
import { buildServiceCompletedEmail, buildVisitReminderEmail } from '../src/lib/homecare/serviceEmails';

/**
 * Two live email bugs reported by the owner on 2 Aug.
 *
 * 1. The service-completion email asked for a review and linked to the
 *    checklist, so a customer who had just had work done was sent to look at
 *    their chore list instead of Google.
 * 2. Every emailed checklist link was bare. /home-care/checklist redirects to
 *    /home-care without an hc_access cookie, and that cookie lasts 30 days, so
 *    recipients landed on the signup page. Reproduced before fixing: a bare
 *    request answered 307 to /home-care.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const code = (p: string) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const BASE = 'https://www.lavacagc.com';
// Deliberately low-entropy and obviously fake: a random-looking hex string here
// trips the repo's gitleaks pre-commit hook as a generic-api-key.
const TOKEN = 'test-access-token-not-a-real-secret';

test.describe('the completion email asks for a Google review', () => {
  test('the CTA is the owner Google review URL, not the checklist', () => {
    const { html, text } = buildServiceCompletedEmail({
      recipientName: 'Jordan', services: ['Clean gutters'],
      feedbackUrl: GOOGLE_REVIEW_URL, unsubscribeUrl: `${BASE}/unsub`,
    });
    expect(html).toContain('https://g.page/r/CflitSa4DKHAEAI/review');
    expect(text).toContain('https://g.page/r/CflitSa4DKHAEAI/review');
    expect(html).not.toContain('/home-care/checklist');
  });

  test('the route passes the review URL, not a checklist link', () => {
    const src = code('src/app/api/admin/service-quote/complete/route.ts');
    expect(src).toContain('feedbackUrl: GOOGLE_REVIEW_URL');
    expect(src).not.toContain('feedbackUrl: `${SITE_URL}/home-care/checklist`');
  });

  test('the review URL is defined once, so it cannot drift', () => {
    const hits = read('src/lib/homecare/emailLinks.ts').match(/g\.page\/r\//g) ?? [];
    expect(hits).toHaveLength(1);
  });
});

test.describe('emailed portal links carry the access token', () => {
  test('a link with a token goes through the access route', () => {
    const url = checklistUrl(BASE, TOKEN);
    expect(url).toContain('/api/home-care/access');
    expect(url).toContain(`token=${TOKEN}`);
    expect(url).toContain('to=%2Fhome-care%2Fchecklist');
  });

  test('a deep link keeps its query through the exchange', () => {
    const url = checklistUrl(BASE, TOKEN, { query: { add: 'clean-gutters' } });
    expect(decodeURIComponent(url)).toContain('to=/home-care/checklist?add=clean-gutters');
  });

  test('utm tags ride the outer link, not the destination', () => {
    const url = new URL(checklistUrl(BASE, TOKEN, { utm: { utm_source: 'visit_reminder' } }));
    expect(url.searchParams.get('utm_source')).toBe('visit_reminder');
    expect(url.searchParams.get('to')).toBe('/home-care/checklist');
  });

  test('no token degrades to the bare url, never to token=null', () => {
    for (const missing of [null, undefined, '']) {
      const url = checklistUrl(BASE, missing);
      expect(url).not.toContain('token=');
      expect(url).toContain('/home-care/checklist');
    }
    expect(hasAccessToken(null)).toBe(false);
    expect(hasAccessToken(TOKEN)).toBe(true);
  });

  test('every email that links to the portal reads the token and passes it on', () => {
    // Two shapes, both correct: a sender that builds the link itself, and one
    // that hands the token to a builder which does. What matters is that the
    // token is SELECTED from the homeowner and reaches the link either way.
    const senders = [
      'src/app/api/cron/visit-reminders/route.ts',
      'src/app/api/cron/home-care-newsletter/route.ts',
      'src/app/api/admin/service-quote/schedule/route.ts',
    ];
    for (const file of senders) {
      const src = code(file);
      expect(src, `${file} must select access_token from the homeowner`).toMatch(/select=[^`'"]*access_token|access_token/);
      const buildsItself = src.includes('checklistUrl(');
      const delegates = /accessToken:\s*\w+\.access_token/.test(src);
      expect(buildsItself || delegates, `${file} must either build the link or pass the token to a builder`).toBe(true);
    }
  });

  test('the newsletter builder puts the token on every link it renders', () => {
    const src = code('src/lib/homecare/newsletter.ts');
    expect(src).toContain('accessToken');
    // Its "Add to plan" deep links must go through the exchange too, or the
    // one button designed to change something silently fails.
    expect(src).not.toMatch(/\$\{checklistUrl\}\?add=/);
  });

  test('no email builder still hardcodes a bare checklist url', () => {
    const files = [
      'src/app/api/cron/visit-reminders/route.ts',
      'src/app/api/cron/home-care-newsletter/route.ts',
      'src/app/api/admin/service-quote/schedule/route.ts',
      'src/lib/homecare/releaseEmail.ts',
      'src/lib/homecare/newsletter.ts',
    ];
    for (const f of files) {
      expect(code(f), `${f} must not build a bare checklist link`).not.toMatch(/\$\{[A-Za-z_]+\}\/home-care\/checklist/);
    }
  });

  test('the reminder email renders the tokenized link', () => {
    const { html } = buildVisitReminderEmail({
      recipientName: 'Jordan', services: ['Clean gutters'], address: '14 Maple Ave',
      timeWindow: '8:00 - 11:00am', visitDateLabel: 'Tomorrow',
      portalUrl: checklistUrl(BASE, TOKEN), unsubscribeUrl: `${BASE}/unsub`,
    });
    expect(html).toContain('/api/home-care/access');
    expect(html).toContain(TOKEN);
  });
});

test.describe('the access route cannot be turned into an open redirect', () => {
  test('anything that could leave the site falls back to the checklist', () => {
    for (const evil of [
      '//evil.com', 'https://evil.com', 'http://evil.com', '/\\evil.com',
      '\\\\evil.com', '/vaca-mgmt', '/vaca-mgmt/send-estimate', '/api/admin/subscribers',
    ]) {
      expect(safeDestination(evil), `${evil} must not survive`).toBe('/home-care/checklist');
    }
  });

  test('the portal destinations it is meant to serve do survive', () => {
    expect(safeDestination('/home-care/checklist')).toBe('/home-care/checklist');
    expect(safeDestination('/home-care/checklist?add=clean-gutters')).toBe('/home-care/checklist?add=clean-gutters');
    expect(safeDestination('/home-care/guides')).toBe('/home-care/guides');
    expect(safeDestination('/home-care/guides/summer')).toBe('/home-care/guides/summer');
    expect(safeDestination('/home-care/whats-new')).toBe('/home-care/whats-new');
  });

  test('a missing destination defaults to the checklist', () => {
    expect(safeDestination(null)).toBe('/home-care/checklist');
    expect(safeDestination('')).toBe('/home-care/checklist');
  });

  test('a prefix that only looks like an allowed path does not survive', () => {
    // "/home-care-evil" starts with "/home-care" as a string but is not a
    // portal path, so the check compares whole segments.
    expect(safeDestination('/home-care-evil')).toBe('/home-care/checklist');
  });
});

test.describe('the access route fails safely', () => {
  test('the cookie is signed, never the raw homeowner id', () => {
    const src = code('src/app/api/home-care/access/route.ts');
    expect(src).toContain('signHomeAccess');
    expect(src).not.toMatch(/HC_ACCESS_COOKIE,\s*homeowner\.id/);
  });

  test('a signing failure redirects rather than throwing a bare 500', () => {
    // signHomeAccess throws when the secret is unset or rotated. Unhandled that
    // is a 500 from a link in a customer's inbox.
    const src = code('src/app/api/home-care/access/route.ts');
    expect(src).toContain('could not sign the access cookie');
    expect(src).toContain("error=unavailable");
  });

  test('a lookup that failed is told apart from a token that is wrong', () => {
    const src = code('src/app/api/home-care/access/route.ts');
    expect(src).toContain('error=unavailable');
    expect(src).toContain('error=invalid');
  });

  test('an unsubscribed homeowner is not let back in', () => {
    expect(code('src/app/api/home-care/access/route.ts')).toContain("error=unsubscribed");
  });

  test('the route is rate limited', () => {
    expect(code('src/app/api/home-care/access/route.ts')).toContain('checkRateLimit');
  });
});

test.describe('the migration backfills, or the fix does not reach anyone', () => {
  test('existing homeowners get a token, not just new ones', () => {
    const sql = read('supabase/migrations/20260823000000_homeowner_access_token.sql');
    expect(sql).toContain('UPDATE public.homeowners');
    expect(sql).toContain('WHERE access_token IS NULL');
  });

  test('the token is url-safe', () => {
    const sql = read('supabase/migrations/20260823000000_homeowner_access_token.sql');
    expect(sql).toContain("replace(replace(replace(access_token, '+', '-'), '/', '_'), '=', '')");
  });

  test('it is not the unsubscribe token wearing a second hat', () => {
    const sql = read('supabase/migrations/20260823000000_homeowner_access_token.sql');
    expect(sql).toContain('access_token text');
    expect(sql).not.toMatch(/access_token\s*=\s*unsubscribe_token/);
  });
});
