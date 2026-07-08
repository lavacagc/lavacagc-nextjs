/**
 * Admin: APPLY a drafted refresh/consolidate to the live blog post (Phase 3).
 * Admin-gated by middleware (/api/admin/* requires a Supabase session).
 *
 *   POST { id } → for a status='drafted' refresh|consolidate action:
 *     1. Snapshot the CURRENT live blog_posts row into blog_post_revisions (so the
 *        14-day CTR guard in /api/cron/seo-rollback can revert if this hurts).
 *     2. Record the post's trailing-14-day CTR as draft_meta.baseline_ctr — the
 *        exact field seo-rollback reads to decide whether to auto-revert.
 *     3. PATCH the live post's title/content/meta/excerpt from draft_markdown.
 *     4. Link published_post_id + mark the action 'completed'.
 *
 * This is the human-clicked companion to stage/route.ts. stage/ stays new-only;
 * this route is the ONLY path that mutates an existing published post.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/seo/supabase-rest';
import { buildBlogPostFromDraft, categoryForQuery } from '@/lib/seo/stageToBlog';
import { windowMetrics } from '@/lib/seo/rollback';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BASELINE_WINDOW_DAYS = 14;

interface ActionRow {
  id: string;
  action_type: 'refresh' | 'consolidate' | 'new';
  target_post_id: string | null;
  consolidate_into_id: string | null;
  target_query: string | null;
  draft_markdown: string | null;
  draft_meta: Record<string, unknown> | null;
  status: string;
  published_post_id: string | null;
}

interface PostRow {
  id: string;
  slug: string;
  title: string;
  content: string | null;
  meta_description: string | null;
  excerpt: string | null;
}

interface MetricRow {
  clicks: number;
  impressions: number;
  position: number | null;
}

export async function POST(request: NextRequest) {
  try {
    const { id } = (await request.json().catch(() => ({}))) as { id?: string };
    if (!id) return NextResponse.json({ ok: false, error: 'Body must be { id }' }, { status: 400 });

    const rows = await supabaseRest<ActionRow[]>(
      'GET',
      `content_actions?select=id,action_type,target_post_id,consolidate_into_id,target_query,draft_markdown,draft_meta,status,published_post_id&id=eq.${id}`,
    );
    const action = rows?.[0];
    if (!action) return NextResponse.json({ ok: false, error: 'Action not found' }, { status: 404 });

    if (action.action_type === 'new') {
      return NextResponse.json(
        { ok: false, error: 'Use /stage for new-article drafts. Apply only handles refresh/consolidate.' },
        { status: 400 },
      );
    }
    if (action.status !== 'drafted' || !action.draft_markdown) {
      return NextResponse.json({ ok: false, error: 'Draft it with AI before applying.' }, { status: 400 });
    }
    if (action.published_post_id) {
      return NextResponse.json({ ok: false, error: 'Already applied.' }, { status: 409 });
    }
    // Guardrail: honor the fact-lock validation the drafter recorded.
    const validation = (action.draft_meta as { validation?: { ok?: boolean; issues?: string[] } } | null)?.validation;
    if (validation && validation.ok === false) {
      return NextResponse.json(
        { ok: false, error: 'Draft failed validation — fix before applying.', issues: validation.issues ?? [] },
        { status: 422 },
      );
    }

    // The live post to mutate. For consolidate the primary is consolidate_into_id;
    // for refresh it's target_post_id.
    const livePostId =
      action.action_type === 'consolidate' ? action.consolidate_into_id : action.target_post_id;
    if (!livePostId) {
      return NextResponse.json({ ok: false, error: 'Action has no target post to apply to.' }, { status: 400 });
    }

    const posts = await supabaseRest<PostRow[]>(
      'GET',
      `blog_posts?select=id,slug,title,content,meta_description,excerpt&id=eq.${livePostId}`,
    );
    const post = posts?.[0];
    if (!post) return NextResponse.json({ ok: false, error: 'Target blog post not found.' }, { status: 404 });

    // 1) Snapshot the current live content BEFORE overwriting, so rollback can
    // restore it. Columns match what /api/cron/seo-rollback reads back
    // (title, content_html, meta_description, excerpt).
    await supabaseRest(
      'POST',
      'blog_post_revisions',
      [
        {
          post_id: post.id,
          title: post.title,
          content_html: post.content,
          meta_description: post.meta_description,
          excerpt: post.excerpt,
          revised_by: 'apply',
        },
      ],
      { prefer: 'return=minimal' },
    );

    // 2) Baseline CTR — trailing-14-day GSC performance of the post as it stands.
    // Stored as draft_meta.baseline_ctr, the field seo-rollback reads to decide
    // whether the change hurt enough to auto-revert.
    const windowStart = new Date(Date.now() - BASELINE_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
    const metricRows = await supabaseRest<MetricRow[]>(
      'GET',
      `seo_metrics?select=clicks,impressions,position&source=eq.gsc&url=eq.${encodeURIComponent(`/blog/${post.slug}`)}&date=gte.${windowStart}`,
    );
    const baseline = windowMetrics(metricRows ?? []);

    // 3) Build the new fields from the draft markdown and PATCH the live post.
    // Slug is intentionally left untouched to preserve the URL + inbound links.
    const rebuilt = buildBlogPostFromDraft(action.draft_markdown, {
      category: categoryForQuery(action.target_query),
    });
    await supabaseRest(
      'PATCH',
      `blog_posts?id=eq.${post.id}`,
      {
        title: rebuilt.title,
        content: rebuilt.content,
        excerpt: rebuilt.excerpt,
        meta_description: rebuilt.meta_description,
        updated_at: new Date().toISOString(),
      },
      { prefer: 'return=minimal' },
    );

    // 4) Mark the action completed + link the post, and stamp the baseline CTR so
    // the rollback guard has a pre-change reference. published_post_id must be set
    // for seo-rollback to pick this post up for the 14-day review.
    const mergedMeta = { ...(action.draft_meta ?? {}), baseline_ctr: baseline.ctr, applied_at: new Date().toISOString() };
    await supabaseRest(
      'PATCH',
      `content_actions?id=eq.${id}`,
      {
        status: 'completed',
        published_post_id: post.id,
        reviewed_at: new Date().toISOString(),
        draft_meta: mergedMeta,
      },
      { prefer: 'return=minimal' },
    );

    return NextResponse.json({
      ok: true,
      id,
      postId: post.id,
      slug: post.slug,
      status: 'completed',
      baselineCtr: baseline.ctr,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('content-action apply failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
