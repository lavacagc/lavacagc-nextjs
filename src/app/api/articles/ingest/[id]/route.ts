/**
 * PATCH /api/articles/ingest/<id> - change any subset of an article's fields
 * (the create fields, all optional). Same auth as POST /api/articles/ingest.
 *
 * `published` is kept as it was (ART3); publish and unpublish have their own
 * routes. A live post's pages are revalidated at once, under its old and new
 * slug, so the edit shows on the next request.
 *
 * With `action_id`:
 *   - a `new` action: the post is written as usual and becomes that action's draft.
 *   - a `refresh` or `consolidate` action whose live post is <id>: the post is
 *     NOT changed. The article as it would read after this patch becomes the
 *     action's draft, applied (snapshot first, so the 14-day rollback guard
 *     works) by a publish with the same action_id or by Apply in the admin.
 */
import { NextRequest, NextResponse } from 'next/server';
import { validationResponse } from '@/lib/projects/http';
import { livePostIdOf, recordActionDraft, requireOpenAction } from '@/lib/articles/actions';
import { authorizeArticles } from '@/lib/articles/auth';
import { articleAdminUrl, articlePreviewUrl, readArticleBody } from '@/lib/articles/http';
import { revalidateArticlePages } from '@/lib/articles/revalidate';
import { articleUpdateSchema } from '@/lib/articles/schemas';
import {
  ArticleError, errorResponseBody, loadContentFacts, mergeArticle, requireArticle, updateArticle, type ArticleRow,
} from '@/lib/articles/writer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function answer(request: NextRequest, post: ArticleRow, extra: Record<string, unknown> = {}) {
  return NextResponse.json({
    id: post.id,
    slug: post.slug,
    published: post.published,
    adminUrl: articleAdminUrl(request, post.id),
    previewUrl: articlePreviewUrl(request, post.slug),
    ...extra,
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await authorizeArticles(request);
  if ('response' in caller) return caller.response;
  const { id } = await params;

  const read = await readArticleBody(request);
  if ('response' in read) return read.response;
  const parsed = articleUpdateSchema.safeParse(read.body);
  if (!parsed.success) return validationResponse(parsed.error);
  const { action_id: actionId, ...fields } = parsed.data;

  try {
    if (actionId) {
      const action = await requireOpenAction(actionId);
      const post = await requireArticle(id);

      if (action.action_type !== 'new') {
        if (livePostIdOf(action) !== id) {
          throw new ArticleError(409, `action_id: that ${action.action_type} action rewrites a different post (${livePostIdOf(action) ?? 'none'}).`);
        }
        if (fields.slug && fields.slug !== post.slug) {
          throw new ArticleError(400, 'A refresh keeps the slug, so the URL and its inbound links survive.');
        }
        const drafted = await recordActionDraft(action, mergeArticle(post, fields), await loadContentFacts());
        return answer(request, post, {
          action: {
            id: action.id,
            status: drafted.status,
            validation: drafted.validation,
            note: 'The live post is unchanged. Publish with this action_id (or Apply in the admin) to apply the draft.',
          },
        });
      }

      const linked = action.draft_meta?.post_id;
      if (typeof linked === 'string' && linked !== id) {
        throw new ArticleError(409, `action_id: the action's draft is another post (${linked}).`);
      }
      const { before, after } = await updateArticle(id, fields);
      if (before.published) revalidateArticlePages(before.slug, after.slug);
      const drafted = await recordActionDraft(action, after, await loadContentFacts());
      return answer(request, after, { action: { id: action.id, status: drafted.status, validation: drafted.validation } });
    }

    const { before, after } = await updateArticle(id, fields);
    if (before.published) revalidateArticlePages(before.slug, after.slug);
    return answer(request, after);
  } catch (err) {
    const { status, body } = errorResponseBody(err, 'Could not update the article.');
    return NextResponse.json(body, { status });
  }
}
