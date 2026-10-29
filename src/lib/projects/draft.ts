/**
 * Create, update, publish and unpublish a portfolio project.
 *
 * One implementation behind both doors: the admin form (/api/admin/projects/*)
 * and the ingest API Claude Code uses (/api/projects/ingest/*). Server-only;
 * writes with the service key through supabaseRest, so it does not depend on
 * whatever RLS the `projects` tables carry in a given environment.
 *
 * Visibility rule (decision 002, Q2): `active` is the switch every public
 * reader filters on, `status` is what the admin shows. A draft is always
 * `status='draft', active=false`; only publishProject turns `active` on.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { IMAGE_CATEGORIES, type ProjectSource, type ProjectStatus } from './fields';
import {
  SLUG_MAX, SLUG_PATTERN, defaultAltText, defaultMetaDescription, defaultSeoTitle, deriveSlug,
} from './slug';

/** An error whose message is safe to show the caller. Anything else is logged and answered generically. */
export class ProjectError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ProjectError';
  }
}

const optionalText = (max: number) => z.string().trim().max(max).nullish();
const textList = z.array(z.string().trim().min(1).max(120)).max(50);

export const imageInputSchema = z.object({
  url: z.string().trim().url().max(2048).refine((u) => /^https?:\/\//i.test(u), 'Must be an http(s) URL'),
  media_type: z.enum(['image', 'video']).default('image'),
  category: z.enum(IMAGE_CATEGORIES).default('after'),
  alt_text: optionalText(300),
  is_featured: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(10_000).optional(),
  pair_key: optionalText(100),
  caption: optionalText(200),
});
export type ImageInput = z.infer<typeof imageInputSchema>;

/** `2026-10` or `2026-10-15`; stored as the first of the month. */
const monthOrDate = z.string().trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/, 'Use YYYY-MM')
  .transform((v) => `${v.slice(0, 7)}-01`);

const projectFieldShape = {
  title: z.string().trim().min(1, 'Title is required').max(200),
  location: z.string().trim().min(1, 'Location is required').max(120),
  service_types: z.array(z.string().trim().min(1).max(80)).min(1, 'Pick at least one service type').max(10),
  client_first_name: optionalText(60),
  date_completed: monthOrDate.nullish(),
  budget_range: optionalText(60),
  duration: optionalText(60),
  challenge: optionalText(5000),
  solution: optionalText(5000),
  materials_used: textList.optional(),
  special_features: textList.optional(),
  testimonial_text: optionalText(3000),
  testimonial_rating: z.number().int().min(0).max(5).nullish(),
  seo_title: optionalText(120),
  meta_description: optionalText(320),
  url_slug: z.string().trim().max(SLUG_MAX).regex(SLUG_PATTERN, 'Lowercase letters, digits and hyphens only').nullish()
    .or(z.literal('')),
  focus_keyword: optionalText(120),
};

export const createProjectSchema = z.object({
  ...projectFieldShape,
  images: z.array(imageInputSchema).min(1, 'Add at least one photo or video').max(100),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/** Every field optional; `images`, when present, REPLACES the project's media. */
export const updateProjectSchema = z.object(projectFieldShape).partial().extend({
  images: z.array(imageInputSchema).min(1, 'A project needs at least one photo or video').max(100).optional(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export interface ProjectSummary {
  id: string;
  url_slug: string;
  status: ProjectStatus;
  active: boolean;
  featured: boolean;
}

interface ProjectRow extends ProjectSummary {
  title: string;
  location: string;
  service_types: string[];
  challenge: string | null;
  solution: string | null;
  published_at: string | null;
}

const SUMMARY_COLUMNS = 'id,url_slug,status,active,featured,title,location,service_types,challenge,solution,published_at';

async function readProject(id: string): Promise<ProjectRow | null> {
  if (!z.string().uuid().safeParse(id).success) return null;
  const rows = await supabaseRest<ProjectRow[]>('GET', `projects?select=${SUMMARY_COLUMNS}&id=eq.${id}&limit=1`);
  return rows?.[0] ?? null;
}

function summary(row: ProjectRow): ProjectSummary {
  return { id: row.id, url_slug: row.url_slug, status: row.status, active: row.active, featured: row.featured };
}

/**
 * `base`, or `base-2`, `base-3`... whichever is free. The unique index on
 * url_slug is the real guarantee; this just keeps a normal save from hitting it.
 */
async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = base || `project-${Date.now()}`;
  const rows = await supabaseRest<Array<{ id: string; url_slug: string }>>(
    'GET',
    `projects?select=id,url_slug&url_slug=like.${encodeURIComponent(root)}*&limit=500`,
  );
  const taken = new Set((rows ?? []).filter((r) => r.id !== excludeId).map((r) => r.url_slug));
  if (!taken.has(root)) return root;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${root.slice(0, SLUG_MAX - String(n).length - 1)}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${root.slice(0, SLUG_MAX - 9)}-${Date.now().toString(36)}`;
}

async function slugTakenByOther(slug: string, id: string): Promise<boolean> {
  const rows = await supabaseRest<Array<{ id: string }>>(
    'GET',
    `projects?select=id&url_slug=eq.${encodeURIComponent(slug)}&id=neq.${id}&limit=1`,
  );
  return (rows ?? []).length > 0;
}

/**
 * The image rows to insert: alt text filled, sort order dense, exactly one
 * featured (the flagged one, else the first After, else the first photo), and
 * half-pairs dropped so no orphaned pair key reaches the gallery.
 */
export function normalizeImages(
  images: ImageInput[],
  serviceTypes: readonly string[],
  location: string,
): Array<Required<Omit<ImageInput, 'pair_key' | 'caption' | 'alt_text'>> & {
  alt_text: string; pair_key: string | null; caption: string | null;
}> {
  const ordered = images
    .map((img, i) => ({ img, i }))
    .sort((a, b) => (a.img.sort_order ?? a.i) - (b.img.sort_order ?? b.i) || a.i - b.i)
    .map(({ img }) => img);

  const pairCounts = new Map<string, { before: number; after: number }>();
  for (const img of ordered) {
    if (!img.pair_key || img.media_type === 'video') continue;
    const c = pairCounts.get(img.pair_key) ?? { before: 0, after: 0 };
    if (img.category === 'before') c.before += 1;
    if (img.category === 'after') c.after += 1;
    pairCounts.set(img.pair_key, c);
  }
  const completePair = (key: string | null | undefined) => {
    if (!key) return false;
    const c = pairCounts.get(key);
    return !!c && c.before === 1 && c.after === 1;
  };

  let featuredIndex = ordered.findIndex((img) => img.is_featured);
  if (featuredIndex < 0) featuredIndex = ordered.findIndex((img) => img.category === 'after' && img.media_type === 'image');
  if (featuredIndex < 0) featuredIndex = ordered.findIndex((img) => img.media_type === 'image');
  if (featuredIndex < 0) featuredIndex = 0;

  return ordered.map((img, i) => {
    const paired = img.media_type !== 'video' && completePair(img.pair_key);
    return {
      url: img.url,
      media_type: img.media_type,
      category: img.category,
      alt_text: img.alt_text?.trim() || defaultAltText(img.category, serviceTypes, location),
      is_featured: i === featuredIndex,
      sort_order: i,
      pair_key: paired ? img.pair_key ?? null : null,
      caption: paired ? img.caption?.trim() || null : img.caption?.trim() || null,
    };
  });
}

/** Insert image rows and return the id of the featured one. */
async function insertImages(
  projectId: string,
  images: ReturnType<typeof normalizeImages>,
): Promise<{ ids: string[]; featuredId: string | null }> {
  const rows = images.map((img) => ({
    project_id: projectId,
    image_url: img.url,
    media_type: img.media_type,
    image_category: img.category,
    alt_text: img.alt_text,
    is_featured: img.is_featured,
    sort_order: img.sort_order,
    pair_key: img.pair_key,
    caption: img.caption,
  }));
  const inserted = await supabaseRest<Array<{ id: string; is_featured: boolean }>>(
    'POST',
    'project_images?select=id,is_featured',
    rows,
  );
  const list = inserted ?? [];
  return { ids: list.map((r) => r.id), featuredId: list.find((r) => r.is_featured)?.id ?? null };
}

function nullIfEmpty<T>(value: T | null | undefined): T | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}

/** Column values for the provided fields only; derived SEO defaults filled where asked. */
function columnsFrom(input: Partial<CreateProjectInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const passthrough = [
    'title', 'location', 'service_types', 'client_first_name', 'date_completed', 'budget_range',
    'duration', 'challenge', 'solution', 'testimonial_text', 'testimonial_rating', 'seo_title',
    'meta_description', 'focus_keyword',
  ] as const;
  for (const key of passthrough) {
    if (key in input && input[key] !== undefined) {
      const v = input[key];
      out[key] = key === 'title' || key === 'location' || key === 'service_types' ? v : nullIfEmpty(v);
    }
  }
  if (input.materials_used !== undefined) out.materials_used = input.materials_used;
  if (input.special_features !== undefined) out.special_features = input.special_features;
  return out;
}

export interface CreateOptions {
  source: ProjectSource;
  createdBy?: string | null;
  /** Use this id (the multipart ingest names its storage objects after it before the row exists). */
  id?: string;
}

/** Insert a draft. Never public: `status='draft', active=false, featured=false`. */
export async function createDraft(input: CreateProjectInput, opts: CreateOptions): Promise<ProjectSummary> {
  const id = opts.id ?? randomUUID();
  const images = normalizeImages(input.images, input.service_types, input.location);
  const challenge = input.challenge ?? '';
  const solution = input.solution ?? '';

  const requestedSlug = input.url_slug ? input.url_slug : deriveSlug(input.title, input.location);
  const slug = await uniqueSlug(requestedSlug);

  const row = {
    ...columnsFrom(input),
    id,
    url_slug: slug,
    seo_title: nullIfEmpty(input.seo_title) ?? defaultSeoTitle(input.title, input.location),
    meta_description: nullIfEmpty(input.meta_description)
      ?? defaultMetaDescription(challenge, solution, input.service_types, input.location),
    status: 'draft',
    active: false,
    featured: false,
    source: opts.source,
    sort_order: 999,
    created_by: opts.createdBy ?? null,
    updated_by: opts.createdBy ?? null,
  };

  await supabaseRest('POST', 'projects', [row], { prefer: 'return=minimal' });
  try {
    const { featuredId } = await insertImages(id, images);
    if (featuredId) {
      await supabaseRest('PATCH', `projects?id=eq.${id}`, { featured_image_id: featuredId }, { prefer: 'return=minimal' });
    }
  } catch (err) {
    // A project with no media is worse than no project: roll the row back.
    await supabaseRest('DELETE', `projects?id=eq.${id}`, undefined, { prefer: 'return=minimal' }).catch(() => undefined);
    throw err;
  }
  return { id, url_slug: slug, status: 'draft', active: false, featured: false };
}

export interface UpdateOptions {
  updatedBy?: string | null;
  /**
   * The ingest API may only touch drafts unless the caller says otherwise; the
   * admin form edits anything (PF7: editing a published project keeps it live).
   */
  refusePublished?: boolean;
}

/**
 * Update the provided fields, and replace the media when `images` is sent.
 *
 * Status, `active` and `featured` are NOT touched: an edit never publishes or
 * unpublishes anything. Media replacement inserts the new rows first, points
 * `featured_image_id` at the new featured row, and only then deletes the old
 * rows, so a failure part-way leaves extra images rather than none.
 */
export async function updateProject(id: string, input: UpdateProjectInput, opts: UpdateOptions = {}): Promise<ProjectSummary> {
  const current = await readProject(id);
  if (!current) throw new ProjectError(404, 'Project not found.');
  if (opts.refusePublished && current.status === 'published') {
    throw new ProjectError(409, 'This project is published. Send allow_published: true to edit it anyway.');
  }

  const patch: Record<string, unknown> = columnsFrom(input as Partial<CreateProjectInput>);
  if (input.url_slug !== undefined && input.url_slug !== null && input.url_slug !== '' && input.url_slug !== current.url_slug) {
    if (await slugTakenByOther(input.url_slug, id)) {
      throw new ProjectError(409, 'That URL slug is already used by another project.');
    }
    patch.url_slug = input.url_slug;
  }

  let oldImageIds: string[] = [];
  if (input.images) {
    const serviceTypes = input.service_types ?? current.service_types;
    const location = input.location ?? current.location;
    const normalized = normalizeImages(input.images, serviceTypes, location);
    const existing = await supabaseRest<Array<{ id: string }>>(
      'GET',
      `project_images?select=id&project_id=eq.${id}&limit=1000`,
    );
    oldImageIds = (existing ?? []).map((r) => r.id);
    const { featuredId } = await insertImages(id, normalized);
    patch.featured_image_id = featuredId;
  }

  patch.updated_at = new Date().toISOString();
  if (opts.updatedBy) patch.updated_by = opts.updatedBy;
  await supabaseRest('PATCH', `projects?id=eq.${id}`, patch, { prefer: 'return=minimal' });

  if (oldImageIds.length > 0) {
    await supabaseRest(
      'DELETE',
      `project_images?project_id=eq.${id}&id=in.(${oldImageIds.join(',')})`,
      undefined,
      { prefer: 'return=minimal' },
    );
  }

  const after = await readProject(id);
  return summary(after ?? current);
}

/** Make a project public. Idempotent; `feature` also puts it on the homepage. */
export async function publishProject(id: string, opts: { feature?: boolean } = {}): Promise<ProjectSummary> {
  const current = await readProject(id);
  if (!current) throw new ProjectError(404, 'Project not found.');
  const media = await supabaseRest<Array<{ id: string }>>('GET', `project_images?select=id&project_id=eq.${id}&limit=1`);
  if ((media ?? []).length === 0) throw new ProjectError(422, 'Add at least one photo before publishing.');

  const patch: Record<string, unknown> = {
    status: 'published',
    active: true,
    updated_at: new Date().toISOString(),
  };
  if (current.status !== 'published' || !current.published_at) patch.published_at = new Date().toISOString();
  if (opts.feature) patch.featured = true;
  await supabaseRest('PATCH', `projects?id=eq.${id}`, patch, { prefer: 'return=minimal' });
  return {
    id,
    url_slug: current.url_slug,
    status: 'published',
    active: true,
    featured: opts.feature ? true : current.featured,
  };
}

/** Take a project off the site and back to Drafts. */
export async function unpublishProject(id: string): Promise<ProjectSummary> {
  const current = await readProject(id);
  if (!current) throw new ProjectError(404, 'Project not found.');
  await supabaseRest('PATCH', `projects?id=eq.${id}`, {
    status: 'draft',
    active: false,
    updated_at: new Date().toISOString(),
  }, { prefer: 'return=minimal' });
  return { ...summary(current), status: 'draft', active: false };
}

export async function deleteProject(id: string): Promise<void> {
  const current = await readProject(id);
  if (!current) throw new ProjectError(404, 'Project not found.');
  // Clear the FK into project_images first; the image rows cascade with the project.
  await supabaseRest('PATCH', `projects?id=eq.${id}`, { featured_image_id: null }, { prefer: 'return=minimal' });
  await supabaseRest('DELETE', `projects?id=eq.${id}`, undefined, { prefer: 'return=minimal' });
}

/** The admin list: every project with its media, newest first. */
export async function listProjects(): Promise<unknown[]> {
  return (await supabaseRest<unknown[]>(
    'GET',
    'projects?select=*,project_images!project_images_project_id_fkey(id,image_url,is_featured,image_category,media_type,sort_order)'
      + '&order=sort_order.asc,created_at.desc&limit=500',
  )) ?? [];
}

/** One project with its full media rows, for the edit form. */
export async function getProjectWithImages(id: string): Promise<unknown | null> {
  if (!z.string().uuid().safeParse(id).success) return null;
  const rows = await supabaseRest<unknown[]>(
    'GET',
    `projects?select=*,project_images!project_images_project_id_fkey(*)&id=eq.${id}&limit=1`,
  );
  return rows?.[0] ?? null;
}

/** Which of these image URLs already belong to a project. */
export async function urlsInUse(urls: string[]): Promise<Set<string>> {
  const used = new Set<string>();
  for (let i = 0; i < urls.length; i += 50) {
    const chunk = urls.slice(i, i + 50);
    const list = chunk.map((u) => `"${u.replace(/"/g, '\\"')}"`).join(',');
    const rows = await supabaseRest<Array<{ image_url: string }>>(
      'GET',
      `project_images?select=image_url&image_url=in.(${encodeURIComponent(list)})&limit=1000`,
    );
    for (const r of rows ?? []) used.add(r.image_url);
  }
  return used;
}

/** The answer for an error thrown by anything above: its own sentence, or a generic one. */
export function errorResponseBody(err: unknown, fallback: string): { status: number; body: { error: string } } {
  if (err instanceof ProjectError) return { status: err.status, body: { error: err.message } };
  const message = err instanceof Error ? err.message : String(err);
  if (/duplicate key|23505/i.test(message) && /url_slug/i.test(message)) {
    return { status: 409, body: { error: 'That URL slug is already used by another project.' } };
  }
  console.error(`${fallback}:`, message);
  return { status: 500, body: { error: fallback } };
}
