import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import CMSPageRenderer from '@/components/CMSPageRenderer';
import type { CMSSection } from '@/types/cms';

// ISR: revalidate every 60 seconds
export const revalidate = 60;

// Server-side Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!.trim()
);

interface CMSPageRow {
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

async function getCMSPage(slug: string): Promise<CMSPageRow | null> {
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

// Generate static params for pre-rendering published pages
export async function generateStaticParams() {
  const { data: pages } = await supabase
    .from('cms_pages')
    .select('slug')
    .eq('status', 'published')
    .limit(100);

  return (pages || []).map((page: { slug: string }) => ({
    slug: page.slug.split('/'),
  }));
}

// Dynamic metadata for SEO
interface PageProps {
  params: Promise<{ slug: string[] }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const slug = resolvedParams.slug.join('/');
  const page = await getCMSPage(slug);

  if (!page) {
    return { title: 'Page Not Found' };
  }

  return {
    title: `${page.title} | La Vaca General Contractors`,
    description: page.meta_description || undefined,
    openGraph: {
      title: `${page.title} | La Vaca General Contractors`,
      description: page.meta_description || undefined,
      url: `https://www.lavacagc.com/cms/${page.slug}`,
      type: 'website',
    },
    alternates: {
      canonical: `https://www.lavacagc.com/cms/${page.slug}`,
    },
  };
}

export default async function CMSPageRoute({ params }: PageProps) {
  const resolvedParams = await params;
  const slug = resolvedParams.slug.join('/');
  const page = await getCMSPage(slug);

  if (!page) {
    notFound();
  }

  const sections = Array.isArray(page.sections) ? page.sections : [];

  return (
    <>
      <Header />
      <main id="main-content">
        <CMSPageRenderer sections={sections} />
      </main>
      <Footer />
    </>
  );
}
