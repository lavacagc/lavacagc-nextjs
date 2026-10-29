/**
 * POST /api/admin/revalidate - { paths: string[] }
 *
 * Drops the ISR copies of pages the CMS and services editors just changed, so
 * a save shows now rather than after the hourly window. Each path must sit
 * under an allowlisted prefix (src/lib/revalidate.ts). '/' revalidates the
 * homepage alone; any other path revalidates itself and everything below it.
 *
 * Admin auth is enforced by middleware on /api/admin/*.
 */
import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { BodyError, readJsonBody, validationResponse } from '@/lib/projects/http';
import { isRevalidatablePath } from '@/lib/revalidate';

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
    for (const path of paths) revalidatePath(path, path === '/' ? 'page' : 'layout');
  } catch (err) {
    console.error('admin revalidate failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not revalidate' }, { status: 500 });
  }
  return NextResponse.json({ revalidated: paths });
}
