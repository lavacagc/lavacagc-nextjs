/**
 * /api/admin/projects/<id>
 *
 * GET    - one project with its media rows, for the edit form.
 * PATCH  - save edits. Status is never changed here: editing a published
 *          project keeps it published (PF7), editing a draft keeps it a draft.
 *          When `images` is sent it replaces the project's media in this one
 *          request (new rows first, old rows deleted last).
 * DELETE - remove the project and its media rows (storage objects are kept).
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  deleteProject, errorResponseBody, getProjectWithImages, updateProject, updateProjectSchema,
} from '@/lib/projects/draft';
import { BodyError, adminUrl, readJsonBody, revalidateProjectPages, validationResponse } from '@/lib/projects/http';
import { adminUserId } from '@/lib/projects/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  try {
    const project = await getProjectWithImages(id);
    if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    return NextResponse.json({ project });
  } catch (err) {
    const { status, body } = errorResponseBody(err, 'Could not load the project.');
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  let raw: unknown;
  try {
    raw = await readJsonBody(request);
  } catch (err) {
    const e = err as BodyError;
    return NextResponse.json({ error: e.message }, { status: e.status ?? 400 });
  }
  const parsed = updateProjectSchema.safeParse(raw);
  if (!parsed.success) return validationResponse(parsed.error);

  try {
    const updated = await updateProject(id, parsed.data, { updatedBy: await adminUserId(request) });
    if (updated.active) revalidateProjectPages(updated.url_slug);
    return NextResponse.json({ ...updated, admin_url: adminUrl(request, updated.id) });
  } catch (err) {
    const { status, body } = errorResponseBody(err, 'Could not save the changes.');
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  try {
    await deleteProject(id);
    revalidateProjectPages();
    return NextResponse.json({ status: 'deleted' });
  } catch (err) {
    const { status, body } = errorResponseBody(err, 'Could not delete the project.');
    return NextResponse.json(body, { status });
  }
}
