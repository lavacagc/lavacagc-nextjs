'use client';

import { useEffect, useRef } from 'react';
import { Shield, Star, Zap } from 'lucide-react';
import { trackEvent } from '@/services/analyticsManager';

export default function ContactTrustBadges() {
  const badgesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = badgesRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            trackEvent('trust_badge_view', {
              badge: 'contact_trust_badges',
              location: 'contact_page',
            });
            observer.disconnect();
          }
        });
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={badgesRef} className="py-6 bg-background border-b border-border">
      <div className="container mx-auto px-4">
        <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
          <div className="flex items-center gap-2 text-sm md:text-base">
            <div className="bg-green-100 p-2 rounded-full">
              <Zap className="h-5 w-5 text-green-600" />
            </div>
            <span className="font-semibold text-text-primary">Response within 2 hours</span>
          </div>
          <div className="flex items-center gap-2 text-sm md:text-base">
            <div className="bg-blue-100 p-2 rounded-full">
              <Shield className="h-5 w-5 text-blue-600" />
            </div>
            <span className="font-semibold text-text-primary">Licensed &amp; Insured — HIC# 13VH13373800</span>
          </div>
          <div className="flex items-center gap-2 text-sm md:text-base">
            <div className="bg-yellow-100 p-2 rounded-full">
              <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
            </div>
            <span className="font-semibold text-text-primary">5-Star Google Rating</span>
          </div>
        </div>
      </div>
    </section>
  );
}
