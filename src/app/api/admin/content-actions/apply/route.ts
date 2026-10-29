/**
 * Admin: APPLY a drafted refresh/consolidate to the live blog post (Phase 3).
 * Admin-gated by middleware (/api/admin/* requires a Supabase session).
 *
 *   POST { id } → for a status='drafted' refresh|consolidate action, runs
 *   applyActionDraft (src/lib/articles/actions.ts): snapshot the live post into
 *   blog_post_revisions, record its trailing-14-day CTR as
 *   draft_meta.baseline_ctr (what /api/cron/seo-rollback reads), rewrite the
 *   post from draft_markdown, and mark the action completed. The public pages
 *   are revalidated so the rewrite shows at once.
 *
 * The draft comes from Claude Code: a PATCH /api/articles/ingest/<post id>
 * with the action's id writes it onto the action without touching the post.
 * A Claude publish with the same action_id applies it through the same
 * function. stage/ stays new-only; these two are the ONLY paths that rewrite
 * a published post from the queue.
 */
import { NextRequest, NextResponse } from 'next/server';
import { applyActionDraft, getAction } from '@/lib/articles/actions';
import { revalidateArticlePages } from '@/lib/articles/revalidate';
import { ArticleError } from '@/lib/articles/writer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { id } = (await request.json().catch(() => ({}))) as { id?: string };
    if (!id) return NextResponse.json({ ok: false, error: 'Body must be { id }' }, { status: 400 });

    const action = await getAction(id);
    if (!action) return NextResponse.json({ ok: false, error: 'Action not found' }, { status: 404 });

    if (action.action_type === 'new') {
      return NextResponse.json(
        { ok: false, error: 'Use /stage for new-article drafts. Apply only handles refresh/consolidate.' },
        { status: 400 },
      );
    }
    if (action.status !== 'drafted' || !action.draft_markdown) {
      return NextResponse.json({ ok: false, error: 'Draft it with Claude Code before applying.' }, { status: 400 });
    }
    if (action.published_post_id) {
      return NextResponse.json({ ok: false, error: 'Already applied.' }, { status: 409 });
    }
    // Guardrail: honor the fact-lock validation recorded with the draft.
    const validation = (action.draft_meta as { validation?: { ok?: boolean; issues?: string[] } } | null)?.validation;
    if (validation && validation.ok === false) {
      return NextResponse.json(
        { ok: false, error: 'Draft failed validation - fix before applying.', issues: validation.issues ?? [] },
        { status: 422 },
      );
    }

    const applied = await applyActionDraft(action, 'apply');
    revalidateArticlePages(applied.slug);

    return NextResponse.json({
      ok: true,
      id,
      postId: applied.postId,
      slug: applied.slug,
      status: 'completed',
      baselineCtr: applied.baselineCtr,
    });
  } catch (err) {
    if (err instanceof ArticleError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error('content-action apply failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
