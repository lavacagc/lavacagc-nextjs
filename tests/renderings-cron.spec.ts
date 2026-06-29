import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Regression guard for the AI before/after rendering cron.
 *
 * The PostgREST query that selects rows to render was once written as a nested
 * `or=(status.eq.pending,and(status.eq.failed,attempts.lt.N))` filter split
 * across `+`-concatenated template-literal segments. A Turbopack minifier bug
 * dropped the trailing `))` in the production bundle, so PostgREST received a
 * malformed logic tree (PGRST100 "failed to parse logic tree"), the cron 500'd,
 * and no listing renderings were ever generated. The fix is a single template
 * literal with a flat `status=in.(pending,failed)&attempts=lt.N` filter, which
 * is semantically equivalent and survives minification intact.
 *
 * These are static-source assertions (no server needed) so the regression can
 * never silently come back.
 */
test.describe('generate-renderings cron query (regression guard)', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/app/api/cron/generate-renderings/route.ts'),
    'utf8',
  );

  test('uses the flat, minifier-safe status filter', () => {
    expect(source).toContain('status=in.(pending,failed)');
    expect(source).toContain('attempts=lt.');
  });

  test('does not reintroduce the fragile nested-or filter in the query', () => {
    // The phrase may appear in the explanatory comment, but it must NOT appear
    // as an actual `&or=(...)` query fragment.
    expect(source).not.toMatch(/[&?]or=\(status\.eq\.pending/);
  });

  test('builds the rendering query as a single template literal (no `+` splice)', () => {
    // Grab the supabaseRest('GET', `...`) call and assert the query is one
    // unbroken backtick literal — no `+` concatenation that the minifier mangled.
    const call = source.match(/supabaseRest<RenderingRow\[\]>\(\s*'GET',\s*([\s\S]*?)\);/);
    expect(call, 'expected the renderings GET call to be present').toBeTruthy();
    const queryArg = call![1];
    expect(queryArg).not.toContain('` +');
    expect(queryArg).not.toContain('+ `');
  });
});
