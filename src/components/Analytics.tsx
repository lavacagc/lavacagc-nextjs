import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
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
  const location = useLocation();

  useEffect(() => {
    // Initialize GA on first load with configuration from database
    analyticsManager.initializeGA();
  }, []);

  useEffect(() => {
    // Track page views on route changes, but exclude admin pages
    if (!location.pathname.startsWith('/admin')) {
      analyticsManager.trackPageView(location.pathname);
    }
  }, [location]);

  return null;
};

export default Analytics;