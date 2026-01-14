import { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, Clock, Home, Sparkles, Shield, Users } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Whole Home Remodeling Services in Northern NJ | La Vaca General Contractors',
  description:
    'Transform your entire home with La Vaca General Contractors. Complete whole-home renovations in Northern New Jersey including kitchens, bathrooms, living spaces, and more. Licensed, insured, 5-star rated.',
  keywords:
    'whole home remodeling NJ, complete home renovation, full house remodel Northern New Jersey, home transformation, La Vaca General Contractors',
  openGraph: {
    title: 'Whole Home Remodeling | La Vaca GC',
    description:
      'Complete home transformations in Northern NJ. Expert craftsmanship for kitchens, bathrooms, living spaces, and more.',
    type: 'website',
    url: 'https://www.lavacagc.com/services/whole-home-remodeling',
    images: [
      {
        url: 'https://www.lavacagc.com/og-services.jpg',
        width: 1200,
        height: 630,
        alt: 'Whole Home Remodeling Services by La Vaca General Contractors',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Whole Home Remodeling | La Vaca GC',
    description: 'Complete home transformations in Northern NJ.',
  },
  alternates: {
    canonical: 'https://www.lavacagc.com/services/whole-home-remodeling',
  },
};

const features = [
  'Complete Kitchen Renovation',
  'Full Bathroom Remodels',
  'Living Space Transformations',
  'Bedroom & Closet Updates',
  'Flooring Throughout',
  'Electrical System Upgrades',
  'Plumbing Modernization',
  'HVAC Improvements',
  'Interior & Exterior Painting',
  'Custom Millwork & Trim',
  'Lighting Design & Installation',
  'Smart Home Integration',
];

const benefits = [
  {
    icon: Home,
    title: 'Single Point of Contact',
    description:
      'One team manages your entire renovation, ensuring seamless coordination between all trades and a stress-free experience.',
  },
  {
    icon: Clock,
    title: 'Efficient Timeline',
    description:
      'Renovating multiple areas simultaneously reduces overall project time compared to tackling rooms one at a time.',
  },
  {
    icon: Sparkles,
    title: 'Cohesive Design',
    description:
      'A unified vision for your entire home ensures consistent style, finishes, and flow throughout every space.',
  },
  {
    icon: Shield,
    title: 'Cost Effective',
    description:
      'Bundle pricing and efficient resource allocation provide better value than separate individual projects.',
  },
];

const processSteps = [
  {
    step: 1,
    title: 'Discovery & Vision',
    description: 'Comprehensive assessment of your home and lifestyle needs with detailed planning sessions',
    duration: '2-3 weeks',
  },
  {
    step: 2,
    title: 'Design Development',
    description: 'Full architectural plans, 3D renderings, and material selections for every space',
    duration: '3-4 weeks',
  },
  {
    step: 3,
    title: 'Permits & Preparation',
    description: 'Obtain all necessary permits and prepare detailed construction schedules',
    duration: '2-4 weeks',
  },
  {
    step: 4,
    title: 'Structural & Systems',
    description: 'Any structural modifications plus electrical, plumbing, and HVAC rough-in work',
    duration: '4-6 weeks',
  },
  {
    step: 5,
    title: 'Finish Work',
    description: 'Installation of all finishes, fixtures, cabinetry, flooring, and trim',
    duration: '6-10 weeks',
  },
  {
    step: 6,
    title: 'Final Details',
    description: 'Quality inspection, touch-ups, and comprehensive walkthrough',
    duration: '1-2 weeks',
  },
];

export default function WholeHomeRemodelingPage() {
  // JSON-LD Schema
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Whole Home Remodeling',
    description:
      'Complete whole-home renovation services including kitchens, bathrooms, living spaces, and full interior transformations.',
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
    },
    areaServed: {
      '@type': 'State',
      name: 'New Jersey',
    },
    serviceType: 'Whole Home Remodeling',
    url: 'https://www.lavacagc.com/services/whole-home-remodeling',
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.lavacagc.com' },
      { '@type': 'ListItem', position: 2, name: 'Services', item: 'https://www.lavacagc.com/services' },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'Whole Home Remodeling',
        item: 'https://www.lavacagc.com/services/whole-home-remodeling',
      },
    ],
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <main>
        {/* Breadcrumb */}
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
                <li className="text-foreground font-medium">Whole Home Remodeling</li>
              </ol>
            </nav>
          </div>
        </section>

        {/* Hero Section */}
        <section className="relative bg-gradient-to-br from-background via-background to-muted py-10 md:py-20 lg:py-32">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <h1 className="text-4xl md:text-6xl font-bold text-text-primary mb-6 leading-tight">
                Whole Home Remodeling
                <span className="block text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text">
                  Northern New Jersey
                </span>
              </h1>
              <p className="text-xl text-text-secondary mb-8 leading-relaxed">
                Transform your entire home with a comprehensive renovation that brings your vision to life.
                From kitchens and bathrooms to living spaces and bedrooms, we handle every detail.
                <span className="block font-semibold text-secondary mt-2">
                  One team. One vision. Complete transformation.
                </span>
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button"
                  asChild
                >
                  <Link href="/#estimate">Get Free Estimate</Link>
                </Button>
                <Button variant="outline" size="lg" asChild>
                  <a href="tel:2012124917">Call (201) 212-4917</a>
                </Button>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-12">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">$150K+</div>
                  <div className="text-text-secondary text-sm">Typical Investment</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">4-8</div>
                  <div className="text-text-secondary text-sm">Month Timeline</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">100%</div>
                  <div className="text-text-secondary text-sm">Custom Design</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">5-Star</div>
                  <div className="text-text-secondary text-sm">Client Rating</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-16 bg-background">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">
                Why Choose Whole Home Remodeling?
              </h2>
              <p className="text-lg text-text-secondary max-w-3xl mx-auto">
                A comprehensive renovation offers advantages that room-by-room projects can't match.
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
              {benefits.map((benefit, index) => (
                <Card key={index} className="text-center p-6">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <benefit.icon className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="font-bold text-text-primary mb-2">{benefit.title}</h3>
                  <p className="text-sm text-text-secondary">{benefit.description}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-16 bg-muted/50">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">What's Included</h2>
              <p className="text-lg text-text-secondary max-w-3xl mx-auto">
                Our whole-home remodeling service covers every aspect of your renovation.
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {features.map((feature, index) => (
                <Card key={index}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                      <span className="text-text-primary font-medium">{feature}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Process Section */}
        <section className="py-16 bg-background">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">Our Process</h2>
              <p className="text-lg text-text-secondary max-w-3xl mx-auto">
                A proven approach to delivering exceptional whole-home transformations.
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {processSteps.map((step) => (
                <Card key={step.step} className="relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-12 h-12 bg-primary flex items-center justify-center text-white font-bold text-xl">
                    {step.step}
                  </div>
                  <CardContent className="p-6 pt-16">
                    <h3 className="font-bold text-text-primary mb-2">{step.title}</h3>
                    <p className="text-sm text-text-secondary mb-3">{step.description}</p>
                    <div className="flex items-center gap-2 text-xs text-primary">
                      <Clock className="h-4 w-4" />
                      <span>{step.duration}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing Guide */}
        <section className="py-16 bg-muted/50">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">Investment Guide</h2>
              <p className="text-lg text-text-secondary mb-8">
                Whole home remodeling costs vary based on home size, scope, and finish level.
              </p>
              <div className="grid md:grid-cols-3 gap-6">
                <Card className="p-6 text-center">
                  <h3 className="font-bold text-text-primary mb-2">Essential Refresh</h3>
                  <div className="text-3xl font-bold text-primary mb-2">$150K - $250K</div>
                  <p className="text-sm text-text-secondary">
                    Kitchen, 2 bathrooms, flooring, paint, fixtures
                  </p>
                </Card>
                <Card className="p-6 text-center border-primary border-2">
                  <div className="text-xs font-bold text-primary mb-2">MOST POPULAR</div>
                  <h3 className="font-bold text-text-primary mb-2">Complete Transformation</h3>
                  <div className="text-3xl font-bold text-primary mb-2">$250K - $400K</div>
                  <p className="text-sm text-text-secondary">
                    Full interior remodel with premium finishes and systems upgrades
                  </p>
                </Card>
                <Card className="p-6 text-center">
                  <h3 className="font-bold text-text-primary mb-2">Luxury Renovation</h3>
                  <div className="text-3xl font-bold text-primary mb-2">$400K+</div>
                  <p className="text-sm text-text-secondary">
                    High-end materials, custom millwork, smart home, structural changes
                  </p>
                </Card>
              </div>
              <p className="text-sm text-text-muted mt-6">
                * Prices are estimates for typical Northern NJ homes. Get a personalized quote for your project.
              </p>
            </div>
          </div>
        </section>

        {/* Related Services Section */}
        <section className="py-16 bg-background">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">Looking for Specific Services?</h2>
              <p className="text-lg text-text-secondary max-w-3xl mx-auto">
                If you're focusing on a particular area of your home, explore our individual service offerings.
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-6 max-w-6xl mx-auto">
              <Link href="/services/kitchen-remodeling" className="block group">
                <Card className="h-full transition-shadow hover:shadow-lg">
                  <CardContent className="p-6 text-center">
                    <h3 className="font-bold text-text-primary group-hover:text-primary transition-colors">
                      Kitchen Remodeling
                    </h3>
                    <p className="text-sm text-text-secondary mt-2">
                      Custom kitchen designs
                    </p>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/services/bathroom-renovation" className="block group">
                <Card className="h-full transition-shadow hover:shadow-lg">
                  <CardContent className="p-6 text-center">
                    <h3 className="font-bold text-text-primary group-hover:text-primary transition-colors">
                      Bathroom Renovation
                    </h3>
                    <p className="text-sm text-text-secondary mt-2">Luxury bath upgrades</p>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/services/basement-finishing" className="block group">
                <Card className="h-full transition-shadow hover:shadow-lg">
                  <CardContent className="p-6 text-center">
                    <h3 className="font-bold text-text-primary group-hover:text-primary transition-colors">
                      Basement Finishing
                    </h3>
                    <p className="text-sm text-text-secondary mt-2">
                      Expand your living space
                    </p>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/services/home-additions" className="block group">
                <Card className="h-full transition-shadow hover:shadow-lg">
                  <CardContent className="p-6 text-center">
                    <h3 className="font-bold text-text-primary group-hover:text-primary transition-colors">
                      Home Additions
                    </h3>
                    <p className="text-sm text-text-secondary mt-2">Add square footage</p>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/services/interior-finishing" className="block group">
                <Card className="h-full transition-shadow hover:shadow-lg">
                  <CardContent className="p-6 text-center">
                    <h3 className="font-bold text-text-primary group-hover:text-primary transition-colors">
                      Interior Finishing
                    </h3>
                    <p className="text-sm text-text-secondary mt-2">Drywall, flooring, trim</p>
                  </CardContent>
                </Card>
              </Link>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 bg-gradient-to-br from-primary to-accent-sunset text-white">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">Ready to Transform Your Home?</h2>
            <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
              Schedule a free consultation to discuss your whole-home renovation vision with our expert team.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" variant="secondary" asChild>
                <Link href="/contact">Schedule Consultation</Link>
              </Button>
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10" asChild>
                <Link href="/project-calculator">Get Cost Estimate</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
