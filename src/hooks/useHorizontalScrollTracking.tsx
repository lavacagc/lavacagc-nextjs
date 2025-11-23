'use client';

import { useEffect, useRef, useCallback } from 'react';
import { trackHorizontalScroll } from '@/services/analyticsManager';
import {
  calculateHorizontalScrollDepth,
  throttle,
  getNextDepthThreshold,
  markEventAsTracked,
} from '@/utils/scrollTracking';

interface HorizontalScrollTrackingOptions {
  sectionId: string;
  sectionName: string;
  scrollDepthThresholds?: number[];
  throttleMs?: number;
}

/**
 * Hook for tracking horizontal scroll behavior
 *
 * @param options - Configuration options for horizontal scroll tracking
 * @returns ref - Attach this ref to the horizontally scrollable element
 *
 * @example
 * ```tsx
 * const scrollRef = useHorizontalScrollTracking({
 *   sectionId: 'project-gallery',
 *   sectionName: 'Project Gallery',
 *   scrollDepthThresholds: [25, 50, 75, 100],
 * });
 *
 * return <div ref={scrollRef} className="overflow-x-auto">...</div>
 * ```
 */
export function useHorizontalScrollTracking(options: HorizontalScrollTrackingOptions) {
  const {
    sectionId,
    sectionName,
    scrollDepthThresholds = [25, 50, 75, 100],
    throttleMs = 500,
  } = options;

  const scrollRef = useRef<HTMLDivElement>(null);

  const handleHorizontalScroll = useCallback(() => {
    if (!scrollRef.current) return;

    const currentDepth = calculateHorizontalScrollDepth(scrollRef.current);
    const nextThreshold = getNextDepthThreshold(currentDepth, scrollDepthThresholds, sectionId);

    if (nextThreshold !== null) {
      const eventKey = `horizontal_scroll_${sectionId}_${nextThreshold}`;
      trackHorizontalScroll(sectionName, nextThreshold, sectionId);
      markEventAsTracked(eventKey);
    }
  }, [sectionId, sectionName, scrollDepthThresholds]);

  const throttledHandleScroll = useCallback(
    throttle(handleHorizontalScroll, throttleMs),
    [handleHorizontalScroll, throttleMs]
  );

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    element.addEventListener('scroll', throttledHandleScroll as any, { passive: true });

    return () => {
      element.removeEventListener('scroll', throttledHandleScroll as any);
    };
  }, [throttledHandleScroll]);

  return scrollRef;
}
