'use client';

/**
 * Lightweight global state for the header's mobile menu.
 *
 * The StickyCTA bar and the SmartBanner mobile card are both fixed to the
 * bottom of the viewport at a z-index at or above the sticky header's, so while
 * the mobile menu is open they land on top of its last entries - on a 390px
 * phone that is "Request an Estimate" and the phone number. Both subscribe here
 * and step aside instead. The menu carries its own estimate CTA and phone
 * number, so nothing is lost by getting out of its way.
 *
 * ReviewToast is the one bottom-pinned widget that needs no gate: it suppresses
 * itself on mobile entirely, so it can never be over an open hamburger menu.
 *
 * Same event-driven pattern as useBannerState - no React context needed.
 */

import { useSyncExternalStore } from 'react';

const listeners = new Set<(open: boolean) => void>();
let currentState = false;

export function setMobileMenuOpen(open: boolean) {
  if (open === currentState) return;
  currentState = open;
  listeners.forEach(fn => fn(open));
}

export function isMobileMenuOpen(): boolean {
  return currentState;
}

export function subscribeMobileMenuState(fn: (open: boolean) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Subscribe from a component. The server snapshot is always `false` - the menu
 * cannot be open before it has been tapped - so nothing hydrates hidden.
 */
export function useMobileMenuOpen(): boolean {
  return useSyncExternalStore(subscribeMobileMenuState, isMobileMenuOpen, () => false);
}
