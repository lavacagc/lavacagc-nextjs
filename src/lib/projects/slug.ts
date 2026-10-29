/**
 * Deterministic defaults for a project: URL slug, SEO title, meta description
 * and image alt text. These replaced the Gemini suggestions (decision 002, Q3),
 * so the same inputs always produce the same text, on the client while the
 * form is being filled and on the server when the ingest API leaves a field out.
 *
 * Client-safe: no server imports here.
 */
import { CATEGORY_LABEL, type ImageCategory } from './fields';

export const SLUG_MAX = 80;
export const SEO_TITLE_MAX = 60;
export const META_DESCRIPTION_MAX = 155;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Lowercase, ASCII, hyphen-separated; never empty for non-empty input with letters or digits. */
export function slugify(text: string, max = SLUG_MAX): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= max) return slug;
  const cut = slug.slice(0, max);
  const lastHyphen = cut.lastIndexOf('-');
  return (lastHyphen > max / 2 ? cut.slice(0, lastHyphen) : cut).replace(/-+$/, '');
}

/** `<title>-<location>`, without repeating the town when the title already names it. */
export function deriveSlug(title: string, location: string): string {
  const t = slugify(title);
  const l = slugify(location.split(',')[0] ?? '');
  if (!l || t.endsWith(l) || t.includes(`-${l}-`) || t.startsWith(`${l}-`)) return t;
  return slugify(`${t}-${l}`);
}

/** Cut at a word boundary so a title never ends mid-word. */
function cutAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max / 2 ? cut.slice(0, lastSpace) : text.slice(0, max)).replace(/[\s,;:|-]+$/, '');
}

/**
 * The brand suffix the root layout's title template (`%s | La Vaca GC`) appends
 * to every page title. It is NOT stored in seo_title: storing it rendered the
 * brand twice ("... | La Vaca GC | La Vaca GC").
 */
export const SEO_TITLE_SUFFIX = ' | La Vaca GC';

/**
 * `<title> in <location>`, cut so that the rendered `<title> in <location> | La Vaca GC`
 * stays within 60 characters.
 */
export function defaultSeoTitle(title: string, location: string): string {
  const t = title.trim();
  const l = location.trim();
  if (!t) return '';
  const base = l && !t.toLowerCase().includes(l.toLowerCase().split(',')[0]) ? `${t} in ${l}` : t;
  return cutAtWord(base, SEO_TITLE_MAX - SEO_TITLE_SUFFIX.length);
}

/** What the browser tab and Google show for a stored seo_title. */
export function renderedSeoTitle(seoTitle: string): string {
  const t = seoTitle.trim();
  return t ? `${t}${SEO_TITLE_SUFFIX}` : '';
}

/** The first 155 characters of challenge + solution, or a plain sentence when both are empty. */
export function defaultMetaDescription(
  challenge: string,
  solution: string,
  serviceTypes: readonly string[],
  location: string,
): string {
  const story = `${challenge.trim()} ${solution.trim()}`.replace(/\s+/g, ' ').trim();
  if (story) return cutAtWord(story, META_DESCRIPTION_MAX);
  const services = serviceTypes.length > 0 ? serviceTypes.join(' and ') : 'Remodeling';
  const where = location.trim() ? ` in ${location.trim()}` : '';
  return cutAtWord(`${services}${where} by La Vaca General Contractors.`, META_DESCRIPTION_MAX);
}

/** `<Before|During|After> - <service types> in <location>`. */
export function defaultAltText(
  category: ImageCategory,
  serviceTypes: readonly string[],
  location: string,
): string {
  const services = serviceTypes.length > 0 ? serviceTypes.join(' & ') : 'Remodel';
  const where = location.trim() ? ` in ${location.trim()}` : '';
  return `${CATEGORY_LABEL[category]} - ${services}${where}`;
}

/** `2026-10` for an `<input type="month">`, in the browser's own timezone. */
export function currentMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
