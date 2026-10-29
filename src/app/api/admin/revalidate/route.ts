/**
 * POST /api/admin/revalidate - { paths: string[] }
 *
 * Drops the ISR copies of pages the CMS, services and blog editors just changed, so
 * a save shows now rather than after the hourly window. Each path must sit
 * under an allowlisted prefix (src/lib/revalidate.ts). '/' revalidates the
 * homepage alone; any other path revalidates itself and everything below it.
 *
 * Admin auth is enforced by middleware on /api/admin/*.
 */
import { revalidatePath, revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { BodyError, readJsonBody, validationResponse } from '@/lib/projects/http';
import { isRevalidatablePath, REVALIDATE_EXACT, SITEMAP_ROUTE, SITEMAP_TAG, touchesSitemap } from '@/lib/revalidate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bodySchema = z.object({
  paths: z.array(
    z.string().max(200).refine(isRevalidatablePath, { message: 'Path is not revalidatable' }),
  ).min(1).max(20),
}).strict();

export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await readJsonBody(request, 4 * 1024);
  } catch (err) {
    const e = err as BodyError;
    return NextResponse.json({ error: e.message }, { status: e.status ?? 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return validationResponse(parsed.error);

  const paths = [...new Set(parsed.data.paths)];
  try {
    // '/' is the homepage alone and each sitemap path is one file; every
    // other path drops itself and everything below it.
    const single = (path: string) => path === '/' || (REVALIDATE_EXACT as readonly string[]).includes(path);
    for (const path of paths) revalidatePath(path, single(path) ? 'page' : 'layout');
    // Either sitemap path drops the route handler's ISR copy (an editor tab
    // loaded before the move may send only '/sitemap.xml') and expires the
    // tag on its database reads, so the regeneration reads fresh rows.
    if (touchesSitemap(paths)) {
      if (!paths.includes(SITEMAP_ROUTE)) revalidatePath(SITEMAP_ROUTE, 'page');
      revalidateTag(SITEMAP_TAG, { expire: 0 });
    }
  } catch (err) {
    console.error('admin revalidate failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not revalidate' }, { status: 500 });
  }
  return NextResponse.json({ revalidated: paths });
}
