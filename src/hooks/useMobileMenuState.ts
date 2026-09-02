'use client';

/**
 * Lightweight global state for the header's mobile menu.
 *
 * The StickyCTA bar, both SmartBanner cards and the ReviewToast are all fixed
 * to the bottom of the viewport at a z-index at or above the sticky header's,
 * so while the mobile menu is open they land on top of its last entries - on a
 * 390px phone that is "Request an Estimate" and the phone number. They all
 * subscribe here and step aside instead. The menu carries its own estimate CTA
 * and phone number, so nothing is lost by getting out of its way.
 *
 * GATE ON THIS FLAG, NEVER ON A BREAKPOINT. The hamburger toggle and the menu
 * are both `lg:hidden`, so the menu is open-able all the way up to 1023px,
 * while the chrome above switches layout at `md` (768px). Scoping any of this
 * to `md` therefore leaves the 768-1023px band - a tablet in portrait, or an
 * 800px-wide desktop window - uncovered, which is exactly how ReviewToast
 * (which suppresses itself only below 768px) and the SmartBanner DESKTOP
 * slide-in card both ended up sitting on an open menu. This flag can only be
 * true while the menu is rendered, so it needs no width condition on top of it.
 *
 * The one deliberate exemption is the SmartBanner desktop TOP bar: it is what
 * --smart-banner-height measures, and hiding it would shift the whole header -
 * and the menu inside it - out from under the visitor mid-read.
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
