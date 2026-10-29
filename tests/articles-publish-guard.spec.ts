import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON } from './helpers/liveBackend';
import { checkPublishable, type PublishCandidate, type PublishFacts } from '../src/lib/articles/publishGuard';
import { catalogPricesFrom } from '../src/lib/articles/catalogPrices';
import {
  isTokenCurrent, readUnpublishToken, signUnpublishToken, unpublishLink, UNPUBLISH_LINK_TTL_SECONDS,
} from '../src/lib/articles/unpublishToken';
import { heldMessage, publishedMessage, unpublishedMessage } from '../src/lib/articles/notify';
import { announceHeld, announcePublished } from '../src/lib/articles/publishFlow';
import { renderUnpublishPage } from '../src/lib/articles/unpublishPage';
import { isAnalyticsExcluded } from '../src/lib/analytics/excluded';
import { isPrivateTokenPage } from '../src/lib/privatePages';
import { HOME_SERVICES_SEED } from '../src/lib/home-services/catalogSeed';
import type { Fact } from '../src/lib/seo/draftGuardrails';

/**
 * Phase 2 slice G: the publish guard (PG), the Telegram one-tap unpublish
 * link (TG) and the security rules around both (SEC2, SEC4).
 * docs/phase-2/acceptance-criteria.md.
 *
 * The first half needs no backend: the guard, the token, the Telegram text
 * and the outgoing Telegram request (fetch mocked), the unpublish page, and
 * source pins.
 *
 * The second half is live-backend, against the local Supabase rig and a
 * `next dev` (or production build) of this worktree:
 *
 *   TEST_URL=http://localhost:3118 E2E_LIVE_BACKEND=1 \
 *     node_modules/.bin/playwright test tests/articles-publish-guard.spec.ts --project=chromium
 *
 * Telegram is not configured on the rig, so the live half checks that every
 * route reports `telegram: not_configured` and still does its job (TG4); the
 * message text and link are proven by the mocked-fetch tests above it.
 *
 * Every row it writes has a `slice-g-<run>` slug, and afterAll removes only those.
 */

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const FACTS: Fact[] = [
  { key: 'hic_number', value: '13VH13373800' },
  { key: 'phone_main', value: '(201) 212-4917' },
  { key: 'service_area', value: 'Northern New Jersey (Bergen, Essex, Morris, Union counties)' },
  { key: 'claim_license', value: 'PLACEHOLDER - Alex replaces: La Vaca General Contractors is a licensed New Jersey home improvement contractor.', lock: false },
  { key: 'claim_insurance', value: 'PLACEHOLDER - Alex replaces: La Vaca General Contractors is fully insured.', lock: false },
];
const CATALOG = catalogPricesFrom(HOME_SERVICES_SEED);
const facts = (extra: Fact[] = []): PublishFacts => ({ contentFacts: [...FACTS, ...extra], catalogPrices: CATALOG });

/** 40 words, no link, no claim: a clean answer-first opening. */
const OPENING = 'Cabinet repainting in Bergen County usually takes four to six days from the first wipe-down to the last coat, depending on how many doors you have, the finish you pick, and how long each coat really needs to fully cure.';
const LINKS = 'Read about [cabinet repainting](/home-services/cabinet-repainting), see [our process](/process) and ask for a [free estimate](/free-estimate).';

function article(...middle: string[]): PublishCandidate {
  return {
    title: 'Cabinet repainting timeline in Bergen County',
    slug: 'cabinet-repainting-timeline',
    category: 'Home Services',
    content: [OPENING, '## What sets the pace', ...middle, LINKS].join('\n\n'),
  };
}

const reasonsOf = (post: PublishCandidate, f: PublishFacts = facts()) => checkPublishable(post, f).reasons;

// ---------------------------------------------------------------------------
// PG1 - the guard, pure
// ---------------------------------------------------------------------------

test.describe('PG1: checkPublishable', () => {
  test('PG5 baseline: three internal links, the locked phone, no claims and a 40-word opening pass', () => {
    expect(OPENING.split(/\s+/).length).toBe(40);
    const post = article('Call (201) 212-4917 to book a visit; we answer the same day and bring color samples to the house.');
    expect(checkPublishable(post, facts())).toEqual({ ok: true, reasons: [] });
  });

  const PRICE_CASES: Array<[string, string]> = [
    ['Most kitchens run from $9,000 for a refresh.', 'from $9,000'],
    ['Budget USD 9000 for the cabinets alone.', 'USD 9000'],
    ['Plan on 9,000 dollars for a full repaint.', '9,000 dollars'],
    ['Siding paint runs $3.10 / sq ft in most towns.', '$3.10 / sq ft'],
    ['Painters often bill per sq ft on the big jobs.', 'per sq ft'],
    ['Tile is usually priced per square foot here.', 'per square foot'],
    ['Trim work is billed per linear foot on most jobs.', 'per linear foot'],
    ['Small jobs are starting at 900 for one room.', 'starting at 900'],
    ['A full kitchen costs about 15,000 in Essex.', 'costs about 15,000'],
    ['The cost of 12,000 covers the cabinets.', 'cost of 12,000'],
    ['Prices around 400 are common for one door set.', 'Prices around 400'],
    ['Expect estimates of 5,000 for the whole floor.', 'estimates of 5,000'],
    ['We have seen quotes of 7,500 for the same job.', 'quotes of 7,500'],
    ['Book in March and save 20% on the labor.', 'save 20%'],
    ['Spring bookings get 15% off the second room.', '15% off'],
    ['Ask about the 10 percent discount for neighbors.', '10 percent discount'],
    ['A repaint is 30% cheaper than new doors.', '30% cheaper'],
    // Punctuation after an amount is not part of the claim.
    ['Gutters from $199, every fall.', 'from $199'],
  ];
  for (const [sentence, matched] of PRICE_CASES) {
    test(`price pattern: "${matched}" is a reason`, () => {
      const reasons = reasonsOf(article(sentence));
      expect(reasons).toContain(`Price claim: "${matched}" in paragraph 3`);
    });
  }

  // Slice H fix round 1: the forms the experiments review found, added to the
  // shared detector so articles are held for them too.
  const MORE_PRICE_CASES: Array<[string, string]> = [
    ['Cabinets come in around 2,095$ for most kitchens.', '2,095$'],
    ['Gutters for ＄99 this fall.', '＄99'],
    ['A gutter clean is about 99 bucks on a ranch.', '99 bucks'],
    ['Most homes spend under two hundred dollars on it.', 'two hundred dollars'],
    ['La mayoría gasta menos de doscientos dólares.', 'doscientos dólares'],
    ['El repintado cuesta 2095 dólares en promedio.', '2095 dólares'],
    ['This month every second room is half price.', 'half price'],
    ['Gutters are half off for neighbors.', 'half off'],
    ['Este mes la segunda habitación va a mitad de precio.', 'mitad de precio'],
  ];
  for (const [sentence, matched] of MORE_PRICE_CASES) {
    test(`price pattern (slice H): "${matched}" is a reason`, () => {
      expect(reasonsOf(article(sentence)).join(' | ')).toContain(`"${matched}`);
    });
  }

  test('slice H: the strict short-copy rules stay out of articles (free estimate, feel free, save time, a year)', () => {
    expect(reasonsOf(article('Feel free to ask; most owners save time by sending photos, and since 2019 we answer the same day.'))).toEqual([]);
  });

  test('a catalog price for the service the paragraph names is allowed; the same amount for another service is not', () => {
    expect(reasonsOf(article('Cabinet repainting starts at $2,095 for a standard kitchen.'))).toEqual([]);
    expect(reasonsOf(article('Exterior painting is $2.95 / sq ft with a job minimum set by the crew.'))).toEqual([]);
    expect(reasonsOf(article('Repintado de gabinetes desde $2,095.'))).toEqual([]);
    expect(reasonsOf(article('Gutter cleaning starts at $2,095 for most homes.')))
      .toEqual(['Price claim: "starts at $2,095" in paragraph 3']);
    // The old price (before decision 005) is not the published one.
    expect(reasonsOf(article('Cabinet repainting starts at $1,995 for a standard kitchen.')))
      .toEqual(['Price claim: "starts at $1,995" in paragraph 3']);
    // With no catalog loaded no amount is ever allowed.
    expect(reasonsOf(article('Cabinet repainting starts at $2,095.'), { contentFacts: FACTS }))
      .toEqual(['Price claim: "starts at $2,095" in paragraph 3']);
  });

  test('a range is one claim, and a year in prose is not a price', () => {
    expect(reasonsOf(article('Most kitchens land between $9,000 to $12,000 all in.')))
      .toEqual(['Price claim: "$9,000 to $12,000" in paragraph 3']);
    expect(reasonsOf(article('The cost of a kitchen remodel in 2026 depends on the cabinets you keep.'))).toEqual([]);
    expect(reasonsOf(article('Prices rose since 2020 across the county.'))).toEqual([]);
  });

  test('fix 1: a year-shaped number right after a price word is a price', () => {
    expect(reasonsOf(article('A small bathroom costs 2000 or more.'))).toEqual(['Price claim: "costs 2000" in paragraph 3']);
    expect(reasonsOf(article('A small bathroom costs 1950 or more.'))).toEqual(['Price claim: "costs 1950" in paragraph 3']);
    expect(reasonsOf(article('The cost of 2000 covers the doors.'))).toEqual(['Price claim: "cost of 2000" in paragraph 3']);
  });

  test('fix 1 (review advisories): a catalog price only as the starting price, in its own unit; worded discounts; whole locked sentences', () => {
    // A catalog amount inside saving or discount wording is a claim.
    expect(reasonsOf(article('Save $2,095 on cabinet repainting this month.'))).toEqual(['Price claim: "Save $2,095" in paragraph 3']);
    expect(reasonsOf(article('Cabinet repainting is $2,095 off this week.'))).toEqual(['Price claim: "$2,095" in paragraph 3']);
    // The unit must match the catalog's.
    expect(reasonsOf(article('Exterior painting is $2.95 per linear foot.'))).toEqual(['Price claim: "$2.95 per linear foot" in paragraph 3']);
    expect(reasonsOf(article('Exterior painting is $2.95 per square foot.'))).toEqual([]);
    // Worded percentages.
    expect(reasonsOf(article('Get twenty percent off the second room.'))).toEqual(['Price claim: "twenty percent off" in paragraph 3']);
    expect(reasonsOf(article('Spring jobs are half off.'))).toEqual(['Price claim: "half off" in paragraph 3']);
    // A locked sentence counts only as a whole sentence.
    const locked: Fact = { key: 'claim_insurance', value: 'La Vaca General Contractors is fully insured.', lock: true };
    const f: PublishFacts = { contentFacts: [...FACTS, locked], catalogPrices: CATALOG };
    expect(reasonsOf(article('It is not true that La Vaca General Contractors is fully insured.'), f).length).toBe(1);
    expect(reasonsOf(article('Good news. La Vaca General Contractors is fully insured. Ask for it.'), f)).toEqual([]);
  });

  const LEGAL_CASES: Array<[string, string]> = [
    ['Your town may require a permit for new circuits.', 'permit'],
    ['Every job is code compliant when we leave.', 'code compliant'],
    ['We bring old wiring to code as we go.', 'to code'],
    ['The deck will be up to code by Friday.', 'up to code'],
    ['We follow the building code on every stair.', 'building code'],
    ['Every job comes with a warranty on labor.', 'warranty'],
    ['We guarantee the finish will not peel.', 'guarantee'],
    ['The finish is guaranteed for two years.', 'guaranteed'],
    ['Our crews are insured for this work.', 'insured'],
    ['The crew is bonded in New Jersey.', 'bonded'],
    ['You carry no liability for the crew.', 'liability'],
    ['Skipping this step invites a lawsuit later.', 'lawsuit'],
    ['That shortcut is not legal in Essex.', 'legal'],
    ['You can legally skip the inspection.', 'legally'],
    ['The new ramp meets ADA rules.', 'ADA'],
    ['The crew follows OSHA rules on ladders.', 'OSHA'],
    ['We use lead-safe methods on old trim.', 'lead-safe'],
    ['The paint meets EPA limits for fumes.', 'EPA'],
    ['Old tile can hide asbestos under it.', 'asbestos'],
    ['We also handle mold remediation in basements.', 'mold remediation'],
  ];
  for (const [sentence, keyword] of LEGAL_CASES) {
    test(`legal keyword: "${keyword}" is a reason`, () => {
      const reasons = reasonsOf(article(sentence));
      expect(reasons.some((r) => r.startsWith(`Legal claim: "${keyword}" in paragraph 3 (`)), reasons.join('\n')).toBe(true);
    });
  }

  test('a locked fact sentence passes; the same words unlocked, or any other legal sentence, do not', () => {
    const sentence = 'La Vaca General Contractors is fully insured.';
    const locked: Fact = { key: 'claim_insurance', value: sentence, lock: true };
    const facts2: PublishFacts = { contentFacts: [...FACTS.filter((f) => f.key !== 'claim_insurance'), locked], catalogPrices: CATALOG };
    expect(reasonsOf(article(`We start on time. ${sentence} Ask for the certificate.`), facts2)).toEqual([]);
    // Markdown emphasis and a curly quote do not change the sentence.
    expect(reasonsOf(article(`**La Vaca General Contractors is fully insured.**`), facts2)).toEqual([]);
    // Only the exact sentence: anything else with the keyword is still a claim.
    expect(reasonsOf(article('Our crews are fully insured for every job.'), facts2).length).toBe(1);
    // The seeded placeholder is unlocked, so it lets nothing through until Alex approves it.
    expect(reasonsOf(article('PLACEHOLDER - Alex replaces: La Vaca General Contractors is fully insured.')).length).toBe(1);
    // A license sentence carries no legal keyword and the number is fact-locked.
    expect(reasonsOf(article('La Vaca is a licensed New Jersey home improvement contractor, HIC #13VH13373800.'))).toEqual([]);
    expect(reasonsOf(article('La Vaca is a licensed New Jersey home improvement contractor, HIC #13VH99999999.')))
      .toEqual(['Unrecognized license number "13VH99999999" (locked: 13VH13373800).']);
  });

  test('claims are found in the title, the FAQ and the meta fields too, not in link targets', () => {
    const post = {
      ...article(),
      title: 'Save 20% on cabinet repainting',
      faq: [{ q: 'Is the work guaranteed?', a: 'Yes.' }, { q: 'How long?', a: 'Plan on $500 for a door set.' }],
      meta_description: 'Our warranty covers the finish.',
    };
    expect(reasonsOf(post)).toEqual([
      'Price claim: "Save 20%" in the title',
      'Price claim: "$500" in FAQ answer 2',
      'Legal claim: "guaranteed" in FAQ question 1 ("Is the work guaranteed?")',
      'Legal claim: "warranty" in the meta description ("Our warranty covers the finish.")',
    ]);
    // A link target is not a claim; the link text is.
    expect(reasonsOf(article('See [our guide](/blog/save-20-percent-on-permits) before you start.'))).toEqual([]);
  });

  test('answer-first, H2 and FAQ shape checks fire on a bad shape', () => {
    const base = article();
    const shortOpening = { ...base, content: base.content.replace(OPENING, 'Four to six days, usually.') };
    expect(reasonsOf(shortOpening)).toEqual(['Answer-first: the opening paragraph has 5 words; it needs 25 to 70.']);

    const longOpening = { ...base, content: base.content.replace(OPENING, `${OPENING} ${OPENING}`) };
    expect(reasonsOf(longOpening)).toEqual(['Answer-first: the opening paragraph has 80 words; it needs 25 to 70.']);

    const linked = { ...base, content: base.content.replace('the finish you pick', 'the [finish](/process) you pick') };
    expect(reasonsOf(linked)).toEqual(['Answer-first: the opening paragraph contains a link; keep links out of the answer.']);

    const headingFirst = { ...base, content: `## Timeline\n\n${base.content}` };
    expect(reasonsOf(headingFirst)).toEqual(['Answer-first: the article must open with a paragraph that answers the question, not "## Timeline".']);

    // A leading H1 repeats the title and is skipped.
    expect(reasonsOf({ ...base, content: `# ${base.title}\n\n${base.content}` })).toEqual([]);

    const noH2 = { ...base, content: base.content.replace('## What sets the pace', 'What sets the pace') };
    expect(reasonsOf(noH2)).toEqual(['No H2 section heading ("## ..."); add at least one.']);

    const question = { ...base, title: 'How long does cabinet repainting take?' };
    expect(reasonsOf(question)).toEqual(['Question-style title needs a FAQ with 2 to 6 items; it has 0.']);
    const two = [{ q: 'Can I stay home?', a: 'Yes.' }, { q: 'Do you move the dishes?', a: 'You do.' }];
    expect(reasonsOf({ ...question, faq: two })).toEqual([]);
    const seven = Array.from({ length: 7 }, (_, i) => ({ q: `Question ${i + 1}?`, a: 'Answer.' }));
    expect(reasonsOf({ ...question, faq: seven })).toEqual(['Question-style title needs a FAQ with 2 to 6 items; it has 7.']);
  });

  test('reasons come in contract order: fact-lock, price, legal, shape; the contract example reads as written', () => {
    const post: PublishCandidate = {
      title: 'Kitchen guide',
      slug: 'kitchen-guide',
      category: 'Kitchen Remodeling',
      content: ['Short opening.', 'Call 555-123-4567.', 'We are insured.', 'Kitchens from $9,000 are common.'].join('\n\n'),
    };
    expect(reasonsOf(post)).toEqual([
      'Only 0 internal link(s); needs at least 3.',
      'Unrecognized phone number "555-123-4567" (locked: (201) 212-4917).',
      'Price claim: "from $9,000" in paragraph 4',
      'Legal claim: "insured" in paragraph 3 ("We are insured.")',
      'Answer-first: the opening paragraph has 2 words; it needs 25 to 70.',
      'No H2 section heading ("## ..."); add at least one.',
    ]);
  });
});

// ---------------------------------------------------------------------------
// TG - the signed link, the messages and the outgoing request
// ---------------------------------------------------------------------------

const SECRET = 's'.repeat(40);
const POST_ID = '11111111-2222-4333-8444-555555555555';
const PUBLISHED_AT = '2026-10-30T12:00:00.123456+00:00';
const NONCE = 'n0nceN0nce-abc_12345678';
const PUB = { id: POST_ID, published_at: PUBLISHED_AT, publish_nonce: NONCE };

test.describe('TG: the signed unpublish link', () => {
  test('the token is base64url(id.publishedAtUnix.nonce).HMAC and reads back', () => {
    const token = signUnpublishToken(PUB, SECRET)!;
    const [payload, signature] = token.split('.');
    const unix = Math.floor(Date.parse(PUBLISHED_AT) / 1000);
    expect(Buffer.from(payload, 'base64url').toString()).toBe(`${POST_ID}.${unix}.${NONCE}`);
    expect(signature).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const now = Date.parse(PUBLISHED_AT) + 60_000;
    expect(readUnpublishToken(token, now, SECRET)).toEqual({ ok: true, postId: POST_ID, publishedAtUnix: unix, nonce: NONCE });
  });

  test('fix 2: two publications in the same second get different links, and only the current one is accepted', () => {
    const first = signUnpublishToken(PUB, SECRET)!;
    const second = signUnpublishToken({ ...PUB, published_at: '2026-10-30T12:00:00.900+00:00', publish_nonce: 'otherNonce_987654321' }, SECRET)!;
    expect(second).not.toBe(first);
    const reading = readUnpublishToken(first, Date.parse(PUBLISHED_AT), SECRET);
    if (!reading.ok) throw new Error('expected a valid reading');
    // Same second, new publication: the old link is dead.
    expect(isTokenCurrent(reading, { published: true, published_at: '2026-10-30T12:00:00.900+00:00', publish_nonce: 'otherNonce_987654321' })).toBe(false);
    expect(signUnpublishToken({ ...PUB, publish_nonce: '' }, SECRET)).toBeNull();
  });

  test('TG2 (pure): tampered, expired, short-secret and republished links are refused', () => {
    const token = signUnpublishToken(PUB, SECRET)!;
    const now = Date.parse(PUBLISHED_AT);
    const flip = (s: string, i: number) => s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1);
    expect(readUnpublishToken(flip(token, token.length - 2), now, SECRET)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(readUnpublishToken(flip(token, 3), now, SECRET)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(readUnpublishToken(token, now, 't'.repeat(40))).toEqual({ ok: false, reason: 'bad_signature' });
    expect(readUnpublishToken('nonsense', now, SECRET)).toEqual({ ok: false, reason: 'malformed' });
    expect(readUnpublishToken(token, now + UNPUBLISH_LINK_TTL_SECONDS * 1000 - 1000, SECRET).ok).toBe(true);
    expect(readUnpublishToken(token, now + UNPUBLISH_LINK_TTL_SECONDS * 1000 + 1000, SECRET)).toEqual({ ok: false, reason: 'expired' });
    expect(signUnpublishToken(PUB, null)).toBeNull();
    expect(readUnpublishToken(token, now, null)).toEqual({ ok: false, reason: 'disabled' });

    const reading = readUnpublishToken(token, now, SECRET);
    if (!reading.ok) throw new Error('expected a valid reading');
    expect(isTokenCurrent(reading, { published: true, published_at: PUBLISHED_AT, publish_nonce: NONCE })).toBe(true);
    expect(isTokenCurrent(reading, { published: false, published_at: PUBLISHED_AT, publish_nonce: NONCE })).toBe(false);
    expect(isTokenCurrent(reading, { published: true, published_at: '2026-10-31T09:00:00+00:00', publish_nonce: NONCE })).toBe(false);
    expect(isTokenCurrent(reading, { published: true, published_at: PUBLISHED_AT, publish_nonce: null })).toBe(false);
  });

  test('SEC2: the signature is compared with timingSafeEqual', () => {
    expect(read('src/lib/articles/unpublishToken.ts')).toMatch(/timingSafeEqual\(given, expected\)/);
  });
});

test.describe('TG: Telegram messages and the outgoing request (fetch mocked)', () => {
  const realFetch = globalThis.fetch;
  const saved: Record<string, string | undefined> = {};
  const KEYS = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'INTERNAL_WEBHOOK_SECRET'];
  let calls: Array<{ url: string; body: Record<string, unknown> }> = [];

  test.beforeEach(() => {
    for (const k of KEYS) saved[k] = process.env[k];
    calls = [];
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? '{}')) });
      return new Response('{"ok":true}', { status: 200 });
    }) as typeof fetch;
  });
  test.afterEach(() => {
    globalThis.fetch = realFetch;
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  test('TG1: the publish message carries the title, the URL and the signed unpublish link', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
    process.env.TELEGRAM_CHAT_ID = '4242';
    process.env.INTERNAL_WEBHOOK_SECRET = SECRET;
    const live = { id: POST_ID, title: 'Cabinets <fast> & clean', slug: 'cabinets-fast', published_at: PUBLISHED_AT, publish_nonce: NONCE };
    const out = await announcePublished('https://www.lavacagc.com', live);
    expect(out.telegram).toBe('sent');
    const token = signUnpublishToken(PUB, SECRET)!;
    expect(out.unpublishUrl).toBe(`https://www.lavacagc.com/articles/unpublish/${token}`);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.telegram.org/bottest-bot-token/sendMessage');
    expect(calls[0].body).toMatchObject({ chat_id: '4242', parse_mode: 'HTML', disable_web_page_preview: true });
    expect(calls[0].body.text).toBe(
      'New article published: Cabinets &lt;fast&gt; &amp; clean https://www.lavacagc.com/blog/cabinets-fast\n' +
      `Unpublish: https://www.lavacagc.com/articles/unpublish/${token}`,
    );
  });

  test('PG2: the held message names the post, the admin link and the first three reasons', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
    process.env.TELEGRAM_CHAT_ID = '4242';
    const reasons = ['Price claim: "from $9,000" in paragraph 4', 'Legal claim: "insured" in paragraph 2 ("We are insured.")', 'No H2 section heading ("## ..."); add at least one.', 'Fourth', 'Fifth'];
    expect(await announceHeld('https://www.lavacagc.com', { id: POST_ID, title: 'Kitchen costs' }, reasons)).toBe('sent');
    expect(calls[0].body.text).toBe([
      `Article held for review: Kitchen costs https://www.lavacagc.com/vaca-mgmt?tab=blog&amp;post=${POST_ID}`,
      '- Price claim: "from $9,000" in paragraph 4',
      '- Legal claim: "insured" in paragraph 2 ("We are insured.")',
      '- No H2 section heading ("## ..."); add at least one.',
      '(2 more in the admin)',
    ].join('\n'));
    expect(heldMessage({ title: 'T', adminUrl: 'https://x/a', reasons: ['one'] })).toBe('Article held for review: T https://x/a\n- one');
  });

  test('TG4: not configured sends nothing and says not_configured; no secret means no link, said plainly', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    process.env.INTERNAL_WEBHOOK_SECRET = SECRET;
    const out = await announcePublished('https://www.lavacagc.com', { id: POST_ID, title: 'T', slug: 't', published_at: PUBLISHED_AT, publish_nonce: NONCE });
    expect(out.telegram).toBe('not_configured');
    expect(out.unpublishUrl).toMatch(/\/articles\/unpublish\//);
    expect(calls).toHaveLength(0);

    expect(publishedMessage({ title: 'T', url: 'https://x/blog/t', unpublishUrl: null }))
      .toBe('New article published: T https://x/blog/t\nUnpublish: no one-tap link (INTERNAL_WEBHOOK_SECRET is not set); use the admin.');
    expect(unpublishedMessage({ title: 'T', url: 'https://x/blog/t' })).toBe('Article unpublished: T https://x/blog/t');
  });
});

test.describe('TG / SEC2: the unpublish page and its routes (source and render)', () => {
  test('the page has one Unpublish button that POSTs, is noindex, and escapes the title', () => {
    const html = renderUnpublishPage({
      kind: 'confirm', title: 'A <script>alert(1)</script> title', slug: 'a-title',
      postUrl: 'https://x/blog/a-title', action: '/api/articles/unpublish/abc.def',
    });
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).toContain('<form method="post" action="/api/articles/unpublish/abc.def">');
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('<button type="submit">Unpublish</button>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('A &lt;script&gt;alert(1)&lt;/script&gt; title');
    expect(renderUnpublishPage({ kind: 'gone', adminUrl: 'https://x/vaca-mgmt' })).toContain('This link no longer works');
  });

  test('TG3 (source): the GET handler never writes; only the POST unpublishes', () => {
    const page = read('src/app/articles/unpublish/[token]/route.ts');
    expect(page).toMatch(/export async function GET/);
    expect(page).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    expect(page).not.toMatch(/unpublishArticle|supabaseRest\(\s*'PATCH'/);
    const api = read('src/app/api/articles/unpublish/[token]/route.ts');
    expect(api).toMatch(/export async function POST/);
    expect(api).not.toMatch(/export async function GET/);
    expect(api).toContain('checkRateLimit(');
    expect(api).toContain('unpublishArticle(post)');
  });

  test('SEC2: excluded from analytics, private-page widgets, robots and the bot filter, like /offer', () => {
    expect(isAnalyticsExcluded('/articles/unpublish/abc.def')).toBe(true);
    expect(isPrivateTokenPage('/articles/unpublish/abc.def')).toBe(true);
    expect(read('src/app/robots.ts')).toContain("'/articles/'");
    const mw = read('src/middleware.ts');
    expect(mw).toContain("const BOT_FILTER_EXEMPT_PREFIXES = ['/articles/unpublish/', '/api/articles/unpublish/'];");
    expect(mw).toContain('!isBotFilterExempt(pathname)');
    // Public under the existing article prefix, and nowhere in the admin-session list.
    expect(mw).toContain("'/api/articles/',");
  });

  test('SEC4 (source): only the admin-session route can override a hold', () => {
    const admin = read('src/app/api/admin/articles/[id]/publish/route.ts');
    expect(admin).toContain('await adminUserId(request)');
    expect(admin).toContain('override: { by: userId, reasons: verdict.reasons }');
    for (const file of ['src/app/api/articles/ingest/[id]/publish/route.ts', 'src/app/api/articles/ingest/[id]/route.ts', 'src/app/api/articles/ingest/route.ts']) {
      expect(read(file), file).not.toMatch(/override/);
    }
    expect(read('src/lib/articles/schemas.ts')).not.toMatch(/review_hold|override/);
  });

  test('the guard runs on every publish path: Claude, the admin editor and list, the cron', () => {
    const route = read('src/app/api/articles/ingest/[id]/publish/route.ts');
    // Slice F's fact-lock refusal (422) runs first, then the guard on every call.
    expect(route.indexOf('validateDraft(draftMarkdownFor(candidate), contentFacts)')).toBeGreaterThan(0);
    expect(route.indexOf('validateDraft(draftMarkdownFor(candidate), contentFacts)')).toBeLessThan(route.indexOf('runPublishGuard(candidate, contentFacts)'));
    expect(route).not.toContain('PUBLISH_GUARD_IS_STUB');
    expect(read('src/app/api/admin/articles/[id]/publish/route.ts')).toContain('runPublishGuard(post)');
    expect(read('src/app/api/cron/publish/route.ts')).toContain('runPublishGuard(full)');
    expect(read('src/components/admin/BlogPostEditor.tsx')).toContain('adminPublishArticle(id');
    expect(read('src/components/admin/BlogPostList.tsx')).toContain('adminPublishArticle(id)');
    // Neither browser component flips a draft live by itself any more.
    expect(read('src/components/admin/BlogPostList.tsx')).not.toMatch(/published: true, published_at/);
    expect(read('src/components/admin/BlogPostEditor.tsx')).not.toMatch(/published_at: new Date/);
  });

  test('the claim facts migration seeds unlocked placeholders and the override column', () => {
    const sql = read('supabase/migrations/20261030000002_content_facts_claims.sql');
    expect(sql).toMatch(/'claim_license',\s*'PLACEHOLDER/);
    expect(sql).toMatch(/'claim_insurance',\s*'PLACEHOLDER/);
    expect(sql).toMatch(/'placeholder', false\)/);
    expect(sql).toContain('ON CONFLICT (key) DO NOTHING');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS review_override jsonb');
  });
});

// ---------------------------------------------------------------------------
// SK - the Claude Code skill
// ---------------------------------------------------------------------------

test.describe('SK: the articles skill', () => {
  const skill = '.claude/skills/articles/SKILL.md';

  test('SK1: SKILL.md exists with its two references and is under 120 lines', () => {
    const text = read(skill);
    expect(text.split('\n').length).toBeLessThan(120);
    expect(text).toMatch(/^---\nname: articles\ndescription: .+\n---/);
    expect(text).toContain('(references/grill.md)');
    expect(text).toContain('(references/aeo-local-seo.md)');
    expect(existsSync(join(root, '.claude/skills/articles/references/grill.md'))).toBe(true);
    expect(existsSync(join(root, '.claude/skills/articles/references/aeo-local-seo.md'))).toBe(true);
    // Every step has its command, through the CLI alone.
    for (const cmd of ['feedback --summary', 'ingest-article.mjs create', 'ingest-article.mjs patch', 'ingest-article.mjs publish']) {
      expect(text, cmd).toContain(cmd);
    }
    expect(text).toMatch(/Exit 2/);
  });

  test('SK3: the grill checklist names its sources', () => {
    const grill = read('.claude/skills/articles/references/grill.md');
    for (const source of ['content_facts', 'COUNTIES', 'service_area', '/api/articles/seo-feedback', 'phone_main', 'hic_number', 'claim_']) {
      expect(grill, source).toContain(source);
    }
    expect(grill).toMatch(/grade 8 or below/);
  });

  test('SEO3: the local-SEO checklist requires a town, a county and the service-area sentence', () => {
    const aeo = read('.claude/skills/articles/references/aeo-local-seo.md');
    expect(aeo).toMatch(/At least one town and one county, the county from `counties`/);
    expect(aeo).toContain('`service_area` fact sentence');
  });
});

// ---------------------------------------------------------------------------
// Live backend
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

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin-g@local.test';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'LocalAdmin!2026';
const RUN = Date.now().toString(36);
const PREFIX = `slice-g-${RUN}`;

test.describe('publish guard and one-tap unpublish (live backend)', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);
  test.use({ bypassCSP: true });

  const env = localEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SECRET_KEY;
  const token = env.PROJECT_INGEST_TOKEN;
  const cronSecret = env.CRON_SECRET;
  const secret = env.INTERNAL_WEBHOOK_SECRET;
  const service = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  /**
   * This run's own client IP (198.18.0.0/15, the benchmarking range), sent on
   * every call that is rate limited, so the buckets `articles:<ip>` and
   * `article-unpublish:<ip>` are ours alone and cleanup touches nothing else
   * on the shared rig (slice G review, fix 4).
   */
  const octet = () => Math.floor(Math.random() * 254) + 1;
  const ip = `198.18.${octet()}.${octet()}`;
  const auth = { Authorization: `Bearer ${token}`, 'cf-connecting-ip': ip };
  const asClient = { 'cf-connecting-ip': ip };

  async function rest<T = unknown>(request: APIRequestContext, method: string, path: string, data?: unknown): Promise<T> {
    const res = await request.fetch(`${supabaseUrl}/rest/v1/${path}`, {
      method,
      headers: { ...service, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      data,
    });
    expect(res.ok(), `${method} ${path}: ${await res.text()}`).toBe(true);
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  async function clearRateLimits(request: APIRequestContext) {
    // Only this run's two buckets; never a wildcard.
    const own = [`"articles:${ip}"`, `"article-unpublish:${ip}"`].join(',');
    await request.delete(`${supabaseUrl}/rest/v1/rate_limits?ip_address=in.(${encodeURIComponent(own)})`, { headers: service });
  }

  async function signIn(page: Page) {
    await page.goto('/auth');
    await page.locator('#signin-email').fill(ADMIN_EMAIL);
    await page.locator('#signin-password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await page.waitForURL(/\/vaca-mgmt/, { timeout: 60_000 });
  }

  async function create(request: APIRequestContext, title: string, content: string, extra: Record<string, unknown> = {}) {
    const res = await request.post('/api/articles/ingest', { headers: auth, data: { title: `${PREFIX} ${title}`, content, category: 'Home Services', ...extra } });
    expect(res.status(), await res.text()).toBe(201);
    return res.json() as Promise<{ id: string; slug: string; adminUrl: string }>;
  }

  const body = (...middle: string[]) => article(...middle).content;
  const row = async (request: APIRequestContext, id: string) =>
    (await rest<Array<Record<string, unknown>>>(request, 'GET', `blog_posts?select=published,published_at,publish_nonce,review_hold,review_override,content,scheduled_publish_at&id=eq.${id}`))[0];
  const status = async (request: APIRequestContext, path: string) => (await request.get(path, { maxRedirects: 0 })).status();
  const localPath = (url: string) => url.replace(/^https?:\/\/[^/]+/, '');

  let adminId = '';

  test.beforeAll(async ({ request }) => {
    test.skip(!supabaseUrl || !serviceKey || !token || !cronSecret || !secret,
      'Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, PROJECT_INGEST_TOKEN, CRON_SECRET and INTERNAL_WEBHOOK_SECRET in .env.local');
    const res = await request.post(`${supabaseUrl}/auth/v1/admin/users`, {
      headers: { ...service, 'Content-Type': 'application/json' },
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, email_confirm: true },
    });
    expect([200, 201, 422]).toContain(res.status());
    const users = await (await request.get(`${supabaseUrl}/auth/v1/admin/users?per_page=200`, { headers: service })).json();
    adminId = (users.users as Array<{ id: string; email: string }>).find((u) => u.email === ADMIN_EMAIL)!.id;
    await clearRateLimits(request);
  });

  test.beforeEach(async ({ request }) => {
    if (supabaseUrl && serviceKey) await clearRateLimits(request);
  });

  test.afterAll(async ({ request }) => {
    if (!supabaseUrl || !serviceKey) return;
    await request.delete(`${supabaseUrl}/rest/v1/blog_posts?slug=like.${encodeURIComponent(`${PREFIX}*`)}`, { headers: service });
    await clearRateLimits(request);
  });

  let heldId = '';
  let heldSlug = '';
  let heldAdminUrl = '';

  test('PG2: a Claude publish with a price claim is a 409 with the reasons; the post stays a draft with review_hold; Telegram is reported', async ({ request }) => {
    const post = await create(request, 'Kitchen Prices', body('Most kitchens run from $9,000 for a refresh.'));
    heldId = post.id;
    heldSlug = post.slug;
    const res = await request.post(`/api/articles/ingest/${post.id}/publish`, { headers: auth });
    expect(res.status()).toBe(409);
    const out = await res.json();
    expect(out).toMatchObject({ published: false, hold: ['Price claim: "from $9,000" in paragraph 3'], telegram: 'not_configured' });
    expect(out.adminUrl).toMatch(new RegExp(`/vaca-mgmt\\?tab=blog&post=${post.id}$`));
    heldAdminUrl = out.adminUrl;

    const r = await row(request, post.id);
    expect(r.published).toBe(false);
    expect((r.review_hold as { reasons: string[] }).reasons).toEqual(['Price claim: "from $9,000" in paragraph 3']);
    expect(await status(request, `/blog/${post.slug}`)).toBe(404);
  });

  test('SEC4: the ingest token cannot clear a hold: no override field, and no way into the admin route', async ({ request }) => {
    const again = await request.post(`/api/articles/ingest/${heldId}/publish`, { headers: auth, data: { override: true } });
    expect(again.status()).toBe(400);
    const admin = await request.post(`/api/admin/articles/${heldId}/publish`, { headers: auth, data: { override: true } });
    expect(admin.status()).toBe(401);
    const patch = await request.patch(`/api/articles/ingest/${heldId}`, { headers: auth, data: { review_hold: null } });
    expect(patch.status()).toBe(400);
    const r = await row(request, heldId);
    expect(r.published).toBe(false);
    expect(r.review_hold).not.toBeNull();
  });

  test('SEC4: a held post stays held on a token re-publish until its content passes; then the passing publish clears the hold', async ({ request }) => {
    const post = await create(request, 'Fix Then Publish', body('Every job is code compliant when we leave.'));
    expect((await request.post(`/api/articles/ingest/${post.id}/publish`, { headers: auth })).status()).toBe(409);
    // Unchanged content: refused again, still held, still a draft.
    const again = await request.post(`/api/articles/ingest/${post.id}/publish`, { headers: auth });
    expect(again.status()).toBe(409);
    expect((await again.json()).hold[0]).toContain('Legal claim: "code compliant"');
    let r = await row(request, post.id);
    expect(r.published).toBe(false);
    expect(r.review_hold).not.toBeNull();
    // A patch of a draft does not touch the hold; only the passing publish clears it.
    expect((await request.patch(`/api/articles/ingest/${post.id}`, { headers: auth, data: { content: body() } })).status()).toBe(200);
    expect((await row(request, post.id)).review_hold).not.toBeNull();
    const fixed = await request.post(`/api/articles/ingest/${post.id}/publish`, { headers: auth });
    expect(fixed.status(), await fixed.text()).toBe(200);
    r = await row(request, post.id);
    expect(r).toMatchObject({ published: true, review_hold: null, review_override: null });
    await request.post(`/api/articles/ingest/${post.id}/unpublish`, { headers: auth });
  });

  test('a refresh draft (action_id) is fact-locked with the draft applied (422) before the guard; a claim in it is held (409); the live post stays as it was', async ({ request }) => {
    const live = await create(request, 'Refresh Target', body());
    expect((await request.post(`/api/articles/ingest/${live.id}/publish`, { headers: auth })).status()).toBe(200);
    const actionIds: string[] = [];
    try {
      const [action] = await rest<Array<{ id: string }>>(request, 'POST', 'content_actions', [{
        action_type: 'refresh', target_post_id: live.id, target_query: `${PREFIX} refresh target`, status: 'approved',
      }]);
      actionIds.push(action.id);
      // One internal link only, and a wrong phone: the fact-lock refuses the draft.
      const thin = `${OPENING}\n\n## What changed\n\nCall 555-123-4567 or see [the process](/process).`;
      expect((await request.patch(`/api/articles/ingest/${live.id}`, { headers: auth, data: { content: thin, action_id: action.id } })).status()).toBe(200);
      const pub = await request.post(`/api/articles/ingest/${live.id}/publish`, { headers: auth, data: { action_id: action.id } });
      expect(pub.status()).toBe(422);
      expect((await pub.json()).issues).toEqual(expect.arrayContaining([
        'Only 1 internal link(s); needs at least 3.',
        'Unrecognized phone number "555-123-4567" (locked: (201) 212-4917).',
      ]));
      let r = await row(request, live.id);
      expect(r).toMatchObject({ published: true, content: body(), review_hold: null });

      // A second refresh that passes the fact-lock but makes a claim: the guard holds it.
      const [claim] = await rest<Array<{ id: string }>>(request, 'POST', 'content_actions', [{
        action_type: 'refresh', target_post_id: live.id, target_query: `${PREFIX} refresh claim`, status: 'approved',
      }]);
      actionIds.push(claim.id);
      expect((await request.patch(`/api/articles/ingest/${live.id}`, { headers: auth, data: { content: body('Every job comes with a warranty on labor.'), action_id: claim.id } })).status()).toBe(200);
      const held = await request.post(`/api/articles/ingest/${live.id}/publish`, { headers: auth, data: { action_id: claim.id } });
      expect(held.status()).toBe(409);
      expect((await held.json()).hold[0]).toContain('Legal claim: "warranty" in paragraph 3');
      r = await row(request, live.id);
      expect(r.published).toBe(true);
      expect(r.content).toBe(body());
      const [a] = await rest<Array<{ status: string }>>(request, 'GET', `content_actions?select=status&id=eq.${claim.id}`);
      expect(a.status).toBe('drafted');
    } finally {
      for (const id of actionIds) await rest(request, 'DELETE', `content_actions?id=eq.${id}`);
      await request.post(`/api/articles/ingest/${live.id}/unpublish`, { headers: auth });
    }
  });

  test('PG3: the editor shows the hold reasons, and "Publish anyway" publishes and clears the hold with the admin id', async ({ page, request }) => {
    await signIn(page);
    await page.goto(localPath(heldAdminUrl));
    const panel = page.getByTestId('review-hold');
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(panel.getByTestId('review-hold-reasons')).toHaveText('Price claim: "from $9,000" in paragraph 3');
    await page.screenshot({ path: `test-results/slice-g-hold-panel-${RUN}.png`, fullPage: false });

    const published = page.waitForResponse((r) => r.url().endsWith(`/api/admin/articles/${heldId}/publish`));
    await panel.getByRole('button', { name: 'Publish anyway' }).click();
    const res = await published;
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ published: true, overridden: true, slug: heldSlug });
    // Fix 3: Alex sees that his override was recorded; no generic toast replaces it.
    await expect(page.getByText('Published over the review hold; your override is recorded.')).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.getByText('Published over the review hold; your override is recorded.')).toBeVisible();
    await expect(page.getByText('Blog post saved successfully!')).toHaveCount(0);

    const r = await row(request, heldId);
    expect(r.published).toBe(true);
    expect(r.review_hold).toBeNull();
    expect(r.review_override).toMatchObject({ by: adminId, reasons: ['Price claim: "from $9,000" in paragraph 3'] });
    expect(await status(request, `/blog/${heldSlug}`)).toBe(200);
  });

  test('PG4: the guard holds an admin publish from the editor (reasons inline) and from the list toggle (toast, then the editor)', async ({ page, request }) => {
    const editorPost = await create(request, 'Editor Hold', body('Every job comes with a warranty on labor.'));
    const listPost = await create(request, 'List Hold', body('Book in March and save 20% on the labor.'));
    await signIn(page);

    // The editor: switch Published on and save.
    await page.goto(`/vaca-mgmt?tab=blog&post=${editorPost.id}`);
    await expect(page.locator('#title')).toHaveValue(`${PREFIX} Editor Hold`, { timeout: 30_000 });
    await page.locator('#published').click();
    const held = page.waitForResponse((r) => r.url().endsWith(`/api/admin/articles/${editorPost.id}/publish`));
    await page.getByRole('button', { name: 'Save Post' }).click();
    expect((await held).status()).toBe(409);
    await expect(page.getByTestId('review-hold-reasons')).toContainText('Legal claim: "warranty" in paragraph 3');
    const er = await row(request, editorPost.id);
    expect(er.published).toBe(false);
    expect((er.review_hold as { reasons: string[] }).reasons[0]).toContain('Legal claim: "warranty"');

    // The list: Publish on the row gives a toast and opens the editor.
    await page.goto('/vaca-mgmt?tab=blog');
    const listRow = page.getByRole('row').filter({ hasText: `${PREFIX} List Hold` });
    await expect(listRow).toBeVisible({ timeout: 30_000 });
    const listHeld = page.waitForResponse((r) => r.url().endsWith(`/api/admin/articles/${listPost.id}/publish`));
    await listRow.getByTitle('Publish', { exact: true }).click();
    expect((await listHeld).status()).toBe(409);
    await expect(page.getByText('Held for review').first()).toBeVisible();
    await expect(page.locator('#title')).toHaveValue(`${PREFIX} List Hold`, { timeout: 30_000 });
    await expect(page.getByTestId('review-hold-reasons')).toContainText('Price claim: "save 20%" in paragraph 3');
    expect((await row(request, listPost.id)).published).toBe(false);

    // The editor still publishes a clean post with no override.
    const clean = await create(request, 'Editor Clean', body());
    await page.goto(`/vaca-mgmt?tab=blog&post=${clean.id}`);
    await expect(page.locator('#title')).toHaveValue(`${PREFIX} Editor Clean`, { timeout: 30_000 });
    await page.locator('#published').click();
    const ok = page.waitForResponse((r) => r.url().endsWith(`/api/admin/articles/${clean.id}/publish`));
    await page.getByRole('button', { name: 'Save Post' }).click();
    const okRes = await ok;
    expect(okRes.status()).toBe(200);
    expect(await okRes.json()).toMatchObject({ published: true, overridden: false });
    expect((await row(request, clean.id)).review_override).toBeNull();
  });

  let liveId = '';
  let liveSlug = '';
  let liveLink = '';

  test('PG5 + TG4: a clean post publishes; Telegram not configured is reported and does not block it', async ({ request }) => {
    const post = await create(request, 'Clean Timeline', body('Call (201) 212-4917 to book a visit; we answer the same day.'));
    const res = await request.post(`/api/articles/ingest/${post.id}/publish`, { headers: auth });
    expect(res.status(), await res.text()).toBe(200);
    const out = await res.json();
    expect(out).toMatchObject({ published: true, id: post.id, telegram: 'not_configured' });
    liveId = post.id;
    liveSlug = post.slug;
    liveLink = out.unpublish_url;

    const r = await row(request, post.id);
    expect(r.published).toBe(true);
    // The link is the one the Telegram carries: signed for this id and this published_at.
    const expected = unpublishLink(new URL(out.url).origin, signUnpublishToken({ id: post.id, published_at: r.published_at as string, publish_nonce: r.publish_nonce as string }, secret)!);
    expect(liveLink).toBe(expected);
    expect(await status(request, `/blog/${post.slug}`)).toBe(200);
    // Warm the cached copies, so on a production build TG1 proves the one-tap unpublish revalidates them.
    expect(await (await request.get('/blog')).text()).toContain(post.slug);
    expect(await (await request.get('/sitemap.xml')).text()).toContain(`/blog/${post.slug}<`);
  });

  test('TG3: a GET to the link never unpublishes (fetched twice, still live)', async ({ request }) => {
    for (let i = 0; i < 2; i += 1) {
      const res = await request.get(localPath(liveLink));
      expect(res.status()).toBe(200);
      expect(res.headers()['x-robots-tag']).toBe('noindex, nofollow');
      expect(res.headers()['cache-control']).toContain('no-store');
      expect(await res.text()).toContain(`${PREFIX} Clean Timeline`);
    }
    expect((await row(request, liveId)).published).toBe(true);
    // SEC2: the bot filter does not stand between the owner and the link.
    expect((await request.get(localPath(liveLink), { headers: { 'User-Agent': 'curl/8.4.0' } })).status()).toBe(200);
    expect((await request.get('/blog', { headers: { 'User-Agent': 'curl/8.4.0' } })).status()).toBe(403);
  });

  test('TG1: opening the link renders the one-button page; the button unpublishes and the page says so', async ({ page, request }) => {
    // The button's POST is rate limited by IP: send this run's IP so the bucket is ours.
    await page.setExtraHTTPHeaders(asClient);
    await page.goto(localPath(liveLink));
    await expect(page.getByRole('heading', { name: 'Unpublish this article?' })).toBeVisible();
    await expect(page.getByTestId('unpublish-title')).toHaveText(`${PREFIX} Clean Timeline`);
    await expect(page.getByTestId('unpublish-slug')).toHaveText(liveSlug);
    await expect(page.getByRole('button')).toHaveCount(1);
    expect(await page.locator('meta[name="robots"]').getAttribute('content')).toBe('noindex, nofollow');
    await page.screenshot({ path: `test-results/slice-g-unpublish-page-${RUN}.png` });

    await page.getByRole('button', { name: 'Unpublish' }).click();
    await expect(page.getByTestId('unpublish-done')).toHaveText('Unpublished');
    await page.screenshot({ path: `test-results/slice-g-unpublished-${RUN}.png` });
    expect((await row(request, liveId)).published).toBe(false);
    expect(await status(request, `/blog/${liveSlug}`)).toBe(404);
    expect(await (await request.get('/blog')).text()).not.toContain(liveSlug);
    expect(await (await request.get('/sitemap.xml')).text()).not.toContain(`/blog/${liveSlug}<`);
  });

  test('TG2: a used, tampered, expired or superseded link renders 410 and changes nothing', async ({ request }) => {
    // Used: the post is down now.
    expect(await status(request, localPath(liveLink))).toBe(410);
    expect((await request.post(localPath(liveLink).replace('/articles/unpublish/', '/api/articles/unpublish/'), { headers: asClient })).status()).toBe(410);

    // Republished: the old link stays dead, the new one works.
    const again = await (await request.post(`/api/articles/ingest/${liveId}/publish`, { headers: auth })).json();
    expect(again.published).toBe(true);
    expect(again.unpublish_url).not.toBe(liveLink);
    expect(await status(request, localPath(liveLink))).toBe(410);
    expect(await status(request, localPath(again.unpublish_url))).toBe(200);

    // Tampered.
    const tampered = again.unpublish_url.replace(/.$/, (c: string) => (c === 'A' ? 'B' : 'A'));
    expect(await status(request, localPath(tampered))).toBe(410);
    const tamperedPost = await request.post(localPath(tampered).replace('/articles/unpublish/', '/api/articles/unpublish/'), { headers: asClient });
    expect(tamperedPost.status()).toBe(410);
    expect(await tamperedPost.text()).toContain('This link no longer works');

    // Expired: published 8 days ago, and the link for that publication.
    const old = new Date(Date.now() - 8 * 86_400_000).toISOString();
    await rest(request, 'PATCH', `blog_posts?id=eq.${liveId}`, { published_at: old });
    const nonce = (await row(request, liveId)).publish_nonce as string;
    const expired = signUnpublishToken({ id: liveId, published_at: old, publish_nonce: nonce }, secret)!;
    expect(await status(request, `/articles/unpublish/${expired}`)).toBe(410);
    expect((await request.post(`/api/articles/unpublish/${expired}`, { headers: asClient })).status()).toBe(410);

    // None of that changed anything.
    expect((await row(request, liveId)).published).toBe(true);
    expect(await status(request, `/blog/${liveSlug}`)).toBe(200);
    await request.post(`/api/articles/ingest/${liveId}/unpublish`, { headers: auth });
  });

  test('a token PATCH cannot put a claim on a live post; the live post is unchanged', async ({ request }) => {
    const post = await create(request, 'Live Edit', body());
    expect((await request.post(`/api/articles/ingest/${post.id}/publish`, { headers: auth })).status()).toBe(200);
    const before = (await row(request, post.id)).content;
    const res = await request.patch(`/api/articles/ingest/${post.id}`, { headers: auth, data: { content: body('All jobs are fully insured and bonded.') } });
    expect(res.status()).toBe(409);
    const out = await res.json();
    expect(out).toMatchObject({ published: true, changed: false });
    expect(out.hold).toEqual(expect.arrayContaining([expect.stringContaining('Legal claim: "insured"'), expect.stringContaining('Legal claim: "bonded"')]));
    expect((await row(request, post.id)).content).toBe(before);
    await request.post(`/api/articles/ingest/${post.id}/unpublish`, { headers: auth });
  });

  test('SK3: the feedback the skill reads carries the locked facts (never the lead address) and the counties', async ({ request }) => {
    const res = await request.get('/api/articles/seo-feedback', { headers: auth });
    expect(res.status()).toBe(200);
    const fb = await res.json();
    const keys = (fb.facts as Array<{ key: string }>).map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(['hic_number', 'phone_main', 'service_area', 'current_year']));
    expect(keys).not.toContain('email_leads');
    // The placeholders are unlocked, so they are not offered as quotable.
    expect(keys).not.toContain('claim_license');
    expect(fb.counties).toEqual(['Essex', 'Morris', 'Bergen', 'Union']);
  });

  test('a price edited in Services & Prices is the price the guard allows on the next publish', async ({ page, request }) => {
    await signIn(page);
    const [seed] = await rest<Array<{ price_display_en: string; price_display_es: string; starting_price_cents: number }>>(
      request, 'GET', 'home_services?select=price_display_en,price_display_es,starting_price_cents&slug=eq.cabinet-repainting');
    const edit = (data: Record<string, unknown>) => page.request.patch('/api/admin/home-services/cabinet-repainting', { data });
    const newPost = async (amount: string) => create(request, `Catalog ${amount.replace(/\D/g, '')}`, body(`Cabinet repainting starts at ${amount} for a standard kitchen.`));
    const publish = async (id: string) => request.post(`/api/articles/ingest/${id}/publish`, { headers: auth });
    try {
      const before = await newPost('$2,195');
      expect((await publish(before.id)).status()).toBe(409);

      expect((await edit({ price_display_en: '$2,195', price_display_es: '$2,195', starting_price_cents: 219500 })).status()).toBe(200);
      const after = await newPost('$2,195');
      expect((await publish(after.id)).status()).toBe(200);
      // The old price is no longer the published one.
      const old = await newPost(seed.price_display_en);
      const held = await publish(old.id);
      expect(held.status()).toBe(409);
      expect((await held.json()).hold).toEqual([`Price claim: "starts at ${seed.price_display_en}" in paragraph 3`]);
      await request.post(`/api/articles/ingest/${after.id}/unpublish`, { headers: auth });
    } finally {
      expect((await edit(seed)).status()).toBe(200);
    }
  });

  test('the publish cron runs the guard: a held post stays a draft with its schedule cleared, a clean one goes live', async ({ request }) => {
    const bad = await create(request, 'Cron Held', body('Old tile can hide asbestos under it.'));
    const good = await create(request, 'Cron Clean', body());
    const due = new Date(Date.now() - 60_000).toISOString();
    await rest(request, 'PATCH', `blog_posts?id=in.(${bad.id},${good.id})`, { scheduled_publish_at: due });
    const res = await request.get('/api/cron/publish', { headers: { Authorization: `Bearer ${cronSecret}` } });
    expect(res.status(), await res.text()).toBe(200);
    const out = await res.json();
    expect(out.published).toContain(`${PREFIX} Cron Clean`);
    expect(out.held).toEqual(expect.arrayContaining([expect.objectContaining({ title: `${PREFIX} Cron Held` })]));

    const b = await row(request, bad.id);
    expect(b).toMatchObject({ published: false, scheduled_publish_at: null });
    expect((b.review_hold as { reasons: string[] }).reasons[0]).toContain('Legal claim: "asbestos"');
    expect((await row(request, good.id)).published).toBe(true);
    expect(await status(request, `/blog/${good.slug}`)).toBe(200);
    await request.post(`/api/articles/ingest/${good.id}/unpublish`, { headers: auth });
  });
});
