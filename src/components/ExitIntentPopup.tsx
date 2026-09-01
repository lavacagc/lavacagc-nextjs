'use client'

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePathname } from 'next/navigation';
import { isPrivateTokenPage } from '@/lib/privatePages';
import { subscribeBannerState, isBannerVisible } from '@/hooks/useBannerState';
import { readHcKnown } from '@/lib/homecare/knownClient';
import { trackEvent } from '@/services/analyticsManager';
import { GeoGateNotice } from '@/components/GeoGateNotice';

/**
 * Exit-intent popup: catches visitors leaving without converting and offers the
 * lowest-friction way to stay in touch - a one-field signup for the free monthly
 * newsletter (seasonal maintenance tips), which then upsells La Vaca Home Care
 * through its own CTAs. A secondary link still routes people who want the full
 * personalized checklist straight to /home-care.
 *
 * The email capture posts to /api/newsletter/subscribe, which records affirmative
 * consent (the visible consent line below the button) into the `newsletter`
 * marketing stream - covered by the whole unsubscribe workflow, so no leaks.
 *
 * Guardrails kept: once per session, suppressed on excluded pages and while the
 * smart banner shows. Known Home Care members never see it.
 */
const ExitIntentPopup = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [bannerShowing, setBannerShowing] = useState(() => isBannerVisible());

  // Newsletter capture state
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      pathname.startsWith('/home-care') ||
      // Private tokenized pages. Somebody reading their own priced proposal is
      // already a customer, and this fires exactly when they move to leave -
      // which on /proposal is the moment they are closing a page we asked them
      // to answer. A newsletter signup is the wrong thing to say there.
      isPrivateTokenPage(pathname)
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

    // Members already have their checklist - nothing to pitch.
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
      trackEvent('newsletter_promo_view', { placement: 'exit_intent' });
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
        // Re-arm the entry the Back press just consumed. No url argument, for
        // the reason given below.
        window.history.pushState({ exitIntent: true }, '');
      }
    };

    // Add an extra history entry so a mobile Back press fires `popstate` here
    // instead of leaving the site.
    //
    // NO URL ARGUMENT, and that is the whole point. `pushState(state, '')` adds
    // the entry at whatever the current URL is; `pushState(null, '', href)`
    // WRITES that href. The old call read `window.location.href` and wrote it
    // back, so one landing in the middle of a client-side navigation replaced
    // the incoming url with the outgoing one and the navigation was simply
    // lost: the address bar snapped back and the page the visitor asked for
    // never arrived. This effect re-runs on `pathname`, which changes during a
    // navigation, so it fired at exactly the wrong moment.
    //
    // Measured, not guessed. Clicking a header nav item, traced: the failing
    // runs recorded `pushState -> <the page being left>` and the URL stuck
    // there. Disabling this component entirely took a load-sensitive nav test
    // from 2 failures in 25 runs to 0 in 25; omitting the url argument does the
    // same while keeping the feature, because an entry with no url cannot
    // overwrite one.
    window.history.pushState({ exitIntent: true }, '');

    document.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('popstate', handlePopState);

    return () => {
      document.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('popstate', handlePopState);
      clearTimeout(timeoutId);
    };
  }, [pathname, isOpen, bannerShowing, shouldShowOnPage]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'exit_intent' }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setDone(true);
        trackEvent('newsletter_signup', { placement: 'exit_intent' });
      } else {
        setError(data.error || 'Something went wrong - please try again.');
      }
    } catch {
      setError('Something went wrong - please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        {done ? (
          <div className="py-4 text-center" data-testid="newsletter-done">
            <div className="text-4xl" aria-hidden>📬</div>
            <DialogTitle className="mt-3 text-2xl font-bold">You&apos;re on the list!</DialogTitle>
            <DialogDescription className="mt-2 text-base">
              We&apos;ll send seasonal home-care tips to <span className="font-semibold break-all">{email}</span> each
              month. Want your plan tailored to your exact home?
            </DialogDescription>
            <Link
              href="/home-care"
              onClick={() => {
                trackEvent('home_care_promo_click', { placement: 'exit_intent_upsell' });
                setIsOpen(false);
              }}
              className="mt-4 flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-primary to-accent-sunset px-6 py-3.5 text-sm font-bold text-white shadow-button transition-all hover:-translate-y-px"
            >
              Get my personalized Home Care plan
            </Link>
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-accent-sunset">
                Before you go - it&apos;s free
              </div>
              <DialogTitle className="text-2xl font-bold leading-snug text-left">
                Get seasonal home-care tips in your inbox
              </DialogTitle>
              <DialogDescription className="text-left text-base">
                Join our free monthly newsletter - what to check and maintain around your NJ home each season.
                No account, one email a month, unsubscribe anytime.
              </DialogDescription>
            </DialogHeader>

            <GeoGateNotice kind="newsletter" className="mt-3 mb-0" />
            <form onSubmit={submit} className="mt-2 space-y-2" data-testid="newsletter-form">
              <label htmlFor="newsletter-email" className="sr-only">Email address</label>
              <Input
                id="newsletter-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                placeholder="you@example.com"
                data-testid="newsletter-email"
              />
              {error && (
                <p className="text-sm text-destructive" role="alert" data-testid="newsletter-error">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                disabled={submitting}
                data-testid="newsletter-submit"
                className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-primary to-accent-sunset px-6 py-3.5 text-sm font-bold text-white shadow-button transition-all hover:-translate-y-px"
              >
                {submitting ? 'Signing you up…' : 'Send me the free tips'}
              </Button>
              {/* CAN-SPAM: clear, visible consent statement at the point of signup. */}
              <p className="text-[11px] leading-snug text-muted-foreground text-center">
                By subscribing you agree to receive the La Vaca monthly newsletter. We never share your email, and you
                can unsubscribe from any message. See our{' '}
                <Link href="/privacy-policy" className="underline hover:text-primary">Privacy Policy</Link>.
              </p>
            </form>

            <div className="mt-1 border-t pt-3 text-center">
              <Link
                href="/home-care"
                onClick={() => {
                  trackEvent('home_care_promo_click', { placement: 'exit_intent' });
                  setIsOpen(false);
                }}
                className="text-sm font-semibold text-primary hover:underline"
              >
                Or get a plan personalized to your home →
              </Link>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ExitIntentPopup;
