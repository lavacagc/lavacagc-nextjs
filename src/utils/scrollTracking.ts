/**
 * Scroll Tracking Utilities
 *
 * Helper functions for calculating scroll depth, managing debouncing,
 * and preventing duplicate event tracking in GA4
 */

/**
 * Debounce function for scroll events
 */
export function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function for high-frequency scroll events
 */
export function throttle<T extends (...args: any[]) => void>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false;

  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Calculate scroll depth percentage for a given element
 */
export function calculateScrollDepth(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  const elementHeight = element.scrollHeight || element.clientHeight;
  const viewportHeight = window.innerHeight;

  // How much of the element has been scrolled past the top of viewport
  const scrolled = Math.max(0, -rect.top);

  // Calculate percentage
  const visibleHeight = Math.min(elementHeight, scrolled + viewportHeight);
  const percentage = Math.min(100, Math.round((visibleHeight / elementHeight) * 100));

  return percentage;
}

/**
 * Calculate horizontal scroll percentage for an element
 */
export function calculateHorizontalScrollDepth(element: HTMLElement): number {
  const scrollLeft = element.scrollLeft;
  const scrollWidth = element.scrollWidth;
  const clientWidth = element.clientWidth;

  // Calculate percentage of scrollable area that has been scrolled
  const maxScroll = scrollWidth - clientWidth;
  if (maxScroll <= 0) return 100; // No scrollable area

  const percentage = Math.min(100, Math.round((scrollLeft / maxScroll) * 100));
  return percentage;
}

/**
 * Session storage helper to prevent duplicate event tracking
 */
const TRACKED_EVENTS_KEY = 'scroll_tracked_events';

export function hasEventBeenTracked(eventKey: string): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const tracked = sessionStorage.getItem(TRACKED_EVENTS_KEY);
    if (!tracked) return false;

    const trackedEvents: string[] = JSON.parse(tracked);
    return trackedEvents.includes(eventKey);
  } catch (e) {
    return false;
  }
}

export function markEventAsTracked(eventKey: string): void {
  if (typeof window === 'undefined') return;

  try {
    const tracked = sessionStorage.getItem(TRACKED_EVENTS_KEY);
    const trackedEvents: string[] = tracked ? JSON.parse(tracked) : [];

    if (!trackedEvents.includes(eventKey)) {
      trackedEvents.push(eventKey);
      sessionStorage.setItem(TRACKED_EVENTS_KEY, JSON.stringify(trackedEvents));
    }
  } catch (e) {
    console.error('Error marking event as tracked:', e);
  }
}

/**
 * Get the next untracked scroll depth threshold
 */
export function getNextDepthThreshold(
  currentDepth: number,
  thresholds: number[],
  sectionId: string
): number | null {
  const sortedThresholds = [...thresholds].sort((a, b) => a - b);

  for (const threshold of sortedThresholds) {
    const eventKey = `scroll_depth_${sectionId}_${threshold}`;
    if (currentDepth >= threshold && !hasEventBeenTracked(eventKey)) {
      return threshold;
    }
  }

  return null;
}

/**
 * Calculate time difference in seconds
 */
export function getTimeInSeconds(startTime: number): number {
  return Math.round((Date.now() - startTime) / 1000);
}

/**
 * Check if element is in viewport
 */
export function isElementInViewport(element: HTMLElement, threshold: number = 0): boolean {
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

  const verticalThreshold = viewportHeight * threshold;
  const horizontalThreshold = viewportWidth * threshold;

  return (
    rect.top >= -verticalThreshold &&
    rect.left >= -horizontalThreshold &&
    rect.bottom <= viewportHeight + verticalThreshold &&
    rect.right <= viewportWidth + horizontalThreshold
  );
}

/**
 * Get readable element identifier
 */
export function getElementIdentifier(element: HTMLElement): string {
  // Prefer ID, then class, then tag name
  if (element.id) return element.id;
  if (element.className) {
    const classes = element.className.split(' ').filter(c => c.trim());
    if (classes.length > 0) return classes[0];
  }
  return element.tagName.toLowerCase();
}
