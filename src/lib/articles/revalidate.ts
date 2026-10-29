/**
 * Drop the ISR copies a blog write affects, on the server, so a publish shows
 * on /blog, /blog/<slug> and sitemap.xml on the next request and an unpublish
 * disappears from all three (ART4, ART5, ART9).
 *
 * The path list is shared with the browser editors (src/lib/revalidate.ts
 * blogPagePaths), which send it to /api/admin/revalidate instead.
 *
 * Never throws: the write already succeeded, so a failed revalidation only
 * means the pages' own ISR window applies.
 */
import { revalidatePath, revalidateTag } from 'next/cache';
import { blogPagePaths, SITEMAP_TAG } from '@/lib/revalidate';

export function revalidateArticlePages(...slugs: Array<string | null | undefined>): string[] {
  const paths = blogPagePaths(...slugs);
  try {
    revalidateTag(SITEMAP_TAG, { expire: 0 });
  } catch (err) {
    console.error('article revalidate failed for the sitemap tag:', err instanceof Error ? err.message : err);
  }
  for (const path of paths) {
    try {
      revalidatePath(path);
    } catch (err) {
      console.error(`article revalidate failed for ${path}:`, err instanceof Error ? err.message : err);
    }
  }
  return paths;
}
