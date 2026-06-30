/**
 * Admin API for the SEO content-action queue (Phase 2 Suggestor).
 * Admin-gated by middleware (/api/admin/* requires a Supabase session).
 *
 *  GET                       → list queued actions (newest first) + post titles.
 *  POST { id, decision }     → approve | reject an action.
 *      decision='approve'    → status=approved (drafting handled separately).
 *      decision='reject'     → status=rejected.
 *
 * Suggestions are produced by /api/cron/seo-suggest. This route is the human
 * review layer; nothing publishes here.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/seo/supabase-rest';

export const dynamic = 'force-dynamic';

interface ContentActionRow {
  id: string;
  action_type: string;
  target_post_id: string | null;
  consolidate_into_id: string | null;
  target_query: string | null;
  rationale: Record<string, unknown> | null;
  expected_lift_clicks: number | null;
  status: string;
  draft_markdown: string | null;
  created_at: string;
  reviewed_at: string | null;
}

interface PostLite {
  id: string;
  title: string;
  slug: string;
}

export async function GET() {
  try {
    const actions = await supabaseRest<ContentActionRow[]>(
      'GET',
      'content_actions?select=id,action_type,target_post_id,consolidate_into_id,target_query,rationale,expected_lift_clicks,status,draft_markdown,created_at,reviewed_at&order=created_at.desc&limit=200',
    );
    const list = actions ?? [];

    // Resolve referenced post titles in one round-trip.
    const ids = new Set<string>();
    for (const a of list) {
      if (a.target_post_id) ids.add(a.target_post_id);
      if (a.consolidate_into_id) ids.add(a.consolidate_into_id);
    }
    let postsById: Record<string, PostLite> = {};
    if (ids.size > 0) {
      const posts = await supabaseRest<PostLite[]>(
        'GET',
        `blog_posts?select=id,title,slug&id=in.(${[...ids].join(',')})`,
      );
      postsById = Object.fromEntries((posts ?? []).map((p) => [p.id, p]));
    }

    const enriched = list.map((a) => ({
      ...a,
      target_post: a.target_post_id ? postsById[a.target_post_id] ?? null : null,
      consolidate_into: a.consolidate_into_id ? postsById[a.consolidate_into_id] ?? null : null,
    }));

    const counts = list.reduce<Record<string, number>>((acc, a) => {
      acc[a.status] = (acc[a.status] ?? 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({ ok: true, counts, actions: enriched });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('content-actions list failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { id, decision } = body as { id?: string; decision?: string };

    if (!id || (decision !== 'approve' && decision !== 'reject')) {
      return NextResponse.json(
        { ok: false, error: "Body must be { id, decision: 'approve' | 'reject' }" },
        { status: 400 },
      );
    }

    const status = decision === 'approve' ? 'approved' : 'rejected';
    await supabaseRest(
      'PATCH',
      `content_actions?id=eq.${id}`,
      { status, reviewed_at: new Date().toISOString() },
      { prefer: 'return=minimal' },
    );

    return NextResponse.json({ ok: true, id, status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('content-actions decision failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
