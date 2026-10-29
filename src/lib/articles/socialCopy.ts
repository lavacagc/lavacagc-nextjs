/**
 * Social copy written by the articles skill at publish time (decision 006,
 * Q22). It replaces the retired Supabase function's "post published" email,
 * whose point was ready-made copy for Instagram, Facebook, Google Business
 * and X.
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
 *   ## Hashtags
 *   #one #two #three
 *
 * Pure: tests/articles-social-copy.spec.ts.
 */
import { claimReasons, type PublishFacts } from './publishGuard';

export const SOCIAL_LIMITS = { instagram: 2200, google: 1500, x: 280 } as const;
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
  hashtags: string[];
}

type Section = 'instagram' | 'google' | 'x' | 'hashtags';

function sectionOf(heading: string): Section | null {
  const h = heading.toLowerCase();
  if (/instagram|facebook/.test(h)) return 'instagram';
  if (/google/.test(h)) return 'google';
  if (/hashtag/.test(h)) return 'hashtags';
  if (/^x\b|twitter/.test(h.trim())) return 'x';
  return null;
}

/** Read docs/social/<slug>.md. Unknown sections are ignored; missing ones come back empty. */
export function parseSocialMarkdown(markdown: string): SocialCopy {
  const text = markdown.replace(/\r\n?/g, '\n');
  const sections: Record<Section, string[]> = { instagram: [], google: [], x: [], hashtags: [] };
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
    hashtags: body('hashtags').split(/\s+/).filter(Boolean),
  };
}

const SERVICE_CALL = /https?:\/\/\S+|\/home-services\/[a-z0-9-]+|\/services\/[a-z0-9-]+|\/free-estimate/i;

/**
 * Every reason this copy may not go out, as plain sentences; empty means it
 * passes. `slug` is the article the copy belongs to.
 */
export function checkSocialCopy(copy: SocialCopy, slug: string, facts: PublishFacts): string[] {
  const reasons: string[] = [];
  const named: Array<[Section, string, string]> = [
    ['instagram', 'the Instagram caption', copy.instagram],
    ['google', 'the Google Business post', copy.google],
    ['x', 'the X post', copy.x],
  ];

  if (!copy.articleUrl || !new RegExp(`/blog/${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?$`).test(copy.articleUrl)) {
    reasons.push(`Social copy: the "Article:" line must be this article's URL (/blog/${slug}).`);
  }
  if (!copy.date) reasons.push('Social copy: the "Date:" line (YYYY-MM-DD) is missing.');

  for (const [key, where, text] of named) {
    if (!text) {
      reasons.push(`Social copy: ${where} is missing.`);
      continue;
    }
    const limit = SOCIAL_LIMITS[key as keyof typeof SOCIAL_LIMITS];
    if (text.length > limit) reasons.push(`Social copy: ${where} has ${text.length} characters; the limit is ${limit}.`);
  }
  if (copy.instagram && !SERVICE_CALL.test(copy.instagram)) {
    reasons.push('Social copy: the Instagram caption needs a call to the service page (its URL or /home-services/<slug>).');
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
    ...(n > 0 ? [{ where: 'the hashtags', text: copy.hashtags.map((h) => h.replace(/^#/, '')).join(' ') }] : []),
  ];
  for (const reason of claimReasons(places, facts)) reasons.push(`Social copy: ${reason}`);
  return reasons;
}
