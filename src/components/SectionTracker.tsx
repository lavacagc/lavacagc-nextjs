'use client';

import { useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { trackEvent } from '@/services/analyticsManager';
import { hasEventBeenTracked, markEventAsTracked, throttle } from '@/utils/scrollTracking';

/**
 * SectionTracker — fires GA4 events when sections become visible
 * and tracks scroll depth at 25/50/75/100% thresholds.
 *
 * Drop this once in a layout or page and it auto-discovers sections
 * via data-section attributes. Zero config per page.
 *
 * Usage: Add data-section="hero" to any element you want tracked.
 */
export default function SectionTracker() {
  const pathname = usePathname();
  const scrollThresholdsFired = useRef<Set<number>>(new Set());
  const pageLoadTime = useRef<number>(Date.now());

  // Reset on route change
  useEffect(() => {
    scrollThresholdsFired.current = new Set();
    pageLoadTime.current = Date.now();
  }, [pathname]);

  // Section visibility tracking via IntersectionObserver
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const sectionName = (entry.target as HTMLElement).dataset.section;
            if (!sectionName) return;

            const eventKey = `section_view_${pathname}_${sectionName}`;
            if (hasEventBeenTracked(eventKey)) return;

            markEventAsTracked(eventKey);

            const timeOnPage = Math.round((Date.now() - pageLoadTime.current) / 1000);

            trackEvent('section_view', {
              section_name: sectionName,
              page_path: pathname,
              time_to_section: timeOnPage,
            });
          }
        });
      },
      {
        threshold: 0.3, // Fire when 30% of section is visible
        rootMargin: '0px',
      }
    );

    // Observe all elements with data-section attribute
    const sections = document.querySelectorAll('[data-section]');
    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, [pathname]);

  // Scroll depth tracking at 25/50/75/100%
  const handleScroll = useCallback(
    throttle(() => {
      if (typeof window === 'undefined') return;

      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;

      const scrollPercent = Math.round((scrollTop / docHeight) * 100);

      const thresholds = [25, 50, 75, 100];
      for (const threshold of thresholds) {
        if (
          scrollPercent >= threshold &&
          !scrollThresholdsFired.current.has(threshold)
        ) {
          scrollThresholdsFired.current.add(threshold);

          const eventKey = `scroll_depth_${pathname}_${threshold}`;
          if (!hasEventBeenTracked(eventKey)) {
            markEventAsTracked(eventKey);

            const timeOnPage = Math.round(
              (Date.now() - pageLoadTime.current) / 1000
            );

            trackEvent('scroll_depth', {
              depth_threshold: threshold,
              page_path: pathname,
              time_to_depth: timeOnPage,
            });
          }
        }
      }
    }, 250),
    [pathname]
  );

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return null; // Pure tracking component, no UI
}
