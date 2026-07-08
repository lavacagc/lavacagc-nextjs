/**
 * SEO Autonomy — Phase 3: maintained-articles roster helpers.
 *
 * Thin, typed reads over public.maintained_articles + blog_posts via the
 * service-role Supabase REST helper. The monthly /api/cron/seo-maintain job uses
 * these to decide, per roster row, whether to create-if-missing or refresh-if-stale.
 */
import { supabaseRest } from '@/lib/seo/supabase-rest';

export type RefreshCadence = 'monthly' | 'seasonal';

export interface MaintainedArticle {
  topic_key: string;
  slug: string;
  title_hint: string | null;
  target_query: string | null;
  refresh_cadence: RefreshCadence;
  enhancement_level: string;
  last_maintained_at: string | null;
  created_at: string;
}

/** A live blog post row, as much as maintenance needs to read. */
export interface MaintainedBlogPost {
  id: string;
  slug: string;
  title: string;
  content: string | null;
  excerpt: string | null;
  meta_description: string | null;
  meta_title: string | null;
  published: boolean;
  created_at: string;
  updated_at: string | null;
}

/** Read the full maintenance roster, newest-seeded last (stable topic_key order). */
export async function getMaintainedRoster(): Promise<MaintainedArticle[]> {
  const rows = await supabaseRest<MaintainedArticle[]>(
    'GET',
    'maintained_articles?select=topic_key,slug,title_hint,target_query,refresh_cadence,enhancement_level,last_maintained_at,created_at&order=topic_key.asc',
  );
  return rows ?? [];
}

/** Look up a single blog_posts row by slug, or null if it doesn't exist yet. */
export async function getBlogPostBySlug(slug: string): Promise<MaintainedBlogPost | null> {
  const rows = await supabaseRest<MaintainedBlogPost[]>(
    'GET',
    `blog_posts?select=id,slug,title,content,excerpt,meta_description,meta_title,published,created_at,updated_at&slug=eq.${encodeURIComponent(slug)}&limit=1`,
  );
  return rows?.[0] ?? null;
}

/**
 * Whether a monthly row is due for a refresh: never maintained, or last maintained
 * more than `staleDays` ago. Seasonal rows are handled elsewhere and return false.
 */
export function isRefreshDue(row: MaintainedArticle, now: Date, staleDays = 25): boolean {
  if (row.refresh_cadence !== 'monthly') return false;
  if (!row.last_maintained_at) return true;
  const ageMs = now.getTime() - new Date(row.last_maintained_at).getTime();
  return ageMs > staleDays * 86_400_000;
}

/** Stamp a roster row as maintained now. Best-effort; caller decides whether to await. */
export async function markMaintained(topicKey: string, when: Date = new Date()): Promise<void> {
  await supabaseRest(
    'PATCH',
    `maintained_articles?topic_key=eq.${encodeURIComponent(topicKey)}`,
    { last_maintained_at: when.toISOString() },
    { prefer: 'return=minimal' },
  );
}
