'use client'

import { useEffect } from 'react';

// Hotjar Configuration
const HOTJAR_ID = 'XXXXXXX'; // Replace with actual Hotjar ID
const HOTJAR_VERSION = 6;

interface HotjarWindow extends Window {
  hj?: ((...args: unknown[]) => void) & { q?: unknown[][] };
  _hjSettings?: { hjid: string; hjsv: number };
}

// Initialize Hotjar for heat mapping and user recordings
export const initHotjar = () => {
  if (typeof window === 'undefined') return;

  const win = window as unknown as HotjarWindow;

  // Check if Hotjar is already initialized
  if (win.hj) {
    return;
  }

  // Hotjar tracking code
  (function(h: HotjarWindow, o: Document, t: string, j: string) {
    h.hj = h.hj || function(...args: unknown[]) {
      (h.hj!.q = h.hj!.q || []).push(args);
    };
    h._hjSettings = { hjid: HOTJAR_ID, hjsv: HOTJAR_VERSION };
    const a = o.getElementsByTagName('head')[0];
    const r = o.createElement('script');
    r.async = true;
    r.src = t + h._hjSettings.hjid + j + h._hjSettings.hjsv;
    a.appendChild(r);
  })(win, document, 'https://static.hotjar.com/c/hotjar-', '.js?sv=');
};

// Track custom Hotjar events
export const trackHotjarEvent = (eventName: string) => {
  if (typeof window !== 'undefined' && (window as unknown as HotjarWindow).hj) {
    (window as unknown as HotjarWindow).hj!('event', eventName);
  }
};

// Identify users (for better tracking)
export const identifyHotjarUser = (userId: string, attributes?: Record<string, string | number | boolean>) => {
  if (typeof window !== 'undefined' && (window as unknown as HotjarWindow).hj) {
    (window as unknown as HotjarWindow).hj!('identify', userId, attributes);
  }
};

// Trigger Hotjar polls or surveys
export const triggerHotjarPoll = (pollId: string) => {
  if (typeof window !== 'undefined' && (window as unknown as HotjarWindow).hj) {
    (window as unknown as HotjarWindow).hj!('trigger', pollId);
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
