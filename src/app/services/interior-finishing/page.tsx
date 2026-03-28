import { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import CallTrackingWrapper from '@/components/CallTrackingWrapper';
import {
  CheckCircle,
  Clock,
  Layers,
  PaintBucket,
  Home,
  Shield,
  Wrench,
  DoorOpen,
  Hammer,
  Sparkles,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Drywall & Interior Finishing Contractor Northern NJ | La Vaca',
  description:
    'Expert drywall, flooring & trim contractor in Bergen, Essex & Morris counties. Level 5 finishing, LVP installation. Licensed. Serving Montclair, Alpine, Morristown.',
  keywords:
    'drywall contractor NJ, interior finishing NJ, skim coat specialist, level 5 drywall, flooring installation, LVP flooring NJ, trim work, baseboard installation, interior painting, Bergen County, Essex County, Morris County, Montclair, Short Hills, Morristown, La Vaca General Contractors',
  openGraph: {
    title: 'Drywall & Interior Finishing Contractor | La Vaca GC',
    description:
      'Expert drywall, flooring & trim contractor in Bergen, Essex & Morris counties NJ. Level 5 finishing, LVP installation. Licensed & insured.',
    type: 'website',
    url: 'https://www.lavacagc.com/services/interior-finishing',
    images: [
      {
        url: 'https://www.lavacagc.com/og-services.jpg',
        width: 1200,
        height: 630,
        alt: 'Drywall & Interior Finishing Services by La Vaca General Contractors',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Drywall & Interior Finishing Contractor NJ | La Vaca GC',
    description: 'Expert drywall, flooring & trim contractor in Bergen, Essex & Morris counties.',
  },
  alternates: {
    canonical: 'https://www.lavacagc.com/services/interior-finishing',
  },
};

const wallSystemsServices = [
  {
    title: 'Framing',
    description: 'Residential and commercial interior wall framing for new construction and renovations.',
  },
  {
    title: 'Insulation',
    description: 'Professional fiberglass insulation installation for energy efficiency and comfort.',
  },
  {
    title: 'Drywall Installation',
    description: 'Expert sheetrock installation for new construction, additions, and renovation projects.',
  },
  {
    title: 'Level 4 Finish',
    description: 'Standard smooth finish ideal for most residential applications with painted surfaces.',
  },
  {
    title: 'Level 5 / Skim Coat',
    description:
      'Premium finish for old walls, imperfect framing, or high-end applications requiring flawless results.',
  },
];

const finishingTradesServices = [
  {
    icon: Layers,
    title: 'Flooring',
    description: 'Vinyl plank (LVP), laminate, and ceramic tile installation.',
  },
  {
    icon: DoorOpen,
    title: 'Door Installation',
    description: 'Interior doors including pre-hung and slab installations.',
  },
  {
    icon: Hammer,
    title: 'Trim & Molding',
    description: 'Baseboard, crown molding, casing, and chair rail installation.',
  },
  {
    icon: PaintBucket,
    title: 'Painting',
    description: 'Interior painting for walls, ceilings, and trim work.',
  },
];

const benefits = [
  {
    icon: Wrench,
    title: 'In-House Expertise',
    description:
      'Our dedicated team handles all interior finishing work in-house, ensuring consistent quality without variability from outside crews.',
  },
  {
    icon: Shield,
    title: 'Guaranteed Work',
    description:
      'Every project comes with our workmanship guarantee. We stand behind our craftsmanship and your complete satisfaction.',
  },
  {
    icon: Sparkles,
    title: 'Attention to Detail',
    description:
      'From perfect seams to flawless finishes, we focus on the details that transform good work into exceptional results.',
  },
  {
    icon: Home,
    title: 'Any Size Project',
    description:
      'From a single room refresh to complete home finishing, we bring the same expert craftsmanship to projects of every scale.',
  },
];

const processSteps = [
  {
    step: 1,
    title: 'Assessment & Planning',
    description: 'Detailed evaluation of your space, requirements, and timeline to create a comprehensive project plan',
    duration: '1-2 days',
  },
  {
    step: 2,
    title: 'Material Selection',
    description: 'Help you choose the right materials, finishes, and products that match your vision and budget',
    duration: '1-3 days',
  },
  {
    step: 3,
    title: 'Preparation',
    description: 'Protect existing surfaces, prepare work areas, and ensure proper conditions for quality installation',
    duration: '1-2 days',
  },
  {
    step: 4,
    title: 'Installation',
    description: 'Expert installation by our experienced craftsmen with attention to every detail',
    duration: 'Varies by scope',
  },
  {
    step: 5,
    title: 'Finishing & Inspection',
    description: 'Final finishing touches, thorough quality inspection, and cleanup of work areas',
    duration: '1-2 days',
  },
  {
    step: 6,
    title: 'Final Walkthrough',
    description: 'Review completed work together, address any concerns, and ensure your complete satisfaction',
    duration: 'Same day',
  },
];

const faqs = [
  {
    question: 'How much does drywall installation cost in Northern NJ?',
    answer:
      'Drywall installation costs vary based on project scope, ceiling height, and finish level. Factors include the square footage, level of finish (Level 4 vs Level 5), and any special requirements like moisture-resistant drywall. We provide free, detailed estimates tailored to your specific project - contact us for an accurate quote.',
  },
  {
    question: 'What is the difference between Level 4 and Level 5 drywall finish?',
    answer:
      'Level 4 is a standard smooth finish suitable for most painted walls. Level 5 (skim coat) adds an additional layer of joint compound over the entire surface, creating a perfectly uniform finish. Level 5 is ideal for areas with critical lighting, glossy paints, or when you want the highest quality finish possible.',
  },
  {
    question: 'Do you handle small interior finishing projects?',
    answer:
      'Yes! We work on projects of all sizes, from a single room refresh to complete home finishing. Every project receives the same attention to detail and quality craftsmanship regardless of size.',
  },
  {
    question: 'What types of flooring do you install?',
    answer:
      'We specialize in vinyl plank (LVP), laminate, and ceramic tile flooring. These durable, attractive options suit a variety of styles and budgets. We help you select the best option for your space and lifestyle.',
  },
  {
    question: 'Why should I consider the primer application service?',
    answer:
      'Our primer application service reveals any wall or ceiling imperfections before final paint. This quality assurance step ensures flawless results by allowing us to address any issues that become visible under the primer coat.',
  },
  {
    question: 'How long does a typical interior finishing project take?',
    answer:
      'Timeline varies based on scope. A single room might take 3-5 days, while larger projects can take several weeks. We provide detailed timelines during your consultation based on your specific project requirements.',
  },
  {
    question: 'Do you serve my area in Northern New Jersey?',
    answer:
      'We serve homeowners throughout Bergen, Essex, and Morris counties, including Montclair, Short Hills, Millburn, Morristown, Alpine, Saddle River, and surrounding communities. Contact us to discuss your project location.',
  },
  {
    question: 'Do your interior finishing services work with larger renovation projects?',
    answer:
      'Absolutely. Our interior finishing services are a natural complement to our kitchen, bathroom, basement, and whole-home renovation projects. We can handle finishing as a standalone service or as part of a comprehensive renovation.',
  },
];

export default function InteriorFinishingPage() {
  // JSON-LD Schema
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Drywall & Interior Finishing Contractor',
    description:
      'Expert drywall contractor and interior finishing services in Bergen, Essex, and Morris counties NJ. Level 5 finishing, LVP flooring, trim, and painting.',
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
      priceRange: '$$',
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '5',
        reviewCount: '12',
      },
    },
    areaServed: [
      { '@type': 'AdministrativeArea', name: 'Bergen County, NJ' },
      { '@type': 'AdministrativeArea', name: 'Essex County, NJ' },
      { '@type': 'AdministrativeArea', name: 'Morris County, NJ' },
    ],
    serviceType: ['Drywall Installation', 'Interior Finishing', 'Flooring Installation', 'Trim Work', 'Interior Painting'],
    url: 'https://www.lavacagc.com/services/interior-finishing',
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
        name: 'Interior Finishing',
        item: 'https://www.lavacagc.com/services/interior-finishing',
      },
    ],
  };

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

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
                <li className="text-foreground font-medium">Interior Finishing</li>
              </ol>
            </nav>
          </div>
        </section>

        {/* Hero Section */}
        <section className="relative bg-gradient-to-br from-background via-background to-muted py-8 md:py-20 lg:py-32">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <h1 className="text-3xl md:text-6xl font-bold text-text-primary mb-4 md:mb-6 leading-tight">
                Interior Finishing Services
                <span className="block text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text">
                  Northern New Jersey
                </span>
              </h1>
              <p className="text-base md:text-xl text-text-secondary mb-6 md:mb-8 leading-relaxed">
                <span className="md:hidden">
                  Expert drywall, flooring, trim, and painting by our in-house team in Bergen, Essex, and Morris counties.
                </span>
                <span className="hidden md:inline">
                  From framing to final coat, we deliver expert interior finishing for projects of any size throughout
                  Bergen, Essex, and Morris counties. Drywall, flooring, doors, trim, and painting - all handled by our
                  experienced in-house team serving Montclair, Short Hills, Morristown, and surrounding areas.
                </span>
                <span className="block font-semibold text-secondary mt-2">
                  Expert craftsmanship at every scale.
                </span>
              </p>
              <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center">
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mt-8 md:mt-12">
                <div className="text-center">
                  <div className="text-2xl md:text-3xl font-bold text-primary mb-1 md:mb-2">10+</div>
                  <div className="text-text-secondary text-xs md:text-sm">Years Experience</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl md:text-3xl font-bold text-primary mb-1 md:mb-2">5-Star</div>
                  <div className="text-text-secondary text-xs md:text-sm">Client Rating</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl md:text-3xl font-bold text-primary mb-1 md:mb-2">Licensed</div>
                  <div className="text-text-secondary text-xs md:text-sm">& Insured</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl md:text-3xl font-bold text-primary mb-1 md:mb-2">100%</div>
                  <div className="text-text-secondary text-xs md:text-sm">Satisfaction</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Wall Systems Section */}
        <section className="py-10 md:py-16 bg-muted/50">
          <div className="container mx-auto px-4">
            <div className="text-center mb-6 md:mb-12">
              <h2 className="text-2xl md:text-4xl font-bold text-text-primary mb-3 md:mb-4">Wall Systems & Drywall</h2>
              <p className="text-sm md:text-lg text-text-secondary max-w-3xl mx-auto">
                Complete wall system services from framing through finish. We handle every phase of your interior wall
                project with precision and expertise.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6 max-w-5xl mx-auto">
              {wallSystemsServices.map((service, index) => (
                <Card key={index}>
                  <CardContent className="p-4 md:p-6">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 md:h-6 md:w-6 text-primary flex-shrink-0 mt-0.5" />
                      <div>
                        <h3 className="font-bold text-text-primary mb-1 text-sm md:text-base">{service.title}</h3>
                        <p className="text-xs md:text-sm text-text-secondary">{service.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Finishing Trades Section */}
        <section className="py-10 md:py-16 bg-background">
          <div className="container mx-auto px-4">
            <div className="text-center mb-6 md:mb-12">
              <h2 className="text-2xl md:text-4xl font-bold text-text-primary mb-3 md:mb-4">Finishing Trades</h2>
              <p className="text-sm md:text-lg text-text-secondary max-w-3xl mx-auto">
                Complete your space with our expert finishing services. From flooring to trim work, we bring the same
                attention to detail to every trade.
              </p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-8 max-w-6xl mx-auto">
              {finishingTradesServices.map((service, index) => (
                <Card key={index} className="text-center p-4 md:p-6">
                  <div className="w-12 h-12 md:w-16 md:h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2 md:mb-4">
                    <service.icon className="h-6 w-6 md:h-8 md:w-8 text-primary" />
                  </div>
                  <h3 className="font-bold text-text-primary mb-1 md:mb-2 text-sm md:text-base">{service.title}</h3>
                  <p className="text-xs md:text-sm text-text-secondary">{service.description}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Premium Add-On Section */}
        <section className="py-8 md:py-12 bg-muted/50">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <Card className="border-primary border-2">
                <CardContent className="p-4 md:p-8">
                  <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6">
                    <div className="w-14 h-14 md:w-20 md:h-20 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                      <Sparkles className="h-7 w-7 md:h-10 md:w-10 text-primary" />
                    </div>
                    <div className="text-center md:text-left">
                      <div className="text-xs font-bold text-primary mb-1 md:mb-2">QUALITY ASSURANCE ADD-ON</div>
                      <h3 className="text-lg md:text-2xl font-bold text-text-primary mb-1 md:mb-2">Primer Application Service</h3>
                      <p className="text-text-secondary text-sm md:text-base">
                        Our premium primer application reveals wall and ceiling imperfections before final paint. This
                        quality assurance step ensures flawless results by allowing us to address any issues that become
                        visible under the primer coat.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-10 md:py-16 bg-background">
          <div className="container mx-auto px-4">
            <div className="text-center mb-6 md:mb-12">
              <h2 className="text-2xl md:text-4xl font-bold text-text-primary mb-3 md:mb-4">
                Why Choose La Vaca for Interior Finishing?
              </h2>
              <p className="text-sm md:text-lg text-text-secondary max-w-3xl mx-auto">
                Our experienced, dedicated team delivers consistent quality on every project, large or small.
              </p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-8 max-w-6xl mx-auto">
              {benefits.map((benefit, index) => (
                <Card key={index} className="text-center p-4 md:p-6">
                  <div className="w-12 h-12 md:w-16 md:h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2 md:mb-4">
                    <benefit.icon className="h-6 w-6 md:h-8 md:w-8 text-primary" />
                  </div>
                  <h3 className="font-bold text-text-primary mb-1 md:mb-2 text-sm md:text-base">{benefit.title}</h3>
                  <p className="text-xs md:text-sm text-text-secondary">{benefit.description}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Process Section */}
        <section className="py-10 md:py-16 bg-muted/50">
          <div className="container mx-auto px-4">
            <div className="text-center mb-6 md:mb-12">
              <h2 className="text-2xl md:text-4xl font-bold text-text-primary mb-3 md:mb-4">Our Process</h2>
              <p className="text-sm md:text-lg text-text-secondary max-w-3xl mx-auto">
                A proven approach to delivering quality interior finishing on every project.
              </p>
            </div>
            {/* Mobile: Compact list view */}
            <div className="md:hidden max-w-lg mx-auto space-y-3">
              {processSteps.map((step) => (
                <div key={step.step} className="flex items-start gap-3 bg-card rounded-lg p-3 border">
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {step.step}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-bold text-text-primary text-sm">{step.title}</h3>
                      <span className="text-xs text-primary whitespace-nowrap">{step.duration}</span>
                    </div>
                    <p className="text-xs text-text-secondary mt-1">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop: Grid view */}
            <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
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

        {/* FAQ Section */}
        <section className="py-10 md:py-16 bg-background">
          <div className="container mx-auto px-4">
            <div className="text-center mb-8 md:mb-12">
              <h2 className="text-2xl md:text-4xl font-bold text-text-primary mb-3 md:mb-4">Frequently Asked Questions</h2>
              <p className="text-base md:text-lg text-text-secondary max-w-3xl mx-auto">
                Common questions about our interior finishing services.
              </p>
            </div>
            <div className="max-w-4xl mx-auto">
              <Accordion type="single" collapsible className="space-y-3">
                {faqs.map((faq, index) => (
                  <AccordionItem key={index} value={`faq-${index}`} className="border rounded-lg px-4 md:px-6 bg-card">
                    <AccordionTrigger className="text-left text-sm md:text-base font-bold text-text-primary hover:no-underline py-4">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-text-secondary text-sm md:text-base">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </section>

        {/* Service Area Section */}
        <section className="py-10 md:py-16 bg-muted/50">
          <div className="container mx-auto px-4">
            <div className="text-center mb-6 md:mb-12">
              <h2 className="text-2xl md:text-4xl font-bold text-text-primary mb-3 md:mb-4">
                Interior Finishing Services Throughout Northern NJ
              </h2>
              <p className="text-sm md:text-lg text-text-secondary max-w-3xl mx-auto">
                Our drywall contractors and interior finishing specialists proudly serve homeowners across Bergen, Essex,
                and Morris counties.
              </p>
            </div>
            <div className="max-w-5xl mx-auto">
              {/* Mobile: Accordion layout */}
              <div className="md:hidden">
                <Accordion type="single" collapsible className="space-y-3">
                  <AccordionItem value="bergen" className="border rounded-lg px-4 bg-card">
                    <AccordionTrigger className="text-left font-bold text-text-primary hover:no-underline py-3">
                      Bergen County (3 areas)
                    </AccordionTrigger>
                    <AccordionContent>
                      <ul className="space-y-2 text-text-secondary text-sm pb-2">
                        <li><Link href="/locations/alpine/services/interior-finishing" className="hover:text-primary">Alpine</Link></li>
                        <li><Link href="/locations/ho-ho-kus/services/interior-finishing" className="hover:text-primary">Ho-Ho-Kus</Link></li>
                        <li><Link href="/locations/saddle-river/services/interior-finishing" className="hover:text-primary">Saddle River</Link></li>
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="essex" className="border rounded-lg px-4 bg-card">
                    <AccordionTrigger className="text-left font-bold text-text-primary hover:no-underline py-3">
                      Essex County (12 areas)
                    </AccordionTrigger>
                    <AccordionContent>
                      <ul className="grid grid-cols-2 gap-2 text-text-secondary text-sm pb-2">
                        <li><Link href="/locations/montclair/services/interior-finishing" className="hover:text-primary">Montclair</Link></li>
                        <li><Link href="/locations/short-hills/services/interior-finishing" className="hover:text-primary">Short Hills</Link></li>
                        <li><Link href="/locations/millburn/services/interior-finishing" className="hover:text-primary">Millburn</Link></li>
                        <li><Link href="/locations/livingston/services/interior-finishing" className="hover:text-primary">Livingston</Link></li>
                        <li><Link href="/locations/west-orange/services/interior-finishing" className="hover:text-primary">West Orange</Link></li>
                        <li><Link href="/locations/maplewood/services/interior-finishing" className="hover:text-primary">Maplewood</Link></li>
                        <li><Link href="/locations/bloomfield/services/interior-finishing" className="hover:text-primary">Bloomfield</Link></li>
                        <li><Link href="/locations/verona/services/interior-finishing" className="hover:text-primary">Verona</Link></li>
                        <li><Link href="/locations/essex-fells/services/interior-finishing" className="hover:text-primary">Essex Fells</Link></li>
                        <li><Link href="/locations/caldwell/services/interior-finishing" className="hover:text-primary">Caldwell</Link></li>
                        <li><Link href="/locations/west-caldwell/services/interior-finishing" className="hover:text-primary">West Caldwell</Link></li>
                        <li><Link href="/locations/clifton/services/interior-finishing" className="hover:text-primary">Clifton</Link></li>
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="morris" className="border rounded-lg px-4 bg-card">
                    <AccordionTrigger className="text-left font-bold text-text-primary hover:no-underline py-3">
                      Morris County (3 areas)
                    </AccordionTrigger>
                    <AccordionContent>
                      <ul className="space-y-2 text-text-secondary text-sm pb-2">
                        <li><Link href="/locations/morristown/services/interior-finishing" className="hover:text-primary">Morristown</Link></li>
                        <li><Link href="/locations/madison/services/interior-finishing" className="hover:text-primary">Madison</Link></li>
                        <li><Link href="/locations/parsippany/services/interior-finishing" className="hover:text-primary">Parsippany</Link></li>
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
              {/* Desktop: Grid layout */}
              <div className="hidden md:grid md:grid-cols-3 gap-8">
                <Card>
                  <CardContent className="p-6">
                    <h3 className="font-bold text-text-primary mb-4 text-lg">Bergen County</h3>
                    <ul className="space-y-2 text-text-secondary">
                      <li><Link href="/locations/alpine/services/interior-finishing" className="hover:text-primary">Alpine</Link></li>
                      <li><Link href="/locations/ho-ho-kus/services/interior-finishing" className="hover:text-primary">Ho-Ho-Kus</Link></li>
                      <li><Link href="/locations/saddle-river/services/interior-finishing" className="hover:text-primary">Saddle River</Link></li>
                    </ul>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <h3 className="font-bold text-text-primary mb-4 text-lg">Essex County</h3>
                    <ul className="space-y-2 text-text-secondary">
                      <li><Link href="/locations/montclair/services/interior-finishing" className="hover:text-primary">Montclair</Link></li>
                      <li><Link href="/locations/short-hills/services/interior-finishing" className="hover:text-primary">Short Hills</Link></li>
                      <li><Link href="/locations/millburn/services/interior-finishing" className="hover:text-primary">Millburn</Link></li>
                      <li><Link href="/locations/livingston/services/interior-finishing" className="hover:text-primary">Livingston</Link></li>
                      <li><Link href="/locations/west-orange/services/interior-finishing" className="hover:text-primary">West Orange</Link></li>
                      <li><Link href="/locations/maplewood/services/interior-finishing" className="hover:text-primary">Maplewood</Link></li>
                      <li><Link href="/locations/bloomfield/services/interior-finishing" className="hover:text-primary">Bloomfield</Link></li>
                      <li><Link href="/locations/verona/services/interior-finishing" className="hover:text-primary">Verona</Link></li>
                      <li><Link href="/locations/essex-fells/services/interior-finishing" className="hover:text-primary">Essex Fells</Link></li>
                      <li><Link href="/locations/caldwell/services/interior-finishing" className="hover:text-primary">Caldwell</Link></li>
                      <li><Link href="/locations/west-caldwell/services/interior-finishing" className="hover:text-primary">West Caldwell</Link></li>
                      <li><Link href="/locations/clifton/services/interior-finishing" className="hover:text-primary">Clifton</Link></li>
                    </ul>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <h3 className="font-bold text-text-primary mb-4 text-lg">Morris County</h3>
                    <ul className="space-y-2 text-text-secondary">
                      <li><Link href="/locations/morristown/services/interior-finishing" className="hover:text-primary">Morristown</Link></li>
                      <li><Link href="/locations/madison/services/interior-finishing" className="hover:text-primary">Madison</Link></li>
                      <li><Link href="/locations/parsippany/services/interior-finishing" className="hover:text-primary">Parsippany</Link></li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
              <p className="text-center text-text-muted mt-6 md:mt-8 text-sm md:text-base">
                Don&apos;t see your town? We serve all of Northern New Jersey.{' '}
                <Link href="/contact" className="text-primary hover:underline">
                  Contact us
                </Link>{' '}
                to discuss your project.
              </p>
            </div>
          </div>
        </section>

        {/* Cross-Sell Section */}
        <section className="py-10 md:py-16 bg-muted/50">
          <div className="container mx-auto px-4">
            <div className="text-center mb-6 md:mb-12">
              <h2 className="text-2xl md:text-4xl font-bold text-text-primary mb-3 md:mb-4">Part of a Bigger Project?</h2>
              <p className="text-sm md:text-lg text-text-secondary max-w-3xl mx-auto">
                Our interior finishing services are a natural complement to our comprehensive renovation offerings.
              </p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 max-w-5xl mx-auto">
              <Link href="/services/kitchen-remodeling" className="block group">
                <Card className="h-full transition-shadow hover:shadow-lg">
                  <CardContent className="p-3 md:p-6 text-center">
                    <h3 className="font-bold text-text-primary group-hover:text-primary transition-colors text-sm md:text-base">
                      Kitchen Remodeling
                    </h3>
                    <p className="text-xs md:text-sm text-text-secondary mt-1 md:mt-2 hidden md:block">
                      Complete kitchen transformations with expert finishing
                    </p>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/services/bathroom-renovation" className="block group">
                <Card className="h-full transition-shadow hover:shadow-lg">
                  <CardContent className="p-3 md:p-6 text-center">
                    <h3 className="font-bold text-text-primary group-hover:text-primary transition-colors text-sm md:text-base">
                      Bathroom Renovation
                    </h3>
                    <p className="text-xs md:text-sm text-text-secondary mt-1 md:mt-2 hidden md:block">Luxury bathroom updates with premium finishes</p>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/services/basement-finishing" className="block group">
                <Card className="h-full transition-shadow hover:shadow-lg">
                  <CardContent className="p-3 md:p-6 text-center">
                    <h3 className="font-bold text-text-primary group-hover:text-primary transition-colors text-sm md:text-base">
                      Basement Finishing
                    </h3>
                    <p className="text-xs md:text-sm text-text-secondary mt-1 md:mt-2 hidden md:block">
                      Transform unfinished space into living areas
                    </p>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/services/whole-home-remodeling" className="block group">
                <Card className="h-full transition-shadow hover:shadow-lg">
                  <CardContent className="p-3 md:p-6 text-center">
                    <h3 className="font-bold text-text-primary group-hover:text-primary transition-colors text-sm md:text-base">
                      Whole Home
                    </h3>
                    <p className="text-xs md:text-sm text-text-secondary mt-1 md:mt-2 hidden md:block">Complete home transformations</p>
                  </CardContent>
                </Card>
              </Link>
            </div>
          </div>
        </section>

        {/* Additional Services Mention */}
        <section className="py-8 md:py-12 bg-background">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-xl md:text-2xl font-bold text-text-primary mb-3 md:mb-4">We Also Offer</h2>
              <p className="text-text-secondary text-sm md:text-base mb-4 md:mb-6">
                In addition to interior finishing, La Vaca General Contractors provides comprehensive construction
                services including:
              </p>
              <div className="flex flex-wrap justify-center gap-2 md:gap-4">
                <span className="px-3 md:px-4 py-1.5 md:py-2 bg-muted rounded-full text-text-secondary text-sm">Exterior Work</span>
                <span className="px-3 md:px-4 py-1.5 md:py-2 bg-muted rounded-full text-text-secondary text-sm">Electrical</span>
                <span className="px-3 md:px-4 py-1.5 md:py-2 bg-muted rounded-full text-text-secondary text-sm">Plumbing</span>
              </div>
              <p className="text-xs md:text-sm text-text-muted mt-3 md:mt-4">
                Contact us to discuss your complete project needs.
              </p>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-10 md:py-16 bg-gradient-to-br from-primary to-accent-sunset text-white">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-2xl md:text-4xl font-bold mb-4 md:mb-6">Ready to Start Your Interior Finishing Project?</h2>
            <p className="text-base md:text-xl mb-6 md:mb-8 opacity-90 max-w-2xl mx-auto">
              Whether you need a single room finished or a complete interior transformation, our expert team is ready to
              deliver exceptional results.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center">
              <Button size="lg" variant="secondary" asChild>
                <Link href="/contact">Schedule Consultation</Link>
              </Button>
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10" asChild>
                <Link href="/free-estimate">Request an Estimate</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
