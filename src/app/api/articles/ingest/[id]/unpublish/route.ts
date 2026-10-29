/**
 * POST /api/articles/ingest/<id>/unpublish
 *
 * Takes a post down: `published = false`, and /blog, /blog/<slug> and
 * sitemap.xml are revalidated so it is gone from all three on the next
 * request (ART5). `published_at` is kept as the record of the last publish.
 * Answers `{ published: false, id, slug }`. Same auth as the other article routes.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authorizeArticles } from '@/lib/articles/auth';
import { revalidateArticlePages } from '@/lib/articles/revalidate';
import { errorResponseBody, requireArticle, unpublishArticle } from '@/lib/articles/writer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await authorizeArticles(request);
  if ('response' in caller) return caller.response;
  const { id } = await params;

  try {
    const post = await requireArticle(id);
    const down = post.published ? await unpublishArticle(post) : post;
    revalidateArticlePages(down.slug);
    return NextResponse.json({ published: false, id: down.id, slug: down.slug });
  } catch (err) {
    const { status, body } = errorResponseBody(err, 'Could not unpublish the article.');
    return NextResponse.json(body, { status });
  }
}
