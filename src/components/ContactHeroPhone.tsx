'use client';

import { Phone } from 'lucide-react';
import { trackPhoneClick, trackEvent } from '@/services/analyticsManager';

export default function ContactHeroPhone() {
  return (
    <>
      <a
        href="tel:2016142814"
        onClick={() => {
          trackPhoneClick();
          trackEvent('cta_click', {
            location: 'contact_hero',
            destination: 'phone',
            variant: 'hero_phone',
          });
        }}
        className="inline-flex items-center gap-3 bg-green-600 hover:bg-green-700 text-white font-bold text-xl py-4 px-8 rounded-xl transition-colors shadow-lg hover:shadow-xl cursor-pointer"
      >
        <Phone className="h-6 w-6" />
        (201) 614-2814
      </a>
      <p className="text-sm text-text-muted mt-2">Call now for immediate assistance</p>
    </>
  );
}
