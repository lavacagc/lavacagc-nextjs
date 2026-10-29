/**
 * The ingest API's door: who may call it, and how its image references become
 * the same image inputs the admin form sends. Server-only.
 *
 * Auth (decision 002, Q5; SEC4): `Authorization: Bearer <PROJECT_INGEST_TOKEN>`
 * compared in constant time, OR a signed-in admin session. With the token unset
 * (or under 32 characters) every route here answers 404 to everyone.
 * Every call is rate limited by IP, 30 a minute, before auth is even checked,
 * so the token cannot be guessed at speed.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { IMAGE_CATEGORIES, SERVICE_TYPES } from './fields';
import { ProjectError, createProjectSchema, updateProjectSchema, type ImageInput } from './draft';
import { checkIngestToken } from './ingestAuth';
import { adminUserId } from './session';
import { isSafeObjectPath, pathFromPublicUrl, publicUrlFor, sniffStoredObject } from './storage';
import { UNSUPPORTED_MEDIA_MESSAGE } from './media';

export const INGEST_RATE_LIMIT = 30;
export const INGEST_RATE_WINDOW_MS = 60_000;

export type IngestCaller = { ok: true; via: 'token' | 'session'; userId: string | null } | { ok: false; response: NextResponse };

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 });

export async function authorizeIngest(request: NextRequest): Promise<IngestCaller> {
  const verdict = checkIngestToken(request.headers.get('authorization'));
  if (verdict === 'disabled') return { ok: false, response: notFound() };

  const rl = await checkRateLimit(`project-ingest:${getClientIp(request)}`, INGEST_RATE_LIMIT, INGEST_RATE_WINDOW_MS);
  if (!rl.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Too many requests. Try again in a minute.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
      ),
    };
  }

  if (verdict === 'valid') return { ok: true, via: 'token', userId: null };
  if (verdict === 'invalid') return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const userId = await adminUserId(request);
  if (userId) return { ok: true, via: 'session', userId };
  return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
}

/**
 * One image as the ingest API takes it: a key inside the bucket (`path`), a
 * public URL in the bucket (`url`), or, in a multipart call, the index of one
 * of the uploaded `files[]` (`file`). Exactly one of the three.
 */
export const ingestImageSchema = z.object({
  path: z.string().trim().min(1).max(255).optional(),
  url: z.string().trim().url().max(2048).optional(),
  file: z.number().int().min(0).max(99).optional(),
  category: z.enum(IMAGE_CATEGORIES).default('after'),
  alt_text: z.string().trim().max(300).nullish(),
  is_featured: z.boolean().optional(),
  pair_key: z.string().trim().max(100).nullish(),
  caption: z.string().trim().max(200).nullish(),
}).refine((v) => [v.path, v.url, v.file].filter((x) => x !== undefined).length === 1, {
  message: 'Each image needs exactly one of path, url or file',
});
export type IngestImage = z.infer<typeof ingestImageSchema>;

const ingestServiceTypes = z.array(z.enum(SERVICE_TYPES, {
  message: `Service types must be from: ${SERVICE_TYPES.join(', ')}`,
})).min(1, 'Pick at least one service type').max(6);

export const ingestCreateSchema = createProjectSchema.omit({ images: true }).extend({
  service_types: ingestServiceTypes,
  images: z.array(ingestImageSchema).max(100).default([]),
});
export type IngestCreate = z.infer<typeof ingestCreateSchema>;

export const ingestUpdateSchema = updateProjectSchema.omit({ images: true }).extend({
  service_types: ingestServiceTypes.optional(),
  images: z.array(ingestImageSchema).min(1).max(100).optional(),
  allow_published: z.boolean().optional(),
});

/** A stored file from this same multipart call, by index. */
export interface UploadedFile {
  url: string;
  media_type: 'image' | 'video';
}

/**
 * Turn ingest image references into admin-form image inputs. Every `path` and
 * `url` is confirmed to be an object in OUR bucket whose bytes are an accepted
 * type; the media type comes from those bytes, not from the caller.
 */
export async function resolveIngestImages(images: IngestImage[], uploaded: UploadedFile[] = []): Promise<ImageInput[]> {
  const referenced = new Set<number>();
  const out: ImageInput[] = [];
  for (const [i, img] of images.entries()) {
    let url: string;
    let mediaType: 'image' | 'video';
    if (img.file !== undefined) {
      const f = uploaded[img.file];
      if (!f) throw new ProjectError(400, `images[${i}].file: there is no files[${img.file}] in this request.`);
      referenced.add(img.file);
      url = f.url;
      mediaType = f.media_type;
    } else {
      const path = img.path ?? pathFromPublicUrl(img.url ?? '');
      if (!path || !isSafeObjectPath(path)) {
        throw new ProjectError(400, `images[${i}]: must be a path or public URL inside the project-images bucket.`);
      }
      const media = await sniffStoredObject(path);
      if (!media) throw new ProjectError(422, `images[${i}] (${path}): not found, or ${UNSUPPORTED_MEDIA_MESSAGE}`);
      url = publicUrlFor(path);
      mediaType = media.kind;
    }
    out.push({
      url,
      media_type: mediaType,
      category: img.category,
      alt_text: img.alt_text ?? null,
      is_featured: img.is_featured,
      sort_order: out.length,
      pair_key: img.pair_key ?? null,
      caption: img.caption ?? null,
    });
  }
  // Files nobody referenced are still the caller's photos: add them as After.
  uploaded.forEach((f, n) => {
    if (referenced.has(n)) return;
    out.push({ url: f.url, media_type: f.media_type, category: 'after', sort_order: out.length });
  });
  return out;
}

export function ingestAnswer(
  request: NextRequest,
  project: { id: string; url_slug: string; status: string },
  adminUrlFor: (request: NextRequest, id: string) => string,
  status = 200,
): NextResponse {
  return NextResponse.json({
    id: project.id,
    url_slug: project.url_slug,
    status: project.status,
    admin_url: adminUrlFor(request, project.id),
  }, { status });
}
