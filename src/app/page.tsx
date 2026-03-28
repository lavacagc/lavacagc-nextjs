import Header from '@/components/Header'
import Footer from '@/components/Footer'
import Hero from '@/components/Hero'
import Services from '@/components/Services'
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

const HomeEstimateForm = dynamic(() => import('@/components/HomeEstimateForm'), {
  loading: () => (
    <div className="w-full max-w-lg mx-auto h-96 bg-muted animate-pulse rounded-lg" />
  )
})

const Testimonials = dynamic(() => import('@/components/Testimonials'), {
  loading: () => (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center">
          <div className="h-8 w-48 bg-muted animate-pulse rounded mx-auto mb-4" />
          <div className="h-4 w-64 bg-muted animate-pulse rounded mx-auto" />
        </div>
      </div>
    </section>
  )
})

const ProjectGallery = dynamic(() => import('@/components/ProjectGallery'), {
  loading: () => (
    <section className="py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center">
          <div className="w-8 h-8 animate-spin mx-auto mb-4 border-4 border-primary border-t-transparent rounded-full" />
          <p>Loading projects...</p>
        </div>
      </div>
    </section>
  )
})

const ServiceAreas = dynamic(() => import('@/components/ServiceAreas'), {
  loading: () => (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-4">
        <div className="h-12 w-1/2 bg-muted animate-pulse rounded mx-auto mb-16" />
        <div className="h-48 w-full bg-muted animate-pulse rounded" />
      </div>
    </section>
  )
})

const WhyChoose = dynamic(() => import('@/components/WhyChoose'), {
  loading: () => (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-4">
        <div className="h-12 w-1/3 bg-muted animate-pulse rounded mx-auto mb-16" />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-8">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-48 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    </section>
  )
})

// const MobileContactBanner = dynamic(() => import('@/components/MobileContactBanner'))
const TrackedSection = dynamic(() => import('@/components/TrackedSection'))

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main id="main-content" className="pb-20 md:pb-0">
        <Hero />

        {/* Project Gallery — moved up for immediate visual impact */}
        <div id="projects" className="scroll-mt-20">
          <ProjectGallery />
        </div>

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
                  href="/free-estimate"
                  className="text-primary hover:text-accent-sunset underline font-medium transition-colors"
                >
                  request a free estimate directly through our online form
                </Link>
              </p>
            </div>
            <HomeEstimateForm />
          </div>
        </TrackedSection>

        {/* Testimonials Section - Tracked */}
        <TrackedSection
          sectionId="testimonials-section"
          sectionName="Testimonials Section"
          className=""
        >
          <Testimonials />
        </TrackedSection>

        {/* Services Section - Tracked */}
        <TrackedSection
          sectionId="services-section"
          sectionName="Services Horizontal Scroll"
          className=""
        >
          <Services />
        </TrackedSection>

        {/* Why Choose Section - Tracked */}
        <TrackedSection
          sectionId="why-choose-section"
          sectionName="Why Choose Us Section"
          className=""
        >
          <WhyChoose />
        </TrackedSection>

        {/* Featured Services Section */}
        <TrackedSection
          sectionId="featured-services"
          sectionName="Featured Services Grid"
          className="py-20 bg-background-soft"
        >
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold text-text-primary mb-6">
                Our Specialty
                <span className="text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text"> Services</span>
              </h2>
              <p className="text-xl text-text-secondary max-w-3xl mx-auto">
                Expert craftsmanship in every area of home renovation
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Link href="/services/kitchen-remodeling" className="group">
                <div className="p-6 bg-card border rounded-lg hover:shadow-elegant transition-all duration-300 hover:-translate-y-1">
                  <h3 className="text-xl font-bold text-text-primary mb-3 group-hover:text-primary transition-colors">Kitchen Remodeling</h3>
                  <p className="text-text-secondary">Transform your kitchen with luxury finishes and expert craftsmanship</p>
                </div>
              </Link>
              <Link href="/services/bathroom-renovation" className="group">
                <div className="p-6 bg-card border rounded-lg hover:shadow-elegant transition-all duration-300 hover:-translate-y-1">
                  <h3 className="text-xl font-bold text-text-primary mb-3 group-hover:text-primary transition-colors">Bathroom Renovation</h3>
                  <p className="text-text-secondary">Create your perfect spa-like retreat with modern amenities</p>
                </div>
              </Link>
              <Link href="/services/basement-finishing" className="group">
                <div className="p-6 bg-card border rounded-lg hover:shadow-elegant transition-all duration-300 hover:-translate-y-1">
                  <h3 className="text-xl font-bold text-text-primary mb-3 group-hover:text-primary transition-colors">Basement Finishing</h3>
                  <p className="text-text-secondary">Add valuable living space with professional basement finishing</p>
                </div>
              </Link>
              <Link href="/services/home-additions" className="group">
                <div className="p-6 bg-card border rounded-lg hover:shadow-elegant transition-all duration-300 hover:-translate-y-1">
                  <h3 className="text-xl font-bold text-text-primary mb-3 group-hover:text-primary transition-colors">Home Additions</h3>
                  <p className="text-text-secondary">Expand your home with seamless, custom-designed additions</p>
                </div>
              </Link>
            </div>
          </div>
        </TrackedSection>

        {/* Service Areas Section — moved to bottom (SEO value, less critical for ad traffic) */}
        <TrackedSection
          sectionId="service-areas-section"
          sectionName="Service Areas Section"
          className=""
        >
          <ServiceAreas />
        </TrackedSection>
      </main>
      <Footer />
      {/* MobileContactBanner removed — StickyCTA in layout.tsx handles mobile CTA */}
    </div>
  )
}
