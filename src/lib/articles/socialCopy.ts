/**
 * Social copy written by the articles skill at publish time (decision 006,
 * Q22). It replaces the retired Supabase function's "post published" email,
 * whose point was ready-made copy for Instagram, Facebook, Google Business,
 * X and Threads. After the publish, scripts/postiz-drafts.mjs queues the
 * text posts as Postiz drafts for Alex to approve (it reads this same file).
 *
 * The skill saves the copy as docs/social/<slug>.md and passes the file to
 * `ingest-article.mjs publish --social <file>`; the publish route parses and
 * checks it BEFORE anything is written, and the Instagram caption rides in
 * the "New article published" Telegram. The checks are the article's own
 * price and legal rules (`claimReasons` in publishGuard.ts) plus the
 * platforms' length limits, so nothing reaches Alex's phone that the guard
 * would hold on the site.
 *
 * File shape (headings matched case-insensitively):
 *
 *   # Social copy: <article title>
 *
 *   Article: https://www.lavacagc.com/blog/<slug>
 *   Date: 2026-10-30
 *
 *   ## Instagram and Facebook
 *   <caption, up to 2,200 characters>
 *
 *   ## Google Business
 *   <post, up to 1,500 characters>
 *
 *   ## X
 *   <post, up to 280 characters>
 *
 *   ## Threads
 *   <post, up to 500 characters, at most one hashtag, no "link in bio">
 *
 *   ## Hashtags
 *   #one #two #three
 *
 * Google Business is a search surface, not a feed: no hashtags and no emoji.
 *
 * Pure: tests/articles-social-copy.spec.ts.
 */
import { claimReasons, type PublishFacts } from './publishGuard';

export const SOCIAL_LIMITS = { instagram: 2200, google: 1500, x: 280, threads: 500 } as const;
/** Threads is text-first: at most one hashtag, never a hashtag wall. */
export const THREADS_HASHTAGS_MAX = 1;
export const HASHTAGS_MIN = 3;
export const HASHTAGS_MAX = 5;
/** The largest social file the publish route accepts. */
export const SOCIAL_MARKDOWN_MAX = 16 * 1024;

export interface SocialCopy {
  articleUrl: string | null;
  date: string | null;
  instagram: string;
  google: string;
  x: string;
  threads: string;
  hashtags: string[];
}

type Section = 'instagram' | 'google' | 'x' | 'threads' | 'hashtags';

function sectionOf(heading: string): Section | null {
  const h = heading.toLowerCase();
  if (/instagram|facebook/.test(h)) return 'instagram';
  if (/google/.test(h)) return 'google';
  if (/hashtag/.test(h)) return 'hashtags';
  if (/threads/.test(h)) return 'threads';
  if (/^x\b|twitter/.test(h.trim())) return 'x';
  return null;
}

/** Read docs/social/<slug>.md. Unknown sections are ignored; missing ones come back empty. */
export function parseSocialMarkdown(markdown: string): SocialCopy {
  const text = markdown.replace(/\r\n?/g, '\n');
  const sections: Record<Section, string[]> = { instagram: [], google: [], x: [], threads: [], hashtags: [] };
  let current: Section | null = null;
  for (const line of text.split('\n')) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      current = sectionOf(heading[1]);
      continue;
    }
    if (/^#\s/.test(line)) {
      current = null;
      continue;
    }
    if (current) sections[current].push(line);
  }
  const body = (s: Section) => sections[s].join('\n').trim();
  return {
    articleUrl: /^Article:\s*(\S+)\s*$/im.exec(text)?.[1] ?? null,
    date: /^Date:\s*(\d{4}-\d{2}-\d{2})\s*$/im.exec(text)?.[1] ?? null,
    instagram: body('instagram'),
    google: body('google'),
    x: body('x'),
    threads: body('threads'),
    hashtags: body('hashtags').split(/\s+/).filter(Boolean),
  };
}

/** La Vaca's own hosts; the caller adds the site origin it runs on (the local rig). */
const SITE_HOSTS = ['www.lavacagc.com', 'lavacagc.com'];
const SERVICE_PATH = /^\/(?:home-services\/[a-z0-9-]+|services\/[a-z0-9-]+|free-estimate)\/?$/i;

function hostsFor(siteOrigin?: string): string[] {
  const hosts = [...SITE_HOSTS];
  try {
    if (siteOrigin) hosts.push(new URL(siteOrigin).host.toLowerCase());
  } catch {
    // An unparsable origin adds nothing.
  }
  return hosts;
}

/** A call to a La Vaca service page: a site URL, or a bare path, to a service or the estimate form. */
function hasServiceCall(text: string, hosts: string[]): boolean {
  for (const m of text.matchAll(/https?:\/\/[^\s<>"')]+/gi)) {
    try {
      const url = new URL(m[0].replace(/[.,;:!?]+$/, ''));
      if (hosts.includes(url.host.toLowerCase()) && SERVICE_PATH.test(url.pathname)) return true;
    } catch {
      // Not a URL; keep looking.
    }
  }
  return /(?:^|\s)\/(?:home-services\/[a-z0-9-]+|services\/[a-z0-9-]+|free-estimate)\b/i.test(text);
}

/**
 * A hashtag as words: "#FullyInsured" -> "Fully Insured", "#Save20" -> "Save 20",
 * "#NJHomes" -> "NJ Homes". A hashtag is one token to the eye but says the
 * same thing as the words, so the claim rules read the words (Q22 review, fix 2).
 */
export function hashtagWords(tag: string): string {
  return tag
    .replace(/^#/, '')
    .replace(/_/g, ' ')
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')
    .replace(/(\p{L})(\p{N})/gu, '$1 $2')
    .replace(/(\p{N})(\p{L})/gu, '$1 $2');
}

/**
 * A hashtag in ONE case ("#fullyinsured", "#LICENSEDANDINSURED") cannot be
 * split into words, so it is searched for these as substrings instead
 * (Q22 re-review follow-up). Deliberately broad: a false hold on a social
 * hashtag costs one rewrite, a missed one puts a legal or price claim in
 * front of every follower. A hashtag with case changes ("#GutterCleaning")
 * is split into words and read by the ordinary rules, so it is not searched.
 */
export const ONE_CASE_HASHTAG_CLAIMS = [
  'insured', 'insurance', 'warrant', 'guarant', 'licensed', 'bonded', 'permit', 'code', 'liability', 'lawsuit',
  'legal', 'asbestos', 'leadsafe', 'moldremediation',
  'save', 'saving', 'off', 'discount', 'deal', 'free', 'half', 'percent', 'sale', 'cheaper', 'rebate', 'dollar', 'usd',
] as const;

/** A number in a one-case hashtag is a price ("#gutters199", "#20off", "#2k"), unless it is a year ("#fall2026"). */
const ONE_CASE_PRICE_DIGITS = /\d/;
const ONE_CASE_YEAR_ONLY = /^[a-z]*(?:19|20)\d\d[a-z]*$/;

/** The claim a one-case hashtag hides, or null. */
export function oneCaseHashtagClaim(tag: string): string | null {
  const body = tag.replace(/^#/, '');
  const letters = body.replace(/[^\p{L}]/gu, '');
  const oneCase = letters === letters.toLowerCase() || letters === letters.toUpperCase();
  if (!oneCase) return null;
  const lower = body.toLowerCase();
  const word = ONE_CASE_HASHTAG_CLAIMS.find((w) => lower.includes(w));
  if (word) return word;
  if (ONE_CASE_PRICE_DIGITS.test(lower) && !ONE_CASE_YEAR_ONLY.test(lower)) return 'a number';
  return null;
}

/** Hashtags written inside a post's text (a "#" after a space or at the start, then a letter). */
export function hashtagsIn(text: string): string[] {
  return [...text.matchAll(/(?:^|\s)(#\p{L}[\p{L}\p{N}_]*)/gu)].map((m) => m[1]);
}

const LINK_IN_BIO = /\blinks?\s+in\s+(?:my\s+|our\s+|the\s+)?(?:bio|profile)\b/i;
const EMOJI = /\p{Extended_Pictographic}/u;

/** A discount number in a hashtag ("#Save20", "#20Off"), which prose rules would read as a bare number. */
const HASHTAG_DISCOUNT = /\b(?:save|saving|savings|off|discount|deal|sale|cheaper)\s+\d|\d+\s+(?:off|percent|discount)\b/i;

/**
 * Every reason this copy may not go out, as plain sentences; empty means it
 * passes. `slug` is the article the copy belongs to.
 */
export function checkSocialCopy(copy: SocialCopy, slug: string, facts: PublishFacts, siteOrigin?: string): string[] {
  const hosts = hostsFor(siteOrigin);
  const reasons: string[] = [];
  const named: Array<[Section, string, string]> = [
    ['instagram', 'the Instagram caption', copy.instagram],
    ['google', 'the Google Business post', copy.google],
    ['x', 'the X post', copy.x],
    ['threads', 'the Threads post', copy.threads],
  ];

  let articleOk = false;
  try {
    const url = new URL(copy.articleUrl ?? '');
    articleOk = hosts.includes(url.host.toLowerCase()) && url.pathname.replace(/\/$/, '') === `/blog/${slug}`;
  } catch {
    articleOk = false;
  }
  if (!articleOk) reasons.push(`Social copy: the "Article:" line must be this article's URL on the La Vaca site (/blog/${slug}).`);
  if (!copy.date) reasons.push('Social copy: the "Date:" line (YYYY-MM-DD) is missing.');

  for (const [key, where, text] of named) {
    if (!text) {
      reasons.push(`Social copy: ${where} is missing.`);
      continue;
    }
    const limit = SOCIAL_LIMITS[key as keyof typeof SOCIAL_LIMITS];
    if (text.length > limit) reasons.push(`Social copy: ${where} has ${text.length} characters; the limit is ${limit}.`);
  }
  if (copy.instagram && !hasServiceCall(copy.instagram, hosts)) {
    reasons.push('Social copy: the Instagram caption needs a call to a La Vaca service page (https://www.lavacagc.com/home-services/<slug>, /services/<slug> or /free-estimate).');
  }

  const threadsTags = hashtagsIn(copy.threads);
  if (threadsTags.length > THREADS_HASHTAGS_MAX) {
    reasons.push(`Social copy: the Threads post has ${threadsTags.length} hashtags; at most ${THREADS_HASHTAGS_MAX}.`);
  }
  if (LINK_IN_BIO.test(copy.threads)) {
    reasons.push('Social copy: the Threads post says "link in bio"; Threads posts carry their own link, so put the URL in the post.');
  }
  const googleTags = hashtagsIn(copy.google);
  if (googleTags.length > 0) {
    reasons.push(`Social copy: the Google Business post has hashtags (${googleTags.join(' ')}); keep it plain, with none.`);
  }
  if (EMOJI.test(copy.google)) {
    reasons.push('Social copy: the Google Business post has emoji; keep it plain sentences.');
  }

  const n = copy.hashtags.length;
  if (n < HASHTAGS_MIN || n > HASHTAGS_MAX) {
    reasons.push(`Social copy: ${HASHTAGS_MIN} to ${HASHTAGS_MAX} hashtags are needed; there are ${n}.`);
  }
  const bad = copy.hashtags.filter((h) => !/^#[\p{L}\p{N}_]+$/u.test(h));
  if (bad.length > 0) reasons.push(`Social copy: not a hashtag: ${bad.map((h) => `"${h}"`).join(', ')}.`);

  // The article's own price and legal rules, word for word.
  const places = [
    ...named.filter(([, , text]) => text).map(([, where, text]) => ({ where, text })),
    ...(n > 0 ? [{ where: 'the hashtags', text: copy.hashtags.map(hashtagWords).join('. ') }] : []),
    ...(threadsTags.length > 0 ? [{ where: 'the Threads hashtag', text: threadsTags.map(hashtagWords).join('. ') }] : []),
  ];
  for (const reason of claimReasons(places, facts)) reasons.push(`Social copy: ${reason}`);
  for (const tag of [...copy.hashtags, ...threadsTags]) {
    if (HASHTAG_DISCOUNT.test(hashtagWords(tag))) {
      reasons.push(`Social copy: Price claim: "${tag}" in the hashtags`);
      continue;
    }
    const hidden = oneCaseHashtagClaim(tag);
    if (hidden) {
      reasons.push(`Social copy: Claim inside the one-case hashtag "${tag}" (${hidden === 'a number' ? 'a number' : `"${hidden}"`}); use plain topic hashtags such as #GutterCleaning.`);
    }
  }
  return reasons;
}
