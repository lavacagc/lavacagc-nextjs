// Mobile optimization utilities and constants for Next.js

// Minimum touch target sizes (in pixels)
export const TOUCH_TARGETS = {
  MINIMUM: 48, // Apple and Google recommended minimum
  COMFORTABLE: 56, // More comfortable for most users
  LARGE: 64, // For primary actions
} as const;

// Font size constants for mobile readability
export const FONT_SIZES = {
  MINIMUM_BODY: 16, // Prevents iOS zoom
  MINIMUM_HEADING: 18,
  COMFORTABLE_READING: 18,
} as const;

// Mobile breakpoints
export const MOBILE_BREAKPOINTS = {
  XS: 320, // Very small phones
  SM: 375, // iPhone SE, small phones
  MD: 414, // iPhone Plus, larger phones
  LG: 768, // Tablets
  XL: 1024, // Large tablets
} as const;

// Mobile performance thresholds
export const PERFORMANCE_THRESHOLDS = {
  FIRST_CONTENTFUL_PAINT: 1800, // milliseconds
  LARGEST_CONTENTFUL_PAINT: 2500,
  FIRST_INPUT_DELAY: 100,
  CUMULATIVE_LAYOUT_SHIFT: 0.1,
  TIME_TO_INTERACTIVE: 3800,
} as const;

// Utility functions for mobile optimization
export const mobileUtils = {
  // Check if device is mobile
  isMobileDevice: (): boolean => {
    if (typeof window === 'undefined') return false;

    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) || window.innerWidth < MOBILE_BREAKPOINTS.LG;
  },

  // Check if device supports touch
  isTouchDevice: (): boolean => {
    if (typeof window === 'undefined') return false;

    return 'ontouchstart' in window ||
           navigator.maxTouchPoints > 0 ||
           (window as unknown as { DocumentTouch?: unknown }).DocumentTouch !== undefined;
  },

  // Get viewport dimensions
  getViewportSize: () => {
    if (typeof window === 'undefined') return { width: 0, height: 0 };

    return {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  },

  // Check if element has sufficient touch target size
  hasValidTouchTarget: (element: HTMLElement): boolean => {
    const rect = element.getBoundingClientRect();
    return rect.width >= TOUCH_TARGETS.MINIMUM && rect.height >= TOUCH_TARGETS.MINIMUM;
  },

  // Format phone number for tel: links
  formatPhoneForTel: (phoneNumber: string): string => {
    return phoneNumber.replace(/[^\d+]/g, '');
  },

  // Check if text size meets minimum requirements
  hasReadableFontSize: (element: HTMLElement): boolean => {
    if (typeof window === 'undefined') return true;
    const computedStyle = window.getComputedStyle(element);
    const fontSize = parseInt(computedStyle.fontSize, 10);
    return fontSize >= FONT_SIZES.MINIMUM_BODY;
  },

  // Prevent iOS zoom on form focus
  preventIOSZoom: (): void => {
    if (typeof document === 'undefined') return;

    const inputs = document.querySelectorAll('input, select, textarea');
    inputs.forEach((input) => {
      const element = input as HTMLInputElement;
      const computedStyle = window.getComputedStyle(element);
      const fontSize = parseInt(computedStyle.fontSize, 10);

      if (fontSize < FONT_SIZES.MINIMUM_BODY) {
        element.style.fontSize = `${FONT_SIZES.MINIMUM_BODY}px`;
      }
    });
  },

  // Add touch-friendly classes to interactive elements
  makeTouchFriendly: (selector: string): void => {
    if (typeof document === 'undefined') return;

    const elements = document.querySelectorAll(selector);
    elements.forEach((element) => {
      const htmlElement = element as HTMLElement;

      // Add minimum touch target size
      if (!mobileUtils.hasValidTouchTarget(htmlElement)) {
        htmlElement.style.minHeight = `${TOUCH_TARGETS.MINIMUM}px`;
        htmlElement.style.minWidth = `${TOUCH_TARGETS.MINIMUM}px`;
      }

      // Add touch-action for better touch handling
      htmlElement.style.touchAction = 'manipulation';

      // Add visual feedback for touch
      htmlElement.classList.add('touch-target');
    });
  },

  // Optimize images for mobile
  optimizeImagesForMobile: (): void => {
    if (typeof document === 'undefined') return;

    const images = document.querySelectorAll('img');
    images.forEach((img) => {
      // Add loading="lazy" for better performance
      if (!img.hasAttribute('loading')) {
        img.setAttribute('loading', 'lazy');
      }

      // Add decoding="async" for better performance
      if (!img.hasAttribute('decoding')) {
        img.setAttribute('decoding', 'async');
      }

      // Ensure images are responsive
      if (!img.style.maxWidth) {
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
      }
    });
  },

  // Check for horizontal scrolling
  hasHorizontalScroll: (): boolean => {
    if (typeof document === 'undefined') return false;

    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  },

  // Fix horizontal scrolling issues
  fixHorizontalScroll: (): void => {
    if (typeof document === 'undefined') return;

    // Add CSS to prevent horizontal scroll
    const style = document.createElement('style');
    style.textContent = `
      html, body {
        overflow-x: hidden;
        max-width: 100vw;
      }
      * {
        box-sizing: border-box;
      }
    `;
    document.head.appendChild(style);
  },

  // Initialize all mobile optimizations
  initMobileOptimizations: (): void => {
    if (typeof window === 'undefined') return;
    if (!mobileUtils.isMobileDevice()) return;

    // Prevent iOS zoom
    mobileUtils.preventIOSZoom();

    // Make interactive elements touch-friendly
    mobileUtils.makeTouchFriendly('button, a, [role="button"], input[type="submit"]');

    // Optimize images
    mobileUtils.optimizeImagesForMobile();

    // Fix horizontal scroll if present
    if (mobileUtils.hasHorizontalScroll()) {
      mobileUtils.fixHorizontalScroll();
    }

    // Add mobile-specific classes to body
    document.body.classList.add('mobile-optimized');

    if (mobileUtils.isTouchDevice()) {
      document.body.classList.add('touch-device');
    }
  }
};

// Google Mobile-Friendly Test compliance checker
export const mobileFriendlyChecker = {
  // Run all mobile-friendly checks
  runAllChecks: (): { passed: boolean; issues: string[] } => {
    const issues: string[] = [];

    // Check viewport configuration
    if (!mobileFriendlyChecker.hasValidViewport()) {
      issues.push('Missing or invalid viewport meta tag');
    }

    // Check touch targets
    const invalidTargets = mobileFriendlyChecker.getInvalidTouchTargets();
    if (invalidTargets.length > 0) {
      issues.push(`${invalidTargets.length} elements have insufficient touch target size`);
    }

    // Check font sizes
    const smallTextElements = mobileFriendlyChecker.getSmallTextElements();
    if (smallTextElements.length > 0) {
      issues.push(`${smallTextElements.length} text elements are too small to read`);
    }

    // Check for horizontal scrolling
    if (mobileUtils.hasHorizontalScroll()) {
      issues.push('Page has horizontal scrolling');
    }

    return {
      passed: issues.length === 0,
      issues
    };
  },

  // Check viewport configuration
  hasValidViewport: (): boolean => {
    if (typeof document === 'undefined') return false;

    const viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) return false;

    const content = viewport.getAttribute('content') || '';
    return content.includes('width=device-width') &&
           content.includes('initial-scale=1');
  },

  // Get elements with invalid touch target sizes
  getInvalidTouchTargets: (): HTMLElement[] => {
    if (typeof document === 'undefined') return [];

    const interactiveElements = document.querySelectorAll('button, a, [role="button"], input[type="submit"], input[type="button"]');
    const invalidElements: HTMLElement[] = [];

    interactiveElements.forEach((element) => {
      const htmlElement = element as HTMLElement;
      if (!mobileUtils.hasValidTouchTarget(htmlElement)) {
        invalidElements.push(htmlElement);
      }
    });

    return invalidElements;
  },

  // Get text elements that are too small
  getSmallTextElements: (): HTMLElement[] => {
    if (typeof document === 'undefined') return [];

    const textElements = document.querySelectorAll('p, span, div, h1, h2, h3, h4, h5, h6, li, td');
    const smallElements: HTMLElement[] = [];

    textElements.forEach((element) => {
      const htmlElement = element as HTMLElement;
      if (htmlElement.textContent && htmlElement.textContent.trim()) {
        if (!mobileUtils.hasReadableFontSize(htmlElement)) {
          smallElements.push(htmlElement);
        }
      }
    });

    return smallElements;
  }
};

// React hook for mobile optimization (Next.js compatible)
export const useMobileOptimizations = () => {
  if (typeof window !== 'undefined') {
    // Initialize on client side only
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mobileUtils.initMobileOptimizations);
    } else {
      mobileUtils.initMobileOptimizations();
    }
  }
};
