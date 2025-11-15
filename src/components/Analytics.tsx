'use client'

import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { analyticsManager } from '@/services/analyticsManager';

// Re-export functions from analyticsManager for backward compatibility
export {
  trackEvent,
  trackFormSubmission,
  trackPhoneClick,
  trackEstimateRequest,
  trackProjectView
} from '@/services/analyticsManager';

// Analytics Component for automatic page tracking
const Analytics = () => {
  const pathname = usePathname();

  useEffect(() => {
    // Initialize GA on first load with configuration from database
    analyticsManager.initializeGA();
  }, []);

  useEffect(() => {
    // Track page views on route changes, but exclude admin pages
    if (!pathname.startsWith('/admin')) {
      analyticsManager.trackPageView(pathname);
    }
  }, [pathname]);

  return null;
};

export default Analytics;
