/**
 * Admin: draft an approved SEO content action with GPT-5.5 (Phase 2).
 * Admin-gated by middleware (/api/admin/* requires a Supabase session).
 *
 *  POST { id } → drafts the action, validates against the fact-lock, stores
 *  draft_markdown, sets status='drafted', and returns the draft + any guardrail
 *  issues. Nothing publishes here — a human still reviews (and Phase 3 schedules).
 *
 * Drafting runs in-process via the OpenAI SDK (reuses OPENAI_API_KEY already in
 * Vercel) so it doesn't depend on the Supabase edge-function secret.
 */
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { cleanEnv } from '@/lib/envClean';
import { supabaseRest } from '@/lib/seo/supabase-rest';
import {
  validateDraft,
  buildFactLockText,
  buildDraftInstruction,
  type Fact,
  type DraftAction,
} from '@/lib/seo/draftGuardrails';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300; // GPT-5.5 long-form generation can take ~60s+

const DRAFT_MODEL = 'gpt-5.5';

interface ActionRow {
  id: string;
  action_type: 'refresh' | 'consolidate' | 'new';
  target_post_id: string | null;
  consolidate_into_id: string | null;
  target_query: string | null;
  rationale: Record<string, unknown> | null;
  status: string;
}

interface PostContent {
  id: string;
  title: string;
  slug: string;
  content: string | null;
}

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

export async function POST(request: NextRequest) {
  const apiKey = cleanEnv(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'OPENAI_API_KEY not configured' }, { status: 500 });
  }

  try {
    const { id } = (await request.json().catch(() => ({}))) as { id?: string };
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Body must be { id }' }, { status: 400 });
    }

    const actions = await supabaseRest<ActionRow[]>(
      'GET',
      `content_actions?select=id,action_type,target_post_id,consolidate_into_id,target_query,rationale,status&id=eq.${id}`,
    );
    const action = actions?.[0];
    if (!action) {
      return NextResponse.json({ ok: false, error: 'Action not found' }, { status: 404 });
    }

    // Fact-lock + a small set of linkable pages (recent posts + key site pages).
    const [facts, posts] = await Promise.all([
      supabaseRest<Fact[]>('GET', 'content_facts?select=key,value,description'),
      supabaseRest<PostContent[]>('GET', 'blog_posts?select=id,title,slug,content&published=eq.true&order=created_at.desc&limit=12'),
    ]);

    const linkLines = [
      '- /free-estimate (Get a Free Estimate)',
      '- /project-calculator (Project Cost Calculator)',
      '- /portfolio (Our Work)',
      '- /buy-and-remodel (Homes to Buy + Remodel)',
      ...(posts ?? []).map((p) => `- /blog/${p.slug} (${p.title})`),
    ].join('\n');

    // Pull current content for refresh/consolidate.
    const postById = Object.fromEntries((posts ?? []).map((p) => [p.id, p]));
    const basePost =
      action.action_type === 'consolidate'
        ? action.consolidate_into_id
          ? postById[action.consolidate_into_id]
          : undefined
        : action.target_post_id
          ? postById[action.target_post_id]
          : undefined;
    // basePost may be missing if the post fell outside the recent-12 window; fetch it directly.
    let resolvedBase: PostContent | undefined = basePost;
    const needId = action.action_type === 'consolidate' ? action.consolidate_into_id : action.target_post_id;
    if (!resolvedBase && needId) {
      const one = await supabaseRest<PostContent[]>(
        'GET',
        `blog_posts?select=id,title,slug,content&id=eq.${needId}`,
      );
      resolvedBase = one?.[0];
    }
    const foldIn = action.action_type === 'consolidate' && action.target_post_id ? postById[action.target_post_id] : undefined;

    const draftAction: DraftAction = {
      action_type: action.action_type,
      target_query: action.target_query,
      rationale: action.rationale,
      currentTitle: resolvedBase?.title ?? null,
      currentMarkdown: resolvedBase?.content ?? null,
      foldInTitle: foldIn?.title ?? null,
    };

    const system = buildSystemPrompt(buildFactLockText(facts ?? []), linkLines);
    const instruction = buildDraftInstruction(draftAction);

    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: DRAFT_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: instruction },
      ],
    });
    const draft = completion.choices?.[0]?.message?.content?.trim() ?? '';
    if (!draft) {
      return NextResponse.json({ ok: false, error: 'Model returned no content' }, { status: 502 });
    }

    const validation = validateDraft(draft, facts ?? []);

    await supabaseRest(
      'PATCH',
      `content_actions?id=eq.${id}`,
      {
        draft_markdown: draft,
        draft_meta: { validation, model: DRAFT_MODEL, drafted_at: new Date().toISOString() },
        status: 'drafted',
      },
      { prefer: 'return=minimal' },
    );

    return NextResponse.json({ ok: true, id, status: 'drafted', validation, draft });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('content-action draft failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
