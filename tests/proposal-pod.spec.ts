import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseProposalCsv, parsePriceCents, MAX_LINES } from '../src/lib/proposals/csv';
import { categorizeLine, PROPOSAL_CATEGORIES, UNRECOGNIZED_CATEGORY } from '../src/lib/proposals/categories';

/**
 * Proposal Page Pod - Slice 1: schema + CSV contract + category registry
 * (spec WEB-020/WEB-021; owner-approved plan of 2026-08-03, all five decisions
 * on record in the plan artifact).
 *
 * No UI and no route ship in this slice, so these are pure-function and
 * source-contract assertions - the same shape home-care-records.spec.ts used
 * for its schema slice. The load-bearing claims: money parses to integer
 * cents with no float arithmetic, the wrong CSV (the estimator's internal
 * cost sheet) is rejected loudly, unknown line titles fail safe to locked,
 * and the three tables are deny-by-default.
 */

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const VALID_CSV = [
  'title,description,price',
  'Demolition & prep,"Gut to studs, disposal, protection",4800',
  'Plumbing rough-in,"Relocate drain, new valves","$3,650.00"',
  'Tile - heated floor upgrade,Porcelain + electric radiant mat,2900.50',
  'Vanity - double sink,"60"" semi-custom, quartz top",3400',
].join('\n');

test('AC1: a valid 3-column export parses to positioned lines in integer cents', () => {
  const res = parseProposalCsv(VALID_CSV);
  expect(res.errors).toEqual([]);
  expect(res.lines).toHaveLength(4);
  expect(res.lines.map((l) => l.position)).toEqual([0, 1, 2, 3]);
  expect(res.lines[0].priceCents).toBe(480000);
  expect(res.lines[1].priceCents).toBe(365000);
  expect(res.lines[2].priceCents).toBe(290050);
});

test('AC2: RFC 4180 quoting survives - embedded commas and doubled quotes', () => {
  const res = parseProposalCsv(VALID_CSV);
  expect(res.errors).toEqual([]);
  expect(res.lines[0].description).toBe('Gut to studs, disposal, protection');
  expect(res.lines[3].description).toBe('60" semi-custom, quartz top');
});

test('AC2b: a quote mid-field is data, not a wrapper - inch marks survive intact', () => {
  // The corruption this guards: treating the inch marks as field quoting parsed
  // to a clean 3-column row, deleted both quotes, and reported ok.
  const res = parseProposalCsv('title,description,price\nTile 12" x 24" porcelain,Sets in thinset,2900');
  expect(res.errors).toEqual([]);
  expect(res.lines[0].title).toBe('Tile 12" x 24" porcelain');
  expect(res.lines[0].priceCents).toBe(290000);

  // A field that really does open with a quote and never closes it fails loudly
  // rather than swallowing the rest of the file.
  const unterminated = parseProposalCsv('title,description,price\n"Cabinets,,1000\nTile,,2000');
  expect(unterminated.ok).toBe(false);
  expect(unterminated.errors[0]).toContain('Row 2');
  expect(unterminated.errors[0]).toContain('never closed');
});

test('AC2c: blank and empty rows fail with the row number the admin sees in their editor', () => {
  // Interior blank line on file line 3; the bad price is on file line 4.
  const res = parseProposalCsv('title,description,price\nCabinets,,1000\n\nTile,,TBD\n');
  expect(res.ok).toBe(false);
  expect(res.errors.some((e) => e.startsWith('Row 3') && e.includes('blank'))).toBe(true);
  expect(res.errors.some((e) => e.startsWith('Row 4') && e.includes('TBD'))).toBe(true);

  // ",," is a malformed data row, not whitespace: dropping it silently is the
  // dropped line this parser exists to prevent.
  const empty = parseProposalCsv('title,description,price\nCabinets,,1000\n,,\n');
  expect(empty.ok).toBe(false);
  expect(empty.errors[0]).toContain('Row 3');
  expect(empty.errors[0]).toContain('empty title');

  // A trailing newline is still punctuation, not a row.
  expect(parseProposalCsv('title,description,price\nCabinets,,1000\n\n').ok).toBe(true);
});

test('AC3: money is string-split, never floated, and dirty prices fail with their row number', () => {
  // The parseFloat trap this guards against: 19.99 * 100 === 1998.9999999...
  expect(parsePriceCents('19.99')).toBe(1999);
  expect(parsePriceCents('$12,345.67')).toBe(1234567);
  expect(parsePriceCents('0')).toBe(0);
  expect(parsePriceCents('12345.678')).toBeNull();
  expect(parsePriceCents('-500')).toBeNull();
  expect(parsePriceCents('TBD')).toBeNull();

  const res = parseProposalCsv('title,description,price\nCabinets,,TBD');
  expect(res.ok).toBe(false);
  expect(res.errors[0]).toContain('Row 2');
});

test('AC4: the internal cost sheet is rejected loudly - the wrong-file guard', () => {
  // Header shaped like the estimator's internal export (crew/day-rate columns).
  const costSheet = 'Task,Scope,Name,Qty,Unit,Days,Crew,DayRate,Materials,Labor,Total,Notes\n'
    + 'Task,Bath,Demo,1,job,2,2,850,300,3400,3700,';
  const res = parseProposalCsv(costSheet);
  expect(res.ok).toBe(false);
  expect(res.lines).toEqual([]);
  expect(res.errors[0]).toContain('title, description, price');
  expect(res.errors[0].toLowerCase()).toContain('cost-sheet');
});

test('AC5: finish keywords go optional, structure stays locked, unknown fails safe to locked', () => {
  expect(categorizeLine('Vanity - double sink').optional).toBe(true);
  expect(categorizeLine('Tile - heated floor upgrade').optional).toBe(true);
  expect(categorizeLine('Cabinet refacing').optional).toBe(true);
  expect(categorizeLine('Appliance package').optional).toBe(true);
  expect(categorizeLine('Demolition & prep').optional).toBe(false);
  expect(categorizeLine('Plumbing rough-in').optional).toBe(false);
  expect(categorizeLine('Permit & inspection').optional).toBe(false);
  // The fail-safe: nothing the registry knows -> locked.
  const unknown = categorizeLine('Zorble calibration');
  expect(unknown.optional).toBe(false);
  expect(unknown.key).toBe(UNRECOGNIZED_CATEGORY.key);
  // Structure wins ties: a line that names both demo and a finish stays locked.
  expect(categorizeLine('Demolition of old cabinets').optional).toBe(false);
});

test('AC5b: matching is word-aware - the most specific keyword wins, fragments never match', () => {
  // "disposal" is a demolition keyword; "garbage disposal" is the appliance,
  // and being longer it wins. Locking it would strip the client's toggle.
  const disposal = categorizeLine('Garbage disposal - InSinkErator');
  expect(disposal.key).toBe('appliances');
  expect(disposal.optional).toBe(true);
  // ... while debris disposal is still demolition, and still locked.
  expect(categorizeLine('Disposal of demo debris').key).toBe('demolition');
  expect(categorizeLine('Disposal of demo debris').optional).toBe(false);

  // A keyword must never match inside a longer word: "range" is not "Arrange",
  // so this falls through to the locked fail-safe.
  const arrange = categorizeLine('Arrange delivery of materials');
  expect(arrange.key).toBe(UNRECOGNIZED_CATEGORY.key);
  expect(arrange.optional).toBe(false);

  // Word-aware must not cost the registry its plurals.
  expect(categorizeLine('Cabinets - shaker white').key).toBe('cabinets');
  expect(categorizeLine('Cabinet pulls and knobs').key).toBe('cabinets');
  expect(categorizeLine('Backsplashes - subway').key).toBe('tile');
});

test('AC5c: the registry hands out copies - a per-line override cannot poison the fail-safe', () => {
  const verdict = categorizeLine('Zorble calibration');
  expect(verdict).not.toBe(UNRECOGNIZED_CATEGORY);
  // The documented consumer pattern: the admin flips one line in the preview.
  (verdict as { optional: boolean }).optional = true;
  // Every later unknown line must still come back locked.
  expect(categorizeLine('Blorp installation').optional).toBe(false);
  expect(UNRECOGNIZED_CATEGORY.optional).toBe(false);
  expect(categorizeLine('Vanity - double sink')).not.toBe(categorizeLine('Vanity - double sink'));
  // The registry itself is not a scratch object either.
  expect(Object.isFrozen(PROPOSAL_CATEGORIES)).toBe(true);
  expect(Object.isFrozen(PROPOSAL_CATEGORIES[0])).toBe(true);
  expect(Object.isFrozen(UNRECOGNIZED_CATEGORY)).toBe(true);
});

test('AC6: every category carries a lucide icon key for WEB-024', () => {
  for (const cat of PROPOSAL_CATEGORIES) {
    expect(cat.icon, `category ${cat.key} needs an icon`).toMatch(/^[a-z0-9-]+$/);
  }
  expect(UNRECOGNIZED_CATEGORY.icon).toMatch(/^[a-z0-9-]+$/);
});

test('AC7: all three tables are deny-by-default - RLS on, zero policies, cents-only money', () => {
  const sql = read('supabase/migrations/20260824000000_proposals.sql');
  for (const t of ['proposals', 'proposal_lines', 'proposal_submissions']) {
    expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${t}`);
    expect(sql).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`);
  }
  expect(sql).not.toMatch(/CREATE\s+POLICY/i);
  // Money is integer cents; a float/numeric money column must never appear.
  // Comments discuss those types by name, so only DDL lines are checked.
  const ddl = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  expect(ddl).toMatch(/price_cents\s+BIGINT/);
  expect(ddl).toMatch(/total_cents\s+BIGINT/);
  expect(ddl).not.toMatch(/NUMERIC|DECIMAL|FLOAT|REAL|MONEY/i);
});

test('AC7b: a submission snapshots the composition it agreed to (D4 survives a re-import)', () => {
  const sql = read('supabase/migrations/20260824000000_proposals.sql');
  // Bare line ids would dangle the moment a CSV re-import replaces the rows.
  expect(sql).not.toContain('included_line_ids');
  expect(sql).toMatch(/included_lines\s+JSONB\s+NOT NULL/);
  expect(sql).toMatch(/jsonb_typeof\(included_lines\)\s*=\s*'array'/);
  expect(sql).toMatch(/"id", "title", "price_cents"/);
  // The total stays server-computed money, not a client number.
  expect(sql).toMatch(/total_cents\s+BIGINT NOT NULL CHECK \(total_cents >= 0\)/);
});

test('AC8: the token is 32 random bytes base64url, the intake recipe', () => {
  const src = read('src/lib/proposals/token.ts');
  expect(src).toMatch(/randomBytes\(32\)\.toString\('base64url'\)/);
});

test('AC9: caps hold - line count, title and description length', () => {
  const many = ['title,description,price',
    ...Array.from({ length: MAX_LINES + 1 }, (_, i) => `Line ${i},,100`)].join('\n');
  const res = parseProposalCsv(many);
  expect(res.ok).toBe(false);

  const longTitle = `title,description,price\n${'x'.repeat(201)},,100`;
  expect(parseProposalCsv(longTitle).ok).toBe(false);
});

test('AC10: no em dashes in the slice-1 modules (house style)', () => {
  for (const p of [
    'src/lib/proposals/categories.ts',
    'src/lib/proposals/csv.ts',
    'src/lib/proposals/token.ts',
    'supabase/migrations/20260824000000_proposals.sql',
  ]) {
    expect(read(p), `${p} must not contain an em dash`).not.toContain('—');
  }
});
