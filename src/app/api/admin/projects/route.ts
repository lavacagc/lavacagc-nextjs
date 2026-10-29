/**
 * /api/admin/projects
 *
 * GET  - every project (drafts included) with its media, for the Portfolio Manager.
 * POST - save the admin form as a DRAFT (decision 002, Q2). Never public until
 *        /api/admin/projects/<id>/publish.
 *
 * Admin auth is enforced by middleware on /api/admin/*. Writes use the service
 * key (src/lib/projects/draft.ts), so they do not depend on table RLS.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createDraft, createProjectSchema, errorResponseBody, listProjects } from '@/lib/projects/draft';
import { BodyError, adminUrl, readJsonBody, validationResponse } from '@/lib/projects/http';
import { adminUserId } from '@/lib/projects/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    return NextResponse.json({ projects: await listProjects() });
  } catch (err) {
    const { status, body } = errorResponseBody(err, 'Could not load projects.');
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await readJsonBody(request);
  } catch (err) {
    const e = err as BodyError;
    return NextResponse.json({ error: e.message }, { status: e.status ?? 400 });
  }
  const parsed = createProjectSchema.safeParse(raw);
  if (!parsed.success) return validationResponse(parsed.error);

  try {
    const created = await createDraft(parsed.data, { source: 'admin', createdBy: await adminUserId(request) });
    return NextResponse.json({ ...created, admin_url: adminUrl(request, created.id) }, { status: 201 });
  } catch (err) {
    const { status, body } = errorResponseBody(err, 'Could not save the draft.');
    return NextResponse.json(body, { status });
  }
}
