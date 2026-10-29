import { test, expect, type APIRequestContext } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON } from './helpers/liveBackend';
import { checkSocialCopy, parseSocialMarkdown } from '../src/lib/articles/socialCopy';
import { catalogPricesFrom } from '../src/lib/articles/catalogPrices';
import { publishedMessage } from '../src/lib/articles/notify';
import { HOME_SERVICES_SEED } from '../src/lib/home-services/catalogSeed';
import { TELEGRAM_TEXT_LIMIT } from '../src/lib/notify/telegramMessage';
import type { PublishFacts } from '../src/lib/articles/publishGuard';

/**
 * Decision 006, Q22: the articles skill writes social copy at publish time
 * (docs/social/<slug>.md), the publish route checks it with the article's own
 * price and legal rules, and the Instagram caption rides in the Telegram.
 *
 * Pure half: the social-copy guard on three samples, the parser, and the
 * Telegram message with a caption (including the 4096 limit).
 * Live half (E2E_LIVE_BACKEND=1, local rig): `publish --social` through the
 * route, a passing file and a failing one.
 */

const root = process.cwd();
const FACTS: PublishFacts = {
  contentFacts: [
    { key: 'phone_main', value: '(201) 212-4917' },
    { key: 'claim_insurance', value: 'La Vaca carries general liability insurance and a one-year workmanship warranty on its own work.', lock: true },
  ],
  catalogPrices: catalogPricesFrom(HOME_SERVICES_SEED),
};
const SLUG = 'when-to-clean-gutters-in-essex-county';

function socialFile(parts: { instagram?: string; google?: string; x?: string; hashtags?: string; url?: string } = {}): string {
  return [
    '# Social copy: When should you clean gutters in Essex County?',
    '',
    `Article: ${parts.url ?? `https://www.lavacagc.com/blog/${SLUG}`}`,
    'Date: 2026-10-30',
    '',
    '## Instagram and Facebook',
    parts.instagram ?? [
      'Leaves in your gutters again?',
      '',
      'Late fall is the time to clean gutters in Essex County. Clogged gutters push water toward your foundation. Gutter cleaning starts at $279 and we bag every leaf.',
      '',
      'Book it here: https://www.lavacagc.com/home-services/gutter-cleaning',
    ].join('\n'),
    '',
    '## Google Business',
    parts.google ?? `Clean your gutters in late fall, after the oaks and maples drop their leaves. We serve Essex County. Read more: https://www.lavacagc.com/blog/${SLUG}`,
    '',
    '## X',
    parts.x ?? `Clean gutters in late fall, after the leaves drop. https://www.lavacagc.com/blog/${SLUG}`,
    '',
    '## Hashtags',
    parts.hashtags ?? '#GutterCleaning #EssexCounty #NJHomes',
    '',
  ].join('\n');
}

const check = (md: string) => checkSocialCopy(parseSocialMarkdown(md), SLUG, FACTS);

test.describe('Q22: the social-copy guard', () => {
  test('sample 1: clean copy with the catalog starting price for the named service passes', () => {
    const copy = parseSocialMarkdown(socialFile());
    expect(copy.articleUrl).toBe(`https://www.lavacagc.com/blog/${SLUG}`);
    expect(copy.date).toBe('2026-10-30');
    expect(copy.instagram.startsWith('Leaves in your gutters again?')).toBe(true);
    expect(copy.hashtags).toEqual(['#GutterCleaning', '#EssexCounty', '#NJHomes']);
    expect(check(socialFile())).toEqual([]);
    // A locked claim sentence, word for word, is allowed on social too.
    expect(check(socialFile({ google: 'La Vaca carries general liability insurance and a one-year workmanship warranty on its own work. We serve Essex County.' }))).toEqual([]);
  });

  test('sample 2: price and legal claims are held exactly as in an article', () => {
    const reasons = check(socialFile({
      instagram: 'Save 20% this fall! Gutter cleaning from $199, fully insured. https://www.lavacagc.com/home-services/gutter-cleaning',
      x: 'Our gutter work is guaranteed. https://www.lavacagc.com/blog/x',
    }));
    expect(reasons).toEqual([
      'Social copy: Price claim: "from $199" in the Instagram caption',
      'Social copy: Price claim: "Save 20%" in the Instagram caption',
      'Social copy: Legal claim: "insured" in the Instagram caption ("...Gutter cleaning from $199, fully insured.")',
      'Social copy: Legal claim: "guaranteed" in the X post ("Our gutter work is guaranteed.")',
    ]);
    // The catalog price of another service is not this one's.
    expect(check(socialFile({ google: 'Gutter cleaning starts at $2,095 in Essex County.' })))
      .toEqual(['Social copy: Price claim: "starts at $2,095" in the Google Business post']);
  });

  test('sample 3: limits, hashtags, the article line and the call to the service page', () => {
    const reasons = check(socialFile({
      url: 'https://www.lavacagc.com/blog/some-other-post',
      instagram: `Leaves again? ${'Plain words. '.repeat(200)}`,
      x: `${'x'.repeat(281)}`,
      hashtags: '#Gutters #NJ',
    }));
    expect(reasons).toEqual([
      `Social copy: the "Article:" line must be this article's URL (/blog/${SLUG}).`,
      'Social copy: the Instagram caption has 2613 characters; the limit is 2200.',
      'Social copy: the X post has 281 characters; the limit is 280.',
      'Social copy: the Instagram caption needs a call to the service page (its URL or /home-services/<slug>).',
      'Social copy: 3 to 5 hashtags are needed; there are 2.',
    ]);
    expect(check(socialFile({ hashtags: '#One #two-words #Three' }))).toEqual(['Social copy: not a hashtag: "#two-words".']);
    const missing = parseSocialMarkdown('# Social copy: x\n\nArticle: https://x/blog/' + SLUG + '\nDate: 2026-10-30\n');
    expect(checkSocialCopy(missing, SLUG, FACTS)).toEqual([
      'Social copy: the Instagram caption is missing.',
      'Social copy: the Google Business post is missing.',
      'Social copy: the X post is missing.',
      'Social copy: 3 to 5 hashtags are needed; there are 0.',
    ]);
  });
});

test.describe('Q22: the caption in the Telegram publish message', () => {
  const base = { title: 'Gutters <fall> & you', url: 'https://www.lavacagc.com/blog/g', unpublishUrl: 'https://www.lavacagc.com/articles/unpublish/t.s' };

  test('the caption follows the unpublish link, escaped', () => {
    const text = publishedMessage({ ...base, social: { caption: 'Leaves & gutters <now>', file: 'docs/social/g.md' } });
    expect(text).toBe([
      'New article published: Gutters &lt;fall&gt; &amp; you https://www.lavacagc.com/blog/g',
      'Unpublish: https://www.lavacagc.com/articles/unpublish/t.s',
      '',
      'Instagram caption:',
      'Leaves &amp; gutters &lt;now&gt;',
    ].join('\n'));
    // No social copy: the message is the slice G one, unchanged.
    expect(publishedMessage(base)).toBe(text.split('\n\n')[0]);
  });

  test('a caption that would pass 4096 characters is cut, with a note naming the file', () => {
    const caption = '&'.repeat(2200); // escapes to 11,000 characters
    const text = publishedMessage({ ...base, social: { caption, file: 'docs/social/g.md' } });
    expect(text.length).toBeLessThanOrEqual(TELEGRAM_TEXT_LIMIT);
    expect(text.endsWith('\n(Caption cut to fit Telegram; the full copy is in docs/social/g.md.)')).toBe(true);
    expect(text).not.toMatch(/&[a-z]*\.\.\.\n/); // no half entity before the cut
  });
});

// ---------------------------------------------------------------------------
// Live backend: publish --social through the route
// ---------------------------------------------------------------------------

function localEnv(): Record<string, string> {
  const out: Record<string, string> = { ...process.env } as Record<string, string>;
  const p = join(root, '.env.local');
  if (!existsSync(p)) return out;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) out[m[1]] = m[2];
  }
  return out;
}

test.describe('Q22: publish with social copy (live backend)', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);

  const env = localEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SECRET_KEY;
  const token = env.PROJECT_INGEST_TOKEN;
  const service = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const octet = () => Math.floor(Math.random() * 254) + 1;
  const ip = `198.18.${octet()}.${octet()}`;
  const auth = { Authorization: `Bearer ${token}`, 'cf-connecting-ip': ip };
  const PREFIX = `slice-g-q22-${Date.now().toString(36)}`;
  const opening = 'Clean your gutters in Essex County in late fall, after the oaks and maples drop their leaves, and again in spring, so water runs off the roof and away from the house instead of spilling over the edge onto the foundation below.';
  const body = [opening, '## What to do first', 'See [gutter cleaning](/home-services/gutter-cleaning), [our process](/process) and a [free estimate](/free-estimate).'].join('\n\n');

  async function clearOwnBucket(request: APIRequestContext) {
    await request.delete(`${supabaseUrl}/rest/v1/rate_limits?ip_address=eq.${encodeURIComponent(`articles:${ip}`)}`, { headers: service });
  }
  const row = async (request: APIRequestContext, id: string) =>
    (await (await request.get(`${supabaseUrl}/rest/v1/blog_posts?select=published&id=eq.${id}`, { headers: service })).json())[0];

  test.beforeAll(async ({ request }) => {
    test.skip(!supabaseUrl || !serviceKey || !token, 'Needs the rig env in .env.local');
    await clearOwnBucket(request);
  });
  test.afterAll(async ({ request }) => {
    if (!supabaseUrl || !serviceKey) return;
    await request.delete(`${supabaseUrl}/rest/v1/blog_posts?slug=like.${encodeURIComponent(`${PREFIX}*`)}`, { headers: service });
    await clearOwnBucket(request);
  });

  test('failing copy is a 422 and nothing is published; passing copy publishes and is reported as included', async ({ request, baseURL }) => {
    const created = await (await request.post('/api/articles/ingest', {
      headers: auth, data: { title: `${PREFIX} Gutters`, content: body, category: 'Gutter Cleaning' },
    })).json() as { id: string; slug: string };
    const url = `${baseURL}/blog/${created.slug}`;
    const md = (instagram?: string) => socialFile({ url, instagram }).replace(`# Social copy: When should you clean gutters in Essex County?`, `# Social copy: ${PREFIX}`);

    const bad = await request.post(`/api/articles/ingest/${created.id}/publish`, {
      headers: auth, data: { social: md('Fully insured gutter work! https://www.lavacagc.com/home-services/gutter-cleaning') },
    });
    expect(bad.status()).toBe(422);
    const badBody = await bad.json();
    expect(badBody.published).toBe(false);
    expect(badBody.social[0]).toContain('Legal claim: "insured" in the Instagram caption');
    expect((await row(request, created.id)).published).toBe(false);

    const good = await request.post(`/api/articles/ingest/${created.id}/publish`, { headers: auth, data: { social: md() } });
    expect(good.status(), await good.text()).toBe(200);
    expect(await good.json()).toMatchObject({ published: true, social: 'included', telegram: 'not_configured' });
    expect((await row(request, created.id)).published).toBe(true);
    await request.post(`/api/articles/ingest/${created.id}/unpublish`, { headers: auth });
  });
});
