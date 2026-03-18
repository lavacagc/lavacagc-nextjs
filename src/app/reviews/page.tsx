import type { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Breadcrumb from '@/components/Breadcrumb';
import ReviewsPageClient from '@/components/ReviewsPageClient';
import { BUSINESS_INFO } from '@/components/StructuredData';
import { Star, Shield, Award, CheckCircle } from 'lucide-react';

import ReviewsBottomCTA from '@/components/ReviewsBottomCTA';

export const metadata: Metadata = {
  title: 'Customer Reviews | 5-Star Rated NJ Contractor | La Vaca GC',
  description:
    'Read verified customer reviews for La Vaca General Contractors. 5-star rated home remodeling contractor serving Northern New Jersey. See what homeowners say about our kitchen, bathroom, and basement renovations.',
  keywords:
    'La Vaca reviews, NJ contractor reviews, home remodeling reviews, kitchen remodel reviews NJ, bathroom renovation testimonials, customer testimonials contractor',
  openGraph: {
    title: 'Customer Reviews | La Vaca General Contractors',
    description:
      'Read verified 5-star reviews from New Jersey homeowners. See why families trust La Vaca for their home renovations.',
    type: 'website',
    url: 'https://www.lavacagc.com/reviews',
    images: [
      {
        url: 'https://www.lavacagc.com/logo.png',
        width: 800,
        height: 800,
        alt: 'Customer Reviews - La Vaca General Contractors',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Customer Reviews | La Vaca GC',
    description: '5-star rated NJ home remodeling contractor',
    images: ['/logo.png'],
  },
  alternates: {
    canonical: 'https://www.lavacagc.com/reviews',
  },
};

export default function ReviewsPage() {
  // Breadcrumb JSON-LD Schema
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://www.lavacagc.com',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Reviews',
        item: 'https://www.lavacagc.com/reviews',
      },
    ],
  };

  // LocalBusiness with AggregateRating Schema
  const reviewPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': 'https://www.lavacagc.com/#organization',
    name: BUSINESS_INFO.name,
    description: BUSINESS_INFO.description,
    url: BUSINESS_INFO.url,
    telephone: BUSINESS_INFO.telephone,
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: BUSINESS_INFO.aggregateRating.ratingValue,
      reviewCount: BUSINESS_INFO.aggregateRating.reviewCount,
      bestRating: BUSINESS_INFO.aggregateRating.bestRating,
      worstRating: BUSINESS_INFO.aggregateRating.worstRating,
    },
    hasCredential: {
      '@type': 'EducationalOccupationalCredential',
      credentialCategory: 'NJ Home Improvement Contractor License',
      name: BUSINESS_INFO.license,
    },
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(reviewPageSchema) }}
      />

      <main className="flex-1">
        {/* Breadcrumb Navigation */}
        <section className="bg-background-subtle py-4">
          <div className="container mx-auto px-4">
            <Breadcrumb />
          </div>
        </section>

        {/* Hero Section */}
        <section data-section="reviews-hero" className="py-8 md:py-16 bg-gradient-subtle">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-6">
                Customer Reviews
              </h1>

              {/* Aggregate Rating Display */}
              <div className="flex items-center justify-center gap-3 mb-6">
                <div className="flex items-center">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className="h-8 w-8 text-yellow-400 fill-yellow-400"
                    />
                  ))}
                </div>
                <span className="text-3xl font-bold text-text-primary">
                  {BUSINESS_INFO.aggregateRating.ratingValue}
                </span>
                <span className="text-xl text-text-secondary">
                  5-Star Rated
                </span>
              </div>

              <p className="text-xl text-text-secondary leading-relaxed mb-8">
                See what New Jersey homeowners are saying about their experience working with
                La Vaca General Contractors. Real reviews from real customers.
              </p>

              {/* Trust Badges */}
              <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-text-secondary">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  <span>Licensed & Insured</span>
                </div>
                <div className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-primary" />
                  <span>{BUSINESS_INFO.license}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-primary" />
                  <span>Verified Google Reviews</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Reviews Grid - Client Component */}
        <ReviewsPageClient />

        {/* Leave a Review CTA */}
        <section data-section="reviews-list" className="py-12 md:py-16 bg-background-subtle">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-2xl md:text-3xl font-bold text-text-primary mb-4">
                Had a Great Experience?
              </h2>
              <p className="text-lg text-text-secondary mb-8">
                We&apos;d love to hear about your project! Your feedback helps other homeowners
                make informed decisions and helps us continue to improve our services.
              </p>
              <a
                href="https://share.google/3IswCVlL2bgoYMBaK"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button text-white h-12 px-8 transition-all duration-300 hover:scale-105"
              >
                Leave a Google Review
              </a>
            </div>
          </div>
        </section>

        {/* Bottom CTA Section */}
        <ReviewsBottomCTA />
      </main>

      <Footer />
    </div>
  );
}
