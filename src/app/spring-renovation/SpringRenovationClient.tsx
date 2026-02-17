'use client'

import React from 'react'
import Image from 'next/image'
import { Star, Shield, Award, Clock, Phone, CheckCircle, Sparkles, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import LandingPageLeadForm from '@/components/LandingPageLeadForm'
import BeforeAfterSlider from '@/components/BeforeAfterSlider'
import CallTrackingWrapper from '@/components/CallTrackingWrapper'
import kitchenImage from '@/assets/kitchen-project-1.jpg'
import bathroomImage from '@/assets/bathroom-project-1.jpg'
import basementImage from '@/assets/basement-project-1.jpg'

export default function SpringRenovationClient() {
  const scrollToForm = () => {
    document.getElementById('spring-form')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <>
      {/* Hero Section */}
      <section className="relative bg-secondary text-secondary-foreground overflow-hidden">
        <div className="absolute inset-0 opacity-15">
          <Image
            src={kitchenImage}
            alt=""
            fill
            className="object-cover"
            priority
          />
        </div>
        <div className="relative container mx-auto px-4 py-16 md:py-24">
          <div className="max-w-3xl mx-auto text-center">
            {/* Urgency badge */}
            <div className="inline-flex items-center gap-2 bg-primary/20 text-primary-foreground px-4 py-2 rounded-full text-sm font-medium mb-6 border border-primary/30">
              <Sparkles className="h-4 w-4" />
              Spring 2026 Special — Limited Time Offer
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
              Transform Your Home{' '}
              <span className="text-transparent bg-gradient-to-r from-primary to-accent-tangerine bg-clip-text">
                This Spring
              </span>
            </h1>
            <p className="text-xl md:text-2xl text-secondary-foreground/90 mb-8 max-w-2xl mx-auto">
              Book your free consultation this spring and start your renovation
              project with Northern NJ&apos;s most trusted contractor.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
              <Button
                onClick={scrollToForm}
                size="lg"
                className="bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button text-lg px-8 py-6 font-semibold"
              >
                Get Free Consultation
              </Button>
              <CallTrackingWrapper
                href="tel:2012124917"
                className="inline-flex items-center gap-2 text-secondary-foreground hover:text-primary transition-colors font-medium"
              >
                <Phone className="h-5 w-5" />
                Or Call (201) 212-4917
              </CallTrackingWrapper>
            </div>

            {/* Trust indicators */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-secondary-foreground/80">
              <span className="flex items-center gap-1.5">
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                5.0 on Google
              </span>
              <span className="flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-primary" /> Licensed &amp; Insured
              </span>
              <span className="flex items-center gap-1.5">
                <Award className="h-4 w-4 text-primary" /> HIC# 13VH13373800
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Why Spring Is the Best Time */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-text-primary text-center mb-4">
            Why Spring Is the{' '}
            <span className="text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text">
              Best Time to Renovate
            </span>
          </h2>
          <p className="text-text-secondary text-center mb-12 max-w-2xl mx-auto">
            Spring brings mild weather and longer days, making it the ideal season
            to start your renovation project.
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: <Calendar className="h-8 w-8 text-primary" />,
                title: 'Ideal Weather Conditions',
                desc: 'Moderate temperatures and lower humidity create perfect conditions for construction, painting, and material curing.',
              },
              {
                icon: <Clock className="h-8 w-8 text-primary" />,
                title: 'Finish Before Summer',
                desc: 'Start now and enjoy your beautiful new space by the time summer entertaining season arrives.',
              },
              {
                icon: <Award className="h-8 w-8 text-primary" />,
                title: 'Flexible Scheduling',
                desc: 'Spring bookings mean more flexible scheduling options before the busy summer construction season fills up.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="text-center p-6 rounded-xl bg-card shadow-sm border border-border"
              >
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                  {item.icon}
                </div>
                <h3 className="text-lg font-semibold text-text-primary mb-2">{item.title}</h3>
                <p className="text-text-secondary text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Popular Spring Projects */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-text-primary text-center mb-12">
            Popular Spring Renovation Projects
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                image: kitchenImage,
                title: 'Kitchen Remodeling',
                items: ['Custom cabinetry', 'Countertop upgrades', 'Full layout redesigns'],
              },
              {
                image: bathroomImage,
                title: 'Bathroom Renovation',
                items: ['Tile and stonework', 'Walk-in showers', 'Vanity and fixture upgrades'],
              },
              {
                image: basementImage,
                title: 'Basement Finishing',
                items: ['Entertainment rooms', 'Home offices', 'Guest suites'],
              },
            ].map((project) => (
              <div
                key={project.title}
                className="rounded-xl overflow-hidden bg-card shadow-sm border border-border"
              >
                <div className="relative h-48">
                  <Image
                    src={project.image}
                    alt={project.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                </div>
                <div className="p-6">
                  <h3 className="text-lg font-semibold text-text-primary mb-3">{project.title}</h3>
                  <ul className="space-y-2">
                    {project.items.map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm text-text-secondary">
                        <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Before / After Showcase */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-text-primary text-center mb-4">
            See the Transformation
          </h2>
          <p className="text-text-secondary text-center mb-10 max-w-xl mx-auto">
            Drag the slider to see before and after from our recent projects.
          </p>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div>
              <BeforeAfterSlider
                beforeImage="/images/before-kitchen-placeholder.jpg"
                afterImage="/images/after-kitchen-placeholder.jpg"
                beforeLabel="Before"
                afterLabel="After"
              />
              <p className="text-center text-sm text-text-muted mt-2">Kitchen Remodel — Montclair, NJ</p>
            </div>
            <div>
              <BeforeAfterSlider
                beforeImage="/images/before-bathroom-placeholder.jpg"
                afterImage="/images/after-bathroom-placeholder.jpg"
                beforeLabel="Before"
                afterLabel="After"
              />
              <p className="text-center text-sm text-text-muted mt-2">Bathroom Renovation — Short Hills, NJ</p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-text-primary text-center mb-12">
            What Our Clients Say
          </h2>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              {
                quote:
                  'We started our kitchen remodel in March and had it done by May. Perfect timing for summer cookouts!',
                name: 'Maria T.',
                location: 'Montclair, NJ',
              },
              {
                quote:
                  'La Vaca made our bathroom renovation stress-free. Their team was professional from start to finish.',
                name: 'David R.',
                location: 'Short Hills, NJ',
              },
              {
                quote:
                  'Our finished basement added so much value to our home. The kids love the new space. Highly recommend!',
                name: 'James K.',
                location: 'West Orange, NJ',
              },
            ].map((testimonial) => (
              <div
                key={testimonial.name}
                className="bg-card p-6 rounded-xl shadow-sm border border-border"
              >
                <div className="flex gap-0.5 mb-3">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-text-secondary italic mb-4 text-sm leading-relaxed">
                  &ldquo;{testimonial.quote}&rdquo;
                </p>
                <p className="text-text-primary font-medium text-sm">
                  {testimonial.name}
                </p>
                <p className="text-text-muted text-xs">{testimonial.location}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Lead Capture Form */}
      <section id="spring-form" className="py-16 bg-secondary text-secondary-foreground">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
            <div>
              <div className="inline-flex items-center gap-2 bg-primary/20 text-primary-foreground px-4 py-2 rounded-full text-sm font-medium mb-6 border border-primary/30">
                <Sparkles className="h-4 w-4" />
                Spring 2026 Special
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Don&apos;t Miss This Spring&apos;s Best Renovation Offer
              </h2>
              <p className="text-lg text-secondary-foreground/90 mb-6">
                Book your free consultation now. Spring slots fill up fast, and early
                projects get priority scheduling.
              </p>
              <ul className="space-y-3 mb-6">
                {[
                  'Free in-home consultation and project estimate',
                  'Priority spring scheduling',
                  'No obligation — just expert advice',
                  'Flexible financing options available',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-secondary-foreground/90">
                    <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <CallTrackingWrapper
                href="tel:2012124917"
                className="inline-flex items-center gap-2 text-primary hover:text-primary-light transition-colors font-semibold"
              >
                <Phone className="h-5 w-5" />
                Or call us: (201) 212-4917
              </CallTrackingWrapper>
            </div>

            <div>
              <LandingPageLeadForm
                source="spring-renovation-2026"
                projectType="spring-renovation"
                heading="Claim Your Free Consultation"
                subheading="Limited spring slots available. Reserve yours today."
                buttonText="Book My Free Consultation"
              />
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
