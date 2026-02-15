'use client';

import { useEffect, useRef, useCallback } from 'react';
import {
  trackScrollDepth as trackScrollDepthEvent,
  trackSectionView as trackSectionViewEvent,
  trackElementView as trackElementViewEvent,
} from '@/services/analyticsManager';
import {
  calculateScrollDepth,
  debounce,
  getNextDepthThreshold,
  getTimeInSeconds,
  markEventAsTracked,
  hasEventBeenTracked,
  getElementIdentifier,
} from '@/utils/scrollTracking';
import type { ScrollTrackingOptions } from '@/types/analytics';

/**
 * Hook for tracking user scroll behavior and section engagement
 *
 * @param options - Configuration options for scroll tracking
 * @returns ref - Attach this ref to the section you want to track
 *
 * @example
 * ```tsx
 * const sectionRef = useScrollTracking({
 *   sectionId: 'portfolio',
 *   sectionName: 'Portfolio Section',
 *   trackTimeOnSection: true,
 *   trackScrollDepth: true,
 *   scrollDepthThresholds: [25, 50, 75, 100],
 * });
 *
 * return <section ref={sectionRef}>...</section>
 * ```
 */
export function useScrollTracking(options: ScrollTrackingOptions) {
  const {
    sectionId,
    sectionName,
    threshold = 0.1, // 10% of element must be visible
    trackTimeOnSection = true,
    trackScrollDepth = true,
    scrollDepthThresholds = [25, 50, 75, 100],
    trackElements = false,
    debounceMs = 300,
    minTimeThreshold = 3, // Minimum 3 seconds before tracking time
  } = options;

  const sectionRef = useRef<HTMLElement>(null);
  const entryTime = useRef<number | null>(null);
  const isIntersecting = useRef(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const elementObserverRef = useRef<IntersectionObserver | null>(null);
  const hasTrackedView = useRef(false);

  // Track section visibility and time spent
  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !isIntersecting.current) {
          // Section entered viewport
          isIntersecting.current = true;
          entryTime.current = Date.now();

          // Track section view (initial visibility)
          if (!hasTrackedView.current) {
            const viewEventKey = `section_view_${sectionId}`;
            if (!hasEventBeenTracked(viewEventKey)) {
              trackSectionViewEvent(sectionName, undefined, sectionId);
              markEventAsTracked(viewEventKey);
              hasTrackedView.current = true;
            }
          }
        } else if (!entry.isIntersecting && isIntersecting.current) {
          // Section left viewport
          isIntersecting.current = false;

          // Track time spent if enabled
          if (trackTimeOnSection && entryTime.current) {
            const timeSpent = getTimeInSeconds(entryTime.current);

            // Only track if user spent minimum time threshold
            if (timeSpent >= minTimeThreshold) {
              const timeEventKey = `time_spent_${sectionId}_${timeSpent}`;
              if (!hasEventBeenTracked(timeEventKey)) {
                trackSectionViewEvent(sectionName, timeSpent, sectionId);
                markEventAsTracked(timeEventKey);
              }
            }
          }

          entryTime.current = null;
        }
      });
    },
    [sectionId, sectionName, trackTimeOnSection, minTimeThreshold]
  );

  // Track scroll depth within section
  const handleScroll = useCallback(() => {
    if (!sectionRef.current || !trackScrollDepth) return;

    const currentDepth = calculateScrollDepth(sectionRef.current);
    const nextThreshold = getNextDepthThreshold(currentDepth, scrollDepthThresholds, sectionId);

    if (nextThreshold !== null) {
      const eventKey = `scroll_depth_${sectionId}_${nextThreshold}`;
      trackScrollDepthEvent(sectionName, nextThreshold, sectionId);
      markEventAsTracked(eventKey);
    }
  }, [sectionId, sectionName, trackScrollDepth, scrollDepthThresholds]);

  // Debounced scroll handler
  const debouncedHandleScrollRef = useRef<ReturnType<typeof debounce> | null>(null);

  useEffect(() => {
    debouncedHandleScrollRef.current = debounce(handleScroll, debounceMs);
  }, [handleScroll, debounceMs]);

  // Track individual child elements (portfolio items, project cards, etc.)
  const handleElementIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const element = entry.target as HTMLElement;
          const elementIdentifier = getElementIdentifier(element);
          const eventKey = `element_view_${sectionId}_${elementIdentifier}`;

          if (!hasEventBeenTracked(eventKey)) {
            trackElementViewEvent(elementIdentifier, sectionName, sectionId);
            markEventAsTracked(eventKey);
          }
        }
      });
    },
    [sectionId, sectionName]
  );

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    // Setup IntersectionObserver for section visibility
    observerRef.current = new IntersectionObserver(handleIntersection, {
      threshold,
      rootMargin: '0px',
    });

    observerRef.current.observe(section);

    // Setup scroll listener for depth tracking
    const debouncedScroll = debouncedHandleScrollRef.current;
    if (trackScrollDepth && debouncedScroll) {
      window.addEventListener('scroll', debouncedScroll, { passive: true });
    }

    // Setup IntersectionObserver for individual elements
    if (trackElements) {
      elementObserverRef.current = new IntersectionObserver(handleElementIntersection, {
        threshold: 0.5, // 50% of element must be visible
        rootMargin: '0px',
      });

      // Observe all direct children with data-track attribute
      const trackableElements = section.querySelectorAll('[data-track="true"]');
      trackableElements.forEach((el) => {
        elementObserverRef.current?.observe(el);
      });
    }

    // Cleanup
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      if (elementObserverRef.current) {
        elementObserverRef.current.disconnect();
      }
      if (trackScrollDepth && debouncedScroll) {
        window.removeEventListener('scroll', debouncedScroll);
      }
    };
  }, [
    threshold,
    trackScrollDepth,
    trackElements,
    handleIntersection,
    handleElementIntersection,
  ]);

  return sectionRef;
}
