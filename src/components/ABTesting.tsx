'use client'

import React, { useEffect, useState } from 'react';
import { trackEvent } from './Analytics';

// A/B Testing Configuration
interface ABTest {
  testId: string;
  variants: string[];
  allocation?: number[];
  conditions?: () => boolean;
}

interface ABTestResults {
  [testId: string]: string;
}

// Active A/B Tests Configuration
const ACTIVE_TESTS: ABTest[] = [
  {
    testId: 'hero_cta_button',
    variants: ['Get Free Estimate', 'Start Your Project Today', 'Free Consultation'],
    allocation: [33, 33, 34],
  },
  {
    testId: 'estimate_form_title',
    variants: ['Get Your Free Estimate', 'Request Project Quote', 'Get Pricing Information'],
    allocation: [40, 30, 30],
  },
  {
    testId: 'testimonial_section_layout',
    variants: ['carousel', 'grid', 'featured'],
    allocation: [33, 33, 34],
  }
];

// Get user's test variant from localStorage or assign new one
const getUserVariant = (test: ABTest): string => {
  const storageKey = `ab_test_${test.testId}`;
  const stored = localStorage.getItem(storageKey);

  if (stored && test.variants.includes(stored)) {
    return stored;
  }

  // Assign new variant based on allocation
  const random = Math.random() * 100;
  let cumulative = 0;

  for (let i = 0; i < test.variants.length; i++) {
    const allocation = test.allocation?.[i] || (100 / test.variants.length);
    cumulative += allocation;

    if (random <= cumulative) {
      const variant = test.variants[i];
      localStorage.setItem(storageKey, variant);

      // Track assignment
      trackEvent('ab_test_assigned', {
        category: 'experiment',
        label: `${test.testId}_${variant}`
      });

      return variant;
    }
  }

  return test.variants[0];
};

// Hook for using A/B test variants
export const useABTest = (testId: string): string => {
  const [variant, setVariant] = useState<string>('');

  useEffect(() => {
    const test = ACTIVE_TESTS.find(t => t.testId === testId);
    if (!test) {
      console.warn(`A/B Test not found: ${testId}`);
      return;
    }

    if (test.conditions && !test.conditions()) {
      setVariant(test.variants[0]);
      return;
    }

    const userVariant = getUserVariant(test);
    setVariant(userVariant);
  }, [testId]);

  return variant;
};

// Track A/B test conversions
export const trackABTestConversion = (testId: string, conversionType: string = 'conversion') => {
  const storageKey = `ab_test_${testId}`;
  const variant = localStorage.getItem(storageKey);

  if (variant) {
    trackEvent('ab_test_conversion', {
      category: 'experiment',
      label: `${testId}_${variant}_${conversionType}`
    });
  }
};

// Get all active test results for current user
export const getUserABTestResults = (): ABTestResults => {
  const results: ABTestResults = {};

  ACTIVE_TESTS.forEach(test => {
    const storageKey = `ab_test_${test.testId}`;
    const variant = localStorage.getItem(storageKey);
    if (variant) {
      results[test.testId] = variant;
    }
  });

  return results;
};

// Reset user's A/B test assignments (for testing purposes)
export const resetABTests = () => {
  ACTIVE_TESTS.forEach(test => {
    const storageKey = `ab_test_${test.testId}`;
    localStorage.removeItem(storageKey);
  });
};

// Component for A/B test initialization and management
const ABTesting = () => {
  useEffect(() => {
    ACTIVE_TESTS.forEach(test => {
      if (test.conditions && !test.conditions()) {
        return;
      }
      getUserVariant(test);
    });
  }, []);

  return null;
};

export default ABTesting;
