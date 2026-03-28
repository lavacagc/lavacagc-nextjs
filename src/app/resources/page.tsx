import type { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Breadcrumb from '@/components/Breadcrumb';
import FinancingCalculator from '@/components/FinancingCalculator';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { resourceArticles } from '@/data/resourceData';
import {
  BookOpen,
  ClipboardCheck,
  Clock,
  Layers,
  DollarSign,
  Handshake,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Homeowner Resource Center | Renovation Guides & Tips for NJ Homeowners',
  description:
    'Free renovation guides for NJ homeowners. Learn about building permits, renovation timelines, choosing materials, financing options, and working with contractors.',
  keywords: [
    'homeowner resources',
    'renovation guide NJ',
    'home remodeling tips',
    'NJ building permits',
    'renovation timeline',
    'financing renovation',
    'choosing materials',
  ],
  openGraph: {
    title: 'Homeowner Resource Center | La Vaca General Contractors',
    description:
      'Free renovation guides for NJ homeowners. Building permits, timelines, materials, financing, and more.',
    url: 'https://www.lavacagc.com/resources',
    type: 'website',
    images: [
      {
        url: 'https://www.lavacagc.com/logo.png',
        width: 800,
        height: 800,
        alt: 'La Vaca General Contractors - Homeowner Resources',
      },
    ],
  },
  alternates: {
    canonical: 'https://www.lavacagc.com/resources',
  },
};

// Map icon names to components
const iconMap: Record<string, React.ElementType> = {
  ClipboardCheck,
  Clock,
  Layers,
  DollarSign,
  Handshake,
};

export default function ResourcesPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Homeowner Resource Center',
    description:
      'Free renovation guides and resources for New Jersey homeowners from La Vaca General Contractors.',
    url: 'https://www.lavacagc.com/resources',
    publisher: {
      '@type': 'Organization',
      name: 'La Vaca General Contractors, LLC',
      url: 'https://www.lavacagc.com',
    },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: resourceArticles.map((article, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `https://www.lavacagc.com/resources/${article.slug}`,
        name: article.title,
      })),
    },
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />

        {/* Breadcrumb */}
        <section className="bg-background-subtle py-4">
          <div className="container mx-auto px-4">
            <Breadcrumb />
          </div>
        </section>

        {/* Hero Section */}
        <section className="py-12 md:py-20 bg-gradient-subtle">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <div className="bg-primary/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-8">
                <BookOpen className="h-10 w-10 text-primary" />
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-6">
                Homeowner Resource Center
              </h1>
              <p className="text-xl text-text-secondary leading-relaxed max-w-2xl mx-auto">
                Everything you need to know before, during, and after your home renovation.
                Free guides written by licensed NJ contractors.
              </p>
            </div>
          </div>
        </section>

        {/* Resource Articles Grid */}
        <section className="py-12 md:py-16 bg-background-subtle">
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-3xl font-bold text-text-primary text-center mb-4">
                Renovation Guides
              </h2>
              <p className="text-text-secondary text-center mb-12 max-w-2xl mx-auto">
                Practical, no-nonsense guides to help you navigate your renovation with confidence.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {resourceArticles.map((article) => {
                  const IconComponent = iconMap[article.icon] || BookOpen;
                  return (
                    <Link
                      key={article.slug}
                      href={`/resources/${article.slug}`}
                      className="group"
                    >
                      <Card className="h-full hover:shadow-elegant transition-all duration-300 group-hover:border-primary/30">
                        <CardContent className="p-6">
                          <div className="flex items-start gap-4 mb-4">
                            <div className="bg-primary/10 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                              <IconComponent className="h-6 w-6 text-primary" />
                            </div>
                            <div>
                              <span className="text-xs text-primary font-semibold uppercase tracking-wider">
                                {article.category}
                              </span>
                              <h3 className="text-lg font-bold text-text-primary group-hover:text-primary transition-colors">
                                {article.shortTitle}
                              </h3>
                            </div>
                          </div>
                          <p className="text-text-secondary text-sm leading-relaxed mb-4">
                            {article.description}
                          </p>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-text-muted">{article.readTime}</span>
                            <span className="text-primary text-sm font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                              Read Guide <ArrowRight className="h-4 w-4" />
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Financing Calculator */}
        <section className="py-12 md:py-16 bg-muted/50">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl font-bold text-text-primary text-center mb-4">
                Plan Your Budget
              </h2>
              <p className="text-text-secondary text-center mb-8 max-w-2xl mx-auto">
                Use our financing calculator to estimate monthly payments and plan your renovation budget.
              </p>
              <FinancingCalculator />
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-12 md:py-16 bg-gradient-to-br from-secondary/5 to-primary/5">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl font-bold text-text-primary mb-4">
                Ready to Start Your Project?
              </h2>
              <p className="text-text-secondary text-lg mb-8">
                Our team is here to answer your questions and provide a free, no-obligation estimate.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  asChild
                  className="bg-gradient-to-r from-primary via-accent-sunset to-accent-tangerine bg-[length:400%_100%] animate-gradient hover:shadow-button text-lg px-8 py-6"
                >
                  <Link href="/contact">Get a Free Estimate</Link>
                </Button>
                <Button asChild variant="outline" className="text-lg px-8 py-6">
                  <Link href="/free-estimate">Request an Estimate</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
