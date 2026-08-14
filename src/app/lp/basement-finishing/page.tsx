import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCMSPage } from '@/lib/cms';
import CMSPageLayout from '@/components/CMSPageLayout';

export const revalidate = 60;

const SLUG = 'lp/basement-finishing';

export async function generateMetadata(): Promise<Metadata> {
  const page = await getCMSPage(SLUG);
  const title = page?.title || 'Basement Finishing in NJ';
  const description = page?.meta_description || 'Unlock your basement\'s full potential with NJ\'s expert contractors.';

  return {
    title: `${title} | Free Estimate`,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title: `${title} | La Vaca General Contractors`,
      description,
      url: `https://www.lavacagc.com/${SLUG}`,
    },
    alternates: { canonical: `https://www.lavacagc.com/${SLUG}` },
  };
}

export default async function BasementFinishingPage() {
  const page = await getCMSPage(SLUG);
  if (!page) notFound();

  const sections = Array.isArray(page.sections) ? page.sections : [];
  return <CMSPageLayout sections={sections} />;
}
