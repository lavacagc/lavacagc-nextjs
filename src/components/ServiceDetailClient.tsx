'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, Clock, DollarSign, Star, Wrench, Phone, ArrowRight } from 'lucide-react';
import CallTrackingWrapper from '@/components/CallTrackingWrapper';
import { trackEvent, trackEstimateRequest, trackPhoneClick } from '@/services/analyticsManager';

interface ServiceData {
  id: string;
  title: string;
  description: string;
  icon_name: string;
  features: string[];
  sort_order: number;
}

interface ServiceDetailClientProps {
  service: ServiceData;
  slug: string;
}

const processSteps = [
  {
    step: 1,
    title: 'Design Consultation',
    description: 'In-home assessment and design planning with 3D renderings',
    duration: '1-2 weeks',
  },
  {
    step: 2,
    title: 'Permits & Planning',
    description: 'Obtain necessary permits and finalize material selections',
    duration: '2-3 weeks',
  },
  {
    step: 3,
    title: 'Demolition & Prep',
    description: 'Safe removal of existing materials with dust containment',
    duration: '3-5 days',
  },
  {
    step: 4,
    title: 'Rough-In Work',
    description: 'Electrical, plumbing, and HVAC rough-in installations',
    duration: '5-7 days',
  },
  {
    step: 5,
    title: 'Installation',
    description: 'Professional installation of all materials and finishing work',
    duration: '2-3 weeks',
  },
  {
    step: 6,
    title: 'Final Inspection',
    description: 'Quality assurance and final walkthrough',
    duration: '1-2 days',
  },
];

export default function ServiceDetailClient({ service, slug }: ServiceDetailClientProps) {
  return (
    <>
      {/* Top CTA Banner */}
      <section data-section="top-cta" className="bg-gradient-to-r from-[#EE9639] to-[#E08530] py-4">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-center md:text-left">
              <h2 className="text-white text-xl md:text-2xl font-bold">Get Your Free Estimate Today</h2>
              <p className="text-white/90 text-sm md:text-base">Call us: <a href="tel:2016145930" className="font-bold hover:underline">(201) 614-5930</a></p>
            </div>
            <Button
              size="lg"
              className="bg-white text-primary hover:bg-gray-100 hover:shadow-lg"
              asChild
            >
              <Link href="/free-estimate">Get Free Estimate</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Hero Section */}
      <section data-section="hero" className="relative bg-gradient-to-br from-background via-background to-muted py-10 md:py-20 lg:py-32">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-6xl font-bold text-text-primary mb-6 leading-tight">
              {service.title}
              <span className="block text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text">
                Northern New Jersey
              </span>
            </h1>
            <p className="text-xl text-text-secondary mb-8 leading-relaxed">
              {service.description}
              <span className="block font-semibold text-secondary mt-2">
                Custom designs, expert craftsmanship, guaranteed results.
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
                <CallTrackingWrapper href="tel:2012124917">Call (201) 212-4917</CallTrackingWrapper>
              </Button>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-12">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">20+</div>
                <div className="text-text-secondary text-sm">Years Experience</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">100%</div>
                <div className="text-text-secondary text-sm flex items-center justify-center gap-1">
                  <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                  Rating
                </div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">Licensed</div>
                <div className="text-text-secondary text-sm">& Insured</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">30+</div>
                <div className="text-text-secondary text-sm">Happy Clients</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-background-subtle">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-4xl font-bold text-text-primary mb-6 text-center">
              What&apos;s Included in Our
              <span className="text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text">
                {' '}
                {service.title}
              </span>
            </h2>
            <p className="text-xl text-text-secondary mb-12 text-center">
              Comprehensive service designed to transform your space
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              {service.features.map((feature, index) => (
                <div key={index} className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-accent-teal mr-3 flex-shrink-0" />
                  <span className="text-text-secondary">{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="py-20 bg-muted">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-text-primary mb-6">
              Our {service.title}
              <span className="text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text">
                {' '}
                Process
              </span>
            </h2>
            <p className="text-xl text-text-secondary max-w-3xl mx-auto">
              A proven 6-step process that ensures your project is completed on time, on budget, and exceeds
              expectations
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {processSteps.map((step, index) => (
              <Card key={index} className="group hover:shadow-elegant transition-all duration-300">
                <CardContent className="p-6">
                  <div className="flex items-center mb-4">
                    <div className="w-12 h-12 bg-gradient-to-r from-primary to-accent-tangerine rounded-full flex items-center justify-center text-white font-bold text-lg mr-4">
                      {step.step}
                    </div>
                    <div>
                      <h3 className="font-bold text-text-primary">{step.title}</h3>
                      <div className="flex items-center text-sm text-text-muted">
                        <Clock className="h-4 w-4 mr-1" />
                        {step.duration}
                      </div>
                    </div>
                  </div>
                  <p className="text-text-secondary">{step.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Cards */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-4xl font-bold text-text-primary mb-12 text-center">
              Why Choose
              <span className="text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text">
                {' '}
                La Vaca GC?
              </span>
            </h2>

            <div className="grid md:grid-cols-2 gap-6">
              <Card className="p-6 bg-gradient-to-r from-primary/5 to-accent-sunset/5 border-primary/20">
                <div className="flex items-center mb-4">
                  <DollarSign className="h-8 w-8 text-accent-teal mr-3" />
                  <h3 className="text-xl font-bold text-text-primary">Excellent ROI</h3>
                </div>
                <p className="text-text-secondary">
                  Our quality remodeling projects consistently provide high return on investment and increase
                  your home value.
                </p>
              </Card>

              <Card className="p-6 bg-gradient-to-r from-secondary/5 to-primary/5 border-secondary/20">
                <div className="flex items-center mb-4">
                  <Wrench className="h-8 w-8 text-primary mr-3" />
                  <h3 className="text-xl font-bold text-text-primary">Expert Craftsmanship</h3>
                </div>
                <p className="text-text-secondary">
                  Licensed, bonded, and insured contractor with 20+ years of experience in Northern NJ.
                </p>
              </Card>

              <Card className="p-6 bg-gradient-to-r from-accent-teal/5 to-primary/5 border-accent-teal/20">
                <div className="flex items-center mb-4">
                  <Star className="h-8 w-8 text-yellow-400 fill-yellow-400 mr-3" />
                  <h3 className="text-xl font-bold text-text-primary">100% Satisfaction</h3>
                </div>
                <p className="text-text-secondary">
                  We don&apos;t consider the job done until you&apos;re completely satisfied with the results.
                </p>
              </Card>

              <Card className="p-6 bg-gradient-to-r from-accent-sunset/5 to-accent-teal/5 border-accent-sunset/20">
                <div className="flex items-center mb-4">
                  <CheckCircle className="h-8 w-8 text-green-600 mr-3" />
                  <h3 className="text-xl font-bold text-text-primary">Warranty Included</h3>
                </div>
                <p className="text-text-secondary">
                  All our work comes with a comprehensive warranty for your peace of mind.
                </p>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA Section */}
      <section className="py-16 bg-gradient-to-br from-background via-muted to-background">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">
              Ready to Start Your {service.title} Project?
            </h2>
            <p className="text-lg text-text-secondary mb-8 max-w-2xl mx-auto">
              Get a free, no-obligation estimate from Northern NJ&apos;s most trusted contractor
            </p>

            {/* Value Props */}
            <div className="grid md:grid-cols-3 gap-6 mb-10">
              <div className="flex flex-col items-center">
                <CheckCircle className="h-12 w-12 text-accent-teal mb-3" />
                <h3 className="font-bold text-text-primary mb-1">Licensed & Insured</h3>
                <p className="text-sm text-text-secondary">HIC# 13VH13373800</p>
              </div>
              <div className="flex flex-col items-center">
                <DollarSign className="h-12 w-12 text-primary mb-3" />
                <h3 className="font-bold text-text-primary mb-1">Free Estimates</h3>
                <p className="text-sm text-text-secondary">No commitment required</p>
              </div>
              <div className="flex flex-col items-center">
                <Star className="h-12 w-12 text-yellow-400 fill-yellow-400 mb-3" />
                <h3 className="font-bold text-text-primary mb-1">5-Star Rated</h3>
                <p className="text-sm text-text-secondary">100% customer satisfaction</p>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
              <Button
                size="lg"
                className="bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button text-lg px-8 py-6"
                asChild
              >
                <Link href="/free-estimate">
                  Get Free Estimate
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="text-lg px-8 py-6 border-2"
                asChild
              >
                <a href="tel:2016145930">
                  <Phone className="mr-2 h-5 w-5" />
                  Call (201) 614-5930
                </a>
              </Button>
            </div>

            <p className="text-sm text-text-muted">
              Or email us at <a href="mailto:info@lavacagc.com" className="text-primary hover:underline">info@lavacagc.com</a>
            </p>
          </div>
        </div>
      </section>

      {/* Related Services Section */}
      <section className="py-16 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-text-primary mb-4">Explore Our Other Services</h2>
            <p className="text-lg text-text-secondary max-w-3xl mx-auto">
              Complete your home transformation with our full range of remodeling services.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 max-w-6xl mx-auto">
            {slug !== 'kitchen-remodeling' && (
              <Link href="/services/kitchen-remodeling" className="block group">
                <Card className="h-full transition-shadow hover:shadow-lg">
                  <CardContent className="p-4 text-center">
                    <h3 className="font-semibold text-sm text-text-primary group-hover:text-primary transition-colors">
                      Kitchen Remodeling
                    </h3>
                  </CardContent>
                </Card>
              </Link>
            )}
            {slug !== 'bathroom-renovation' && (
              <Link href="/services/bathroom-renovation" className="block group">
                <Card className="h-full transition-shadow hover:shadow-lg">
                  <CardContent className="p-4 text-center">
                    <h3 className="font-semibold text-sm text-text-primary group-hover:text-primary transition-colors">
                      Bathroom Renovation
                    </h3>
                  </CardContent>
                </Card>
              </Link>
            )}
            {slug !== 'basement-finishing' && (
              <Link href="/services/basement-finishing" className="block group">
                <Card className="h-full transition-shadow hover:shadow-lg">
                  <CardContent className="p-4 text-center">
                    <h3 className="font-semibold text-sm text-text-primary group-hover:text-primary transition-colors">
                      Basement Finishing
                    </h3>
                  </CardContent>
                </Card>
              </Link>
            )}
            {slug !== 'home-additions' && (
              <Link href="/services/home-additions" className="block group">
                <Card className="h-full transition-shadow hover:shadow-lg">
                  <CardContent className="p-4 text-center">
                    <h3 className="font-semibold text-sm text-text-primary group-hover:text-primary transition-colors">
                      Home Additions
                    </h3>
                  </CardContent>
                </Card>
              </Link>
            )}
            <Link href="/services/whole-home-remodeling" className="block group">
              <Card className="h-full transition-shadow hover:shadow-lg">
                <CardContent className="p-4 text-center">
                  <h3 className="font-semibold text-sm text-text-primary group-hover:text-primary transition-colors">
                    Whole Home
                  </h3>
                </CardContent>
              </Card>
            </Link>
            <Link href="/services/interior-finishing" className="block group">
              <Card className="h-full transition-shadow hover:shadow-lg">
                <CardContent className="p-4 text-center">
                  <h3 className="font-semibold text-sm text-text-primary group-hover:text-primary transition-colors">
                    Interior Finishing
                  </h3>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      </section>

      {/* Reviews Snippet */}
      <section className="py-10 bg-background-subtle">
        <div className="container mx-auto px-4 text-center">
          <Link
            href="/reviews"
            onClick={() => {
              trackEvent('cta_click', {
                location: `service_${slug}`,
                destination: 'reviews',
                variant: 'reviews_snippet',
              });
            }}
            className="inline-flex flex-col items-center gap-2 group cursor-pointer"
          >
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star key={s} className="h-6 w-6 text-yellow-400 fill-yellow-400" />
              ))}
            </div>
            <p className="text-lg font-semibold text-text-primary group-hover:text-primary transition-colors">
              ★★★★★ 5-Star Rated NJ Contractor
            </p>
            <span className="text-sm text-primary font-medium group-hover:underline">
              Read our reviews →
            </span>
          </Link>
        </div>
      </section>

      {/* CTA Section */}
      <section data-section="bottom-cta" className="py-16 bg-gradient-to-r from-primary to-accent-teal text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Transform Your Space?</h2>
          <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
            Let&apos;s discuss your vision and create a custom {service.title.toLowerCase()} solution that fits your
            needs and budget.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
            <Link
              href="/contact"
              onClick={() => {
                trackEvent('cta_click', {
                  location: `service_${slug}`,
                  destination: 'contact',
                  variant: 'Get Free Estimate',
                });
                trackEstimateRequest(`service_${slug}`);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-md text-base font-semibold bg-white text-primary hover:bg-gray-100 h-14 px-10 transition-all duration-300 hover:scale-105 cursor-pointer"
            >
              Get Free Estimate
              <ArrowRight className="h-5 w-5" />
            </Link>
            <a
              href="tel:2016142814"
              onClick={() => {
                trackPhoneClick();
                trackEvent('cta_click', {
                  location: `service_${slug}`,
                  destination: 'phone',
                  variant: 'Call Now',
                });
              }}
              className="inline-flex items-center justify-center gap-2 rounded-md text-base font-semibold bg-white/10 border border-white/30 text-white hover:bg-white hover:text-primary h-14 px-10 transition-all duration-300 cursor-pointer"
            >
              <Phone className="h-5 w-5" />
              Call (201) 614-2814
            </a>
          </div>
          <p className="text-sm opacity-70">Licensed &amp; Insured — HIC# 13VH13373800</p>
        </div>
      </section>
    </>
  );
}
