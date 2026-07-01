import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const MIGRATION = 'supabase/migrations/20260730000000_home_care_catalog_v2.sql';
const CLIENT = 'src/components/homecare/HomeCareChecklistClient.tsx';

// Wiring guards for Home Care catalog v2 (pricing + new NJ items + seasonal
// spotlight). These are file-level assertions in the same style as
// home-care.spec.ts ('opt-in flow files are wired') — the catalog data itself
// lives in Supabase, so the migration is the source of truth we can assert on.

test('migration widens the high estimate on core services', () => {
  const sql = readFileSync(join(root, MIGRATION), 'utf8');
  expect(sql).toContain("est_cost_high = 525  WHERE key = 'clean_gutters'");
  expect(sql).toContain("est_cost_high = 1800 WHERE key = 'seal_deck'");
  expect(sql).toContain("est_cost_high = 1200 WHERE key = 'reseal_driveway'");
  expect(sql).toContain("est_cost_high = 750  WHERE key = 'caulk_windows'");
});

test('migration strips pricing (both bounds NULL) on variable / system tasks', () => {
  const sql = readFileSync(join(root, MIGRATION), 'utf8');
  expect(sql).toContain('est_cost_low = NULL, est_cost_high = NULL');
  for (const k of ['sell_curb_appeal', 'sell_quick_repairs', 'sell_pre_inspection', 'pool_open', 'pool_close', 'septic_pump', 'garage_door_service']) {
    expect(sql, k).toContain(`'${k}'`);
  }
});

test('new NJ items are added with NULL prices and matchable applies_to keys', () => {
  const sql = readFileSync(join(root, MIGRATION), 'utf8');
  const VALID = new Set(['all', 'roof', 'water_heater', 'windows', 'exterior', 'plumbing', 'gutters', 'hvac', 'lawn', 'deck', 'sump_pump', 'fireplace', 'driveway', 'pool', 'septic', 'garage']);
  for (const k of ['ice_dam_check', 'radon_test', 'refinish_hardwood', 'drainage_check', 'sump_backup_test', 'trim_paint_touchup', 'generator_service', 'range_hood_service']) {
    expect(sql, k).toContain(`'${k}'`);
  }
  // gated items must target a key that actually matches (else they vanish for profiled homes)
  expect(sql).toMatch(/'ice_dam_check',[\s\S]*?ARRAY\['roof'\]/);
  expect(sql).toMatch(/'sump_backup_test',[\s\S]*?ARRAY\['sump_pump'\]/);
  expect(sql).toMatch(/'trim_paint_touchup',[\s\S]*?ARRAY\['exterior'\]/);
  // every applies_to array in the file uses only valid keys
  for (const m of sql.matchAll(/ARRAY\[((?:'[a-z_]+'(?:,\s*)?)+)\](?=,\s*ARRAY\[)/g)) {
    for (const key of m[1].match(/'([a-z_]+)'/g)!.map((s) => s.replace(/'/g, ''))) {
      expect(VALID.has(key), `applies_to '${key}' is not a real system/universal key`).toBe(true);
    }
  }
});

test('seasonal spotlight: all four seasons defined + Free Estimate CTA wired', () => {
  const src = readFileSync(join(root, CLIENT), 'utf8');
  for (const s of ['winter', 'spring', 'summer', 'fall']) {
    expect(src, s).toMatch(new RegExp(`${s}:\\s*\\{\\s*eyebrow`));
  }
  expect(src).toContain('SEASON_SPOTLIGHTS[activeSeason]');
  expect(src).toContain('/free-estimate?utm_source=home_care');
});
