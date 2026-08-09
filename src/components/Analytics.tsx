'use client'

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { analyticsManager } from '@/services/analyticsManager';
import { isAnalyticsExcluded } from '@/lib/analytics/excluded';

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

  // Check if current page should be excluded from tracking
  // CM-05: one shared list, also used by the layout's Clarity/Pixel scripts.
  const isExcludedPage = isAnalyticsExcluded(pathname);

  useEffect(() => {
    // Don't initialize GA at all on admin or auth pages
    if (isExcludedPage) {
      return;
    }

    // Initialize GA on first load with configuration from database
    analyticsManager.initializeGA();
  }, [pathname, isExcludedPage]);

  useEffect(() => {
    // Track page views on route changes, but exclude admin and auth pages
    if (!isExcludedPage) {
      analyticsManager.trackPageView(pathname);
    }
  }, [pathname, isExcludedPage]);

  return null;
};

export default Analytics;
