import { test, expect } from '@playwright/test';
import { existsSync, statSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { buildNewsletter, homeCareHeroUrl, selectTasks, type NewsletterTask } from '../src/lib/homecare/newsletter';

const TASKS: NewsletterTask[] = [
  // clean_gutters carries a cost range; the rest deliberately don't, so the
  // suite covers both sides of the "only render costs we actually have" rule.
  { key: 'clean_gutters', title: 'Clean gutters', blurb: 'Clear them out.', bookable: true, diy_or_pro: 'pro', priority: 9, applies_to: ['all'], est_cost_low: 150, est_cost_high: 250 },
  { key: 'test_smoke_co', title: 'Test detectors', blurb: 'Press test.', bookable: false, diy_or_pro: 'diy', priority: 10, applies_to: ['all'] },
  { key: 'seal_deck', title: 'Seal the deck', blurb: 'Protect the wood.', bookable: true, diy_or_pro: 'pro', priority: 5, applies_to: ['deck'] },
  { key: 'reseal_driveway', title: 'Seal driveway', blurb: 'Protect asphalt.', bookable: true, diy_or_pro: 'pro', priority: 4, applies_to: ['driveway'] },
];

/** One numbered task row in the ported design = one 30px number cell. */
const rowCount = (html: string) => (html.match(/width="30" valign="top"/g) || []).length;

test('selectTasks: every email shows the top 3 by priority, seasonal included', () => {
  const picked = selectTasks(TASKS);
  expect(picked).toHaveLength(3);
  expect(picked[0].key).toBe('test_smoke_co'); // highest priority first
  // Shorter lists are returned whole - no padding, no teaser to earn.
  expect(selectTasks(TASKS.slice(0, 2))).toHaveLength(2);
});

test('seasonal newsletter teases the top 3 + checklist CTAs + unsubscribe', () => {
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
  // Only the top 3 render, so only the bookable ones AMONG THOSE get an "Add to
  // plan" CTA: test_smoke_co (p10) is DIY, clean_gutters (p9) and seal_deck (p5)
  // are bookable. reseal_driveway (p4) falls below the cut into the teaser.
  expect((n.html.match(/Add to plan/g) || []).length).toBe(2);
  expect(n.html).toContain('unsubscribe?token=abc');
  expect(n.text).toContain('Clean gutters');
  expect(n.html).not.toContain('Seal driveway'); // below the fold, teased not listed
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
  // only 3 checklist rows in a nudge
  expect(rowCount(n.html)).toBe(3);
});

test('design: license bar, season pill, numbered rows, call block, postal address', () => {
  const n = buildNewsletter({
    firstName: 'Alex', season: 'summer', tasks: TASKS, isSeasonal: false, monthLabel: 'August', year: 2026,
    baseUrl: 'https://www.lavacagc.com', unsubscribeUrl: 'https://www.lavacagc.com/u',
    preferencesUrl: 'https://www.lavacagc.com/preferences?token=xyz',
  });
  expect(n.html).toContain('Licensed, Bonded, &amp; Insured');
  expect(n.html).toContain("Alex's Home Care"); // pill personalization
  expect(n.html).toContain('August 2026 &nbsp;&middot;&nbsp; Summer'); // month + year + season in the pill
  expect(n.html).toMatch(/>01</); // numbered rows, not checkboxes
  expect(n.html).toContain('Rather we handled it?');
  expect(n.html).toContain('24-hour response guaranteed');
  expect(n.html).toContain('Open My August Checklist');
  // CAN-SPAM postal address (absent from the pre-design footer).
  expect(n.html).toContain('51 Crestmont Rd, West Orange, NJ 07052');
  expect(n.text).toContain('51 Crestmont Rd, West Orange, NJ 07052');
  expect(n.html).toContain('Manage email preferences');
  // Outlook line-height guard used throughout the comp.
  expect(n.html).toContain('mso-line-height-rule:exactly');
});

test('cost ranges render only when the catalog actually has them', () => {
  const n = buildNewsletter({
    firstName: 'Alex', season: 'fall', tasks: TASKS, isSeasonal: true,
    baseUrl: 'https://www.lavacagc.com', unsubscribeUrl: 'https://www.lavacagc.com/u',
  });
  // clean_gutters has 150/250 -> shows a range next to its "Pro job" badge.
  expect(n.html).toContain('$150&ndash;$250');
  expect(n.text).toContain('$150-$250');
  // Exactly one task has costs, so exactly one range appears - no invented prices.
  expect((n.html.match(/\$\d+/g) || []).length).toBe(2); // low + high of the one range
  expect(n.html).toContain('Pro job');
  expect(n.html).toContain('DIY');
});

test('hero image band is omitted unless a hosted URL is supplied', () => {
  const base = {
    firstName: 'Alex', season: 'fall' as const, tasks: TASKS, isSeasonal: true,
    baseUrl: 'https://www.lavacagc.com', unsubscribeUrl: 'https://www.lavacagc.com/u',
  };
  const without = buildNewsletter(base);
  expect(without.html).not.toContain('Image placeholder');
  expect((without.html.match(/<img /g) || []).length).toBe(1); // logo only

  const withHero = buildNewsletter({ ...base, heroImageUrl: 'https://www.lavacagc.com/email/hero.png' });
  expect(withHero.html).toContain('https://www.lavacagc.com/email/hero.png');
  expect((withHero.html.match(/<img /g) || []).length).toBe(2);
});

test('teaser: the remainder is counted and links to the checklist', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({
    key: `t${i}`, title: `Task ${i}`, blurb: 'Do it.', bookable: false,
    diy_or_pro: 'diy' as const, priority: 20 - i, applies_to: ['all'],
  }));
  const n = buildNewsletter({
    firstName: 'Alex', season: 'fall', tasks: many, isSeasonal: true, monthLabel: 'September', year: 2026,
    baseUrl: 'https://www.lavacagc.com', unsubscribeUrl: 'https://www.lavacagc.com/u',
  });
  expect(rowCount(n.html)).toBe(3); // still only 3 rows, even on the season opener
  expect(n.html).toContain('+ 17 more jobs on your fall list');
  expect(n.html).toContain('Open your checklist to see the rest');
  expect(n.text).toContain('+ 17 more jobs on your fall list');
  expect(n.html).toContain('Start with these 3'); // seasonal panel heading
});

test('teaser: singular wording, and no teaser when nothing is held back', () => {
  const mk = (count: number) => Array.from({ length: count }, (_, i) => ({
    key: `t${i}`, title: `Task ${i}`, blurb: 'Do it.', bookable: false,
    diy_or_pro: 'diy' as const, priority: count - i, applies_to: ['all'],
  }));
  const base = {
    firstName: 'Alex', season: 'fall' as const, isSeasonal: false, monthLabel: 'October', year: 2026,
    baseUrl: 'https://www.lavacagc.com', unsubscribeUrl: 'https://www.lavacagc.com/u',
  };
  expect(buildNewsletter({ ...base, tasks: mk(4) }).html).toContain('+ 1 more job on your fall list');
  // Exactly 3 applicable tasks: everything shown, so no dangling "+0 more".
  const exact = buildNewsletter({ ...base, tasks: mk(3) });
  expect(exact.html).not.toContain('more jobs on your');
  expect(exact.html).not.toContain('+ 0 more');
  expect(exact.text).not.toContain('+ 0 more');
});

test('copy stays grammatical when only one job is left', () => {
  // Late in a season a member can have exactly one thing outstanding. Every
  // count-bearing string has to survive that, not just the teaser line.
  const one = [{ key: 't0', title: 'Clean the gutters', blurb: 'Do it.', bookable: false, diy_or_pro: 'diy' as const, priority: 1, applies_to: ['all'] }];
  const base = {
    firstName: 'Alex', season: 'fall' as const, tasks: one, monthLabel: 'October', year: 2026,
    baseUrl: 'https://www.lavacagc.com', unsubscribeUrl: 'https://www.lavacagc.com/u',
  };

  const nudge = buildNewsletter({ ...base, isSeasonal: false });
  expect(nudge.subject).toBe('October: 1 quick home to-do');
  expect(nudge.html).toContain('Your top job for October');
  expect(nudge.html).not.toContain('Your top 1 for');
  expect(nudge.html).toContain('One timely job worth knocking out');
  expect(nudge.html).toContain("so you know whether it's worth handing off");
  expect(nudge.html).not.toContain('Each one is tagged');

  const seasonal = buildNewsletter({ ...base, isSeasonal: true });
  expect(seasonal.html).toContain("Here's the one worth doing first");
  expect(seasonal.html).toContain('Start with this one');
  expect(seasonal.html).not.toMatch(/Here are the 1\b/);
  expect(seasonal.html).not.toContain('Start with these 1');
});

test('the plain-text intro tells the same story as the HTML one', () => {
  // The text intro used to promise "the full run of jobs for your home" while
  // the body below it listed three and teased the rest.
  const many = Array.from({ length: 20 }, (_, i) => ({
    key: `t${i}`, title: `Task ${i}`, blurb: 'Do it.', bookable: false,
    diy_or_pro: 'diy' as const, priority: 20 - i, applies_to: ['all'],
  }));
  const n = buildNewsletter({
    firstName: 'Alex', season: 'fall', tasks: many, isSeasonal: true, monthLabel: 'September', year: 2026,
    baseUrl: 'https://www.lavacagc.com', unsubscribeUrl: 'https://www.lavacagc.com/u',
  });
  expect(n.text).not.toContain('full run of jobs');
  expect(n.text).toContain('Here are the 3 worth doing first, with 17 more waiting on your list');
  expect(n.html).toContain('Here are the 3 worth doing first, with 17 more waiting on your list');
  // Same sentence either way, minus the HTML emphasis.
  expect(n.text).toContain('Each one is tagged DIY or pro');
  expect(n.html).toContain('>DIY or pro</strong> so you know');
});

test('all twelve monthly hero images exist and are the 2:1 email band size', async () => {
  for (let m = 0; m < 12; m++) {
    const mm = String(m + 1).padStart(2, '0');
    const file = join(process.cwd(), `public/email/home-care/hero-${mm}.jpg`);
    // A missing month renders a BROKEN image in the send, not a skipped band.
    expect(existsSync(file), `missing hero-${mm}.jpg`).toBe(true);
    const { width, height, format } = await sharp(file).metadata();
    expect(format).toBe('jpeg');
    expect({ mm, width, height }).toEqual({ mm, width: 1040, height: 520 });
    // Keep the band light - these load on phones over cell data.
    expect(statSync(file).size, `hero-${mm}.jpg too heavy`).toBeLessThan(200 * 1024);
  }
});

test('hero URL rotates by calendar month', () => {
  expect(homeCareHeroUrl('https://x.test', new Date(Date.UTC(2026, 0, 15)))).toBe('https://x.test/email/home-care/hero-01.jpg');
  expect(homeCareHeroUrl('https://x.test', new Date(Date.UTC(2026, 7, 1)))).toBe('https://x.test/email/home-care/hero-08.jpg');
  expect(homeCareHeroUrl('https://x.test', new Date(Date.UTC(2026, 11, 31)))).toBe('https://x.test/email/home-care/hero-12.jpg');
});

test('newsletter cron route is wired', () => {
  expect(existsSync(join(process.cwd(), 'src/app/api/cron/home-care-newsletter/route.ts'))).toBe(true);
});
