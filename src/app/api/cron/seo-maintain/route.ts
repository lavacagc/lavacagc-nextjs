/**
 * SEO Autonomy — Phase 3: monthly maintenance of the cornerstone roster.
 *
 * Monthly cron. For each public.maintained_articles row (skipping 'seasonal'
 * ones, which rotate via the Home Care maintenance_catalog):
 *
 *   - CREATE-IF-MISSING — if no blog_posts row owns the slug, AI-draft a fresh
 *     article (same in-process drafter as /api/admin/content-actions/draft:
 *     OpenAI gpt-5.5 + the shared draftGuardrails prompt builders), validate it
 *     against the fact-lock, and stage it as published=false via buildBlogPostFromDraft
 *     with forcedSlug. It NEVER sets scheduled_publish_at — a human still publishes.
 *
 *   - REFRESH-IF-STALE — if the post exists and the monthly cadence is due
 *     (last_maintained_at null or > ~25 days), AI-draft an improved rewrite and
 *     queue it as a content_actions 'refresh' row (status 'drafted') for a human
 *     to apply from the admin. The live post is NOT touched here.
 *
 * Auth: Bearer CRON_SECRET (also enforced by middleware on /api/cron/*).
 */
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { cleanEnv } from '@/lib/envClean';
import { supabaseRest } from '@/lib/seo/supabase-rest';
import { buildBlogPostFromDraft, categoryForQuery } from '@/lib/seo/stageToBlog';
import {
  validateDraft,
  buildFactLockText,
  buildDraftInstruction,
  type Fact,
  type DraftAction,
} from '@/lib/seo/draftGuardrails';
import {
  getMaintainedRoster,
  getBlogPostBySlug,
  isRefreshDue,
  markMaintained,
  type MaintainedArticle,
  type MaintainedBlogPost,
} from '@/lib/seo/maintainedArticles';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300; // long-form generation across several roster rows

const DRAFT_MODEL = 'gpt-5.5';

interface LinkablePost {
  id: string;
  title: string;
  slug: string;
  content: string | null;
}

// Mirrors buildSystemPrompt in /api/admin/content-actions/draft — kept in sync so
// maintenance drafts read identically to human-triggered drafts.
function buildSystemPrompt(factLock: string, linksList: string): string {
  return `You are an expert content writer for La Vaca General Contractors, a luxury home remodeling company serving Northern New Jersey. You write engaging, SEO-optimized, lead-generating blog posts.

Writing Style:
- Voice: knowledgeable but approachable, like a trusted neighbor who's an expert.
- Length: 1200-1800 words. Clear H2/H3 headings, short paragraphs.
- Favor flowing prose; use bullet lists only where they genuinely help.
- Open with a concrete, specific hook — never "Imagine..." or "Picture this".
- Avoid clichés/filler: "dream kitchen", "look no further", "break the bank", "nestled", "elevate your space".
- Be specific to Northern NJ (real towns, home styles, permit realities).

Structure:
1. # Title with the main keyword.
2. Hook that addresses the homeowner's pain point.
3. 3-5 H2 sections; include at least one checklist or info box.
4. Close with a subtle CTA.

Internal linking (REQUIRED): include AT LEAST 3 markdown links to relevant pages from this list, placed naturally:
${linksList}

${factLock}

Return ONLY the article markdown, starting with the # title. No preamble.`;
}

/** Draft an article for a DraftAction using the same model + guardrails as admin/draft. */
async function draftMarkdown(
  openai: OpenAI,
  action: DraftAction,
  system: string,
): Promise<string> {
  const instruction = buildDraftInstruction(action);
  const completion = await openai.chat.completions.create({
    model: DRAFT_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: instruction },
    ],
  });
  return completion.choices?.[0]?.message?.content?.trim() ?? '';
}

interface RowResult {
  topic_key: string;
  slug: string;
  outcome: 'created' | 'refresh_queued' | 'refresh_pending' | 'skipped_seasonal' | 'up_to_date' | 'validation_failed' | 'error';
  detail?: string;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = cleanEnv(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'OPENAI_API_KEY not configured' }, { status: 500 });
  }

  const now = new Date();

  try {
    const roster = await getMaintainedRoster();
    if (roster.length === 0) {
      return NextResponse.json({ ok: true, note: 'maintained_articles roster is empty', results: [] });
    }

    // Fact-lock + a small set of linkable pages, built once for the whole run
    // (same sources as /api/admin/content-actions/draft).
    const [facts, linkPosts] = await Promise.all([
      supabaseRest<Fact[]>('GET', 'content_facts?select=key,value,description'),
      supabaseRest<LinkablePost[]>(
        'GET',
        'blog_posts?select=id,title,slug,content&published=eq.true&order=created_at.desc&limit=12',
      ),
    ]);
    const linkLines = [
      '- /free-estimate (Get a Free Estimate)',
      '- /project-calculator (Project Cost Calculator)',
      '- /portfolio (Our Work)',
      ...(linkPosts ?? []).map((p) => `- /blog/${p.slug} (${p.title})`),
    ].join('\n');
    const system = buildSystemPrompt(buildFactLockText(facts ?? []), linkLines);

    const openai = new OpenAI({ apiKey });
    const results: RowResult[] = [];

    for (const row of roster) {
      try {
        const r = await maintainRow(row, openai, system, facts ?? [], now);
        results.push(r);
      } catch (err) {
        results.push({
          topic_key: row.topic_key,
          slug: row.slug,
          outcome: 'error',
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const summary = results.reduce<Record<string, number>>((acc, r) => {
      acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({ ok: true, count: results.length, summary, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('seo-maintain failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function maintainRow(
  row: MaintainedArticle,
  openai: OpenAI,
  system: string,
  facts: Fact[],
  now: Date,
): Promise<RowResult> {
  // Seasonal rows rotate via the Home Care maintenance_catalog — not our job.
  if (row.refresh_cadence === 'seasonal') {
    return { topic_key: row.topic_key, slug: row.slug, outcome: 'skipped_seasonal' };
  }

  const existing = await getBlogPostBySlug(row.slug);

  // ── CREATE-IF-MISSING ────────────────────────────────────────────────────
  if (!existing) {
    const draft = await draftMarkdown(
      openai,
      { action_type: 'new', target_query: row.target_query ?? row.title_hint ?? null, rationale: { source: 'seo-maintain', topic_key: row.topic_key } },
      system,
    );
    if (!draft) return { topic_key: row.topic_key, slug: row.slug, outcome: 'error', detail: 'model returned no content' };

    const validation = validateDraft(draft, facts);
    if (!validation.ok) {
      return { topic_key: row.topic_key, slug: row.slug, outcome: 'validation_failed', detail: validation.issues.join('; ') };
    }

    // Stage as a published=false blog draft with the roster's exact slug. Never
    // set scheduled_publish_at — the human-publish gate stays closed.
    const post = buildBlogPostFromDraft(draft, {
      category: categoryForQuery(row.target_query),
      forcedSlug: row.slug,
    });
    const inserted = await supabaseRest<{ id: string; slug: string }[]>(
      'POST',
      'blog_posts',
      [post],
      { prefer: 'return=representation' },
    );
    if (!inserted?.[0]?.id) {
      return { topic_key: row.topic_key, slug: row.slug, outcome: 'error', detail: 'failed to insert blog draft' };
    }

    await markMaintained(row.topic_key, now);
    return { topic_key: row.topic_key, slug: post.slug, outcome: 'created', detail: `blog draft ${inserted[0].id}` };
  }

  // ── REFRESH-IF-STALE ─────────────────────────────────────────────────────
  if (!isRefreshDue(row, now)) {
    return { topic_key: row.topic_key, slug: row.slug, outcome: 'up_to_date' };
  }

  // Don't stack refreshes: if an unapplied refresh for this post is already open
  // (pending / approved / drafted), skip — otherwise a monthly run would queue a
  // new draft every cadence period and they'd accumulate, and applying a stale
  // sibling later could overwrite a newer refresh with older content. We also do
  // NOT stamp last_maintained_at here, so once the human applies the queued one
  // the post is still due and gets a fresh refresh next run. (Saves an AI call too.)
  const openRefresh = await supabaseRest<Array<{ id: string }>>(
    'GET',
    `content_actions?select=id&target_post_id=eq.${existing.id}` +
      `&action_type=eq.refresh&status=in.(pending,approved,drafted)&limit=1`,
  ).catch(() => null);
  if (openRefresh && openRefresh.length > 0) {
    return { topic_key: row.topic_key, slug: row.slug, outcome: 'refresh_pending', detail: 'an unapplied refresh is already queued' };
  }

  const refreshDraft = await draftMarkdown(
    openai,
    {
      action_type: 'refresh',
      target_query: row.target_query ?? row.title_hint ?? null,
      rationale: { source: 'seo-maintain', topic_key: row.topic_key },
      currentTitle: existing.title,
      currentMarkdown: existing.content,
    },
    system,
  );
  if (!refreshDraft) return { topic_key: row.topic_key, slug: row.slug, outcome: 'error', detail: 'model returned no content' };

  const validation = validateDraft(refreshDraft, facts);

  // Queue a human-reviewable refresh action. status 'drafted' so it shows up in
  // the admin queue ready to Apply — we do NOT touch the live post here.
  await queueRefreshAction(existing, row, refreshDraft, validation);
  await markMaintained(row.topic_key, now);

  return {
    topic_key: row.topic_key,
    slug: row.slug,
    outcome: 'refresh_queued',
    detail: validation.ok ? 'draft passed validation' : `draft has issues: ${validation.issues.join('; ')}`,
  };
}

async function queueRefreshAction(
  post: MaintainedBlogPost,
  row: MaintainedArticle,
  draft: string,
  validation: ReturnType<typeof validateDraft>,
): Promise<void> {
  await supabaseRest(
    'POST',
    'content_actions',
    [
      {
        action_type: 'refresh',
        target_post_id: post.id,
        target_query: row.target_query,
        rationale: { source: 'seo-maintain', topic_key: row.topic_key, note: 'monthly cornerstone refresh' },
        status: 'drafted',
        draft_markdown: draft,
        draft_meta: { validation, model: DRAFT_MODEL, drafted_at: new Date().toISOString(), source: 'seo-maintain' },
      },
    ],
    { prefer: 'return=minimal' },
  );
}
