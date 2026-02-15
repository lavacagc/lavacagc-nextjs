'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  MessageCircle,
  Calculator,
  FileText,
  Hammer,
  CheckCircle,
  Phone,
  Calendar,
  Ruler,
  PaintBucket,
  Truck,
  Home,
  Award,
} from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface ProcessStep {
  number: number;
  title: string;
  duration: string;
  description: string;
  details: string[];
}

interface ProcessPageClientProps {
  processSteps: ProcessStep[];
}

const stepIcons: Record<number, React.ElementType> = {
  1: MessageCircle,
  2: Ruler,
  3: Calculator,
  4: FileText,
  5: Hammer,
  6: CheckCircle,
};

const qualityStandards = [
  {
    icon: Award,
    title: 'Quality Materials',
    description: 'We source premium materials from trusted suppliers to ensure longevity and beauty.',
  },
  {
    icon: Truck,
    title: 'Reliable Scheduling',
    description: 'We stick to our timelines and communicate any changes immediately.',
  },
  {
    icon: Home,
    title: 'Respect Your Home',
    description: 'We treat your home with care, maintaining cleanliness and minimizing disruption.',
  },
  {
    icon: Phone,
    title: 'Open Communication',
    description: 'Daily updates, photos, and direct access to our project managers.',
  },
];

export default function ProcessPageClient({ processSteps }: ProcessPageClientProps) {
  return (
    <>
      {/* Process Steps Section */}
      <section className="py-8 md:py-16 bg-background-subtle">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold text-text-primary text-center mb-12">How We Work</h2>

            <div className="space-y-12">
              {/* Mobile: Accordion View */}
              <div className="md:hidden">
                <Accordion type="single" collapsible className="space-y-4">
                  {processSteps.map((step) => {
                    const StepIcon = stepIcons[step.number] || CheckCircle;
                    return (
                      <AccordionItem key={step.number} value={`step-${step.number}`} className="border rounded-lg">
                        <AccordionTrigger className="px-6 py-4 hover:no-underline">
                          <div className="flex items-start gap-4 text-left w-full">
                            <div className="bg-primary/10 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0">
                              <StepIcon className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1">
                              <h3 className="text-lg font-bold text-text-primary">{step.title}</h3>
                              <div className="flex items-center gap-1 mt-1">
                                <Calendar className="h-3 w-3 text-text-muted" />
                                <span className="text-sm text-text-muted">{step.duration}</span>
                              </div>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-6 pb-4">
                          <p className="text-text-secondary leading-relaxed mb-4">{step.description}</p>
                          <div className="bg-muted/30 rounded-lg p-4">
                            <h4 className="font-semibold text-text-primary mb-3">What&apos;s Included:</h4>
                            <ul className="space-y-2">
                              {step.details.map((detail, detailIndex) => (
                                <li key={detailIndex} className="flex items-start gap-2">
                                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                                  <span className="text-text-secondary text-sm">{detail}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </div>

              {/* Desktop: Card View */}
              <div className="hidden md:block space-y-12">
                {processSteps.map((step, index) => {
                  const StepIcon = stepIcons[step.number] || CheckCircle;
                  return (
                    <div key={step.number} className="relative">
                      {index < processSteps.length - 1 && (
                        <div className="hidden md:block absolute left-16 top-32 w-0.5 h-20 bg-gradient-to-b from-primary to-transparent" />
                      )}
                      <Card className="hover:shadow-elegant transition-all duration-300">
                        <CardContent className="p-8">
                          <div className="flex flex-col md:flex-row gap-8">
                            <div className="flex-shrink-0 text-center">
                              <div className="hidden md:flex w-16 h-16 bg-gradient-primary rounded-full items-center justify-center text-white font-bold text-xl mb-4 mx-auto">
                                {step.number}
                              </div>
                              <div className="bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto">
                                <StepIcon className="h-6 w-6 text-primary" />
                              </div>
                            </div>
                            <div className="flex-1">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
                                <h3 className="text-2xl font-bold text-text-primary mb-2 sm:mb-0">{step.title}</h3>
                                <Badge variant="secondary">
                                  <Calendar className="h-3 w-3 mr-1" />
                                  {step.duration}
                                </Badge>
                              </div>
                              <p className="text-text-secondary text-lg leading-relaxed mb-6">{step.description}</p>
                              <div className="bg-muted/30 rounded-lg p-6">
                                <h4 className="font-semibold text-text-primary mb-3">What&apos;s Included:</h4>
                                <ul className="grid md:grid-cols-2 gap-2">
                                  {step.details.map((detail, detailIndex) => (
                                    <li key={detailIndex} className="flex items-start gap-2">
                                      <CheckCircle className="h-4 w-4 text-green-500 mt-1 flex-shrink-0" />
                                      <span className="text-text-secondary text-sm">{detail}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quality Standards */}
      <section className="py-8 md:py-16 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold text-text-primary text-center mb-12">Our Quality Standards</h2>
            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              {qualityStandards.map((standard, index) => (
                <Card key={index} className="text-center hover:shadow-elegant transition-all duration-300">
                  <CardContent className="p-4 md:p-6">
                    <div className="bg-primary/10 w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center mx-auto mb-3 md:mb-4">
                      <standard.icon className="h-6 w-6 md:h-8 md:w-8 text-primary" />
                    </div>
                    <h3 className="font-bold text-text-primary text-sm md:text-base mb-2 md:mb-3">
                      {standard.title}
                    </h3>
                    <p className="hidden md:block text-text-secondary text-sm leading-relaxed">
                      {standard.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Timeline Examples */}
      <section className="py-8 md:py-16 bg-background-soft">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-text-primary text-center mb-12">Typical Project Timelines</h2>
            <div className="grid md:grid-cols-2 gap-8">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <PaintBucket className="h-6 w-6 text-primary" />
                    Bathroom Renovation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Planning & Design</span>
                      <span className="font-semibold">1-2 weeks</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Permits & Materials</span>
                      <span className="font-semibold">1-2 weeks</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Construction</span>
                      <span className="font-semibold">2-3 weeks</span>
                    </div>
                    <div className="border-t pt-3 flex justify-between font-bold">
                      <span className="text-text-primary">Total Timeline</span>
                      <span className="text-primary">4-7 weeks</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <Home className="h-6 w-6 text-primary" />
                    Kitchen Remodeling
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Planning & Design</span>
                      <span className="font-semibold">2-3 weeks</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Permits & Materials</span>
                      <span className="font-semibold">2-3 weeks</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Construction</span>
                      <span className="font-semibold">4-6 weeks</span>
                    </div>
                    <div className="border-t pt-3 flex justify-between font-bold">
                      <span className="text-text-primary">Total Timeline</span>
                      <span className="text-primary">8-12 weeks</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <p className="text-center text-text-secondary mt-8">
              <em>Timelines may vary based on project complexity, permit requirements, and material availability.</em>
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-8 md:py-16 bg-gradient-to-r from-primary to-accent-teal text-white">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-6">Ready to Start Your Project?</h2>
            <p className="text-xl mb-8 opacity-90">
              Let&apos;s discuss your vision and begin the journey to your dream home transformation.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" variant="secondary" className="bg-white text-primary hover:bg-gray-100" asChild>
                <Link href="/#estimate">Get Free Estimate</Link>
              </Button>
              <Button
                size="lg"
                variant="secondary"
                className="bg-white/10 text-white border border-white/20 hover:bg-white hover:text-primary"
                asChild
              >
                <a href="tel:2012124917">
                  <Phone className="h-5 w-5 mr-2" />
                  Call Now
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
