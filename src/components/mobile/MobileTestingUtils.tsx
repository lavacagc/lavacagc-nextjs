'use client'

import React, { useEffect } from 'react';
import Script from 'next/script';

interface MobileTestingUtilsProps {
  enableGoogleMobileFriendlyTest?: boolean;
  enablePageSpeedInsights?: boolean;
  enableLighthouseAudit?: boolean;
}

const MobileTestingUtils: React.FC<MobileTestingUtilsProps> = () => {
  // Generate testing schema for Google's mobile testing tools
  const mobileTestingSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "Mobile-Optimized Remodeling Services",
    "description": "Mobile-friendly home remodeling services in Northern New Jersey",
    "isAccessibleForFree": true,
    "mainEntity": {
      "@type": "LocalBusiness",
      "name": "La Vaca General Contractors",
      "telephone": "(201) 555-0123",
      "address": {
        "@type": "PostalAddress",
        "addressRegion": "NJ",
        "addressCountry": "US"
      }
    },
    "potentialAction": [
      {
        "@type": "CallAction",
        "target": "tel:+12015550123"
      },
      {
        "@type": "ContactAction",
        "target": "https://ajsconstructionnj.com/#contact"
      }
    ]
  };

  return (
    <Script
      id="mobile-testing-schema"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(mobileTestingSchema) }}
    />
  );
};

// Hook for mobile detection and optimization
export const useMobileOptimization = () => {
  const [isMobile, setIsMobile] = React.useState(false);
  const [touchDevice, setTouchDevice] = React.useState(false);
  const [windowWidth, setWindowWidth] = React.useState(0);

  useEffect(() => {
    // Detect mobile device
    const checkMobile = () => {
      const userAgent = navigator.userAgent;
      const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
      setIsMobile(mobileRegex.test(userAgent) || window.innerWidth < 768);
      setWindowWidth(window.innerWidth);
    };

    // Detect touch capability
    const checkTouch = () => {
      setTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
    };

    checkMobile();
    checkTouch();

    // Listen for window resize
    window.addEventListener('resize', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  return {
    isMobile,
    touchDevice,
    isTablet: isMobile && windowWidth >= 768,
    isPhone: isMobile && windowWidth < 768
  };
};

// Mobile performance monitoring
export const mobilePerfMonitor = {
  // Track Core Web Vitals for mobile
  trackCoreWebVitals: () => {
    if (typeof window !== 'undefined') {
      import('web-vitals').then((webVitals) => {
        const { onCLS, onFCP, onLCP, onTTFB } = webVitals;
        // Metrics are captured but not logged in production
        const noop = () => {};
        onCLS(noop);
        onFCP(noop);
        onLCP(noop);
        onTTFB(noop);
      }).catch(() => {
        // Web Vitals not available
      });
    }
  },

  // Monitor touch interactions
  trackTouchInteractions: () => {
    if (typeof window !== 'undefined') {
      let touchStartTime: number;

      document.addEventListener('touchstart', () => {
        touchStartTime = performance.now();
      });

      document.addEventListener('touchend', () => {
        const touchDuration = performance.now() - touchStartTime;
        if (touchDuration > 100) {
          // Long touch detected — could be used for diagnostics
        }
      });
    }
  }
};

export default MobileTestingUtils;
