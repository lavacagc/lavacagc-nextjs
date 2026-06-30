import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { buildBlogPostFromDraft, slugify, categoryForQuery } from '../src/lib/seo/stageToBlog';

/**
 * Phase 3 staging: drafted action → blog_posts DRAFT.
 *
 * Acceptance criteria:
 *  1. Title comes from the first `# ` line; content has it stripped.
 *  2. Slug is URL-safe; excerpt/meta are plain text; published is false.
 *  3. Category is inferred from the query.
 *  4. The stage route + UI button are wired.
 */

const MD = `# Kitchen Remodel Cost in Bergen County, NJ

If you're planning a **kitchen** remodel, the first question is cost.

## Section
Some [internal link](/services/kitchen-remodeling) text.`;

test('buildBlogPostFromDraft extracts title, strips it from content, makes a draft', () => {
  const p = buildBlogPostFromDraft(MD, { category: 'Kitchen Remodeling' });
  expect(p.title).toBe('Kitchen Remodel Cost in Bergen County, NJ');
  expect(p.slug).toBe('kitchen-remodel-cost-in-bergen-county-nj');
  expect(p.content.startsWith('#')).toBe(false); // title line removed
  expect(p.content).toContain('## Section');
  expect(p.published).toBe(false);
  expect(p.excerpt.length).toBeGreaterThan(0);
  expect(p.excerpt).not.toContain('#');
  expect(p.meta_description.length).toBeLessThanOrEqual(155);
  expect(p.category).toBe('Kitchen Remodeling');
});

test('slugify produces clean slugs', () => {
  expect(slugify('Hello,  World! 2026')).toBe('hello-world-2026');
  expect(slugify('  --Trim-- ')).toBe('trim');
});

test('categoryForQuery maps keywords', () => {
  expect(categoryForQuery('kitchen remodel cost nj')).toBe('Kitchen Remodeling');
  expect(categoryForQuery('bathroom reno')).toBe('Bathroom Remodeling');
  expect(categoryForQuery('basement finishing')).toBe('Basement Finishing');
  expect(categoryForQuery('something else')).toBe('Home Improvement Tips');
});

test('untitled draft still produces a valid post', () => {
  const p = buildBlogPostFromDraft('no heading here, just text');
  expect(p.title).toBe('Untitled');
  expect(p.slug).toBe('untitled');
  expect(p.published).toBe(false);
});

test('stage route + UI are wired', () => {
  const root = process.cwd();
  expect(existsSync(join(root, 'src/app/api/admin/content-actions/stage/route.ts'))).toBe(true);
  const ui = readFileSync(join(root, 'src/components/admin/SeoSuggestionsDashboard.tsx'), 'utf8');
  expect(ui).toContain('/api/admin/content-actions/stage');
  expect(ui).toContain('Send to blog');
});
