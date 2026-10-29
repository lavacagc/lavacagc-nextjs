/**
 * POST /api/articles/ingest - create an UNPUBLISHED blog post from Claude Code
 * (or any script holding PROJECT_INGEST_TOKEN). Never publishes; see
 * ./[id]/publish.
 *
 * Body: `{ title, slug?, content, category, excerpt?, meta_title?,
 * meta_description?, meta_keywords?, featured_image?, faq?: [{ q, a }],
 * action_id? }`. `content` is markdown. A missing slug is derived from the
 * title and made unique with a numeric suffix (ART6).
 *
 * `action_id` names a `new` content action this article answers: the action
 * becomes `drafted` with this post as its draft (src/lib/articles/actions.ts).
 *
 * Answers 201 `{ id, slug, adminUrl, previewUrl }` (ART2).
 * Auth: src/lib/articles/auth.ts. Docs: docs/articles-ingest.md.
 */
import { NextRequest, NextResponse } from 'next/server';
import { validationResponse } from '@/lib/projects/http';
import { recordActionDraft, requireOpenAction, type ContentActionRow } from '@/lib/articles/actions';
import { authorizeArticles } from '@/lib/articles/auth';
import { articleAdminUrl, articlePreviewUrl, readArticleBody } from '@/lib/articles/http';
import { articleCreateSchema } from '@/lib/articles/schemas';
import { ArticleError, createArticle, errorResponseBody, loadContentFacts } from '@/lib/articles/writer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const caller = await authorizeArticles(request);
  if ('response' in caller) return caller.response;

  const read = await readArticleBody(request);
  if ('response' in read) return read.response;
  const parsed = articleCreateSchema.safeParse(read.body);
  if (!parsed.success) return validationResponse(parsed.error);

  try {
    let action: ContentActionRow | null = null;
    if (parsed.data.action_id) {
      action = await requireOpenAction(parsed.data.action_id);
      if (action.action_type !== 'new') {
        throw new ArticleError(400,
          `action_id: a ${action.action_type} action rewrites an existing post. PATCH /api/articles/ingest/<post id> with the action_id instead.`);
      }
      const existingPost = action.draft_meta?.post_id;
      if (typeof existingPost === 'string') {
        throw new ArticleError(409, `action_id: the action already has a draft post (${existingPost}); PATCH that post instead.`);
      }
    }

    const created = await createArticle(parsed.data);
    const drafted = action ? await recordActionDraft(action, created, await loadContentFacts()) : null;

    return NextResponse.json({
      id: created.id,
      slug: created.slug,
      adminUrl: articleAdminUrl(request, created.id),
      previewUrl: articlePreviewUrl(request, created.slug),
      ...(action && drafted ? { action: { id: action.id, status: drafted.status, validation: drafted.validation } } : {}),
    }, { status: 201 });
  } catch (err) {
    const { status, body } = errorResponseBody(err, 'Could not create the article.');
    return NextResponse.json(body, { status });
  }
}
