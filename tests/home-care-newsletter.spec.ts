import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { buildNewsletter, homeCareHeroUrl, selectTasks, type NewsletterTask } from '../src/lib/homecare/newsletter';
import { costLabel, CONSULT_COST } from '../src/lib/homecare/cost';

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

test('the newsletter quotes no price, whatever the catalog carries', () => {
  // It used to print "$150&ndash;$250" beside each job from the same costLabel
  // the checklist rendered. The checklist stopped quoting prices (owner,
  // 6 Aug 2026) and this had to follow in the same change: a member reading a
  // range in their inbox and finding none on the page that link lands them on
  // is the exact disagreement costLabel was extracted to prevent - just in the
  // other direction.
  //
  // The fixtures below still CARRY est_cost, deliberately. Removing the data
  // would make this pass for the wrong reason; what has to be true is that the
  // builder ignores it.
  const n = buildNewsletter({
    firstName: 'Alex', season: 'fall', isSeasonal: true,
    baseUrl: 'https://www.lavacagc.com', unsubscribeUrl: 'https://www.lavacagc.com/u',
    tasks: [
      { key: 'clean_gutters', title: 'Clean gutters', blurb: 'Clear them out.', bookable: true, diy_or_pro: 'pro', priority: 10, applies_to: ['all'], est_cost_low: 150, est_cost_high: 250 },
      { key: 'roof_inspect', title: 'Inspect the roof', blurb: 'Look for lifted shingles.', bookable: true, diy_or_pro: 'pro', priority: 9, applies_to: ['all'], est_cost_low: 0, est_cost_high: 375 },
      { key: 'test_smoke_co', title: 'Test detectors', blurb: 'Press test.', bookable: false, diy_or_pro: 'diy', priority: 8, applies_to: ['all'] },
    ],
  });

  // Not one dollar figure, and not the consult copy that stood in for one.
  expect(n.html.match(/\$\d/g)).toBeNull();
  expect(n.text.match(/\$\d/g)).toBeNull();
  expect(n.html).not.toContain(CONSULT_COST);
  expect(n.text).not.toContain(CONSULT_COST);

  // The meta line is now badge then blurb, with nothing between them.
  expect(n.html).toContain('Pro job &nbsp;&middot;&nbsp; Clear them out.');
  expect(n.text).toContain('Pro job · Clear them out.');
  expect(n.html).toContain('DIY &nbsp;&middot;&nbsp; Press test.');
  expect(n.text).toContain('DIY · Press test.');

  // And it does not keep a private formatter to start quoting again from. The
  // NAME may still appear - the module explains at length why it stopped using
  // it - so what is asserted is that nothing calls it.
  const src = readFileSync(join(process.cwd(), 'src/lib/homecare/newsletter.ts'), 'utf8');
  expect(src).not.toMatch(/costLabel\(/);
  expect(src).not.toMatch(/from '\.\/cost'/);
});

test('costLabel keeps the rule it cost a production disagreement to learn', () => {
  // Nothing in src/ calls this any more - removing member-facing pricing took
  // both of its callers, and while the admin service-quote intake route still
  // SELECTS est_cost_low/high, no admin surface formats them with this yet. The
  // columns stay, so the module stays for whichever surface quotes them next,
  // and its rules stay asserted rather than left to rot alongside it.
  expect(costLabel(150, 250)).toBe('$150–$250');
  // A zero floor is the catalog saying "no meaningful floor", not a price.
  expect(costLabel(0, 375)).toBe(CONSULT_COST);
  expect(costLabel(null, null)).toBeNull();
  expect(costLabel(200, 200)).toBe('$200');
  expect(costLabel(null, 375)).toBeNull();

  // Nobody re-implements it privately, which is how the page and the email
  // disagreed in the first place.
  const src = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
  expect(src('src/components/homecare/HomeCareChecklistClient.tsx')).not.toMatch(/function costLabel/);
  expect(src('src/components/homecare/HomeCareChecklistClient.tsx')).not.toContain('up to $');
  expect(src('src/lib/homecare/newsletter.ts')).not.toMatch(/function costLabel/);
});

test('HTML entities stay in the HTML part - the text part gets the raw name', () => {
  // "John & Mary" is an ordinary entry on a home-services signup (first_name is
  // an unrestricted string), and the greeting is the first line of the message.
  // Escaping it once and reusing it for both builds put "Hi John &amp; Mary,"
  // in the text/plain part, which is what several clients and most spam filters
  // read.
  const n = buildNewsletter({
    firstName: 'John & Mary', season: 'fall', tasks: TASKS, isSeasonal: true,
    baseUrl: 'https://www.lavacagc.com', unsubscribeUrl: 'https://www.lavacagc.com/u',
  });
  expect(n.html).toContain('Hi John &amp; Mary,');
  expect(n.text).toContain('Hi John & Mary,');
  expect(n.text).not.toContain('&amp;');

  // The subject is not HTML either, in both variants that carry a name.
  expect(buildNewsletter({
    firstName: 'John & Mary', season: 'fall', tasks: [], isSeasonal: false, monthLabel: 'October',
    baseUrl: 'https://www.lavacagc.com', unsubscribeUrl: 'https://www.lavacagc.com/u', caughtUp: true,
  }).subject).toBe("October: you're all caught up, John & Mary");

  // And no name at all still greets both readers.
  const anon = buildNewsletter({
    firstName: null, season: 'fall', tasks: TASKS, isSeasonal: true,
    baseUrl: 'https://www.lavacagc.com', unsubscribeUrl: 'https://www.lavacagc.com/u',
  });
  expect(anon.html).toContain('Hi there,');
  expect(anon.text).toContain('Hi there,');
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

test('the last row closes the panel out, even when it is also the first row', () => {
  // A one-task panel's only row is both first and last. Bottom padding is set
  // independently of top so the panel does not end up with a visibly tighter
  // bottom edge than every other email's.
  const mk = (count: number) => Array.from({ length: count }, (_, i) => ({
    key: `t${i}`, title: `Task ${i}`, blurb: 'Do it.', bookable: false,
    diy_or_pro: 'diy' as const, priority: count - i, applies_to: ['all'],
  }));
  const base = {
    firstName: 'Alex', season: 'fall' as const, isSeasonal: false, monthLabel: 'October', year: 2026,
    baseUrl: 'https://www.lavacagc.com', unsubscribeUrl: 'https://www.lavacagc.com/u',
  };
  const rowPads = (html: string) =>
    [...html.matchAll(/<tr><td style="padding:([^"]+)">\n\s*<table role="presentation"/g)].map((m) => m[1]);

  expect(rowPads(buildNewsletter({ ...base, tasks: mk(1) }).html)).toEqual(['8px 22px 22px 22px']);
  // Three rows: first tucks under the heading, last closes the panel.
  expect(rowPads(buildNewsletter({ ...base, tasks: mk(3) }).html))
    .toEqual(['8px 22px 14px 22px', '14px 22px 14px 22px', '14px 22px 22px 22px']);
  // With a teaser row below, the last task keeps normal padding.
  expect(rowPads(buildNewsletter({ ...base, tasks: mk(4) }).html))
    .toEqual(['8px 22px 14px 22px', '14px 22px 14px 22px', '14px 22px 14px 22px']);
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

test('the caught-up note survives being sent every month of the season', () => {
  const base = {
    firstName: 'Alex', season: 'fall' as const, isSeasonal: false, monthLabel: 'November', year: 2026,
    baseUrl: 'https://www.lavacagc.com', unsubscribeUrl: 'https://www.lavacagc.com/u',
  };
  const n = buildNewsletter({ ...base, tasks: [], caughtUp: true });

  // A member who clears their fall list in September gets this again in October
  // and November, so it cannot promise to stay quiet until the next season.
  expect(n.html).not.toContain("we'll be back when the next season's list is ready");
  expect(n.html).toContain('check in again next month');
  expect(n.text).toContain('check in again next month');

  // And each repeat has to land as its own message. Gmail and Apple Mail thread
  // on subject + sender, so a subject with nothing month-specific in it would
  // fold October and November under September - unopened, taking the links
  // above with them, which is the entire reason the repeat is sent at all.
  const subjects = ['September', 'October', 'November'].map(
    (m) => buildNewsletter({ ...base, monthLabel: m, tasks: [], caughtUp: true }).subject,
  );
  expect(subjects).toEqual([
    "September: you're all caught up, Alex",
    "October: you're all caught up, Alex",
    "November: you're all caught up, Alex",
  ]);
  expect(new Set(subjects).size).toBe(3);

  // What makes the repeat worth opening: two standing links, no per-send fetch,
  // tagged like the member-share line so the traffic is attributable.
  const utm = (content: string) =>
    `utm_source=home_care_newsletter&amp;utm_medium=email&amp;utm_campaign=home_care_caught_up&amp;utm_content=${content}`;
  expect(n.html).toContain("While you're ahead");
  expect(n.html).toContain(`https://www.lavacagc.com/portfolio?${utm('portfolio')}`);
  expect(n.html).toContain(`https://www.lavacagc.com/blog?${utm('blog')}`);
  expect(n.text).toContain('https://www.lavacagc.com/portfolio?utm_source=home_care_newsletter');
  expect(n.text).toContain('https://www.lavacagc.com/blog?utm_source=home_care_newsletter');

  // Only in this variant - an email with a task list already has its own hooks.
  const withTasks = buildNewsletter({ ...base, tasks: TASKS });
  expect(withTasks.html).not.toContain("While you're ahead");
  expect(withTasks.html).not.toContain('/portfolio');
  expect(withTasks.text).not.toContain('/blog');
});

/**
 * Dimensions straight out of the JPEG frame header. An image library would do
 * this too, but the only one available here is sharp, and declaring it as a dev
 * dependency for one assertion flags its platform binaries as dev-only in the
 * lockfile - which would strand Next's image optimization on any install that
 * prunes dev packages. Returns null for anything that isn't a readable JPEG.
 */
function readJpegHeader(file: string): { format: string; width: number; height: number } | null {
  const buf = readFileSync(file);
  if (buf.length < 4 || buf.readUInt16BE(0) !== 0xffd8) return null; // no SOI
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null; // segments are byte-aligned after SOI
    const marker = buf[i + 1];
    if (marker === 0xff) { i += 1; continue; } // fill byte
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) { i += 2; continue; } // no payload
    // SOF0-SOF15 carry the frame size; DHT/JPG/DAC share the range and don't.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { format: 'jpeg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

test('all twelve monthly hero images exist and are the 2:1 email band size', () => {
  for (let m = 0; m < 12; m++) {
    const mm = String(m + 1).padStart(2, '0');
    const file = join(process.cwd(), `public/email/home-care/hero-${mm}.jpg`);
    // A missing month renders a BROKEN image in the send, not a skipped band.
    expect(existsSync(file), `missing hero-${mm}.jpg`).toBe(true);
    const header = readJpegHeader(file);
    expect(header?.format, `hero-${mm}.jpg is not a readable JPEG`).toBe('jpeg');
    expect({ mm, width: header?.width, height: header?.height }).toEqual({ mm, width: 1040, height: 520 });
    // Keep the band light - these load on phones over cell data.
    expect(statSync(file).size, `hero-${mm}.jpg too heavy`).toBeLessThan(200 * 1024);
  }
});

test('the hero-image check reads real frame headers, not just any two numbers', () => {
  // Guards the parser itself: a reader that silently returned null (or the wrong
  // offsets) would make the twelve-hero assertion above pass vacuously.
  const real = readJpegHeader(join(process.cwd(), 'public/email/home-care/hero-01.jpg'));
  expect(real).toEqual({ format: 'jpeg', width: 1040, height: 520 });
  expect(readJpegHeader(join(process.cwd(), 'public/logo.png'))).toBeNull();
});

test('hero URL rotates by calendar month', () => {
  expect(homeCareHeroUrl('https://x.test', new Date(Date.UTC(2026, 0, 15)))).toBe('https://x.test/email/home-care/hero-01.jpg');
  expect(homeCareHeroUrl('https://x.test', new Date(Date.UTC(2026, 7, 1)))).toBe('https://x.test/email/home-care/hero-08.jpg');
  expect(homeCareHeroUrl('https://x.test', new Date(Date.UTC(2026, 11, 31)))).toBe('https://x.test/email/home-care/hero-12.jpg');
});

test('newsletter cron route is wired', () => {
  expect(existsSync(join(process.cwd(), 'src/app/api/cron/home-care-newsletter/route.ts'))).toBe(true);
});
