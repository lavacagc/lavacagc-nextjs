/**
 * SEO Autonomy — Phase 2 (Suggestor): scoring trigger.
 *
 * Reads the trailing 28 days of seo_metrics + the published blog posts + the
 * open content_actions queue, runs the scoring engine, and inserts the proposed
 * refresh/consolidate/new actions as `pending` rows for human review in
 * /vaca-mgmt/seo. Idempotent in spirit: it dedupes against open queue rows, so
 * re-running won't pile up duplicates.
 *
 * Phase 2 only SUGGESTS — nothing is drafted or published here.
 *
 * Auth: Bearer CRON_SECRET (also enforced by middleware on /api/cron/*).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/seo/supabase-rest';
import { reportWindow, type SeoMetricRow } from '@/lib/seo/report';
import { proposeContentActions, type PostRef, type ExistingAction } from '@/lib/seo/scoring';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface PostRow {
  id: string;
  slug: string;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const { startDate, endDate } = reportWindow(now);
  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';

  try {
    const [rows, posts, existing] = await Promise.all([
      supabaseRest<SeoMetricRow[]>(
        'GET',
        `seo_metrics?select=source,url,query,date,impressions,clicks,position,ctr,users,engaged_sessions,conversions&date=gte.${startDate}&date=lte.${endDate}`,
      ),
      supabaseRest<PostRow[]>('GET', 'blog_posts?select=id,slug&published=eq.true'),
      supabaseRest<ExistingAction[]>(
        'GET',
        'content_actions?select=action_type,target_post_id,target_query,status',
      ),
    ]);

    const postRefs: PostRef[] = (posts ?? []).map((p) => ({ id: p.id, slug: p.slug, url: `/blog/${p.slug}` }));
    const proposed = proposeContentActions(rows ?? [], postRefs, existing ?? [], now);

    if (!dryRun && proposed.length > 0) {
      await supabaseRest('POST', 'content_actions', proposed, { prefer: 'return=minimal' });
    }

    const byType = proposed.reduce<Record<string, number>>((acc, a) => {
      acc[a.action_type] = (acc[a.action_type] ?? 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      ok: true,
      window: { startDate, endDate },
      scanned: { metrics_rows: rows?.length ?? 0, posts: postRefs.length, open_actions: existing?.length ?? 0 },
      proposed: proposed.length,
      byType,
      dryRun,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('seo-suggest failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
