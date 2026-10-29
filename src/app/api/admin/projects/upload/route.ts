/**
 * POST /api/admin/projects/upload
 *
 * Three shapes, one route:
 *
 * - multipart/form-data with `file`: a photo (re-encoded by the browser to
 *   under 4 MB when larger). Sniffed by magic bytes, stored server-side with the
 *   service key under `projects/`, answered `{ url, path, media_type }`.
 * - JSON `{ action: 'sign', filename, size, kind }`: a signed upload URL for a
 *   video (too big for a function body). The browser uploads straight to
 *   storage with `uploadToSignedUrl`, then calls...
 * - JSON `{ action: 'verify', path, size }`: sniffs the stored object and checks
 *   it is a video of exactly the declared size within the cap. A definitive
 *   refusal deletes the object (only a freshly minted, unreferenced key); a
 *   storage error deletes nothing and answers 503 so the browser can retry.
 *   Answers `{ url, path, media_type }`.
 *
 * Admin auth is enforced by middleware on /api/admin/*.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponseBody } from '@/lib/projects/draft';
import { MAX_IMAGE_BODY_BYTES } from '@/lib/projects/fields';
import { BodyError, readJsonBody, validationResponse } from '@/lib/projects/http';
import { signRequestSchema, signUpload, storeFile, verifyStored } from '@/lib/projects/uploads';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const jsonSchema = z.discriminatedUnion('action', [
  signRequestSchema.extend({ action: z.literal('sign') }),
  z.object({
    action: z.literal('verify'),
    path: z.string().trim().min(1).max(255),
    /** The size declared when the upload was signed; the stored object must match it. */
    size: z.number().int().positive(),
  }),
]);

export async function POST(request: NextRequest) {
  const type = request.headers.get('content-type') ?? '';

  if (type.startsWith('multipart/form-data')) {
    // Multipart overhead is small; anything far past the image cap is refused unread.
    const declared = Number(request.headers.get('content-length') ?? '0');
    if (declared > MAX_IMAGE_BODY_BYTES + 64 * 1024) {
      return NextResponse.json({ error: 'That photo is over 4 MB.' }, { status: 413 });
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Expected a file upload.' }, { status: 400 });
    }
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a file to upload.' }, { status: 400 });
    try {
      const stored = await storeFile(file);
      return NextResponse.json({ url: stored.url, path: stored.path, media_type: stored.media_type }, { status: 201 });
    } catch (err) {
      const { status, body } = errorResponseBody(err, 'Could not store the file.');
      return NextResponse.json(body, { status });
    }
  }

  let raw: unknown;
  try {
    raw = await readJsonBody(request, 4 * 1024);
  } catch (err) {
    const e = err as BodyError;
    return NextResponse.json({ error: e.message }, { status: e.status ?? 400 });
  }
  const parsed = jsonSchema.safeParse(raw);
  if (!parsed.success) return validationResponse(parsed.error);

  try {
    if (parsed.data.action === 'sign') {
      return NextResponse.json(await signUpload(parsed.data));
    }
    const stored = await verifyStored(parsed.data.path, { declaredSize: parsed.data.size, expectKind: 'video' });
    return NextResponse.json({ url: stored.url, path: stored.path, media_type: stored.media_type });
  } catch (err) {
    const { status, body } = errorResponseBody(err, 'Could not prepare the upload.');
    return NextResponse.json(body, { status });
  }
}
