/**
 * POST /api/projects/ingest/<id>/publish  { feature?: boolean }
 *
 * Publish from Claude Code, when the owner asked for it. Same effect as the
 * manager's Publish button (src/lib/projects/draft.ts publishProject), same
 * auth as the rest of the ingest API.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponseBody, publishProject } from '@/lib/projects/draft';
import { BodyError, adminUrl, readJsonBody, revalidateProjectPages } from '@/lib/projects/http';
import { authorizeIngest, ingestAnswer } from '@/lib/projects/ingest';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bodySchema = z.object({ feature: z.boolean().optional() }).strict();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await authorizeIngest(request);
  if ('response' in caller) return caller.response;
  const { id } = await params;

  let raw: unknown = {};
  if (Number(request.headers.get('content-length') ?? '0') > 0) {
    try {
      raw = await readJsonBody(request, 1024);
    } catch (err) {
      const e = err as BodyError;
      return NextResponse.json({ error: e.message }, { status: e.status ?? 400 });
    }
  }
  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed' }, { status: 400 });

  try {
    const published = await publishProject(id, { feature: parsed.data.feature });
    revalidateProjectPages(published.url_slug);
    return ingestAnswer(request, published, adminUrl);
  } catch (err) {
    const { status, body } = errorResponseBody(err, 'Could not publish the project.');
    return NextResponse.json(body, { status });
  }
}
