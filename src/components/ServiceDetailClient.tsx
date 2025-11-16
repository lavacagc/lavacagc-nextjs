'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, Clock, DollarSign, Star, Wrench } from 'lucide-react';

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
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-background via-background to-muted py-10 md:py-20 lg:py-32">
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
                <a href="tel:2012124917">Call (201) 212-4917</a>
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
              What's Included in Our
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
                  We don't consider the job done until you're completely satisfied with the results.
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

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-r from-primary to-accent-teal text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Transform Your Space?</h2>
          <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
            Let's discuss your vision and create a custom {service.title.toLowerCase()} solution that fits your
            needs and budget.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="secondary" className="bg-white text-primary hover:bg-gray-100" asChild>
              <Link href="/#estimate">Get Your Free Estimate</Link>
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="bg-white/10 text-white border border-white/20 hover:bg-white hover:text-primary"
              asChild
            >
              <a href="tel:2012124917">Call (201) 212-4917</a>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
