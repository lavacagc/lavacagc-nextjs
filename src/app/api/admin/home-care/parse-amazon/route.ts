/**
 * POST /api/admin/home-care/parse-amazon
 *
 * The whole of "paste a link and the product fills itself in" (owner decision
 * D6). Body: `{ url }`. Answers with the ASIN, whatever the listing gave up, and
 * the storage paths of the images we copied.
 *
 * Middleware already 401s /api/admin/*, so there is no auth to re-implement
 * here. What this route DOES re-check is the data rule: it refuses a URL that
 * does not name a product, and it hands back an existing row rather than letting
 * the operator create a duplicate the UNIQUE constraint would reject with a
 * message about constraints.
 *
 * A BLOCKED FETCH IS A 200. Amazon rate-limits datacenter IPs, so "no images,
 * here is why" is a normal answer and the admin screen turns it into an upload
 * box. Only a URL that names no product is a 4xx, because that is the one case
 * where the operator has to do something different.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  parseAsin, isShortenedAmazonLink, amazonProductUrl, MAX_PRODUCT_IMAGES,
} from '@/lib/homecare/products';
import {
  parseAmazonListing, resolveShortLink, fetchProductImage, listingFetchEnabled,
} from '@/lib/homecare/amazonListing';
import { storeProductImage } from '@/lib/homecare/productAdmin';
import { supabaseRest } from '@/lib/notify/supabase-rest';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Long enough for a listing fetch plus a few image downloads, well under the platform ceiling. */
export const maxDuration = 60;

interface ExistingProduct {
  id: string;
  display_name: string;
  images: unknown;
}

export async function POST(request: NextRequest) {
  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const input = typeof body.url === 'string' ? body.url.trim() : '';
  if (!input) return NextResponse.json({ error: 'Paste an Amazon product link.' }, { status: 400 });

  // A shortener has to be followed before anything can be read out of it. The
  // resolve is best-effort: if it fails we fall through to parsing the original,
  // which simply will not contain an ASIN, and the operator gets the message
  // below rather than a stack trace.
  const pasted = isShortenedAmazonLink(input) ? await resolveShortLink(input) : input;
  const asin = parseAsin(pasted);
  if (!asin) {
    return NextResponse.json(
      { error: "That link doesn't name a product. Open the item on Amazon and copy the URL from the address bar (it contains /dp/)." },
      { status: 422 },
    );
  }

  // Already stocked? Hand the operator the existing row so the screen can offer
  // "you already have this one, add it to this task" instead of surfacing a
  // unique-constraint violation from the insert.
  try {
    const existing = await supabaseRest<ExistingProduct[]>(
      'GET',
      `home_care_products?select=id,display_name,images&asin=eq.${encodeURIComponent(asin)}&limit=1`,
    );
    if (existing && existing.length > 0) {
      return NextResponse.json({
        asin,
        existing: { id: existing[0].id, display_name: existing[0].display_name },
        title: null, brand: null, images: [], imageSource: null,
      });
    }
  } catch {
    // The duplicate check is a convenience. If the table is unreachable the
    // insert will say so in its own words; do not fail the parse for it.
  }

  // Read the CANONICAL listing, not the paste. `parseAsin` deliberately accepts
  // a bare ASIN and a scheme-less URL, and neither is something `fetch` can
  // open - pointed at the raw string those two shapes died as "Amazon blocked
  // the request" for a request that was never sent. It also pins the read to the
  // marketplace whose link we store: a paste from amazon.co.uk describes the
  // product the member is sent to, which is always the www.amazon.com one.
  const listing = await parseAmazonListing(amazonProductUrl(asin), MAX_PRODUCT_IMAGES);

  const stamp = Date.now();
  const stored: string[] = [];
  for (const [index, url] of listing.imageUrls.entries()) {
    const image = await fetchProductImage(url);
    if (!image) continue;
    const path = await storeProductImage(asin, index, image, stamp);
    if (path) stored.push(path);
  }

  return NextResponse.json({
    asin,
    title: listing.title,
    brand: listing.brand,
    images: stored,
    imageSource: stored.length > 0 ? 'listing' : null,
    // Present only when there is nothing to show for the fetch, and phrased for
    // the operator: this is the sentence next to the upload box.
    reason: stored.length > 0
      ? undefined
      : !listingFetchEnabled()
        ? 'Automatic photo pull is switched off. Add a photo below.'
        : listing.reason === 'timeout'
          ? 'Amazon took too long to answer. Add a photo below, or try the paste again.'
          : listing.reason === 'unreadable'
            ? 'Amazon answered with a page we could not read. Add a photo below.'
            : 'Amazon blocked the request (it does that to servers). Add a photo below.',
  });
}
