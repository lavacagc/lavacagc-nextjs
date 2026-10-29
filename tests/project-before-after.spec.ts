import { test, expect } from '@playwright/test';
import { SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON } from './helpers/liveBackend';
import { buildProjectGallery, type ProjectGalleryImage } from '../src/lib/projects/gallery';

/**
 * Project before/after pairing.
 *
 * The grouping logic (buildProjectGallery) is pure and runs in CI with no
 * backend. The on-page lightbox is a live-backend spec that skips cleanly
 * otherwise (the project detail page is DB-driven) — and was also verified
 * manually against the dev server during development.
 */

const img = (over: Partial<ProjectGalleryImage> & { id: string }): ProjectGalleryImage => ({
  image_url: `https://example.com/${over.id}.jpg`,
  image_category: 'after',
  ...over,
});

test.describe('buildProjectGallery (pure grouping logic)', () => {
  test('no pairs → every image is a standalone photo, ordered featured → before → during → after', () => {
    const images: ProjectGalleryImage[] = [
      img({ id: 'a', image_category: 'after' }),
      img({ id: 'b', image_category: 'before' }),
      img({ id: 'd', image_category: 'during' }),
      img({ id: 'f', image_category: 'after', is_featured: true }),
    ];

    const { photos, beforeAfters } = buildProjectGallery(images);

    expect(beforeAfters).toHaveLength(0);
    expect(photos).toEqual([
      { src: 'https://example.com/f.jpg', kind: 'image' }, // featured first
      { src: 'https://example.com/b.jpg', kind: 'image' }, // then before
      { src: 'https://example.com/d.jpg', kind: 'image' }, // during
      { src: 'https://example.com/a.jpg', kind: 'image' }, // after
    ]);
  });

  test('a complete pair → one before/after entry (label from caption); paired images leave the photo set', () => {
    const images: ProjectGalleryImage[] = [
      img({ id: 'kb', image_category: 'before', pair_key: 'k1', caption: 'Kitchen' }),
      img({ id: 'ka', image_category: 'after', pair_key: 'k1', caption: 'Kitchen' }),
      img({ id: 'solo', image_category: 'after' }),
    ];

    const { photos, beforeAfters } = buildProjectGallery(images);

    expect(beforeAfters).toEqual([
      { before: 'https://example.com/kb.jpg', after: 'https://example.com/ka.jpg', label: 'Kitchen' },
    ]);
    // Only the unpaired image remains as a standalone photo.
    expect(photos).toEqual([{ src: 'https://example.com/solo.jpg', kind: 'image' }]);
  });

  test('a half-pair (partner missing) falls back to a standalone photo', () => {
    const images: ProjectGalleryImage[] = [
      img({ id: 'lonely', image_category: 'before', pair_key: 'orphan' }),
      img({ id: 'x', image_category: 'after' }),
    ];

    const { photos, beforeAfters } = buildProjectGallery(images);

    expect(beforeAfters).toHaveLength(0);
    expect(photos.map((p) => (typeof p === 'string' ? p : p.src))).toEqual([
      'https://example.com/lonely.jpg',
      'https://example.com/x.jpg',
    ]);
  });

  test('videos are never paired and carry their kind through to photos', () => {
    const images: ProjectGalleryImage[] = [
      img({ id: 'vb', image_category: 'before', media_type: 'video', pair_key: 'k2' }),
      img({ id: 'va', image_category: 'after', media_type: 'video', pair_key: 'k2' }),
    ];

    const { photos, beforeAfters } = buildProjectGallery(images);

    expect(beforeAfters).toHaveLength(0);
    expect(photos).toEqual([
      { src: 'https://example.com/vb.jpg', kind: 'video' },
      { src: 'https://example.com/va.jpg', kind: 'video' },
    ]);
  });

  test('label falls back to "Before / After" when no caption is set', () => {
    const images: ProjectGalleryImage[] = [
      img({ id: 'b', image_category: 'before', pair_key: 'k3' }),
      img({ id: 'a', image_category: 'after', pair_key: 'k3' }),
    ];

    const { beforeAfters } = buildProjectGallery(images);
    expect(beforeAfters[0].label).toBe('Before / After');
  });
});

test.describe('Project detail — photo lightbox (live backend)', () => {
  test('clicking a project photo opens a cycling lightbox with a counter', async ({ page, request }) => {
    test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON);

    // Reach a project detail page via the portfolio list, the way a visitor does.
    // The cards navigate with router.push from a "View Details" button, not an
    // <a href>; the old `a[href^="/projects/"]` lookup never matched, so this
    // test skipped on every run, live backend or not (fixed in slice D).
    await page.goto('/portfolio', { waitUntil: 'domcontentloaded' });
    const viewDetails = page.getByRole('button', { name: 'View Details' }).first();
    test.skip((await viewDetails.count()) === 0, 'No projects published in this env.');
    // The button slides in on hover (300 ms); clicking mid-slide lands on the card
    // behind it, which opens the portfolio lightbox instead of navigating.
    await viewDetails.hover();
    await expect(viewDetails).toHaveCSS('opacity', '1');
    await page.waitForTimeout(350);
    await viewDetails.click();
    await page.waitForURL(/\/projects\/[^/]+$/, { timeout: 30_000 });

    const grid = page.getByTestId('project-photo-grid');
    test.skip((await grid.count()) === 0, 'Project has no photos.');
    await grid.getByRole('button').first().click();

    const lightbox = page.getByTestId('project-lightbox');
    await expect(lightbox).toBeVisible();

    // PhotoGallery shows the "n / total" counter and the arrows only when there
    // is more than one item; a single-photo project has neither.
    const items = await lightbox.locator('[role="group"][aria-roledescription="slide"]').count();
    const counter = lightbox.getByText(/^\d+ \/ \d+$/);
    if (items > 1) {
      await expect(counter).toHaveText(new RegExp(`^\\d+ / ${items}$`));
      const before = await counter.textContent();
      await lightbox.locator('button:has(svg.lucide-arrow-right)').click();
      await expect(counter).not.toHaveText(before ?? '');
    } else {
      await expect(counter).toHaveCount(0);
    }

    await page.keyboard.press('Escape');
    await expect(lightbox).toBeHidden();

    // request fixture kept for parity with the listings spec signature.
    void request;
  });
});
