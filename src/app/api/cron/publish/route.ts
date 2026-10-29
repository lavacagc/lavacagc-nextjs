/**
 * GET /api/cron/publish - publish the scheduled blog posts that are due.
 *
 * Every post goes through the publish guard first (Phase 2 slice G: the guard
 * runs on every publish path). A post that passes goes live, its pages are
 * revalidated, and the owner gets "New article published" with the signed
 * one-tap unpublish link, because nobody is watching when a schedule fires.
 * A post that is held stays a draft with `review_hold` set and its schedule
 * cleared (so tomorrow's run does not hold and notify again), and the owner
 * gets "Article held for review".
 */
import { NextRequest, NextResponse } from 'next/server';
import { announceHeld, announcePublished, runPublishGuard } from '@/lib/articles/publishFlow';
import { revalidateArticlePages } from '@/lib/articles/revalidate';
import { getArticle, holdArticle, newPublishNonce } from '@/lib/articles/writer';
import { siteOrigin } from '@/lib/projects/http';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// Direct REST helper using secret key (bypasses RLS properly with sb_secret_ format)
async function supabaseRest(method: 'GET' | 'PATCH', path: string, body?: Record<string, unknown>) {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error('SUPABASE_SECRET_KEY not configured');

  const headers: Record<string, string> = {
    'apikey': secretKey,
    'Authorization': `Bearer ${secretKey}`,
    'Content-Type': 'application/json',
    'Prefer': method === 'PATCH' ? 'return=minimal' : 'return=representation',
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${method} ${path} failed: ${res.status} ${text}`);
  }

  if (method === 'PATCH') return null;
  return res.json();
}

// Cron-triggered endpoint to auto-publish scheduled blog posts
export async function GET(request: NextRequest) {
  // CRON_SECRET is enforced by middleware — this is a defense-in-depth check
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Server misconfiguration: CRON_SECRET not set' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date().toISOString();

    // Find posts that are scheduled and past their publish time
    const posts = await supabaseRest(
      'GET',
      // Capped: a daily run publishes what is due; anything past the cap is
      // still due tomorrow, so nothing is lost.
      `blog_posts?select=id,title,slug,scheduled_publish_at&published=eq.false&scheduled_publish_at=not.is.null&scheduled_publish_at=lte.${encodeURIComponent(now)}&order=scheduled_publish_at.asc&limit=50`
    );

    if (!posts || posts.length === 0) {
      return NextResponse.json({ message: 'No posts to publish', published: 0 });
    }

    // Publish each post that passes the guard; hold the rest.
    const origin = siteOrigin(request);
    const published: string[] = [];
    const held: Array<{ title: string; reasons: string[] }> = [];
    const slugs: string[] = [];
    const live: Array<NonNullable<Awaited<ReturnType<typeof getArticle>>>> = [];
    for (const post of posts) {
      try {
        const full = await getArticle(post.id);
        if (!full) continue;
        const verdict = await runPublishGuard(full);
        if (!verdict.ok) {
          await holdArticle(full, verdict.reasons);
          await supabaseRest('PATCH', `blog_posts?id=eq.${post.id}`, { scheduled_publish_at: null });
          held.push({ title: full.title, reasons: verdict.reasons });
          await announceHeld(origin, full, verdict.reasons);
          continue;
        }
        const nonce = newPublishNonce();
        await supabaseRest(
          'PATCH',
          `blog_posts?id=eq.${post.id}`,
          { published: true, published_at: now, publish_nonce: nonce, review_hold: null, scheduled_publish_at: null, created_at: now, updated_at: now }
        );
        published.push(post.title);
        slugs.push(post.slug);
        live.push({ ...full, published: true, published_at: now, publish_nonce: nonce });
      } catch (err) {
        console.error(`Failed to publish "${post.title}":`, err);
      }
    }

    // Show them on /blog, their pages and the sitemap now, not after the ISR window.
    if (slugs.length > 0) revalidateArticlePages(...slugs);
    // Then tell the owner, each with its one-tap undo.
    for (const post of live) await announcePublished(origin, post);

    return NextResponse.json({
      message: `Published ${published.length} posts`,
      published,
      held,
      checked_at: now,
    });
  } catch (error) {
    console.error('Cron publish error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
