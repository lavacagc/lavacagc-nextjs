import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { checklistUrl, safeDestination, GOOGLE_REVIEW_URL } from '../src/lib/homecare/emailLinks';
import { redactRestPath } from '../src/lib/notify/supabase-rest';
import { findHomeownerByAccessToken } from '../src/lib/homecare/homeowners';
import { buildServiceCompletedEmail, buildVisitReminderEmail } from '../src/lib/homecare/serviceEmails';
import { buildReleaseEmail } from '../src/lib/homecare/releaseEmail';
import { buildWelcomeEmail } from '../src/lib/homecare/lifecycleEmails';
import { buildNewsletter, type NewsletterTask } from '../src/lib/homecare/newsletter';
import { accessErrorCopy } from '../src/lib/homecare/accessErrors';
import { stubEmailEnv } from './helpers/stubEmailEnv';

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
// One test below drives the real sender in-process. Scoped to this file so the
// credentials cannot follow the worker into the next spec.
stubEmailEnv();

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const code = (p: string) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const BASE = 'https://www.lavacagc.com';
// Deliberately low-entropy and obviously fake: a random-looking hex string here
// trips the repo's gitleaks pre-commit hook as a generic-api-key.
const TOKEN = 'test-access-token-not-a-real-secret';

const RELEASE_FEATURE = {
  headline: 'Seasonal guides', subhead: 'Read before you climb.',
  benefit: 'Know what the job involves.', screenshot_path: null,
};
const NEWSLETTER_TASK: NewsletterTask = {
  key: 'clean_gutters', title: 'Clean gutters', blurb: 'Clear them out.',
  bookable: true, diy_or_pro: 'pro', priority: 9, applies_to: ['all'],
};

/**
 * Every email builder that renders a portal CTA, FOUND rather than listed.
 *
 * A builder renders one exactly when its args interface names a portal link or
 * an access token - those are the only two ways a link into the cookie-gated
 * portal can reach it. Reading that off the source is what stops a new email
 * from being missed the way the release and welcome ones both were.
 */
function portalEmailBuilders(): string[] {
  const dir = 'src/lib/homecare';
  const found: string[] = [];
  for (const file of readdirSync(join(process.cwd(), dir)).filter((f) => f.endsWith('.ts'))) {
    const src = read(join(dir, file));
    for (const [, name, argsType] of src.matchAll(/export function (build\w+)\(\s*args:\s*(\w+)/g)) {
      const body = src.match(new RegExp(`export interface ${argsType} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? '';
      if (/^\s*(portalUrl|checklistUrl|accessToken)\??:/m.test(body)) found.push(name);
    }
  }
  expect(found.length, 'the builder scan found nothing - the pattern has drifted').toBeGreaterThan(0);
  return found.sort();
}

/** Every TypeScript source file under a directory, for repo-wide scans. */
function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const entry of readdirSync(join(process.cwd(), rel), { withFileTypes: true })) {
      const next = join(rel, entry.name);
      if (entry.isDirectory()) walk(next);
      else if (/\.tsx?$/.test(entry.name)) out.push(next);
    }
  };
  walk(root);
  return out;
}

/** Every API route that sends Home Care mail, so none can be left off a list. */
function routeFiles(): string[] {
  return sourceFiles('src/app/api')
    .filter((f) => f.endsWith('route.ts'))
    .filter((f) => /home-care|releases|service-quote|visit-reminders/.test(f));
}

/**
 * Every Google review URL the app is allowed to contain.
 *
 * KNOWN DIVERGENCE, owner-pending. The first is the link the owner supplied on
 * 2 Aug and the one the Home Care completion email uses. The second predates
 * this branch in `LeaveReviewClient.tsx` and `emailTemplates.ts`, where it feeds
 * three live drip buttons. Same place blob, different trailing segment, so at
 * most one of them is right - and rewriting three live links on a guess is
 * worse than the drift.
 *
 * THIS LIST MUST SHRINK TO ONE ENTRY once the owner confirms which page is
 * theirs. It is here to document a divergence that exists, not to bless it: a
 * third value, or a fourth copy under a new URL, fails immediately.
 */
const KNOWN_REVIEW_URLS = [
  'https://g.page/r/CflitSa4DKHAEAI/review',
  'https://g.page/r/CflitSa4DKHAEBM/review',
];

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

  test('every Google review link in the app is one of the two known values', () => {
    // The first version of this test read emailLinks.ts alone and asserted the
    // file held exactly one g.page match - true by construction, so it passed
    // green while two other files carried a DIFFERENT link for the same
    // business. Drift is only visible from a repo-wide scan.
    const found = new Map<string, string[]>();
    for (const file of sourceFiles('src')) {
      for (const [url] of read(file).matchAll(/https:\/\/g\.page\/r\/[A-Za-z0-9_-]+\/review/g)) {
        found.set(url, [...(found.get(url) ?? []), file]);
      }
    }
    const where = [...found].map(([u, files]) => `${u} <- ${files.join(', ')}`).join('\n');
    expect(found.size, 'the scan found no review link at all - the pattern has drifted').toBeGreaterThan(0);
    expect([...found.keys()].sort(), `unexpected Google review URL:\n${where}`)
      .toEqual([...KNOWN_REVIEW_URLS].sort());

    // And the owner-supplied one is the one Home Care sends.
    expect(GOOGLE_REVIEW_URL).toBe(KNOWN_REVIEW_URLS[0]);
    expect(found.get(GOOGLE_REVIEW_URL), `${GOOGLE_REVIEW_URL} must be defined in emailLinks.ts`)
      .toContain('src/lib/homecare/emailLinks.ts');
    // Defined once THERE, whatever else the repo still holds.
    expect(read('src/lib/homecare/emailLinks.ts').match(/g\.page\/r\//g) ?? []).toHaveLength(1);
  });

  test('the copy around the button asks for the review the button opens', () => {
    // The button went to Google while the copy asked for private feedback
    // ("Tell us how it went", "tell us and we'll come back"), so a customer
    // with a complaint followed the email's own instruction onto a one-star.
    const { subject, html, text } = buildServiceCompletedEmail({
      recipientName: 'Jordan', services: ['Clean gutters'],
      feedbackUrl: GOOGLE_REVIEW_URL, unsubscribeUrl: `${BASE}/unsub`,
    });
    // The subject and the H1 are read before anything else, and were the last
    // two strings still promising a private channel this email does not have.
    expect(subject.toLowerCase(), 'the inbox line must name where the button goes').toContain('review');
    for (const [part, body] of [['subject', subject], ['html', html], ['text', text]] as const) {
      expect(body, `${part}: the private-feedback framing must not survive`).not.toMatch(/please let us know/i);
    }
    for (const [part, body] of [['html', html], ['text', text]] as const) {
      expect(body, `${part}: the button must say where it goes`).toContain('Leave us a Google review');
      expect(body, `${part}: nothing may promise a private channel through the button`)
        .not.toMatch(/tell us how it went/i);
      // The one private channel is the phone, and it is named as the route for
      // a problem rather than left to be found.
      expect(body, `${part}: a complaint must be routed to the phone`).toMatch(/call us/i);
    }
    // The button's own label, not just the word somewhere in the body.
    expect(html).toMatch(new RegExp(`href="${GOOGLE_REVIEW_URL}"[^>]*>Leave us a Google review<`));
    // Still not review-gating: the ask is never conditioned on being happy.
    for (const gated of ['if you were happy', 'if you are happy', '5-star', 'five star', 'positive review']) {
      expect(html.toLowerCase(), `"${gated}" would gate the ask`).not.toContain(gated);
    }
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

  test('utm tags ride the DESTINATION, so they survive the redirect', () => {
    // On the outer link they are dropped: the access route is a server
    // redirect, not a pageview, so nothing forwards them to the landing page
    // and analytics never sees the campaign.
    const url = new URL(checklistUrl(BASE, TOKEN, { utm: { utm_source: 'visit_reminder' } }));
    expect(url.searchParams.get('utm_source')).toBeNull();
    expect(url.searchParams.get('to')).toBe('/home-care/checklist?utm_source=visit_reminder');
  });

  test('the release email keeps the utm tags it carried before the token existed', () => {
    const { text } = buildReleaseEmail({
      firstName: 'Jordan', features: [RELEASE_FEATURE], baseUrl: BASE,
      accessToken: TOKEN, unsubscribeUrl: `${BASE}/unsub`,
    });
    const to = new URL(text.match(/https:\/\/\S*\/api\/home-care\/access\S*/)![0]).searchParams.get('to')!;
    const dest = new URL(to, BASE);
    expect(dest.pathname).toBe('/home-care/checklist');
    expect(dest.searchParams.get('utm_source')).toBe('release_email');
    expect(dest.searchParams.get('utm_campaign')).toBe('home_care_release');
  });

  test('a destination that already carries a query merges, never doubles the ?', () => {
    // The identical defect fixed in the plain-text newsletter, latent here.
    const url = checklistUrl(BASE, TOKEN, {
      to: '/home-care/guides?season=fall',
      query: { add: 'clean-gutters' },
      utm: { utm_source: 'newsletter' },
    });
    const to = new URL(url).searchParams.get('to')!;
    expect(to.split('?')).toHaveLength(2);
    const dest = new URL(to, BASE);
    expect(dest.pathname).toBe('/home-care/guides');
    expect(dest.searchParams.get('season')).toBe('fall');
    expect(dest.searchParams.get('add')).toBe('clean-gutters');
    expect(dest.searchParams.get('utm_source')).toBe('newsletter');
  });

  test('a destination anchor survives the exchange', () => {
    // The newsletter's own "Learn more" links are /home-care/guides/<season>#<task>,
    // so the first `to` anyone passes will carry a fragment; dropped, it lands
    // them on the guide index instead of the task they tapped.
    const url = checklistUrl(BASE, TOKEN, { to: '/home-care/guides/fall#clean_gutters' });
    const to = new URL(url).searchParams.get('to')!;
    expect(to).toBe('/home-care/guides/fall#clean_gutters');
    expect(safeDestination(to), 'and the route must still accept it').toBe(to);
    expect(new URL(to, BASE).hash).toBe('#clean_gutters');
  });

  test('no token degrades to the bare url, never to token=null', () => {
    for (const missing of [null, undefined, '']) {
      const url = checklistUrl(BASE, missing);
      expect(url).not.toContain('token=');
      expect(url).toContain('/home-care/checklist');
    }
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

  test('the newsletter builder puts the token on every portal link it renders', () => {
    const { html, text } = buildNewsletter({
      firstName: 'Jordan', season: 'fall', tasks: [NEWSLETTER_TASK], isSeasonal: true,
      baseUrl: BASE, accessToken: TOKEN, unsubscribeUrl: `${BASE}/unsub`,
    });
    for (const [part, body] of [['html', html], ['text', text]] as const) {
      // Only the COOKIE-GATED pages need the exchange. /home-care itself, the
      // guides and whats-new are public, so a bare link to them is correct -
      // and the share line must stay bare, it is for a new person.
      const bareGated = (body.match(/https:\/\/[^\s"']*\/home-care\/(checklist|book)[^\s"']*/g) ?? [])
        .filter((u) => !u.includes('/api/home-care/access'));
      expect(bareGated, `${part} must route every gated link through the exchange`).toEqual([]);

      const exchanged = (body.match(/https:\/\/[^\s"']*\/api\/home-care\/access\?[^\s"']*/g) ?? [])
        .map((u) => new URL(u.replace(/&amp;/g, '&')));
      expect(exchanged.length, `${part} must contain exchange links`).toBeGreaterThan(0);
      expect(exchanged.every((u) => u.searchParams.get('token') === TOKEN)).toBe(true);
      // Including the "Add to plan" deep link, the one button designed to
      // change something - it silently failed when it did not carry the token.
      const destinations = exchanged.map((u) => new URL(u.searchParams.get('to')!, BASE));
      expect(
        destinations.some((d) => d.searchParams.get('add') === 'clean_gutters'),
        `${part} must carry the "Add to plan" deep link through the exchange`,
      ).toBe(true);
    }
  });

  test('the tokenized links are escaped for the attribute they sit in', () => {
    // The link changed shape here: the old href was a bare `/home-care/checklist`
    // and the old "Add to plan" carried one `?add=` param, so neither contained
    // an ampersand. `?token=...&to=...&utm_source=...` does, and a raw `&` in an
    // href is one parameter name away from an HTML5 legacy named reference that
    // a mail client resolves silently - an email-only broken link with nothing
    // failing anywhere it would be seen.
    const { html, text } = buildNewsletter({
      firstName: 'Jordan', season: 'fall', tasks: [NEWSLETTER_TASK], isSeasonal: true,
      baseUrl: BASE, accessToken: TOKEN, unsubscribeUrl: `${BASE}/unsub`,
    });
    const hrefs = [...html.matchAll(/href="([^"]*\/api\/home-care\/access[^"]*)"/g)].map((m) => m[1]);
    // The standing CTA, the task title, the teaser row and "Add to plan".
    expect(hrefs.length, 'the newsletter must render tokenized hrefs').toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href, `${href} carries a raw & inside an attribute`).not.toMatch(/&(?!amp;)/);
      expect(href, `${href} lost its separators entirely`).toContain('&amp;');
    }
    // Escaping belongs to the markup and only to it: the text/plain part is not
    // HTML, and "&amp;to=" there is a dead link.
    const plain = text.match(/\/api\/home-care\/access\?\S+/g) ?? [];
    expect(plain.length, 'the text part must carry the same links').toBeGreaterThan(0);
    for (const url of plain) expect(url, `${url} must not be entity-escaped`).not.toContain('&amp;');
  });

  test('the "Add to plan" deep link is one URL, not one per rendering', () => {
    // The HTML and text builders each constructed it, they drifted, and the
    // text one ended up appending "?add=" to a URL that already carried a
    // query - a second '?' and a dead link, in the alternative most clients
    // read last. Asserting they carry ?add= each would have passed anyway.
    const { html, text } = buildNewsletter({
      firstName: 'Jordan', season: 'fall', tasks: [NEWSLETTER_TASK], isSeasonal: true,
      baseUrl: BASE, accessToken: TOKEN, unsubscribeUrl: `${BASE}/unsub`,
    });
    const addLink = (body: string, unescape: boolean) => {
      const urls = (body.match(/https:\/\/[^\s"']*\/api\/home-care\/access\?[^\s"']*/g) ?? [])
        .map((u) => (unescape ? u.replace(/&amp;/g, '&') : u))
        .filter((u) => (new URL(u).searchParams.get('to') ?? '').includes(`add=${NEWSLETTER_TASK.key}`));
      expect(urls.length, 'exactly one "Add to plan" link per part').toBe(1);
      return urls[0];
    };
    const fromHtml = addLink(html, true);
    expect(fromHtml, 'the two parts must render the same deep link').toBe(addLink(text, false));
    // And it is a URL, not a concatenation: one '?' after the origin.
    expect(fromHtml.slice(BASE.length).match(/\?/g)).toHaveLength(1);
  });

  test('the shared CTA button escapes its href too, for every portal email that uses it', () => {
    // The newsletter builds its own anchors; every other portal email gets its
    // button from cta(), which interpolated the url raw. Fixing it at that
    // chokepoint covers them together rather than repeating esc() per caller.
    const built = {
      buildReleaseEmail: buildReleaseEmail({
        firstName: 'Jordan', features: [RELEASE_FEATURE], baseUrl: BASE,
        accessToken: TOKEN, unsubscribeUrl: `${BASE}/unsub`,
      }),
      buildVisitReminderEmail: buildVisitReminderEmail({
        recipientName: 'Jordan', services: ['Clean gutters'], address: '14 Maple Ave',
        timeWindow: '8:00 - 11:00am', visitDateLabel: 'Tomorrow',
        portalUrl: checklistUrl(BASE, TOKEN), unsubscribeUrl: `${BASE}/unsub`,
      }),
      buildWelcomeEmail: buildWelcomeEmail({
        firstName: 'Jordan', checklistUrl: checklistUrl(BASE, TOKEN),
        unsubscribeUrl: `${BASE}/unsub`, baseUrl: BASE,
      }),
    };
    for (const [name, { html, text }] of Object.entries(built)) {
      const hrefs = [...html.matchAll(/href="([^"]*\/api\/home-care\/access[^"]*)"/g)].map((m) => m[1]);
      expect(hrefs.length, `${name} must render a tokenized href`).toBeGreaterThan(0);
      for (const href of hrefs) {
        expect(href, `${name}: ${href} carries a raw & inside an attribute`).not.toMatch(/&(?!amp;)/);
        expect(href, `${name}: ${href} lost its separators entirely`).toContain('&amp;');
        // Escaped, not mangled: it still parses back to the same live link.
        const url = new URL(href.replace(/&amp;/g, '&'));
        expect(url.searchParams.get('token')).toBe(TOKEN);
        expect(url.searchParams.get('to')).toContain('/home-care/');
      }
      // The text/plain part is not HTML, and "&amp;to=" there is a dead link.
      for (const url of text.match(/\/api\/home-care\/access\?\S+/g) ?? []) {
        expect(url, `${name}: ${url} must not be entity-escaped in text`).not.toContain('&amp;');
      }
    }
  });

  test('every portal email actually RENDERS the token, not just imports the helper', () => {
    // Two things this test has to do, because it failed at both before.
    //
    // Assert on OUTPUT: its first version only checked that each builder
    // mentioned the helper, so it passed green while the release email shipped
    // a bare link because no token was ever passed to it.
    //
    // And DISCOVER the builders rather than list them: its second version named
    // three by hand, so the welcome email - a fifth portal CTA - was invisible
    // by construction. Anything found here that has no renderer below fails,
    // which is what makes adding a sixth email force the issue.
    const rendered: Record<string, { html: string; text: string }> = {
      buildReleaseEmail: buildReleaseEmail({
        firstName: 'Jordan', features: [RELEASE_FEATURE], baseUrl: BASE,
        accessToken: TOKEN, unsubscribeUrl: `${BASE}/unsub`,
      }),
      buildNewsletter: buildNewsletter({
        firstName: 'Jordan', season: 'fall', tasks: [NEWSLETTER_TASK], isSeasonal: true,
        baseUrl: BASE, accessToken: TOKEN, unsubscribeUrl: `${BASE}/unsub`,
      }),
      buildVisitReminderEmail: buildVisitReminderEmail({
        recipientName: 'Jordan', services: ['Clean gutters'], address: '14 Maple Ave',
        timeWindow: '8:00 - 11:00am', visitDateLabel: 'Tomorrow',
        portalUrl: checklistUrl(BASE, TOKEN), unsubscribeUrl: `${BASE}/unsub`,
      }),
      buildWelcomeEmail: buildWelcomeEmail({
        firstName: 'Jordan', checklistUrl: checklistUrl(BASE, TOKEN),
        unsubscribeUrl: `${BASE}/unsub`, baseUrl: BASE,
      }),
    };

    expect(portalEmailBuilders(), 'a portal-CTA builder with no renderer here')
      .toEqual(Object.keys(rendered).sort());

    for (const [name, { html, text }] of Object.entries(rendered)) {
      expect(html, `${name} html must carry the token`).toContain(`token=${TOKEN}`);
      expect(text, `${name} text must carry the token`).toContain(`token=${TOKEN}`);
    }
  });

  test('no sender builds a bare portal link where the helper belongs', () => {
    // The welcome email did exactly this for a round: `${origin}/home-care/checklist`
    // handed to a builder, with the token sitting unread on the row two lines up.
    for (const file of routeFiles()) {
      const src = code(file);
      expect(src, `${file} must not hand a bare portal URL to an email`)
        .not.toMatch(/\$\{[A-Za-z_.]+\}\/home-care\/(checklist|book)/);
    }
  });

  test('every sender reads the token from the homeowner and passes it on', () => {
    // Rendering proves the builders work; these are the callers that must SELECT
    // the column and hand it over, which no render can prove. The select lives
    // either in the sender or in the helper it gets its homeowner from.
    const senders: Array<[string, string]> = [
      ['src/app/api/cron/visit-reminders/route.ts', 'src/app/api/cron/visit-reminders/route.ts'],
      ['src/app/api/cron/home-care-newsletter/route.ts', 'src/app/api/cron/home-care-newsletter/route.ts'],
      ['src/app/api/admin/releases/send/route.ts', 'src/app/api/admin/releases/send/route.ts'],
      ['src/app/api/admin/service-quote/schedule/route.ts', 'src/lib/homecare/serviceScheduling.ts'],
      // The welcome email. Its row comes from findHomeownerByVerifyToken, which
      // selects *, and the token it passes on is the healed one.
      ['src/app/api/home-care/verify/route.ts', 'src/lib/homecare/homeowners.ts'],
    ];
    // One entry per route file that sends a portal email, so a sixth sender
    // cannot be added without landing here.
    expect(
      senders.length,
      'a route sends a portal email without being asserted on',
    ).toBe(routeFiles().filter((f) => /checklistUrl\(|accessToken:/.test(code(f))).length);

    for (const [file, selectSource] of senders) {
      const src = code(file);
      expect(code(selectSource), `${selectSource} must select access_token`).toMatch(/select=[^`'"]*(access_token|\*)/);
      const buildsItself = /checklistUrl\([^)]*(\.access_token|accessToken)/.test(src);
      const delegates = /accessToken:\s*\w+\.access_token/.test(src);
      expect(buildsItself || delegates, `${file} must pass the homeowner's token to the link`).toBe(true);
      expect(src, `${file} must not build a bare checklist link`).not.toMatch(/\$\{[A-Za-z_]+\}\/home-care\/checklist/);
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

  test('a traversal that normalises OUT of the portal does not survive, however it is spelled', () => {
    // Each of these starts with '/home-care/' as a string and points somewhere
    // else once it is resolved. Same-origin, so never an open redirect - but the
    // list has to constrain what it appears to, and it cannot do that by
    // enumerating spellings of '..': the encoded forms are endless, and each
    // layer of decoding produces the next one.
    for (const traversal of [
      '/home-care/../vaca-mgmt',
      '/home-care/guides/../../vaca-mgmt/send-estimate',
      '/home-care/..%2fvaca-mgmt',
      '/home-care/%2e%2e/vaca-mgmt',
      '/home-care/%2E%2E/vaca-mgmt',
      '/home-care/.%2e/vaca-mgmt',
      '/home-care/%2e./vaca-mgmt',
      '/home-care/%2e%2e%2fvaca-mgmt',
      '/home-care/%252e%252e/vaca-mgmt',
      '/home-care/guides/%2e%2e/%2e%2e/vaca-mgmt/send-estimate',
    ]) {
      expect(safeDestination(traversal), `${traversal} must not survive`).toBe('/home-care/checklist');
      expect(
        new URL(safeDestination(traversal), BASE).pathname,
        `${traversal} must land inside the portal`,
      ).toBe('/home-care/checklist');
    }
  });

  test('the double-encoded form is rejected as the route actually receives it', () => {
    // searchParams.get() decodes once, so '%252e%252e' reaches safeDestination
    // as '%2e%2e' - the shape that slipped past a literal '..' check. Exercised
    // through the query rather than passed in by hand, because the decode is the
    // whole point of the case.
    const link = `${BASE}/api/home-care/access?token=${TOKEN}&to=%2Fhome-care%2F%252e%252e%2Fvaca-mgmt`;

    const received = new URL(link).searchParams.get('to');
    expect(received, 'one decode is what the route sees').toBe('/home-care/%2e%2e/vaca-mgmt');
    expect(safeDestination(received)).toBe('/home-care/checklist');
  });

  test('an encoded character that is not a dot segment still survives', () => {
    // The guard peels encodings, so it has to stop peeling on a path that simply
    // contains one - otherwise a future guide slug with an accent or a space in
    // it silently redirects everyone to the checklist.
    expect(safeDestination('/home-care/guides/%C3%A9t%C3%A9')).toBe('/home-care/guides/%C3%A9t%C3%A9');
    expect(safeDestination('/home-care/guides/spring%20clean')).toBe('/home-care/guides/spring%20clean');
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

  test('only FAILED lookups are charged to the IP bucket', () => {
    // A successful exchange that spent budget would throttle whole offices and
    // carrier-NAT'd streets onto /home-care?error=busy - the exact page these
    // links exist to stop recipients seeing. The token is 32 random bytes, so
    // guessing was never the realistic threat.
    const src = code('src/app/api/home-care/access/route.ts');
    expect(src).toMatch(/checkRateLimit\([^)]*consume:[\s\S]*?false/);
    // The success path sets the cookie without ever charging the bucket.
    const successIdx = src.indexOf('HC_ACCESS_COOKIE, signed');
    expect(successIdx).toBeGreaterThan(-1);
    expect(src.slice(successIdx)).not.toContain('chargeFailure');
    // Both rejections that a guesser can provoke DO charge it.
    expect((src.match(/await chargeFailure\(\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test('the peek cannot silently become a charge if the default flips', () => {
    const src = code('src/lib/rateLimit.ts');
    expect(src).toContain('options.consume !== false');
    for (const write of ['.insert(', '.update(']) {
      const at = src.indexOf(write);
      expect(src.slice(Math.max(0, at - 200), at)).toContain('if (consume)');
    }
  });
});

test.describe('a live access token never reaches a log line', () => {
  // The access token is stable and never rotated, so one that reaches a log is
  // a permanent credential for /home-care/book - requesting PAID WORK at that
  // person's address. supabaseRest interpolates the request path into what it
  // throws, and every caller logs that, so ANY PostgREST non-2xx used to write
  // one out: a column missing on a restored copy, a 5xx, a blip.
  test('the thrown path has its credentials blanked, not its columns', () => {
    const redacted = redactRestPath(`homeowners?access_token=eq.${TOKEN}&select=*&limit=1`);
    expect(redacted).not.toContain(TOKEN);
    expect(redacted).toContain('access_token=<redacted>');
    expect(redacted, 'the column and the filters still have to be diagnosable').toContain('select=*');
  });

  test('a real failing lookup throws a message with no token in it', async () => {
    // Exercised, not read: asserting on the helper alone passes green if
    // supabaseRest ever stops calling it, which is the whole leak.
    const stub = createServer((_req, res) => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: '42703', message: 'column homeowners.access_token does not exist' }));
    });
    await new Promise<void>((r) => stub.listen(0, '127.0.0.1', r));
    const { port } = stub.address() as AddressInfo;

    const saved = [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY];
    process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`;
    process.env.SUPABASE_SECRET_KEY = 'stub-key-not-a-real-secret';
    try {
      const err = await findHomeownerByAccessToken(TOKEN).then(() => null, (e: Error) => e);
      expect(err, 'the stub must make the lookup throw').toBeTruthy();
      expect(err!.message, 'a live token must never reach a log line').not.toContain(TOKEN);
      expect(String(err!.stack)).not.toContain(TOKEN);
      // Still diagnosable: which column, which status, what PostgREST said.
      expect(err!.message).toContain('access_token=<redacted>');
      expect(err!.message).toContain('400');
    } finally {
      [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY] = saved as [string, string];
      await new Promise<void>((r) => stub.close(() => r()));
    }
  });

  test('every token-keyed lookup in the codebase is covered, not just this one', () => {
    for (const param of ['access_token', 'verify_token', 'unsubscribe_token', 'confirm_token', 'preference_token', 'token']) {
      expect(redactRestPath(`t?${param}=eq.${TOKEN}&limit=1`), `${param} must be blanked`).not.toContain(TOKEN);
    }
  });

  test('a column list that merely NAMES a token column stays readable', () => {
    const path = 'homeowners?select=id,first_name,unsubscribe_token,access_token&status=eq.active';
    expect(redactRestPath(path)).toBe(path);
  });

  test('the access route logs the message, never the error object', () => {
    const src = code('src/app/api/home-care/access/route.ts');
    expect(src).not.toMatch(/console\.error\([^)]*failed:',\s*err\s*\)/);
    expect(src).toMatch(/err instanceof Error \? err\.message : String\(err\)/);
  });
});

test.describe('every recipient is told something true', () => {
  test('each error code gets its own copy, not one catch-all', () => {
    const codes = ['invalid', 'unavailable', 'unsubscribed', 'busy'];
    for (const c of codes) {
      expect(accessErrorCopy(c), `${c} must have its own copy`).toBeTruthy();
    }
    expect(new Set(codes.map(accessErrorCopy)).size, 'the four outcomes must not share one message').toBe(4);
  });

  test('the two routes that spell one outcome differently say the same thing', () => {
    // /verify emits expired/error where /api/home-care/access emits
    // invalid/unavailable. They were duplicated verbatim, so editing one left
    // its twin describing the same failure in different words.
    expect(accessErrorCopy('expired')).toBe(accessErrorCopy('invalid'));
    expect(accessErrorCopy('error')).toBe(accessErrorCopy('unavailable'));
    expect(accessErrorCopy(undefined), 'an absent code falls back to the dead-link copy')
      .toBe(accessErrorCopy('invalid'));
  });

  test('"request a fresh link" is never the advice when a fresh link fails too', () => {
    // unavailable = our signing secret or our database. A fresh link fails
    // identically, so telling someone to request one is actively wrong.
    for (const code of ['unavailable', 'error', 'busy']) {
      const copy = accessErrorCopy(code).toLowerCase();
      expect(copy, `${code} must not promise a fresh link`).not.toMatch(/fresh one|send.*fresh/);
      expect(copy).toContain('try the same link again');
    }
  });

  test('the page renders the mapped copy rather than a hardcoded sentence', async ({ page: browser }) => {
    await browser.goto('/home-care?error=unsubscribed', { waitUntil: 'domcontentloaded' });
    await expect(browser.getByText('That plan is unsubscribed', { exact: false })).toBeVisible();
  });

  test('an ?error= that names an inherited property does not take the page down', async ({ page: browser }) => {
    // The lookup used to index an object literal with whatever was in the URL,
    // so ?error=toString resolved to a function and ?error=__proto__ to an
    // object - neither of which `??` rejects and neither of which React can
    // render. A crafted URL 500'd the PUBLIC signup page.
    for (const crafted of ['__proto__', 'toString', 'constructor', 'valueOf', 'hasOwnProperty']) {
      const res = await browser.goto(`/home-care?error=${crafted}`, { waitUntil: 'domcontentloaded' });
      expect(res?.status(), `?error=${crafted} must not error`).toBeLessThan(400);
      // The signup form is the whole point of this page: it has to survive.
      await expect(browser.locator('#get-started')).toBeVisible();
      // And the visitor gets the fallback sentence, not "[object Object]".
      await expect(browser.getByText('That link was invalid or expired', { exact: false })).toBeVisible();
    }
  });
});

test.describe('a tokenized email is not an invitation to hand over the portal', () => {
  test('no Home Care email that carries a token asks to be forwarded', () => {
    // The cookie the token buys is not view-only: it gates /home-care/book -
    // requesting PAID WORK at the member's address - and profile editing, for
    // 30 days. Before the token these emails carried no credential, so
    // forwarding was harmless.
    // Discovered, not listed - the welcome email was a carrier that still said
    // "Forward this email" for a round because it was not on the list.
    const carriers = ['src/lib/homecare/newsletter.ts', 'src/lib/homecare/releaseEmail.ts', 'src/lib/homecare/lifecycleEmails.ts'];
    expect(portalEmailBuilders().length, 'a new portal email needs adding here').toBe(4);
    for (const f of carriers) {
      const src = read(f);
      expect(src, `${f} carries a token, so it must not invite forwarding`).not.toMatch(/Forward this email/i);
    }
  });

  test('the welcome email points a referral at the signup page instead', () => {
    const { html, text } = buildWelcomeEmail({
      firstName: 'Jordan', checklistUrl: checklistUrl(BASE, TOKEN),
      unsubscribeUrl: `${BASE}/unsub`, baseUrl: BASE,
    });
    expect(html).toContain('Know someone');
    expect(html).toContain(`${BASE}/home-care?utm_source=member_share`);
    expect(html).not.toMatch(new RegExp(`member_share[^"']*${TOKEN}`));
    expect(text).toContain(`${BASE}/home-care`);
  });

  test('the referral intent survives, pointed at the public signup page', () => {
    const { html, text } = buildNewsletter({
      firstName: 'Jordan', season: 'fall', tasks: [NEWSLETTER_TASK], isSeasonal: true,
      baseUrl: BASE, accessToken: TOKEN, unsubscribeUrl: `${BASE}/unsub`,
    });
    expect(html).toContain('Know someone');
    expect(html).toContain(`${BASE}/home-care?utm_source=member_share`);
    // What a new person needs is the signup page, and it must be tokenless.
    expect(html).not.toMatch(new RegExp(`member_share[^"']*${TOKEN}`));
    expect(text).toContain(`${BASE}/home-care`);
  });
});

test.describe('a homeowner created after the deploy gets a token too', () => {
  test('both insert paths set one, the way unsubscribe_token already is', () => {
    // The backfill fixed the rows that existed that day and nobody since. It
    // hits the most common case hardest: a brand-new service customer is
    // created and emailed in the SAME request.
    const paths: Array<[string, RegExp]> = [
      ['src/lib/homecare/serviceScheduling.ts', /supabaseRest<HomeownerLite\[\]>\('POST', 'homeowners', \[\{[\s\S]*?\}\]\)/],
      ['src/app/api/home-care/subscribe/route.ts', /await insertHomeowner\(\{[\s\S]*?\}\);/],
    ];
    for (const [file, insert] of paths) {
      const payload = code(file).match(insert)?.[0];
      expect(payload, `${file} insert payload not found`).toBeTruthy();
      expect(payload!, `${file} must set access_token on insert`).toMatch(/access_token:\s*newToken\(\)/);
      expect(payload!, `${file} sets unsubscribe_token, so the pattern is established`).toContain('unsubscribe_token');
    }
  });

  test('every existing-row path heals a null token rather than emailing bare links', () => {
    // Three paths reach an EXISTING row and then send it an email. Each one has
    // to top up a missing token, or the backfill is the only thing that ever
    // did and a row that slipped past it stays broken forever.
    const subscribe = code('src/app/api/home-care/subscribe/route.ts');
    expect(
      (subscribe.match(/access_token:\s*existing\.access_token\s*\|\|\s*newToken\(\)/g) ?? []).length,
      'both the re-subscribe and the already-active branches must heal',
    ).toBe(2);
    expect(
      code('src/app/api/home-care/verify/route.ts'),
      'the welcome email is built from this row',
    ).toMatch(/access_token:\s*(ho\.access_token\s*\|\|\s*newToken\(\)|accessToken)/);
    expect(
      code('src/lib/homecare/serviceScheduling.ts'),
      'this row goes straight into the visit-scheduled email',
    ).toMatch(/if\s*\(!row\.access_token\)\s*patch\.access_token\s*=\s*newToken\(\)/);
  });

  test('the column defaults in the database, so a third insert path cannot regress it', () => {
    // Belt and braces on purpose: the failure is SILENT. checklistUrl degrades
    // to the bare link rather than erroring, so a forgotten token still sends
    // an email that still does not work.
    const sql = read('supabase/migrations/20260823000000_homeowner_access_token.sql');
    expect(sql).toMatch(/ALTER COLUMN access_token\s*\n?\s*SET DEFAULT/);
    // Url-safe from the start, matching the backfill's own cleanup.
    const def = sql.match(/SET DEFAULT([\s\S]*?);/)![1];
    expect(def).toContain('gen_random_bytes(32)');
    for (const unsafe of ["'+', '-'", "'/', '_'", "'=', ''"]) expect(def).toContain(unsafe);
  });
});

test.describe('the audit row is not a second copy of the credential', () => {
  // Redacting the application log left the DURABLE path open: sendTrackedEmail
  // writes the full rendered body to email_log, there is no purge for that
  // table, and /api/admin/emails/[id] reads it back. Every portal email now
  // carries a stable, never-rotated token that buys 30 days of /home-care/book.
  test('the send keeps the working link and the stored copy does not', async () => {
    // Driven through the real sender, not read off the source: "the recipient
    // still gets a live link" and "the row does not" are the two things that
    // matter and neither is visible in the text of the file.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Playwright compiles specs to CJS; a native import() would bypass its TS transform and fail to load the .ts module.
    const { sendTrackedEmail }: typeof import('../src/lib/notify/sendEmail') = require('../src/lib/notify/sendEmail');

    const { subject, html, text } = buildNewsletter({
      firstName: 'Jordan', season: 'fall', tasks: [NEWSLETTER_TASK], isSeasonal: true,
      baseUrl: BASE, accessToken: TOKEN,
      unsubscribeUrl: `${BASE}/api/home-care/unsubscribe?token=unsub-token-not-a-real-secret`,
    });
    expect(html, 'the rendered body is what the recipient gets').toContain(`token=${TOKEN}`);

    const sends: string[] = [];
    const rows: Array<Record<string, unknown>> = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = typeof init?.body === 'string' ? init.body : '';
      if (url.includes('/rest/v1/email_log')) {
        rows.push(JSON.parse(body) as Record<string, unknown>);
        return new Response('', { status: 201 });
      }
      sends.push(body);
      return new Response(JSON.stringify({ id: 'stub-message-id' }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const result = await sendTrackedEmail({
        from: 'La Vaca Home Care <alex@email.lavaca.link>',
        to: 'jordan@example.com',
        subject, html, text,
        category: 'home_care_newsletter',
      });
      expect(result.status, 'the send itself must still succeed').toBe('sent');
    } finally {
      globalThis.fetch = realFetch;
    }

    expect(sends, 'exactly one email goes to Resend').toHaveLength(1);
    expect(sends[0], 'the recipient must keep a link that opens the portal').toContain(TOKEN);

    expect(rows, 'exactly one audit row').toHaveLength(1);
    const [row] = rows;
    for (const part of ['html', 'text'] as const) {
      const stored = String(row[part]);
      expect(stored, `the ${part} column must not hold a live access token`).not.toContain(TOKEN);
      expect(stored, `the ${part} column must not hold the unsubscribe token either`)
        .not.toContain('unsub-token-not-a-real-secret');
      // Still an audit row: the admin sees which links went out, and where to.
      expect(stored).toContain('token=REDACTED');
      expect(stored, 'the destination is not a credential and stays readable')
        .toMatch(/to=%2Fhome-care%2Fchecklist/);
    }
  });

  test('the redaction is at the chokepoint, so no sender can forget it', () => {
    // The same reasoning that keeps attachment bytes out of the table: one
    // place that persists, not five builders that each have to remember.
    const src = code('src/lib/notify/sendEmail.ts');
    expect(src).toMatch(/html:\s*input\.html\s*==\s*null\s*\?\s*null\s*:\s*redactEmailBody\(input\.html\)/);
    expect(src).toMatch(/text:\s*input\.text\s*==\s*null\s*\?\s*null\s*:\s*redactEmailBody\(input\.text\)/);
    // And the Resend payload is built from the untouched input.
    expect(src).toMatch(/\.\.\.\(input\.html !== undefined \? \{ html: input\.html \} : \{\}\)/);
    expect(src).toMatch(/\.\.\.\(input\.text !== undefined \? \{ text: input\.text \} : \{\}\)/);
  });

  test('every durable store of a rendered body calls the same helper', () => {
    // email_log was redacted first and follow_up_queue.email_body was missed,
    // because that one is written directly rather than through the sender. Two
    // tables hold a rendered body; both must go through the one function, so a
    // third has something obvious to call.
    for (const file of [
      'src/lib/homecare/serviceScheduling.ts',
      'src/app/api/cron/visit-reminders/route.ts',
    ]) {
      const src = code(file);
      expect(src, `${file} must import the shared helper`)
        .toMatch(/import \{ redactEmailBody \} from '@\/lib\/notify\/redactEmailBody'/);
      expect(src, `${file} must not store a rendered body verbatim`)
        .toMatch(/email_body:\s*redactEmailBody\(html\)/);
    }
    // The other queue writers are re-sent FROM email_body by send-follow-ups, so
    // theirs stay intact - and carry no portal token, only their own unsubscribe.
    for (const file of ['src/lib/notify/leadFollowUp.ts', 'src/app/api/feedback/create/route.ts']) {
      expect(code(file), `${file} sends from its stored body and must not be redacted`)
        .not.toContain('redactEmailBody');
    }
  });

  test('every token shape that rides in a body is blanked, not just this one', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above.
    const { redactEmailBody }: typeof import('../src/lib/notify/redactEmailBody') = require('../src/lib/notify/redactEmailBody');
    for (const param of ['token', 'access_token', 'unsubscribe_token', 'preference_token', 'verify_token']) {
      // Plain text, an href with escaped separators, and a bare first parameter.
      for (const body of [
        `Open it: ${BASE}/x?${param}=${TOKEN}&to=%2Fa\n`,
        `<a href="${BASE}/x?a=1&amp;${param}=${TOKEN}&amp;b=2">go</a>`,
        `${BASE}/x?${param}=${TOKEN}`,
      ]) {
        expect(redactEmailBody(body), `${param} must be blanked in: ${body}`).not.toContain(TOKEN);
      }
    }
    // A body with nothing to hide comes back byte-identical.
    const clean = `<a href="${BASE}/home-care?utm_source=member_share&amp;utm_medium=email">signup</a>`;
    expect(redactEmailBody(clean)).toBe(clean);
  });

  test('the queued visit reminder is a ledger row, not a second copy of the token', async () => {
    // follow_up_queue is the OTHER durable table that holds a rendered body, and
    // the email_log fix did not reach it: requeueVisitReminder writes the row
    // itself. Two admin surfaces read those rows back with select=*, and the row
    // outlives the visit. Driven through the real writer AND the real sender, so
    // "the row is blanked" and "the customer's link still works" are both proven
    // of the same body rather than read off the source.
    /* eslint-disable @typescript-eslint/no-require-imports -- see above. */
    const { requeueVisitReminder }: typeof import('../src/lib/homecare/serviceScheduling') =
      require('../src/lib/homecare/serviceScheduling');
    const { sendTrackedEmail }: typeof import('../src/lib/notify/sendEmail') =
      require('../src/lib/notify/sendEmail');
    /* eslint-enable @typescript-eslint/no-require-imports */

    const { subject, html, text } = buildVisitReminderEmail({
      recipientName: 'Jordan',
      services: ['Clean gutters'],
      address: '5 Cedar St',
      timeWindow: '8:00-10:00 AM',
      visitDateLabel: 'Tomorrow',
      portalUrl: checklistUrl(BASE, TOKEN, { utm: { utm_source: 'visit_reminder', utm_medium: 'email' } }),
      unsubscribeUrl: `${BASE}/api/home-care/unsubscribe?token=unsub-token-not-a-real-secret`,
    });
    expect(html, 'the rendered body is what the recipient gets').toContain(`token=${TOKEN}`);

    const queued: Array<Record<string, unknown>> = [];
    const sends: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = typeof init?.body === 'string' ? init.body : '';
      // Nothing pending to supersede, so the cancel that runs first is a no-op.
      if (url.includes('/rest/v1/follow_up_queue') && (init?.method ?? 'GET') === 'GET') {
        return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.includes('/rest/v1/follow_up_queue')) {
        queued.push(...(JSON.parse(body) as Record<string, unknown>[]));
        return new Response('[]', { status: 201, headers: { 'content-type': 'application/json' } });
      }
      if (url.includes('/rest/v1/')) return new Response('', { status: 201 });
      sends.push(body);
      return new Response(JSON.stringify({ id: 'stub-message-id' }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const outcome = await requeueVisitReminder({
        email: 'jordan@example.com',
        name: 'Jordan',
        start: new Date(Date.now() + 48 * 3600_000),
        subject,
        html,
      });
      expect(outcome, 'the reminder must still be queued').toBe('queued');

      const sent = await sendTrackedEmail({
        from: 'La Vaca Home Care <alex@email.lavaca.link>',
        to: 'jordan@example.com',
        subject, html, text,
        category: 'visit_reminder',
      });
      expect(sent.status, 'the send itself must still succeed').toBe('sent');
    } finally {
      globalThis.fetch = realFetch;
    }

    expect(queued, 'exactly one ledger row').toHaveLength(1);
    const stored = String(queued[0].email_body);
    expect(stored, 'the ledger row must not hold a live access token').not.toContain(TOKEN);
    expect(stored, 'nor the unsubscribe token').not.toContain('unsub-token-not-a-real-secret');
    // Still a readable record of what was queued: the link's shape survives.
    expect(stored).toContain('token=REDACTED');
    expect(stored).toMatch(/to=%2Fhome-care%2Fchecklist/);

    expect(sends, 'exactly one email goes to Resend').toHaveLength(1);
    expect(sends[0], 'and the recipient keeps a link that opens the portal').toContain(TOKEN);
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
