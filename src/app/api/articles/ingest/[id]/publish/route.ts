/**
 * POST /api/articles/ingest/<id>/publish  { action_id? }
 *
 * Runs the publish guard (src/lib/articles/publishGuard.ts) on the post as it
 * would go live, then:
 *   - pass: `published = true`, `published_at` stamped on a draft-to-live
 *     transition, `review_hold = null`, /blog, /blog/<slug> and sitemap.xml
 *     revalidated (ART4), the action (if any) marked completed (FB3).
 *     Answers `{ published: true, id, slug, url, published_at }`.
 *   - hold: nothing goes live; `review_hold = { reasons, checked_at }` and 409
 *     `{ published: false, hold: reasons, adminUrl }`.
 *
 * With the `action_id` of a drafted refresh or consolidate whose live post is
 * <id>, the guard checks the post WITH the draft applied, and on a pass the
 * draft is applied the same way the admin's Apply does it (snapshot, baseline
 * CTR, then the rewrite) before the publish.
 *
 * Before the guard, in this order (fix round 1 of the slice F review):
 *   - Fact-lock: validateDraft runs on the content that would go live, action
 *     draft included, and a failure is 422 `{ published: false, error, issues }`,
 *     the same refusal Stage and Apply give. Nothing is written.
 *   - Review hold (SEC4): a post with `review_hold` set is cleared only by a
 *     publish whose guard actively re-checked the current content and passed,
 *     or by the admin's "Publish anyway". The slice F guard is a stub that
 *     checks nothing, so while it is the stub a held post answers 409 with its
 *     stored reasons and stays as it is. No route takes review_hold as input.
 *
 * Same auth as POST /api/articles/ingest.
 */
import { NextRequest, NextResponse } from 'next/server';
import { validationResponse } from '@/lib/projects/http';
import {
  applyActionDraft, completeAction, draftMarkdownFor, getAction, livePostIdOf, rebuiltFromDraft, requireOpenAction,
  type ContentActionRow,
} from '@/lib/articles/actions';
import { authorizeArticles } from '@/lib/articles/auth';
import { articleAdminUrl, articlePublicUrl, readArticleBody } from '@/lib/articles/http';
import { checkPublishable, PUBLISH_GUARD_IS_STUB } from '@/lib/articles/publishGuard';
import { validateDraft } from '@/lib/seo/draftGuardrails';
import { revalidateArticlePages } from '@/lib/articles/revalidate';
import { articlePublishSchema } from '@/lib/articles/schemas';
import {
  ArticleError, errorResponseBody, holdArticle, loadContentFacts, publishArticle, requireArticle, type ArticleRow,
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
    let action: ContentActionRow | null = null;
    if (parsed.data.action_id) {
      // An action already completed by THIS post (the admin staged Claude's
      // draft, then Claude ran the publish line) is nothing left to do.
      const existing = await getAction(parsed.data.action_id);
      const alreadyDone = existing?.status === 'completed' && existing.published_post_id === post.id;
      action = alreadyDone ? null : await requireOpenAction(parsed.data.action_id);
    }
    const { candidate, applyDraft } = planFor(action, post);
    const contentFacts = await loadContentFacts();

    const factLock = validateDraft(draftMarkdownFor(candidate), contentFacts);
    if (!factLock.ok) {
      return NextResponse.json({
        published: false,
        error: 'Draft failed validation - fix before publishing.',
        issues: factLock.issues,
      }, { status: 422 });
    }

    if (post.review_hold && PUBLISH_GUARD_IS_STUB) {
      return NextResponse.json({
        published: false,
        hold: post.review_hold.reasons ?? [],
        adminUrl: articleAdminUrl(request, post.id),
      }, { status: 409 });
    }

    const verdict = checkPublishable(candidate, { contentFacts });
    if (!verdict.ok) {
      await holdArticle(post, verdict.reasons);
      // Slice G (TG): the "Article held for review" Telegram goes here.
      return NextResponse.json({ published: false, hold: verdict.reasons, adminUrl: articleAdminUrl(request, post.id) }, { status: 409 });
    }

    if (action && applyDraft) await applyActionDraft(action, 'claude');
    const live = await publishArticle(applyDraft ? await requireArticle(id) : post);
    if (action && !applyDraft) await completeAction(action, live.id);
    revalidateArticlePages(live.slug);
    // Slice G (TG): the "New article published" Telegram with the signed unpublish link goes here.

    return NextResponse.json({
      published: true,
      id: live.id,
      slug: live.slug,
      url: articlePublicUrl(request, live.slug),
      published_at: live.published_at,
      ...(action ? { action: { id: action.id, status: 'completed' } } : {}),
    });
  } catch (err) {
    const { status, body } = errorResponseBody(err, 'Could not publish the article.');
    return NextResponse.json(body, { status });
  }
}
