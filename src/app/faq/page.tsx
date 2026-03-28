import type { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Breadcrumb from '@/components/Breadcrumb';
import FAQSection from '@/components/seo/FAQSection';
import { faqCategories, getAllFAQs, getFAQCount } from '@/data/faqData';
import Link from 'next/link';
import {
  DollarSign,
  ChefHat,
  Bath,
  ClipboardCheck,
  Clock,
  Home,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Home Remodeling FAQ | 50+ Answers to Common Questions | La Vaca GC',
  description:
    'Get expert answers to frequently asked questions about home remodeling in New Jersey. Costs, timelines, choosing contractors, kitchen and bathroom renovation tips.',
  keywords:
    'home remodeling FAQ, renovation questions NJ, kitchen remodel cost, bathroom renovation timeline, contractor questions, home improvement FAQ, New Jersey contractor',
  openGraph: {
    title: 'Home Remodeling FAQ | La Vaca General Contractors',
    description:
      'Expert answers to your home renovation questions. Costs, timelines, and tips from licensed NJ contractors.',
    type: 'website',
    url: 'https://www.lavacagc.com/faq',
    images: [
      {
        url: 'https://www.lavacagc.com/logo.png',
        width: 800,
        height: 800,
        alt: 'Home Remodeling FAQ - La Vaca General Contractors',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Home Remodeling FAQ | La Vaca GC',
    description: '50+ answers to common renovation questions',
    images: ['/logo.png'],
  },
  alternates: {
    canonical: 'https://www.lavacagc.com/faq',
  },
};

// Icon mapping for categories
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  DollarSign,
  ChefHat,
  Bath,
  ClipboardCheck,
  Clock,
  Home,
};

export default function FAQPage() {
  const allFaqs = getAllFAQs();
  const faqCount = getFAQCount();

  // FAQPage JSON-LD Schema (all questions combined)
  const faqPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: allFaqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer.replace(/<[^>]*>/g, ''), // Strip HTML for schema
      },
    })),
  };

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
        name: 'FAQ',
        item: 'https://www.lavacagc.com/faq',
      },
    ],
  };

  // Alternating background classes for sections
  const sectionBackgrounds = [
    'bg-background-subtle',
    'bg-muted/50',
    'bg-background-subtle',
    'bg-muted/50',
    'bg-background-subtle',
    'bg-muted/50',
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPageSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />

      <main className="flex-1">
        {/* Breadcrumb Navigation */}
        <section className="bg-background-subtle py-4">
          <div className="container mx-auto px-4">
            <Breadcrumb />
          </div>
        </section>

        {/* Hero Section */}
        <section className="py-8 md:py-16 bg-gradient-subtle">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-6">
                Frequently Asked Questions
              </h1>
              <p className="text-xl text-text-secondary leading-relaxed mb-4">
                Get expert answers to your home renovation questions. From costs and timelines to
                choosing the right contractor, we&apos;ve compiled {faqCount}+ answers based on what New
                Jersey homeowners ask most.
              </p>
              <p className="text-lg text-text-muted">
                Can&apos;t find what you&apos;re looking for?{' '}
                <Link href="/contact" className="text-primary hover:underline">
                  Contact us
                </Link>{' '}
                for personalized answers.
              </p>
            </div>
          </div>
        </section>

        {/* Category Navigation */}
        <section className="py-8 md:py-12 bg-background">
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-2xl font-bold text-text-primary text-center mb-8">
                Browse by Topic
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {faqCategories.map((category) => {
                  const IconComponent = iconMap[category.iconName];
                  return (
                    <a
                      key={category.id}
                      href={`#${category.id}`}
                      className="flex flex-col items-center gap-3 p-4 rounded-lg bg-background-subtle hover:bg-primary/10 hover:shadow-elegant transition-all duration-300 text-center group"
                    >
                      {IconComponent && (
                        <IconComponent className="h-8 w-8 text-primary group-hover:scale-110 transition-transform" />
                      )}
                      <span className="text-sm font-medium text-text-primary">{category.title}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Sections by Category */}
        {faqCategories.map((category, index) => {
          const IconComponent = iconMap[category.iconName];
          return (
            <section
              key={category.id}
              id={category.id}
              className={`scroll-mt-20 ${sectionBackgrounds[index]}`}
            >
              <div className="container mx-auto px-4 py-8 md:py-12">
                <div className="max-w-4xl mx-auto">
                  {/* Category Header */}
                  <div className="flex items-center gap-4 mb-4">
                    {IconComponent && (
                      <div className="bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center">
                        <IconComponent className="h-6 w-6 text-primary" />
                      </div>
                    )}
                    <div>
                      <h2 className="text-2xl md:text-3xl font-bold text-text-primary">
                        {category.title}
                      </h2>
                      <p className="text-text-secondary">{category.description}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* FAQ Items - using FAQSection without its own schema */}
              <FAQSection
                faqs={category.faqs}
                title=""
                className={sectionBackgrounds[index]}
                includeSchema={false}
              />
            </section>
          );
        })}

        {/* CTA Section */}
        <section className="py-12 md:py-20 bg-gradient-subtle">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-6">
                Still Have Questions?
              </h2>
              <p className="text-xl text-text-secondary leading-relaxed mb-8">
                Every home renovation project is unique. Schedule a free consultation to discuss
                your specific needs with our expert team.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button text-white h-12 px-8"
                >
                  Schedule Free Consultation
                </Link>
                <Link
                  href="/free-estimate"
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium border-2 border-primary text-primary hover:bg-primary/10 h-12 px-8"
                >
                  Request an Estimate
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
