/**
 * SEO fact-lock: the structural and factual checks every article draft must
 * pass. The big risk for a licensed NJ contractor (HIC# 13VH13373800) is a
 * draft that invents a license number or phone - a consumer-fraud exposure.
 * content_facts is the lock table; drafts are validated against it.
 *
 * The OpenAI drafters that used to call this were removed in Phase 2
 * (decision 004, Q11 and Q13); Claude Code writes articles through
 * /api/articles/ingest now, and the article routes and the publish guard
 * (src/lib/articles/publishGuard.ts) run validateDraft.
 *
 * No I/O - unit-testable.
 */

export interface Fact {
  key: string;
  value: string;
  description?: string | null;
  /**
   * content_facts.lock. The publish guard honours a `claim_*` sentence only
   * when it is locked: the seeded placeholders ship unlocked until Alex
   * approves the wording (src/lib/articles/publishGuard.ts).
   */
  lock?: boolean | null;
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
 * Validate a draft against the fact-lock + structural guardrails.
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
