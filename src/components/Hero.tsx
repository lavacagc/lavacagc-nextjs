'use client'

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Star, Shield, Award, Users, ChevronDown } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from '@/integrations/supabase/client';

// Hero background video - single optimized video for consistent LCP performance
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const DEFAULT_VIDEO = `${SUPABASE_URL}/storage/v1/object/public/hero-videos/hero-background-1.mp4`;

const Hero = () => {
  const router = useRouter();
  const pathname = usePathname();
  const videoRef = React.useRef<HTMLVideoElement>(null);

  // Start with static data, render immediately
  const [averageRating, setAverageRating] = React.useState('5.0');
  const [reviewCount, setReviewCount] = React.useState(0);

  // Fetch after initial render to not block LCP
  React.useEffect(() => {
    const timer = setTimeout(() => {
      supabase
        .from('google_reviews')
        .select('star_rating')
        .then(({ data }) => {
          if (data && data.length > 0) {
            const avg = (data.reduce((acc, review) => acc + review.star_rating, 0) / data.length).toFixed(1);
            setAverageRating(avg);
            setReviewCount(data.length);
          }
        });
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Set video playback speed - 0.75x on desktop, 1x on mobile
  React.useEffect(() => {
    if (videoRef.current) {
      // Check if mobile device (screen width < 768px)
      const isMobile = window.innerWidth < 768;
      videoRef.current.playbackRate = isMobile ? 1.0 : 0.75;
    }
  }, []);

  const scrollToEstimate = () => {
    // On mobile and tablet (below lg breakpoint = 1024px), go to estimate page
    if (window.innerWidth < 1024) {
      router.push('/free-estimate');
      return;
    }

    // On desktop, scroll to estimate form
    if (pathname !== '/') {
      router.push('/');
      setTimeout(() => {
        document.getElementById('estimate')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }, 100);
    } else {
      document.getElementById('estimate')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  };
  return (
    <section className="relative bg-gradient-to-br from-background via-background to-muted py-10 md:py-20 lg:py-32 overflow-hidden">
      {/* Background Video Layer - Single optimized video for consistent LCP */}
      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        className="absolute inset-0 w-full h-full object-cover z-0"
        aria-label="Background video of home remodeling project"
      >
        <source src={DEFAULT_VIDEO} type="video/mp4" />
      </video>

      {/* White Overlay for Text Legibility - 75% opacity */}
      <div className="absolute inset-0 bg-white/75 z-10"></div>

      {/* Gradient overlay - transitions to muted color on lower 4/5ths for seamless transition to next section */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/50 to-muted z-10" style={{ backgroundPosition: '0 20%' }}></div>

      {/* Background Pattern (kept for fallback aesthetics) */}
      <div className="absolute inset-0 opacity-5 z-10">
        <div className="absolute top-20 left-20 w-32 h-32 bg-primary rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 right-20 w-40 h-40 bg-accent-sunset rounded-full blur-3xl"></div>
      </div>

      <div className="container mx-auto px-4 relative z-20">
        <div className="max-w-4xl mx-auto text-center" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}>
          {/* Main Heading */}
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-text-primary mb-6 leading-tight">
            Premium Home Remodeling
            <span className="block text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text">
              Northern New Jersey
            </span>
          </h1>

          {/* Subheading */}
          <p className="text-xl md:text-2xl text-text-secondary mb-8 max-w-3xl mx-auto leading-relaxed">
            Transform Your Kitchen, Bathroom, Basement, or Entire Home with Northern NJ&apos;s
            <span className="font-semibold text-secondary"> Trusted Renovation Experts</span>
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button
              onClick={scrollToEstimate}
              size="lg"
              className="bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button text-lg px-8 py-6 font-semibold transition-all duration-300 hover:scale-105 h-16"
            >
              <div className="flex flex-col">
                {/* Mobile/Tablet Text */}
                <span className="lg:hidden">Estimate Your Project</span>
                <span className="text-sm font-normal opacity-90 lg:hidden">It only takes 5 minutes</span>
                {/* Desktop Text */}
                <span className="hidden lg:inline">Schedule Your Estimate</span>
                <span className="text-sm font-normal opacity-90 hidden lg:inline">24 Hour Response Guaranteed</span>
              </div>
            </Button>
            <a
              href="#projects"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById('projects')?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start'
                });
              }}
            >
              <Button
                variant="outline"
                size="lg"
                className="border-2 border-secondary text-secondary hover:bg-secondary hover:text-secondary-foreground text-lg px-8 py-6 font-semibold transition-all duration-300 h-16"
              >
                View Our Work
              </Button>
            </a>
          </div>

          {/* Trust Indicators */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl mx-auto">
            <button
              type="button"
              onClick={() => {
                document.getElementById('testimonials')?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start'
                });
              }}
              className="flex flex-col items-center justify-center p-4 rounded-lg bg-card border shadow-card hover:shadow-lg transition-shadow cursor-pointer min-h-[120px] w-full text-center focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="View customer testimonials"
            >
              <div className="flex items-center mb-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`h-5 w-5 ${
                      star <= Math.floor(parseFloat(averageRating))
                        ? 'fill-yellow-400 text-yellow-400'
                        : star - 0.5 <= parseFloat(averageRating)
                        ? 'fill-yellow-400/50 text-yellow-400'
                        : 'fill-muted text-muted'
                    }`}
                  />
                ))}
              </div>
              <p className="font-bold text-text-primary">{averageRating} Google Rating</p>
              {reviewCount > 0 && (
                <p className="text-sm text-text-muted">{reviewCount} reviews</p>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                document.getElementById('testimonials')?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start'
                });
              }}
              className="flex flex-col items-center justify-center p-4 rounded-lg bg-card border shadow-card hover:shadow-lg transition-shadow cursor-pointer min-h-[120px] w-full text-center focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="View customer testimonials"
            >
              <Users className="h-8 w-8 text-primary mb-2" />
              <p className="font-bold text-text-primary">Trusted by</p>
              <p className="text-sm text-text-muted">Home Owners</p>
            </button>

            <Link
              href="/about"
              className="flex flex-col items-center justify-center p-4 rounded-lg bg-card border shadow-card hover:shadow-lg transition-shadow cursor-pointer min-h-[120px] w-full text-center focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="Learn about our licensing, bonding, and insurance"
            >
              <Shield className="h-8 w-8 text-accent-teal mb-2" />
              <p className="font-bold text-text-primary text-center">Licensed, Bonded, & Insured</p>
            </Link>

            <Link
              href="/about"
              className="flex flex-col items-center justify-center p-4 rounded-lg bg-card border shadow-card hover:shadow-lg transition-shadow cursor-pointer min-h-[120px] w-full text-center focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="Learn about our family-owned business"
            >
              <Award className="h-8 w-8 text-secondary mb-2" />
              <p className="font-bold text-text-primary">Family-Owned</p>
              <p className="text-sm text-text-muted">& Operated</p>
            </Link>
          </div>

          {/* Scroll anchor — encourages users to scroll past the fold */}
          <button
            onClick={() => {
              document.getElementById('projects')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
              });
            }}
            className="mt-10 flex flex-col items-center gap-1 text-text-muted hover:text-primary transition-colors cursor-pointer mx-auto group"
            aria-label="See our work"
          >
            <span className="text-sm font-medium">See Our Work</span>
            <ChevronDown className="h-5 w-5 animate-bounce" />
          </button>
        </div>
      </div>
    </section>
  );
};

export default Hero;
