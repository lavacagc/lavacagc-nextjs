import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Home Care landing page: animated checklist preview section.
 *
 * A scroll-triggered preview card (src/components/homecare/ChecklistPreview.tsx)
 * that shows visitors the kind of content their real seasonal plan gives them
 * and checks tasks off as it scrolls into view. Owner-approved via a live
 * browser sample before build. These guard the wiring + the acceptance criteria
 * that can't be seen from a screenshot (reduced-motion, the signup funnel), in
 * the same source-assertion style as the other home-care specs since the
 * animation itself is browser/IntersectionObserver-driven.
 */

const root = process.cwd();
const componentPath = join(root, 'src/components/homecare/ChecklistPreview.tsx');
const pagePath = join(root, 'src/app/home-care/page.tsx');
const component = readFileSync(componentPath, 'utf8');
const page = readFileSync(pagePath, 'utf8');

test('AC1: preview component exists and renders real catalog task content', () => {
  expect(existsSync(componentPath)).toBe(true);
  expect(component).toContain("'use client'");
  // A representative summer plan with real catalog titles (phase1 seed).
  for (const title of [
    'Clean & seal the deck',
    'Seal-coat the driveway',
    'Replace the HVAC filter',
    'Test GFCI outlets',
  ]) {
    expect(component, title).toContain(title);
  }
  // Season label header + progress + bookable "Book it" affordance.
  expect(component).toContain('plan'); // "Your {season} plan"
  expect(component).toContain('Book it');
});

test('AC2: check-off animation is scroll-triggered and fires once', () => {
  expect(component).toContain('IntersectionObserver');
  expect(component).toContain('threshold');
  // Guarded so it only plays a single time.
  expect(component).toMatch(/observer\.disconnect\(\)/);
  expect(component).toContain('STAGGER_MS');
});

test('AC3: prefers-reduced-motion shows the finished plan with no motion', () => {
  expect(component).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
  // Reduced-motion branch jumps straight to the completed state.
  expect(component).toMatch(/reduce[\s\S]{0,120}setDoneCount\(total\)/);
});

test('AC4: preview sits right below the signup (before the how-it-works steps), pinned to Summer', () => {
  expect(page).toContain("import ChecklistPreview from '@/components/homecare/ChecklistPreview'");
  expect(page).toContain('<ChecklistPreview');
  expect(page).toContain('seasonLabel="Summer"');
  // Placement: the preview section renders before the "how it works" STEPS grid,
  // so a visitor can preview their plan straight after the signup form.
  const previewIdx = page.indexOf('id="plan-preview"');
  const stepsIdx = page.indexOf('STEPS.map');
  expect(previewIdx).toBeGreaterThan(-1);
  expect(stepsIdx).toBeGreaterThan(-1);
  expect(previewIdx).toBeLessThan(stepsIdx);
});

test('AC8: hero has a scroll cue that points to the plan preview', () => {
  expect(page).toContain('id="plan-preview"');
  expect(page).toContain('href="#plan-preview"');
  expect(page).toContain('See a sample of your plan');
  expect(page).toContain('ChevronDown');
  // The cue lives in the hero (before the preview section it targets).
  expect(page.indexOf('See a sample of your plan')).toBeLessThan(page.indexOf('id="plan-preview"'));
});

test('AC5: signup stays anchored at the top and the section funnels back to it', () => {
  // Existing opt-in form is untouched and carries the anchor target.
  expect(page).toContain('<HomeCareOptInForm />');
  expect(page).toContain('id="get-started"');
  expect(page).toContain('scroll-mt-28');
  // The preview section CTA links back to the signup.
  expect(page).toContain('href="#get-started"');
  expect(page).toContain('Get my free seasonal plan');
});

test('AC6: no em dashes in the newly authored files (global style rule)', () => {
  expect(component.includes('—')).toBe(false);
  // Only assert against the section we added, not pre-existing page copy.
  const previewSection = page.slice(page.indexOf('Animated checklist preview'));
  expect(previewSection.includes('—')).toBe(false);
});

test('AC7: preview uses no emoji on the Home Care page (owner style rule)', () => {
  // Home Care surfaces avoid emojis; the completed-plan celebration uses the
  // lucide PartyPopper icon (matching HomeCareChecklistClient), not "🎉".
  expect(component.includes('🎉')).toBe(false);
  expect(component).toContain('PartyPopper');
  // No characters in the emoji/pictograph ranges anywhere in the component.
  expect(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(component)).toBe(false);
});

test('AC8 (DP7): the public preview quotes no price', () => {
  // The checklist stopped quoting prices (owner, 6 Aug 2026), and this preview
  // renders directly below the sentence on /home-care that used to promise "a
  // rough cost". Held here rather than by a rendered assertion because the
  // component is a fixed illustration with hardcoded sample tasks - the way
  // pricing would come back is somebody editing that data, which is exactly
  // what a source assertion catches.
  expect(/\$\s?\d/.test(component)).toBe(false);
  expect(component).not.toMatch(/est_cost|price_band|priceBand|\bcost\b/);
  // And the sentence above it no longer promises one either.
  expect(page).not.toContain('a rough cost');
});
