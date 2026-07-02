import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Activity,
  Bot,
  FileText,
  PanelTop,
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
  BarChart,
  FileCheck,
  Mail,
  MessageSquare,
  Gauge,
  TrendingUp,
  HeartPulse,
  Megaphone,
  ChevronRight,
  Send,
  History,
  Home,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

interface AdminSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isMobileOpen: boolean;
  onMobileClose: () => void;
}

type NavLeaf = { id: string; icon: LucideIcon; label: string };
type NavGroup = { id: string; icon: LucideIcon; label: string; children: NavLeaf[] };
type NavItem = NavLeaf | NavGroup;

const isGroup = (item: NavItem): item is NavGroup => 'children' in item;

// Sidebar nav tree. Top-level entries are either standalone leaves or groups
// with children. Leaf `id` values must match the `<TabsContent value="...">`
// keys in AdminContent.tsx exactly.
const NAVIGATION: NavItem[] = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'diagnostics', icon: Activity, label: 'Diagnostics' },
  { id: 'ai', icon: Bot, label: 'AI Assistant' },
  {
    id: 'content',
    icon: FileText,
    label: 'Content',
    children: [
      { id: 'blog', icon: FileText, label: 'Blog Posts' },
      { id: 'pages', icon: PanelTop, label: 'Pages / CMS' },
      { id: 'services', icon: Wrench, label: 'Services' },
      { id: 'service-areas', icon: MapPin, label: 'Service Areas' },
      { id: 'projects', icon: FolderKanban, label: 'Projects' },
      { id: 'listings', icon: Home, label: 'Home Listings' },
      { id: 'banners', icon: Megaphone, label: 'Smart Banners' },
    ],
  },
  {
    id: 'marketing',
    icon: Globe,
    label: 'Marketing',
    children: [
      { id: 'seo', icon: Globe, label: 'SEO/Sitemap' },
      { id: 'seo-suggestions', icon: TrendingUp, label: 'SEO Suggestions' },
      { id: 'analytics', icon: Activity, label: 'Analytics' },
      { id: 'gmb', icon: Activity, label: 'Google Reviews' },
    ],
  },
  {
    id: 'customers',
    icon: Inbox,
    label: 'Customers',
    children: [
      { id: 'leads', icon: Inbox, label: 'Leads' },
      { id: 'subscribers', icon: Users, label: 'Subscribers' },
      { id: 'follow-ups', icon: Mail, label: 'Follow-Ups' },
      { id: 'send-estimate', icon: Send, label: 'Send Estimate' },
      { id: 'estimate-log', icon: History, label: 'Estimate Log' },
      { id: 'emails', icon: Mail, label: 'Email Tracking' },
      { id: 'feedback', icon: MessageSquare, label: 'Feedback Requests' },
      { id: 'estimates', icon: Calculator, label: 'Calculator Estimates' },
    ],
  },
  {
    id: 'settings',
    icon: Shield,
    label: 'Settings',
    children: [
      { id: 'pricing', icon: DollarSign, label: 'Pricing Management' },
      { id: 'non-negotiables', icon: Shield, label: 'Non-Negotiables' },
      { id: 'compliance', icon: FileCheck, label: 'Compliance Docs' },
    ],
  },
  {
    id: 'insights',
    icon: BarChart,
    label: 'Insights',
    children: [
      { id: 'reports', icon: BarChart, label: 'Reports' },
      { id: 'conversions', icon: TrendingUp, label: 'Conversions' },
      { id: 'performance', icon: Gauge, label: 'PageSpeed' },
      { id: 'uptime', icon: HeartPulse, label: 'Uptime' },
    ],
  },
];

const STORAGE_KEY = 'vaca-mgmt:sidebar:expanded';

// Returns the id of the group containing `leafId`, or null if the leaf is
// top-level or unknown. Used for "auto-open the active tab's group".
function findParentGroupId(leafId: string): string | null {
  for (const item of NAVIGATION) {
    if (isGroup(item) && item.children.some((c) => c.id === leafId)) {
      return item.id;
    }
  }
  return null;
}

function loadExpandedFromStorage(activeTab: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter((x): x is string => typeof x === 'string'));
      }
    }
  } catch {
    // Corrupt JSON — fall through to default.
  }
  // No prior preference: open the group containing the active tab so the
  // current selection is visible on first paint.
  const parent = findParentGroupId(activeTab);
  return parent ? new Set([parent]) : new Set();
}

export default function AdminSidebar({
  activeTab,
  onTabChange,
  isMobileOpen,
  onMobileClose,
}: AdminSidebarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isMobile = useIsMobile();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  // Hydrate expansion state from localStorage on first mount only. We do this
  // here (not in useState init) so SSR and client paint match — Sets aren't
  // serializable as initial state without a window guard.
  useEffect(() => {
    setExpandedGroups(loadExpandedFromStorage(activeTab));
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist whenever the user changes which groups are open.
  useEffect(() => {
    if (!hydrated) return;
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(expandedGroups)));
    } catch {
      // Quota / privacy mode — silently ignore; UI keeps working in-memory.
    }
  }, [expandedGroups, hydrated]);

  // When the active tab changes (e.g. blog editor saves and jumps back to
  // 'blog' programmatically), auto-open its parent group if closed.
  useEffect(() => {
    if (!hydrated) return;
    const parent = findParentGroupId(activeTab);
    if (parent && !expandedGroups.has(parent)) {
      setExpandedGroups((prev) => {
        const next = new Set(prev);
        next.add(parent);
        return next;
      });
    }
  }, [activeTab, hydrated, expandedGroups]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const handleLeafClick = (leafId: string) => {
    onTabChange(leafId);
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

  // Children render only when sidebar is showing labels (mobile drawer or
  // hover-expanded). In collapsed icon-only mode we show top-level icons only.
  const showLabels = isMobile || isExpanded;

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
          'bg-background border-r border-border h-screen py-4 flex flex-col transition-all duration-500 ease-out fixed left-0 top-0 z-40',
          isMobile
            ? isMobileOpen
              ? 'w-[280px] translate-x-0'
              : 'w-[280px] -translate-x-full'
            : isExpanded
              ? 'w-[240px] shadow-lg'
              : 'w-16 shadow-sm',
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
          {NAVIGATION.map((item) => {
            if (isGroup(item)) {
              const Icon = item.icon;
              const isOpen = expandedGroups.has(item.id);
              const containsActive = item.children.some((c) => c.id === activeTab);

              return (
                <React.Fragment key={item.id}>
                  <button
                    onClick={() => toggleGroup(item.id)}
                    aria-expanded={isOpen}
                    className={cn(
                      'flex items-center rounded-lg transition-all duration-300 ease-out px-3 py-2.5',
                      isMobile && 'min-h-[48px]',
                      containsActive
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span
                      className={cn(
                        'text-sm font-medium whitespace-nowrap overflow-hidden transition-all duration-500 ease-out flex-1 text-left',
                        showLabels ? 'opacity-100 ml-4 w-auto' : 'opacity-0 ml-0 w-0',
                      )}
                    >
                      {item.label}
                    </span>
                    {showLabels && (
                      <ChevronRight
                        aria-hidden="true"
                        className={cn(
                          'w-4 h-4 flex-shrink-0 transition-transform duration-200',
                          isOpen && 'rotate-90',
                        )}
                      />
                    )}
                  </button>

                  {/* Children — only when sidebar shows labels AND group is open */}
                  {showLabels &&
                    isOpen &&
                    item.children.map((child) => {
                      const ChildIcon = child.icon;
                      const isActive = activeTab === child.id;
                      return (
                        <button
                          key={child.id}
                          onClick={() => handleLeafClick(child.id)}
                          className={cn(
                            'flex items-center rounded-lg transition-colors duration-200 px-3 py-2 ml-4',
                            isMobile && 'min-h-[44px]',
                            isActive
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                          )}
                        >
                          <ChildIcon className="w-4 h-4 flex-shrink-0" />
                          <span className="text-sm font-medium whitespace-nowrap ml-3">
                            {child.label}
                          </span>
                        </button>
                      );
                    })}
                </React.Fragment>
              );
            }

            // Top-level leaf (Dashboard / Diagnostics / AI Assistant)
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleLeafClick(item.id)}
                className={cn(
                  'flex items-center rounded-lg transition-all duration-500 ease-out px-3 py-2.5',
                  isMobile && 'min-h-[48px]',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span
                  className={cn(
                    'text-sm font-medium whitespace-nowrap overflow-hidden transition-all duration-500 ease-out',
                    showLabels ? 'opacity-100 ml-4 w-auto' : 'opacity-0 ml-0 w-0',
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
              'flex items-center justify-center gap-2 w-full px-3 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors overflow-hidden',
              isMobile && 'min-h-[48px]',
            )}
            onClick={() => {
              onTabChange('new-post');
              if (isMobile) onMobileClose();
            }}
          >
            <Plus className="w-4 h-4 flex-shrink-0" />
            <span
              className={cn(
                'text-sm font-medium whitespace-nowrap transition-all duration-500 ease-out',
                showLabels ? 'opacity-100 w-auto' : 'opacity-0 w-0',
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
