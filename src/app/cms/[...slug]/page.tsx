import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCMSPage, getAllPublishedSlugs } from '@/lib/cms';
import CMSPageLayout from '@/components/CMSPageLayout';

export const revalidate = 60;

export async function generateStaticParams() {
  const slugs = await getAllPublishedSlugs();
  return slugs.map((slug) => ({ slug: slug.split('/') }));
}

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const slug = resolvedParams.slug.join('/');
  const page = await getCMSPage(slug);

  if (!page) return { title: 'Page Not Found' };

  return {
    title: `${page.title}`,
    description: page.meta_description || undefined,
    openGraph: {
      title: `${page.title} | La Vaca General Contractors`,
      description: page.meta_description || undefined,
      url: `https://www.lavacagc.com/${page.slug}`,
    },
    alternates: { canonical: `https://www.lavacagc.com/${page.slug}` },
  };
}

export default async function CMSPageRoute({ params }: PageProps) {
  const resolvedParams = await params;
  const slug = resolvedParams.slug.join('/');
  const page = await getCMSPage(slug);

  if (!page) notFound();

  const sections = Array.isArray(page.sections) ? page.sections : [];
  return <CMSPageLayout sections={sections} />;
}
