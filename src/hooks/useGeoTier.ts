'use client';

import { useSyncExternalStore } from 'react';
import { GEO_TIER_COOKIE, isGeoTier, type GeoTier } from '@/lib/geo/tier';

/**
 * The visitor's geo tier, read from the middleware-set cookie.
 *
 * Returns null on the server and during hydration - the gate components
 * render nothing until the tier is known, so a static page hydrates
 * identically for everyone and the notice appears only in the browser. That
 * is the deal that keeps the marketing pages cached: geography never forks
 * the server render.
 *
 * useSyncExternalStore rather than state-in-effect: the cookie is an
 * external value with no change events (the middleware rewrites it between
 * navigations, not during a render), so a never-firing subscription with a
 * per-render snapshot read is the honest shape.
 */
const subscribe = () => () => {};

function readTier(): GeoTier | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${GEO_TIER_COOKIE}=([^;]+)`),
  );
  const value = match?.[1];
  return isGeoTier(value) ? value : null;
}

const serverTier = () => null;

export function useGeoTier(): GeoTier | null {
  return useSyncExternalStore(subscribe, readTier, serverTier);
}
