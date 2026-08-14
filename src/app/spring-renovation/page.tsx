import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCMSPage } from '@/lib/cms';
import CMSPageLayout from '@/components/CMSPageLayout';

export const revalidate = 60;

const SLUG = 'spring-renovation';

export async function generateMetadata(): Promise<Metadata> {
  const page = await getCMSPage(SLUG);
  const title = page?.title || 'Spring 2026 Renovation Special';
  const description = page?.meta_description || 'Transform your home this spring with La Vaca General Contractors.';

  return {
    title: `${title}`,
    description,
    openGraph: {
      title: `${title} | La Vaca General Contractors`,
      description,
      url: `https://www.lavacagc.com/${SLUG}`,
    },
    alternates: { canonical: `https://www.lavacagc.com/${SLUG}` },
  };
}

export default async function SpringRenovationPage() {
  const page = await getCMSPage(SLUG);
  if (!page) notFound();

  const sections = Array.isArray(page.sections) ? page.sections : [];
  return <CMSPageLayout sections={sections} />;
}
