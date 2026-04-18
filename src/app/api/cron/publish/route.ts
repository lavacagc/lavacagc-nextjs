import { NextRequest, NextResponse } from 'next/server';

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
      `blog_posts?select=id,title,slug,scheduled_publish_at&published=eq.false&scheduled_publish_at=not.is.null&scheduled_publish_at=lte.${encodeURIComponent(now)}`
    );

    if (!posts || posts.length === 0) {
      return NextResponse.json({ message: 'No posts to publish', published: 0 });
    }

    // Publish each post
    const published: string[] = [];
    for (const post of posts) {
      try {
        await supabaseRest(
          'PATCH',
          `blog_posts?id=eq.${post.id}`,
          { published: true, scheduled_publish_at: null, created_at: now, updated_at: now }
        );
        published.push(post.title);
      } catch (err) {
        console.error(`Failed to publish "${post.title}":`, err);
      }
    }

    return NextResponse.json({
      message: `Published ${published.length} posts`,
      published,
      checked_at: now,
    });
  } catch (error) {
    console.error('Cron publish error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
