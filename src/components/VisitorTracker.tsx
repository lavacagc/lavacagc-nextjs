'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useVisitor } from '@/hooks/useVisitor';

/**
 * Global visitor tracker — runs on every page.
 * Tracks visitor identity, visit count, and page history in localStorage.
 * No API calls — lightweight client-side only.
 */
export default function VisitorTracker() {
  const pathname = usePathname();
  const { trackPage } = useVisitor();

  useEffect(() => {
    if (pathname) {
      trackPage(pathname);
    }
  }, [pathname, trackPage]);

  return null;
}
