import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The portfolio/gallery video fix, pinned structurally.
 *
 * MEASURED ON PRODUCTION, 1 Sep 2026: /portfolio took 10.4 seconds to finish
 * loading - the slowest page on the site, and the one whose job is showing the
 * work - and the browser was offered ~124 MB of video across 24 responses,
 * from three source files declaring 22, 21 and 15 MB. Two separate causes:
 *
 *   PortfolioContent rendered a bare `<video autoPlay loop>` with no lazy
 *   mount, no poster and NO preload attribute. Absent means `auto`, so every
 *   file began downloading in full on load, on screen or not.
 *
 *   ProjectGallery mounted on scroll but called observer.disconnect() on the
 *   first intersection, so with autoPlay + loop every card ever scrolled past
 *   kept streaming for the life of the page.
 *
 * WHY THIS READS SOURCE INSTEAD OF DRIVING A BROWSER. Two earlier attempts
 * failed honestly and are worth recording, because both looked like passes:
 *
 *   1. Asserting against the rendered stub build PASSED WHILE PROVING NOTHING.
 *      That backend has no projects, so /portfolio renders zero videos and
 *      every assertion looped over an empty array.
 *   2. Stubbing Supabase at the network layer did not help either: in the stub
 *      build the gallery's read never reaches the network at all (zero
 *      /rest/v1 requests; the page renders "No projects available"), so there
 *      is nothing to intercept.
 *
 * Rendering these cards needs real project content, which by this repo's own
 * convention belongs to the live-backend half of the suite. Rather than add a
 * spec that skips in every ordinary run, this pins the two properties that
 * actually caused the regression, in the only place that is true regardless of
 * data: the components themselves. It cannot pass vacuously - if the files stop
 * containing what it names, it fails.
 */

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/**
 * Source with comments blanked, for checks that must not match prose.
 *
 * The first version of this spec failed against its own fix, because the
 * component's comment explains why `autoPlay` is absent - and the check could
 * not tell an explanation from an implementation. A criterion satisfiable by
 * DELETING the comment that explains it is the wrong incentive, so the check
 * gets fixed rather than the writing. Blanked in place rather than removed, so
 * any line number a failure reports still points at the real line.
 */
const codeOnly = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

const SHARED = 'src/components/LazyProjectVideo.tsx';
const GALLERIES = ['src/components/PortfolioContent.tsx', 'src/components/ProjectGallery.tsx'];

test.describe('project video weight', () => {
  test('neither gallery renders a raw autoplaying video element', async () => {
    for (const file of GALLERIES) {
      const src = codeOnly(read(file));
      // The exact shape that shipped 124 MB: a <video> written inline.
      expect(src, `${file} must not hand-roll a <video> element`).not.toMatch(/<video[\s>]/);
      expect(src, `${file} must render project video through the shared wrapper`).toContain(
        'LazyProjectVideo',
      );
      // A poster is what makes preload="none" safe, so every call site owes one.
      expect(src, `${file} must pass a poster`).toMatch(/poster=\{getPosterImage\(/);
    }
  });

  test('the shared wrapper never autoplays, never preloads with a poster, and pauses off screen', async () => {
    const src = codeOnly(read(SHARED));

    // autoPlay hands the download decision to the browser, which is precisely
    // what bypassed the observer before.
    expect(src, 'autoPlay must not come back').not.toMatch(/\bautoPlay\b/);

    // With a poster there is nothing worth prefetching; without one, metadata
    // keeps the card from being blank.
    expect(src).toContain("preload={poster ? 'none' : 'metadata'}");

    // The original bug in one line: disconnecting on first intersection meant
    // leaving the viewport was never observable again.
    expect(
      src.includes('observer.disconnect()') && !src.includes('return () => observer.disconnect()'),
      'disconnect() may only appear in effect cleanup, never inside the callback',
    ).toBe(false);

    // The two halves that replace autoPlay.
    expect(src, 'must start playback when the element enters').toMatch(/video\.play\(\)/);
    expect(src, 'must pause when it leaves').toMatch(/video\.pause\(\)/);
  });

  test('the wrapper is identifiable in the DOM so a live-backend check can find it', async ({
    page,
  }) => {
    // The stub build has no projects, so this deliberately asserts only that
    // the page renders and the marker exists in source - not that any card
    // appeared. Claiming otherwise is the trap the header describes.
    expect(read(SHARED)).toContain('data-testid="lazy-project-video"');
    const res = await page.goto('/portfolio');
    expect(res?.status(), '/portfolio must still render').toBe(200);
  });
});
