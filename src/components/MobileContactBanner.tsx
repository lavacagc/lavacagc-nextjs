'use client'

import { useState, useEffect } from 'react';
import { Phone, MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const MobileContactBanner = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if banner was previously dismissed
    const dismissed = localStorage.getItem('mobile-contact-banner-dismissed');
    if (dismissed) {
      setIsDismissed(true);
      return;
    }

    // Show banner after user scrolls or after 3 seconds
    let timeoutId: NodeJS.Timeout;
    let hasScrolled = false;

    const handleScroll = () => {
      if (!hasScrolled && window.scrollY > 100) {
        hasScrolled = true;
        setIsVisible(true);
        window.removeEventListener('scroll', handleScroll);
      }
    };

    // Show after 3 seconds if no scroll
    timeoutId = setTimeout(() => {
      if (!hasScrolled) {
        setIsVisible(true);
      }
    }, 3000);

    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(timeoutId);
    };
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    setIsDismissed(true);
    localStorage.setItem('mobile-contact-banner-dismissed', 'true');
  };

  const handleGetQuote = () => {
    const estimateSection = document.getElementById('estimate');
    if (estimateSection) {
      estimateSection.scrollIntoView({ behavior: 'smooth' });
      setIsVisible(false);
    }
  };

  if (isDismissed || !isVisible) return null;

  return (
    <>
      {/* Mobile-only sticky bottom banner */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-border shadow-lg md:hidden">
        <div className="flex items-center justify-between p-3">
          <div className="flex-1 flex items-center space-x-2">
            <a
              href="tel:2012124917"
              className="flex-1"
            >
              <Button
                className="w-full bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button text-sm touch-target"
                size="sm"
              >
                <Phone className="h-4 w-4 mr-1" />
                Call Now
              </Button>
            </a>

            <Button
              onClick={handleGetQuote}
              variant="outline"
              size="sm"
              className="flex-1 border-primary text-primary hover:bg-primary/10 text-sm touch-target"
            >
              <MessageCircle className="h-4 w-4 mr-1" />
              Get Quote
            </Button>
          </div>

          <button
            onClick={handleDismiss}
            className="ml-2 p-2 text-text-muted hover:text-text-primary transition-colors touch-target"
            aria-label="Dismiss banner"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="bg-muted/50 px-3 py-2 text-center">
          <p className="text-xs text-text-muted">
            Free estimates • Licensed & Insured • Family Owned
          </p>
        </div>
      </div>
    </>
  );
};

export default MobileContactBanner;
