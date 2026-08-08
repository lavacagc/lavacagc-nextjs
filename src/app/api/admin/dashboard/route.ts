import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * Everything the admin Dashboard shows, in ONE round trip.
 *
 * Server-side with the secret key because three of the four pulse numbers live
 * in tables the admin's browser session cannot read under RLS (email_log,
 * content_actions, follow_up_queue - same reason the Email Log and Follow-Ups
 * tabs go through /api/admin/*). Gated to admins by middleware (/api/admin/).
 *
 * The queries are deliberately head-counts or narrow selects: this endpoint
 * replaced a client that downloaded whole tables to compute the same numbers.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

const EMAIL_WINDOW_DAYS = 30;
const LEADS_WINDOW_DAYS = 7;
const ARTICLE_LIST_SIZE = 6;

export async function GET() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }
  const supabase = createClient(SUPABASE_URL, secret);

  const emailsSince = new Date(Date.now() - EMAIL_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const leadsSince = new Date(Date.now() - LEADS_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [posts, emailStatuses, leadsCount, suggestionsCount, followUpsCount] = await Promise.all([
    supabase
      .from('blog_posts')
      .select('id, title, slug, published, created_at, updated_at')
      .order('updated_at', { ascending: false }),
    supabase.from('email_log').select('status').gte('created_at', emailsSince),
    supabase.from('leads').select('*', { count: 'exact', head: true }).gte('created_at', leadsSince),
    supabase.from('content_actions').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('follow_up_queue').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);

  const firstError =
    posts.error || emailStatuses.error || leadsCount.error || suggestionsCount.error || followUpsCount.error;
  if (firstError) {
    console.error('dashboard load error:', firstError);
    return NextResponse.json({ error: 'Failed to load dashboard data' }, { status: 500 });
  }

  const allPosts = posts.data ?? [];
  const published = allPosts.filter((p) => p.published);
  const drafts = allPosts.length - published.length;
  // "Last posted" is the newest CREATION among published posts - the nudge is
  // about publishing something new, not touching an old article.
  const lastPublishedAt = published.reduce<string | null>(
    (max, p) => (max === null || p.created_at > max ? p.created_at : max),
    null,
  );

  const statuses = (emailStatuses.data ?? []).map((r) => r.status);
  const failed = statuses.filter((s) => s === 'failed' || s === 'error').length;
  const bounced = statuses.filter((s) => s === 'bounced' || s === 'complained').length;

  return NextResponse.json({
    articles: published.slice(0, ARTICLE_LIST_SIZE),
    drafts,
    lastPublishedAt,
    emails30d: {
      total: statuses.length,
      failed,
      bounced,
      ok: statuses.length - failed - bounced,
    },
    leads7d: leadsCount.count ?? 0,
    pendingSuggestions: suggestionsCount.count ?? 0,
    pendingFollowUps: followUpsCount.count ?? 0,
  });
}
