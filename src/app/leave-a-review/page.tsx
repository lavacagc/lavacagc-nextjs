import type { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Breadcrumb from '@/components/Breadcrumb';
import LeaveReviewClient from '@/components/LeaveReviewClient';
import { BUSINESS_INFO } from '@/components/StructuredData';

export const metadata: Metadata = {
  title: 'Leave a Review | Share Your Experience | La Vaca GC',
  description:
    'Share your experience with La Vaca General Contractors. Your feedback helps us improve and helps other homeowners make informed decisions about their renovation projects.',
  openGraph: {
    title: 'Leave a Review | La Vaca General Contractors',
    description:
      'Share your renovation experience with La Vaca General Contractors.',
    type: 'website',
    url: 'https://www.lavacagc.com/leave-a-review',
    images: [
      {
        url: 'https://www.lavacagc.com/logo.png',
        width: 800,
        height: 800,
        alt: 'Leave a Review - La Vaca General Contractors',
      },
    ],
  },
  alternates: {
    canonical: 'https://www.lavacagc.com/leave-a-review',
  },
  robots: {
    index: false, // Don't index this page — it's a tool, not content
    follow: true,
  },
};

export default function LeaveReviewPage() {
  const reviewSchema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': 'https://www.lavacagc.com/#organization',
    name: BUSINESS_INFO.name,
    url: BUSINESS_INFO.url,
    telephone: BUSINESS_INFO.telephone,
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: BUSINESS_INFO.aggregateRating.ratingValue,
      reviewCount: BUSINESS_INFO.aggregateRating.reviewCount,
      bestRating: BUSINESS_INFO.aggregateRating.bestRating,
      worstRating: BUSINESS_INFO.aggregateRating.worstRating,
    },
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(reviewSchema) }}
      />

      <main className="flex-1">
        <section className="bg-background-subtle py-4">
          <div className="container mx-auto px-4">
            <Breadcrumb />
          </div>
        </section>

        <LeaveReviewClient />
      </main>

      <Footer />
    </div>
  );
}
