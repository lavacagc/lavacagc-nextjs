/**
 * SEO Autonomy — Phase 3 (Semi-auto): turn an approved AI draft into a blog_posts
 * DRAFT (published=false). Pure builder — no I/O — so it's unit-testable.
 *
 * Mirrors the field mapping the manual generator uses (BlogPostGenerator):
 * markdown content, title from the first `# ` line, slug from the title.
 *
 * Phase 3 (the "schedule + email, you publish" variant) never sets
 * scheduled_publish_at, so the publish cron never auto-publishes — a human
 * publishes from the blog editor.
 */

export interface BlogPostDraft {
  title: string;
  slug: string;
  content: string;
  category: string;
  excerpt: string;
  meta_description: string;
  published: false;
  author: string;
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();
}

/** Strip markdown syntax to plain text for excerpt/meta. */
function toPlain(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~|]/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → label
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images out
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildBlogPostFromDraft(
  markdown: string,
  opts: { category?: string; author?: string; forcedSlug?: string } = {},
): BlogPostDraft {
  const lines = markdown.split('\n');
  const titleLine = lines.find((l) => /^#\s+/.test(l));
  const title = titleLine ? titleLine.replace(/^#\s+/, '').trim() : 'Untitled';
  const content = (titleLine ? markdown.replace(titleLine, '') : markdown).trim();
  // A caller (e.g. the maintenance cron) can force the exact slug so a created
  // post matches its roster entry; otherwise derive it from the H1 as before.
  const slug = opts.forcedSlug ? slugify(opts.forcedSlug) || 'post' : slugify(title) || 'post';

  const plain = toPlain(content);
  const excerpt = plain.length > 200 ? `${plain.slice(0, 200).trim()}…` : plain;
  const meta_description = plain.slice(0, 155).trim();

  return {
    title,
    slug,
    content,
    category: opts.category ?? 'Home Improvement Tips',
    excerpt,
    meta_description,
    published: false,
    author: opts.author ?? 'Alex T.',
  };
}

/** Pick a blog category from the target query, falling back to a sensible default. */
export function categoryForQuery(query: string | null | undefined): string {
  const q = (query ?? '').toLowerCase();
  if (/kitchen/.test(q)) return 'Kitchen Remodeling';
  if (/bath/.test(q)) return 'Bathroom Remodeling';
  if (/basement/.test(q)) return 'Basement Finishing';
  if (/addition|extension/.test(q)) return 'Home Additions';
  if (/roof|siding|exterior|deck/.test(q)) return 'Exterior';
  return 'Home Improvement Tips';
}
