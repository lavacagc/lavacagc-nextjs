/**
 * La Vaca Home Care - the DIY Kit contract (pure, client-safe).
 *
 * The shelf of recommended gear that hangs off a maintenance task the member
 * can do themselves. Everything here is pure: `HomeCareChecklistClient` is a
 * 'use client' component and imports from this module, so nothing server-only
 * may be imported into it. The server read lives next door in `productShelf.ts`,
 * the same split `records.ts` (registry) and `homeRecords.ts` (read) already use.
 *
 * Two rules carry the subtlety:
 *
 *  - **The tag is never stored.** A row holds an ASIN; `amazonProductUrl` puts
 *    `AMAZON_ASSOCIATES_TAG` on the end at render time. That is what makes the
 *    feature shippable before the Associates account exists (links render
 *    tagless and the page is otherwise identical), and it makes rotating the tag
 *    a config change rather than an UPDATE across every row.
 *  - **A shelf only hangs off DIY-eligible work.** `diy_or_pro` is already in
 *    the catalog and already drives the DIY/PRO badge. Recommending a member the
 *    gear to sweep their own chimney would be both unsafe and a direct bid
 *    against the booking this program exists to earn, so `isDiyEligible` gates
 *    the admin UI and the write route both.
 */

/**
 * How a product is priced, in bands. RETIRED, not deleted (owner, 2026-08-06).
 *
 * Choosing a band for every product turned out to be manual labour for no
 * return, so nothing collects one and nothing displays one. The vocabulary and
 * its column stay because the argument that produced them has not stopped being
 * true - a member deserves to know a dehumidifier is not a $12 purchase before
 * they tap - it has only stopped being worth typing, and bands already chosen
 * are still in the database. Should this come back, the type, the labels and the
 * validator are the whole of what is needed.
 *
 * Nothing here is exported into a rendering path. `priceBandLabel` has no
 * caller outside the spec that pins its labels, and that is by design rather
 * than an oversight; deleting it is the change to make if this is ever declared
 * dead rather than dormant.
 */
export type PriceBand = 'under_25' | '25_50' | '50_100' | '100_plus';

export type ProductCategory = 'tool' | 'consumable' | 'safety' | 'monitor';

export type LinkStatus = 'ok' | 'suspect' | 'gone';

/** The catalog's own DIY verdict, as `maintenance_catalog.diy_or_pro` stores it. */
export type DiyOrPro = 'diy' | 'pro' | 'either';

export interface HomeCareProduct {
  id: string;
  asin: string;
  display_name: string;
  brand?: string | null;
  pitch?: string | null;
  /** Storage paths in the home-care-products bucket, display order. [0] is the card image. */
  images: string[];
  /** Retired: nothing collects or renders this. Null on everything stocked after 2026-08-06. */
  price_band?: PriceBand | null;
  category?: ProductCategory | null;
  active?: boolean;
  link_status?: LinkStatus;
}

/** A product as the admin screen sees it: with the shelves it currently sits on. */
export interface AdminProduct extends HomeCareProduct {
  task_keys: string[];
  image_source?: string | null;
  checked_at?: string | null;
}

/**
 * The band vocabulary, in ascending order, with the label the member reads.
 *
 * `100_plus` is open-ended on purpose. A band with a ceiling ("$100 - $250")
 * makes a promise about the top of the range that nothing refreshes, which is
 * the same staleness the whole no-live-prices decision exists to avoid - just
 * slower and less obvious.
 */
export const PRICE_BANDS: ReadonlyArray<{ value: PriceBand; label: string }> = [
  { value: 'under_25', label: 'Under $25' },
  { value: '25_50', label: '$25 - $50' },
  { value: '50_100', label: '$50 - $100' },
  { value: '100_plus', label: '$100 and up' },
];

const BAND_LABELS: Record<PriceBand, string> = Object.fromEntries(
  PRICE_BANDS.map((b) => [b.value, b.label]),
) as Record<PriceBand, string>;

export function priceBandLabel(band: string | null | undefined): string | null {
  return band && band in BAND_LABELS ? BAND_LABELS[band as PriceBand] : null;
}

export function isPriceBand(value: unknown): value is PriceBand {
  return typeof value === 'string' && value in BAND_LABELS;
}

export function isProductCategory(value: unknown): value is ProductCategory {
  return value === 'tool' || value === 'consumable' || value === 'safety' || value === 'monitor';
}

/** Where a product's photos came from. Mirrors the column's CHECK exactly. */
export type ImageSource = 'pa_api' | 'listing' | 'manual';

export function isImageSource(value: unknown): value is ImageSource {
  return value === 'pa_api' || value === 'listing' || value === 'manual';
}

/**
 * May this task carry a shelf?
 *
 * The owner's rule, twice over: `pro` work is ours to do and never grows a
 * "buy this yourself" list, and even an eligible task shows nothing until
 * somebody stocks it by hand. This function is only the first half - the second
 * half is that no code anywhere creates a link automatically.
 */
export function isDiyEligible(diyOrPro: string | null | undefined): boolean {
  return diyOrPro === 'diy' || diyOrPro === 'either';
}

/** Amazon hosts we accept a paste from. `amzn.to` needs resolving first (server side). */
const AMAZON_HOST = /(^|\.)amazon\.[a-z.]{2,6}$/i;
const SHORTENER_HOST = /(^|\.)(amzn\.to|amzn\.eu|a\.co)$/i;

/** Path segments that are followed by the ASIN. */
const ASIN_PATH = /\/(?:dp|gp\/product|gp\/aw\/d|product|gp\/offer-listing)\/([A-Za-z0-9]{10})(?:[/?#]|$)/;

/**
 * A modern ASIN, or an ISBN-10 for the book listings that still carry one.
 *
 * The narrow shape is only needed for a BARE paste. Ten alphanumerics is a
 * common enough shape that `JAVASCRIPT` or a truncated order number would sail
 * through a loose test and be stored as a product nobody can buy - and the
 * failure surfaces as a 404 at Amazon, on a customer's phone, not anywhere we
 * would see it. Inside a `/dp/` path the position is unambiguous, so the loose
 * form is safe there.
 */
const BARE_ASIN = /^(?:B[0-9A-Z]{9}|[0-9]{9}[0-9X])$/i;

export function isShortenedAmazonLink(input: string): boolean {
  try {
    return SHORTENER_HOST.test(new URL(input.trim()).hostname);
  } catch {
    return false;
  }
}

/**
 * The ASIN in a pasted Amazon URL, or null.
 *
 * Accepts the shapes the owner actually has in their clipboard: the share link,
 * the search-result link with its `ref=` and tracking query, `/gp/product/`,
 * the mobile `/gp/aw/d/`, and a bare ASIN typed by hand. Returns it upper-cased,
 * because Amazon's URLs are case-tolerant about it and the identifier is not -
 * and the column's CHECK constraint is upper-case only.
 *
 * Deliberately does NOT resolve `amzn.to` shorteners: that needs a network hop,
 * and this module has to stay pure so the client bundle can import it. The parse
 * route resolves first, then calls this.
 */
export function parseAsin(input: string | null | undefined): string | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;

  if (BARE_ASIN.test(raw)) return raw.toUpperCase();

  let url: URL;
  try {
    url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!AMAZON_HOST.test(url.hostname)) return null;

  const inPath = ASIN_PATH.exec(url.pathname);
  if (inPath) return inPath[1].toUpperCase();

  // Some listing links carry it as a query parameter instead of a path segment.
  for (const key of ['asin', 'ASIN']) {
    const value = url.searchParams.get(key);
    if (value && BARE_ASIN.test(value)) return value.toUpperCase();
  }
  return null;
}

/**
 * The outbound link for a product, tagged if we have a tag.
 *
 * Always `www.amazon.com`, whichever regional host the ASIN was pasted from: the
 * Associates account is a US one and a tag only earns on the marketplace it
 * belongs to. Composed here rather than stored, so no row ever contains
 * `tag=` (AC3).
 */
export function amazonProductUrl(asin: string, tag?: string | null): string {
  const base = `https://www.amazon.com/dp/${encodeURIComponent(asin)}`;
  const trimmed = (tag ?? '').trim();
  return trimmed ? `${base}?tag=${encodeURIComponent(trimmed)}` : base;
}

const IMAGE_BUCKET = 'home-care-products';

/**
 * Public URL for a stored product image.
 *
 * Images are copied into our own bucket rather than hotlinked from Amazon, so
 * a card survives Amazon changing an image URL and `next/image` gets a host its
 * remotePatterns already allow. Returns null rather than a broken `undefined/`
 * URL when the storage host is not configured, which is what lets a shelf
 * simply not render instead of rendering empty frames.
 */
export function productImageUrl(path: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || !path) return null;
  return `${base}/storage/v1/object/public/${IMAGE_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export const PRODUCT_IMAGE_BUCKET = IMAGE_BUCKET;

/** How many products the parse route will keep images for, and the shelf will show. */
export const MAX_PRODUCT_IMAGES = 5;

/**
 * Is this product fit to render to a member?
 *
 * Fail-closed on link rot: a product the weekly health check has marked `gone`
 * stops rendering everywhere the moment it is marked, because a member tapping
 * a dead link is worse than a shelf with one fewer pick on it. `suspect` still
 * renders - that state means "we could not tell", usually because Amazon blocked
 * the checker, and emptying shelves on an inconclusive answer is exactly the
 * failure the three-state design exists to prevent.
 */
export function isRenderable(p: HomeCareProduct): boolean {
  return p.active !== false && p.link_status !== 'gone' && p.images.length > 0;
}

/** The one disclosure line every rendered shelf carries, in the same block as the links. */
export const AFFILIATE_DISCLOSURE =
  'Gear we actually use on jobs. These are Amazon links with our affiliate tag, so La Vaca may earn a commission if you buy - at no extra cost to you. We count taps, not who tapped, so we can tell which picks are worth keeping.';
