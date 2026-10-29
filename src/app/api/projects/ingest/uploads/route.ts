/**
 * POST /api/projects/ingest/uploads  { files: [{ filename, size, kind }] }
 *
 * Signed upload URLs for full-size photos and videos, so the CLI never pushes
 * a 10 MB phone photo through a function body (Vercel caps those at 4.5 MB).
 * The caller PUTs each file to its `signed_url`, then references it by `path`
 * in POST /api/projects/ingest, which sniffs the stored bytes before use.
 *
 * Same auth and rate limit as the rest of the ingest API.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponseBody } from '@/lib/projects/draft';
import { BodyError, readJsonBody, validationResponse } from '@/lib/projects/http';
import { authorizeIngest } from '@/lib/projects/ingest';
import { signRequestSchema, signUpload } from '@/lib/projects/uploads';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bodySchema = z.object({ files: z.array(signRequestSchema).min(1).max(30) });

export async function POST(request: NextRequest) {
  const caller = await authorizeIngest(request);
  if ('response' in caller) return caller.response;

  let raw: unknown;
  try {
    raw = await readJsonBody(request, 16 * 1024);
  } catch (err) {
    const e = err as BodyError;
    return NextResponse.json({ error: e.message }, { status: e.status ?? 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return validationResponse(parsed.error);

  try {
    const uploads = [];
    for (const file of parsed.data.files) uploads.push(await signUpload(file));
    // The Supabase gateway may want an apikey on the PUT as well as the token in
    // the URL. The publishable key is public (it ships in every page), so hand
    // it over rather than make the CLI know it.
    const apikey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    return NextResponse.json({ uploads, headers: apikey ? { apikey } : {} });
  } catch (err) {
    const { status, body } = errorResponseBody(err, 'Could not prepare the uploads.');
    return NextResponse.json(body, { status });
  }
}
