'use client';

import PhotoGallery, { type BeforeAfterPair } from '@/components/gallery/PhotoGallery';
import { sectionLabel } from '@/lib/listings/columns';

export interface ListingRendering {
  section: string;
  before_url: string;
  after_url: string;
}

/**
 * Listing gallery + shadowbox — a thin wrapper over the shared {@link PhotoGallery}.
 *
 * Maps the AI before/after renderings to the gallery's generic before/after
 * pairs and turns on the AI caption wording. The grid/lightbox behavior (and the
 * `listing-photo-grid` / `listing-lightbox` test ids) live in PhotoGallery.
 */
export default function ListingPhotos({
  photos,
  renderings = [],
  alt,
}: {
  photos: string[];
  renderings?: ListingRendering[];
  alt: string;
}) {
  const beforeAfters: BeforeAfterPair[] = renderings.map((r) => ({
    before: r.before_url,
    after: r.after_url,
    label: sectionLabel(r.section),
  }));

  return <PhotoGallery photos={photos} beforeAfters={beforeAfters} alt={alt} aiNote testIdPrefix="listing" />;
}
