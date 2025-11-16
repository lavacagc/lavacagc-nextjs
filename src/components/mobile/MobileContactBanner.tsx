'use client'

import React, { useState, useEffect } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ClickToCall from './ClickToCall';

const MobileContactBanner: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

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
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('mobile-contact-banner-dismissed', 'true');
    }
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
            <ClickToCall
              phoneNumber="(201) 555-0123"
              variant="default"
              className="flex-1 bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button text-sm"
              size="sm"
            />

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

          <Button
            onClick={handleDismiss}
            variant="ghost"
            size="sm"
            className="ml-2 p-1 touch-target"
            aria-label="Dismiss banner"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Add padding to body to prevent content from being hidden */}
      <style jsx global>
        {`
          @media (max-width: 767px) {
            body {
              padding-bottom: 70px !important;
            }
          }
        `}
      </style>
    </>
  );
};

export default MobileContactBanner;
