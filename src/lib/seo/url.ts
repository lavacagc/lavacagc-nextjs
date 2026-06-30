/**
 * Normalize a URL or path to a canonical pagePath ("/foo/bar"), so rows from
 * GSC (full URL) and GA4 (path) compare/upsert against the same key.
 */
export function toPagePath(input: string): string {
  if (!input) return '/';
  let path = input;
  try {
    if (/^https?:\/\//i.test(input)) {
      const u = new URL(input);
      path = u.pathname || '/';
    }
  } catch {
    // fall through with raw input
  }
  // Strip trailing slash except root.
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path;
}
