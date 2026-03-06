'use client';

import { useEffect } from 'react';
import { analyticsManager } from '@/services/analyticsManager';

interface PageViewTrackerProps {
  eventName: string;
  eventData: Record<string, string>;
}

export default function PageViewTracker({ eventName, eventData }: PageViewTrackerProps) {
  useEffect(() => {
    analyticsManager.trackEvent(eventName, eventData);
  }, [eventName, eventData]);

  return null;
}
