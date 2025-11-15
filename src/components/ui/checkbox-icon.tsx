import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CheckboxIconProps {
  checked?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onChange?: () => void;
  className?: string;
}

/**
 * CheckboxIcon - A properly sized checkbox for content lists
 * 
 * Sizes:
 * - sm: 16px × 16px (dense lists, tables)
 * - md: 20px × 20px (standard lists, default)
 * - lg: 24px × 24px (large cards, emphasized selections)
 */
export function CheckboxIcon({ 
  checked = false, 
  size = 'md',
  onChange,
  className
}: CheckboxIconProps) {
  const sizeClasses = {
    sm: 'h-4 w-4 min-h-4 min-w-4',
    md: 'h-5 w-5 min-h-5 min-w-5',
    lg: 'h-6 w-6 min-h-6 min-w-6'
  };

  const iconSizes = {
    sm: 12,
    md: 14,
    lg: 16
  };

  return (
    <div
      onClick={onChange}
      className={cn(
        sizeClasses[size],
        'border-2 rounded-md',
        'flex items-center justify-center',
        'flex-shrink-0',
        'transition-all duration-200',
        checked 
          ? 'bg-primary border-primary' 
          : 'bg-background border-primary hover:bg-primary/10',
        onChange && 'cursor-pointer',
        className
      )}
    >
      {checked && (
        <Check 
          size={iconSizes[size]} 
          className="text-primary-foreground" 
          strokeWidth={3}
        />
      )}
    </div>
  );
}
