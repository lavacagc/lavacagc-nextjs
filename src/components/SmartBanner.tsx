'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { X, Phone, ArrowRight } from 'lucide-react';
import { useVisitor } from '@/hooks/useVisitor';
import { bannerRules, type BannerRule } from '@/lib/bannerRules';
import { trackEvent } from '@/services/analyticsManager';

const DISMISS_KEY = 'lavaca_banner_dismiss';

interface DismissState {
  [bannerId: string]: number; // timestamp when dismissed
}

function getDismissState(): DismissState {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(DISMISS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function setDismissed(bannerId: string): void {
  if (typeof window === 'undefined') return;
  const state = getDismissState();
  state[bannerId] = Date.now();
  localStorage.setItem(DISMISS_KEY, JSON.stringify(state));
}

function isDismissed(rule: BannerRule): boolean {
  const state = getDismissState();
  const dismissedAt = state[rule.id];
  if (!dismissedAt) return false;

  const hours = rule.display.dismissForHours ?? 0;
  if (hours === 0) {
    // Session-only dismiss — check if it's the same browser session
    // Use sessionStorage for true session-scoped tracking
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem(`banner_dismissed_${rule.id}`) === '1';
    }
    return false;
  }

  const expiresAt = dismissedAt + hours * 60 * 60 * 1000;
  return Date.now() < expiresAt;
}

function matchesPath(path: string, patterns: string[]): boolean {
  return patterns.some(p => path === p || path.startsWith(p + '/'));
}

function evaluateRule(
  rule: BannerRule,
  visitorType: 'new' | 'returning',
  visitCount: number,
  daysSinceFirst: number,
  currentPath: string,
  pagesVisited: Array<{ path: string }>
): boolean {
  if (!rule.enabled) return false;

  // Check scheduling
  const now = new Date();
  if (rule.startDate && now < new Date(rule.startDate)) return false;
  if (rule.endDate && now > new Date(rule.endDate)) return false;

  // Check if dismissed
  if (isDismissed(rule)) return false;

  const c = rule.conditions;

  // Visitor type
  if (c.visitorType && c.visitorType !== visitorType) return false;

  // Visit count range
  if (c.minVisits !== undefined && visitCount < c.minVisits) return false;
  if (c.maxVisits !== undefined && visitCount > c.maxVisits) return false;

  // Days since first visit
  if (c.minDaysSinceFirst !== undefined && daysSinceFirst < c.minDaysSinceFirst) return false;
  if (c.maxDaysSinceFirst !== undefined && daysSinceFirst > c.maxDaysSinceFirst) return false;

  // Path include/exclude
  if (c.paths && c.paths.length > 0 && !matchesPath(currentPath, c.paths)) return false;
  if (c.excludePaths && matchesPath(currentPath, c.excludePaths)) return false;

  // Page history checks
  const visitedPaths = pagesVisited.map(p => p.path);
  if (c.hasViewedPages && !c.hasViewedPages.some(p => visitedPaths.includes(p))) return false;
  if (c.hasNotViewedPages && c.hasNotViewedPages.some(p => visitedPaths.includes(p))) return false;

  return true;
}

// ---- TOP BAR COMPONENT ----
function TopBar({ rule, onDismiss }: { rule: BannerRule; onDismiss: () => void }) {
  const d = rule.display;
  return (
    <div className={`fixed top-0 left-0 right-0 z-[60] ${d.bgColor} ${d.textColor} shadow-lg animate-in slide-in-from-top duration-300`}>
      <div className="container mx-auto px-4 py-2.5 flex items-center justify-center gap-3 text-sm md:text-base">
        {d.icon && <span className="text-lg flex-shrink-0">{d.icon}</span>}
        <span className="font-medium">{d.message}</span>
        {d.ctaText && d.ctaLink && (
          <a
            href={d.ctaLink}
            className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:no-underline whitespace-nowrap cursor-pointer"
            onClick={() => trackEvent('smart_banner_cta', { banner_id: rule.id, cta_text: d.ctaText })}
          >
            {d.ctaPhone ? <Phone className="w-3.5 h-3.5" /> : null}
            {d.ctaText}
            {!d.ctaPhone && <ArrowRight className="w-3.5 h-3.5" />}
          </a>
        )}
        {(d.dismissable !== false) && (
          <button
            onClick={onDismiss}
            className="ml-2 p-1 rounded-full hover:bg-white/20 transition-colors flex-shrink-0 cursor-pointer"
            aria-label="Dismiss banner"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ---- SLIDE-IN COMPONENT ----
function SlideIn({ rule, onDismiss }: { rule: BannerRule; onDismiss: () => void }) {
  const d = rule.display;
  return (
    <div className={`fixed bottom-4 right-4 z-[60] max-w-sm rounded-xl shadow-2xl ${d.bgColor} ${d.textColor} animate-in slide-in-from-right duration-500`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            {d.icon && <span className="text-2xl">{d.icon}</span>}
            {d.title && <h4 className="font-bold text-lg mt-1">{d.title}</h4>}
            <p className="text-sm mt-1 opacity-90">{d.message}</p>
            {d.ctaText && d.ctaLink && (
              <a
                href={d.ctaLink}
                className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg font-semibold text-sm transition-colors cursor-pointer"
                onClick={() => trackEvent('smart_banner_cta', { banner_id: rule.id, cta_text: d.ctaText })}
              >
                {d.ctaText}
                <ArrowRight className="w-4 h-4" />
              </a>
            )}
          </div>
          {(d.dismissable !== false) && (
            <button
              onClick={onDismiss}
              className="p-1 rounded-full hover:bg-white/20 transition-colors flex-shrink-0 cursor-pointer"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- MODAL COMPONENT ----
function BannerModal({ rule, onDismiss }: { rule: BannerRule; onDismiss: () => void }) {
  const d = rule.display;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 animate-in fade-in duration-300">
      <div className={`relative max-w-md w-full rounded-2xl shadow-2xl ${d.bgColor} ${d.textColor} animate-in zoom-in-95 duration-300`}>
        <div className="p-6 text-center">
          {d.icon && <span className="text-4xl">{d.icon}</span>}
          {d.title && <h3 className="font-bold text-xl mt-3">{d.title}</h3>}
          <p className="mt-2 opacity-90">{d.message}</p>
          <div className="flex flex-col sm:flex-row gap-2 mt-4 justify-center">
            {d.ctaText && d.ctaLink && (
              <a
                href={d.ctaLink}
                className="inline-flex items-center justify-center gap-1.5 px-6 py-2.5 bg-white text-gray-900 rounded-lg font-semibold text-sm hover:bg-white/90 transition-colors cursor-pointer"
                onClick={() => trackEvent('smart_banner_cta', { banner_id: rule.id, cta_text: d.ctaText })}
              >
                {d.ctaText}
                <ArrowRight className="w-4 h-4" />
              </a>
            )}
            {(d.dismissable !== false) && (
              <button
                onClick={onDismiss}
                className="px-6 py-2.5 bg-white/20 hover:bg-white/30 rounded-lg font-medium text-sm transition-colors cursor-pointer"
              >
                Maybe later
              </button>
            )}
          </div>
        </div>
        {(d.dismissable !== false) && (
          <button
            onClick={onDismiss}
            className="absolute top-3 right-3 p-1 rounded-full hover:bg-white/20 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ---- MAIN SMART BANNER COMPONENT ----
export default function SmartBanner() {
  const pathname = usePathname();
  const { visitorId, visitCount, isReturning, firstSeen, pagesVisited } = useVisitor();
  const [activeRule, setActiveRule] = useState<BannerRule | null>(null);
  const [visible, setVisible] = useState(false);

  const findMatchingRule = useCallback(() => {
    if (!visitorId) return null;

    const visitorType = isReturning ? 'returning' : 'new';
    const daysSinceFirst = firstSeen
      ? Math.floor((Date.now() - new Date(firstSeen).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // Sort by priority (lower number = higher priority)
    const sorted = [...bannerRules].sort((a, b) => a.priority - b.priority);

    for (const rule of sorted) {
      if (evaluateRule(rule, visitorType, visitCount, daysSinceFirst, pathname, pagesVisited)) {
        return rule;
      }
    }
    return null;
  }, [visitorId, isReturning, visitCount, firstSeen, pathname, pagesVisited]);

  useEffect(() => {
    // Delay banner show by 1.5s so page content loads first
    const timer = setTimeout(() => {
      const rule = findMatchingRule();
      if (rule) {
        setActiveRule(rule);
        setVisible(true);
        trackEvent('smart_banner_shown', {
          banner_id: rule.id,
          banner_type: rule.display.type,
          visitor_type: isReturning ? 'returning' : 'new',
          visit_count: visitCount,
        });
      } else {
        setActiveRule(null);
        setVisible(false);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [findMatchingRule, isReturning, visitCount]);

  const handleDismiss = useCallback(() => {
    if (!activeRule) return;
    setVisible(false);
    setDismissed(activeRule.id);
    // Also set session-scoped dismiss for dismissForHours=0 rules
    if ((activeRule.display.dismissForHours ?? 0) === 0) {
      sessionStorage.setItem(`banner_dismissed_${activeRule.id}`, '1');
    }
    trackEvent('smart_banner_dismissed', { banner_id: activeRule.id });
  }, [activeRule]);

  if (!visible || !activeRule) return null;

  switch (activeRule.display.type) {
    case 'top-bar':
      return <TopBar rule={activeRule} onDismiss={handleDismiss} />;
    case 'slide-in':
      return <SlideIn rule={activeRule} onDismiss={handleDismiss} />;
    case 'modal':
      return <BannerModal rule={activeRule} onDismiss={handleDismiss} />;
    default:
      return null;
  }
}
