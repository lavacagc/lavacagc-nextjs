import { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ProcessPageClient from '@/components/ProcessPageClient';
import HowToSchema from '@/components/seo/HowToSchema';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Our 6-Step Home Remodeling Process',
  description:
    'How a La Vaca remodel runs step by step, plus the client portal with daily photo updates, material selections and digital contracts.',
  keywords:
    'home remodeling process, renovation steps, NJ contractor process, kitchen remodel timeline, bathroom renovation process, home improvement steps',
  openGraph: {
    title: 'Our 6-Step Home Remodeling Process | La Vaca GC',
    description:
      'Transparent, systematic remodeling process that ensures quality results. From consultation to final walkthrough.',
    type: 'website',
    url: 'https://www.lavacagc.com/process',
    images: [
      {
        url: 'https://www.lavacagc.com/og-process.jpg',
        width: 1200,
        height: 630,
        alt: 'La Vaca General Contractors Remodeling Process',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Our Remodeling Process | La Vaca GC',
    description: '6-step proven process for quality home renovations',
  },
  alternates: {
    canonical: 'https://www.lavacagc.com/process',
  },
};

// Process steps data (shared between server and client)
const processSteps = [
  {
    number: 1,
    title: 'Initial Consultation',
    duration: '1-2 hours',
    description:
      "We start with an in-depth consultation to understand your vision, needs, and budget. During this meeting, we'll discuss your project goals, preferred timeline, and any specific requirements.",
    details: [
      'Detailed discussion of your project vision',
      'Assessment of your space and current conditions',
      'Budget and timeline expectations',
      'Style preferences and material choices',
      'Initial feasibility assessment',
    ],
  },
  {
    number: 2,
    title: 'Design & Planning',
    duration: '1-2 weeks',
    description:
      'Our team creates detailed plans and 3D renderings of your project. We work closely with you to refine the design until it perfectly matches your vision.',
    details: [
      'Detailed measurements and site survey',
      'CAD drawings and 3D renderings',
      'Material selection and sourcing',
      'Engineering and structural assessments',
      'Design revisions based on your feedback',
    ],
  },
  {
    number: 3,
    title: 'Detailed Estimate',
    duration: '2-3 days',
    description:
      'We provide a comprehensive, transparent estimate that breaks down all costs including materials, labor, permits, and timeline. No hidden fees or surprises.',
    details: [
      'Itemized cost breakdown',
      'Material specifications and allowances',
      'Labor and subcontractor costs',
      'Permit and inspection fees',
      'Project timeline with milestones',
    ],
  },
  {
    number: 4,
    title: 'Contract & Permits',
    duration: '1-2 weeks',
    description:
      'Once you approve the estimate, we handle all permits and paperwork. Our detailed contract protects both parties and clearly outlines the project scope.',
    details: [
      'Comprehensive project contract',
      'Permit applications and approvals',
      'Insurance and warranty documentation',
      'Project schedule finalization',
      'Material ordering and delivery coordination',
    ],
  },
  {
    number: 5,
    title: 'Construction',
    duration: 'Varies by project',
    description:
      'Our skilled craftsmen bring your vision to life with daily progress updates and quality control checks. We maintain a clean, organized worksite and respect your home.',
    details: [
      'Daily progress updates and photos',
      'Regular quality control inspections',
      'Coordination with subcontractors',
      'Clean worksite maintenance',
      'Flexible scheduling to minimize disruption',
    ],
  },
  {
    number: 6,
    title: 'Final Walkthrough',
    duration: '1-2 hours',
    description:
      'We conduct a thorough final inspection with you to ensure every detail meets our high standards. Any punch list items are addressed immediately.',
    details: [
      'Comprehensive final inspection',
      'Punch list creation and completion',
      'Care and maintenance instructions',
      'Warranty documentation',
      'Final project photos and documentation',
    ],
  },
];

// Convert process steps to HowTo schema format
const howToSteps = processSteps.map((step) => ({
  name: step.title,
  text: `${step.description} Includes: ${step.details.join(', ')}`,
  tool: step.title.includes('Consultation')
    ? 'Project assessment tools and consultation materials'
    : step.title.includes('Design')
      ? 'CAD software and design tools'
      : step.title.includes('Estimate')
        ? 'Cost calculation and project management software'
        : step.title.includes('Contract')
          ? 'Legal documentation and permit application tools'
          : step.title.includes('Construction')
            ? 'Professional construction equipment and tools'
            : 'Quality control and inspection tools',
}));

export default function ProcessPage() {
  // Breadcrumb JSON-LD
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://www.lavacagc.com',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Our Process',
        item: 'https://www.lavacagc.com/process',
      },
    ],
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <main className="flex-1">
        {/* Hero Section - Server Rendered for SEO */}
        <section className="py-8 md:py-16 bg-gradient-subtle">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <nav aria-label="Breadcrumb" className="mb-6">
                <ol className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
                  <li>
                    <Link href="/" className="hover:text-primary">
                      Home
                    </Link>
                  </li>
                  <li>/</li>
                  <li className="text-foreground font-medium">Our Process</li>
                </ol>
              </nav>

              <h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-6">
                Our Proven Remodeling Process
              </h1>
              <p className="text-xl text-text-secondary leading-relaxed mb-8">
                From first consultation to final walkthrough — plus a personal project portal where you can 
                track every selection, see daily photos, and approve contracts from your phone.
              </p>
              <Link
                href="/#estimate"
                className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button text-white h-11 px-8"
              >
                Start Your Project Today
              </Link>
            </div>
          </div>
        </section>

        {/* Interactive Process Content - Client Component */}
        <ProcessPageClient processSteps={processSteps} />

        {/* HowTo Schema - Server Rendered */}
        <div className="container mx-auto px-4">
          <HowToSchema
            name="Home Remodeling Process"
            description="Our comprehensive 6-step remodeling process ensures quality results with professional service from initial consultation through final walkthrough."
            steps={howToSteps}
            totalTime="P8W"
            difficulty="Professional"
            tools={[
              'Professional design software',
              'Project management tools',
              'Licensed construction equipment',
              'Quality control instruments',
              'Safety equipment and tools',
            ]}
            materials={[
              'Quality building materials',
              'Professional-grade fixtures',
              'Premium finishes and hardware',
              'Electrical and plumbing components',
              'Insulation and structural materials',
            ]}
            showVisual={false}
          />
        </div>
      </main>

      <Footer />
    </div>
  );
}
