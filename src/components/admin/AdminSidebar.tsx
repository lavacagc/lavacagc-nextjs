import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Activity, 
  Bot, 
  FileText, 
  Wrench, 
  MapPin, 
  FolderKanban, 
  Globe, 
  Plus,
  X,
  Inbox,
  Calculator,
  DollarSign,
  Shield,
  BarChart
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

interface AdminSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isMobileOpen: boolean;
  onMobileClose: () => void;
}

export default function AdminSidebar({ activeTab, onTabChange, isMobileOpen, onMobileClose }: AdminSidebarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isMobile = useIsMobile();
  
  const navigationItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'diagnostics', icon: Activity, label: 'Diagnostics' },
    { id: 'ai', icon: Bot, label: 'AI Assistant' },
    { id: 'blog', icon: FileText, label: 'Blog Posts' },
    { id: 'services', icon: Wrench, label: 'Services' },
    { id: 'service-areas', icon: MapPin, label: 'Service Areas' },
    { id: 'projects', icon: FolderKanban, label: 'Projects' },
    { id: 'seo', icon: Globe, label: 'SEO/Sitemap' },
    { id: 'analytics', icon: Activity, label: 'Analytics' },
    { id: 'gmb', icon: Activity, label: 'Google Reviews' },
    { id: 'leads', icon: Inbox, label: 'Leads' },
    { id: 'estimates', icon: Calculator, label: 'Calculator Estimates' },
    { id: 'pricing', icon: DollarSign, label: 'Pricing Management' },
    { id: 'non-negotiables', icon: Shield, label: 'Non-Negotiables' },
    { id: 'reports', icon: BarChart, label: 'Reports' },
  ];

  const handleTabChange = (tab: string) => {
    onTabChange(tab);
    if (isMobile) {
      onMobileClose();
    }
  };

  // Close mobile menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobile && isMobileOpen) {
        onMobileClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isMobile, isMobileOpen, onMobileClose]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobile && isMobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMobile, isMobileOpen]);

  return (
    <>
      {/* Mobile backdrop overlay */}
      {isMobile && isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 transition-opacity duration-300"
          onClick={onMobileClose}
        />
      )}

      <div 
        className={cn(
          "bg-background border-r border-border h-screen py-4 flex flex-col transition-all duration-500 ease-out fixed left-0 top-0 z-40",
          // Mobile styles
          isMobile ? (
            isMobileOpen ? "w-[280px] translate-x-0" : "w-[280px] -translate-x-full"
          ) : (
            // Desktop styles
            isExpanded ? "w-[240px] shadow-lg" : "w-16 shadow-sm"
          )
        )}
        onMouseEnter={() => !isMobile && setIsExpanded(true)}
        onMouseLeave={() => !isMobile && setIsExpanded(false)}
      >
        {/* Mobile close button */}
        {isMobile && (
          <div className="flex items-center justify-between px-4 mb-4">
            <h2 className="text-lg font-semibold">Menu</h2>
            <button
              onClick={onMobileClose}
              className="p-2 hover:bg-accent rounded-lg transition-colors"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Navigation Items */}
        <div className="flex flex-col gap-1 flex-1 px-2 overflow-y-auto">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                className={cn(
                  "flex items-center rounded-lg transition-all duration-500 ease-out px-3 py-2.5",
                  // Mobile touch-friendly sizing
                  isMobile && "min-h-[48px]",
                  isActive 
                    ? 'bg-primary text-primary-foreground' 
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span 
                  className={cn(
                    "text-sm font-medium whitespace-nowrap overflow-hidden transition-all duration-500 ease-out",
                    (isMobile || isExpanded) ? 'opacity-100 ml-4 w-auto' : 'opacity-0 ml-0 w-0'
                  )}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
        
        {/* New Post Button */}
        <div className="px-2 mt-4">
          <button 
            className={cn(
              "flex items-center justify-center gap-2 w-full px-3 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors overflow-hidden",
              isMobile && "min-h-[48px]"
            )}
            onClick={() => handleTabChange('new-post')}
          >
            <Plus className="w-4 h-4 flex-shrink-0" />
            <span 
              className={cn(
                "text-sm font-medium whitespace-nowrap transition-all duration-500 ease-out",
                (isMobile || isExpanded) ? 'opacity-100 w-auto' : 'opacity-0 w-0'
              )}
            >
              New Post
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
