'use client'

import React from 'react';
import { supabase } from '@/integrations/supabase/client';
import { trackEvent } from '@/services/analyticsManager';

interface CallTrackingWrapperProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  [key: string]: unknown;
}

const CallTrackingWrapper: React.FC<CallTrackingWrapperProps> = ({ 
  href, 
  children, 
  className,
  ...props 
}) => {
  const handleClick = async () => {
    const pageUrl = window.location.href;

    try {
      // Track in GA4
      trackEvent('phone_click', {
        page_url: pageUrl,
        phone_number: href,
      });

      // Track Facebook Pixel Contact event
      if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
        window.fbq('track', 'Contact', {
          content_name: 'Phone Call',
          content_category: pageUrl,
        });
      }

      // Save to Supabase lead_events table
      // Note: This table needs to be created via migration
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from as any)('lead_events').insert({
        event_type: 'phone_click',
        page_url: pageUrl,
        metadata: {
          phone_number: href,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      // Don't block the phone call if tracking fails
      console.error('Call tracking error:', error);
    }
  };

  return (
    <a 
      href={href} 
      onClick={handleClick} 
      className={className}
      {...props}
    >
      {children}
    </a>
  );
};

export default CallTrackingWrapper;
