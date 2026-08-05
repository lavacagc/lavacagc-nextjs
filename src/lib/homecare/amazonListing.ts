/**
 * Server-only, best-effort reader for an Amazon product listing.
 *
 * The owner's decision (D6) is that pasting a link fills in the product: title,
 * brand, photos, no second step. The compliant way to get those is Amazon's
 * Product Advertising API, and PA-API access opens only after an Associates
 * account has referred qualifying sales - so on day one there is no API to call
 * and this reads the public product page instead.
 *
 * That is worth naming rather than burying: reading the page is scraping under
 * Amazon's Conditions of Use, and the images belong to Amazon and the brand. The
 * realistic downside is the Associates account, not a lawsuit. It is what most
 * affiliate sites do, the owner chose it with that stated, and
 * `HOME_CARE_IMAGE_FETCH=off` turns it into the manual-upload flow without a
 * deploy. When PA-API access arrives, `parseAmazonListing` is the seam it
 * replaces - the route above it already treats an empty result as normal.
 *
 * EVERYTHING HERE IS BEST EFFORT AND MUST NEVER THROW UPWARD AS A FAILURE.
 * Amazon rate-limits and captchas datacenter IPs (Vercel's very much included),
 * so "blocked" is an ordinary Tuesday, not an error: the route answers 200 with
 * no images and the admin screen shows the upload box. An implementation that
 * treated a block as a failure would make the paste flow feel broken exactly
 * when it is working as designed.
 */

/** A browser UA. Amazon serves a stripped or captcha page to obvious bots. */
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const FETCH_TIMEOUT_MS = 8000;
/** A product page is large; we only need the head and the image blob near the top. */
const MAX_HTML_BYTES = 1_500_000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export interface ListingRead {
  title: string | null;
  brand: string | null;
  /** Absolute image URLs on Amazon's CDN, best effort, most representative first. */
  imageUrls: string[];
  /** Why there is nothing here, when there is nothing here. Shown to the admin, not the member. */
  reason?: 'disabled' | 'blocked' | 'unreadable' | 'timeout';
}

const EMPTY = (reason: ListingRead['reason']): ListingRead => ({ title: null, brand: null, imageUrls: [], reason });

/** Is the listing fetch switched on? Default is on; `off` (any case) disables it. */
export function listingFetchEnabled(): boolean {
  return (process.env.HOME_CARE_IMAGE_FETCH ?? '').trim().toLowerCase() !== 'off';
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'en-US,en;q=0.9',
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Follow an `amzn.to` / `a.co` short link to the product URL it points at.
 *
 * Returns the input unchanged on any failure, so the caller's own ASIN parse is
 * what decides whether the paste was usable. Uses GET rather than HEAD: the
 * shorteners answer HEAD inconsistently, and fetch follows the redirect chain
 * for us either way.
 */
export async function resolveShortLink(url: string): Promise<string> {
  try {
    const res = await fetchWithTimeout(url, { redirect: 'follow' });
    return res.url || url;
  } catch {
    return url;
  }
}

/** Decode the HTML entities that show up in a product title. */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function metaContent(html: string, property: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']+)["']`,
    'i',
  );
  const alt = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${property}["']`,
    'i',
  );
  const m = re.exec(html) ?? alt.exec(html);
  return m ? decodeEntities(m[1]) : null;
}

/**
 * Amazon's own image URLs carry a size suffix (`._AC_SX679_.jpg`). Stripping it
 * back to the base asset gets the full-resolution original, which is what we
 * want to store once rather than a thumbnail we would have to re-fetch later.
 */
function fullSizeImageUrl(url: string): string {
  return url.replace(/\._[A-Z0-9_,]+_\.(jpg|jpeg|png|webp)/i, '.$1');
}

function collectImages(html: string, limit: number): string[] {
  const found: string[] = [];
  const push = (u: string | null | undefined) => {
    if (!u) return;
    const clean = fullSizeImageUrl(u.replace(/&amp;/g, '&').trim());
    if (!/^https:\/\/[^\s"']+\.(jpg|jpeg|png|webp)/i.test(clean)) return;
    if (!found.includes(clean) && found.length < limit) found.push(clean);
  };

  // The main image, which Amazon also publishes as og:image - the one field that
  // is present even on a stripped page.
  push(metaContent(html, 'og:image'));

  // The gallery. `data-a-dynamic-image` holds a JSON object keyed by URL; the
  // hi-res variants live in `hiRes`/`large` inside the colorImages blob. Both
  // are read with a tolerant regex rather than parsed: the page is not a
  // contract, and a shape change must degrade to "one image" and not to a throw.
  for (const m of html.matchAll(/"(?:hiRes|large)"\s*:\s*"(https:\/\/[^"]+?)"/g)) push(m[1]);
  const dynamic = /data-a-dynamic-image="([^"]+)"/i.exec(html);
  if (dynamic) {
    for (const m of decodeEntities(dynamic[1]).matchAll(/(https:\/\/[^"\s]+?)":/g)) push(m[1]);
  }
  return found;
}

/**
 * Read what we can from a product page.
 *
 * Never throws. Every failure is a `reason` the admin screen can show next to an
 * upload box.
 */
export async function parseAmazonListing(productUrl: string, imageLimit: number): Promise<ListingRead> {
  if (!listingFetchEnabled()) return EMPTY('disabled');

  let html: string;
  try {
    const res = await fetchWithTimeout(productUrl, { redirect: 'follow' });
    // 503 and 429 are Amazon's bot walls; a captcha page answers 200 with no
    // product markup and falls out as 'unreadable' below. Both are ordinary.
    if (!res.ok) return EMPTY('blocked');
    const text = await res.text();
    html = text.length > MAX_HTML_BYTES ? text.slice(0, MAX_HTML_BYTES) : text;
  } catch (err) {
    return EMPTY(err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'blocked');
  }

  const titleTag = /<span[^>]+id=["']productTitle["'][^>]*>([\s\S]{1,600}?)<\/span>/i.exec(html);
  const title = titleTag
    ? decodeEntities(titleTag[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '))
    : metaContent(html, 'og:title');

  const byline = /<a[^>]+id=["']bylineInfo["'][^>]*>([\s\S]{1,200}?)<\/a>/i.exec(html);
  const brand = byline
    ? decodeEntities(byline[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '))
        .replace(/^(?:Visit the|Brand:)\s*/i, '')
        .replace(/\s*Store$/i, '')
        .trim() || null
    : null;

  const imageUrls = collectImages(html, imageLimit);
  if (!title && imageUrls.length === 0) return EMPTY('unreadable');
  return { title: title || null, brand, imageUrls };
}

export interface FetchedImage {
  bytes: ArrayBuffer;
  contentType: string;
  extension: string;
}

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Download one image so it can be stored in our own bucket.
 *
 * Copying rather than hotlinking is what keeps a card intact when Amazon changes
 * an image URL, and it is the only reason the photos survive a listing being
 * delisted while the shelf is being repaired. Returns null on anything unusual -
 * wrong content type, oversized, unreachable - so one bad image costs one image
 * and not the paste.
 */
export async function fetchProductImage(url: string): Promise<FetchedImage | null> {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const extension = IMAGE_TYPES[contentType];
    if (!extension) return null;
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null;
    return { bytes, contentType, extension };
  } catch {
    return null;
  }
}
