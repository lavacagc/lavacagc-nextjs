import { Card, CardContent } from "@/components/ui/card";
import { MapPin, ArrowRight } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOSchema from "@/components/SEOSchema";
import CanonicalUrl from "@/components/CanonicalUrl";
import Breadcrumb from "@/components/Breadcrumb";
import { getAllLocations } from "@/data/locationData";
import type { Metadata } from 'next';
import Link from "next/link";

export const metadata: Metadata = {
  title: "Service Locations | Home Remodeling in Northern New Jersey | La Vaca",
  description: "La Vaca General Contractors serves Northern New Jersey's most prestigious communities. Kitchen remodeling, bathroom renovation, basement finishing, and home additions in Bergen, Essex, and Morris Counties.",
  openGraph: {
    title: "Service Locations | Home Remodeling in Northern New Jersey | La Vaca",
    description: "La Vaca General Contractors serves Northern New Jersey's most prestigious communities.",
    url: "https://www.lavacagc.com/locations",
  },
  alternates: {
    canonical: "https://www.lavacagc.com/locations",
  },
};

export default function LocationsPage() {
  const locations = getAllLocations();

  // Group locations by county
  const locationsByCounty = locations.reduce((acc, location) => {
    const county = location.county;
    if (!acc[county]) {
      acc[county] = [];
    }
    acc[county].push(location);
    return acc;
  }, {} as Record<string, typeof locations>);

  return (
    <div className="min-h-screen bg-background">
      <SEOSchema
        title="Service Locations | Home Remodeling in Northern New Jersey"
        description="La Vaca General Contractors serves Northern New Jersey's most prestigious communities."
        type="LocalBusiness"
      />
      <CanonicalUrl customUrl="https://www.lavacagc.com/locations" />
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
                <span className="text-xl text-secondary font-semibold">Northern New Jersey</span>
              </div>
              <h1 className="text-4xl md:text-6xl font-bold text-text-primary mb-6 leading-tight">
                Our Service
                <span className="block text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text">
                  Locations
                </span>
              </h1>
              <p className="text-xl text-text-secondary mb-8 leading-relaxed max-w-3xl mx-auto">
                La Vaca General Contractors proudly serves Northern New Jersey&apos;s most prestigious communities.
                From luxury estates in Alpine to historic homes in Morristown, we bring expert craftsmanship to every project.
              </p>
            </div>
          </div>
        </section>

        {/* Locations by County */}
        <section className="py-20 bg-background">
          <div className="container mx-auto px-4">
            {Object.entries(locationsByCounty).map(([county, countyLocations]) => (
              <div key={county} className="mb-16 last:mb-0">
                <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-8">
                  {county}
                </h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {countyLocations.map((location) => (
                    <Link key={location.slug} href={`/locations/${location.slug}`}>
                      <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer group">
                        <CardContent className="p-6">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="text-xl font-bold text-text-primary mb-2 group-hover:text-primary transition-colors">
                                {location.name}
                              </h3>
                              <p className="text-text-secondary text-sm mb-3">
                                {location.description}
                              </p>
                              <div className="flex flex-wrap gap-2 mb-3">
                                {location.zipCodes.map((zip) => (
                                  <span key={zip} className="text-xs bg-muted px-2 py-1 rounded">
                                    {zip}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <ArrowRight className="h-5 w-5 text-primary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 bg-secondary text-secondary-foreground">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Don&apos;t See Your Town?
            </h2>
            <p className="text-xl mb-8 max-w-2xl mx-auto opacity-90">
              We serve many additional communities throughout Northern New Jersey.
              Contact us to discuss your project location.
            </p>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center px-8 py-4 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors"
            >
              Contact Us
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
