/**
 * POST /api/articles/unpublish/<token> - the "Unpublish" button on
 * /articles/unpublish/<token> (TG1).
 *
 * The signed link IS the credential (src/lib/articles/unpublishToken.ts):
 * HMAC-SHA256 with INTERNAL_WEBHOOK_SECRET, compared with timingSafeEqual,
 * 7 days, and only while the post is still live with the `published_at` the
 * link was minted for. On success: `published = false`, /blog, the post and
 * the sitemap revalidated, a Telegram confirmation, and an "Unpublished" page.
 * A dead link changes nothing and answers 410 (TG2).
 *
 * Unlike the other /api/articles/* routes this one does not take the ingest
 * token: the owner taps it from Telegram with no session. It is public in
 * middleware under '/api/articles/' and self-guarded by the signature plus a
 * per-IP rate limit, because it can send a Telegram (chaos CM-08).
 *
 * The form posts here as a browser navigation, so the answer is the HTML page;
 * a caller that asks for JSON gets `{ unpublished, id?, slug?, telegram? }`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { siteOrigin } from '@/lib/projects/http';
import { notifyArticleUnpublished } from '@/lib/articles/notify';
import { postForUnpublishToken } from '@/lib/articles/publishFlow';
import { revalidateArticlePages } from '@/lib/articles/revalidate';
import { renderUnpublishPage, UNPUBLISH_PAGE_HEADERS } from '@/lib/articles/unpublishPage';
import { unpublishArticle } from '@/lib/articles/writer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Per IP, a minute. The rate_limits bucket prefix is `article-unpublish:`. */
const UNPUBLISH_LINK_RATE_LIMIT = 10;
const UNPUBLISH_LINK_RATE_BUCKET = 'article-unpublish';

function wantsJson(request: NextRequest): boolean {
  const accept = request.headers.get('accept') ?? '';
  return accept.includes('application/json') && !accept.includes('text/html');
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const json = wantsJson(request);
  const origin = siteOrigin(request);
  const adminUrl = `${origin}/vaca-mgmt?tab=blog`;
  const gone = (status: number) => (json
    ? NextResponse.json({ unpublished: false, error: 'This link no longer works.' }, { status })
    : new Response(renderUnpublishPage({ kind: 'gone', adminUrl }), { status, headers: UNPUBLISH_PAGE_HEADERS }));

  const rl = await checkRateLimit(`${UNPUBLISH_LINK_RATE_BUCKET}:${getClientIp(request)}`, UNPUBLISH_LINK_RATE_LIMIT, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Try again in a minute.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
    );
  }

  const { token } = await params;
  try {
    const post = await postForUnpublishToken(token);
    if (!post) return gone(410);

    const down = await unpublishArticle(post);
    revalidateArticlePages(down.slug);
    const telegram = await notifyArticleUnpublished({ title: down.title, url: `${origin}/blog/${down.slug}` });

    if (json) return NextResponse.json({ unpublished: true, id: down.id, slug: down.slug, telegram });
    return new Response(
      renderUnpublishPage({ kind: 'done', title: down.title, slug: down.slug, adminUrl: `${origin}/vaca-mgmt?tab=blog&post=${down.id}` }),
      { status: 200, headers: UNPUBLISH_PAGE_HEADERS },
    );
  } catch (err) {
    console.error('one-tap unpublish failed:', err instanceof Error ? err.message : err);
    return json
      ? NextResponse.json({ unpublished: false, error: 'Could not unpublish the article.' }, { status: 500 })
      : new Response(renderUnpublishPage({ kind: 'error', adminUrl }), { status: 500, headers: UNPUBLISH_PAGE_HEADERS });
  }
}
