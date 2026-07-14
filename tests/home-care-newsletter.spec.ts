import { test, expect } from '@playwright/test';
import { existsSync } from 'fs';
import { join } from 'path';
import { buildNewsletter, selectTasks, type NewsletterTask } from '../src/lib/homecare/newsletter';

const TASKS: NewsletterTask[] = [
  { key: 'clean_gutters', title: 'Clean gutters', blurb: 'Clear them out.', bookable: true, diy_or_pro: 'pro', priority: 9, applies_to: ['all'] },
  { key: 'test_smoke_co', title: 'Test detectors', blurb: 'Press test.', bookable: false, diy_or_pro: 'diy', priority: 10, applies_to: ['all'] },
  { key: 'seal_deck', title: 'Seal the deck', blurb: 'Protect the wood.', bookable: true, diy_or_pro: 'pro', priority: 5, applies_to: ['deck'] },
  { key: 'reseal_driveway', title: 'Seal driveway', blurb: 'Protect asphalt.', bookable: true, diy_or_pro: 'pro', priority: 4, applies_to: ['driveway'] },
];

test('selectTasks: seasonal = all (by priority), nudge = top 3', () => {
  expect(selectTasks(TASKS, true)).toHaveLength(4);
  const nudge = selectTasks(TASKS, false);
  expect(nudge).toHaveLength(3);
  expect(nudge[0].key).toBe('test_smoke_co'); // highest priority first
});

test('seasonal newsletter renders full list + checklist CTAs + unsubscribe', () => {
  const n = buildNewsletter({
    firstName: 'Alex', season: 'fall', tasks: TASKS, isSeasonal: true,
    baseUrl: 'https://www.lavacagc.com', unsubscribeUrl: 'https://www.lavacagc.com/api/home-care/unsubscribe?token=abc',
  });
  expect(n.subject).toContain('Fall');
  expect(n.html).toContain('Hi Alex,');
  // Consolidation: no per-task one-off booking links anywhere - pro jobs route
  // to the saved checklist so they land in one request, not a separate alert
  // per link.
  expect(n.html).not.toContain('/home-care/book?task=');
  // Each bookable task (3 of the 4) gets an "Add to plan" checklist CTA; the
  // DIY task (test_smoke_co) gets none.
  expect((n.html.match(/Add to plan/g) || []).length).toBe(3);
  expect(n.html).toContain('unsubscribe?token=abc');
  expect(n.text).toContain('Clean gutters');
  // Branding present.
  expect(n.html).toContain('13VH13373800'); // license
  expect(n.html).toContain('(201) 212-4917'); // phone
  expect(n.html).toContain('logo.png'); // logo
  expect(n.html).toContain('/home-care/checklist'); // titles link to the saved checklist
});

test('nudge newsletter is the short version', () => {
  const n = buildNewsletter({
    firstName: null, season: 'summer', tasks: TASKS, isSeasonal: false, monthLabel: 'July',
    baseUrl: 'https://www.lavacagc.com', unsubscribeUrl: 'https://www.lavacagc.com/u',
  });
  expect(n.subject).toContain('July');
  expect(n.html).toContain('Hi there,');
  // only 3 checklist rows in a nudge (count the checkbox squares)
  expect((n.html.match(/border:2px solid #c7d0dc/g) || []).length).toBe(3);
});

test('newsletter cron route is wired', () => {
  expect(existsSync(join(process.cwd(), 'src/app/api/cron/home-care-newsletter/route.ts'))).toBe(true);
});
