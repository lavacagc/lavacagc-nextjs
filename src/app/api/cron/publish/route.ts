import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://xrvbrnrbnyfdwkfdoepq.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhydmJybnJibnlmZHdrZmRvZXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3NzIyNTAsImV4cCI6MjA3NDM0ODI1MH0.TL9cUCyaApPjWl8YEW455JgCUSa6S2qsoRpZ8iATl10";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Cron-triggered endpoint to auto-publish scheduled blog posts
// Call via: GET /api/cron/publish?key=lavaca-cron-2026
export async function GET(request: NextRequest) {
  // Simple auth key check
  const key = request.nextUrl.searchParams.get('key');
  if (key !== 'lavaca-cron-2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date().toISOString();

    // Find posts that are scheduled and past their publish time
    const { data: posts, error: fetchError } = await supabase
      .from('blog_posts')
      .select('id, title, slug, scheduled_publish_at')
      .eq('published', false)
      .not('scheduled_publish_at', 'is', null)
      .lte('scheduled_publish_at', now);

    if (fetchError) {
      console.error('Error fetching scheduled posts:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
    }

    if (!posts || posts.length === 0) {
      return NextResponse.json({ message: 'No posts to publish', published: 0 });
    }

    // Publish each post
    const published: string[] = [];
    for (const post of posts) {
      const { error: updateError } = await supabase
        .from('blog_posts')
        .update({
          published: true,
          scheduled_publish_at: null,
          updated_at: now,
        })
        .eq('id', post.id);

      if (!updateError) {
        published.push(post.title);
      } else {
        console.error(`Failed to publish "${post.title}":`, updateError);
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
