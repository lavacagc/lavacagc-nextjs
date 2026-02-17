import { createClient } from '@supabase/supabase-js';
import type { CMSSection } from '@/types/cms';

export interface CMSPageRow {
  id: string;
  slug: string;
  title: string;
  meta_description: string | null;
  status: string;
  page_type: string;
  sections: CMSSection[];
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

// Server-side Supabase client for CMS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
  (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()
);

export async function getCMSPage(slug: string): Promise<CMSPageRow | null> {
  const { data, error } = await supabase
    .from('cms_pages')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();

  if (error) {
    console.error('Error loading CMS page:', error);
    return null;
  }

  return data as CMSPageRow | null;
}

export async function getAllPublishedSlugs(): Promise<string[]> {
  const { data } = await supabase
    .from('cms_pages')
    .select('slug')
    .eq('status', 'published')
    .limit(100);

  return (data || []).map((p: { slug: string }) => p.slug);
}
