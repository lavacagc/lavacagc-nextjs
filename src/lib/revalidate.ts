/**
 * On-demand ISR for the admin editors that write straight to Supabase from the
 * browser (CMS pages, services, the blog). Those pages are ISR copies, so an
 * editor asks POST /api/admin/revalidate to drop the affected copies after a save.
 *
 * Shared by the route (validation) and the editors (building the path list).
 */

/** Path prefixes an editor may revalidate. '/' alone means the homepage only. */
export const REVALIDATE_PREFIXES = [
  '/',
  '/services',
  '/cms',
  '/lp',
  '/free-estimate',
  '/commercial-services',
  '/spring-renovation',
  '/blog',
] as const;

/**
 * The route handler that renders the sitemap; /sitemap.xml is a rewrite to it
 * (next.config.ts). This is the path whose ISR copy actually holds the
 * sitemap, so it is the one a writer must revalidate. See
 * src/app/api/sitemap/route.ts for why it is not a metadata route.
 */
export const SITEMAP_ROUTE = '/api/sitemap';

/**
 * Both sitemap paths: the route handler that holds the ISR copy, and the
 * public /sitemap.xml, kept so an editor tab loaded before this change still
 * passes validation and every request names the sitemap the way crawlers do.
 */
export const SITEMAP_PATHS = [SITEMAP_ROUTE, '/sitemap.xml'] as const;

/**
 * Single files outside every prefix that an editor may still revalidate.
 * The sitemap lists every published blog post, so a publish or unpublish
 * has to drop it too.
 */
export const REVALIDATE_EXACT = SITEMAP_PATHS;

/**
 * Data-cache tag on the sitemap's database reads. Every writer that changes
 * what the sitemap lists expires this tag along with revalidatePath on
 * SITEMAP_ROUTE, so the next request regenerates from fresh rows.
 */
export const SITEMAP_TAG = 'sitemap';

/** Whether a path list names the sitemap, so the caller expires SITEMAP_TAG too. */
export function touchesSitemap(paths: readonly string[]): boolean {
  return paths.some((path) => (SITEMAP_PATHS as readonly string[]).includes(path));
}

const SAFE_PATH = /^\/[A-Za-z0-9\-_/]*$/;

export function isRevalidatablePath(path: string): boolean {
  if ((REVALIDATE_EXACT as readonly string[]).includes(path)) return true;
  if (!SAFE_PATH.test(path) || path.includes('//')) return false;
  if (path === '/') return true;
  return REVALIDATE_PREFIXES.some((prefix) => prefix !== '/' && (path === prefix || path.startsWith(`${prefix}/`)));
}

/**
 * Every public path a CMS page with this slug renders at: always /cms/<slug>,
 * plus the dedicated route when one reads the same slug (lp/*, spring-renovation).
 */
export function cmsPagePaths(slug: string): string[] {
  const clean = slug.trim().replace(/^\/+|\/+$/g, '');
  if (!clean) return [];
  return [`/cms/${clean}`, `/${clean}`].filter(isRevalidatablePath);
}

/**
 * Every public path a blog post's visibility or content shows on: the list,
 * the post itself (under each slug it has had, so a renamed post's old URL
 * stops serving the old copy) and the sitemap (both of SITEMAP_PATHS).
 *
 * One list for both sides: the browser editors send it to
 * /api/admin/revalidate, and the server writers (article routes, crons) hand
 * it to revalidatePath through revalidateArticlePages.
 */
export function blogPagePaths(...slugs: Array<string | null | undefined>): string[] {
  const posts = slugs
    .map((s) => (s ?? '').trim().replace(/^\/+|\/+$/g, ''))
    .filter((s) => /^[a-z0-9][a-z0-9-]*$/i.test(s))
    .map((s) => `/blog/${s}`);
  return [...new Set(['/blog', ...posts, ...SITEMAP_PATHS])];
}

/**
 * Every public path a project's visibility shows on: the project page, the
 * portfolio, the homepage gallery and the sitemap, which lists every active
 * project. The server writers hand it to revalidatePath through
 * revalidateProjectPages.
 */
export function projectPagePaths(slug?: string | null): string[] {
  const clean = (slug ?? '').trim().replace(/^\/+|\/+$/g, '');
  const page = /^[a-z0-9][a-z0-9-]*$/i.test(clean) ? [`/projects/${clean}`] : [];
  return [...page, '/portfolio', '/', ...SITEMAP_PATHS];
}

/**
 * Ask the server to revalidate these paths. Never throws: the save already
 * succeeded, so a failure only means the hourly ISR window applies. Returns
 * whether the request went through, so the caller can say so.
 */
export async function requestRevalidate(paths: string[]): Promise<boolean> {
  const unique = [...new Set(paths)].filter(isRevalidatablePath);
  if (unique.length === 0) return true;
  try {
    const res = await fetch('/api/admin/revalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: unique }),
    });
    return res.ok;
  } catch (err) {
    console.error('revalidate request failed:', err instanceof Error ? err.message : err);
    return false;
  }
}
