import React, { useState, useEffect } from 'react';
import { LucideIcon } from 'lucide-react';

interface NavItem {
  id: string;
  icon: LucideIcon;
  label: string;
  width: string;
}

interface HorizontalNavProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  items: NavItem[];
}

/**
 * HorizontalNav - Reusable horizontal navigation with expandable labels
 * 
 * @param {Object} props
 * @param {string} props.activeTab - Currently active tab ID
 * @param {function} props.onTabChange - Callback when tab is clicked
 * @param {Array} props.items - Navigation items array
 * 
 * Navigation items structure:
 * [
 *   { 
 *     id: 'unique-id', 
 *     icon: IconComponent, 
 *     label: 'Display Name',
 *     width: '80px' // Approximate label width for smooth expansion
 *   }
 * ]
 */
export default function HorizontalNav({ activeTab, onTabChange, items }: HorizontalNavProps) {
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div className="bg-background border-b border-border sticky top-0 z-10 w-full max-w-full">
      {/* Scrollable container - only this scrolls, not the page */}
      <div 
        className="overflow-x-auto overflow-y-hidden scrollbar-hide w-full"
        style={{ 
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <div className="flex items-center justify-start md:justify-center gap-3 px-4 py-3 min-w-max">
          {items.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`group flex items-center rounded-lg transition-all duration-300 ease-out px-3 py-2 flex-shrink-0 ${
                  isActive 
                    ? 'bg-muted text-foreground' 
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                }`}
                style={{
                  // On mobile, always show labels. On desktop, use expand behavior
                  width: isMobile || isActive ? 'auto' : '44px'
                }}
                onMouseEnter={(e) => {
                  if (!isMobile && !isActive) {
                    e.currentTarget.style.width = `calc(${tab.width} + 32px)`;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isMobile && !isActive) {
                    e.currentTarget.style.width = '44px';
                  }
                }}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span 
                  className={`text-sm font-medium whitespace-nowrap overflow-hidden transition-all duration-300 ease-out ${
                    isMobile || isActive 
                      ? 'opacity-100 ml-2.5' 
                      : 'opacity-0 w-0 ml-0 group-hover:opacity-100 group-hover:w-auto group-hover:ml-2.5'
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
