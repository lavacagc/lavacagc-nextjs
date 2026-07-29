import { test, expect } from '@playwright/test';
import { filterTasksForProfile, sanitizeSystems, stageShowsStarter, stageFromLegacyType } from '../src/lib/homecare/profile';

const TASKS = [
  { key: 'gutters', applies_to: ['all'] },
  { key: 'hvac', applies_to: ['hvac'] },
  { key: 'deck', applies_to: ['deck'] },
  { key: 'roof', applies_to: ['roof'] }, // universal — always shown
];

test('no profile → all tasks (with a nudge to personalize)', () => {
  expect(filterTasksForProfile(TASKS, null)).toHaveLength(4);
  expect(filterTasksForProfile(TASKS, {})).toHaveLength(4);
});

test('profile filters out systems the home does not have', () => {
  const out = filterTasksForProfile(TASKS, { hvac: true, deck: false });
  const keys = out.map((t) => t.key).sort();
  expect(keys).toEqual(['gutters', 'hvac', 'roof']); // deck dropped; universal kept
});

test('sanitizeSystems keeps only known boolean keys', () => {
  const s = sanitizeSystems({ hvac: true, deck: false, bogus: true, sump_pump: 'yes' });
  expect(s).toEqual({ hvac: true, deck: false });
});

test('sanitizeSystems keeps valid follow-up values, drops invalid ones', () => {
  const s = sanitizeSystems({ hvac: true, hvac_type: 'gas_furnace', hvac_age: 'nope', priority: 'avoid_emergencies' });
  expect(s).toEqual({ hvac: true, hvac_type: 'gas_furnace', priority: 'avoid_emergencies' });
});

test('stage-tagged tasks only show for their stage, and fail closed with no stage', () => {
  const TASKS = [
    { key: 'seasonal', applies_to: ['all'] }, // no stages → everyone
    { key: 'presale', applies_to: ['all'], stages: ['selling'] },
  ];
  // No stage hides stage-specific tasks rather than showing them all: telling
  // someone who never said they're selling to prep their house for listing is
  // worse than showing them slightly less.
  expect(filterTasksForProfile(TASKS, null).map((t) => t.key)).toEqual(['seasonal']);
  expect(filterTasksForProfile(TASKS, null, 'just_bought').map((t) => t.key)).toEqual(['seasonal']); // presale hidden
  expect(filterTasksForProfile(TASKS, null, 'selling').map((t) => t.key).sort()).toEqual(['presale', 'seasonal']);
});

test('starter essentials show for just-bought and new construction only', () => {
  expect(stageShowsStarter('just_bought')).toBe(true);
  expect(stageShowsStarter('new_construction')).toBe(true);
  expect(stageShowsStarter('established')).toBe(false);
  expect(stageShowsStarter('selling')).toBe(false);
  expect(stageShowsStarter(null)).toBe(false);
});

test('legacy homeowner_type maps to a stage', () => {
  expect(stageFromLegacyType('first_time')).toBe('just_bought');
  expect(stageFromLegacyType('experienced')).toBe('established');
  expect(stageFromLegacyType(null)).toBeNull();
});
