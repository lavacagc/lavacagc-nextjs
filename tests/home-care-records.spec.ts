import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  HOME_FACTS,
  MAX_NOTE,
  getFact,
  getFactForTask,
  isCaptureTask,
  validateFactDetail,
  sanitizeNote,
} from '../src/lib/homecare/records';

/**
 * Home Care "My Home Systems" - Slice 1: schema + fact registry + validation.
 *
 * A homeowner can save durable home facts (where the water shut-off is, the HVAC
 * filter size) keyed by a canonical fact_key decoupled from the task key, stored
 * in a new deny-by-default home_records table. This slice ships the registry and
 * the write-path validator only (no UI, no route). These guard the registry's
 * integrity, the canonical "save once, show everywhere" mapping, the validator,
 * and that the migration is deny-by-default.
 */

const root = process.cwd();
const migrationsDir = join(root, 'supabase/migrations');
const migration = readFileSync(join(migrationsDir, '20260812000000_home_care_records.sql'), 'utf8');
const registrySrc = readFileSync(join(root, 'src/lib/homecare/records.ts'), 'utf8');

test('AC1: registry integrity - every fact is well-formed', () => {
  expect(HOME_FACTS.length).toBeGreaterThan(0);
  const keys = new Set<string>();
  for (const f of HOME_FACTS) {
    expect(f.key, 'fact key').toMatch(/^[a-z0-9_]+$/);
    expect(keys.has(f.key), `duplicate fact key ${f.key}`).toBe(false);
    keys.add(f.key);
    expect(f.label.length, `${f.key} label`).toBeGreaterThan(0);
    expect(['location', 'appliance']).toContain(f.kind);
    expect(f.taskKeys.length, `${f.key} taskKeys`).toBeGreaterThan(0);
    // Location facts capture a free-text note (no structured fields);
    // appliance facts declare at least one field.
    if (f.kind === 'location') expect(f.fields.length, `${f.key} is location`).toBe(0);
    if (f.kind === 'appliance') expect(f.fields.length, `${f.key} is appliance`).toBeGreaterThan(0);
    for (const field of f.fields) {
      expect(['text', 'year']).toContain(field.type);
      if (field.type === 'text') expect(field.max, `${f.key}.${field.key} max`).toBeGreaterThan(0);
    }
  }
});

test('AC2: no serial fields collected in v1 (owner decision)', () => {
  for (const f of HOME_FACTS) {
    for (const field of f.fields) {
      expect(field.key, `${f.key}.${field.key}`).not.toMatch(/serial/i);
      expect(field.label).not.toMatch(/serial/i);
    }
  }
});

test('AC3: one task maps to at most one fact; canonical fact spans its tasks', () => {
  // A task key must not be claimed by two facts (ambiguous capture).
  const seen = new Map<string, string>();
  for (const f of HOME_FACTS) {
    for (const tk of f.taskKeys) {
      expect(seen.has(tk), `task ${tk} claimed by ${seen.get(tk)} and ${f.key}`).toBe(false);
      seen.set(tk, f.key);
    }
  }
  // Flagship canonical mapping: the starter locate task and the winter recurring
  // task both resolve to the SAME fact, so a value saved once shows on both.
  expect(getFactForTask('locate_water_shutoff')?.key).toBe('water_main_shutoff');
  expect(getFactForTask('water_shutoff')?.key).toBe('water_main_shutoff');
  expect(isCaptureTask('locate_water_shutoff')).toBe(true);
  expect(isCaptureTask('not_a_capture_task')).toBe(false);
  expect(getFact('water_main_shutoff')?.kind).toBe('location');
});

test('AC4: every registered task key is a real maintenance_catalog key', () => {
  // Guard against typos/renames: a pill pointed at a non-existent task never fires.
  const allSql = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
    .join('\n');
  for (const f of HOME_FACTS) {
    for (const tk of f.taskKeys) {
      expect(allSql.includes(`'${tk}'`), `task key ${tk} not found in any catalog migration`).toBe(true);
    }
  }
});

test('AC5: validateFactDetail rejects unknown facts, caps/coerces known fields', () => {
  // Unknown fact_key is the chokepoint - hard reject.
  const bad = validateFactDetail('not_a_fact', { anything: 'x' });
  expect(bad.ok).toBe(false);
  expect(bad.error).toMatch(/unknown fact_key/);

  // Appliance text field kept + capped; unknown field dropped.
  const filter = validateFactDetail('hvac_filter', { filter_size: '16x25x1', junk: 'drop me' });
  expect(filter.ok).toBe(true);
  expect(filter.cleaned).toEqual({ filter_size: '16x25x1' });
  const longSize = validateFactDetail('hvac_filter', { filter_size: 'x'.repeat(50) });
  expect((longSize.cleaned.filter_size as string).length).toBe(20);

  // Year: valid kept as number; out-of-range + non-numeric dropped.
  const nextYear = new Date().getFullYear() + 1;
  expect(validateFactDetail('water_heater', { install_year: 2018 }).cleaned.install_year).toBe(2018);
  expect(validateFactDetail('water_heater', { install_year: String(nextYear) }).cleaned.install_year).toBe(nextYear);
  expect(validateFactDetail('water_heater', { install_year: 1799 }).cleaned.install_year).toBeUndefined();
  expect(validateFactDetail('water_heater', { install_year: nextYear + 5 }).cleaned.install_year).toBeUndefined();
  expect(validateFactDetail('water_heater', { install_year: 'nope' }).cleaned.install_year).toBeUndefined();

  // Location fact declares no fields, so its cleaned detail is always empty.
  expect(validateFactDetail('water_main_shutoff', { note: 'basement', foo: 1 }).cleaned).toEqual({});
});

test('AC6: sanitizeNote trims, caps, and rejects non-strings', () => {
  expect(sanitizeNote('  basement, under the stairs  ')).toBe('basement, under the stairs');
  expect(sanitizeNote('a'.repeat(MAX_NOTE + 50)).length).toBe(MAX_NOTE);
  expect(sanitizeNote(42)).toBe('');
  expect(sanitizeNote(null)).toBe('');
  expect(sanitizeNote(undefined)).toBe('');
});

test('AC7: migration creates a deny-by-default home_records table', () => {
  expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.home_records');
  // Sensitive data: RLS on, and NO permissive anon policy anywhere.
  expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
  expect(migration).not.toMatch(/USING\s*\(\s*true\s*\)/i);
  expect(migration).not.toMatch(/CREATE\s+POLICY/i);
  // FK to homeowners with cascade delete, and the one-record-per-fact constraint.
  expect(migration).toContain('REFERENCES public.homeowners(id) ON DELETE CASCADE');
  expect(migration).toContain('UNIQUE (homeowner_id, fact_key)');
});

test('AC8: no em dashes in the newly authored Slice 1 files (global style rule)', () => {
  expect(registrySrc.includes('—'), 'records.ts').toBe(false);
  expect(migration.includes('—'), 'migration').toBe(false);
});
