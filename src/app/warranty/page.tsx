import { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Clock, FileText } from 'lucide-react';
import Link from 'next/link';
import WarrantyFormWrapper from '@/components/WarrantyFormWrapper';

export const metadata: Metadata = {
  title: '5-Year Warranty | Home Remodeling Guarantee | La Vaca General Contractors',
  description:
    'Comprehensive 5-year warranty on all home remodeling projects. We stand behind our work with coverage for workmanship defects, structural integrity, and installation issues.',
  keywords:
    'contractor warranty, home remodeling warranty, 5 year warranty, NJ contractor guarantee, workmanship warranty, renovation warranty',
  openGraph: {
    title: '5-Year Warranty | La Vaca General Contractors',
    description: 'Comprehensive warranty coverage on all home remodeling projects. Peace of mind guaranteed.',
    type: 'website',
    url: 'https://www.lavacagc.com/warranty',
    images: [
      {
        url: 'https://www.lavacagc.com/og-warranty.jpg',
        width: 1200,
        height: 630,
        alt: 'La Vaca General Contractors 5-Year Warranty',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '5-Year Warranty | La Vaca GC',
    description: 'Comprehensive warranty on all home remodeling projects',
  },
  alternates: {
    canonical: 'https://www.lavacagc.com/warranty',
  },
};

export default function WarrantyPage() {
  // JSON-LD Schema for Service with Warranty
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: '5-Year Home Remodeling Warranty',
    description:
      'Comprehensive 5-year warranty on all home remodeling projects covering workmanship defects, structural integrity, and installation issues.',
    provider: {
      '@type': 'LocalBusiness',
      name: 'La Vaca General Contractors',
      url: 'https://www.lavacagc.com',
      telephone: '(201) 212-4917',
    },
    serviceType: 'Warranty Service',
    areaServed: {
      '@type': 'State',
      name: 'New Jersey',
    },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Warranty Coverage',
      itemListElement: [
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: 'Workmanship Defects Coverage',
          },
        },
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: 'Structural Integrity Coverage',
          },
        },
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: 'Installation Issues Coverage',
          },
        },
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: 'Material Failures Coverage',
          },
        },
      ],
    },
  };

  // Breadcrumb JSON-LD
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
        name: 'Warranty',
        item: 'https://www.lavacagc.com/warranty',
      },
    ],
  };

  return (
    <div className="min-h-screen bg-background-primary">
      <Header />

      {/* JSON-LD Structured Data */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <main className="pt-24">
        {/* Hero Section - Server Rendered for SEO */}
        <section className="py-8 md:py-16 bg-gradient-to-br from-background-primary via-background-secondary to-background-accent">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <nav aria-label="Breadcrumb" className="mb-6">
                <ol className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
                  <li>
                    <Link href="/" className="hover:text-primary">
                      Home
                    </Link>
                  </li>
                  <li>/</li>
                  <li className="text-foreground font-medium">Warranty</li>
                </ol>
              </nav>

              <div className="flex justify-center mb-6">
                <Shield className="h-16 w-16 text-primary" />
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-6">Our 5-Year Warranty</h1>
              <p className="text-xl text-text-secondary leading-relaxed">
                We stand behind our work with a comprehensive 5-year warranty on all home remodeling projects,
                giving you peace of mind and protecting your investment.
              </p>
            </div>
          </div>
        </section>

        {/* Warranty Details - Server Rendered for SEO */}
        <section className="py-8 md:py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto">
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <Shield className="h-8 w-8 text-primary" />
                      <CardTitle>What's Covered</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-text-secondary">
                      <li>• Workmanship defects</li>
                      <li>• Structural integrity</li>
                      <li>• Installation issues</li>
                      <li>• Material failures (when installed by us)</li>
                      <li>• Finishing defects</li>
                    </ul>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <Clock className="h-8 w-8 text-primary" />
                      <CardTitle>Warranty Period</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-text-secondary mb-4">
                      Our warranty begins on the date of project completion and remains valid for 5 full years.
                    </p>
                    <p className="text-sm text-text-muted">
                      Warranty documentation will be provided upon project completion.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 text-primary" />
                      <CardTitle>Warranty Process</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ol className="space-y-2 text-text-secondary">
                      <li>1. Contact us with warranty claim</li>
                      <li>2. We'll schedule an inspection</li>
                      <li>3. Covered issues repaired at no cost</li>
                      <li>4. All repairs backed by warranty</li>
                    </ol>
                  </CardContent>
                </Card>
              </div>

              <div className="bg-background-secondary rounded-lg p-8">
                <h2 className="text-2xl font-bold text-text-primary mb-6">Important Warranty Information</h2>
                <div className="grid md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary mb-3">Warranty Exclusions</h3>
                    <ul className="space-y-2 text-text-secondary text-sm">
                      <li>• Normal wear and tear</li>
                      <li>• Damage from misuse or negligence</li>
                      <li>• Acts of nature (storms, floods, etc.)</li>
                      <li>• Modifications by other contractors</li>
                      <li>• Failure to maintain according to care instructions</li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary mb-3">To Maintain Warranty</h3>
                    <ul className="space-y-2 text-text-secondary text-sm">
                      <li>• Follow all maintenance guidelines provided</li>
                      <li>• Use recommended cleaning products only</li>
                      <li>• Contact us for any repairs needed</li>
                      <li>• Keep warranty documentation safe</li>
                      <li>• Report issues promptly when discovered</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Warranty Claim Form Section - Client Component */}
        <section className="py-8 md:py-16 bg-background-accent">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-text-primary mb-6">Submit a Warranty Claim</h2>
              <p className="text-xl text-text-secondary max-w-3xl mx-auto">
                If you're experiencing an issue covered by our 5-year warranty, please complete the form below.
                Include photos of the issue to help us assess and resolve it quickly.
              </p>
            </div>
            <WarrantyFormWrapper />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
