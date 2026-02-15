'use client'

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  href: string;
}

interface BreadcrumbProps {
  items?: BreadcrumbItem[];
  className?: string;
}

const Breadcrumb: React.FC<BreadcrumbProps> = ({ items, className = '' }) => {
  const pathname = usePathname();

  // Auto-generate breadcrumbs if not provided
  const generateBreadcrumbs = (): BreadcrumbItem[] => {
    const pathSegments = pathname.split('/').filter(segment => segment);
    const breadcrumbs: BreadcrumbItem[] = [];
    
    if (pathSegments.length === 0) return breadcrumbs;

    let currentPath = '';
    
    pathSegments.forEach((segment) => {
      currentPath += `/${segment}`;
      
      // Format segment for display
      let label = segment
        .replace(/-/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());

      // Special formatting for common segments
      if (segment === 'kitchen-remodeling') label = 'Kitchen Remodeling';
      if (segment === 'bathroom-renovation') label = 'Bathroom Renovation';
      if (segment === 'basement-finishing') label = 'Basement Finishing';
      if (segment === 'home-additions') label = 'Home Additions';
      if (segment === 'short-hills') label = 'Short Hills';
      if (segment === 'saddle-river') label = 'Saddle River';
      if (segment === 'essex-fells') label = 'Essex Fells';
      if (segment === 'ho-ho-kus') label = 'Ho-Ho-Kus';
      if (segment === 'west-orange') label = 'West Orange';
      
      breadcrumbs.push({
        label,
        href: currentPath
      });
    });
    
    return breadcrumbs;
  };

  const breadcrumbItems = items || generateBreadcrumbs();

  if (breadcrumbItems.length === 0) return null;

  return (
      <nav 
        className={`flex items-center space-x-2 text-sm text-text-secondary mb-6 ${className}`}
        aria-label="Breadcrumb"
      >
        <Link
          href="/"
          className="flex items-center hover:text-primary transition-colors"
          aria-label="Home"
        >
          <Home className="h-4 w-4" />
        </Link>

        {breadcrumbItems.map((item, index) => (
          <React.Fragment key={item.href}>
            <ChevronRight className="h-4 w-4 text-text-muted" />
            {index === breadcrumbItems.length - 1 ? (
              <span
                className="text-text-primary font-medium"
                aria-current="page"
              >
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="hover:text-primary transition-colors"
              >
                {item.label}
              </Link>
            )}
          </React.Fragment>
        ))}
      </nav>
  );
};

export default Breadcrumb;