'use client';

import Link from 'next/link';
import { Phone, Calculator, ArrowRight } from 'lucide-react';
import { trackEvent, trackEstimateRequest, trackPhoneClick } from '@/services/analyticsManager';

export default function ReviewsBottomCTA() {
  return (
    <section className="py-12 md:py-20 bg-gradient-to-r from-primary to-accent-teal text-white">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready for Your Own 5-Star Renovation?
          </h2>
          <p className="text-xl opacity-90 leading-relaxed mb-4">
            Our clients love their results. See what La Vaca can do for your home.
            Get started with a free estimate today.
          </p>
          <p className="text-lg opacity-80 mb-8">
            Licensed &amp; Insured &bull; HIC# 13VH13373800
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
            <Link
              href="/contact"
              onClick={() => {
                trackEvent('cta_click', {
                  location: 'reviews_bottom',
                  destination: 'contact',
                  variant: 'Get Your Free Estimate',
                });
                trackEstimateRequest('reviews_bottom');
              }}
              className="inline-flex items-center justify-center gap-2 rounded-md text-base font-semibold bg-white text-primary hover:bg-gray-100 h-14 px-10 transition-all duration-300 hover:scale-105 cursor-pointer"
            >
              Get Your Free Estimate
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/project-calculator"
              onClick={() => {
                trackEvent('cta_click', {
                  location: 'reviews_bottom',
                  destination: 'calculator',
                  variant: 'Calculate Project Cost',
                });
              }}
              className="inline-flex items-center justify-center gap-2 rounded-md text-base font-semibold bg-white/10 border border-white/30 text-white hover:bg-white hover:text-primary h-14 px-10 transition-all duration-300 cursor-pointer"
            >
              <Calculator className="h-5 w-5" />
              Calculate Project Cost
            </Link>
          </div>
          <a
            href="tel:2016142814"
            onClick={() => {
              trackPhoneClick();
              trackEvent('cta_click', {
                location: 'reviews_bottom',
                destination: 'phone',
                variant: 'Call Now',
              });
            }}
            className="inline-flex items-center justify-center gap-2 text-white/90 hover:text-white text-lg transition-colors cursor-pointer"
          >
            <Phone className="h-5 w-5" />
            Or call us: (201) 614-2814
          </a>
        </div>
      </div>
    </section>
  );
}
