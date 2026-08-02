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

  // Hide on contact + services-flow pages (their own bottom-tab nav takes the
  // bottom slot, and intake form must not have anything covering fields).
  const SUPPRESSED_PATHS = [
    '/contact',
    '/services',
    '/home-services',
    '/commercial-services',
    '/request-estimate',
  ];
  // Also hide across the whole Home Care section: it's a free, no-fee program,
  // so a "Free Estimate / Call Now" marketing bar is off-message, and the
  // checklist portal has its own floating "Estimate (n)" action.
  //
  // And across the admin console, where it is not marketing at anybody - it is
  // a fixed bar over our own controls. On a phone it sits on top of the bottom
  // of every admin form: "Schedule visit" on /vaca-mgmt/send-service-quote is
  // underneath it and cannot be tapped at all.
  const isSuppressed = SUPPRESSED_PATHS.includes(pathname)
    || pathname.startsWith('/home-care')
    || pathname.startsWith('/vaca-mgmt');

  useEffect(() => {
    if (isSuppressed) return;

    const handleScroll = () => {
      setVisible(window.scrollY > 300);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    // Check initial scroll position
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, [isSuppressed]);

  if (isSuppressed || !visible || bannerShowing) return null;

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
