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
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
