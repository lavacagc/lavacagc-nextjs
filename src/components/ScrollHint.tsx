'use client';

import { useState, useEffect, RefObject } from 'react';
import { ChevronRight } from 'lucide-react';

interface ScrollHintProps {
  scrollRef: RefObject<HTMLDivElement | null>;
  className?: string;
}

/**
 * Shows a fade edge + animated swipe indicator on mobile
 * when horizontal scroll content extends beyond the viewport.
 * Auto-hides once the user scrolls.
 */
export function ScrollHint({ scrollRef, className = '' }: ScrollHintProps) {
  const [showHint, setShowHint] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // Only show on mobile-ish widths
    const checkOverflow = () => {
      if (window.innerWidth < 1024 && el.scrollWidth > el.clientWidth + 20) {
        setShowHint(true);
      } else {
        setShowHint(false);
      }
    };

    checkOverflow();
    window.addEventListener('resize', checkOverflow);

    const handleScroll = () => {
      if (el.scrollLeft > 30) {
        setHasScrolled(true);
      }
    };

    el.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('resize', checkOverflow);
      el.removeEventListener('scroll', handleScroll);
    };
  }, [scrollRef]);

  if (!showHint || hasScrolled) return null;

  return (
    <>
      {/* Right fade edge */}
      <div
        className={`absolute right-0 top-0 bottom-4 w-16 pointer-events-none z-10 bg-gradient-to-l from-background to-transparent lg:hidden ${className}`}
      />
      {/* Animated swipe pill */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-20 pointer-events-none lg:hidden animate-bounce-x">
        <div className="flex items-center gap-1 bg-primary/90 text-primary-foreground text-xs font-medium px-3 py-1.5 rounded-full shadow-lg backdrop-blur-sm">
          <span>Swipe</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </>
  );
}
