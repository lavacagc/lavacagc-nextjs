'use client'

import React from 'react';
import { Button, ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MobileOptimizedButtonProps extends ButtonProps {
  touchOptimized?: boolean;
}

const MobileOptimizedButton: React.FC<MobileOptimizedButtonProps> = ({
  className,
  touchOptimized = true,
  children,
  ...props
}) => {
  return (
    <Button
      className={cn(
        // Base mobile optimizations
        'touch-target text-base sm:text-sm',
        // Touch-friendly spacing and sizing
        touchOptimized && [
          'min-h-[48px] min-w-[48px]',
          'px-6 py-3 sm:px-4 sm:py-2',
          'text-base font-medium',
          'active:scale-95 transition-transform duration-100',
          // Ensure proper tap targets on mobile
          'relative',
          'after:absolute after:inset-0 after:z-10'
        ],
        className
      )}
      {...props}
    >
      {children}
    </Button>
  );
};

export default MobileOptimizedButton;
