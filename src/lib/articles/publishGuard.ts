/**
 * The publish guard (decision 004, Q10): the one check every publish path runs
 * before a post goes live - Claude's publish route, the admin editor and list
 * (through /api/admin/articles/<id>/publish) and the scheduled-publish cron.
 *
 * Contract: docs/phase-2/acceptance-criteria.md, "Publish guard", PG1 to PG5.
 * `checkPublishable(post, facts)` runs, in order:
 *
 *   1. validateDraft (src/lib/seo/draftGuardrails.ts): three internal links,
 *      the locked phone, the locked HIC number. Extended, not replaced.
 *   2. Price claims. Any currency amount, a per-unit price, a price word
 *      followed within 40 characters by a number, or a percentage next to
 *      off / save / discount / cheaper. The ONE exception is a published
 *      price: an amount equal to a catalog `priceDisplay` for a service the
 *      same paragraph names ("Cabinet repainting starts at $2,095").
 *   3. Legal claims. Permits, code, warranty, guarantees, insured, bonded,
 *      liability, lawsuits, legal, ADA, OSHA, lead-safe, EPA, asbestos, mold
 *      remediation. The ONE exception is a locked fact sentence: the value of
 *      a `claim_*` key in content_facts whose `lock` is true, quoted verbatim.
 *      The seeded `claim_license` and `claim_insurance` placeholders are
 *      unlocked until Alex approves their wording, so until then no legal
 *      keyword passes. A license sentence ("Licensed NJ HIC #13VH13373800")
 *      carries no legal keyword, so it passes, and validateDraft locks the
 *      number in it.
 *   4. Shape. The opening is a paragraph of 25 to 70 words with no link
 *      (answer-first); at least one H2; a question-style title (How, What,
 *      Why, When, Should, Can, Does, Is) needs a FAQ of 2 to 6 items.
 *
 * Every reason is a plain sentence naming the matched text and where it is,
 * e.g. `Price claim: "from $9,000" in paragraph 4`. A hold is cleared only by
 * a passing re-check or by an admin's "Publish anyway" (never the token).
 *
 * The guard is deliberately conservative: a false hold costs Alex one tap, a
 * false pass puts an unapproved price or legal promise on a licensed
 * contractor's site. Pure, no I/O: tests/articles-publish-guard.spec.ts.
 */
import { validateDraft, type Fact } from '@/lib/seo/draftGuardrails';
import type { FaqItem } from './schemas';

/** The post as it would be published: after any pending action draft is applied. */
export interface PublishCandidate {
  title: string;
  slug: string;
  content: string;
  category: string;
  excerpt?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  faq?: FaqItem[] | null;
}

/** A service's published price, and the names an article may call it by. */
export interface CatalogPrice {
  slug: string;
  /** Lowercase names in both languages (service name, trade label, slug words). */
  names: string[];
  /** The `priceDisplay` strings, e.g. "$2,095", "$2.95 / sq ft". */
  priceDisplays: string[];
}

/** What the caller loads for the guard (src/lib/articles/publishFlow.ts). */
export interface PublishFacts {
  contentFacts: Fact[];
  /** Published catalog prices; an empty list means no amount is ever allowed. */
  catalogPrices?: CatalogPrice[];
}

export interface PublishVerdict {
  ok: boolean;
  /** Plain sentences naming the matched text, e.g. `Price claim: "from $9,000" in paragraph 4`. */
  reasons: string[];
}

export const OPENING_MIN_WORDS = 25;
export const OPENING_MAX_WORDS = 70;
export const FAQ_MIN_FOR_QUESTION = 2;
export const FAQ_MAX_FOR_QUESTION = 6;

// ---------------------------------------------------------------------------
// Text preparation
// ---------------------------------------------------------------------------

/**
 * One block of markdown as the reader sees it: link targets, images, bare
 * URLs and markup removed, whitespace collapsed. Scanning this instead of
 * the raw markdown keeps `/blog/save-20-percent` or `**$9,000**` from
 * hiding or inventing a claim.
 */
export function readableText(block: string): string {
  return block
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+\.\s+)/gm, '')
    .replace(/[*_`~|]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Blank-line separated blocks, numbered from 1 the way an editor counts paragraphs. */
export function markdownBlocks(markdown: string): string[] {
  return markdown.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
}

/** Case-insensitive, whitespace- and quote-insensitive form for comparing a sentence to a locked fact. */
function comparable(text: string): string {
  return readableText(text).toLowerCase().replace(/[.!?\s]+$/, '');
}

/** Blank out every occurrence of a locked fact sentence so neither scan sees it. */
function maskLockedSentences(text: string, locked: string[]): string {
  let out = text;
  const lower = text.toLowerCase();
  for (const sentence of locked) {
    if (!sentence) continue;
    let from = 0;
    for (;;) {
      const at = lower.indexOf(sentence, from);
      if (at < 0) break;
      from = at + sentence.length;
      // Only the sentence as a whole: "It is not true that <fact>" is not the fact.
      const startsSentence = at === 0 || /[.!?:]["')\]]?\s+$/.test(text.slice(0, at));
      const endsSentence = /^[.!?]?["')\]]?(?:\s|$)/.test(text.slice(at + sentence.length));
      if (!startsSentence || !endsSentence) continue;
      out = out.slice(0, at) + ' '.repeat(sentence.length) + out.slice(at + sentence.length);
    }
  }
  return out;
}

/** A short window around a match, for reasons the owner can find in the post. */
function contextOf(text: string, start: number, end: number): string {
  // About 30 characters each side, widened to whole words.
  let from = Math.max(0, start - 30);
  while (from > 0 && /\S/.test(text[from - 1])) from -= 1;
  let to = Math.min(text.length, end + 30);
  while (to < text.length && /\S/.test(text[to])) to += 1;
  const head = from > 0 ? '...' : '';
  const tail = to < text.length ? '...' : '';
  return `${head}${text.slice(from, to).trim()}${tail}`;
}

interface Span { start: number; end: number }

/** Join spans that overlap or sit within a few characters ("$9,000 to $12,000" is one claim). */
function mergeSpans(spans: Span[], text: string): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Span[] = [];
  for (const span of sorted) {
    const last = out[out.length - 1];
    if (last && (span.start <= last.end || /^\s*(?:-|\u2013|\u2014|to|and|or)?\s*$/i.test(text.slice(last.end, span.start)))) {
      last.end = Math.max(last.end, span.end);
    } else {
      out.push({ ...span });
    }
  }
  return out;
}

function allMatches(re: RegExp, text: string): Span[] {
  return [...text.matchAll(re)].map((m) => ({ start: m.index!, end: m.index! + m[0].length }));
}

// ---------------------------------------------------------------------------
// 2. Price claims
// ---------------------------------------------------------------------------

const UNIT = String.raw`(?:\s*(?:\/|per|a)\s*(?:sq\.?\s*ft\.?|square\s+f(?:oo|ee)t|linear\s+f(?:oo|ee)t|lin\.?\s*ft\.?|pie²|pie\s+cuadrado))?`;
/**
 * A currency sign: the dollar, its full-width form (U+FF04, which looks the
 * same on a phone), the euro and the pound.
 */
const SIGN = String.raw`[$\uFF04\u20AC\u00A3]`;
const NUMBER = String.raw`\d(?:[\d,]*\d)?(?:\.\d+)?`;
/** Number words in English and Spanish, as an amount is spelled out ("two hundred", "doscientos"). */
const NUMBER_WORD = String.raw`(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos|mil)`;
/** Money words after an amount: dollars, dólares, bucks, USD. */
const MONEY_WORD = String.raw`(?:USD|dollars?|d[oó]lares|bucks?)`;
/**
 * $9,000 / $9k / $2.95 / sq ft / USD 9000 / 9,000 dollars / 2,095$ / ＄99 /
 * 99 bucks / 2095 dólares / two hundred dollars / doscientos dólares.
 */
const CURRENCY_SOURCE = String.raw`(?:${SIGN}\s?${NUMBER}(?:\s?(?:k|thousand|million)\b)?|\bUSD\s?${NUMBER}|\b${NUMBER}\s?(?:k\s)?${MONEY_WORD}(?![a-z])|\b${NUMBER}\s?${SIGN}|\b(?:${NUMBER_WORD}(?:[\s-]+(?:and\s+|y\s+)?${NUMBER_WORD})*)\s+${MONEY_WORD}(?![a-z]))${UNIT}`;
const CURRENCY_RE = new RegExp(CURRENCY_SOURCE, 'gi');
/** A per-unit price phrase standing on its own ("priced per square foot"). */
const UNIT_ONLY_RE = /\bper\s+(?:sq\.?\s*ft\.?|square\s+f(?:oo|ee)t|linear\s+f(?:oo|ee)t)/gi;
/**
 * A price word followed within 40 characters by a number, year-shaped or not
 * ("costs 2000" is a price). The one thing skipped is a year in prose: a
 * four-digit 19xx or 20xx right after in, since, during, until or through
 * ("the cost of a kitchen remodel in 2026" is the most common title on the
 * subject and says nothing about money).
 */
const PRICE_WORD_RE = /\b(?:start(?:s|ing)?\s+at|from(?=\s*\$)|costs|cost\s+of|prices?|priced|estimates?\s+of|quotes?\s+of)\b[^.!?\n]{0,40}?(?:\$\s?)?(?<!\d)(?!(?<=\b(?:in|since|during|until|through)\s)(?:19|20)\d\d\b)\d(?:[\d,]*\d)?(?:\.\d+)?/gi;
/** A percentage next to a discount word, either way round. */
const PERCENT_RE = /\b(?:save|saving|savings|discount(?:ed)?|off|cheaper)\b[^.!?\n]{0,20}?\d+(?:\.\d+)?\s?(?:%|percent\b)|\d+(?:\.\d+)?\s?(?:%|percent\b)[^.!?\n]{0,20}?\b(?:off|save|savings?|discount(?:ed)?|cheaper)\b|\b(?:half|(?:five|ten|fifteen|twenty|twenty-five|thirty|forty|fifty|sixty|seventy|seventy-five)\s+percent)\s+(?:off|cheaper|discount|savings?)\b|\bsave\s+(?:half|(?:five|ten|fifteen|twenty|twenty-five|thirty|forty|fifty)\s+percent)\b/gi;
/**
 * Discount wording just before an amount: "Save $2,095", "$500 off". A catalog
 * price is allowed only as the starting price for its service, never as a
 * saving, so an amount in this wording is a claim even when it equals one.
 */
const DISCOUNT_BEFORE_RE = /\b(?:save|saving|savings|discount(?:ed|s)?|rebate|off|cheaper|deal|sale)\b[^.!?\n$]{0,15}$/i;
const DISCOUNT_AFTER_RE = /^[^.!?\n]{0,6}\b(?:off|discount|savings?|cheaper|rebate)\b/i;
/**
 * A price promise with no number at all: "half price", "half off", "a mitad
 * de precio". Held for every source.
 */
const PROMO_RE = /\bhalf[\s-](?:price|off)\b|\bmitad\s+de\s+precio\b|\b(?:two|2)[\s-]for[\s-](?:one|1)\b|\bbogo\b/gi;
/**
 * The strict extra for short marketing copy (experiment variants, not
 * articles): words that only promise a deal, and any bare number of three or
 * more digits. Copy on a button or a hero has no honest use for either, while
 * an article does ("feel free", "save time", "in 2026", the free estimate
 * page), so these are not article reasons.
 */
const STRICT_PROMO_RE = /(?<![-\w])(?:free|gratis|discount(?:ed|s)?|descuentos?|deals?|ofertas?|sale|rebajas?|save|savings?|ahorr(?:e|a|o|as|ar)|off|promo(?:tion)?s?|cheap(?:er|est)?|barat[oa]s?)(?![-\w])/gi;
const STRICT_NUMBER_RE = /(?<![\w.,])\d{1,3}(?:,\d{3})+(?![\w,])|(?<![\w.,])\d{3,}(?![\w,])/g;
/** The unit a price is quoted in, so "$2.95 per linear foot" is not the catalog's "$2.95 / sq ft". */
function unitKind(text: string): 'sqft' | 'linear' | null {
  if (/sq\.?\s*ft|square\s+f(?:oo|ee)t|pie²|pie\s+cuadrado/i.test(text)) return 'sqft';
  if (/linear\s+f(?:oo|ee)t|lin\.?\s*ft/i.test(text)) return 'linear';
  return null;
}

/** "$2,095" -> 2095, "$2.95 / sq ft" -> 2.95, "9k dollars" -> 9000. NaN when there is no number. */
export function amountValue(text: string): number {
  const m = /(\d(?:[\d,]*\d)?(?:\.\d+)?)\s?(k|thousand|million)?/i.exec(text);
  if (!m) return NaN;
  const base = Number(m[1].replace(/,/g, ''));
  const scale = !m[2] ? 1 : /million/i.test(m[2]) ? 1_000_000 : 1_000;
  return base * scale;
}

function namesService(paragraph: string, price: CatalogPrice): boolean {
  const lower = paragraph.toLowerCase();
  return price.names.some((name) => {
    if (!name) return false;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^a-z0-9áéíóúñ])${escaped}(?:$|[^a-z0-9áéíóúñ])`, 'i').test(lower);
  });
}

/** The published prices a paragraph may quote: priceDisplay of every service it names, with its unit. */
function allowedAmounts(paragraph: string, prices: CatalogPrice[]): Array<{ value: number; unit: ReturnType<typeof unitKind> }> {
  return prices
    .filter((p) => namesService(paragraph, p))
    .flatMap((p) => p.priceDisplays.map((d) => ({ value: amountValue(d), unit: unitKind(d) })))
    .filter((a) => Number.isFinite(a.value));
}

function priceClaims(text: string, prices: CatalogPrice[]): Array<{ claim: string; allowed: boolean }> {
  const percent = [...allMatches(PERCENT_RE, text), ...allMatches(PROMO_RE, text)];
  const money = mergeSpans([
    ...allMatches(CURRENCY_RE, text),
    ...allMatches(UNIT_ONLY_RE, text),
    ...allMatches(PRICE_WORD_RE, text),
  ], text);
  const allowed = allowedAmounts(text, prices);

  const out: Array<{ claim: string; allowed: boolean }> = [];
  for (const span of money) {
    // A percentage claim inside this span is reported on its own below.
    const before = DISCOUNT_BEFORE_RE.exec(text.slice(Math.max(0, span.start - 40), span.start));
    const discounted = !!before || DISCOUNT_AFTER_RE.test(text.slice(span.end));
    const start = before ? span.start - before[0].length : span.start;
    const claim = text.slice(start, span.end).trim();
    const amounts = [...claim.matchAll(new RegExp(CURRENCY_SOURCE, 'gi'))].map((m) => ({ value: amountValue(m[0]), unit: unitKind(m[0]) }));
    const ok = !discounted && amounts.length > 0 && amounts.every((a) => allowed.some(
      (p) => Math.abs(p.value - a.value) < 0.005 && (a.unit === null || a.unit === p.unit),
    ));
    out.push({ claim, allowed: ok });
  }
  for (const span of mergeSpans(percent, text)) {
    out.push({ claim: text.slice(span.start, span.end).trim(), allowed: false });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3. Legal claims
// ---------------------------------------------------------------------------

/** Lowercase-insensitive keywords, plus three acronyms that only count in capitals. */
const LEGAL_RE = /\bpermit(?:s|ted|ting)?\b|\bcode[-\s]compliant\b|\bcode\s+compliance\b|\b(?:up\s+)?to\s+code\b|\bbuilding\s+codes?\b|\bwarrant(?:y|ies)\b|\bguarantee(?:s|d)?\b|\bguaranteeing\b|\binsured\b|\bbonded\b|\bliability\b|\blawsuits?\b|\blegal(?:ly)?\b|\blead[-\s]safe\b|\basbestos\b|\bmold\s+remediation\b/gi;
const LEGAL_ACRONYM_RE = /\b(?:ADA|OSHA|EPA)\b/g;

function legalClaims(text: string): Array<{ keyword: string; context: string }> {
  const spans = [...allMatches(LEGAL_RE, text), ...allMatches(LEGAL_ACRONYM_RE, text)].sort((a, b) => a.start - b.start);
  return spans.map((s) => ({ keyword: text.slice(s.start, s.end), context: contextOf(text, s.start, s.end) }));
}

// ---------------------------------------------------------------------------
// 4. Shape
// ---------------------------------------------------------------------------

const QUESTION_TITLE = /^\s*(?:how|what|why|when|should|can|does|is)\b/i;
const NOT_PROSE = /^(?:#{1,6}\s|[-*+]\s|\d+\.\s|>|!\[|```|\|)/;
const HAS_LINK = /\[[^\]]*\]\([^)]*\)|https?:\/\/|<a\s/i;

export function isQuestionTitle(title: string): boolean {
  return QUESTION_TITLE.test(title);
}

function shapeReasons(post: PublishCandidate): string[] {
  const reasons: string[] = [];
  // An H1 at the top repeats the title (the CLI strips it; the editor may not).
  const blocks = markdownBlocks(post.content).filter((b, i) => !(i === 0 && /^#\s/.test(b)));
  const opening = blocks[0];
  if (!opening) {
    reasons.push('Answer-first: the article has no opening paragraph.');
  } else if (NOT_PROSE.test(opening)) {
    reasons.push(`Answer-first: the article must open with a paragraph that answers the question, not "${clip(opening.split('\n')[0], 60)}".`);
  } else {
    const words = readableText(opening).split(/\s+/).filter(Boolean).length;
    if (words < OPENING_MIN_WORDS || words > OPENING_MAX_WORDS) {
      reasons.push(`Answer-first: the opening paragraph has ${words} words; it needs ${OPENING_MIN_WORDS} to ${OPENING_MAX_WORDS}.`);
    }
    if (HAS_LINK.test(opening)) {
      reasons.push('Answer-first: the opening paragraph contains a link; keep links out of the answer.');
    }
  }
  if (!/^##[ \t]+\S/m.test(post.content)) {
    reasons.push('No H2 section heading ("## ..."); add at least one.');
  }
  if (isQuestionTitle(post.title)) {
    const n = post.faq?.length ?? 0;
    if (n < FAQ_MIN_FOR_QUESTION || n > FAQ_MAX_FOR_QUESTION) {
      reasons.push(`Question-style title needs a FAQ with ${FAQ_MIN_FOR_QUESTION} to ${FAQ_MAX_FOR_QUESTION} items; it has ${n}.`);
    }
  }
  return reasons;
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 3).trimEnd()}...`;
}

// ---------------------------------------------------------------------------
// The guard
// ---------------------------------------------------------------------------

/** The `claim_*` sentences Alex has approved and locked, in comparable form. */
export function lockedClaimSentences(facts: Fact[]): string[] {
  return facts
    .filter((f) => f.key.startsWith('claim_') && f.lock === true && f.value.trim().length > 0)
    .map((f) => comparable(f.value))
    .filter(Boolean);
}

/** Every place an article says something, in reading order, with the name a reason uses for it. */
function placesOf(post: PublishCandidate): Array<{ where: string; text: string }> {
  const places: Array<{ where: string; text: string }> = [{ where: 'the title', text: post.title }];
  markdownBlocks(post.content).forEach((block, i) => places.push({ where: `paragraph ${i + 1}`, text: block }));
  (post.faq ?? []).forEach((item, i) => {
    places.push({ where: `FAQ question ${i + 1}`, text: item.q });
    places.push({ where: `FAQ answer ${i + 1}`, text: item.a });
  });
  // The excerpt and meta description default to the opening paragraph; a
  // copy of the body is already checked there, and naming it three times
  // would only bury the reason.
  const body = readableText(post.content).toLowerCase();
  const own = (text: string) => !body.includes(readableText(text).replace(/(?:\.\.\.|…)$/, '').trim().toLowerCase());
  if (post.excerpt && own(post.excerpt)) places.push({ where: 'the excerpt', text: post.excerpt });
  if (post.meta_title) places.push({ where: 'the meta title', text: post.meta_title });
  if (post.meta_description && own(post.meta_description)) places.push({ where: 'the meta description', text: post.meta_description });
  return places;
}

/**
 * The same detectors for any other text a visitor reads: the price claims and
 * the legal claims in one string, with NO published price allowed (an A/B
 * variant may never state a price, not even the catalog's). `strict` adds the
 * short-copy rules above (deal words, bare numbers of three or more digits);
 * experiments use it for every string of a variant (src/lib/experiments/types.ts).
 */
export function priceClaimsIn(text: string, options: { strict?: boolean } = {}): string[] {
  const plain = readableText(text);
  const claims = priceClaims(plain, []).map((c) => c.claim);
  if (options.strict) {
    for (const re of [STRICT_PROMO_RE, STRICT_NUMBER_RE]) {
      for (const span of allMatches(re, plain)) claims.push(plain.slice(span.start, span.end));
    }
  }
  return [...new Set(claims)];
}

export function legalClaimsIn(text: string): string[] {
  return [...new Set(legalClaims(readableText(text)).map((c) => c.keyword))];
}

export function checkPublishable(post: PublishCandidate, facts: PublishFacts): PublishVerdict {
  const reasons: string[] = [];
  const add = (reason: string) => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };

  // 1. The existing fact-lock.
  for (const issue of validateDraft(post.content, facts.contentFacts).issues) add(issue);

  const locked = lockedClaimSentences(facts.contentFacts);
  const prices = facts.catalogPrices ?? [];
  const places = placesOf(post).map((p) => ({ ...p, text: maskLockedSentences(readableText(p.text), locked) }));

  // 2. Price claims.
  for (const place of places) {
    for (const { claim, allowed } of priceClaims(place.text, prices)) {
      if (!allowed) add(`Price claim: "${claim}" in ${place.where}`);
    }
  }

  // 3. Legal claims.
  for (const place of places) {
    for (const { keyword, context } of legalClaims(place.text)) {
      add(`Legal claim: "${keyword}" in ${place.where} ("${context}")`);
    }
  }

  // 4. Shape.
  for (const reason of shapeReasons(post)) add(reason);

  return { ok: reasons.length === 0, reasons };
}
