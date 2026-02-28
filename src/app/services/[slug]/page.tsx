import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ServiceDetailClient from '@/components/ServiceDetailClient';
import Link from 'next/link';
import { getAllLocations } from '@/data/locationData';
import { MapPin } from 'lucide-react';

// Revalidate every 60 seconds (ISR - Incremental Static Regeneration)
export const revalidate = 60;

// Server-side Supabase client (trim to handle any whitespace in env vars)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!.trim()
);

interface ServiceData {
  id: string;
  title: string;
  description: string;
  icon_name: string;
  features: string[];
  sort_order: number;
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function getService(slug: string): Promise<ServiceData | null> {
  try {
    // Convert slug to title format (e.g., "kitchen-remodeling" -> "Kitchen Remodeling")
    const titleFromSlug = slug
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('active', true)
      .ilike('title', `%${titleFromSlug}%`)
      .maybeSingle();

    if (error) {
      console.error('Error fetching service:', error);
      return null;
    }

    if (!data) {
      return null;
    }

    return {
      id: data.id,
      title: data.title,
      description: data.description || '',
      icon_name: data.icon_name || '',
      features: Array.isArray(data.features)
        ? data.features.filter((f: unknown): f is string => typeof f === 'string')
        : [],
      sort_order: data.sort_order || 0,
    };
  } catch (err) {
    console.error('Failed to fetch service:', err);
    return null;
  }
}

// Generate static params for pre-rendering
export async function generateStaticParams() {
  const { data: services } = await supabase.from('services').select('title').eq('active', true).limit(50);

  return (services || []).map((service) => ({
    slug: service.title
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, ''),
  }));
}

// Dynamic metadata for SEO
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const service = await getService(slug);

  if (!service) {
    return {
      title: 'Service Not Found | La Vaca General Contractors',
      description: 'The requested service could not be found.',
    };
  }

  const title = `${service.title} Services in Northern NJ | La Vaca General Contractors`;
  const description =
    service.description ||
    `Professional ${service.title.toLowerCase()} services in Northern New Jersey. Expert craftsmanship, quality materials, and excellent customer service.`;
  const keywords = `${service.title}, ${service.title} NJ, ${service.title} Northern New Jersey, home remodeling, contractor, La Vaca General Contractors`;

  return {
    title,
    description,
    keywords,
    openGraph: {
      title: `${service.title} | La Vaca GC`,
      description,
      type: 'website',
      url: `https://www.lavacagc.com/services/${slug}`,
      images: [
        {
          url: 'https://www.lavacagc.com/og-services.jpg',
          width: 1200,
          height: 630,
          alt: `${service.title} Services by La Vaca General Contractors`,
        },
      ],
      siteName: 'La Vaca General Contractors',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${service.title} | La Vaca GC`,
      description,
    },
    alternates: {
      canonical: `https://www.lavacagc.com/services/${slug}`,
    },
  };
}

export default async function ServiceDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const service = await getService(slug);

  if (!service) {
    notFound();
  }

  // JSON-LD Schema for Service
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.title,
    description: service.description,
    provider: {
      '@type': 'LocalBusiness',
      name: 'La Vaca General Contractors',
      url: 'https://www.lavacagc.com',
      telephone: '(201) 212-4917',
      address: {
        '@type': 'PostalAddress',
        addressRegion: 'NJ',
        addressCountry: 'US',
      },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '5',
        bestRating: '5',
        ratingCount: '30',
      },
    },
    areaServed: {
      '@type': 'State',
      name: 'New Jersey',
    },
    serviceType: service.title,
    url: `https://www.lavacagc.com/services/${slug}`,
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: `${service.title} Features`,
      itemListElement: service.features.map((feature, index) => ({
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: feature,
        },
        position: index + 1,
      })),
    },
  };

  // Breadcrumb Schema
  const breadcrumbJsonLd = {
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
        name: 'Services',
        item: 'https://www.lavacagc.com/services',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: service.title,
        item: `https://www.lavacagc.com/services/${slug}`,
      },
    ],
  };

  // FAQ Schema for common questions
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `How long does a typical ${service.title.toLowerCase()} project take?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `A typical ${service.title.toLowerCase()} project takes 6-12 weeks from design consultation to final inspection, depending on the scope and complexity of the work.`,
        },
      },
      {
        '@type': 'Question',
        name: `What is the process for ${service.title.toLowerCase()}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Our proven 6-step process includes: Design Consultation, Permits & Planning, Demolition & Prep, Rough-In Work, Installation, and Final Inspection.',
        },
      },
      {
        '@type': 'Question',
        name: 'Do you provide warranties on your work?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes, all our work comes with a comprehensive warranty for your peace of mind. We stand behind our craftsmanship and quality materials.',
        },
      },
    ],
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* JSON-LD Structured Data */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <main>
        {/* Breadcrumb Navigation - Server Rendered for SEO */}
        <section className="bg-background-subtle py-4">
          <div className="container mx-auto px-4">
            <nav aria-label="Breadcrumb">
              <ol className="flex items-center space-x-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/" className="hover:text-primary">
                    Home
                  </Link>
                </li>
                <li>/</li>
                <li>
                  <Link href="/services" className="hover:text-primary">
                    Services
                  </Link>
                </li>
                <li>/</li>
                <li className="text-foreground font-medium">{service.title}</li>
              </ol>
            </nav>
          </div>
        </section>

        {/* Interactive Service Content - Client Component */}
        <ServiceDetailClient service={service} slug={slug} />

        {/* Service Areas - Internal Linking */}
        <section className="py-16 bg-muted/50">
          <div className="container mx-auto px-4">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-text-primary mb-3">
                {service.title} in Northern NJ
              </h2>
              <p className="text-text-secondary max-w-2xl mx-auto">
                We provide {service.title.toLowerCase()} services throughout Essex, Bergen, Morris, and Passaic counties. Click your town to learn more.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {getAllLocations().map((loc) => (
                <Link
                  key={loc.slug}
                  href={`/locations/${loc.slug}/services/${slug}`}
                  className="flex items-center gap-2 px-4 py-3 bg-background rounded-lg border border-border hover:border-primary hover:shadow-sm transition-all text-sm font-medium text-text-primary hover:text-primary"
                >
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                  {loc.name}
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
