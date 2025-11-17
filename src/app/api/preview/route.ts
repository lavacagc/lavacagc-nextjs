import { draftMode } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use service role key to bypass RLS for previews
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim()
);

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const slug = searchParams.get('slug');
  const secret = searchParams.get('secret');

  // Check the secret token (use a simple token for now)
  const PREVIEW_SECRET = process.env.PREVIEW_SECRET || 'lavaca-preview-2024';

  if (secret !== PREVIEW_SECRET) {
    return new Response('Invalid token', { status: 401 });
  }

  if (!slug) {
    return new Response('Missing slug parameter', { status: 400 });
  }

  // Verify the post exists (including unpublished)
  const { data: post, error } = await supabaseAdmin
    .from('blog_posts')
    .select('slug')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !post) {
    return new Response('Post not found', { status: 404 });
  }

  // Enable Draft Mode
  const draft = await draftMode();
  draft.enable();

  // Redirect to the post page
  redirect(`/blog/${slug}`);
}
