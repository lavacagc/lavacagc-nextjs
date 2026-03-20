'use client'

import { useEffect } from 'react';
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

  // Check if current page should be excluded from tracking
  const isExcludedPage = pathname.startsWith('/admin') || pathname.startsWith('/vaca-mgmt') || pathname.startsWith('/auth');

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
