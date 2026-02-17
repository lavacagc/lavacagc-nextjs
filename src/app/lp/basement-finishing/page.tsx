import type { Metadata } from 'next'
import LandingPageHeader from '@/components/LandingPageHeader'
import LandingPageLeadForm from '@/components/LandingPageLeadForm'
import { Star, Shield, Clock, Award, Phone, CheckCircle } from 'lucide-react'
import Image from 'next/image'
import basementImage from '@/assets/basement-project-1.jpg'
import CallTrackingWrapper from '@/components/CallTrackingWrapper'

export const metadata: Metadata = {
  title: 'Basement Finishing in NJ | Free Estimate | La Vaca GC',
  description:
    'Unlock your basement\'s full potential with NJ\'s expert finishing contractors. Custom designs, waterproofing, and full buildouts. Licensed & insured. Free estimates.',
  robots: { index: false, follow: false },
}

export default function BasementFinishingLandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingPageHeader />

      {/* Hero */}
      <section className="relative bg-secondary text-secondary-foreground overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <Image
            src={basementImage}
            alt=""
            fill
            className="object-cover"
            priority
          />
        </div>
        <div className="relative container mx-auto px-4 py-12 md:py-20">
          <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
            <div>
              <div className="flex items-center gap-1.5 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                ))}
                <span className="ml-2 text-sm font-medium">5.0 Rating on Google</span>
              </div>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4 leading-tight">
                Turn Your Basement Into Living Space You&apos;ll Love
              </h1>
              <p className="text-lg md:text-xl text-secondary-foreground/90 mb-6">
                Professional basement finishing in Northern New Jersey. Add a family room,
                home office, gym, or entertainment space below your home.
              </p>
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="flex items-center gap-1.5">
                  <Shield className="h-4 w-4 text-primary" /> Licensed &amp; Insured
                </span>
                <span className="flex items-center gap-1.5">
                  <Award className="h-4 w-4 text-primary" /> NJ HIC# 13VH13373800
                </span>
              </div>
            </div>

            <div>
              <LandingPageLeadForm
                source="google-ads-basement"
                projectType="basement"
                heading="Get Your Free Basement Estimate"
                subheading="No obligation. We'll call within 24 hours."
                buttonText="Get My Free Basement Estimate"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-text-primary text-center mb-12">
            Why Homeowners Choose{' '}
            <span className="text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text">
              La Vaca GC
            </span>
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: <Award className="h-8 w-8 text-primary" />,
                title: 'Maximize Your Home Value',
                desc: 'A finished basement adds significant square footage and can increase your home\'s value by 70% of the investment.',
              },
              {
                icon: <Shield className="h-8 w-8 text-primary" />,
                title: 'Waterproofing Included',
                desc: 'Every basement project starts with proper moisture control. We ensure your new space stays dry and comfortable year-round.',
              },
              {
                icon: <Clock className="h-8 w-8 text-primary" />,
                title: 'Efficient Build Process',
                desc: 'Our team coordinates framing, electrical, plumbing, HVAC, and finishing in a streamlined process with clear timelines.',
              },
            ].map((benefit) => (
              <div
                key={benefit.title}
                className="text-center p-6 rounded-xl bg-card shadow-sm border border-border"
              >
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                  {benefit.icon}
                </div>
                <h3 className="text-lg font-semibold text-text-primary mb-2">{benefit.title}</h3>
                <p className="text-text-secondary text-sm">{benefit.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What's Included */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-text-primary text-center mb-8">
            Our Basement Finishing Includes
          </h2>
          <div className="max-w-2xl mx-auto grid sm:grid-cols-2 gap-3">
            {[
              'Waterproofing and moisture barriers',
              'Framing and insulation',
              'Electrical wiring and lighting',
              'HVAC extensions and ductwork',
              'Drywall and painting',
              'Flooring installation',
              'Bathroom rough-in and buildout',
              'Full project management',
            ].map((item) => (
              <div key={item} className="flex items-start gap-2 p-3 bg-card rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-text-secondary">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <div className="flex justify-center gap-1 mb-4">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="h-6 w-6 fill-yellow-400 text-yellow-400" />
            ))}
          </div>
          <blockquote className="text-xl md:text-2xl text-text-primary italic mb-4 leading-relaxed">
            &ldquo;We turned our unused basement into a game room and home theater. The
            kids practically live down there now. La Vaca handled the permits, waterproofing,
            everything. Highly recommend!&rdquo;
          </blockquote>
          <p className="text-text-secondary font-medium">
            &mdash; James K., West Orange, NJ
          </p>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-12 bg-secondary text-secondary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Ready to Finish Your Basement?
          </h2>
          <p className="text-lg mb-6 text-secondary-foreground/90">
            Call us now or fill out the form above for a free, no-obligation estimate.
          </p>
          <CallTrackingWrapper
            href="tel:2012124917"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-primary to-accent-tangerine text-white font-bold px-8 py-4 rounded-lg text-lg hover:shadow-button transition-all duration-300"
          >
            <Phone className="h-5 w-5" />
            (201) 212-4917
          </CallTrackingWrapper>
        </div>
      </section>

      {/* Minimal Footer */}
      <footer className="bg-secondary/95 text-secondary-foreground/70 py-6 text-center text-sm">
        <div className="container mx-auto px-4">
          <p>&copy; {new Date().getFullYear()} La Vaca General Contractors, LLC. All rights reserved.</p>
          <p className="mt-1">Licensed, Bonded, &amp; Insured | HIC# 13VH13373800</p>
        </div>
      </footer>
    </div>
  )
}
