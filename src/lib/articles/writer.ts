/**
 * The server-side blog writer behind the article routes.
 *
 * Until Phase 2 every blog write outside the crons came from the browser with
 * the admin's session (BlogPostEditor, BlogPostList). Claude Code has no
 * session, so this writes with the service key through supabaseRest and does
 * not depend on whatever RLS `blog_posts` carries in a given environment.
 *
 * Visibility is the existing `published` boolean. A Claude draft is always
 * `published = false, source = 'claude'`; only publishArticle turns it on.
 *
 * Server-only.
 */
import { randomUUID } from 'node:crypto';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { slugify } from '@/lib/projects/slug';
import type { Fact } from '@/lib/seo/draftGuardrails';
import { toPlain } from '@/lib/seo/stageToBlog';
import { ARTICLE_SLUG_MAX, readFaq, type ArticleCreate, type ArticleUpdate, type FaqItem } from './schemas';

/** An error whose message is safe to show the caller. Anything else is logged and answered generically. */
export class ArticleError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ArticleError';
  }
}

export interface ArticleRow {
  id: string;
  title: string;
  slug: string;
  content: string;
  category: string;
  excerpt: string | null;
  meta_title: string | null;
  meta_description: string | null;
  meta_keywords: string | null;
  featured_image: string | null;
  faq: FaqItem[] | null;
  published: boolean;
  published_at: string | null;
  review_hold: { reasons: string[]; checked_at: string } | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

const ROW_COLUMNS = [
  'id', 'title', 'slug', 'content', 'category', 'excerpt', 'meta_title', 'meta_description',
  'meta_keywords', 'featured_image', 'faq', 'published', 'published_at', 'review_hold', 'source',
  'created_at', 'updated_at',
].join(',');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_AUTHOR = 'Alex T.';
const EXCERPT_MAX = 200;
const META_DESCRIPTION_MAX = 155;

/** Cut at a word boundary, with an ellipsis only when something was cut. */
function cutAtWord(text: string, max: number, ellipsis = false): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(' ');
  const base = (lastSpace > max / 2 ? cut.slice(0, lastSpace) : text.slice(0, max)).replace(/[\s,;:.-]+$/, '');
  return ellipsis ? `${base}…` : base;
}

/**
 * The article's opening paragraph as plain text, for the list card and the
 * meta description. Only the first block of prose: running on into the next
 * heading read as "...the plans. What drives the timeline".
 */
export function defaultExcerpt(markdown: string): string {
  const blocks = markdown.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const opening = blocks.find((b) => !/^(#|>|[-*+]\s|\d+\.\s|!\[|```|\|)/.test(b)) ?? markdown;
  return cutAtWord(toPlain(opening), EXCERPT_MAX, true);
}

export function defaultMetaDescription(excerpt: string | null | undefined, markdown: string): string {
  const source = (excerpt ?? '').trim() || toPlain(markdown);
  return cutAtWord(source.replace(/…$/, ''), META_DESCRIPTION_MAX);
}

export async function getArticle(id: string): Promise<ArticleRow | null> {
  if (!UUID.test(id)) return null;
  const rows = await supabaseRest<ArticleRow[]>('GET', `blog_posts?select=${ROW_COLUMNS}&id=eq.${id}&limit=1`);
  const row = rows?.[0];
  if (!row) return null;
  const faq = readFaq(row.faq);
  return { ...row, faq: faq.length > 0 ? faq : null };
}

export async function requireArticle(id: string): Promise<ArticleRow> {
  const row = await getArticle(id);
  if (!row) throw new ArticleError(404, 'Article not found.');
  return row;
}

/**
 * `root`, or `root-2`, `root-3`... - the first slug no other post holds (ART6).
 * One bounded read of every slug that starts with the root. A unique index on
 * slug, where the environment has one, is the real guarantee; this keeps a
 * normal create from hitting it.
 */
export async function uniqueArticleSlug(requested: string, excludeId?: string): Promise<string> {
  const root = slugify(requested, ARTICLE_SLUG_MAX - 4) || 'article';
  const rows = await supabaseRest<Array<{ id: string; slug: string }>>(
    'GET',
    `blog_posts?select=id,slug&slug=like.${encodeURIComponent(root)}*&limit=500`,
  );
  const taken = new Set((rows ?? []).filter((r) => r.id !== excludeId).map((r) => r.slug));
  if (!taken.has(root)) return root;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${root}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new ArticleError(409, 'Could not find a free slug; send one explicitly.');
}

async function slugTakenByOther(slug: string, id: string): Promise<boolean> {
  const rows = await supabaseRest<Array<{ id: string }>>(
    'GET',
    `blog_posts?select=id&slug=eq.${encodeURIComponent(slug)}&id=neq.${id}&limit=1`,
  );
  return (rows ?? []).length > 0;
}

/** The fields both create and update write, with server defaults for what was left out. */
function writableFields(input: Partial<ArticleCreate>) {
  const out: Record<string, unknown> = {};
  if (input.title !== undefined) out.title = input.title;
  if (input.content !== undefined) out.content = input.content;
  if (input.category !== undefined) out.category = input.category;
  if (input.excerpt !== undefined) out.excerpt = input.excerpt ?? null;
  if (input.meta_title !== undefined) out.meta_title = input.meta_title ?? null;
  if (input.meta_description !== undefined) out.meta_description = input.meta_description ?? null;
  if (input.meta_keywords !== undefined) out.meta_keywords = input.meta_keywords ?? null;
  if (input.featured_image !== undefined) out.featured_image = input.featured_image ?? null;
  if (input.faq !== undefined) out.faq = input.faq && input.faq.length > 0 ? input.faq : null;
  return out;
}

/** Create an unpublished Claude draft (ART2). */
export async function createArticle(input: ArticleCreate): Promise<ArticleRow> {
  const id = randomUUID();
  const slug = await uniqueArticleSlug(input.slug || input.title);
  const excerpt = input.excerpt || defaultExcerpt(input.content);
  const now = new Date().toISOString();
  const row = {
    id,
    slug,
    author: DEFAULT_AUTHOR,
    featured_image: '',
    meta_keywords: '',
    ...writableFields(input),
    excerpt,
    meta_title: input.meta_title || input.title,
    meta_description: input.meta_description || defaultMetaDescription(excerpt, input.content),
    published: false,
    published_at: null,
    review_hold: null,
    source: 'claude',
    created_at: now,
    updated_at: now,
  };
  await supabaseRest('POST', 'blog_posts', [row], { prefer: 'return=minimal' });
  return requireArticle(id);
}

/**
 * Change fields of any post, draft or live (ART3). `published` is never
 * touched here; publish and unpublish have their own routes.
 * Returns the post before and after, so the caller can revalidate the old slug.
 */
export async function updateArticle(id: string, input: ArticleUpdate): Promise<{ before: ArticleRow; after: ArticleRow }> {
  const before = await requireArticle(id);
  const patch: Record<string, unknown> = { ...writableFields(input), updated_at: new Date().toISOString() };
  if (input.slug && input.slug !== before.slug) {
    if (await slugTakenByOther(input.slug, id)) throw new ArticleError(409, 'That slug is already used by another post.');
    patch.slug = input.slug;
  }
  await supabaseRest('PATCH', `blog_posts?id=eq.${id}`, patch, { prefer: 'return=minimal' });
  return { before, after: await requireArticle(id) };
}

/** The post with an update applied, without writing it: what an action draft or the guard sees. */
export function mergeArticle(post: ArticleRow, input: ArticleUpdate): ArticleRow {
  const fields = writableFields(input) as Partial<ArticleRow>;
  return { ...post, ...fields, slug: input.slug || post.slug };
}

/**
 * Go live (ART4). `published_at` is stamped on the transition from draft to
 * live only; publishing a post that is already live keeps its date (a refresh
 * changes dateModified, not datePublished). Any review hold is cleared.
 */
export async function publishArticle(post: ArticleRow): Promise<ArticleRow> {
  const now = new Date().toISOString();
  await supabaseRest('PATCH', `blog_posts?id=eq.${post.id}`, {
    published: true,
    ...(post.published && post.published_at ? {} : { published_at: now }),
    review_hold: null,
    scheduled_publish_at: null,
    updated_at: now,
  }, { prefer: 'return=minimal' });
  return requireArticle(post.id);
}

/** Record why the guard held a publish; the post stays as it was (PG2 uses this shape). */
export async function holdArticle(post: ArticleRow, reasons: string[]): Promise<void> {
  await supabaseRest('PATCH', `blog_posts?id=eq.${post.id}`, {
    review_hold: { reasons, checked_at: new Date().toISOString() },
  }, { prefer: 'return=minimal' });
}

/** Take it down (ART5). `published_at` is kept as the record of the last publish. */
export async function unpublishArticle(post: ArticleRow): Promise<ArticleRow> {
  await supabaseRest('PATCH', `blog_posts?id=eq.${post.id}`, {
    published: false,
    updated_at: new Date().toISOString(),
  }, { prefer: 'return=minimal' });
  return requireArticle(post.id);
}

/** The locked facts (content_facts) the guard and validateDraft read. A small table; capped anyway. */
export async function loadContentFacts(): Promise<Fact[]> {
  const rows = await supabaseRest<Fact[]>('GET', 'content_facts?select=key,value,description&limit=100');
  return rows ?? [];
}

export function errorResponseBody(err: unknown, fallback: string): { status: number; body: { error: string } } {
  if (err instanceof ArticleError) return { status: err.status, body: { error: err.message } };
  const message = err instanceof Error ? err.message : String(err);
  if (/duplicate key|23505/i.test(message) && /slug/i.test(message)) {
    return { status: 409, body: { error: 'That slug is already used by another post.' } };
  }
  console.error(`${fallback}:`, message);
  return { status: 500, body: { error: fallback } };
}
