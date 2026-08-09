/**
 * SEO Autonomy — Phase 3 guardrail: 14-day post-publish CTR rollback.
 *
 * Weekly cron. For each autogen post (a completed content_action linked to a
 * published blog post) that's ~14 days past publish and not yet reviewed:
 *   - pull its trailing-14-day GSC performance,
 *   - if it's a REFRESH with a pre-change baseline and CTR dropped >20%, revert
 *     the post content to the latest snapshot and mark it rolled_back,
 *   - otherwise record the 14-day numbers (no destructive action for new posts),
 * then email the owner a digest.
 *
 * Auth: Bearer CRON_SECRET (also enforced by middleware on /api/cron/*).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/seo/supabase-rest';
import { assessRollback, windowMetrics } from '@/lib/seo/rollback';
import { sendRollbackDigestEmail, type RollbackDigestItem } from '@/lib/notify/sendRollbackDigestEmail';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const REVIEW_AFTER_DAYS = 14;

interface ActionRow {
  id: string;
  action_type: 'refresh' | 'consolidate' | 'new';
  draft_meta: { rollback?: unknown; baseline_ctr?: number } | null;
  published_post_id: string | null;
}
interface PostRow {
  id: string;
  slug: string;
  title: string;
  published: boolean;
  content: string | null;
  meta_description: string | null;
  excerpt: string | null;
  created_at: string;
}
interface MetricRow {
  clicks: number;
  impressions: number;
  position: number | null;
}
interface RevisionRow {
  title: string;
  content_html: string | null;
  meta_description: string | null;
  excerpt: string | null;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = Date.now();
  /** How many posts one weekly run reviews. Any remainder is reported, never dropped. */
  const REVIEW_BATCH = 200;
  const cutoffMs = now - REVIEW_AFTER_DAYS * 86_400_000;
  const windowStart = new Date(now - REVIEW_AFTER_DAYS * 86_400_000).toISOString().slice(0, 10);

  try {
    // Autogen actions that produced a post and haven't been 14-day-reviewed yet.
    const actions = await supabaseRest<ActionRow[]>(
      'GET',
      // A BOUNDED BATCH, not a silent cap. Every article ever published stays
      // 'completed' forever, so this queue only grows - uncapped it would
      // eventually stop at the server's own ceiling with nothing saying so,
      // which is how CM-07 shipped a truncation counter that could never fire.
      // cap+1 makes "there is more" detectable, and the response reports it.
      // The job runs weekly, so a bounded batch per run is correct behaviour
      // rather than a compromise.
      `content_actions?select=id,action_type,draft_meta,published_post_id&status=eq.completed&published_post_id=not.is.null&limit=${REVIEW_BATCH + 1}`,
    );
    const moreThanOneBatch = (actions ?? []).length > REVIEW_BATCH;
    const pending = (actions ?? []).filter((a) => !a.draft_meta?.rollback && a.published_post_id);
    if (pending.length === 0) {
      return NextResponse.json({ ok: true, reviewed: 0, reverted: 0, note: 'no posts due for 14-day review' });
    }

    const postIds = [...new Set(pending.map((a) => a.published_post_id))];
    const posts = await supabaseRest<PostRow[]>(
      'GET',
      `blog_posts?select=id,slug,title,published,content,meta_description,excerpt,created_at&id=in.(${postIds.join(',')})`,
    );
    const postById = Object.fromEntries((posts ?? []).map((p) => [p.id, p]));

    const digest: RollbackDigestItem[] = [];
    let reverted = 0;

    for (const a of pending) {
      const post = postById[a.published_post_id as string];
      if (!post || !post.published) continue; // not public → nothing to review
      if (new Date(post.created_at).getTime() > cutoffMs) continue; // <14 days old → wait

      // Trailing-14-day GSC performance for this post.
      const rows = await supabaseRest<MetricRow[]>(
        'GET',
        `seo_metrics?select=clicks,impressions,position&source=eq.gsc&url=eq.${encodeURIComponent(`/blog/${post.slug}`)}&date=gte.${windowStart}`,
      );
      const m = windowMetrics(rows ?? []);

      const hasBaseline = a.action_type !== 'new' && typeof a.draft_meta?.baseline_ctr === 'number';
      const assessment = assessRollback({
        hasBaseline,
        baselineCtr: hasBaseline ? (a.draft_meta!.baseline_ctr as number) : null,
        currentCtr: m.ctr,
        impressions: m.impressions,
      });

      let didRevert = false;
      if (assessment.verdict === 'revert') {
        // Restore the most recent pre-change snapshot.
        const revs = await supabaseRest<RevisionRow[]>(
          'GET',
          `blog_post_revisions?select=title,content_html,meta_description,excerpt&post_id=eq.${post.id}&order=revised_at.desc&limit=1`,
        );
        const rev = revs?.[0];
        if (rev) {
          await supabaseRest(
            'PATCH',
            `blog_posts?id=eq.${post.id}`,
            { title: rev.title, content: rev.content_html ?? post.content, meta_description: rev.meta_description, excerpt: rev.excerpt, updated_at: new Date().toISOString() },
            { prefer: 'return=minimal' },
          );
          didRevert = true;
          reverted += 1;
        }
      }

      // Mark this action reviewed (merge into draft_meta) so it isn't reprocessed.
      const mergedMeta = {
        ...(a.draft_meta ?? {}),
        rollback: { checked_at: new Date().toISOString(), verdict: didRevert ? 'reverted' : assessment.verdict, reason: assessment.reason, clicks: m.clicks, impressions: m.impressions, ctr: m.ctr },
      };
      await supabaseRest(
        'PATCH',
        `content_actions?id=eq.${a.id}`,
        { draft_meta: mergedMeta, ...(didRevert ? { status: 'rolled_back' } : {}) },
        { prefer: 'return=minimal' },
      );

      digest.push({
        title: post.title,
        slug: post.slug,
        verdict: assessment.verdict,
        reason: assessment.reason,
        clicks: m.clicks,
        impressions: m.impressions,
        ctr: m.ctr,
        reverted: didRevert,
      });
    }

    const emailed = digest.length ? (await sendRollbackDigestEmail(digest)).status : 'skipped';
    // The remainder is REPORTED, never dropped silently - that is the whole
    // difference between a bounded batch and the truncation bug this pattern
    // replaces. A non-zero value here means the weekly batch is no longer
    // keeping up and REVIEW_BATCH should rise.
    return NextResponse.json({
      ok: true,
      reviewed: digest.length,
      reverted,
      emailed,
      ...(moreThanOneBatch ? { moreAwaitingReview: true, batchSize: REVIEW_BATCH } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('seo-rollback failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
