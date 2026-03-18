import { Card } from "@/components/ui/card";
import { MapPin, CheckCircle2, Phone, FileText, Clock, Building2, ExternalLink, HelpCircle, ChevronDown } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOSchema from "@/components/SEOSchema";
import LocalSEOSchema from "@/components/LocalSEOSchema";
import GoogleMaps from "@/components/GoogleMaps";
import NAPInfo from "@/components/NAPInfo";
import CanonicalUrl from "@/components/CanonicalUrl";
import Breadcrumb from "@/components/Breadcrumb";
import CallTrackingWrapper from "@/components/CallTrackingWrapper";
import { CityHeroButtons, CityServiceCard, CityCTAButtons } from "@/components/CityLandingClient";
import PageViewTracker from "@/components/PageViewTracker";
import { getLocationBySlug, getLocationMetaTitle, getLocationMetaDescription, getAllLocations } from "@/data/locationData";
import { getServerSupabaseClient } from "@/lib/supabase-server";
import { notFound } from "next/navigation";
import type { Metadata } from 'next';
import Link from "next/link";

// Fallback valid cities (used if DB fetch fails)
const FALLBACK_CITIES = [
  'alpine', 'bloomfield', 'caldwell', 'clifton', 'essex-fells', 'ho-ho-kus',
  'livingston', 'madison', 'maplewood', 'millburn', 'montclair', 'morristown',
  'parsippany', 'saddle-river', 'short-hills', 'verona', 'west-caldwell', 'west-orange'
];

// Fetch city content from Supabase service_areas table
async function getCityContentFromDB(slug: string): Promise<{
  neighborhoodFeatures: string[];
  expertiseCards: { title: string; description: string }[];
} | null> {
  try {
    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase
      .from('service_areas')
      .select('neighborhood_features, expertise_cards')
      .eq('slug', slug)
      .single();
    
    if (error || !data) return null;
    
    const features = Array.isArray(data.neighborhood_features) ? data.neighborhood_features as string[] : [];
    const cards = Array.isArray(data.expertise_cards) ? data.expertise_cards as { title: string; description: string }[] : [];
    
    if (features.length === 0 && cards.length === 0) return null;
    
    return { neighborhoodFeatures: features, expertiseCards: cards };
  } catch {
    return null;
  }
}

// Fetch all valid city slugs from DB
async function getValidCitySlugs(): Promise<string[]> {
  try {
    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase
      .from('service_areas')
      .select('slug')
      .eq('active', true)
      .not('slug', 'is', null);
    
    if (error || !data || data.length === 0) return FALLBACK_CITIES;
    
    return data.map(row => row.slug).filter((s): s is string => s !== null);
  } catch {
    return FALLBACK_CITIES;
  }
}

// Default content fallback when DB returns empty
const DEFAULT_CONTENT = {
  neighborhoodFeatures: [
    "Established residential community",
    "Quality construction standards",
    "Growing property values",
    "Family-oriented neighborhood",
    "Convenient local amenities"
  ],
  expertiseCards: [
    {
      title: "Local Expertise",
      description: "Deep understanding of local building codes, permit requirements, and neighborhood standards for successful renovations."
    },
    {
      title: "Quality Craftsmanship",
      description: "Premium materials and skilled craftsmanship that meet the high standards expected in your community."
    },
    {
      title: "Investment Value",
      description: "Strategic renovations designed to maximize property value and provide excellent return on investment."
    }
  ]
};

interface CityPageProps {
  params: Promise<{
    city: string;
  }>;
}

// Generate static params from DB + fallback
export async function generateStaticParams() {
  const slugs = await getValidCitySlugs();
  // Merge with static locationData slugs so pages with full data always build
  const allLocations = getAllLocations();
  const staticSlugs = allLocations.map(l => l.slug);
  const merged = [...new Set([...slugs, ...staticSlugs])];
  return merged.map((city) => ({ city }));
}

// Generate metadata for each city page
export async function generateMetadata({ params }: CityPageProps): Promise<Metadata> {
  const { city } = await params;

  const locationData = getLocationBySlug(city);

  if (!locationData) {
    return {
      title: 'Page Not Found'
    };
  }

  return {
    title: getLocationMetaTitle(city),
    description: getLocationMetaDescription(city),
    alternates: {
      canonical: `https://www.lavacagc.com/locations/${city}`,
    },
    openGraph: {
      title: `Home Remodeling Contractor in ${locationData.name}, NJ | La Vaca General Contractors`,
      description: getLocationMetaDescription(city),
      url: `https://www.lavacagc.com/locations/${city}`,
    },
  };
}

export default async function CityLandingPage({ params }: CityPageProps) {
  const { city } = await params;

  const locationData = getLocationBySlug(city);

  if (!locationData) {
    notFound();
  }

  // Fetch neighborhood/expertise content from Supabase, fall back to defaults
  const dbContent = await getCityContentFromDB(city);
  const cityContent = dbContent || DEFAULT_CONTENT;

  const services = [
    {
      title: `Kitchen Remodeling in ${locationData.name}`,
      description: `Custom kitchen designs for ${locationData.name}'s luxury homes`,
      features: [`Custom Cabinetry for ${locationData.name} Homes`, "Premium Granite & Quartz", "High-End Appliance Integration"],
      link: `/locations/${city}/services/kitchen-remodeling`
    },
    {
      title: `Bathroom Renovations in ${locationData.name}`,
      description: `Spa-like bathroom retreats for ${locationData.name} residences`,
      features: ["Walk-in Showers & Soaking Tubs", "Custom Vanities & Storage", "Heated Floors & Premium Fixtures"],
      link: `/locations/${city}/services/bathroom-renovation`
    },
    {
      title: `Basement Finishing in ${locationData.name} NJ`,
      description: `Transform your ${locationData.name} basement into luxury living space`,
      features: ["Home Theaters & Wine Cellars", "Home Offices & Study Areas", "Guest Suites & Entertainment Areas"],
      link: `/locations/${city}/services/basement-finishing`
    },
    {
      title: `Home Additions - ${locationData.name} Estates`,
      description: `Expand your ${locationData.name} estate while maintaining architectural integrity`,
      features: ["Master Suite Additions", "Second Story Expansions", "Sunrooms & Family Room Extensions"],
      link: `/locations/${city}/services/home-additions`
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <SEOSchema
        title={`Home Remodeling Contractor in ${locationData.name}, NJ`}
        description={getLocationMetaDescription(city)}
        type="LocalBusiness"
      />
      <LocalSEOSchema location={locationData} />
      <CanonicalUrl customUrl={`https://www.lavacagc.com/locations/${city}`} />
      <PageViewTracker eventName="location_page_view" eventData={{ content_name: locationData.name, content_category: 'Location Page', content_type: 'location', city: locationData.name, county: locationData.county, state: 'NJ' }} />

      {/* LocalBusiness JSON-LD Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "HomeAndConstructionBusiness",
            "name": "La Vaca General Contractors",
            "description": getLocationMetaDescription(city),
            "url": `https://www.lavacagc.com/locations/${city}`,
            "telephone": "(201) 212-4917",
            "email": "alex@vacamoo.com",
            "areaServed": {
              "@type": "City",
              "name": `${locationData.name}, NJ`
            },
            "address": {
              "@type": "PostalAddress",
              "addressLocality": locationData.name,
              "addressRegion": "NJ",
              "postalCode": locationData.zipCodes[0],
              "addressCountry": "US"
            },
            "aggregateRating": {
              "@type": "AggregateRating",
              "ratingValue": "5.0",
              "reviewCount": "12",
              "bestRating": "5",
              "worstRating": "1"
            },
            "priceRange": "$$",
            "image": "https://www.lavacagc.com/og-image.jpg",
            "sameAs": [
              "https://www.facebook.com/lavacagc",
              "https://www.instagram.com/lavacagc"
            ],
            "hasOfferCatalog": {
              "@type": "OfferCatalog",
              "name": "Home Remodeling Services",
              "itemListElement": [
                { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Kitchen Remodeling" } },
                { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Bathroom Renovation" } },
                { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Basement Finishing" } },
                { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Home Additions" } }
              ]
            }
          })
        }}
      />

      {/* FAQ JSON-LD Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": locationData.faqs.map(faq => ({
              "@type": "Question",
              "name": faq.question,
              "acceptedAnswer": {
                "@type": "Answer",
                "text": faq.answer
              }
            }))
          })
        }}
      />

      <Header />

      <main>
        {/* Breadcrumb Navigation */}
        <section className="bg-background-subtle py-4">
          <div className="container mx-auto px-4">
            <Breadcrumb />
          </div>
        </section>

        {/* Hero Section */}
        <section className="relative bg-gradient-to-br from-background via-background to-muted py-20 lg:py-32">
          <div className="container mx-auto px-4">
            <div className="text-center max-w-4xl mx-auto">
              <div className="flex items-center justify-center mb-6">
                <MapPin className="h-8 w-8 text-primary mr-3" />
                <span className="text-xl text-secondary font-semibold">{locationData.name}, NJ</span>
              </div>
              <h1 className="text-4xl md:text-6xl font-bold text-text-primary mb-6 leading-tight">
                Premium Home Remodeling Contractor Near Me
                <span className="block text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text">
                  {locationData.name}, {locationData.county}, NJ
                </span>
              </h1>
              <p className="text-xl text-text-secondary mb-8 leading-relaxed max-w-3xl mx-auto">
                Looking for &quot;contractors near me&quot; in {locationData.name}, NJ? La Vaca specializes in luxury renovations for {locationData.name}&apos;s prestigious homes in {locationData.county}.
                <span className="font-semibold text-secondary"> Licensed {locationData.name} contractor serving {locationData.zipCodes?.[0] || ''} and surrounding areas.</span>
              </p>
              <CityHeroButtons cityName={locationData.name} />
            </div>
          </div>
        </section>

        {/* Services Section */}
        <section className="py-20 bg-background">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">
                Our {locationData.name} Remodeling Services
              </h2>
              <p className="text-xl text-text-secondary max-w-3xl mx-auto">
                Comprehensive luxury renovation solutions tailored for {locationData.name} homeowners
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              {services.map((service, index) => (
                <CityServiceCard key={index} service={service} />
              ))}
            </div>
          </div>
        </section>

        {/* Neighborhood Expertise Section */}
        <section className="py-20 bg-background">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-4xl font-bold text-text-primary mb-6">
                  {locationData.name} Neighborhood
                  <span className="text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text"> Expertise</span>
                </h2>
                <p className="text-xl text-text-secondary mb-8 leading-relaxed">
                  {locationData.name}&apos;s luxury real estate market demands the highest standards of craftsmanship and design.
                  We understand the unique requirements of renovating in this prestigious community.
                </p>
                <div className="space-y-4">
                  {cityContent.neighborhoodFeatures.map((feature, index) => (
                    <div key={index} className="flex items-center">
                      <div className="w-2 h-2 bg-primary rounded-full mr-4 flex-shrink-0"></div>
                      <span className="text-text-secondary">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-6">
                {cityContent.expertiseCards.map((card, index) => (
                  <Card key={index} className="p-6 bg-gradient-to-r from-primary/5 to-accent-sunset/5 border-primary/20">
                    <h3 className="text-xl font-bold text-text-primary mb-3">{card.title}</h3>
                    <p className="text-text-secondary">{card.description}</p>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Guide Section */}
        <section className="py-16 bg-muted/50">
          <div className="container mx-auto px-4">
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold text-text-primary mb-4">
                  {locationData.name} Remodeling Investment Guide
                </h2>
                <p className="text-lg text-text-secondary max-w-3xl mx-auto">
                  Typical project costs for {locationData.name} homeowners. Final pricing depends on scope, materials, and complexity.
                </p>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="text-center p-6">
                  <h3 className="font-bold text-text-primary mb-2">Kitchen Remodeling</h3>
                  <div className="text-2xl font-bold text-primary mb-2">$55K - $150K+</div>
                  <p className="text-sm text-text-secondary">Custom cabinetry, premium countertops, appliances</p>
                </Card>
                <Card className="text-center p-6">
                  <h3 className="font-bold text-text-primary mb-2">Bathroom Renovation</h3>
                  <div className="text-2xl font-bold text-primary mb-2">$25K - $110K+</div>
                  <p className="text-sm text-text-secondary">Spa features, heated floors, luxury fixtures</p>
                </Card>
                <Card className="text-center p-6">
                  <h3 className="font-bold text-text-primary mb-2">Basement Finishing</h3>
                  <div className="text-2xl font-bold text-primary mb-2">$40K - $120K+</div>
                  <p className="text-sm text-text-secondary">Entertainment spaces, home theaters, wet bars</p>
                </Card>
                <Card className="text-center p-6">
                  <h3 className="font-bold text-text-primary mb-2">Home Additions</h3>
                  <div className="text-2xl font-bold text-primary mb-2">$80K - $300K+</div>
                  <p className="text-sm text-text-secondary">Master suites, second stories, extensions</p>
                </Card>
              </div>

              <div className="text-center mt-8">
                <p className="text-sm text-text-muted mb-4">
                  * Prices reflect typical {locationData.county} luxury project ranges. Get a personalized estimate for your specific project.
                </p>
                <Link
                  href="/project-calculator"
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button text-white h-10 px-6"
                >
                  Get Your Free Estimate
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Permit Information Section */}
        <section className="py-16 bg-background">
          <div className="container mx-auto px-4">
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold text-text-primary mb-4">
                  {locationData.name} Building Permits & Requirements
                </h2>
                <p className="text-lg text-text-secondary max-w-3xl mx-auto">
                  We handle all permit applications and inspections for your {locationData.name} renovation project. Here&apos;s what you need to know about local requirements.
                </p>
              </div>

              <div className="grid lg:grid-cols-2 gap-8">
                {/* Contact Info Card */}
                <Card className="p-6">
                  <div className="flex items-start gap-4 mb-6">
                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                      <Building2 className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-bold text-text-primary text-lg mb-1">{locationData.permitInfo.department}</h3>
                      <p className="text-text-secondary text-sm">{locationData.permitInfo.address}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Phone className="h-5 w-5 text-primary" />
                      <CallTrackingWrapper href={`tel:${locationData.permitInfo.phone.replace(/[^0-9]/g, '')}`} className="text-primary hover:underline font-medium">
                        {locationData.permitInfo.phone}
                      </CallTrackingWrapper>
                    </div>

                    <div className="flex items-center gap-3">
                      <Clock className="h-5 w-5 text-primary" />
                      <span className="text-text-secondary">Processing Time: <span className="font-medium text-text-primary">{locationData.permitInfo.processingTime}</span></span>
                    </div>

                    {locationData.permitInfo.portalUrl && (
                      <div className="flex items-center gap-3">
                        <ExternalLink className="h-5 w-5 text-primary" />
                        <a href={locationData.permitInfo.portalUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                          Online Permit Portal
                        </a>
                      </div>
                    )}
                  </div>

                  {locationData.permitInfo.notes && (
                    <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm text-text-secondary italic">{locationData.permitInfo.notes}</p>
                    </div>
                  )}
                </Card>

                {/* Requirements Card */}
                <Card className="p-6">
                  <div className="flex items-start gap-4 mb-6">
                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-bold text-text-primary text-lg mb-1">Typical Permit Requirements</h3>
                      <p className="text-text-secondary text-sm">Common permits needed for {locationData.name} renovations</p>
                    </div>
                  </div>

                  <ul className="space-y-3">
                    {locationData.permitInfo.requirements.map((requirement, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-text-secondary">{requirement}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6 p-4 bg-gradient-to-r from-primary/5 to-accent-sunset/5 rounded-lg border border-primary/20">
                    <p className="text-sm text-text-primary font-medium">
                      Don&apos;t worry about permits – we handle everything from application to final inspection!
                    </p>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 bg-muted/50">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-12">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <HelpCircle className="h-8 w-8 text-primary" />
                  <h2 className="text-3xl font-bold text-text-primary">
                    {locationData.name} Renovation FAQs
                  </h2>
                </div>
                <p className="text-lg text-text-secondary">
                  Common questions about home remodeling in {locationData.name}, NJ
                </p>
              </div>

              <div className="space-y-4">
                {locationData.faqs.map((faq, index) => (
                  <details
                    key={index}
                    className="group bg-background rounded-lg border border-border overflow-hidden"
                  >
                    <summary className="flex items-center justify-between cursor-pointer p-6 hover:bg-muted/50 transition-colors">
                      <span className="font-semibold text-text-primary pr-4">{faq.question}</span>
                      <ChevronDown className="h-5 w-5 text-primary flex-shrink-0 transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="px-6 pb-6 text-text-secondary leading-relaxed">
                      {faq.answer}
                    </div>
                  </details>
                ))}
              </div>

              <div className="text-center mt-8">
                <p className="text-text-secondary mb-4">
                  Have more questions about your {locationData.name} renovation project?
                </p>
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button text-white h-10 px-6"
                >
                  Contact Us for Answers
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Nearby Service Areas Section */}
        <section className="py-16 bg-background-subtle">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-3xl font-bold text-text-primary mb-4">
                Also Serving Nearby Communities
              </h2>
              <p className="text-lg text-text-secondary mb-8">
                In addition to {locationData.name}, we provide premium home remodeling services throughout {locationData.county} and surrounding areas.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                {locationData.nearbyAreas.map((area, index) => {
                  // Convert area name to slug format
                  const slug = area.toLowerCase().replace(/\s+/g, '-');
                  // Check if this area is one we have a page for
                  const hasPage = FALLBACK_CITIES.includes(slug);

                  return hasPage ? (
                    <Link
                      key={index}
                      href={`/locations/${slug}`}
                      className="inline-flex items-center px-4 py-2 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors font-medium"
                    >
                      {area}, NJ
                    </Link>
                  ) : (
                    <span
                      key={index}
                      className="inline-flex items-center px-4 py-2 rounded-full bg-muted text-text-secondary font-medium"
                    >
                      {area}, NJ
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Google Maps & Contact Section */}
        <section className="py-16 bg-muted">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-2 gap-12">
              <div>
                <GoogleMaps location={locationData} />
              </div>
              <div>
                <NAPInfo />
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section id="estimate" className="py-16 bg-secondary text-secondary-foreground">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Ready to Transform Your {locationData.name} Home?
            </h2>
            <p className="text-xl mb-8 max-w-2xl mx-auto opacity-90">
              Schedule your estimate in 2 minutes for your {locationData.name} luxury renovation project.
            </p>
            <CityCTAButtons />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
