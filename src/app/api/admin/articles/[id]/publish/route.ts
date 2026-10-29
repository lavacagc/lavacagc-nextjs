/**
 * POST /api/admin/articles/<id>/publish  { override?: boolean }
 *
 * The admin's publish: the editor's Save on a draft-to-live change and the
 * list's Publish button both come here, so the publish guard holds them the
 * same way it holds Claude (PG4). The editor saves the post first, then calls
 * this, so the guard checks what the admin is looking at.
 *
 *   - pass: live, `review_hold = null`, pages revalidated. 200
 *     `{ published: true, id, slug, url, published_at, overridden: false }`.
 *   - hold: stays a draft, `review_hold = { reasons, checked_at }`. 409
 *     `{ published: false, hold: reasons }`; the editor shows them inline and
 *     the list opens the editor.
 *   - `override: true` ("Publish anyway", PG3): live despite the reasons,
 *     `review_hold = null`, and `review_override = { by: <admin user id>, at,
 *     reasons }` recorded. 200 with `overridden: true`.
 *
 * This is the ONLY way to clear a hold without passing the guard (SEC4): it
 * lives under /api/admin/, which middleware guards with the admin session,
 * and it re-checks the session itself because it needs the user id. The
 * ingest token cannot reach it, and the ingest routes never take `override`.
 *
 * No Telegram: the admin is the one who just pressed the button.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { siteOrigin, validationResponse } from '@/lib/projects/http';
import { adminUserId } from '@/lib/projects/session';
import { readArticleBody } from '@/lib/articles/http';
import { runPublishGuard } from '@/lib/articles/publishFlow';
import { revalidateArticlePages } from '@/lib/articles/revalidate';
import { errorResponseBody, holdArticle, publishArticle, requireArticle } from '@/lib/articles/writer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bodySchema = z.object({ override: z.boolean().optional() }).strict();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await adminUserId(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  let raw: unknown = {};
  if (Number(request.headers.get('content-length') ?? '0') > 0) {
    const read = await readArticleBody(request, 1024);
    if ('response' in read) return read.response;
    raw = read.body ?? {};
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return validationResponse(parsed.error);
  const override = parsed.data.override === true;

  try {
    const post = await requireArticle(id);
    const verdict = await runPublishGuard(post);
    if (!verdict.ok && !override) {
      await holdArticle(post, verdict.reasons);
      return NextResponse.json({ published: false, hold: verdict.reasons }, { status: 409 });
    }

    const overridden = !verdict.ok;
    const live = await publishArticle(post, overridden ? { override: { by: userId, reasons: verdict.reasons } } : {});
    revalidateArticlePages(live.slug);
    return NextResponse.json({
      published: true,
      id: live.id,
      slug: live.slug,
      url: `${siteOrigin(request)}/blog/${live.slug}`,
      published_at: live.published_at,
      overridden,
    });
  } catch (err) {
    const { status, body } = errorResponseBody(err, 'Could not publish the article.');
    return NextResponse.json(body, { status });
  }
}
