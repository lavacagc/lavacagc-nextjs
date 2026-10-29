/**
 * PATCH /api/projects/ingest/<id> - update a draft created by (or for) the
 * ingest API. Same auth as POST /api/projects/ingest.
 *
 * Refuses a PUBLISHED project with 409 unless the body says
 * `{ allow_published: true }`: a script should not quietly rewrite a live page.
 * Status is never changed here. `images`, when sent, replaces the media and
 * takes the same `{ path | url, category, ... }` entries as the create call.
 */
import { NextRequest, NextResponse } from 'next/server';
import { errorResponseBody, updateProject } from '@/lib/projects/draft';
import { BodyError, adminUrl, readJsonBody, revalidateProjectPages, validationResponse } from '@/lib/projects/http';
import { authorizeIngest, ingestAnswer, ingestUpdateSchema, resolveIngestImages } from '@/lib/projects/ingest';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await authorizeIngest(request);
  if ('response' in caller) return caller.response;
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await readJsonBody(request);
  } catch (err) {
    const e = err as BodyError;
    return NextResponse.json({ error: e.message }, { status: e.status ?? 400 });
  }
  const parsed = ingestUpdateSchema.safeParse(raw);
  if (!parsed.success) return validationResponse(parsed.error);

  const { allow_published: allowPublished, images, ...fields } = parsed.data;
  try {
    const resolved = images ? await resolveIngestImages(images) : undefined;
    const updated = await updateProject(id, { ...fields, images: resolved }, {
      updatedBy: caller.userId,
      refusePublished: !allowPublished,
    });
    if (updated.active) revalidateProjectPages(updated.url_slug);
    return ingestAnswer(request, updated, adminUrl);
  } catch (err) {
    const { status, body } = errorResponseBody(err, 'Could not update the draft.');
    return NextResponse.json(body, { status });
  }
}
