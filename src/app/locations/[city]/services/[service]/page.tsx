import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Phone, CheckCircle2, Star, Award, Clock } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOSchema from "@/components/SEOSchema";
import LocalSEOSchema from "@/components/LocalSEOSchema";
import GoogleMaps from "@/components/GoogleMaps";
import NAPInfo from "@/components/NAPInfo";
import CanonicalUrl from "@/components/CanonicalUrl";
import Breadcrumb from "@/components/Breadcrumb";
import { GetEstimateButton, CTAButton } from "@/components/LocationServiceClient";
import { getLocationBySlug, getLocationMetaTitle, getLocationMetaDescription } from "@/data/locationData";
import { notFound } from "next/navigation";
import type { Metadata } from 'next';

// Define valid cities and services
const VALID_CITIES = [
  'alpine', 'bloomfield', 'caldwell', 'clifton', 'essex-fells', 'ho-ho-kus',
  'livingston', 'madison', 'maplewood', 'millburn', 'montclair', 'morristown',
  'parsippany', 'saddle-river', 'short-hills', 'verona', 'west-caldwell', 'west-orange'
];

const SERVICES = {
  'kitchen-remodeling': {
    title: 'Kitchen Remodeling',
    slug: 'kitchen-remodeling',
    description: 'Transform your kitchen with custom cabinetry, premium countertops, and modern appliances.',
    features: [
      "Custom Cabinetry Design",
      "Premium Countertops",
      "Modern Appliance Installation",
      "Kitchen Island Design",
      "Luxury Finishes",
      "Energy-Efficient Lighting"
    ]
  },
  'bathroom-renovation': {
    title: 'Bathroom Renovation',
    slug: 'bathroom-renovation',
    description: 'Luxury bathroom remodeling with spa-like features and premium fixtures.',
    features: [
      "Custom Tile Work",
      "Walk-In Showers",
      "Luxury Soaking Tubs",
      "Heated Floors",
      "Modern Vanities",
      "Designer Fixtures"
    ]
  },
  'basement-finishing': {
    title: 'Basement Finishing',
    slug: 'basement-finishing',
    description: 'Convert your basement into functional living space with professional finishing.',
    features: [
      "Waterproofing Solutions",
      "Custom Built-Ins",
      "Home Theater Setup",
      "Wet Bar Installation",
      "Egress Windows",
      "Climate Control"
    ]
  },
  'home-additions': {
    title: 'Home Additions',
    slug: 'home-additions',
    description: 'Expand your home with seamlessly integrated additions and extensions.',
    features: [
      "Second Story Additions",
      "Sunroom Construction",
      "In-Law Suites",
      "Garage Additions",
      "Room Extensions",
      "Structural Engineering"
    ]
  }
};

interface LocationServicePageProps {
  params: Promise<{
    city: string;
    service: string;
  }>;
}

// Generate static params for all 48 combinations (12 cities × 4 services)
export async function generateStaticParams() {
  const params = [];

  for (const city of VALID_CITIES) {
    for (const service of Object.keys(SERVICES)) {
      params.push({
        city,
        service
      });
    }
  }

  return params;
}

// Generate metadata for each page
export async function generateMetadata({ params }: LocationServicePageProps): Promise<Metadata> {
  const { city, service } = await params;

  if (!VALID_CITIES.includes(city) || !SERVICES[service as keyof typeof SERVICES]) {
    return {
      title: 'Page Not Found'
    };
  }

  const locationData = getLocationBySlug(city);
  const serviceData = SERVICES[service as keyof typeof SERVICES];

  if (!locationData) {
    return {
      title: 'Page Not Found'
    };
  }

  return {
    title: getLocationMetaTitle(city, service),
    description: getLocationMetaDescription(city, service),
    alternates: {
      canonical: `https://www.lavacagc.com/locations/${city}/services/${service}`,
    },
    openGraph: {
      title: `${serviceData.title} in ${locationData.name}, NJ | La Vaca General Contractors`,
      description: getLocationMetaDescription(city, service),
      url: `https://www.lavacagc.com/locations/${city}/services/${service}`,
    },
  };
}

export default async function LocationServicePage({ params }: LocationServicePageProps) {
  const { city, service } = await params;

  // Validate city and service
  if (!VALID_CITIES.includes(city) || !SERVICES[service as keyof typeof SERVICES]) {
    notFound();
  }

  const locationData = getLocationBySlug(city);
  const serviceData = SERVICES[service as keyof typeof SERVICES];

  if (!locationData) {
    notFound();
  }

  const processSteps = [
    {
      step: "1",
      title: "Design Consultation",
      description: `In-home assessment of your ${locationData.name} space and lifestyle needs`
    },
    {
      step: "2",
      title: "Custom Planning",
      description: "Detailed plans and 3D renderings tailored to your vision"
    },
    {
      step: "3",
      title: "Professional Execution",
      description: "Expert craftsmen bring your dream space to life"
    },
    {
      step: "4",
      title: "Final Walkthrough",
      description: "Quality inspection and your complete satisfaction"
    }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEOSchema
        title={`${serviceData.title} in ${locationData.name}, NJ | La Vaca General Contractors`}
        description={getLocationMetaDescription(city, service)}
        type="LocalBusiness"
      />
      <LocalSEOSchema
        location={locationData}
        service={service}
      />
      <CanonicalUrl customUrl={`https://www.lavacagc.com/locations/${city}/services/${service}`} />

      <Header />

      <main className="flex-grow">
        {/* Breadcrumb */}
        <section className="bg-background-subtle py-4">
          <div className="container mx-auto px-4">
            <Breadcrumb />
          </div>
        </section>

        {/* Hero Section */}
        <section className="py-12 md:py-20 bg-gradient-to-br from-background-primary via-background-secondary to-background-accent">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <Badge className="mb-4" variant="secondary">
                <MapPin className="w-4 h-4 mr-1" />
                {locationData.name}, {locationData.county}
              </Badge>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-text-primary mb-6">
                {serviceData.title} in {locationData.name}
              </h1>
              <p className="text-xl text-text-secondary mb-8 leading-relaxed">
                {serviceData.description} Expert craftsmanship serving {locationData.name} and surrounding areas.
              </p>
              <GetEstimateButton />
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-12 md:py-16 bg-background">
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-3xl md:text-4xl font-bold text-center text-text-primary mb-12">
                What's Included
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {serviceData.features.map((feature, index) => (
                  <Card key={index}>
                    <CardContent className="p-6">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="w-6 h-6 text-primary flex-shrink-0 mt-1" />
                        <p className="text-text-primary font-medium">{feature}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Process Steps */}
        <section className="py-12 md:py-16 bg-background-secondary">
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-3xl md:text-4xl font-bold text-center text-text-primary mb-12">
                Our Process
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                {processSteps.map((step) => (
                  <div key={step.step} className="text-center">
                    <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
                      {step.step}
                    </div>
                    <h3 className="text-xl font-bold text-text-primary mb-2">{step.title}</h3>
                    <p className="text-text-secondary">{step.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Location Info */}
        <section className="py-12 md:py-16 bg-background">
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-3xl md:text-4xl font-bold text-center text-text-primary mb-8">
                Proudly Serving {locationData.name}
              </h2>
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <GoogleMaps location={locationData} />
                </div>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-bold text-text-primary mb-3">About {locationData.name}</h3>
                    <p className="text-text-secondary">{locationData.description}</p>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-text-primary mb-3">Nearby Service Areas</h3>
                    <div className="flex flex-wrap gap-2">
                      {locationData.nearbyAreas.map((area, index) => {
                        // Convert area name to slug format
                        const slug = area.toLowerCase().replace(/\s+/g, '-');
                        // Check if this area is one we have a page for
                        const hasPage = VALID_CITIES.includes(slug);

                        return hasPage ? (
                          <a
                            key={index}
                            href={`/locations/${slug}/services/${service}`}
                            className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors text-sm font-medium"
                          >
                            {area}
                          </a>
                        ) : (
                          <Badge key={index} variant="secondary">{area}</Badge>
                        );
                      })}
                    </div>
                  </div>
                  <NAPInfo />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-12 md:py-16 bg-gradient-to-br from-primary to-accent-sunset text-white">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Ready to Transform Your {locationData.name} Home?
            </h2>
            <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
              Get a free, no-obligation estimate for your {serviceData.title.toLowerCase()} project today.
            </p>
            <CTAButton />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
