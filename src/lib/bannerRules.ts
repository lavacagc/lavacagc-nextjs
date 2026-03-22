/**
 * Smart Banner Rules Engine
 * 
 * Each rule defines: who sees it, what they see, and where.
 * Rules are evaluated top-to-bottom — first match wins.
 * Dismiss state is tracked per banner ID in localStorage.
 */

export interface BannerRule {
  id: string;
  // Conditions (all must be true to show)
  conditions: {
    visitorType?: 'new' | 'returning';
    minVisits?: number;
    maxVisits?: number;
    minDaysSinceFirst?: number;
    maxDaysSinceFirst?: number;
    /** Show only on these paths (prefix match). Empty = all pages */
    paths?: string[];
    /** Exclude these paths (prefix match) */
    excludePaths?: string[];
    /** Only show if visitor has viewed one of these pages before */
    hasViewedPages?: string[];
    /** Only show if visitor has NOT viewed these pages */
    hasNotViewedPages?: string[];
  };
  // Display
  display: {
    type: 'top-bar' | 'slide-in' | 'modal';
    title?: string;
    message: string;
    ctaText?: string;
    ctaLink?: string;
    ctaPhone?: string;
    bgColor?: string; // tailwind class or hex
    textColor?: string;
    dismissable?: boolean; // default true
    /** Don't show again for N hours after dismiss. 0 = session only */
    dismissForHours?: number;
    /** Icon: emoji or lucide icon name */
    icon?: string;
  };
  // Scheduling
  enabled: boolean;
  /** ISO date strings for time-limited offers */
  startDate?: string;
  endDate?: string;
  priority: number; // lower = higher priority
}

// ============================
// BANNER RULES — EDIT HERE
// ============================

export const bannerRules: BannerRule[] = [
  // ---- FIRST-TIME VISITORS ----
  {
    id: 'welcome-new',
    conditions: {
      visitorType: 'new',
      maxVisits: 1,
      excludePaths: ['/vaca-mgmt', '/admin', '/auth'],
    },
    display: {
      type: 'top-bar',
      icon: '👋',
      message: 'Welcome! Get a free estimate for your home renovation project.',
      ctaText: 'Get Free Estimate',
      ctaLink: '/free-estimate',
      bgColor: 'bg-primary',
      textColor: 'text-primary-foreground',
      dismissable: true,
      dismissForHours: 24,
    },
    enabled: true,
    priority: 10,
  },

  // ---- RETURNING 2-3 VISITS (considering) ----
  {
    id: 'returning-considering',
    conditions: {
      visitorType: 'returning',
      minVisits: 2,
      maxVisits: 3,
      excludePaths: ['/vaca-mgmt', '/admin', '/auth', '/free-estimate', '/project-calculator'],
    },
    display: {
      type: 'top-bar',
      icon: '🏠',
      message: 'Still planning your renovation? We offer free in-home consultations.',
      ctaText: 'Book Consultation',
      ctaLink: '/contact',
      bgColor: 'bg-orange-500',
      textColor: 'text-white',
      dismissable: true,
      dismissForHours: 48,
    },
    enabled: true,
    priority: 20,
  },

  // ---- HIGH-INTENT RETURNERS (4+ visits) ----
  {
    id: 'high-intent',
    conditions: {
      visitorType: 'returning',
      minVisits: 4,
      excludePaths: ['/vaca-mgmt', '/admin', '/auth'],
    },
    display: {
      type: 'top-bar',
      icon: '⚡',
      message: 'Ready to start your project? Spring slots are filling fast.',
      ctaText: 'Call Now',
      ctaPhone: '(201) 365-2tried',
      ctaLink: 'tel:+12013046498',
      bgColor: 'bg-green-600',
      textColor: 'text-white',
      dismissable: true,
      dismissForHours: 72,
    },
    enabled: true,
    priority: 30,
  },

  // ---- RETURNING TO CALCULATOR (abandoned estimate) ----
  {
    id: 'abandoned-estimate',
    conditions: {
      visitorType: 'returning',
      minVisits: 2,
      hasViewedPages: ['/project-calculator', '/free-estimate'],
      hasNotViewedPages: ['/contact'],
      excludePaths: ['/vaca-mgmt', '/admin', '/auth', '/project-calculator', '/free-estimate'],
    },
    display: {
      type: 'slide-in',
      icon: '📋',
      title: 'Your estimate is waiting',
      message: 'You started an estimate last time. Pick up where you left off!',
      ctaText: 'Continue Estimate',
      ctaLink: '/project-calculator',
      bgColor: 'bg-blue-600',
      textColor: 'text-white',
      dismissable: true,
      dismissForHours: 24,
    },
    enabled: true,
    priority: 5, // High priority — very specific intent signal
  },

  // ---- WIN-BACK (hasn't visited in 7+ days) ----
  {
    id: 'win-back',
    conditions: {
      visitorType: 'returning',
      minDaysSinceFirst: 7,
      minVisits: 2,
      excludePaths: ['/vaca-mgmt', '/admin', '/auth'],
    },
    display: {
      type: 'top-bar',
      icon: '🔨',
      message: "Welcome back! Spring is the perfect time to start your renovation.",
      ctaText: 'See Our Work',
      ctaLink: '/portfolio',
      bgColor: 'bg-amber-600',
      textColor: 'text-white',
      dismissable: true,
      dismissForHours: 168, // 1 week
    },
    enabled: true,
    priority: 25,
  },
];
