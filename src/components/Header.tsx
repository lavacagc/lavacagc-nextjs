'use client'

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Phone, Menu, X, Home } from "lucide-react";
import logo from "@/assets/logo.png";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import CallTrackingWrapper from "@/components/CallTrackingWrapper";
import { useAuth } from "@/hooks/useAuth";
import { useBuyRemodelPublished } from "@/lib/listings/publishedClient";

/** Read the readable `hc_known` hint cookie (first name) on the client. */
function readHcKnown(): string | null {
  if (typeof document === 'undefined') return null;
  const entry = document.cookie.split('; ').find((c) => c.startsWith('hc_known='));
  if (!entry) return null;
  try {
    const name = decodeURIComponent(entry.slice('hc_known='.length)).trim();
    return name || null;
  } catch {
    return null;
  }
}

const ITEM_CLASS =
  "block px-4 py-2 text-text-secondary hover:text-primary hover:bg-muted rounded-md transition-colors";

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
  const { session } = useAuth();
  const buyRemodelPublished = useBuyRemodelPublished();
  // Show the Buy + Remodel nav once it's published; admins (logged in) always
  // see it so they can reach the page to preview before publishing.
  const showBuyRemodel = buyRemodelPublished || !!session;

  // Returning Home Care members get a direct "My Home Care" portal link instead
  // of the public "Home Care" opt-in link — the two are mutually exclusive. The
  // hc_known cookie is non-httpOnly (name hint only); real access is enforced
  // server-side.
  const [hcKnown, setHcKnown] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of a client-only cookie after mount
    setHcKnown(readHcKnown());
  }, []);

  // The Programs menu holds the homeowner programs. Home Care only appears for
  // non-members (members use the My Home Care chip); Buy + Remodel only when
  // published/admin. Hide the whole menu if it would be empty.
  const showPrograms = showBuyRemodel || !hcKnown;

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
      {/* Trust Bar */}
      <div className="bg-secondary text-secondary-foreground py-2 text-sm">
        <div className="container mx-auto px-4 text-center">
          <span className="font-medium">Licensed, Bonded, & Insured | HIC# 13VH13373800</span>
        </div>
      </div>

      {/* Main Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
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
                  {showBuyRemodel && (
                    <Link href="/buy-and-remodel" className={ITEM_CLASS} role="menuitem">
                      Buy + Remodel
                    </Link>
                  )}
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
          <div id="mobile-menu" className="lg:hidden bg-background border-t border-border" role="navigation" aria-label="Mobile navigation">
            <div className="container mx-auto px-4 py-4 space-y-4">
              {/* Returning member portal access, surfaced first. */}
              {hcKnown && (
                <button
                  onClick={() => navigateToPage('/home-care/checklist')}
                  className="flex w-full items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-primary font-semibold hover:bg-primary/10 transition-colors"
                  aria-label="Open my Home Care checklist"
                >
                  <Home className="h-4 w-4" /> My Home Care
                </button>
              )}

              <div>
                <p className="font-semibold text-text-primary mb-2">Services</p>
                <div className="pl-4 space-y-2">
                  <Link href="/services" className="block font-semibold text-text-primary hover:text-primary transition-colors">
                    Services Hub
                  </Link>
                  <Link href="/home-services" className="block text-text-secondary hover:text-primary transition-colors">
                    Home Services
                  </Link>
                  <Link href="/commercial-services" className="block text-text-secondary hover:text-primary transition-colors">
                    Commercial Services
                  </Link>
                  <p className="pt-2 text-[11px] font-bold uppercase tracking-wider text-text-muted">Remodeling</p>
                  <Link href="/services/kitchen-remodeling" className="block text-text-secondary hover:text-primary transition-colors">
                    Kitchen Remodeling
                  </Link>
                  <Link href="/services/bathroom-renovation" className="block text-text-secondary hover:text-primary transition-colors">
                    Bathroom Renovation
                  </Link>
                  <Link href="/services/basement-finishing" className="block text-text-secondary hover:text-primary transition-colors">
                    Basement Finishing
                  </Link>
                  <Link href="/services/home-additions" className="block text-text-secondary hover:text-primary transition-colors">
                    Home Additions
                  </Link>
                  <Link href="/services/interior-finishing" className="block text-text-secondary hover:text-primary transition-colors">
                    Interior Finishing
                  </Link>
                </div>
              </div>

              <button
                onClick={() => scrollToSection('projects')}
                className="block text-text-secondary hover:text-primary transition-colors font-medium"
                aria-label="View our project gallery"
              >
                Projects
              </button>

              {showPrograms && (
                <div>
                  <p className="font-semibold text-text-primary mb-2">Programs</p>
                  <div className="pl-4 space-y-2">
                    {showBuyRemodel && (
                      <button
                        onClick={() => navigateToPage('/buy-and-remodel')}
                        className="block text-text-secondary hover:text-primary transition-colors"
                        aria-label="Go to buy and remodel homes page"
                      >
                        Buy + Remodel
                      </button>
                    )}
                    {!hcKnown && (
                      <button
                        onClick={() => navigateToPage('/home-care')}
                        className="block text-text-secondary hover:text-primary transition-colors"
                        aria-label="Go to home care page"
                      >
                        Home Care
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div>
                <p className="font-semibold text-text-primary mb-2">Company</p>
                <div className="pl-4 space-y-2">
                  <button
                    onClick={() => navigateToPage('/about')}
                    className="block text-text-secondary hover:text-primary transition-colors"
                    aria-label="Go to about us page"
                  >
                    About
                  </button>
                  <button
                    onClick={() => navigateToPage('/process')}
                    className="block text-text-secondary hover:text-primary transition-colors"
                    aria-label="Go to our process page"
                  >
                    Process
                  </button>
                  <button
                    onClick={() => navigateToPage('/resources')}
                    className="block text-text-secondary hover:text-primary transition-colors"
                    aria-label="Go to homeowner resources page"
                  >
                    Resources
                  </button>
                  <button
                    onClick={() => navigateToPage('/blog')}
                    className="block text-text-secondary hover:text-primary transition-colors"
                    aria-label="Go to blog page"
                  >
                    Blog
                  </button>
                </div>
              </div>

              <button
                onClick={() => navigateToPage('/request-estimate')}
                className="block text-text-secondary hover:text-primary transition-colors font-medium"
                aria-label="Request an estimate"
              >
                Request an Estimate
              </button>

              <div className="pt-4 border-t border-border space-y-3">
                <CallTrackingWrapper
                  href="tel:2012124917"
                  className="flex items-center text-secondary font-semibold"
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
