'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Warm the flow's chunk before the first open, so the sheet appears instantly. */
export function preloadRequestFlow(): void {
  void import('./RequestFlow');
}

/**
 * Open state for a sheet, tied to the URL so the phone's Back button closes it
 * instead of leaving the page (grill 001 Q3; LP4 for the request sheet, review
 * D2 for the price sheet). Opening pushes `hash`; Back pops it and closes the
 * sheet; closing from the X or Escape pops that same entry, so Back never
 * needs pressing twice.
 *
 * `mounted` stays true after the first open, so a component that keeps state
 * across opens (the request flow) is not torn down when the sheet closes.
 *
 * `openOnHash`: also open when a plain link to `hash` is followed (the bottom
 * tab bar's Quote tab on a service page). That entry is then adopted, so
 * closing pops it exactly like one this hook pushed.
 */
export function useHashSheet(hash: string, { openOnHash = false }: { openOnHash?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pushed = useRef(false);

  const isOurs = () => (window.history.state as { hsSheet?: string } | null)?.hsSheet === hash;

  const openSheet = useCallback(() => {
    setMounted(true);
    setOpen(true);
    if (window.location.hash !== hash) {
      window.history.pushState({ hsSheet: hash }, '', hash);
      pushed.current = true;
    }
  }, [hash]);

  const closeSheet = useCallback(() => {
    setOpen(false);
    if (window.location.hash !== hash) return;
    // Pop only an entry this hook pushed. If something else has pushed on top
    // of it since (any site-wide component that traps Back), going back would
    // land on another entry with the same hash and leave the URL claiming an
    // open sheet.
    if (pushed.current && isOurs()) {
      pushed.current = false;
      window.history.back();
    } else {
      pushed.current = false;
      // Arrived with the hash already in the URL: drop it without leaving the
      // page, keeping the router's own state on the entry.
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isOurs only reads hash and window
  }, [hash]);

  useEffect(() => {
    const onPop = () => {
      if (window.location.hash !== hash) {
        pushed.current = false;
        setOpen(false);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [hash]);

  useEffect(() => {
    if (!openOnHash) return;
    const onHash = () => {
      if (window.location.hash !== hash) return;
      const state = (window.history.state as Record<string, unknown> | null) ?? {};
      window.history.replaceState({ ...state, hsSheet: hash }, '', window.location.href);
      pushed.current = true;
      setMounted(true);
      setOpen(true);
    };
    window.addEventListener('hashchange', onHash);
    // A tap on the link before this component hydrated already changed the
    // hash with nobody listening (seen under load). Adopt that entry now, as
    // the hashchange would have. But when the page itself was LOADED with the
    // hash (a direct link, a reload), its entry is the page: open the sheet
    // without adopting it, so closing strips the hash instead of going back
    // off the site.
    if (window.location.hash === hash) {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      const loadedWithHash = nav ? new URL(nav.name).hash === hash : true;
      if (loadedWithHash) {
        setMounted(true);
        setOpen(true);
      } else {
        onHash();
      }
    }
    return () => window.removeEventListener('hashchange', onHash);
  }, [hash, openOnHash]);

  return { open, mounted, openSheet, closeSheet };
}

/** The request flow sheet: `#request`. */
export function useRequestFlow(options: { openOnHash?: boolean } = {}) {
  const sheet = useHashSheet('#request', options);
  return { open: sheet.open, mounted: sheet.mounted, openFlow: sheet.openSheet, closeFlow: sheet.closeSheet };
}
