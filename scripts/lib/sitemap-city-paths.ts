/**
 * Pulls the `/locations/<city>` landing pages out of a sitemap document.
 *
 * Its own module, away from `scripts/site-audit.ts`, for one reason: that file
 * runs the whole audit the moment it is imported, so nothing there can be
 * unit-tested. This half is pure, and `tests/site-audit-paths.spec.ts` covers
 * it directly - including the empty-result case, which must throw at the call
 * site rather than quietly audit fewer pages.
 */

/**
 * Every distinct single-segment `/locations/<city>` path in `xml`, sorted.
 *
 * Deliberately excludes `/locations/<city>/services` and the per-service
 * combinations. Those run into the hundreds and sweeping them is a link
 * checker's job, not this audit's.
 */
export function cityPathsFromSitemapXml(xml: string): string[] {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);

  const paths = locs
    .map((loc) => {
      try {
        return new URL(loc).pathname;
      } catch {
        // A relative <loc> is invalid per the sitemap spec, but tolerate it
        // rather than fail the whole audit on one malformed entry.
        return loc.startsWith('/') ? loc : '';
      }
    })
    .filter((path) => /^\/locations\/[^/]+$/.test(path));

  return [...new Set(paths)].sort();
}
