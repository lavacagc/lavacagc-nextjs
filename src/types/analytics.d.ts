// Google Analytics & Google Tag Manager type declarations

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: Array<Record<string, unknown>>;
  }
}

// Scroll tracking type definitions
export interface ScrollTrackingOptions {
  sectionId: string;
  sectionName: string;
  threshold?: number; // IntersectionObserver threshold (0-1)
  trackTimeOnSection?: boolean;
  trackScrollDepth?: boolean;
  scrollDepthThresholds?: number[]; // e.g., [25, 50, 75, 100]
  trackElements?: boolean; // Track individual child elements
  debounceMs?: number; // Debounce time for scroll events
  minTimeThreshold?: number; // Minimum time in seconds before tracking
}

export interface ScrollDepthEvent {
  section_name: string;
  section_id?: string;
  depth_percentage: number;
  event_category: 'engagement';
}

export interface SectionViewEvent {
  section_name: string;
  section_id?: string;
  time_spent_seconds?: number;
  event_category: 'engagement';
}

export interface ElementViewEvent {
  element_name: string;
  section_name: string;
  element_id?: string;
  event_category: 'engagement';
}

export interface CalculatorStepEvent {
  step_number: number;
  step_name: string;
  action: 'enter' | 'exit' | 'complete';
  time_spent_seconds?: number;
  event_category: 'calculator';
}

export interface HorizontalScrollEvent {
  section_name: string;
  section_id?: string;
  scroll_percentage: number;
  event_category: 'engagement';
}

export {};
