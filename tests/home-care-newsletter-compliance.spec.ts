import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildNewsletter, type NewsletterTask } from '../src/lib/homecare/newsletter';

/**
 * CAN-SPAM + bulk-sender compliance for the monthly Home Care newsletter.
 *
 * This is commercial email to a subscribed list, so every send must carry a
 * physical postal address, a working one-click opt-out, honest routing, and an
 * accurate sender identity. These assertions are deliberately blunt: if someone
 * restyles the footer and drops the address, this fails rather than shipping a
 * violation to the whole list.
 *
 * 15 U.S.C. 7704(a)(3)-(5); Gmail/Yahoo bulk sender rules (RFC 8058 one-click).
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const sendHomeCare = read('src/lib/notify/sendHomeCareEmails.ts');
const sendEmail = read('src/lib/notify/sendEmail.ts');
const cron = read('src/app/api/cron/home-care-newsletter/route.ts');

const TASKS: NewsletterTask[] = [
  { key: 'clean_gutters', title: 'Clean the gutters', blurb: 'Before the leaves drop.', bookable: true, diy_or_pro: 'pro', priority: 10, applies_to: ['all'] },
  { key: 'a', title: 'A', blurb: 'a', bookable: false, diy_or_pro: 'diy', priority: 9, applies_to: ['all'] },
  { key: 'b', title: 'B', blurb: 'b', bookable: false, diy_or_pro: 'diy', priority: 8, applies_to: ['all'] },
  { key: 'c', title: 'C', blurb: 'c', bookable: false, diy_or_pro: 'diy', priority: 7, applies_to: ['all'] },
];
const build = (over: Partial<Parameters<typeof buildNewsletter>[0]> = {}) =>
  buildNewsletter({
    firstName: 'Alex', season: 'fall', tasks: TASKS, isSeasonal: true, monthLabel: 'September', year: 2026,
    baseUrl: 'https://www.lavacagc.com',
    unsubscribeUrl: 'https://www.lavacagc.com/api/home-care/unsubscribe?token=TOK',
    preferencesUrl: 'https://www.lavacagc.com/preferences?token=PREF',
    ...over,
  });

test('CAN-SPAM: physical postal address appears in every variant, HTML and text', () => {
  const ADDR = '51 Crestmont Rd, West Orange, NJ 07052';
  for (const variant of [build(), build({ isSeasonal: false }), build({ tasks: [], caughtUp: true })]) {
    expect(variant.html).toContain(ADDR);
    expect(variant.text).toContain(ADDR);
  }
});

test('CAN-SPAM: a working opt-out is present in every variant, HTML and text', () => {
  for (const variant of [build(), build({ isSeasonal: false }), build({ tasks: [], caughtUp: true })]) {
    expect(variant.html).toContain('/api/home-care/unsubscribe?token=TOK');
    expect(variant.html).toContain('Unsubscribe');
    expect(variant.text).toContain('Unsubscribe: https://www.lavacagc.com/api/home-care/unsubscribe?token=TOK');
    // Preference centre is offered alongside the hard opt-out.
    expect(variant.html).toContain('/preferences?token=PREF');
  }
});

test('CAN-SPAM: the email says why the recipient is receiving it', () => {
  expect(build().html).toContain("You're getting this because you're enrolled in La Vaca Home Care");
});

test('CAN-SPAM: opt-out survives even when the preference-centre lookup fails', () => {
  // preferencesUrlFor is best-effort in the cron; a failure must never strip the
  // statutory unsubscribe link.
  const n = build({ preferencesUrl: undefined });
  expect(n.html).toContain('/api/home-care/unsubscribe?token=TOK');
  expect(n.html).not.toContain('Manage email preferences');
  expect(n.text).toContain('Unsubscribe:');
});

test('CAN-SPAM: subject lines describe the actual contents, no deception', () => {
  expect(build().subject).toBe('Your Fall home checklist');
  expect(build({ isSeasonal: false }).subject).toBe('September: 3 quick home to-dos');
  expect(build({ tasks: [], caughtUp: true }).subject).toBe("You're all caught up, Alex");
  // The nudge subject promises a count; it must match what is actually rendered.
  const nudge = build({ isSeasonal: false });
  expect((nudge.html.match(/width="30" valign="top"/g) || []).length).toBe(3);
});

test('bulk-sender: one-click List-Unsubscribe headers are attached per recipient', () => {
  expect(sendEmail).toContain("'List-Unsubscribe': `<${unsubUrl}>`");
  expect(sendEmail).toContain("'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'");
  // Newsletter opts into the stream, which is what triggers those headers and
  // the per-recipient suppression check.
  expect(sendHomeCare).toContain("'home_care_newsletter', args.homeownerId, 'home_care'");
});

test('sender identity is accurate and replies reach a monitored mailbox', () => {
  expect(sendHomeCare).toContain("HOME_CARE_FROM = 'La Vaca Home Care <alex@email.lavaca.link>'");
  expect(sendHomeCare).toContain("DEFAULT_REPLY_TO = 'info@lavacagc.com'");
});

test('suppression: only active members are mailed, and opt-outs are skipped at send', () => {
  // The cron only ever selects active homeowners...
  expect(cron).toContain('homeowners?select=id,first_name,email,unsubscribe_token,last_newsletter_at&status=eq.active');
  // ...and sendTrackedEmail independently skips anyone who opted out of the stream.
  expect(sendEmail).toContain('if (pref[input.preferenceStream] === false)');
});

test('links: every URL is built from the send origin, so no environment leaks in', () => {
  // The cron derives all three from one origin, so the test must too.
  const ORIGIN = 'https://staging.example.com';
  const at = {
    baseUrl: ORIGIN,
    unsubscribeUrl: `${ORIGIN}/api/home-care/unsubscribe?token=TOK`,
    preferencesUrl: `${ORIGIN}/preferences?token=PREF`,
  };
  const n = build(at);
  // The caught-up variant carries links the task email doesn't (portfolio,
  // blog), so it is checked too rather than assumed to match.
  for (const variant of [n, build({ ...at, tasks: [], caughtUp: true })]) {
    const hrefs = [...variant.html.matchAll(/href="(https?:[^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.filter((h) => !h.startsWith(ORIGIN))).toEqual([]);
    expect([...variant.text.matchAll(/https?:\/\/[^\s]+/g)].map((m) => m[0]).filter((u) => !u.startsWith(ORIGIN))).toEqual([]);
  }
  // The logo is the one deliberate absolute: mail clients need a hosted asset,
  // and it must stay on the production host even in a preview render.
  expect(n.html).toContain('https://www.lavacagc.com/logo.png');
});
