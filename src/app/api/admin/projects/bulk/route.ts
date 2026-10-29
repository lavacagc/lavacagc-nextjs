/**
 * POST /api/admin/projects/bulk  { action: 'archive' | 'feature' | 'delete' | 'reorder', ids: uuid[] }
 *
 * The Portfolio Manager's bulk actions and homepage reorder, server-side with
 * the service key, and revalidating `/projects/<slug>`, `/portfolio` and `/`
 * the same way Publish and Unpublish do, so an archived project leaves the
 * public pages now rather than at the end of the ISR window.
 *
 * Admin auth is enforced by middleware on /api/admin/*.
 */
import { NextRequest, NextResponse } from 'next/server';
import { bulkSchema, bulkUpdate, errorResponseBody } from '@/lib/projects/draft';
import { BodyError, readJsonBody, revalidateProjectPages, validationResponse } from '@/lib/projects/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await readJsonBody(request, 16 * 1024);
  } catch (err) {
    const e = err as BodyError;
    return NextResponse.json({ error: e.message }, { status: e.status ?? 400 });
  }
  const parsed = bulkSchema.safeParse(raw);
  if (!parsed.success) return validationResponse(parsed.error);

  try {
    const slugs = await bulkUpdate(parsed.data);
    for (const slug of slugs) revalidateProjectPages(slug);
    if (slugs.length === 0) revalidateProjectPages();
    return NextResponse.json({ status: 'ok', updated: slugs.length });
  } catch (err) {
    const { status, body } = errorResponseBody(err, 'Could not update those projects.');
    return NextResponse.json(body, { status });
  }
}
