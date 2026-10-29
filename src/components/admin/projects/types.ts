import type { ImageCategory, ProjectStatus } from '@/lib/projects/fields';

/** One photo or video in the form, from drop to saved. */
export interface FormImage {
  /** Local identity for React keys and pairing; never sent. */
  key: string;
  /** The public storage URL once uploaded; empty while uploading. */
  url: string;
  /** What the thumbnail shows: a blob: URL while uploading, then the stored URL. */
  previewUrl: string;
  media_type: 'image' | 'video';
  category: ImageCategory;
  alt_text: string;
  /** Once the owner types an alt text, the default stops following the form. */
  altTouched: boolean;
  is_featured: boolean;
  pair_key?: string;
  caption?: string;
  status: 'uploading' | 'ready' | 'error';
  error?: string;
  name?: string;
}

export interface ProjectFormFields {
  title: string;
  location: string;
  service_types: string[];
  client_first_name: string;
  /** `YYYY-MM`, for `<input type="month">`. */
  date_completed: string;
  budget_range: string;
  duration: string;
  challenge: string;
  solution: string;
  materials_used: string[];
  special_features: string[];
  testimonial_text: string;
  testimonial_rating: number;
  seo_title: string;
  meta_description: string;
  url_slug: string;
  focus_keyword: string;
}

/** Which derived fields the owner has typed over (so the default stops following). */
export interface TouchedDefaults {
  seo_title: boolean;
  meta_description: boolean;
  url_slug: boolean;
}

/** A project as the admin list returns it. */
export interface ProjectListItem {
  id: string;
  title: string;
  location: string;
  service_types: string[];
  date_completed: string | null;
  budget_range: string | null;
  featured: boolean;
  active: boolean;
  status: ProjectStatus;
  source: string | null;
  sort_order: number;
  created_at: string;
  published_at: string | null;
  testimonial_rating: number | null;
  url_slug: string | null;
  featured_image_id?: string | null;
  project_images?: Array<{
    id: string;
    image_url: string;
    is_featured: boolean;
    image_category: string | null;
    media_type: string | null;
    sort_order: number | null;
  }>;
}

/** What opens the form: a blank one, an existing project, or storage photos to start from. */
export type FormTarget =
  | { kind: 'new'; preloadUrls?: string[] }
  | { kind: 'edit'; id: string };
