'use client'

import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Phone, Menu, X, Home } from "lucide-react";
import logo from "@/assets/logo.png";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import CallTrackingWrapper from "@/components/CallTrackingWrapper";
import { readHcKnown } from "@/lib/homecare/knownClient";
import { trackEvent } from "@/services/analyticsManager";
import { setMobileMenuOpen as publishMobileMenuOpen } from "@/hooks/useMobileMenuState";

const ITEM_CLASS =
  "block px-4 py-2 text-text-secondary hover:text-primary hover:bg-muted rounded-md transition-colors";

/**
 * One row in the mobile menu, whether it is a <Link>, a <button> or the phone
 * link, so every entry shares one left edge and one height.
 *
 * Three base rules in globals.css would otherwise pull the entries apart. They
 * are overridden here, inside the menu only, never weakened site-wide:
 * - `a, button { margin: 2px }` shifted every link and button 2px off the
 *   headings' edge: `m-0`.
 * - `button { min-width: 44px }` plus the default `text-align: center`
 *   centered short labels ("Blog") inside a 44px box: `w-full min-w-0 text-left`.
 * - `button { min-height: 44px }` gave buttons 44px rows while links had 26px
 *   ones. Rather than shrink the buttons, EVERY row gets `min-h-11` (44px), so
 *   each tap target keeps the size that rule exists to guarantee.
 */
const MOBILE_ROW_LAYOUT = "m-0 flex w-full min-w-0 min-h-11 items-center py-2 text-left";
const MOBILE_ROW = `${MOBILE_ROW_LAYOUT} text-text-secondary hover:text-primary transition-colors`;
const MOBILE_HEADING = "m-0 font-semibold text-text-primary";

/** A hover/click/keyboard-accessible desktop nav dropdown. Manages its own open state. */
function NavDropdown({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative group" onMouseLeave={() => setOpen(false)}>
      <button
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(!open);
          }
          if (e.key === 'Escape' && open) {
            setOpen(false);
          }
        }}
        aria-expanded={open}
        aria-haspopup="true"
        className="text-text-secondary hover:text-primary transition-colors font-medium flex items-center"
      >
        {label}
        <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        className={`absolute top-full left-0 mt-2 w-64 bg-card border rounded-lg shadow-lg transition-all duration-200 z-50 ${
          open ? 'opacity-100 visible' : 'opacity-0 invisible group-hover:opacity-100 group-hover:visible'
        }`}
        role="menu"
      >
        <div className="p-2">{children}</div>
      </div>
    </div>
  );
}

const Header = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  // Returning Home Care members get a direct "My Home Care" portal link instead
  // of the public "Home Care" opt-in link — the two are mutually exclusive. The
  // hc_known cookie is non-httpOnly (name hint only); real access is enforced
  // server-side.
  const [hcKnown, setHcKnown] = useState<string | null>(null);
  useEffect(() => {
     
    setHcKnown(readHcKnown());
  }, []);

  // The Programs menu holds the homeowner programs. Home Care only appears for
  // non-members (members use the My Home Care chip). Hide the whole menu if it
  // would be empty.
  const showPrograms = !hcKnown;

  // Tell the bottom-pinned chrome - the StickyCTA bar, the SmartBanner cards
  // and the ReviewToast - to get out of the way while the menu is open. They
  // are all fixed to the bottom of the viewport, which is where the menu's last
  // entries are. See useMobileMenuState for why they gate on this flag rather
  // than on a breakpoint.
  useEffect(() => {
    publishMobileMenuOpen(mobileMenuOpen);
  }, [mobileMenuOpen]);
  // Always publish `false` on unmount. Every page renders its own <Header>, so
  // navigating away from a page with the menu open unmounts this instance while
  // the flag still reads `true`, and the chrome would stay hidden on the next
  // page with no menu left to explain why.
  useEffect(() => () => publishMobileMenuOpen(false), []);

  // Close the menu when the viewport crosses to the desktop layout. The toggle
  // and the menu are BOTH `lg:hidden`, so a menu opened at 900px and then
  // widened past 1024px would otherwise stay open with no X button on screen to
  // clear it - and, now that the chrome subscribes to that flag, would strand
  // the chrome hidden on a viewport where it belongs. Listening only for the
  // crossing is enough: `mobileMenuOpen` starts false and the only thing that
  // sets it true is a toggle that does not exist at this width.
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = (e: MediaQueryListEvent) => {
      if (e.matches) setMobileMenuOpen(false);
    };
    mql.addEventListener('change', closeOnDesktop);
    return () => mql.removeEventListener('change', closeOnDesktop);
  }, []);

  // The menu lives inside a `sticky` header that stays pinned at the top, so a
  // menu taller than the viewport is not reachable by scrolling the page - its
  // overflow is simply cut off (measured 188px, including the phone number, on
  // a 390x844 phone). Cap it to the space actually left below the header and
  // let it scroll itself. Measured rather than a `calc(100dvh - ...)` guess:
  // the header row has three heights across breakpoints, the promo bar above it
  // scrolls away, and a SmartBanner can offset the whole header.
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = menuRef.current;
    if (!mobileMenuOpen || !el) return;

    const fitToViewport = () => {
      const top = el.getBoundingClientRect().top;
      el.style.maxHeight = `${Math.max(160, window.innerHeight - top)}px`;
    };
    fitToViewport();

    // A SmartBanner top bar mounting - or being dismissed - while the menu is
    // already open rewrites --smart-banner-height, which slides this header's
    // sticky `top` without firing either a resize or a scroll. Re-measure when
    // that transition lands, or the cap keeps the height of the old position
    // and the menu runs off the bottom of the viewport again.
    const header = el.closest('header');
    const onHeaderSettled = (e: TransitionEvent) => {
      if (e.propertyName === 'top') fitToViewport();
    };
    header?.addEventListener('transitionend', onHeaderSettled);
    window.addEventListener('resize', fitToViewport);
    window.addEventListener('scroll', fitToViewport, { passive: true });
    return () => {
      header?.removeEventListener('transitionend', onHeaderSettled);
      window.removeEventListener('resize', fitToViewport);
      window.removeEventListener('scroll', fitToViewport);
    };
  }, [mobileMenuOpen]);

  const scrollToSection = (sectionId: string) => {
    // Close mobile menu if open
    setMobileMenuOpen(false);

    // If we're not on the home page, navigate there first
    if (pathname !== '/') {
      router.push('/');
      // Wait for navigation to complete, then scroll
      setTimeout(() => {
        const element = document.getElementById(sectionId);
        if (element) {
          element.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      }, 300);
    } else {
      // If we're already on the home page, just scroll
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    }
  };

  const navigateToPage = (path: string) => {
    setMobileMenuOpen(false);
    router.push(path);
    // Scroll to top after navigation
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  return (
    <>
      {/* Trust Bar + Home Care promo line. On mobile the promo takes the slot
          (the license line stays in the footer and /warranty); desktop shows
          both. Members get their portal link instead of the opt-in pitch. */}
      <div className="bg-secondary text-secondary-foreground py-2 text-sm">
        <div className="container mx-auto px-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-center">
          <span className="font-medium hidden md:inline">Licensed, Bonded, & Insured | HIC# 13VH13373800</span>
          <Link
            href={hcKnown ? '/home-care/checklist' : '/home-care'}
            onClick={() => trackEvent('home_care_promo_click', { placement: 'utility_bar', member: !!hcKnown })}
            className="group inline-flex items-center gap-2 py-0.5 font-semibold text-[#FFD9AD] hover:text-white transition-colors"
          >
            {hcKnown ? (
              <span>
                Your seasonal checklist is waiting —{' '}
                <span className="underline underline-offset-2 decoration-[#FFD9AD]/60 group-hover:decoration-white">open it →</span>
              </span>
            ) : (
              <>
                <span className="rounded-full bg-gradient-to-r from-primary to-accent-sunset px-2 py-px text-[10px] font-extrabold tracking-wider text-white">NEW</span>
                <span>
                  Free seasonal home checklist —{' '}
                  <span className="underline underline-offset-2 decoration-[#FFD9AD]/60 group-hover:decoration-white">get yours →</span>
                </span>
              </>
            )}
          </Link>
        </div>
      </div>

      {/* Main Header. HomeCareChecklistClient's sticky plan bar offsets itself by
          this element's measured height (ResizeObserver on the page's first
          <header>), so keep this the first <header> on pages that render it. */}
      <header className="sticky top-[var(--smart-banner-height,0px)] z-50 transition-[top] duration-300 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-20 min-[480px]:h-24 md:h-28 lg:grid lg:grid-cols-[auto_1fr_auto]">
            {/* Logo */}
            <Link
              href="/"
              className="flex items-center space-x-1.5 sm:space-x-2 md:space-x-3 hover:opacity-80 transition-opacity"
              aria-label="La Vaca General Contractors - Home"
            >
              <Image
                src={logo}
                alt="La Vaca General Contractors"
                className="max-h-[60px] min-[480px]:max-h-[80px] md:max-h-[100px] w-auto object-contain"
                priority
              />
              <div className="text-left">
                <span className="font-bold text-sm min-[480px]:text-base md:text-lg text-text-primary block">La Vaca</span>
                <p className="text-sm text-text-muted -mt-0.5 md:-mt-1">General Contractors</p>
              </div>
            </Link>

            {/* Desktop Navigation - Centered */}
            <nav className="hidden lg:flex items-center justify-center space-x-8">
              <NavDropdown label="Services">
                <Link href="/services" className="block px-4 py-2 font-semibold text-text-primary hover:text-primary hover:bg-muted rounded-md transition-colors" role="menuitem">
                  Services Hub
                </Link>
                <Link href="/home-services" className={ITEM_CLASS} role="menuitem">
                  Home Services
                </Link>
                <Link href="/commercial-services" className={ITEM_CLASS} role="menuitem">
                  Commercial Services
                </Link>
                <div className="my-1 border-t border-border" />
                <p className="px-4 pt-1 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-text-muted">Remodeling</p>
                <Link href="/services/kitchen-remodeling" className={ITEM_CLASS} role="menuitem">
                  Kitchen Remodeling
                </Link>
                <Link href="/services/bathroom-renovation" className={ITEM_CLASS} role="menuitem">
                  Bathroom Renovation
                </Link>
                <Link href="/services/basement-finishing" className={ITEM_CLASS} role="menuitem">
                  Basement Finishing
                </Link>
                <Link href="/services/home-additions" className={ITEM_CLASS} role="menuitem">
                  Home Additions
                </Link>
                <Link href="/services/interior-finishing" className={ITEM_CLASS} role="menuitem">
                  Interior Finishing
                </Link>
              </NavDropdown>

              <button
                onClick={() => scrollToSection('projects')}
                className="text-text-secondary hover:text-primary transition-colors font-medium"
                aria-label="View our project gallery"
              >
                Projects
              </button>

              {showPrograms && (
                <NavDropdown label="Programs">
                  {!hcKnown && (
                    <Link href="/home-care" className={ITEM_CLASS} role="menuitem">
                      Home Care
                    </Link>
                  )}
                </NavDropdown>
              )}

              <NavDropdown label="Company">
                <Link href="/about" className={ITEM_CLASS} role="menuitem">
                  About
                </Link>
                <Link href="/process" className={ITEM_CLASS} role="menuitem">
                  Process
                </Link>
                <Link href="/resources" className={ITEM_CLASS} role="menuitem">
                  Resources
                </Link>
                <Link href="/blog" className={ITEM_CLASS} role="menuitem">
                  Blog
                </Link>
              </NavDropdown>
            </nav>

            {/* Right side - CTA and Menu */}
            <div className="flex items-center gap-3 lg:justify-end ml-auto lg:ml-0">
              {/* Returning member portal access — an account chip, not a marketing link. */}
              {hcKnown && (
                <Link
                  href="/home-care/checklist"
                  className="hidden lg:inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3.5 py-2 text-sm font-semibold text-primary hover:bg-primary/10 transition-colors"
                >
                  <Home className="h-4 w-4" /> My Home Care
                </Link>
              )}

              {/* CTA Section - Visible on desktop only (logo + hamburger on mobile/tablet) */}
              <Button
                onClick={() => navigateToPage('/request-estimate')}
                variant="default"
                className="hidden lg:flex bg-gradient-to-r from-primary via-accent-sunset to-accent-tangerine bg-[length:400%_100%] animate-gradient hover:shadow-button"
              >
                Request an Estimate
              </Button>

              {/* Mobile/Tablet Menu Button */}
              <button
                className="lg:hidden p-2"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-menu"
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile/Tablet Menu */}
        {mobileMenuOpen && (
          <div
            id="mobile-menu"
            ref={menuRef}
            className="lg:hidden bg-background border-t border-border overflow-y-auto overscroll-contain"
            role="navigation"
            aria-label="Mobile navigation"
          >
            <div className="container mx-auto px-4 py-4 space-y-4">
              {/* Returning member portal access, surfaced first. */}
              {hcKnown && (
                <button
                  onClick={() => navigateToPage('/home-care/checklist')}
                  className="m-0 flex w-full min-h-11 items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-primary font-semibold hover:bg-primary/10 transition-colors"
                  aria-label="Open my Home Care checklist"
                >
                  <Home className="h-4 w-4" /> My Home Care
                </button>
              )}

              <div>
                <p className={MOBILE_HEADING}>Services</p>
                <Link href="/services" className={`${MOBILE_ROW_LAYOUT} font-semibold text-text-primary hover:text-primary transition-colors`}>
                  Services Hub
                </Link>
                <Link href="/home-services" className={MOBILE_ROW}>
                  Home Services
                </Link>
                <Link href="/commercial-services" className={MOBILE_ROW}>
                  Commercial Services
                </Link>
                <p className="m-0 pt-2 text-[11px] font-bold uppercase tracking-wider text-text-muted">Remodeling</p>
                <Link href="/services/kitchen-remodeling" className={MOBILE_ROW}>
                  Kitchen Remodeling
                </Link>
                <Link href="/services/bathroom-renovation" className={MOBILE_ROW}>
                  Bathroom Renovation
                </Link>
                <Link href="/services/basement-finishing" className={MOBILE_ROW}>
                  Basement Finishing
                </Link>
                <Link href="/services/home-additions" className={MOBILE_ROW}>
                  Home Additions
                </Link>
                <Link href="/services/interior-finishing" className={MOBILE_ROW}>
                  Interior Finishing
                </Link>
              </div>

              <button
                onClick={() => scrollToSection('projects')}
                className={`${MOBILE_ROW} font-medium`}
                aria-label="View our project gallery"
              >
                Projects
              </button>

              {showPrograms && (
                <div>
                  <p className={MOBILE_HEADING}>Programs</p>
                  {!hcKnown && (
                    <button
                      onClick={() => navigateToPage('/home-care')}
                      className={MOBILE_ROW}
                      aria-label="Go to home care page"
                    >
                      Home Care
                    </button>
                  )}
                </div>
              )}

              <div>
                <p className={MOBILE_HEADING}>Company</p>
                <button
                  onClick={() => navigateToPage('/about')}
                  className={MOBILE_ROW}
                  aria-label="Go to about us page"
                >
                  About
                </button>
                <button
                  onClick={() => navigateToPage('/process')}
                  className={MOBILE_ROW}
                  aria-label="Go to our process page"
                >
                  Process
                </button>
                <button
                  onClick={() => navigateToPage('/resources')}
                  className={MOBILE_ROW}
                  aria-label="Go to homeowner resources page"
                >
                  Resources
                </button>
                <button
                  onClick={() => navigateToPage('/blog')}
                  className={MOBILE_ROW}
                  aria-label="Go to blog page"
                >
                  Blog
                </button>
              </div>

              <button
                onClick={() => navigateToPage('/request-estimate')}
                className={`${MOBILE_ROW} font-medium`}
                aria-label="Request an estimate"
              >
                Request an Estimate
              </button>

              <div className="pt-4 border-t border-border">
                <CallTrackingWrapper
                  href="tel:2012124917"
                  className={`${MOBILE_ROW_LAYOUT} text-secondary font-semibold`}
                >
                  <Phone className="h-4 w-4 mr-2" />
                  (201) 212-4917
                </CallTrackingWrapper>
              </div>
            </div>
          </div>
        )}
      </header>
    </>
  );
};

export default Header;
