'use client'

import React, { useState } from 'react';
import { Menu, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ClickToCall from './ClickToCall';

const MobileNavigation: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const navigationItems = [
    { name: 'Home', href: '/' },
    { name: 'Services', href: '#', isDropdown: true, items: [
      { name: 'Kitchen Remodeling', href: '/kitchen-remodeling' },
      { name: 'Bathroom Renovation', href: '/bathroom-renovation' },
      { name: 'Basement Finishing', href: '/basement-finishing' },
      { name: 'Home Additions', href: '/home-additions' },
    ]},
    { name: 'Locations', href: '#', isDropdown: true, items: [
      { name: 'Alpine, NJ', href: '/locations/alpine' },
      { name: 'Short Hills, NJ', href: '/locations/short-hills' },
      { name: 'Saddle River, NJ', href: '/locations/saddle-river' },
      { name: 'Essex Fells, NJ', href: '/locations/essex-fells' },
    ]},
    { name: 'Portfolio', href: '/portfolio' },
    { name: 'Process', href: '/process' },
    { name: 'About', href: '/about' },
  ];

  return (
    <div className="md:hidden">
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="touch-target p-2"
            aria-label="Open navigation menu"
          >
            <Menu className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[300px] sm:w-[350px]">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle className="text-left text-lg font-bold text-primary">
              La Vaca General Contractors
            </SheetTitle>
          </SheetHeader>

          <nav className="mt-6">
            <ul className="space-y-2">
              {navigationItems.map((item, index) => (
                <li key={index}>
                  {item.isDropdown ? (
                    <div>
                      <div className="font-medium text-text-primary mb-2 px-3 py-2">
                        {item.name}
                      </div>
                      <ul className="ml-4 space-y-1">
                        {item.items?.map((subItem, subIndex) => (
                          <li key={subIndex}>
                            <Link
                              href={subItem.href}
                              className="block px-3 py-2 text-text-secondary hover:text-primary hover:bg-primary/5 rounded-md transition-colors touch-target"
                              onClick={() => setIsOpen(false)}
                            >
                              {subItem.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <Link
                      href={item.href}
                      className={`
                        block px-3 py-3 rounded-md transition-colors touch-target font-medium
                        ${pathname === item.href
                          ? 'text-primary bg-primary/10'
                          : 'text-text-primary hover:text-primary hover:bg-primary/5'
                        }
                      `}
                      onClick={() => setIsOpen(false)}
                    >
                      {item.name}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          {/* Mobile-specific CTA section */}
          <div className="absolute bottom-6 left-6 right-6 space-y-3 border-t pt-6">
            <ClickToCall
              phoneNumber="(201) 555-0123"
              displayNumber="(201) 555-0123"
              className="w-full bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button"
              size="lg"
            >
              Call Now
            </ClickToCall>

            <div className="flex items-center justify-center text-xs text-text-muted space-x-1">
              <MapPin className="h-3 w-3" />
              <span>Serving Northern New Jersey</span>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default MobileNavigation;
