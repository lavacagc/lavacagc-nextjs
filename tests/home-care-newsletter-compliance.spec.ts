import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
// Must precede the sender import: it stubs the env that module captures on load.
import './helpers/stubEmailEnv';
import { sendTrackedEmail } from '../src/lib/notify/sendEmail';
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

test('suppression: an opt-out the cron already knows about is refused and recorded', async () => {
  // Honouring an unsubscribe is only half of it - the other half is being able
  // to show that we did. The cron classifies every recipient against one
  // read of the home_care opt-out list, and hands that verdict to the sender
  // instead of skipping the call, precisely so the suppression still lands in
  // email_log. Driven through the real sender here rather than asserted from
  // source, because "no send happened" and "a row was written" are the two
  // things the source cannot prove.
  const calls: Array<{ url: string; body?: string }> = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: typeof init?.body === 'string' ? init.body : undefined });
    return new Response('', { status: 201 });
  }) as typeof fetch;

  try {
    const result = await sendTrackedEmail({
      from: 'La Vaca Home Care <alex@email.lavaca.link>',
      to: 'optedout@example.com',
      subject: 'September: your fall home checklist',
      html: '<p>Fall checklist</p>',
      text: 'Fall checklist',
      category: 'home_care_newsletter',
      preferenceStream: 'home_care',
      knownSuppressed: true,
    });
    expect(result).toMatchObject({ status: 'skipped', reason: 'unsubscribed' });

    // Nothing reached the mailer...
    expect(calls.filter((c) => c.url.includes('resend'))).toEqual([]);
    // ...and the preference lookup never ran either: it fails OPEN by design,
    // so consulting it for a recipient we have already ruled out would let a
    // DB hiccup deliver mail to somebody who unsubscribed.
    expect(calls.filter((c) => c.url.includes('email_preferences'))).toEqual([]);

    // The suppression is on the record, in the shape the admin Emails view
    // reads: same category as a real send, status 'skipped', never sent_at.
    const logged = calls.filter((c) => c.url.includes('/rest/v1/email_log'));
    expect(logged, 'expected exactly one email_log row for the honoured opt-out').toHaveLength(1);
    const row = JSON.parse(logged[0].body!);
    expect(row).toMatchObject({
      category: 'home_care_newsletter',
      to_email: 'optedout@example.com',
      status: 'skipped',
      sent_at: null,
    });
    expect(row.error_message).toContain('suppressed');
  } finally {
    globalThis.fetch = realFetch;
  }
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
  // Images are the deliberate exception: a mail client fetches them itself, so
  // they must stay on the production host even in a preview render. The logo is
  // absolute in the builder; the hero comes in pre-pinned from the cron, which
  // resolves it from NEXT_PUBLIC_SITE_URL rather than the request origin.
  expect(n.html).toContain('https://www.lavacagc.com/logo.png');
  const hero = 'https://www.lavacagc.com/email/home-care/hero-09.jpg';
  const withHero = build({ ...at, heroImageUrl: hero });
  expect(withHero.html).toContain(`<img src="${hero}"`);
  // No link ever follows an image onto that host - clicks stay on the origin
  // that sent the mail, so a tokenized opt-out still resolves.
  expect([...withHero.html.matchAll(/href="(https?:[^"]+)"/g)].map((m) => m[1]).filter((h) => !h.startsWith(ORIGIN))).toEqual([]);
  expect(cron).toContain('homeCareHeroUrl(SITE_URL, now)');
});
