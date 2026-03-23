'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Phone, FileText } from 'lucide-react';
import Link from 'next/link';
import { trackEvent, trackPhoneClick } from '@/services/analyticsManager';
import { subscribeBannerState, isBannerVisible } from '@/hooks/useBannerState';

export default function StickyCTA() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [bannerShowing, setBannerShowing] = useState(() => isBannerVisible());

  // Listen for SmartBanner visibility
  useEffect(() => {
    return subscribeBannerState(setBannerShowing);
  }, []);

  // Hide on contact page
  const isContactPage = pathname === '/contact';

  useEffect(() => {
    if (isContactPage) return;

    const handleScroll = () => {
      setVisible(window.scrollY > 300);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    // Check initial scroll position
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, [isContactPage]);

  if (isContactPage || !visible || bannerShowing) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white/95 backdrop-blur-sm border-t border-border shadow-lg safe-area-bottom">
      <div className="flex items-center gap-3 px-4 py-3">
        <a
          href="tel:2016142814"
          onClick={() => {
            trackPhoneClick();
            trackEvent('cta_click', {
              location: 'sticky_mobile',
              destination: 'phone',
              variant: 'Call Now',
            });
          }}
          className="flex items-center justify-center gap-2 flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors cursor-pointer"
        >
          <Phone className="h-5 w-5" />
          <span>Call Now</span>
        </a>
        <Link
          href="/contact"
          onClick={() => {
            trackEvent('cta_click', {
              location: 'sticky_mobile',
              destination: 'contact',
              variant: 'Free Estimate',
            });
          }}
          className="flex items-center justify-center gap-2 flex-1 bg-gradient-to-r from-primary to-accent-tangerine text-white font-semibold py-3 px-4 rounded-lg transition-colors cursor-pointer"
        >
          <FileText className="h-5 w-5" />
          <span>Free Estimate</span>
        </Link>
      </div>
    </div>
  );
}
