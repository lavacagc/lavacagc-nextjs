/**
 * SEO Autonomy — Phase 2 drafting guardrails.
 *
 * Pure validators + prompt builders for AI-drafted content. The big risk for a
 * licensed NJ contractor (HIC# 13VH13373800) is the model inventing a license
 * number, phone, or pricing — a consumer-fraud exposure. content_facts is the
 * lock table; drafts are validated against it before a human ever sees "drafted".
 *
 * No I/O — unit-testable. The route loads facts + posts, builds the prompt,
 * calls the model, then runs validateDraft() on the output.
 */

export interface Fact {
  key: string;
  value: string;
  description?: string | null;
}

export interface DraftAction {
  action_type: 'refresh' | 'consolidate' | 'new';
  target_query: string | null;
  rationale: Record<string, unknown> | null;
  /** Existing post content, for refresh/consolidate. */
  currentTitle?: string | null;
  currentMarkdown?: string | null;
  foldInTitle?: string | null;
}

export interface DraftValidation {
  ok: boolean;
  issues: string[];
  internalLinks: number;
}

// Markdown links to internal paths: ](/services/...), ](/blog/...), etc.
const INTERNAL_LINK_RE = /\]\((\/[a-z0-9\-/#?=&._]*)\)/gi;
// Phone-ish: (201) 212-4917 / 201-212-4917 / 201.212.4917 / 2012124917
const PHONE_RE = /\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/g;
// NJ Home Improvement Contractor license, e.g. 13VH13373800
const LICENSE_RE = /\b\d{2}VH\d{6,8}\b/gi;

function digits(s: string): string {
  return s.replace(/\D/g, '');
}

/**
 * Validate an AI draft against the fact-lock + structural guardrails.
 * Returns ok=false with human-readable issues if anything looks unsafe.
 */
export function validateDraft(markdown: string, facts: Fact[], minInternalLinks = 3): DraftValidation {
  const issues: string[] = [];
  const factMap = Object.fromEntries(facts.map((f) => [f.key, f.value]));

  // 1) Internal links — every autogen post must cross-link the site.
  const internalLinks = [...markdown.matchAll(INTERNAL_LINK_RE)].length;
  if (internalLinks < minInternalLinks) {
    issues.push(`Only ${internalLinks} internal link(s); needs at least ${minInternalLinks}.`);
  }

  // 2) Phone — any phone in the copy must be the locked business number.
  if (factMap.phone_main) {
    const locked = digits(factMap.phone_main);
    for (const m of markdown.matchAll(PHONE_RE)) {
      if (digits(m[0]) !== locked) {
        issues.push(`Unrecognized phone number "${m[0]}" (locked: ${factMap.phone_main}).`);
      }
    }
  }

  // 3) License — any HIC-format number must be the locked license.
  if (factMap.hic_number) {
    const locked = factMap.hic_number.toUpperCase();
    for (const m of markdown.matchAll(LICENSE_RE)) {
      if (m[0].toUpperCase() !== locked) {
        issues.push(`Unrecognized license number "${m[0]}" (locked: ${factMap.hic_number}).`);
      }
    }
  }

  return { ok: issues.length === 0, issues, internalLinks };
}

/** A system-prompt block that hard-codes the locked facts the model must use verbatim. */
export function buildFactLockText(facts: Fact[]): string {
  if (!facts.length) return '';
  const lines = facts.map((f) => `- ${f.key}: ${f.value}${f.description ? ` (${f.description})` : ''}`);
  return `LOCKED FACTS — use these EXACTLY when relevant; NEVER invent or alter a license number, phone number, email, pricing, or service area:
${lines.join('\n')}

If you are unsure of a specific number or fact not listed above, write around it generally rather than inventing one.`;
}

/** Turn a queued action into a concrete drafting instruction for the model. */
export function buildDraftInstruction(action: DraftAction): string {
  const q = action.target_query ? `"${action.target_query}"` : 'the target topic';
  switch (action.action_type) {
    case 'new':
      return `Write a brand-new blog post targeting the search query ${q}. This is a query La Vaca currently shows up for but has no dedicated page owning it.`;
    case 'refresh':
      return `Rewrite and improve the existing post below to better win the query ${q} — sharper title, stronger intro, clearer structure, more specific detail. Keep what works; fix what underperforms.

EXISTING TITLE: ${action.currentTitle ?? '(unknown)'}

EXISTING CONTENT:
${action.currentMarkdown ?? '(not provided)'}`;
    case 'consolidate':
      return `Produce ONE consolidated, authoritative post for the query ${q} by merging the two competing posts below into a single stronger article (keep the best of each, remove redundancy). The merged post will replace the primary; the secondary ("${action.foldInTitle ?? 'secondary'}") will be redirected into it.

PRIMARY (keep as base):
TITLE: ${action.currentTitle ?? '(unknown)'}
${action.currentMarkdown ?? '(not provided)'}`;
  }
}
