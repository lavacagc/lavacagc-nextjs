import Header from '@/components/Header'
import Footer from '@/components/Footer'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Premium Home Remodeling Northern New Jersey | La Vaca General Contractors',
  description: 'Transform your home with Northern NJ\'s trusted renovation experts. Kitchen remodeling, bathroom renovation, basement finishing & home additions. Licensed, bonded & insured.',
  keywords: 'home remodeling northern new jersey, kitchen remodeling nj, bathroom renovation nj, basement finishing nj, home additions nj, general contractor nj',
  openGraph: {
    title: 'Premium Home Remodeling Northern New Jersey | La Vaca General Contractors',
    description: 'Transform your home with Northern NJ\'s trusted renovation experts.',
    url: 'https://www.lavacagc.com',
    images: [
      {
        url: 'https://www.lavacagc.com/logo.webp',
        width: 800,
        height: 800,
        alt: 'La Vaca General Contractors - Premium Home Remodeling NJ',
      },
    ],
  },
  alternates: {
    canonical: 'https://www.lavacagc.com',
  },
}

// Redesigned components
const HeroRedesign = dynamic(() => import('@/components/redesign/HeroRedesign'), {
  loading: () => <div className="h-screen bg-slate-900 animate-pulse" />,
})

const ServicesBento = dynamic(() => import('@/components/redesign/ServicesBento'), {
  loading: () => (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded mx-auto mb-16" />
        <div className="grid grid-cols-3 gap-6 h-[500px]">
          <div className="col-span-2 row-span-2 bg-muted animate-pulse rounded-2xl" />
          <div className="bg-muted animate-pulse rounded-2xl" />
          <div className="bg-muted animate-pulse rounded-2xl" />
        </div>
      </div>
    </section>
  ),
})

const HomeEstimateForm = dynamic(() => import('@/components/HomeEstimateForm'), {
  loading: () => (
    <div className="w-full max-w-lg mx-auto h-96 bg-muted animate-pulse rounded-lg" />
  ),
})

const TestimonialsMarquee = dynamic(() => import('@/components/redesign/TestimonialsMarquee'), {
  loading: () => (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-4 text-center">
        <div className="h-8 w-48 bg-muted animate-pulse rounded mx-auto mb-4" />
      </div>
    </section>
  ),
})

const WhyChooseRedesign = dynamic(() => import('@/components/redesign/WhyChooseRedesign'), {
  loading: () => (
    <section className="py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded mx-auto mb-16" />
        <div className="grid grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 bg-muted animate-pulse rounded-2xl" />
          ))}
        </div>
      </div>
    </section>
  ),
})

const ServiceAreasRedesign = dynamic(() => import('@/components/redesign/ServiceAreasRedesign'), {
  loading: () => (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded mx-auto mb-16" />
      </div>
    </section>
  ),
})

const FinalCTA = dynamic(() => import('@/components/redesign/FinalCTA'), {
  loading: () => <div className="h-96 bg-slate-900 animate-pulse" />,
})

const ProjectGallery = dynamic(() => import('@/components/ProjectGallery'), {
  loading: () => (
    <section className="py-20 bg-muted/30">
      <div className="container mx-auto px-4 text-center">
        <div className="w-8 h-8 animate-spin mx-auto mb-4 border-4 border-primary border-t-transparent rounded-full" />
        <p>Loading projects...</p>
      </div>
    </section>
  ),
})

const MobileContactBanner = dynamic(() => import('@/components/MobileContactBanner'))
const TrackedSection = dynamic(() => import('@/components/TrackedSection'))

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main id="main-content" className="pb-20 md:pb-0">
        {/* Hero — Full viewport with scroll zoom */}
        <HeroRedesign />

        {/* Quick Estimate Section */}
        <TrackedSection
          sectionId="estimate-section"
          sectionName="Quick Estimate Form"
          id="estimate"
          className="py-16 bg-muted relative scroll-mt-20"
        >
          <div className="absolute inset-0 opacity-5">
            <div className="absolute top-10 right-10 w-24 h-24 bg-primary rounded-full blur-2xl"></div>
            <div className="absolute bottom-10 left-10 w-32 h-32 bg-accent-sunset rounded-full blur-2xl"></div>
          </div>
          <div className="container mx-auto px-4 relative">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">
                Schedule your Estimate in
                <span className="text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text"> 2 minutes</span>
              </h2>
              <p className="text-xl text-text-secondary max-w-2xl mx-auto">
                Start your renovation journey with a quick estimate. No commitment, just expert insights for your project.
              </p>
              <p className="hidden lg:block text-lg text-text-muted max-w-2xl mx-auto mt-4">
                Or{" "}
                <Link
                  href="/project-calculator"
                  className="text-primary hover:text-accent-sunset underline font-medium transition-colors"
                >
                  estimate your own project in 5 minutes using our cost calculator
                </Link>
              </p>
            </div>
            <HomeEstimateForm />
          </div>
        </TrackedSection>

        {/* Services — Bento Grid */}
        <TrackedSection
          sectionId="services-section"
          sectionName="Services Bento Grid"
          className=""
        >
          <ServicesBento />
        </TrackedSection>

        {/* Testimonials — Animated Marquee */}
        <TrackedSection
          sectionId="testimonials-section"
          sectionName="Testimonials Marquee"
          className=""
        >
          <TestimonialsMarquee />
        </TrackedSection>

        {/* Project Gallery */}
        <div id="projects" className="scroll-mt-20">
          <ProjectGallery />
        </div>

        {/* Why Choose Us — Feature Cards */}
        <TrackedSection
          sectionId="why-choose-section"
          sectionName="Why Choose Us"
          className=""
        >
          <WhyChooseRedesign />
        </TrackedSection>

        {/* Service Areas — Animated Tags */}
        <TrackedSection
          sectionId="service-areas-section"
          sectionName="Service Areas"
          className=""
        >
          <ServiceAreasRedesign />
        </TrackedSection>

        {/* Final CTA — Aurora Background */}
        <TrackedSection
          sectionId="final-cta"
          sectionName="Final CTA"
          className=""
        >
          <FinalCTA />
        </TrackedSection>
      </main>
      <Footer />
      <MobileContactBanner />
    </div>
  )
}
