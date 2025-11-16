'use client'

import React from 'react';
import { Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ClickToCallProps {
  phoneNumber: string;
  displayNumber?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'link';
  size?: 'sm' | 'default' | 'lg';
  className?: string;
  showIcon?: boolean;
  children?: React.ReactNode;
}

const ClickToCall: React.FC<ClickToCallProps> = ({
  phoneNumber,
  displayNumber,
  variant = 'default',
  size = 'default',
  className = '',
  showIcon = true,
  children
}) => {
  // Clean phone number for tel: link (remove all non-digits except +)
  const cleanPhoneNumber = phoneNumber.replace(/[^\d+]/g, '');
  const formattedDisplay = displayNumber || phoneNumber;

  const handleClick = () => {
    // Track click event for analytics
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'phone_call', {
        event_category: 'engagement',
        event_label: cleanPhoneNumber,
      });
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={`touch-target ${className}`}
      onClick={handleClick}
      asChild
    >
      <a
        href={`tel:${cleanPhoneNumber}`}
        className="flex items-center justify-center no-underline"
        aria-label={`Call ${formattedDisplay}`}
      >
        <Phone className="h-5 w-5" />
      </a>
    </Button>
  );
};

export default ClickToCall;
