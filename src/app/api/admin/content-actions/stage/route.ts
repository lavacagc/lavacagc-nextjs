/**
 * Admin: stage an approved AI draft as a blog DRAFT (Phase 3, "you publish").
 * Admin-gated by middleware.
 *
 *   POST { id } → creates a published=false blog_posts row from the draft,
 *   links published_post_id, sets the action to 'completed', and emails the
 *   owner a preview link. Nothing publishes — the owner publishes from the blog
 *   editor.
 *
 * Guardrails: the draft must have passed validation (fact-lock + internal
 * links), and no more than WEEKLY_CAP autogen drafts may be staged per 7 days.
 * Only `new`-article drafts auto-stage; refresh/consolidate rewrite an existing
 * post and are applied manually for now.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/seo/supabase-rest';
import { buildBlogPostFromDraft, categoryForQuery } from '@/lib/seo/stageToBlog';
import { sendStagedDraftEmail } from '@/lib/notify/sendStagedDraftEmail';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WEEKLY_CAP = 3; // max autogen drafts staged per rolling 7 days

interface ActionRow {
  id: string;
  action_type: 'refresh' | 'consolidate' | 'new';
  target_query: string | null;
  draft_markdown: string | null;
  draft_meta: { validation?: { ok?: boolean; issues?: string[] } } | null;
  status: string;
  published_post_id: string | null;
}

async function uniqueSlug(base: string): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const hit = await supabaseRest<{ id: string }[]>('GET', `blog_posts?select=id&slug=eq.${encodeURIComponent(candidate)}`);
    if (!hit || hit.length === 0) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export async function POST(request: NextRequest) {
  try {
    const { id } = (await request.json().catch(() => ({}))) as { id?: string };
    if (!id) return NextResponse.json({ ok: false, error: 'Body must be { id }' }, { status: 400 });

    const rows = await supabaseRest<ActionRow[]>(
      'GET',
      `content_actions?select=id,action_type,target_query,draft_markdown,draft_meta,status,published_post_id&id=eq.${id}`,
    );
    const action = rows?.[0];
    if (!action) return NextResponse.json({ ok: false, error: 'Action not found' }, { status: 404 });
    if (action.published_post_id) {
      return NextResponse.json({ ok: false, error: 'Already staged to the blog.' }, { status: 409 });
    }
    if (action.status !== 'drafted' || !action.draft_markdown) {
      return NextResponse.json({ ok: false, error: 'Draft it with AI before staging.' }, { status: 400 });
    }
    if (action.action_type !== 'new') {
      return NextResponse.json(
        { ok: false, error: 'Only new-article drafts auto-stage. Apply a refresh/consolidate to the existing post manually.' },
        { status: 400 },
      );
    }
    // Guardrail: the draft must have passed fact-lock + internal-link validation.
    if (action.draft_meta?.validation && action.draft_meta.validation.ok === false) {
      return NextResponse.json(
        { ok: false, error: 'Draft failed validation — fix before staging.', issues: action.draft_meta.validation.issues ?? [] },
        { status: 422 },
      );
    }

    // Guardrail: weekly autogen cap.
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recent = await supabaseRest<{ id: string }[]>(
      'GET',
      `content_actions?select=id&status=eq.completed&reviewed_at=gte.${weekAgo}`,
    );
    if ((recent?.length ?? 0) >= WEEKLY_CAP) {
      return NextResponse.json(
        { ok: false, error: `Weekly autogen cap reached (${WEEKLY_CAP}/week). Publish or wait before staging more.` },
        { status: 429 },
      );
    }

    // Build + insert the blog draft.
    const draft = buildBlogPostFromDraft(action.draft_markdown, { category: categoryForQuery(action.target_query) });
    draft.slug = await uniqueSlug(draft.slug);

    const inserted = await supabaseRest<{ id: string; slug: string; title: string }[]>(
      'POST',
      'blog_posts',
      [draft],
      { prefer: 'return=representation' },
    );
    const post = inserted?.[0];
    if (!post?.id) return NextResponse.json({ ok: false, error: 'Failed to create blog draft' }, { status: 502 });

    // Link the action + mark done.
    await supabaseRest(
      'PATCH',
      `content_actions?id=eq.${id}`,
      { published_post_id: post.id, status: 'completed', reviewed_at: new Date().toISOString() },
      { prefer: 'return=minimal' },
    );

    const emailed = await sendStagedDraftEmail({
      title: draft.title,
      slug: draft.slug,
      actionType: action.action_type,
      query: action.target_query,
    });

    return NextResponse.json({ ok: true, postId: post.id, slug: draft.slug, title: draft.title, emailed: emailed.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('content-action stage failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
