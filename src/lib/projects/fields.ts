/**
 * The vocabulary of a portfolio project, shared by the admin form, the server
 * routes and the ingest API so the three cannot drift.
 *
 * Client-safe: no server imports here.
 */

export const PROJECT_IMAGES_BUCKET = 'project-images';

/** The six remodel services a project can be filed under (matches /services/*). */
export const SERVICE_TYPES = [
  'Kitchen Remodeling',
  'Bathroom Renovation',
  'Basement Finishing',
  'Home Additions',
  'Whole Home Remodel',
  'Custom Living Space',
] as const;

export const BUDGET_RANGES = [
  '$5,000 - $15,000',
  '$15,000 - $25,000',
  '$25,000 - $50,000',
  '$50,000 - $75,000',
  '$75,000 - $100,000',
  '$100,000+',
] as const;

export const DURATION_OPTIONS = [
  '1 week', '2 weeks', '3 weeks', '1 month', '6 weeks', '2 months', '3 months', '4+ months',
] as const;

export const COMMON_MATERIALS = [
  'Quartz Countertops', 'Granite Countertops', 'Marble Countertops', 'Custom Cabinets',
  'Hardwood Flooring', 'Luxury Vinyl Plank', 'Porcelain Tile', 'Subway Tile', 'Natural Stone',
  'Stainless Steel Appliances', 'Smart Home Technology', 'LED Lighting', 'Recessed Lighting',
  'Crown Molding', 'Wainscoting',
] as const;

export const COMMON_FEATURES = [
  'Kitchen Island', 'Walk-in Pantry', 'Double Vanity', 'Walk-in Shower', 'Freestanding Tub',
  'Heated Floors', 'Built-in Storage', 'Custom Lighting', 'Smart Home Integration',
  'Energy Efficient Windows', 'Skylights', 'Custom Millwork', 'Wine Storage', 'Coffee Station',
  'Mudroom',
] as const;

export const IMAGE_CATEGORIES = ['before', 'during', 'after'] as const;
export type ImageCategory = (typeof IMAGE_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<ImageCategory, string> = {
  before: 'Before',
  during: 'During',
  after: 'After',
};

export type ProjectStatus = 'draft' | 'published' | 'archived';
export type ProjectSource = 'admin' | 'api';

/**
 * Upload ceilings.
 *
 * Images travel through a Vercel function, whose request body is capped at
 * 4.5 MB by the platform, so the browser re-encodes anything larger before it
 * leaves (see src/components/admin/projects/upload.ts) and the server refuses
 * anything over this line. Videos never pass through a function: the server
 * mints a signed upload URL and the browser (or the CLI) uploads straight to
 * storage, so only the declared size is checked up front.
 */
export const MAX_IMAGE_BODY_BYTES = 4 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
/** Signed uploads of images (CLI, large phone photos) are not body-limited. */
export const MAX_SIGNED_IMAGE_BYTES = 25 * 1024 * 1024;
