'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useVisitor } from '@/hooks/useVisitor';

// Microsoft Clarity global type
declare global {
  interface Window {
    clarity?: (method: string, ...args: (string | undefined)[]) => void;
  }
}

/**
 * Global visitor tracker — runs on every page.
 * 1. Tracks visitor identity, visit count, and page history in localStorage.
 * 2. Sets GA4 user properties (visitor_id, visitor_type, visit_count, days_since_first_visit).
 * 3. Fires funnel milestone events for key pages.
 */


// Map pathname patterns to funnel milestone events
function getFunnelEvent(path: string): { event: string; params: Record<string, string> } | null {
  // Service pages
  if (path.startsWith('/services/') && path !== '/services') {
    const service = path.split('/').pop() || '';
    return { event: 'funnel_service_view', params: { service_name: service } };
  }
  // Project/portfolio pages
  if (path.startsWith('/projects/') && path !== '/projects') {
    return { event: 'funnel_project_view', params: { project_slug: path.split('/').pop() || '' } };
  }
  // Calculator/estimator entry
  if (path === '/free-estimate') {
    return { event: 'funnel_estimate_start', params: { entry_point: path } };
  }
  // Contact page
  if (path === '/contact') {
    return { event: 'funnel_contact_view', params: {} };
  }
  // Reviews page (trust signal)
  if (path === '/reviews') {
    return { event: 'funnel_reviews_view', params: {} };
  }
  // Location pages
  if (path.startsWith('/locations/') && path !== '/locations') {
    return { event: 'funnel_location_view', params: { location: path.split('/').pop() || '' } };
  }
  return null;
}

export default function VisitorTracker() {
  const pathname = usePathname();
  const { visitorId, visitCount, isReturning, firstSeen, trackPage } = useVisitor();
  const ga4Initialized = useRef(false);

  // Set GA4 user properties + Clarity identity once visitor data is ready
  useEffect(() => {
    if (!visitorId || ga4Initialized.current) return;
    if (typeof window === 'undefined' || typeof window.gtag === 'undefined') return;

    // Calculate days since first visit
    const daysSinceFirst = firstSeen
      ? Math.floor((Date.now() - new Date(firstSeen).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // Set user properties — these appear as dimensions in GA4 reports
    window.gtag('set', 'user_properties', {
      visitor_id: visitorId,
      visitor_type: isReturning ? 'returning' : 'new',
      visit_count: visitCount,
      days_since_first_visit: daysSinceFirst,
    });

    // Link Microsoft Clarity sessions to our visitor ID
    if (typeof window.clarity === 'function') {
      window.clarity('identify', visitorId, undefined, undefined, visitorId);
      window.clarity('set', 'visitor_type', isReturning ? 'returning' : 'new');
      window.clarity('set', 'visit_count', String(visitCount));
    }

    // Pass visitor identity to Meta Pixel for audience building
    // external_id lets Meta match this visitor across sessions for retargeting
    if (typeof window.fbq === 'function') {
      // Set user data with external_id for cross-session matching
      window.fbq('init', '1461944528853241', {
        external_id: visitorId,
      });

      // Fire custom events with visitor context for audience segmentation
      window.fbq('trackCustom', 'VisitorIdentified', {
        visitor_type: isReturning ? 'returning' : 'new',
        visit_count: visitCount,
        days_since_first_visit: daysSinceFirst,
      });
    }

    ga4Initialized.current = true;
  }, [visitorId, visitCount, isReturning, firstSeen]);

  // Track page + fire funnel events (GA4 + Meta Pixel)
  useEffect(() => {
    if (!pathname) return;
    trackPage(pathname);

    // Fire funnel milestone event if applicable
    const funnel = getFunnelEvent(pathname);
    if (funnel && typeof window !== 'undefined') {
      const eventParams = {
        ...funnel.params,
        visitor_type: isReturning ? 'returning' : 'new',
        visit_number: String(visitCount),
      };

      // GA4
      if (typeof window.gtag !== 'undefined') {
        window.gtag('event', funnel.event, eventParams);
      }

      // Meta Pixel — fire matching custom events for audience building
      if (typeof window.fbq === 'function') {
        // Map funnel events to Meta custom events
        const metaEventMap: Record<string, string> = {
          funnel_service_view: 'ViewContent',
          funnel_estimate_start: 'InitiateCheckout',
          funnel_contact_view: 'Contact',
          funnel_reviews_view: 'ViewContent',
          funnel_location_view: 'ViewContent',
          funnel_project_view: 'ViewContent',
        };

        const metaEvent = metaEventMap[funnel.event];
        if (metaEvent) {
          // Use standard events where possible (better for optimization)
          window.fbq('track', metaEvent, {
            content_category: funnel.event,
            ...funnel.params,
            visitor_type: isReturning ? 'returning' : 'new',
            visit_count: visitCount,
          });
        }
      }
    }
  }, [pathname, trackPage, isReturning, visitCount, visitorId]);

  return null;
}
