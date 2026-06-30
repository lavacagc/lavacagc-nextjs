import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Wiring guard for the SEO Suggestions admin UI (Phase 2d).
 *
 * The page lives behind the admin session gate (/vaca-mgmt), so it can't render
 * in CI without auth. These environment-independent source assertions guard the
 * integration: the component exists, is registered in the section switcher and
 * the sidebar, and talks to the right admin endpoints. (Same approach we use for
 * other access-gated surfaces.)
 */

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

test('the SeoSuggestionsDashboard component exists and calls the content-actions APIs', () => {
  const p = join(root, 'src/components/admin/SeoSuggestionsDashboard.tsx');
  expect(existsSync(p)).toBe(true);
  const src = read('src/components/admin/SeoSuggestionsDashboard.tsx');
  expect(src).toContain('/api/admin/content-actions');
  expect(src).toContain('/api/admin/content-actions/draft');
  expect(src).toContain('export default function SeoSuggestionsDashboard');
});

test('AdminContent registers the seo-suggestions section', () => {
  const src = read('src/components/AdminContent.tsx');
  expect(src).toMatch(/import\(['"]@\/components\/admin\/SeoSuggestionsDashboard['"]\)/);
  expect(src).toMatch(/value="seo-suggestions"/);
  expect(src).toContain('<SeoSuggestionsDashboard />');
});

test('AdminSidebar exposes the SEO Suggestions nav item', () => {
  const src = read('src/components/admin/AdminSidebar.tsx');
  expect(src).toMatch(/id:\s*'seo-suggestions'/);
});

test('the supporting API routes exist', () => {
  expect(existsSync(join(root, 'src/app/api/admin/content-actions/route.ts'))).toBe(true);
  expect(existsSync(join(root, 'src/app/api/admin/content-actions/draft/route.ts'))).toBe(true);
  expect(existsSync(join(root, 'src/app/api/cron/seo-suggest/route.ts'))).toBe(true);
});
