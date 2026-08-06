/**
 * POST /api/admin/home-care/product-image (multipart)
 *
 * The manual half of the photo flow. Amazon blocks server-side fetches often
 * enough that "add a photo yourself" is a first-class path and not an error
 * recovery: the parse route answers 200 with no images and a reason, the screen
 * shows this uploader, and the product is stocked in the same sitting.
 *
 * Fields: `asin` (which product folder the file belongs in) and `file`.
 * Answers `{ path }`, the storage path the create/update call then stores in
 * `images`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { storeUploadedImage } from '@/lib/homecare/productAdmin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ASIN_RE = /^[A-Z0-9]{10}$/;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected a file upload.' }, { status: 400 });
  }

  const asin = String(form.get('asin') ?? '').trim().toUpperCase();
  if (!ASIN_RE.test(asin)) return NextResponse.json({ error: 'Parse the Amazon link first.' }, { status: 422 });

  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a photo to upload.' }, { status: 400 });
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: 'JPEG, PNG or WebP, please.' }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'That photo is over 8MB.' }, { status: 413 });

  const path = await storeUploadedImage(asin, file, Date.now());
  if (!path) return NextResponse.json({ error: 'Could not store the photo.' }, { status: 500 });
  return NextResponse.json({ path });
}
