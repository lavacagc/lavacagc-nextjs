'use client';

/**
 * Lightweight global state for SmartBanner visibility.
 * Other widgets check this before showing themselves.
 * Uses a simple event-driven pattern — no React context needed.
 */

const listeners = new Set<(visible: boolean) => void>();
let currentState = false;

export function setBannerVisible(visible: boolean) {
  currentState = visible;
  listeners.forEach(fn => fn(visible));
}

export function isBannerVisible(): boolean {
  return currentState;
}

export function subscribeBannerState(fn: (visible: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
