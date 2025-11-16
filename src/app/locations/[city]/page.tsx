import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, CheckCircle2 } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOSchema from "@/components/SEOSchema";
import LocalSEOSchema from "@/components/LocalSEOSchema";
import GoogleMaps from "@/components/GoogleMaps";
import NAPInfo from "@/components/NAPInfo";
import CanonicalUrl from "@/components/CanonicalUrl";
import Breadcrumb from "@/components/Breadcrumb";
import { CityHeroButtons, CityServiceCard, CityCTAButtons } from "@/components/CityLandingClient";
import { getLocationBySlug, getLocationMetaTitle, getLocationMetaDescription } from "@/data/locationData";
import { notFound } from "next/navigation";
import type { Metadata } from 'next';
import Link from "next/link";

// Define valid cities
const VALID_CITIES = [
  'alpine', 'caldwell', 'essex-fells', 'ho-ho-kus',
  'livingston', 'millburn', 'montclair', 'morristown',
  'saddle-river', 'short-hills', 'verona', 'west-orange'
];

// City-specific content
const CITY_CONTENT: Record<string, {
  neighborhoodFeatures: string[];
  expertiseCards: { title: string; description: string }[];
}> = {
  'alpine': {
    neighborhoodFeatures: [
      "Historic estates and modern luxury homes",
      "Strict architectural guidelines",
      "Premium material requirements",
      "High-end finish expectations",
      "Excellent return on investment"
    ],
    expertiseCards: [
      {
        title: "Alpine Estate Expertise",
        description: "Specialized knowledge of Alpine's luxury estate requirements, architectural review boards, and exclusive community standards for high-end renovations."
      },
      {
        title: "Luxury Materials & Finishes",
        description: "Access to the finest imported materials, custom millwork, and premium finishes that meet Alpine's discerning standards and HOA requirements."
      },
      {
        title: "Maximum Investment Returns",
        description: "Strategic renovations designed to maximize property values in Alpine's exclusive $2M+ market, with proven ROI for luxury homeowners."
      }
    ]
  },
  'short-hills': {
    neighborhoodFeatures: [
      "Historic Tudor and Colonial architecture",
      "High property values requiring quality finishes",
      "Strong demand for modern amenities",
      "Excellent school district driving home values",
      "Strict township regulations"
    ],
    expertiseCards: [
      {
        title: "Short Hills Architectural Expertise",
        description: "Deep understanding of Short Hills' diverse architectural styles, from historic Tudors to contemporary designs, ensuring seamless renovations."
      },
      {
        title: "Premium Material Selection",
        description: "Curated selection of high-end materials and finishes that complement Short Hills' luxury market expectations."
      },
      {
        title: "Value-Adding Renovations",
        description: "Strategic improvements that maximize ROI in Short Hills' competitive real estate market, with average home values exceeding $1.5M."
      }
    ]
  },
  'saddle-river': {
    neighborhoodFeatures: [
      "Sprawling estate properties",
      "Equestrian-friendly community",
      "Minimum lot size requirements",
      "Prestigious neighborhood standards",
      "Private, secluded settings"
    ],
    expertiseCards: [
      {
        title: "Saddle River Estate Specialists",
        description: "Expert knowledge of Saddle River's unique estate requirements and zoning regulations for luxury property renovations."
      },
      {
        title: "Custom Estate Features",
        description: "Specialized in high-end amenities including home theaters, wine cellars, and indoor pools that Saddle River homeowners expect."
      },
      {
        title: "Privacy-Focused Design",
        description: "Renovations designed to enhance privacy and exclusivity while maintaining the natural beauty of Saddle River properties."
      }
    ]
  }
};

// Default content for cities without specific data
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

// Generate static params for all 12 cities
export async function generateStaticParams() {
  return VALID_CITIES.map((city) => ({
    city
  }));
}

// Generate metadata for each city page
export async function generateMetadata({ params }: CityPageProps): Promise<Metadata> {
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
    title: getLocationMetaTitle(city),
    description: getLocationMetaDescription(city),
    openGraph: {
      title: `Home Remodeling Contractor in ${locationData.name}, NJ | La Vaca General Contractors`,
      description: getLocationMetaDescription(city),
      url: `https://www.lavacagc.com/locations/${city}`,
    },
  };
}

export default async function CityLandingPage({ params }: CityPageProps) {
  const { city } = await params;

  // Validate city
  if (!VALID_CITIES.includes(city)) {
    notFound();
  }

  const locationData = getLocationBySlug(city);

  if (!locationData) {
    notFound();
  }

  const cityContent = CITY_CONTENT[city] || DEFAULT_CONTENT;

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
                Looking for "contractors near me" in {locationData.name}, NJ? La Vaca specializes in luxury renovations for {locationData.name}'s prestigious homes in {locationData.county}.
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
                  {locationData.name}'s luxury real estate market demands the highest standards of craftsmanship and design.
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
