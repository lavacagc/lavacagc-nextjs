/**
 * GET /api/admin/projects/draft-photos
 *
 * The objects under `project-images/drafts/` (decision 002, Q6): the uploads
 * the old wizard left behind. Each entry says whether a project already uses
 * it, so the panel can offer the unused ones first. Nothing here deletes.
 *
 * Admin auth is enforced by middleware on /api/admin/*.
 */
import { NextResponse } from 'next/server';
import { errorResponseBody, urlsInUse } from '@/lib/projects/draft';
import { listDraftPhotos } from '@/lib/projects/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const photos = await listDraftPhotos();
    const used = await urlsInUse(photos.map((p) => p.url));
    return NextResponse.json({
      photos: photos.map((p) => ({ ...p, in_use: used.has(p.url) })),
    });
  } catch (err) {
    const { status, body } = errorResponseBody(err, 'Could not list draft photos.');
    return NextResponse.json(body, { status });
  }
}
