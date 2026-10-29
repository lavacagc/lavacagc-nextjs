/**
 * POST /api/admin/projects/<id>/unpublish
 *
 * Takes a project off the public site and back to Drafts:
 * `status='draft', active=false`. Revalidates the pages it was on.
 */
import { NextRequest, NextResponse } from 'next/server';
import { errorResponseBody, unpublishProject } from '@/lib/projects/draft';
import { adminUrl, revalidateProjectPages } from '@/lib/projects/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const result = await unpublishProject(id);
    revalidateProjectPages(result.url_slug);
    return NextResponse.json({ ...result, admin_url: adminUrl(request, id) });
  } catch (err) {
    const { status, body } = errorResponseBody(err, 'Could not unpublish the project.');
    return NextResponse.json(body, { status });
  }
}
