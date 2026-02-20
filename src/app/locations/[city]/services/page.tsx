import { Card, CardContent } from "@/components/ui/card";
import { MapPin, ArrowRight, ChefHat, Bath, Home, PlusSquare, Sparkles } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOSchema from "@/components/SEOSchema";
import CanonicalUrl from "@/components/CanonicalUrl";
import Breadcrumb from "@/components/Breadcrumb";
import { getLocationBySlug } from "@/data/locationData";
import { notFound } from "next/navigation";
import type { Metadata } from 'next';
import Link from "next/link";

// Define valid cities - must match locations in sitemap.ts
const VALID_CITIES = [
  'alpine', 'bloomfield', 'caldwell', 'clifton', 'essex-fells', 'ho-ho-kus',
  'livingston', 'madison', 'maplewood', 'millburn', 'montclair', 'morristown',
  'parsippany', 'saddle-river', 'short-hills', 'verona', 'west-caldwell', 'west-orange'
];

const SERVICES = [
  {
    slug: 'kitchen-remodeling',
    title: 'Kitchen Remodeling',
    description: 'Transform your kitchen with custom cabinetry, premium countertops, and modern appliances.',
    icon: ChefHat,
    features: ['Custom Cabinetry', 'Premium Countertops', 'Modern Appliances']
  },
  {
    slug: 'bathroom-renovation',
    title: 'Bathroom Renovation',
    description: 'Luxury bathroom remodeling with spa-like features and premium fixtures.',
    icon: Bath,
    features: ['Walk-In Showers', 'Soaking Tubs', 'Heated Floors']
  },
  {
    slug: 'basement-finishing',
    title: 'Basement Finishing',
    description: 'Convert your basement into functional living space with professional finishing.',
    icon: Home,
    features: ['Home Theaters', 'Wet Bars', 'Guest Suites']
  },
  {
    slug: 'home-additions',
    title: 'Home Additions',
    description: 'Expand your home with seamlessly integrated additions and extensions.',
    icon: PlusSquare,
    features: ['Second Stories', 'Sunrooms', 'In-Law Suites']
  },
  {
    slug: 'whole-home-remodeling',
    title: 'Whole Home Remodeling',
    description: 'Complete home transformations with unified design and expert craftsmanship.',
    icon: Sparkles,
    features: ['Full Interior', 'Design-Build', 'Systems Upgrades']
  }
];

interface ServicesPageProps {
  params: Promise<{
    city: string;
  }>;
}

// Generate static params for all cities
export async function generateStaticParams() {
  return VALID_CITIES.map((city) => ({
    city
  }));
}

// Generate metadata for each city's services page
export async function generateMetadata({ params }: ServicesPageProps): Promise<Metadata> {
  const { city } = await params;

  if (!VALID_CITIES.includes(city)) {
    return {
      title: 'Page Not Found'
    };
  }

  const locationData = getLocationBySlug(city);

  if (!locationData) {
    return {
      title: 'Page Not Found'
    };
  }

  return {
    title: `Remodeling Services in ${locationData.name}, NJ | La Vaca General Contractors`,
    description: `Professional home remodeling services in ${locationData.name}, NJ. Kitchen remodeling, bathroom renovation, basement finishing, and home additions. Licensed & insured contractor.`,
    alternates: {
      canonical: `https://www.lavacagc.com/locations/${city}/services`,
    },
    openGraph: {
      title: `Remodeling Services in ${locationData.name}, NJ | La Vaca General Contractors`,
      description: `Professional home remodeling services in ${locationData.name}, NJ.`,
      url: `https://www.lavacagc.com/locations/${city}/services`,
    },
  };
}

export default async function CityServicesPage({ params }: ServicesPageProps) {
  const { city } = await params;

  // Validate city
  if (!VALID_CITIES.includes(city)) {
    notFound();
  }

  const locationData = getLocationBySlug(city);

  if (!locationData) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background">
      <SEOSchema
        title={`Remodeling Services in ${locationData.name}, NJ`}
        description={`Professional home remodeling services in ${locationData.name}, NJ.`}
        type="LocalBusiness"
      />
      <CanonicalUrl customUrl={`https://www.lavacagc.com/locations/${city}/services`} />
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
                Our Services in
                <span className="block text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text">
                  {locationData.name}
                </span>
              </h1>
              <p className="text-xl text-text-secondary mb-8 leading-relaxed max-w-3xl mx-auto">
                Comprehensive home remodeling services tailored for {locationData.name} homeowners.
                From kitchen renovations to home additions, we deliver exceptional craftsmanship.
              </p>
            </div>
          </div>
        </section>

        {/* Services Grid */}
        <section className="py-20 bg-background">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
              {SERVICES.map((service) => {
                const IconComponent = service.icon;
                return (
                  <Link key={service.slug} href={`/locations/${city}/services/${service.slug}`}>
                    <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer group">
                      <CardContent className="p-8">
                        <div className="flex items-start gap-4">
                          <div className="p-3 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                            <IconComponent className="h-8 w-8 text-primary" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                              <h2 className="text-2xl font-bold text-text-primary group-hover:text-primary transition-colors">
                                {service.title}
                              </h2>
                              <ArrowRight className="h-5 w-5 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <p className="text-text-secondary mb-4">
                              {service.description}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {service.features.map((feature) => (
                                <span key={feature} className="text-xs bg-muted px-2 py-1 rounded">
                                  {feature}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* Why Choose Us */}
        <section className="py-16 bg-muted">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-6">
              Why Choose La Vaca in {locationData.name}?
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto mt-12">
              <div>
                <div className="text-4xl font-bold text-primary mb-2">20+</div>
                <p className="text-text-secondary">Years Experience</p>
              </div>
              <div>
                <div className="text-4xl font-bold text-primary mb-2">100%</div>
                <p className="text-text-secondary">5-Star Rating</p>
              </div>
              <div>
                <div className="text-4xl font-bold text-primary mb-2">Licensed</div>
                <p className="text-text-secondary">& Insured</p>
              </div>
              <div>
                <div className="text-4xl font-bold text-primary mb-2">30+</div>
                <p className="text-text-secondary">Happy Clients</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 bg-secondary text-secondary-foreground">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Ready to Start Your {locationData.name} Project?
            </h2>
            <p className="text-xl mb-8 max-w-2xl mx-auto opacity-90">
              Get a free estimate for your home remodeling project today.
            </p>
            <Link
              href="/project-calculator"
              className="inline-flex items-center justify-center px-8 py-4 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors"
            >
              Get Free Estimate
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
