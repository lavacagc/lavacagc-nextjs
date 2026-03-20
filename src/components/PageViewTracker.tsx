'use client';

import { useEffect, useRef } from 'react';

interface PageViewTrackerProps {
  eventName: string;
  eventData: Record<string, string>;
}

export default function PageViewTracker({ eventName, eventData }: PageViewTrackerProps) {
  const hasFired = useRef(false);

  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;

    // Push directly to dataLayer — doesn't depend on analyticsManager being initialized
    if (typeof window !== 'undefined') {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: eventName,
        eventData,
      });

      // Fire Facebook Pixel events for location/service views
      if (typeof window.fbq === 'function') {
        if (eventName === 'location_page_view') {
          window.fbq('trackCustom', 'LocationView', eventData);
        } else if (eventName === 'service_page_view') {
          window.fbq('trackCustom', 'ServiceView', eventData);
        }
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
