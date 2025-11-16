'use client'

import React, { useEffect } from 'react';

// Hotjar Configuration
const HOTJAR_ID = 'XXXXXXX'; // Replace with actual Hotjar ID
const HOTJAR_VERSION = 6;

// Initialize Hotjar for heat mapping and user recordings
export const initHotjar = () => {
  if (typeof window === 'undefined') return;

  // Check if Hotjar is already initialized
  if ((window as any).hj) {
    return;
  }

  // Hotjar tracking code
  (function(h: any, o: any, t: any, j: any, a?: any, r?: any) {
    h.hj = h.hj || function(...args: any[]) {
      (h.hj.q = h.hj.q || []).push(args);
    };
    h._hjSettings = { hjid: HOTJAR_ID, hjsv: HOTJAR_VERSION };
    a = o.getElementsByTagName('head')[0];
    r = o.createElement('script');
    r.async = 1;
    r.src = t + h._hjSettings.hjid + j + h._hjSettings.hjsv;
    a.appendChild(r);
  })(window, document, 'https://static.hotjar.com/c/hotjar-', '.js?sv=');
};

// Track custom Hotjar events
export const trackHotjarEvent = (eventName: string) => {
  if (typeof window !== 'undefined' && (window as any).hj) {
    (window as any).hj('event', eventName);
  }
};

// Identify users (for better tracking)
export const identifyHotjarUser = (userId: string, attributes?: Record<string, any>) => {
  if (typeof window !== 'undefined' && (window as any).hj) {
    (window as any).hj('identify', userId, attributes);
  }
};

// Trigger Hotjar polls or surveys
export const triggerHotjarPoll = (pollId: string) => {
  if (typeof window !== 'undefined' && (window as any).hj) {
    (window as any).hj('trigger', pollId);
  }
};

// HeatMap Component for initialization
const HeatMap = () => {
  useEffect(() => {
    initHotjar();
  }, []);

  return null;
};

export default HeatMap;
