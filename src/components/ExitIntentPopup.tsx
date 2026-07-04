'use client'

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { usePathname } from 'next/navigation';
import { subscribeBannerState, isBannerVisible } from '@/hooks/useBannerState';
import { readHcKnown } from '@/lib/homecare/knownClient';
import { trackEvent } from '@/services/analyticsManager';

/**
 * Exit-intent popup: offers the free Home Care seasonal checklist to visitors
 * leaving without converting (owner decision 2026-07-03 — replaced the second
 * estimate ask; a free checklist is a much softer exit offer, and every
 * signup is an owned email channel). Existing guardrails kept: once per
 * session, suppressed on excluded pages and while the smart banner shows.
 * Known Home Care members never see it — they already have the checklist.
 */
const ExitIntentPopup = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [bannerShowing, setBannerShowing] = useState(() => isBannerVisible());

  // Listen for SmartBanner visibility
  useEffect(() => {
    return subscribeBannerState(setBannerShowing);
  }, []);
  const pathname = usePathname();

  // Check if current page should show the popup
  const shouldShowOnPage = useCallback(() => {
    // Don't show on admin, auth, blog, or other excluded pages
    if (
      pathname.startsWith('/admin') || pathname.startsWith('/vaca-mgmt') ||
      pathname.startsWith('/auth') ||
      pathname.startsWith('/blog') ||
      pathname.startsWith('/do-not-sell') ||
      pathname.startsWith('/privacy-policy') ||
      pathname.startsWith('/terms-and-conditions') ||
      pathname.startsWith('/home-care')
    ) {
      return false;
    }
    // Show on homepage, service pages, and other main pages
    return true;
  }, [pathname]);

  useEffect(() => {
    // Don't show if not on allowed page
    if (!shouldShowOnPage()) {
      return;
    }

    // Members already have their checklist — nothing to pitch.
    if (readHcKnown()) {
      return;
    }

    // Check if already shown this session
    const hasShown = sessionStorage.getItem('exit_intent_shown');
    if (hasShown) {
      return;
    }

    let timeoutId: NodeJS.Timeout;

    const open = () => {
      setIsOpen(true);
      sessionStorage.setItem('exit_intent_shown', 'true');
      trackEvent('home_care_promo_view', { placement: 'exit_intent' });
    };

    // Desktop: detect mouse leaving viewport
    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0 && !isOpen && !bannerShowing) {
        timeoutId = setTimeout(open, 100);
      }
    };

    // Mobile: detect back button intent (popstate event)
    const handlePopState = () => {
      if (!isOpen && !bannerShowing) {
        open();
        // Push state back to prevent actual navigation
        window.history.pushState(null, '', window.location.href);
      }
    };

    // Add extra history entry for mobile back button detection
    window.history.pushState(null, '', window.location.href);

    document.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('popstate', handlePopState);

    return () => {
      document.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('popstate', handlePopState);
      clearTimeout(timeoutId);
    };
  }, [pathname, isOpen, bannerShowing, shouldShowOnPage]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-accent-sunset">
            Before you go — it&apos;s free
          </div>
          <DialogTitle className="text-2xl font-bold leading-snug text-left">
            Not ready to remodel? Take the checklist instead.
          </DialogTitle>
          <DialogDescription className="text-left text-base">
            Get a seasonal maintenance plan personalized to your NJ home — what to do each season, in your inbox.
            20-second setup, no account, unsubscribe anytime.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 space-y-2">
          <Link
            href="/home-care"
            onClick={() => {
              trackEvent('home_care_promo_click', { placement: 'exit_intent' });
              setIsOpen(false);
            }}
            className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-primary to-accent-sunset px-6 py-3.5 text-sm font-bold text-white shadow-button transition-all hover:-translate-y-px"
          >
            Get my free seasonal plan
          </Link>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              trackEvent('home_care_promo_dismiss', { placement: 'exit_intent' });
              setIsOpen(false);
            }}
            className="w-full text-sm text-muted-foreground"
          >
            No thanks, I&apos;ll wing it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExitIntentPopup;
