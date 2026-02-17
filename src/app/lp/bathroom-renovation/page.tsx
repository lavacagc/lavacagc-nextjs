import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCMSPage } from '@/lib/cms';
import CMSPageLayout from '@/components/CMSPageLayout';

export const revalidate = 60;

const SLUG = 'lp/bathroom-renovation';

export async function generateMetadata(): Promise<Metadata> {
  const page = await getCMSPage(SLUG);
  const title = page?.title || 'Bathroom Renovation in NJ';
  const description = page?.meta_description || 'Upgrade your bathroom with NJ\'s trusted renovation experts.';

  return {
    title: `${title} | Free Estimate | La Vaca GC`,
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

export default async function BathroomRenovationPage() {
  const page = await getCMSPage(SLUG);
  if (!page) notFound();

  const sections = Array.isArray(page.sections) ? page.sections : [];
  return <CMSPageLayout sections={sections} />;
}
