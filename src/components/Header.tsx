'use client'

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Phone, Menu, X } from "lucide-react";
import logo from "@/assets/logo.png";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import CallTrackingWrapper from "@/components/CallTrackingWrapper";

const Header = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [servicesMenuOpen, setServicesMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

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
              <div
                className="relative group"
                onMouseLeave={() => setServicesMenuOpen(false)}
              >
                <button
                  onClick={() => setServicesMenuOpen(!servicesMenuOpen)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setServicesMenuOpen(!servicesMenuOpen);
                    }
                    if (e.key === 'Escape' && servicesMenuOpen) {
                      setServicesMenuOpen(false);
                    }
                  }}
                  aria-expanded={servicesMenuOpen}
                  aria-haspopup="true"
                  className="text-text-secondary hover:text-primary transition-colors font-medium flex items-center"
                >
                  Services
                  <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <div
                  className={`absolute top-full left-0 mt-2 w-64 bg-card border rounded-lg shadow-lg transition-all duration-200 z-50 ${
                    servicesMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible group-hover:opacity-100 group-hover:visible'
                  }`}
                  role="menu"
                >
                  <div className="p-2">
                    <Link href="/services/kitchen-remodeling" className="block px-4 py-2 text-text-secondary hover:text-primary hover:bg-muted rounded-md transition-colors" role="menuitem">
                      Kitchen Remodeling
                    </Link>
                    <Link href="/services/bathroom-renovation" className="block px-4 py-2 text-text-secondary hover:text-primary hover:bg-muted rounded-md transition-colors" role="menuitem">
                      Bathroom Renovation
                    </Link>
                    <Link href="/services/basement-finishing" className="block px-4 py-2 text-text-secondary hover:text-primary hover:bg-muted rounded-md transition-colors" role="menuitem">
                      Basement Finishing
                    </Link>
                    <Link href="/services/home-additions" className="block px-4 py-2 text-text-secondary hover:text-primary hover:bg-muted rounded-md transition-colors" role="menuitem">
                      Home Additions
                    </Link>
                    <Link href="/services/interior-finishing" className="block px-4 py-2 text-text-secondary hover:text-primary hover:bg-muted rounded-md transition-colors" role="menuitem">
                      Interior Finishing
                    </Link>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => scrollToSection('projects')} 
                className="text-text-secondary hover:text-primary transition-colors font-medium"
                aria-label="View our project gallery"
              >
                Projects
              </button>
              <Link href="/about" className="text-text-secondary hover:text-primary transition-colors font-medium">About</Link>
              <Link href="/process" className="text-text-secondary hover:text-primary transition-colors font-medium">Process</Link>
              <Link href="/resources" className="text-text-secondary hover:text-primary transition-colors font-medium">Resources</Link>
              <Link href="/blog" className="text-text-secondary hover:text-primary transition-colors font-medium">Blog</Link>
            </nav>

            {/* Right side - CTA and Menu */}
            <div className="flex items-center gap-4 lg:justify-end ml-auto lg:ml-0">
              {/* CTA Section - Visible on tablet and desktop */}
              <Button
                onClick={() => navigateToPage('/project-calculator')}
                variant="default"
                className="hidden md:flex bg-gradient-to-r from-primary via-accent-sunset to-accent-tangerine bg-[length:400%_100%] animate-gradient hover:shadow-button"
              >
                Cost Calculator
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
              <div>
                <p className="font-semibold text-text-primary mb-2">Services</p>
                <div className="pl-4 space-y-2">
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

              <button 
                onClick={() => navigateToPage('/project-calculator')} 
                className="block text-text-secondary hover:text-primary transition-colors font-medium"
                aria-label="Go to project calculator page"
              >
                Project Calculator
              </button>

              <button 
                onClick={() => navigateToPage('/about')} 
                className="block text-text-secondary hover:text-primary transition-colors font-medium"
                aria-label="Go to about us page"
              >
                About Us
              </button>

              <button 
                onClick={() => navigateToPage('/process')} 
                className="block text-text-secondary hover:text-primary transition-colors font-medium"
                aria-label="Go to our process page"
              >
                Our Process
              </button>

              <button 
                onClick={() => navigateToPage('/resources')} 
                className="block text-text-secondary hover:text-primary transition-colors font-medium"
                aria-label="Go to homeowner resources page"
              >
                Resources
              </button>

              <button 
                onClick={() => navigateToPage('/blog')} 
                className="block text-text-secondary hover:text-primary transition-colors font-medium"
                aria-label="Go to blog page"
              >
                Blog
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
