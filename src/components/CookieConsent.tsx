'use client';

import { useEffect, useRef } from 'react';
import { analyticsManager } from '@/services/analyticsManager';

const CONSENT_STORAGE_KEY = 'lavaca_cookie_consent';
const CONSENT_VERSION = '1.0';

/**
 * Minimal cookie consent — no banner, no popup.
 * 
 * Legal basis: La Vaca targets NJ homeowners (not EU). GDPR doesn't apply.
 * GA4 runs in consent mode by default (anonymized).
 * Privacy policy + "Do Not Sell" pages handle CCPA compliance.
 * 
 * This component silently restores saved consent preferences
 * and auto-grants analytics for US visitors (standard practice).
 * Users can manage preferences via /privacy-policy and /do-not-sell.
 */
export default function CookieConsent() {
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    try {
      const saved = localStorage.getItem(CONSENT_STORAGE_KEY);
      if (saved) {
        const { version, settings, timestamp } = JSON.parse(saved);
        const oneYear = 365 * 24 * 60 * 60 * 1000;
        if (version === CONSENT_VERSION && Date.now() - timestamp < oneYear) {
          const analyticsConsent = settings.analytics ? 'granted' : 'denied';
          const adConsent = settings.marketing ? 'granted' : 'denied';
          analyticsManager.updateConsent(analyticsConsent, adConsent);
          return;
        }
      }
    } catch {
      // Invalid saved consent — fall through to default
    }

    // No saved preference — default to analytics granted (US standard practice)
    // Marketing stays denied until explicit opt-in
    const defaultConsent = {
      necessary: true,
      analytics: true,
      marketing: false,
      preferences: true,
    };

    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({
      version: CONSENT_VERSION,
      settings: defaultConsent,
      timestamp: Date.now(),
    }));

    analyticsManager.updateConsent('granted', 'denied');
  }, []);

  // No visible UI — privacy managed via footer links to /privacy-policy and /do-not-sell
  return null;
}
