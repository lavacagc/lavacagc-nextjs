/**
 * On-demand ISR for the admin editors that write straight to Supabase from the
 * browser (CMS pages, services). Those pages cache for an hour, so an editor
 * asks POST /api/admin/revalidate to drop the affected copies after a save.
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
] as const;

const SAFE_PATH = /^\/[A-Za-z0-9\-_/]*$/;

export function isRevalidatablePath(path: string): boolean {
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
