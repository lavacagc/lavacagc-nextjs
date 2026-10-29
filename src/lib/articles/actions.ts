/**
 * Claude Code as the producer of the SEO queue's drafts.
 *
 * The weekly scorer (/api/cron/seo-suggest) proposes `content_actions`; the
 * OpenAI drafter that used to fill `draft_markdown` is gone (decision 004,
 * Q11). The article routes take its place: an `action_id` on a create, patch
 * or publish ties the article to its action, and the admin's Stage ("Send to
 * blog") and Apply keep working on what Claude wrote (RM6).
 *
 *   new action        create with action_id: the post is the draft; the
 *                     action becomes `drafted` with draft_meta.post_id, so
 *                     Stage links that post instead of inserting a copy.
 *   refresh /         patch the action's live post with action_id: the post is
 *   consolidate       NOT changed; the merged article becomes the action's
 *                     draft, so Apply (or a publish with action_id) can
 *                     snapshot the live post first and the 14-day rollback
 *                     guard keeps working.
 *   any               publish with action_id: the action is marked completed
 *                     and linked to the post, so it leaves the open queue (FB3).
 *
 * Server-only.
 */
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { validateDraft, type Fact } from '@/lib/seo/draftGuardrails';
import { windowMetrics } from '@/lib/seo/rollback';
import { buildBlogPostFromDraft, categoryForQuery } from '@/lib/seo/stageToBlog';
import { ArticleError, type ArticleRow } from './writer';

export type ActionType = 'refresh' | 'consolidate' | 'new';

export interface ContentActionRow {
  id: string;
  action_type: ActionType;
  target_post_id: string | null;
  consolidate_into_id: string | null;
  target_query: string | null;
  rationale: Record<string, unknown> | null;
  status: string;
  draft_markdown: string | null;
  draft_meta: Record<string, unknown> | null;
  published_post_id: string | null;
}

/** Still waiting on a writer: what the feedback route lists as open (FB3). */
export const OPEN_ACTION_STATUSES = ['pending', 'approved', 'drafted'] as const;

const ACTION_COLUMNS =
  'id,action_type,target_post_id,consolidate_into_id,target_query,rationale,status,draft_markdown,draft_meta,published_post_id';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASELINE_WINDOW_DAYS = 14;

export async function getAction(id: string): Promise<ContentActionRow | null> {
  if (!UUID.test(id)) return null;
  const rows = await supabaseRest<ContentActionRow[]>('GET', `content_actions?select=${ACTION_COLUMNS}&id=eq.${id}&limit=1`);
  return rows?.[0] ?? null;
}

/** The action, or a 4xx naming why an article cannot answer it. */
export async function requireOpenAction(id: string): Promise<ContentActionRow> {
  const action = await getAction(id);
  if (!action) throw new ArticleError(404, 'action_id: no such content action.');
  if (!(OPEN_ACTION_STATUSES as readonly string[]).includes(action.status)) {
    throw new ArticleError(409, `action_id: the action is ${action.status}, not open.`);
  }
  return action;
}

/** The live post a refresh or consolidate rewrites. */
export function livePostIdOf(action: ContentActionRow): string | null {
  return action.action_type === 'consolidate' ? action.consolidate_into_id : action.target_post_id;
}

/** The markdown Stage and Apply parse (stageToBlog: title on the first `# ` line). */
export function draftMarkdownFor(article: Pick<ArticleRow, 'title' | 'content'>): string {
  return `# ${article.title.trim()}\n\n${article.content.trim()}\n`;
}

/** Write an article onto its action as the draft, status `drafted`, with the fact-lock verdict. */
export async function recordActionDraft(
  action: ContentActionRow,
  article: Pick<ArticleRow, 'id' | 'title' | 'content' | 'slug'>,
  facts: Fact[],
): Promise<{ status: 'drafted'; validation: ReturnType<typeof validateDraft> }> {
  const markdown = draftMarkdownFor(article);
  const validation = validateDraft(markdown, facts);
  await supabaseRest('PATCH', `content_actions?id=eq.${action.id}`, {
    status: 'drafted',
    draft_markdown: markdown,
    draft_meta: {
      ...(action.draft_meta ?? {}),
      source: 'claude',
      post_id: article.id,
      post_slug: article.slug,
      drafted_at: new Date().toISOString(),
      validation,
    },
  }, { prefer: 'return=minimal' });
  return { status: 'drafted', validation };
}

/** Mark the action done and linked to the post it produced (FB3). */
export async function completeAction(action: ContentActionRow, postId: string, extraMeta: Record<string, unknown> = {}): Promise<void> {
  await supabaseRest('PATCH', `content_actions?id=eq.${action.id}`, {
    status: 'completed',
    published_post_id: postId,
    reviewed_at: new Date().toISOString(),
    draft_meta: { ...(action.draft_meta ?? {}), ...extraMeta, completed_by: 'publish' },
  }, { prefer: 'return=minimal' });
}

/** The fields a refresh or consolidate draft rewrites on the live post. */
export function rebuiltFromDraft(action: ContentActionRow): { title: string; content: string; excerpt: string; meta_description: string } {
  if (!action.draft_markdown) throw new ArticleError(400, 'The action has no draft yet.');
  const rebuilt = buildBlogPostFromDraft(action.draft_markdown, { category: categoryForQuery(action.target_query) });
  return { title: rebuilt.title, content: rebuilt.content, excerpt: rebuilt.excerpt, meta_description: rebuilt.meta_description };
}

interface LivePostRow {
  id: string;
  slug: string;
  title: string;
  content: string | null;
  meta_description: string | null;
  excerpt: string | null;
}

/**
 * APPLY a drafted refresh/consolidate to its live post: the one path that
 * rewrites a published post's body from the queue. Shared by the admin's
 * Apply (/api/admin/content-actions/apply) and a Claude publish with action_id.
 *
 *   1. Snapshot the current post into blog_post_revisions, so the 14-day CTR
 *      guard in /api/cron/seo-rollback can revert it.
 *   2. Record its trailing-14-day CTR as draft_meta.baseline_ctr, the field the
 *      rollback guard reads.
 *   3. PATCH title, content, excerpt and meta description from draft_markdown;
 *      the slug is kept so the URL and inbound links survive.
 *   4. Mark the action completed and linked.
 */
export async function applyActionDraft(action: ContentActionRow, appliedBy: 'apply' | 'claude'): Promise<{ postId: string; slug: string; baselineCtr: number | null }> {
  const livePostId = livePostIdOf(action);
  if (!livePostId) throw new ArticleError(400, 'Action has no target post to apply to.');
  // The fact-lock verdict recorded with the draft binds every caller, Apply and
  // a Claude publish alike (the publish also re-runs it on the merged content).
  const validation = (action.draft_meta as { validation?: { ok?: boolean; issues?: string[] } } | null)?.validation;
  if (validation && validation.ok === false) {
    throw new ArticleError(422, `Draft failed validation - fix before applying: ${(validation.issues ?? []).join(' ')}`);
  }
  const rebuilt = rebuiltFromDraft(action);

  const posts = await supabaseRest<LivePostRow[]>(
    'GET',
    `blog_posts?select=id,slug,title,content,meta_description,excerpt&id=eq.${livePostId}&limit=1`,
  );
  const post = posts?.[0];
  if (!post) throw new ArticleError(404, 'Target blog post not found.');

  await supabaseRest('POST', 'blog_post_revisions', [{
    post_id: post.id,
    title: post.title,
    content_html: post.content,
    meta_description: post.meta_description,
    excerpt: post.excerpt,
    revised_by: appliedBy,
  }], { prefer: 'return=minimal' });

  const windowStart = new Date(Date.now() - BASELINE_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const metricRows = await supabaseRest<Array<{ clicks: number; impressions: number; position: number | null }>>(
    'GET',
    `seo_metrics?select=clicks,impressions,position&source=eq.gsc&url=eq.${encodeURIComponent(`/blog/${post.slug}`)}&date=gte.${windowStart}&limit=5000`,
  );
  const baseline = windowMetrics(metricRows ?? []);

  const now = new Date().toISOString();
  await supabaseRest('PATCH', `blog_posts?id=eq.${post.id}`, { ...rebuilt, updated_at: now }, { prefer: 'return=minimal' });
  await supabaseRest('PATCH', `content_actions?id=eq.${action.id}`, {
    status: 'completed',
    published_post_id: post.id,
    reviewed_at: now,
    draft_meta: { ...(action.draft_meta ?? {}), baseline_ctr: baseline.ctr, applied_at: now, applied_by: appliedBy },
  }, { prefer: 'return=minimal' });

  return { postId: post.id, slug: post.slug, baselineCtr: baseline.ctr };
}
