import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { checklistUrl, safeDestination, GOOGLE_REVIEW_URL } from '../src/lib/homecare/emailLinks';
import { buildServiceCompletedEmail, buildVisitReminderEmail } from '../src/lib/homecare/serviceEmails';
import { buildReleaseEmail } from '../src/lib/homecare/releaseEmail';
import { buildNewsletter, type NewsletterTask } from '../src/lib/homecare/newsletter';

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

const RELEASE_FEATURE = {
  headline: 'Seasonal guides', subhead: 'Read before you climb.',
  benefit: 'Know what the job involves.', screenshot_path: null,
};
const NEWSLETTER_TASK: NewsletterTask = {
  key: 'clean_gutters', title: 'Clean gutters', blurb: 'Clear them out.',
  bookable: true, diy_or_pro: 'pro', priority: 9, applies_to: ['all'],
};

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

  test('every portal email actually RENDERS the token, not just imports the helper', () => {
    // The point of asserting on output: the previous version of this test only
    // checked that each builder mentioned the helper, so it passed green while
    // the release email shipped a bare link because no token was ever passed.
    const rendered: Array<[string, { html: string; text: string }]> = [
      ['release', buildReleaseEmail({
        firstName: 'Jordan', features: [RELEASE_FEATURE], baseUrl: BASE,
        accessToken: TOKEN, unsubscribeUrl: `${BASE}/unsub`,
      })],
      ['newsletter', buildNewsletter({
        firstName: 'Jordan', season: 'fall', tasks: [NEWSLETTER_TASK], isSeasonal: true,
        baseUrl: BASE, accessToken: TOKEN, unsubscribeUrl: `${BASE}/unsub`,
      })],
      ['visit reminder', buildVisitReminderEmail({
        recipientName: 'Jordan', services: ['Clean gutters'], address: '14 Maple Ave',
        timeWindow: '8:00 - 11:00am', visitDateLabel: 'Tomorrow',
        portalUrl: checklistUrl(BASE, TOKEN), unsubscribeUrl: `${BASE}/unsub`,
      })],
    ];
    for (const [name, { html, text }] of rendered) {
      expect(html, `${name} html must carry the token`).toContain(`token=${TOKEN}`);
      expect(text, `${name} text must carry the token`).toContain(`token=${TOKEN}`);
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
    ];
    for (const [file, selectSource] of senders) {
      const src = code(file);
      expect(code(selectSource), `${selectSource} must select access_token`).toMatch(/select=[^`'"]*access_token/);
      const buildsItself = /checklistUrl\([^)]*\.access_token/s.test(src);
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

  test('a traversal that normalises OUT of the portal does not survive', () => {
    // These pass a naive startsWith check and are then normalised by new URL()
    // into a path the allow-list would never have accepted. Same-origin, so
    // never an open redirect - but the list has to constrain what it appears to.
    for (const traversal of [
      '/home-care/../vaca-mgmt',
      '/home-care/guides/../../vaca-mgmt/send-estimate',
      '/home-care/..%2fvaca-mgmt',
    ]) {
      expect(safeDestination(traversal), `${traversal} must not survive`).toBe('/home-care/checklist');
    }
    expect(new URL(safeDestination('/home-care/../vaca-mgmt'), BASE).pathname).toBe('/home-care/checklist');
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
    expect(src).toMatch(/checkRateLimit\([^)]*consume:\s*false/s);
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

test.describe('every recipient is told something true', () => {
  const page = read('src/app/home-care/page.tsx');

  test('each error code gets its own copy, not one catch-all', () => {
    const codes = ['invalid', 'unavailable', 'unsubscribed', 'busy'];
    const copy = codes.map((c) => page.match(new RegExp(`^\\s*${c}:\\s*"([^"]+)"`, 'm'))?.[1]);
    for (const [i, c] of copy.entries()) {
      expect(c, `${codes[i]} must have its own copy`).toBeTruthy();
    }
    expect(new Set(copy).size, 'the four codes must not share one message').toBe(4);
  });

  test('"request a fresh link" is never the advice when a fresh link fails too', () => {
    // unavailable = our signing secret or our database. A fresh link fails
    // identically, so telling someone to request one is actively wrong.
    for (const code of ['unavailable', 'busy']) {
      const copy = page.match(new RegExp(`^\\s*${code}:\\s*"([^"]+)"`, 'm'))![1];
      expect(copy.toLowerCase(), `${code} must not promise a fresh link`).not.toMatch(/fresh one|send.*fresh/);
      expect(copy.toLowerCase()).toContain('try the same link again');
    }
  });

  test('the page renders the mapped copy rather than a hardcoded sentence', () => {
    expect(page).toContain('ACCESS_ERRORS[sp.error] ?? ACCESS_ERROR_FALLBACK');
  });
});

test.describe('a tokenized email is not an invitation to hand over the portal', () => {
  test('no Home Care email that carries a token asks to be forwarded', () => {
    // The cookie the token buys is not view-only: it gates /home-care/book -
    // requesting PAID WORK at the member's address - and profile editing, for
    // 30 days. Before the token these emails carried no credential, so
    // forwarding was harmless.
    const carriers = ['src/lib/homecare/newsletter.ts', 'src/lib/homecare/releaseEmail.ts'];
    for (const f of carriers) {
      const src = read(f);
      expect(src, `${f} carries a token, so it must not invite forwarding`).not.toMatch(/Forward this email/i);
    }
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

  test('a re-subscribing homeowner with no token is healed rather than left bare', () => {
    const src = code('src/app/api/home-care/subscribe/route.ts');
    expect(src).toMatch(/access_token:\s*existing\.access_token\s*\|\|\s*newToken\(\)/);
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
