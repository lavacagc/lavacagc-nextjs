import type { BeforeAfterPair, PhotoInput } from '@/components/gallery/PhotoGallery';

/** A project image row as it reaches the detail client (subset of project_images). */
export interface ProjectGalleryImage {
  id: string;
  image_url: string;
  image_category: string | null;
  is_featured?: boolean;
  media_type?: 'image' | 'video';
  pair_key?: string | null;
  caption?: string | null;
}

const CATEGORY_ORDER: Record<string, number> = { before: 0, during: 1, after: 2 };

/**
 * Split a project's images into standalone photos + before/after pairs for the
 * shared {@link PhotoGallery}.
 *
 * A complete pair = exactly one `before` and one `after` row sharing the same
 * non-null `pair_key`; its optional label comes from `caption`. Those two images
 * are consumed by the pair and removed from the standalone set. Everything else
 * (unpaired images, `during` shots, half-pairs whose partner is missing) renders
 * as a standalone photo/video, ordered featured-first then before → during →
 * after — matching the page's previous ordering so there's no visual regression
 * when no pairs exist.
 */
export function buildProjectGallery(images: ProjectGalleryImage[]): {
  photos: PhotoInput[];
  beforeAfters: BeforeAfterPair[];
} {
  const beforeAfters: BeforeAfterPair[] = [];
  const usedIds = new Set<string>();

  // Group by non-null pair_key, preserving first-seen order.
  const groups = new Map<string, ProjectGalleryImage[]>();
  for (const img of images) {
    if (!img.pair_key) continue;
    const arr = groups.get(img.pair_key) ?? [];
    arr.push(img);
    groups.set(img.pair_key, arr);
  }

  for (const group of groups.values()) {
    const before = group.find((i) => i.image_category === 'before' && i.media_type !== 'video');
    const after = group.find((i) => i.image_category === 'after' && i.media_type !== 'video');
    if (before && after) {
      beforeAfters.push({
        before: before.image_url,
        after: after.image_url,
        label: after.caption || before.caption || 'Before / After',
      });
      usedIds.add(before.id);
      usedIds.add(after.id);
    }
  }

  const photos: PhotoInput[] = images
    .filter((img) => !usedIds.has(img.id))
    .sort((a, b) => {
      if (a.is_featured && !b.is_featured) return -1;
      if (!a.is_featured && b.is_featured) return 1;
      return (CATEGORY_ORDER[a.image_category ?? ''] ?? 3) - (CATEGORY_ORDER[b.image_category ?? ''] ?? 3);
    })
    .map((img) => ({ src: img.image_url, kind: img.media_type === 'video' ? 'video' : 'image' }));

  return { photos, beforeAfters };
}
