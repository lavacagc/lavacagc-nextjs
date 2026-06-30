import { test, expect } from '@playwright/test';
import { validateDraft, buildFactLockText, buildDraftInstruction, type Fact } from '../src/lib/seo/draftGuardrails';

/**
 * Unit tests for Phase 2 drafting guardrails. Pure — runs in CI.
 *
 * Acceptance criteria:
 *  1. A clean draft (≥3 internal links, correct phone + license) passes.
 *  2. Too few internal links fails.
 *  3. A wrong phone number fails (hallucinated contact info).
 *  4. A wrong NJ HIC license number fails (consumer-fraud risk).
 *  5. The fact-lock prompt block includes the locked values.
 *  6. The drafting instruction differs by action type.
 */

const FACTS: Fact[] = [
  { key: 'hic_number', value: '13VH13373800' },
  { key: 'phone_main', value: '(201) 212-4917' },
];

const GOOD_DRAFT = `# Kitchen Remodeling in Montclair

Call us at (201) 212-4917. La Vaca is a licensed NJ contractor (HIC 13VH13373800).

See our [kitchen remodeling](/services/kitchen-remodeling), [bathroom remodeling](/services/bathroom-remodeling),
and get a [free estimate](/free-estimate).`;

test('clean draft passes all guardrails', () => {
  const v = validateDraft(GOOD_DRAFT, FACTS);
  expect(v.ok, v.issues.join('; ')).toBe(true);
  expect(v.internalLinks).toBe(3);
});

test('too few internal links fails', () => {
  const draft = `# Post\n\nOnly one [link](/services/kitchen-remodeling) here. Call (201) 212-4917.`;
  const v = validateDraft(draft, FACTS);
  expect(v.ok).toBe(false);
  expect(v.issues.some((i) => /internal link/i.test(i))).toBe(true);
});

test('hallucinated phone number fails', () => {
  const draft = `${GOOD_DRAFT}\n\nOr call our other line at (555) 123-4567.`;
  const v = validateDraft(draft, FACTS);
  expect(v.ok).toBe(false);
  expect(v.issues.some((i) => /phone/i.test(i))).toBe(true);
});

test('wrong NJ license number fails', () => {
  const draft = GOOD_DRAFT.replace('13VH13373800', '99VH00000000');
  const v = validateDraft(draft, FACTS);
  expect(v.ok).toBe(false);
  expect(v.issues.some((i) => /license/i.test(i))).toBe(true);
});

test('fact-lock prompt block includes locked values', () => {
  const text = buildFactLockText(FACTS);
  expect(text).toContain('13VH13373800');
  expect(text).toContain('(201) 212-4917');
  expect(text).toMatch(/NEVER invent/i);
});

test('draft instruction differs by action type', () => {
  const base = { target_query: 'kitchen remodel cost nj', rationale: null };
  expect(buildDraftInstruction({ ...base, action_type: 'new' })).toMatch(/brand-new/i);
  expect(buildDraftInstruction({ ...base, action_type: 'refresh', currentMarkdown: 'old' })).toMatch(/rewrite/i);
  expect(buildDraftInstruction({ ...base, action_type: 'consolidate', currentMarkdown: 'old' })).toMatch(/consolidat|merg/i);
});
