import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCMSPage } from '@/lib/cms';
import CMSPageLayout from '@/components/CMSPageLayout';

export const revalidate = 60;

const SLUG = 'lp/kitchen-remodel';

export async function generateMetadata(): Promise<Metadata> {
  const page = await getCMSPage(SLUG);
  const title = page?.title || 'Kitchen Remodeling in NJ';
  const description = page?.meta_description || 'Transform your kitchen with NJ\'s trusted remodeling experts.';

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

export default async function KitchenRemodelPage() {
  const page = await getCMSPage(SLUG);
  if (!page) notFound();

  const sections = Array.isArray(page.sections) ? page.sections : [];
  return <CMSPageLayout sections={sections} />;
}
