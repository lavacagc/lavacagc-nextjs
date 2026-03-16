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
  Monitor,
  Camera,
  ClipboardCheck,
  Shield,
  Eye,
  Smartphone,
  ExternalLink,
} from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useEffect, useRef, useState } from 'react';

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

const tabs = [
  { id: 'portal', label: 'Your Project Portal' },
  { id: 'process', label: 'How We Work' },
];

export default function ProcessPageClient({ processSteps }: ProcessPageClientProps) {
  const [activeTab, setActiveTab] = useState('portal');
  const [isSticky, setIsSticky] = useState(false);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const processRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // IntersectionObserver for sticky detection
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsSticky(!entry.isIntersecting);
      },
      { threshold: 0, rootMargin: '-1px 0px 0px 0px' }
    );

    observer.observe(sentinel);

    // Scroll spy to update active tab
    const handleScroll = () => {
      const processEl = processRef.current;
      if (!processEl) return;

      const offset = 120; // account for sticky header + tab bar
      const processTop = processEl.getBoundingClientRect().top;

      if (processTop <= offset) {
        setActiveTab('process');
      } else {
        setActiveTab('portal');
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const scrollToSection = (id: string) => {
    const el = id === 'portal' ? portalRef.current : processRef.current;
    if (!el) return;
    const offset = 100; // sticky header + tab bar height
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'smooth' });
  };

  return (
    <>
      {/* Sentinel — when this scrolls out of view, tabs become sticky */}
      <div ref={sentinelRef} className="h-0" />

      {/* ═══════════════════════════════════════════════════════
          STICKY TAB BAR
          ═══════════════════════════════════════════════════════ */}
      <div
        ref={tabBarRef}
        className={`${
          isSticky ? 'fixed top-0 left-0 right-0 shadow-md z-40' : ''
        } bg-background/95 backdrop-blur-sm border-b transition-shadow duration-200`}
      >
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-center gap-1 md:gap-2 py-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => scrollToSection(tab.id)}
                className={`px-4 md:px-6 py-2.5 rounded-full text-sm md:text-base font-medium transition-all duration-200 cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-text-secondary hover:text-text-primary hover:bg-muted'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Spacer when sticky to prevent content jump */}
      {isSticky && <div className="h-[52px]" />}

      {/* ═══════════════════════════════════════════════════════
          SECTION 1: YOUR PROJECT PORTAL (FIRST)
          ═══════════════════════════════════════════════════════ */}
      <section ref={portalRef} id="portal" className="py-12 md:py-20 bg-background scroll-mt-28">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            {/* Section Header */}
            <div className="text-center mb-12 md:mb-16">
              <Badge variant="secondary" className="mb-4 text-sm px-4 py-1.5">
                <Monitor className="h-3.5 w-3.5 mr-1.5" />
                Included With Every Project
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">
                Your Own Project Portal
              </h2>
              <p className="text-lg text-text-secondary max-w-2xl mx-auto">
                Every La Vaca client gets a personal project portal — a private online space where you can
                track selections, view daily progress photos, approve contracts, and see exactly where
                your project stands. No more guessing.
              </p>
            </div>

            {/* Three Pillars */}
            <div className="grid md:grid-cols-3 gap-8 mb-12 md:mb-16">
              <div className="text-center">
                <div className="bg-primary/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Eye className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold text-text-primary mb-3">Full Transparency</h3>
                <p className="text-text-secondary leading-relaxed">
                  See every selection, every contract, every change order, and every dollar in one place.
                  No surprises, no hidden costs, no &quot;we&apos;ll figure it out later.&quot; Your portal
                  is the single source of truth for your entire project.
                </p>
              </div>
              <div className="text-center">
                <div className="bg-primary/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Camera className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold text-text-primary mb-3">Daily Communication</h3>
                <p className="text-text-secondary leading-relaxed">
                  Get daily photo updates showing exactly what was accomplished on your job site.
                  No more wondering what&apos;s happening or calling for updates — log in anytime
                  and see your home taking shape.
                </p>
              </div>
              <div className="text-center">
                <div className="bg-primary/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Shield className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold text-text-primary mb-3">Quality You Can Track</h3>
                <p className="text-text-secondary leading-relaxed">
                  Every material selection is documented with photos, prices, and your approval.
                  Every punch list item is tracked to completion. Every document is signed and
                  stored. Quality isn&apos;t just promised — it&apos;s proven.
                </p>
              </div>
            </div>

            {/* Feature Details */}
            <div className="bg-muted/30 rounded-2xl p-6 md:p-10">
              <h3 className="text-2xl font-bold text-text-primary text-center mb-8">
                What You Get in Your Portal
              </h3>
              <div className="grid md:grid-cols-2 gap-6">
                {[
                  {
                    icon: ClipboardCheck,
                    title: 'Material Selections',
                    desc: "Browse tile, countertop, fixture, and hardware options we've curated for your project. Compare choices side by side with photos and prices, then approve with one click.",
                  },
                  {
                    icon: Camera,
                    title: 'Daily Progress Photos',
                    desc: "Every day our crew is on your site, you'll see photos and a summary of what was done. Watch your renovation come together from anywhere — phone, tablet, or computer.",
                  },
                  {
                    icon: FileText,
                    title: 'Contracts & Change Orders',
                    desc: "Review and sign contracts digitally. If the scope changes, you'll see a clear change order with line items before any work proceeds. Everything documented.",
                  },
                  {
                    icon: CheckCircle,
                    title: 'Punch List Tracking',
                    desc: 'At the end of your project, every touch-up and final detail is tracked with photos and status updates. Nothing falls through the cracks.',
                  },
                  {
                    icon: Shield,
                    title: 'Complete Documentation',
                    desc: 'Lien waivers, insurance certificates, signed contracts, warranties — every document your project generates is stored and accessible in your portal.',
                  },
                  {
                    icon: Smartphone,
                    title: 'Access From Any Device',
                    desc: 'No app to download, no account to create. Just open the link we send you on your phone, tablet, or laptop and everything is right there.',
                  },
                ].map((feature) => (
                  <div key={feature.title} className="flex gap-4 items-start">
                    <div className="bg-primary/10 w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <feature.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-text-primary mb-1">{feature.title}</h4>
                      <p className="text-text-secondary text-sm leading-relaxed">{feature.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Promise + SpecNook CTA */}
            <div className="mt-12 md:mt-16 text-center max-w-3xl mx-auto">
              <h3 className="text-2xl font-bold text-text-primary mb-4">Our Promise to Every Client</h3>
              <p className="text-text-secondary text-lg leading-relaxed mb-6">
                We believe you shouldn&apos;t have to wonder what&apos;s happening with your renovation.
                That&apos;s why we invested in technology that keeps you informed at every step — not because
                it&apos;s trendy, but because it&apos;s the right way to treat someone who&apos;s trusting you
                with their home. Every La Vaca project comes with your own portal, daily updates, and
                complete documentation. No extra cost. It&apos;s just how we work.
              </p>

              {/* SEO-friendly SpecNook link */}
              <div className="bg-muted/50 rounded-xl p-6 border mt-8">
                <p className="text-sm text-text-secondary mb-3">
                  Our client portal is powered by
                </p>
                <a
                  href="https://www.specnook.app"
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-2 text-primary hover:text-primary/80 font-semibold text-lg transition-colors"
                >
                  SpecNook — Construction Client Portal Software
                  <ExternalLink className="h-4 w-4" />
                </a>
                <p className="text-sm text-text-secondary mt-2">
                  Selection tracking, daily updates, digital contracts, and client communication — built for contractors who care about the client experience.
                </p>
              </div>

              <Button
                size="lg"
                className="bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button text-white mt-8"
                asChild
              >
                <Link href="/#estimate">Start Your Project</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 2: HOW WE WORK (PROCESS STEPS)
          ═══════════════════════════════════════════════════════ */}
      <section ref={processRef} id="process" className="py-8 md:py-16 bg-background-subtle scroll-mt-28">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-text-primary text-center mb-4">How We Work</h2>
            <p className="text-text-secondary text-center max-w-2xl mx-auto mb-12">
              Our proven 6-step process ensures quality results from first conversation to final walkthrough.
            </p>

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
