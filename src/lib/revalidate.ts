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
 * Single files outside every prefix that an editor may still revalidate.
 * The sitemap lists every published blog post, so a publish or unpublish
 * has to drop it too.
 */
export const REVALIDATE_EXACT = ['/sitemap.xml'] as const;

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
 * stops serving the old copy) and the sitemap.
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
  return [...new Set(['/blog', ...posts, '/sitemap.xml'])];
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
  return [...page, '/portfolio', '/', '/sitemap.xml'];
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
