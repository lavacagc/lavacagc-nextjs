/**
 * POST /api/articles/ingest/<id>/publish  { action_id? }
 *
 * Runs the publish guard (src/lib/articles/publishGuard.ts) on the post as it
 * would go live, then:
 *   - pass: `published = true`, `published_at` stamped on a draft-to-live
 *     transition, `review_hold = null`, /blog, /blog/<slug> and sitemap.xml
 *     revalidated (ART4), the action (if any) marked completed (FB3), and the
 *     owner gets "New article published" with a signed one-tap unpublish link
 *     (TG1). Answers `{ published: true, id, slug, url, published_at,
 *     unpublish_url, telegram }`.
 *   - hold: nothing goes live; `review_hold = { reasons, checked_at }`, the
 *     owner gets "Article held for review" with the first three reasons (PG2),
 *     and 409 `{ published: false, hold: reasons, adminUrl, telegram }`.
 *
 * `telegram` is `sent`, `not_configured` or `failed`; Telegram never decides
 * whether the publish happened (TG4). A token caller can never clear a hold
 * except by passing the guard; "Publish anyway" is the admin route's alone
 * (SEC4).
 *
 * With the `action_id` of a drafted refresh or consolidate whose live post is
 * <id>, the guard checks the post WITH the draft applied, and on a pass the
 * draft is applied the same way the admin's Apply does it (snapshot, baseline
 * CTR, then the rewrite) before the publish.
 *
 * Same auth as POST /api/articles/ingest.
 */
import { NextRequest, NextResponse } from 'next/server';
import { validationResponse } from '@/lib/projects/http';
import {
  applyActionDraft, completeAction, livePostIdOf, rebuiltFromDraft, requireOpenAction, type ContentActionRow,
} from '@/lib/articles/actions';
import { authorizeArticles } from '@/lib/articles/auth';
import { articleAdminUrl, articlePublicUrl, readArticleBody } from '@/lib/articles/http';
import { siteOrigin } from '@/lib/projects/http';
import { announceHeld, announcePublished, runPublishGuard } from '@/lib/articles/publishFlow';
import { revalidateArticlePages } from '@/lib/articles/revalidate';
import { articlePublishSchema } from '@/lib/articles/schemas';
import {
  ArticleError, errorResponseBody, holdArticle, publishArticle, requireArticle, type ArticleRow,
} from '@/lib/articles/writer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** How this publish relates to the action it names, decided before anything is written. */
function planFor(action: ContentActionRow | null, post: ArticleRow): { candidate: ArticleRow; applyDraft: boolean } {
  if (!action) return { candidate: post, applyDraft: false };
  if (action.action_type === 'new') {
    const linked = action.draft_meta?.post_id;
    if (typeof linked === 'string' && linked !== post.id) {
      throw new ArticleError(409, `action_id: the action's draft is another post (${linked}).`);
    }
    return { candidate: post, applyDraft: false };
  }
  if (livePostIdOf(action) !== post.id) {
    throw new ArticleError(409, `action_id: that ${action.action_type} action rewrites a different post (${livePostIdOf(action) ?? 'none'}).`);
  }
  if (action.status === 'drafted' && action.draft_markdown) {
    return { candidate: { ...post, ...rebuiltFromDraft(action) }, applyDraft: true };
  }
  return { candidate: post, applyDraft: false };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await authorizeArticles(request);
  if ('response' in caller) return caller.response;
  const { id } = await params;

  let raw: unknown = {};
  if (Number(request.headers.get('content-length') ?? '0') > 0) {
    const read = await readArticleBody(request, 1024);
    if ('response' in read) return read.response;
    raw = read.body ?? {};
  }
  const parsed = articlePublishSchema.safeParse(raw);
  if (!parsed.success) return validationResponse(parsed.error);

  try {
    const post = await requireArticle(id);
    const action = parsed.data.action_id ? await requireOpenAction(parsed.data.action_id) : null;
    const { candidate, applyDraft } = planFor(action, post);

    const verdict = await runPublishGuard(candidate);
    if (!verdict.ok) {
      await holdArticle(post, verdict.reasons);
      const telegram = await announceHeld(siteOrigin(request), candidate, verdict.reasons);
      return NextResponse.json(
        { published: false, hold: verdict.reasons, adminUrl: articleAdminUrl(request, post.id), telegram },
        { status: 409 },
      );
    }

    if (action && applyDraft) await applyActionDraft(action, 'claude');
    const live = await publishArticle(applyDraft ? await requireArticle(id) : post);
    if (action && !applyDraft) await completeAction(action, live.id);
    revalidateArticlePages(live.slug);
    // The owner hears about a post going live, with the one-tap undo. A
    // re-publish of a live post (a refresh) keeps its published_at, so the
    // link it would carry is the one he already has; it is sent again anyway,
    // because the content just changed under him.
    const { telegram, unpublishUrl } = await announcePublished(siteOrigin(request), live);

    return NextResponse.json({
      published: true,
      id: live.id,
      slug: live.slug,
      url: articlePublicUrl(request, live.slug),
      published_at: live.published_at,
      unpublish_url: unpublishUrl,
      telegram,
      ...(action ? { action: { id: action.id, status: 'completed' } } : {}),
    });
  } catch (err) {
    const { status, body } = errorResponseBody(err, 'Could not publish the article.');
    return NextResponse.json(body, { status });
  }
}
