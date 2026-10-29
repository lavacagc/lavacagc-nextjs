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
 */
export function useRequestFlow() {
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
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else {
      // Arrived with #request already in the URL: drop it without leaving the page.
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
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

  return { open, mounted, openFlow, closeFlow };
}
