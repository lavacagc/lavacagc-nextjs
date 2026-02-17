import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Breadcrumb from '@/components/Breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { resourceArticles, getResourceBySlug, getAllResourceSlugs } from '@/data/resourceData';
import { resourceContent } from '@/data/resourceContent';
import { ArrowLeft, ArrowRight, BookOpen, Phone } from 'lucide-react';
import Link from 'next/link';
import CallTrackingWrapper from '@/components/CallTrackingWrapper';

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Generate static params for all resource articles
export async function generateStaticParams() {
  return getAllResourceSlugs().map((slug) => ({ slug }));
}

// Generate metadata dynamically
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = getResourceBySlug(slug);
  if (!article) return {};

  return {
    title: `${article.title} | Homeowner Resources`,
    description: article.description,
    keywords: article.keywords,
    openGraph: {
      title: `${article.title} | La Vaca General Contractors`,
      description: article.description,
      url: `https://www.lavacagc.com/resources/${article.slug}`,
      type: 'article',
      images: [
        {
          url: 'https://www.lavacagc.com/logo.png',
          width: 800,
          height: 800,
          alt: article.title,
        },
      ],
    },
    alternates: {
      canonical: `https://www.lavacagc.com/resources/${article.slug}`,
    },
  };
}

export default async function ResourceArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const article = getResourceBySlug(slug);
  const content = resourceContent[slug];

  if (!article || !content) {
    notFound();
  }

  // Find previous and next articles for navigation
  const currentIndex = resourceArticles.findIndex((a) => a.slug === slug);
  const prevArticle = currentIndex > 0 ? resourceArticles[currentIndex - 1] : null;
  const nextArticle =
    currentIndex < resourceArticles.length - 1 ? resourceArticles[currentIndex + 1] : null;

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    url: `https://www.lavacagc.com/resources/${article.slug}`,
    author: {
      '@type': 'Organization',
      name: 'La Vaca General Contractors, LLC',
      url: 'https://www.lavacagc.com',
    },
    publisher: {
      '@type': 'Organization',
      name: 'La Vaca General Contractors, LLC',
      logo: {
        '@type': 'ImageObject',
        url: 'https://www.lavacagc.com/logo.png',
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://www.lavacagc.com/resources/${article.slug}`,
    },
  };

  const breadcrumbItems = [
    { label: 'Resources', href: '/resources' },
    { label: article.shortTitle, href: `/resources/${article.slug}` },
  ];

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
            <Breadcrumb items={breadcrumbItems} />
          </div>
        </section>

        {/* Article Header */}
        <section className="py-10 md:py-16 bg-gradient-subtle">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs text-primary font-semibold uppercase tracking-wider bg-primary/10 px-3 py-1 rounded-full">
                  {article.category}
                </span>
                <span className="text-xs text-text-muted">{article.readTime}</span>
              </div>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-text-primary leading-tight">
                {article.title}
              </h1>
            </div>
          </div>
        </section>

        {/* Article Content */}
        <section className="py-10 md:py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <article className="prose-custom">{content}</article>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-10 md:py-16 bg-gradient-to-br from-primary/5 to-accent-sunset/5">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <Card className="border-primary/20">
                <CardContent className="p-8 text-center">
                  <BookOpen className="h-10 w-10 text-primary mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-text-primary mb-3">
                    Have Questions About Your Project?
                  </h2>
                  <p className="text-text-secondary mb-6 max-w-lg mx-auto">
                    Our team of licensed NJ contractors is ready to answer your questions
                    and provide a free, no-obligation consultation.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button
                      asChild
                      className="bg-gradient-to-r from-primary via-accent-sunset to-accent-tangerine bg-[length:400%_100%] animate-gradient hover:shadow-button"
                    >
                      <Link href="/contact">Get a Free Consultation</Link>
                    </Button>
                    <CallTrackingWrapper
                      href="tel:2012124917"
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                    >
                      <Phone className="h-4 w-4" />
                      (201) 212-4917
                    </CallTrackingWrapper>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Article Navigation */}
        <section className="py-8 bg-background-subtle border-t border-border">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <div className="flex flex-col sm:flex-row justify-between gap-4">
                {prevArticle ? (
                  <Link
                    href={`/resources/${prevArticle.slug}`}
                    className="group flex items-center gap-2 text-text-secondary hover:text-primary transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                    <div>
                      <span className="text-xs text-text-muted block">Previous</span>
                      <span className="font-medium">{prevArticle.shortTitle}</span>
                    </div>
                  </Link>
                ) : (
                  <div />
                )}
                {nextArticle ? (
                  <Link
                    href={`/resources/${nextArticle.slug}`}
                    className="group flex items-center gap-2 text-right text-text-secondary hover:text-primary transition-colors sm:ml-auto"
                  >
                    <div>
                      <span className="text-xs text-text-muted block">Next</span>
                      <span className="font-medium">{nextArticle.shortTitle}</span>
                    </div>
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </Link>
                ) : (
                  <div />
                )}
              </div>

              <div className="text-center mt-8">
                <Button asChild variant="outline">
                  <Link href="/resources">
                    <BookOpen className="mr-2 h-4 w-4" />
                    View All Resources
                  </Link>
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
