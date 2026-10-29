/**
 * POST /api/admin/projects/<id>/publish  { feature?: boolean }
 *
 * The one-click Publish (and "Publish + feature") on a draft card:
 * `status='published', active=true, published_at`, plus `featured=true` when
 * asked. Revalidates the project page, /portfolio and the homepage.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponseBody, publishProject } from '@/lib/projects/draft';
import { adminUrl, revalidateProjectPages } from '@/lib/projects/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bodySchema = z.object({ feature: z.boolean().optional() }).strict();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const text = await request.text();
  if (text.length > 1024) return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 });
  let raw: unknown = {};
  if (text.trim()) {
    try { raw = JSON.parse(text); } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed' }, { status: 400 });

  try {
    const published = await publishProject(id, { feature: parsed.data.feature });
    revalidateProjectPages(published.url_slug);
    return NextResponse.json({ ...published, admin_url: adminUrl(request, id) });
  } catch (err) {
    const { status, body } = errorResponseBody(err, 'Could not publish the project.');
    return NextResponse.json(body, { status });
  }
}
