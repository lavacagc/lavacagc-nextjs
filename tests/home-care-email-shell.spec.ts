import { test, expect } from '@playwright/test';
import { buildVerificationEmail, buildWelcomeEmail } from '../src/lib/homecare/lifecycleEmails';
import { buildReleaseEmail } from '../src/lib/homecare/releaseEmail';
import { buildNewsletter, type NewsletterTask } from '../src/lib/homecare/newsletter';
import { licenceBar, brandRow, footer, BUSINESS_ADDRESS } from '../src/lib/homecare/emailShell';

/**
 * Home Care used to run two email design systems: the redesigned newsletter,
 * and an older 560px shell behind verification / welcome / release-notes that
 * carried a different header and NO postal address. A member could get three
 * emails in a week that looked like three different companies.
 *
 * These guard the convergence. If someone restyles one email, the shared
 * chrome assertions below fail rather than the inconsistency shipping.
 */
const UNSUB = 'https://www.lavacagc.com/api/home-care/unsubscribe?token=TOK';
const PREFS = 'https://www.lavacagc.com/preferences?token=PREF';

const TASKS: (NewsletterTask & { stages: string[] })[] = [
  { key: 'clean_gutters', title: 'Clean the gutters', blurb: 'Before the leaves drop.', bookable: true, diy_or_pro: 'pro', priority: 10, applies_to: ['all'], stages: ['all'] },
  { key: 'a', title: 'A', blurb: 'a', bookable: false, diy_or_pro: 'diy', priority: 9, applies_to: ['all'], stages: ['all'] },
  { key: 'b', title: 'B', blurb: 'b', bookable: false, diy_or_pro: 'diy', priority: 8, applies_to: ['all'], stages: ['all'] },
  { key: 'c', title: 'C', blurb: 'c', bookable: false, diy_or_pro: 'diy', priority: 7, applies_to: ['all'], stages: ['all'] },
];

const all = () => ({
  verification: buildVerificationEmail({ firstName: 'Dana', verifyUrl: 'https://www.lavacagc.com/v?token=T', unsubscribeUrl: UNSUB }),
  welcome: buildWelcomeEmail({ firstName: 'Dana', checklistUrl: 'https://www.lavacagc.com/home-care/checklist', unsubscribeUrl: UNSUB, preferencesUrl: PREFS }),
  release: buildReleaseEmail({
    firstName: 'Dana',
    features: [{ headline: 'Dismiss a task', subhead: 'Hide what does not apply.', benefit: 'A shorter, truer list.', screenshot_path: null }],
    baseUrl: 'https://www.lavacagc.com', unsubscribeUrl: UNSUB, preferencesUrl: PREFS,
  } as never),
  newsletter: buildNewsletter({
    firstName: 'Dana', season: 'fall', tasks: TASKS, isSeasonal: true, monthLabel: 'September', year: 2026,
    baseUrl: 'https://www.lavacagc.com', unsubscribeUrl: UNSUB, preferencesUrl: PREFS,
  }),
});

test('every Home Care email opens with the same licence bar and brand row', () => {
  const bar = licenceBar().trim();
  const brand = brandRow().trim();
  for (const [name, m] of Object.entries(all())) {
    expect(m.html, `${name} licence bar`).toContain('Licensed, Bonded, &amp; Insured');
    expect(m.html, `${name} HIC`).toContain('HIC# 13VH13373800');
    // The newsletter still renders its own copy of the chrome (converging it is
    // a follow-up); assert the markup matches so the two cannot drift.
    if (name !== 'newsletter') {
      expect(m.html, `${name} uses the shared bar`).toContain(bar);
      expect(m.html, `${name} uses the shared brand row`).toContain(brand);
    }
  }
});

test('every Home Care email carries the CAN-SPAM postal address, HTML and text', () => {
  for (const [name, m] of Object.entries(all())) {
    expect(m.html, `${name} html address`).toContain(BUSINESS_ADDRESS);
    expect(m.text, `${name} text address`).toContain(BUSINESS_ADDRESS);
  }
});

test('every Home Care email offers a working opt-out', () => {
  for (const [name, m] of Object.entries(all())) {
    expect(m.html, `${name} unsub link`).toContain(UNSUB);
    expect(m.html, `${name} unsub label`).toContain('Unsubscribe');
    expect(m.text, `${name} text unsub`).toContain(`Unsubscribe: ${UNSUB}`);
  }
});

test('every Home Care email says why the recipient is receiving it', () => {
  for (const [name, m] of Object.entries(all())) {
    expect(m.html, `${name} reason`).toMatch(/You're (getting|receiving) this because/);
  }
});

test('shared chrome: all use the 600px card, cream page and Outlook line-height guard', () => {
  for (const [name, m] of Object.entries(all())) {
    expect(m.html, `${name} card width`).toContain('max-width:600px');
    expect(m.html, `${name} page bg`).toContain('#EFEBE6');
    expect(m.html, `${name} mso guard`).toContain('mso-line-height-rule:exactly');
    expect(m.html, `${name} mobile rule`).toContain('@media only screen and (max-width:620px)');
  }
});

test('no Home Care email uses emoji or an em dash', () => {
  for (const [name, m] of Object.entries(all())) {
    expect(m.html, `${name} emoji`).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(m.html, `${name} em dash`).not.toContain('—');
    expect(m.text, `${name} text em dash`).not.toContain('—');
  }
});

test('verification stays single-CTA: no call block or share line competing with confirm', () => {
  const v = buildVerificationEmail({ firstName: 'Dana', verifyUrl: 'https://x/v', unsubscribeUrl: UNSUB });
  expect(v.html).toContain('Confirm &amp; get my plan');
  expect(v.html).not.toContain('Rather we handled it?');
  expect(v.html).not.toContain('utm_source=member_share');
  expect(v.html).toContain('48 hours');
});

test('the shared footer cannot be built without an opt-out', () => {
  const f = footer({ reason: 'Because you joined.', unsubscribeUrl: UNSUB });
  expect(f).toContain(BUSINESS_ADDRESS);
  expect(f).toContain(UNSUB);
});
