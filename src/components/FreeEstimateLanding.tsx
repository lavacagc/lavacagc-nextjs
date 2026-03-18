'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import logo from '@/assets/logo.png';
import { Phone, Star, Shield, Award, Clock, ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import LandingPageLeadForm from '@/components/LandingPageLeadForm';
import CallTrackingWrapper from '@/components/CallTrackingWrapper';
import { trackEvent, trackScrollDepth } from '@/services/analyticsManager';
import PortfolioContent from '@/components/PortfolioContent';

// PortfolioContent wrapper that accepts a defaultFilter and renders within landing page
function LandingPortfolioContent({ projects, defaultFilter }: { projects: Project[]; defaultFilter: string }) {
  const portfolioProjects = projects.map((p) => ({
    ...p,
    featured_image_id: '',
    project_images: p.project_images.map((img) => ({
      ...img,
      media_type: (img.media_type === 'video' ? 'video' : 'image') as 'image' | 'video',
    })),
  }));

  return <PortfolioContent projects={portfolioProjects} defaultFilter={defaultFilter} />;
}

interface Project {
  id: string;
  title: string;
  location: string;
  service_types: string[];
  challenge: string;
  solution: string;
  url_slug: string;
  project_images: Array<{
    image_url: string;
    image_category: string;
    alt_text: string;
    is_featured?: boolean;
    media_type?: string;
  }>;
}

interface GoogleReview {
  id: string;
  reviewer_name: string | null;
  star_rating: number;
  comment: string | null;
  create_time: string | null;
}

interface FreeEstimateLandingProps {
  headline: string;
  service: string;
  city?: string;
  projects: Project[];
  reviews: GoogleReview[];
  blogPost: { title: string; slug: string; excerpt: string } | null;
  utmCampaign?: string;
  utmContent?: string;
  defaultFilter?: string;
}

export default function FreeEstimateLanding({
  headline,
  service,
  city,
  projects,
  reviews,
  blogPost,
  utmCampaign,
  utmContent,
  defaultFilter = 'All Projects',
}: FreeEstimateLandingProps) {
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);

  // Scroll depth tracking — fires at 25%, 50%, 75%, 100%
  useEffect(() => {
    const firedDepths = new Set<number>();
    const thresholds = [25, 50, 75, 100];
    const startTime = Date.now();

    // Track page load
    trackEvent('landing_page_view', {
      service,
      city: city || 'none',
      utm_campaign: utmCampaign || 'none',
      utm_content: utmContent || 'none',
    });

    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;
      const scrollPercent = Math.round((scrollTop / docHeight) * 100);

      for (const threshold of thresholds) {
        if (scrollPercent >= threshold && !firedDepths.has(threshold)) {
          firedDepths.add(threshold);
          const timeOnPage = Math.round((Date.now() - startTime) / 1000);
          trackScrollDepth('free-estimate-landing', threshold, `lp-${service}`);
          trackEvent('lp_scroll_depth', {
            depth: threshold,
            service,
            city: city || 'none',
            time_on_page: timeOnPage,
          });
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [service, city, utmCampaign, utmContent]);

  // Rotate reviews every 8 seconds
  useEffect(() => {
    if (reviews.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentReviewIndex((prev) => (prev + 1) % reviews.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [reviews.length]);

  const nextReview = useCallback(() => {
    setCurrentReviewIndex((prev) => (prev + 1) % reviews.length);
  }, [reviews.length]);

  const prevReview = useCallback(() => {
    setCurrentReviewIndex((prev) => (prev - 1 + reviews.length) % reviews.length);
  }, [reviews.length]);

  // Get hero image from first project matching the service filter, or fallback to first project
  const heroProject = defaultFilter !== 'All Projects'
    ? projects.find((p) => p.service_types?.some((st) => st === defaultFilter)) || projects[0]
    : projects[0];
  const heroImage = heroProject?.project_images?.find((img) => img.is_featured)?.image_url
    || heroProject?.project_images?.[0]?.image_url;

  const formSource = `landing-free-estimate${service !== 'general' ? `-${service}` : ''}${city ? `-${city}` : ''}`;
  const projectType = service !== 'general' ? service : 'home renovation';

  return (
    <div className="min-h-screen bg-background">
      {/* Trust Bar */}
      <div className="bg-secondary text-secondary-foreground py-2 text-sm">
        <div className="container mx-auto px-4 text-center">
          <span className="font-medium">Licensed, Bonded &amp; Insured | HIC# 13VH13373800</span>
        </div>
      </div>

      {/* Minimal Header — logo + phone only */}
      <header className="bg-background border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-14 md:h-16">
            <div className="flex items-center space-x-2">
              <Image
                src={logo}
                alt="La Vaca General Contractors"
                className="h-8 md:h-12 w-auto"
                priority
              />
              <div className="text-left">
                <span className="font-bold text-sm md:text-base text-text-primary block leading-tight">La Vaca</span>
                <p className="text-xs text-text-muted -mt-0.5">General Contractors</p>
              </div>
            </div>

            <CallTrackingWrapper
              href="tel:2012124917"
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold text-sm md:text-base hover:bg-primary-dark transition-colors cursor-pointer"
            >
              <Phone className="h-4 w-4" />
              <span className="hidden sm:inline">(201) 212-4917</span>
              <span className="sm:hidden">Call Now</span>
            </CallTrackingWrapper>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section data-section="hero-form" className="relative">
        {/* Hero background */}
        <div className="absolute inset-0 z-0">
          {heroImage ? (
            <Image
              src={heroImage}
              alt={heroProject?.title || 'Home renovation project'}
              fill
              className="object-cover"
              priority
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-secondary to-secondary/80" />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/40" />
        </div>

        <div className="relative z-10 container mx-auto px-4 py-16 md:py-24">
          <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
            {/* Left: Headline + trust signals */}
            <div className="text-white">
              <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-4">
                {headline}
              </h1>
              <p className="text-lg md:text-xl text-white/90 mb-6">
                Northern NJ&apos;s trusted renovation experts. Free estimates, no obligation.
              </p>

              {/* Trust badges */}
              <div className="flex flex-wrap gap-4 mb-6">
                <div className="flex items-center gap-2 text-sm text-white/90">
                  <Shield className="h-5 w-5 text-primary" />
                  <span>Licensed &amp; Insured</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-white/90">
                  <Star className="h-5 w-5 text-primary" />
                  <span>5-Star Google Reviews</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-white/90">
                  <Clock className="h-5 w-5 text-primary" />
                  <span>Response in 2 Hours</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-white/90">
                  <Award className="h-5 w-5 text-primary" />
                  <span>Satisfaction Guaranteed</span>
                </div>
              </div>

              {/* Quick review preview on mobile */}
              {reviews.length > 0 && (
                <div className="md:hidden bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                  <div className="flex gap-1 mb-2">
                    {[...Array(reviews[currentReviewIndex]?.star_rating || 5)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                    ))}
                  </div>
                  <p className="text-sm text-white/90 line-clamp-3 italic">
                    &ldquo;{reviews[currentReviewIndex]?.comment}&rdquo;
                  </p>
                  <p className="text-xs text-white/70 mt-2">
                    — {reviews[currentReviewIndex]?.reviewer_name || 'Verified Customer'}
                  </p>
                </div>
              )}
            </div>

            {/* Right: Lead form */}
            <div className="bg-white rounded-xl shadow-2xl p-1">
              <LandingPageLeadForm
                source={formSource}
                projectType={projectType}
                heading="Get Your Free Estimate"
                subheading="Tell us about your project — we'll respond within 2 hours."
                buttonText="Get My Free Estimate →"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Portfolio — See the Transformation */}
      {projects.length > 0 && (
        <section className="bg-white">
          <div className="container mx-auto px-4 pt-12 md:pt-16">
            <h2 className="text-2xl md:text-3xl font-bold text-text-primary text-center mb-0">
              See the Transformation
            </h2>
          </div>
          <LandingPortfolioContent projects={projects} defaultFilter={defaultFilter} />
        </section>
      )}

      {/* Reviews Carousel — below portfolio */}
      {reviews.length > 0 && (
        <section data-section="trust-signals" className="py-12 md:py-16 bg-white">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-2xl md:text-3xl font-bold text-text-primary mb-2">
                What Our Clients Say
              </h2>
              <div className="flex justify-center gap-1 mb-8">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-6 w-6 fill-primary text-primary" />
                ))}
              </div>

              {/* Review card */}
              <div className="relative bg-background rounded-xl p-8 md:p-10 shadow-sm border">
                <div className="text-6xl text-primary/20 absolute top-4 left-6 font-serif">&ldquo;</div>
                <p className="text-lg md:text-xl text-text-secondary leading-relaxed mb-6 relative z-10">
                  {reviews[currentReviewIndex]?.comment}
                </p>
                <div className="flex items-center justify-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-primary font-bold text-lg">
                      {reviews[currentReviewIndex]?.reviewer_name?.[0] || 'C'}
                    </span>
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-text-primary">
                      {reviews[currentReviewIndex]?.reviewer_name || 'Verified Customer'}
                    </p>
                    <div className="flex gap-0.5">
                      {[...Array(reviews[currentReviewIndex]?.star_rating || 5)].map((_, i) => (
                        <Star key={i} className="h-3.5 w-3.5 fill-primary text-primary" />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Navigation arrows */}
                {reviews.length > 1 && (
                  <>
                    <button
                      onClick={prevReview}
                      className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background border hover:bg-muted transition-colors cursor-pointer"
                      aria-label="Previous review"
                    >
                      <ChevronLeft className="h-5 w-5 text-text-secondary" />
                    </button>
                    <button
                      onClick={nextReview}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background border hover:bg-muted transition-colors cursor-pointer"
                      aria-label="Next review"
                    >
                      <ChevronRight className="h-5 w-5 text-text-secondary" />
                    </button>
                  </>
                )}
              </div>

              {/* Dots */}
              {reviews.length > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                  {reviews.slice(0, Math.min(reviews.length, 8)).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentReviewIndex(i)}
                      className={`h-2 w-2 rounded-full transition-colors cursor-pointer ${
                        i === currentReviewIndex ? 'bg-primary' : 'bg-primary/20'
                      }`}
                      aria-label={`Go to review ${i + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Engagement Content — Blog excerpt */}
      {blogPost && (
        <section data-section="reviews" className="py-12 md:py-16 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto bg-white rounded-xl p-8 shadow-sm border">
              <div className="flex items-start gap-4">
                <div className="hidden md:block h-12 w-12 rounded-lg bg-primary/10 flex-shrink-0 flex items-center justify-center">
                  <Award className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-text-primary mb-2">{blogPost.title}</h3>
                  <p className="text-text-secondary leading-relaxed mb-4">{blogPost.excerpt}</p>
                  <Link
                    href={`/blog/${blogPost.slug}`}
                    className="inline-flex items-center gap-1 text-primary font-medium hover:underline cursor-pointer"
                  >
                    Read More <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Sticky Bottom CTA (mobile) */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t border-border shadow-lg">
        <div className="flex items-center gap-3 p-3">
          <CallTrackingWrapper
            href="tel:2012124917"
            className="flex-1 flex items-center justify-center gap-2 bg-secondary text-secondary-foreground py-3 rounded-lg font-semibold text-sm cursor-pointer"
          >
            <Phone className="h-4 w-4" />
            Call Now
          </CallTrackingWrapper>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-lg font-semibold text-sm cursor-pointer"
          >
            Get Free Estimate
          </button>
        </div>
      </div>

      {/* Bottom spacer for mobile sticky bar */}
      <div className="h-20 md:hidden" />

    </div>
  );
}
