'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const HASH = '#request';

/** Warm the flow's chunk before the first open, so the sheet appears instantly. */
export function preloadRequestFlow(): void {
  void import('./RequestFlow');
}

/**
 * Open state for the request flow sheet, tied to the URL (grill 001 Q3, LP4):
 * opening pushes `#request`, the browser back button closes the sheet, and
 * closing it from the X or Escape pops that same history entry so back does
 * not need pressing twice.
 *
 * `mounted` stays true after the first open: the flow keeps its answers if the
 * homeowner closes it to look at another card and reopens it.
 *
 * `openOnHash`: also open when a plain `#request` link is followed (the bottom
 * tab bar's Quote tab on a service page). That entry is then adopted as ours,
 * so closing pops it exactly like one this hook pushed.
 */
export function useRequestFlow({ openOnHash = false }: { openOnHash?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pushed = useRef(false);

  const openFlow = useCallback(() => {
    setMounted(true);
    setOpen(true);
    if (window.location.hash !== HASH) {
      window.history.pushState({ hsRequest: true }, '', HASH);
      pushed.current = true;
    }
  }, []);

  const closeFlow = useCallback(() => {
    setOpen(false);
    if (window.location.hash !== HASH) return;
    // Pop only an entry this hook pushed. If something else has pushed on top
    // of it since (any site-wide component that traps Back), going back would
    // land on another #request entry and leave the URL claiming an open sheet.
    const ours = (window.history.state as { hsRequest?: boolean } | null)?.hsRequest === true;
    if (pushed.current && ours) {
      pushed.current = false;
      window.history.back();
    } else {
      pushed.current = false;
      // Arrived with #request already in the URL: drop it without leaving the
      // page, keeping the router's own state on the entry.
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    }
  }, []);

  useEffect(() => {
    const onPop = () => {
      if (window.location.hash !== HASH) {
        pushed.current = false;
        setOpen(false);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (!openOnHash) return;
    const onHash = () => {
      if (window.location.hash !== HASH) return;
      const state = (window.history.state as Record<string, unknown> | null) ?? {};
      window.history.replaceState({ ...state, hsRequest: true }, '', window.location.href);
      pushed.current = true;
      setMounted(true);
      setOpen(true);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [openOnHash]);

  return { open, mounted, openFlow, closeFlow };
}
