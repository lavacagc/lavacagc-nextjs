import { test, expect } from '@playwright/test';
import { filterTasksForProfile, sanitizeSystems } from '../src/lib/homecare/profile';

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
