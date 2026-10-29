/**
 * POST /api/projects/ingest - create a portfolio DRAFT from Claude Code (or any
 * script holding PROJECT_INGEST_TOKEN). Never publishes; see ./[id]/publish.
 *
 * Auth: `Authorization: Bearer <PROJECT_INGEST_TOKEN>` or an admin session
 * (src/lib/projects/ingest.ts). Token unset means 404 for everyone.
 *
 * Two body shapes:
 * - JSON: `{ title, location, service_types, images: [{ path | url, category, ... }], ...optional fields }`
 *   where `path` is a key inside `project-images` (e.g. `drafts/x.jpg`) and
 *   `url` a public URL inside that bucket. Each is checked to exist and to be
 *   an accepted media type by its bytes.
 * - multipart/form-data: a `project` field holding that JSON, plus `files[]`.
 *   Each file is sniffed and stored as `projects/<id>_<n>.<ext>`; an image entry
 *   can point at one with `{ file: n }`, and unreferenced files become After photos.
 *
 * Answers `{ id, url_slug, status, admin_url }`. Errors never echo server detail.
 * Docs: docs/projects-ingest.md.
 */
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createDraft, errorResponseBody, ProjectError } from '@/lib/projects/draft';
import { BodyError, adminUrl, readJsonBody, validationResponse } from '@/lib/projects/http';
import {
  authorizeIngest, ingestAnswer, ingestCreateSchema, resolveIngestImages, type UploadedFile,
} from '@/lib/projects/ingest';
import { removeObjects } from '@/lib/projects/storage';
import { storeFile } from '@/lib/projects/uploads';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Self-hosted ceiling. On Vercel the platform caps a function body at 4.5 MB first. */
const MAX_MULTIPART_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 30;

export async function POST(request: NextRequest) {
  const caller = await authorizeIngest(request);
  if ('response' in caller) return caller.response;

  const isMultipart = (request.headers.get('content-type') ?? '').startsWith('multipart/form-data');
  let raw: unknown;
  let files: File[] = [];

  if (isMultipart) {
    const declared = Number(request.headers.get('content-length') ?? '0');
    if (declared > MAX_MULTIPART_BYTES) return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 });
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Invalid multipart body.' }, { status: 400 });
    }
    const projectField = form.get('project');
    if (typeof projectField !== 'string' || projectField.length > 256 * 1024) {
      return NextResponse.json({ error: 'Multipart calls need a `project` field holding the project JSON.' }, { status: 400 });
    }
    try {
      raw = JSON.parse(projectField);
    } catch {
      return NextResponse.json({ error: 'The `project` field is not valid JSON.' }, { status: 400 });
    }
    files = [...form.getAll('files[]'), ...form.getAll('files')].filter((f): f is File => f instanceof File);
    if (files.length > MAX_FILES) return NextResponse.json({ error: `At most ${MAX_FILES} files per call.` }, { status: 413 });
  } else {
    try {
      raw = await readJsonBody(request);
    } catch (err) {
      const e = err as BodyError;
      return NextResponse.json({ error: e.message }, { status: e.status ?? 400 });
    }
  }

  const parsed = ingestCreateSchema.safeParse(raw);
  if (!parsed.success) return validationResponse(parsed.error);
  if (parsed.data.images.length === 0 && files.length === 0) {
    return NextResponse.json({ error: 'Add at least one image (a storage path, a URL, or a file).' }, { status: 400 });
  }

  const id = randomUUID();
  const storedPaths: string[] = [];
  try {
    const uploaded: UploadedFile[] = [];
    for (const [n, file] of files.entries()) {
      const stored = await storeFile(file, (ext) => `projects/${id}_${n}.${ext}`);
      storedPaths.push(stored.path);
      uploaded.push({ url: stored.url, media_type: stored.media_type });
    }
    const images = await resolveIngestImages(parsed.data.images, uploaded);
    if (images.length === 0) throw new ProjectError(400, 'Add at least one image.');
    const created = await createDraft({ ...parsed.data, images }, { source: 'api', createdBy: caller.userId, id });
    return ingestAnswer(request, created, adminUrl, 201);
  } catch (err) {
    // Nothing half-made survives a failed call: drop what this call stored.
    await removeObjects(storedPaths);
    const { status, body } = errorResponseBody(err, 'Could not create the draft.');
    return NextResponse.json(body, { status });
  }
}
