/**
 * GET /api/articles/seo-feedback?days=28
 *
 * What Claude Code reads before it writes or refreshes an article:
 * `{ window, pages: [{ path, impressions, clicks, ctr, position, trend_delta,
 * decaying, post? }], pages_total, refresh_candidates, new_article_candidates,
 * suggested_actions, open_actions, truncated }` (FB1 to FB4).
 *
 * Built from seo_metrics (GSC rows; GA4 feeds the report's winners), the
 * published posts and the open content_actions, all read with the service key
 * and every read capped: `days` is 7 to 90 (SEC3), the metric read stops at
 * MAX_METRIC_ROWS and says so in `truncated`, and at most 200 pages are listed.
 *
 * Same auth and rate limit as the other article routes (src/lib/articles/auth.ts).
 */
import { NextRequest, NextResponse } from 'next/server';
import { OPEN_ACTION_STATUSES } from '@/lib/articles/actions';
import { authorizeArticles } from '@/lib/articles/auth';
import { buildSeoFeedback, feedbackReadStart, type FeedbackAction, type FeedbackPost } from '@/lib/articles/feedback';
import { parseFeedbackDays } from '@/lib/articles/schemas';
import type { SeoMetricRow } from '@/lib/seo/report';
import { supabaseRest, supabaseRestPagedCapped } from '@/lib/seo/supabase-rest';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** A 90-day GSC window for this site is a few thousand rows; this is the ceiling, not the norm. */
const MAX_METRIC_ROWS = 50_000;
const MAX_POSTS = 1000;
const MAX_OPEN_ACTIONS = 100;

export async function GET(request: NextRequest) {
  const caller = await authorizeArticles(request);
  if ('response' in caller) return caller.response;

  const days = parseFeedbackDays(request.nextUrl.searchParams.get('days'));
  if (days === null) {
    return NextResponse.json({ error: 'days must be a whole number from 7 to 90.' }, { status: 400 });
  }

  const now = new Date();
  const start = feedbackReadStart(now, days);
  const end = now.toISOString().slice(0, 10);

  try {
    const [metrics, posts, actions] = await Promise.all([
      supabaseRestPagedCapped<SeoMetricRow>(
        `seo_metrics?select=source,url,query,date,impressions,clicks,position,ctr,users,engaged_sessions,conversions`
          + `&date=gte.${start}&date=lte.${end}&order=date.desc,id.desc`,
        MAX_METRIC_ROWS,
      ),
      supabaseRest<FeedbackPost[]>(
        'GET',
        `blog_posts?select=id,slug,title,published_at&published=eq.true&order=updated_at.desc&limit=${MAX_POSTS}`,
      ),
      supabaseRest<FeedbackAction[]>(
        'GET',
        `content_actions?select=id,action_type,target_post_id,consolidate_into_id,target_query,rationale,status`
          + `&status=in.(${OPEN_ACTION_STATUSES.join(',')})&order=created_at.desc&limit=${MAX_OPEN_ACTIONS}`,
      ),
    ]);

    return NextResponse.json(buildSeoFeedback({
      rows: metrics.rows,
      posts: posts ?? [],
      actions: actions ?? [],
      now,
      days,
      truncated: metrics.truncated,
    }));
  } catch (err) {
    console.error('seo-feedback failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not build the SEO feedback.' }, { status: 500 });
  }
}
