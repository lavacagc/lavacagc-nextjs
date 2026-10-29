import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { claudeCodeCommands, claudeCodePrompt, shellQuote } from '../src/lib/articles/cliCommand';

/**
 * Wiring guard for the SEO Suggestions admin UI (Phase 2d), updated for
 * Phase 2 slice F (RM3, RM4): the "Draft with AI" button and its OpenAI route
 * are gone, and "Draft with Claude Code" shows the CLI commands instead.
 *
 * The page lives behind the admin session gate (/vaca-mgmt), so it can't render
 * in CI without auth. These environment-independent source assertions guard the
 * integration: the component exists, is registered in the section switcher and
 * the sidebar, and talks to the right admin endpoints. The command builder the
 * button shows is pure, so its exact output is pinned here too. The rendered
 * panel is exercised against the live rig in tests/articles-ingest.spec.ts.
 */

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

test('the SeoSuggestionsDashboard component exists and calls the content-actions APIs', () => {
  const p = join(root, 'src/components/admin/SeoSuggestionsDashboard.tsx');
  expect(existsSync(p)).toBe(true);
  const src = read('src/components/admin/SeoSuggestionsDashboard.tsx');
  expect(src).toContain('/api/admin/content-actions');
  expect(src).toContain('/api/admin/content-actions/stage');
  expect(src).toContain('/api/admin/content-actions/apply');
  expect(src).toContain('export default function SeoSuggestionsDashboard');
});

test('RM3: "Draft with AI" is replaced by "Draft with Claude Code"', () => {
  const src = read('src/components/admin/SeoSuggestionsDashboard.tsx');
  expect(src).toContain('Draft with Claude Code');
  expect(src).toContain('claudeCodeCommands');
  expect(src).not.toContain('Draft with AI');
  expect(src).not.toContain('/api/admin/content-actions/draft');
  expect(src).not.toMatch(/GPT|gpt-/);
});

test('RM3: the commands for a new action create, then publish, with the action id', () => {
  const id = '11111111-2222-4333-8444-555555555555';
  const cmds = claudeCodeCommands({
    id, action_type: 'new', target_query: "kitchen remodel cost o'hara nj", target_post_id: null, consolidate_into_id: null,
  });
  expect(cmds).toEqual([
    `node scripts/ingest-article.mjs create --action ${id} --title 'Kitchen Remodel Cost O'\\''Hara NJ' --category 'Kitchen Remodeling' --file article.md`,
    `node scripts/ingest-article.mjs publish <post id printed above> --action ${id}`,
  ]);
  expect(claudeCodePrompt({ id, action_type: 'new', target_query: 'x', target_post_id: null, consolidate_into_id: null }))
    .toContain(id);
});

test('RM3: a refresh patches the target post and a consolidate patches the primary', () => {
  const id = 'aaaaaaaa-2222-4333-8444-555555555555';
  const refresh = claudeCodeCommands({ id, action_type: 'refresh', target_query: 'q', target_post_id: 'P1', consolidate_into_id: null });
  expect(refresh).toEqual([
    `node scripts/ingest-article.mjs patch P1 --action ${id} --file article.md`,
    `node scripts/ingest-article.mjs publish P1 --action ${id}`,
  ]);
  const consolidate = claudeCodeCommands({ id, action_type: 'consolidate', target_query: 'q', target_post_id: 'P1', consolidate_into_id: 'P2' });
  expect(consolidate[0]).toContain('patch P2 ');
  expect(shellQuote("a'b")).toBe(`'a'\\''b'`);
});

test('AdminContent registers the seo section (SeoSuggestionsDashboard owns the SEO tab)', () => {
  const src = read('src/components/AdminContent.tsx');
  expect(src).toMatch(/import\(['"]@\/components\/admin\/SeoSuggestionsDashboard['"]\)/);
  // The 2026-08 admin simplification renamed the tab id from 'seo-suggestions'
  // to 'seo' when the old SEODashboard was removed.
  expect(src).toMatch(/value="seo"/);
  expect(src).toContain('<SeoSuggestionsDashboard />');
});

test('AdminSidebar exposes the SEO nav item', () => {
  const src = read('src/components/admin/AdminSidebar.tsx');
  expect(src).toMatch(/id:\s*'seo'/);
});

test('the supporting API routes exist, and the OpenAI draft route does not (RM2)', () => {
  expect(existsSync(join(root, 'src/app/api/admin/content-actions/route.ts'))).toBe(true);
  expect(existsSync(join(root, 'src/app/api/admin/content-actions/stage/route.ts'))).toBe(true);
  expect(existsSync(join(root, 'src/app/api/admin/content-actions/apply/route.ts'))).toBe(true);
  expect(existsSync(join(root, 'src/app/api/cron/seo-suggest/route.ts'))).toBe(true);
  expect(existsSync(join(root, 'src/app/api/admin/content-actions/draft'))).toBe(false);
});
