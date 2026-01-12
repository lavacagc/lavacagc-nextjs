import { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Clock, FileText, Wrench, Home, AlertTriangle, Phone } from 'lucide-react';
import Link from 'next/link';
import WarrantyFormWrapper from '@/components/WarrantyFormWrapper';

export const metadata: Metadata = {
  title: '5-Year Two-Tier Warranty | Home Remodeling Guarantee | La Vaca General Contractors',
  description:
    'Two-tier warranty protection: Year 1 comprehensive coverage on all materials and workmanship, Years 2-5 structural coverage on major systems and building envelope.',
  keywords:
    'contractor warranty, home remodeling warranty, 5 year warranty, NJ contractor guarantee, workmanship warranty, renovation warranty, structural warranty',
  openGraph: {
    title: '5-Year Two-Tier Warranty | La Vaca General Contractors',
    description:
      'Two-tier warranty: Year 1 comprehensive coverage, Years 2-5 structural protection. Peace of mind guaranteed.',
    type: 'website',
    url: 'https://www.lavacagc.com/warranty',
    images: [
      {
        url: 'https://www.lavacagc.com/og-warranty.jpg',
        width: 1200,
        height: 630,
        alt: 'La Vaca General Contractors 5-Year Two-Tier Warranty',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '5-Year Two-Tier Warranty | La Vaca GC',
    description: 'Comprehensive Year 1 + Structural Years 2-5 warranty coverage',
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
    name: '5-Year Two-Tier Home Remodeling Warranty',
    description:
      'Two-tier warranty: Year 1 Comprehensive Limited Warranty covering all materials and workmanship. Years 2-5 Structural Limited Warranty covering structural components, building envelope, and major systems.',
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
            name: 'Year 1 Comprehensive Warranty',
            description: 'All materials and workmanship coverage',
          },
        },
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: 'Years 2-5 Structural Warranty',
            description: 'Structural components, building envelope, and major systems',
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
        {/* Hero Section */}
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
              <h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-6">
                Our 5-Year Two-Tier Warranty
              </h1>
              <p className="text-xl text-text-secondary leading-relaxed mb-8">
                We stand behind our work with a comprehensive two-tier warranty system: full coverage in Year 1,
                plus structural protection through Year 5.
              </p>

              {/* Warranty Overview Table */}
              <div className="bg-background-secondary rounded-lg p-6 max-w-2xl mx-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-3 text-text-primary font-semibold">Period</th>
                      <th className="pb-3 text-text-primary font-semibold">Type</th>
                      <th className="pb-3 text-text-primary font-semibold">Coverage</th>
                    </tr>
                  </thead>
                  <tbody className="text-text-secondary">
                    <tr className="border-b border-border/50">
                      <td className="py-3">Year 1</td>
                      <td className="py-3 font-medium text-primary">Comprehensive</td>
                      <td className="py-3">All materials &amp; workmanship</td>
                    </tr>
                    <tr>
                      <td className="py-3">Years 2-5</td>
                      <td className="py-3 font-medium text-primary">Structural</td>
                      <td className="py-3">Structural components &amp; major systems</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* Two-Tier Warranty Details */}
        <section className="py-8 md:py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto">
              <div className="grid md:grid-cols-2 gap-8 mb-12">
                {/* Year 1 - Comprehensive */}
                <Card className="border-2 border-primary/20">
                  <CardHeader className="bg-primary/5">
                    <div className="flex items-center gap-3">
                      <Shield className="h-8 w-8 text-primary" />
                      <div>
                        <CardTitle>Year 1: Comprehensive Limited Warranty</CardTitle>
                        <p className="text-sm text-text-muted mt-1">Months 1-12</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <p className="text-text-secondary mb-4">
                      During the first year, we provide full coverage for all materials and workmanship.
                    </p>
                    <h4 className="font-semibold text-text-primary mb-2">What's Covered:</h4>
                    <ul className="space-y-2 text-text-secondary text-sm mb-4">
                      <li>• All materials provided and installed by us</li>
                      <li>• All workmanship performed by us and our subcontractors</li>
                      <li>• Any defect that becomes apparent during Year 1</li>
                      <li>• Component failures that prevent proper function</li>
                    </ul>
                    <h4 className="font-semibold text-text-primary mb-2">Repair Timeline:</h4>
                    <p className="text-text-secondary text-sm">
                      Repairs completed within 30 days, or longer if special-order materials are required.
                    </p>
                  </CardContent>
                </Card>

                {/* Years 2-5 - Structural */}
                <Card className="border-2 border-primary/20">
                  <CardHeader className="bg-primary/5">
                    <div className="flex items-center gap-3">
                      <Home className="h-8 w-8 text-primary" />
                      <div>
                        <CardTitle>Years 2-5: Structural Limited Warranty</CardTitle>
                        <p className="text-sm text-text-muted mt-1">Months 13-60</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <p className="text-text-secondary mb-4">
                      Extended protection for structural components, building envelope, and major systems.
                    </p>
                    <h4 className="font-semibold text-text-primary mb-2">Structural Components:</h4>
                    <ul className="space-y-1 text-text-secondary text-sm mb-3">
                      <li>• Foundation systems (footings, walls, slabs)</li>
                      <li>• Load-bearing elements (beams, columns, headers)</li>
                      <li>• Roof and floor framing</li>
                      <li>• Structural connections and fasteners</li>
                    </ul>
                    <h4 className="font-semibold text-text-primary mb-2">Building Envelope (Water Intrusion):</h4>
                    <ul className="space-y-1 text-text-secondary text-sm mb-3">
                      <li>• Roofing system installation</li>
                      <li>• Exterior wall waterproofing</li>
                      <li>• Window and door installation</li>
                      <li>• Foundation waterproofing</li>
                    </ul>
                    <h4 className="font-semibold text-text-primary mb-2">Major Systems:</h4>
                    <ul className="space-y-1 text-text-secondary text-sm">
                      <li>• Plumbing: supply lines, drain/waste/vent lines</li>
                      <li>• Electrical: main panel, branch circuits, grounding</li>
                      <li>• HVAC: ductwork installation, equipment connections</li>
                    </ul>
                  </CardContent>
                </Card>
              </div>

              {/* Warranty Process Cards */}
              <div className="grid md:grid-cols-3 gap-8 mb-12">
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <Clock className="h-8 w-8 text-primary" />
                      <CardTitle>Warranty Start Date</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-text-secondary mb-4">
                      Both warranty periods begin on the date of Substantial Completion as documented by our written
                      certificate, or the date you take occupancy of the completed work—whichever occurs first.
                    </p>
                    <p className="text-sm text-text-muted">
                      Full warranty documentation is provided at project closeout.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 text-primary" />
                      <CardTitle>How to File a Claim</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ol className="space-y-2 text-text-secondary text-sm">
                      <li>
                        <span className="font-medium">1.</span> Submit claim via this page or email{' '}
                        <a href="mailto:alex@lavacagc.com" className="text-primary hover:underline">
                          alex@lavacagc.com
                        </a>
                      </li>
                      <li>
                        <span className="font-medium">2.</span> We acknowledge within 3 business days
                      </li>
                      <li>
                        <span className="font-medium">3.</span> Inspection scheduled within 14 business days
                      </li>
                      <li>
                        <span className="font-medium">4.</span> Repair plan provided within 5 business days of inspection
                      </li>
                    </ol>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <Wrench className="h-8 w-8 text-primary" />
                      <CardTitle>Required Information</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-text-secondary text-sm">
                      <li>• Your name and project address</li>
                      <li>• Date of Substantial Completion</li>
                      <li>• Detailed description of the issue</li>
                      <li>• Date defect was first observed</li>
                      <li>• Photos documenting the defect</li>
                      <li>• Contact information for scheduling</li>
                    </ul>
                  </CardContent>
                </Card>
              </div>

              {/* Emergency Claims */}
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-6 mb-12">
                <div className="flex items-start gap-4">
                  <Phone className="h-8 w-8 text-amber-600 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary mb-2">Emergency Warranty Issues</h3>
                    <p className="text-text-secondary mb-3">
                      For issues posing immediate risk to health, safety, or property—such as active water intrusion,
                      electrical hazards, or structural failure:
                    </p>
                    <ul className="space-y-2 text-text-secondary text-sm">
                      <li>
                        • <strong>Call immediately:</strong>{' '}
                        <a href="tel:2012124917" className="text-primary font-semibold hover:underline">
                          (201) 212-4917
                        </a>
                      </li>
                      <li>• We respond within 24 hours to assess and address emergencies</li>
                      <li>
                        • You may take reasonable emergency measures to prevent further damage; costs may be
                        reimbursed if the issue is a covered warranty claim
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Claim Submission Timelines */}
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-12">
                <h3 className="text-lg font-semibold text-text-primary mb-3">Claim Submission Timelines</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium text-text-primary mb-2">Year 1 Claims</h4>
                    <p className="text-text-secondary text-sm">
                      Submit within <strong>7 days</strong> of discovering the alleged defect.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-text-primary mb-2">Years 2-5 Claims</h4>
                    <p className="text-text-secondary text-sm">
                      Submit within <strong>14 days</strong> of discovering the alleged defect.
                    </p>
                  </div>
                </div>
                <p className="text-text-muted text-sm mt-4">
                  Late notice does not void the warranty but may affect our ability to investigate and remediate the
                  issue. You remain responsible for mitigating further damage regardless of notice timing.
                </p>
              </div>

              {/* Exclusions Section */}
              <div className="bg-background-secondary rounded-lg p-8">
                <h2 className="text-2xl font-bold text-text-primary mb-6">Important Warranty Information</h2>
                <div className="grid md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                      Year 1 Exclusions
                    </h3>
                    <ul className="space-y-2 text-text-secondary text-sm">
                      <li>• Damage caused by client, family, guests, tenants, or other contractors</li>
                      <li>• Client-supplied materials (installation workmanship remains covered)</li>
                      <li>• Normal wear and tear, including minor shrinkage cracks and nail pops</li>
                      <li>• Damage from Force Majeure events (storms, floods, etc.)</li>
                      <li>• Failure to follow manufacturer maintenance instructions</li>
                      <li>• Modifications made by others without our prior approval</li>
                      <li>• Cosmetic variations in natural materials (wood grain, stone veining)</li>
                      <li>• Appliances and fixtures with separate manufacturer warranties</li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                      Not Covered in Years 2-5
                    </h3>
                    <ul className="space-y-2 text-text-secondary text-sm">
                      <li>• Paint, stain, and other finishes (interior and exterior)</li>
                      <li>• Caulking, sealants, and grout</li>
                      <li>• Minor cracks from normal settling (less than 1/4 inch)</li>
                      <li>• Drywall nail pops and minor drywall cracks</li>
                      <li>• Flooring (hardwood, tile, carpet, vinyl) except structural subfloor</li>
                      <li>• Cabinets, countertops, and millwork</li>
                      <li>• Fixtures (plumbing, lighting, hardware)</li>
                      <li>• Appliances (covered by manufacturer warranty)</li>
                      <li>• Landscaping, grading, and irrigation systems</li>
                      <li>• Decks and patios (cosmetic issues; structural failures remain covered)</li>
                      <li>• Garage doors and openers</li>
                    </ul>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-border">
                  <h3 className="text-lg font-semibold text-text-primary mb-3">To Maintain Your Warranty</h3>
                  <ul className="space-y-2 text-text-secondary text-sm">
                    <li>• Follow manufacturer instructions and recommendations</li>
                    <li>• Maintain the work according to good industry practice</li>
                    <li>• Perform routine maintenance: clean gutters, maintain caulk and sealants, replace HVAC filters</li>
                    <li>• Follow written care and maintenance instructions provided at project closeout</li>
                    <li>• Address minor issues before they become major problems</li>
                    <li>• Contact us before having others make repairs to warranted work</li>
                  </ul>
                </div>

                <div className="mt-8 pt-6 border-t border-border">
                  <h3 className="text-lg font-semibold text-text-primary mb-3">Manufacturer Warranties</h3>
                  <p className="text-text-secondary text-sm">
                    Manufacturer warranties for appliances, fixtures, equipment, and materials pass directly to you.
                    We provide all manufacturer warranty documentation at project closeout. We assist with manufacturer
                    warranty claims at no charge during Year 1.
                  </p>
                </div>

                <div className="mt-8 pt-6 border-t border-border">
                  <h3 className="text-lg font-semibold text-text-primary mb-3">Your Consumer Rights</h3>
                  <p className="text-text-secondary text-sm">
                    Nothing in our warranty limits your rights under the New Jersey Consumer Fraud Act, the New Jersey
                    Home Improvement Practices Act, or any other applicable consumer protection law. This warranty
                    provides the minimum remedy we offer but does not limit any additional remedies available to you
                    under applicable law.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Warranty Claim Form Section */}
        <section className="py-8 md:py-16 bg-background-accent">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-text-primary mb-6">Submit a Warranty Claim</h2>
              <p className="text-xl text-text-secondary max-w-3xl mx-auto">
                Experiencing an issue? Complete the form below with details and photos to help us assess and resolve
                it quickly. We acknowledge all claims within 3 business days.
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
