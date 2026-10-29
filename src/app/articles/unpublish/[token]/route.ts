/**
 * GET /articles/unpublish/<token> - the page the "New article published"
 * Telegram links to (docs/phase-2/acceptance-criteria.md, TG1 to TG3).
 *
 * READ ONLY. Link previewers and chat clients fetch every URL they see, so a
 * GET that unpublished would take an article down for somebody who never
 * tapped anything (the crew-confirm and /offer precedent). This shows the
 * post's title and slug and one "Unpublish" button, which POSTs to
 * /api/articles/unpublish/<token>.
 *
 * 200 while the link still controls a live post; 410 for an expired,
 * tampered or spent link, or one minted for an earlier publication.
 * noindex (meta and X-Robots-Tag), no-store, no-referrer, and outside the
 * site layout so no analytics or widget ever loads with the token in the URL
 * (SEC2). It is a route handler, not a page, because only a handler can
 * answer 410.
 */
import type { NextRequest } from 'next/server';
import { postForUnpublishToken } from '@/lib/articles/publishFlow';
import { renderUnpublishPage, UNPUBLISH_PAGE_HEADERS } from '@/lib/articles/unpublishPage';
import { siteOrigin } from '@/lib/projects/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const origin = siteOrigin(request);
  const adminUrl = `${origin}/vaca-mgmt?tab=blog`;

  let post = null;
  try {
    post = await postForUnpublishToken(token);
  } catch (err) {
    console.error('unpublish page lookup failed:', err instanceof Error ? err.message : err);
    return new Response(renderUnpublishPage({ kind: 'error', adminUrl }), { status: 503, headers: UNPUBLISH_PAGE_HEADERS });
  }
  if (!post) {
    return new Response(renderUnpublishPage({ kind: 'gone', adminUrl }), { status: 410, headers: UNPUBLISH_PAGE_HEADERS });
  }

  return new Response(renderUnpublishPage({
    kind: 'confirm',
    title: post.title,
    slug: post.slug,
    postUrl: `${origin}/blog/${post.slug}`,
    action: `/api/articles/unpublish/${encodeURIComponent(token)}`,
  }), { status: 200, headers: UNPUBLISH_PAGE_HEADERS });
}
