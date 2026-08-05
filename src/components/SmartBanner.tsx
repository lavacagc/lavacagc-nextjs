'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { isPrivateTokenPage } from '@/lib/privatePages';
import { X, Phone, ArrowRight, Eye, MessageCircle } from 'lucide-react';
import { useVisitor } from '@/hooks/useVisitor';
import { type BannerRule } from '@/lib/bannerRules';
import { trackEvent } from '@/services/analyticsManager';
import { setBannerVisible } from '@/hooks/useBannerState';

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

// ---- TOP BAR COMPONENT (desktop: top bar, mobile: bottom floating card) ----
function TopBar({ rule, onDismiss }: { rule: BannerRule; onDismiss: () => void }) {
  const d = rule.display;
  const barRef = useRef<HTMLDivElement>(null);

  // Reserve real layout space for the fixed desktop bar so it pushes the page
  // (sticky header + hero) DOWN instead of covering it. globals.css consumes
  // --smart-banner-height (body padding-top) and Header.tsx offsets its sticky
  // top by the same var. The desktop bar is `hidden` on mobile (the bottom card
  // below handles that), so it measures 0 there and no top offset is applied.
  useEffect(() => {
    const root = document.documentElement;
    const el = barRef.current;
    const apply = () => {
      const h = el && getComputedStyle(el).display !== 'none' ? el.offsetHeight : 0;
      root.style.setProperty('--smart-banner-height', `${h}px`);
    };
    apply();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
    if (el && ro) ro.observe(el);
    window.addEventListener('resize', apply);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', apply);
      root.style.removeProperty('--smart-banner-height');
    };
  }, []);

  return (
    <>
      {/* Desktop: slim top bar */}
      <div ref={barRef} className={`hidden md:block fixed top-0 left-0 right-0 z-[60] ${d.bgColor} ${d.textColor} shadow-lg animate-in slide-in-from-top duration-300`}>
        <div className="container mx-auto px-4 py-2.5 flex items-center justify-center gap-3 text-base">
          {d.icon && <span className="text-lg flex-shrink-0">{d.icon}</span>}
          <span className="font-medium">{d.message}</span>
          {d.ctaText && d.ctaLink && (
            <a
              href={d.ctaLink}
              className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:no-underline whitespace-nowrap cursor-pointer"
              onClick={() => trackEvent('smart_banner_cta', { banner_id: rule.id, cta_text: d.ctaText })}
            >
              {d.ctaLink?.startsWith('sms:') ? <MessageCircle className="w-3.5 h-3.5" /> : d.ctaPhone ? <Phone className="w-3.5 h-3.5" /> : null}
              {d.ctaText}
              {!d.ctaPhone && !d.ctaLink?.startsWith('sms:') && <ArrowRight className="w-3.5 h-3.5" />}
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

      {/* Mobile: bottom floating stacked card (Concept A) */}
      <div className={`md:hidden fixed bottom-20 left-3 right-3 z-[60] ${d.bgColor} ${d.textColor} rounded-2xl shadow-2xl animate-in slide-in-from-bottom duration-500`}>
        <div className="p-4 pr-14 text-center">
          <p className="font-bold text-base leading-snug">
            {d.icon && <span className="mr-1">{d.icon}</span>}
            {d.message}
          </p>
          {d.ctaText && d.ctaLink && (
            <a
              href={d.ctaLink}
              className="inline-flex items-center justify-center gap-2 mt-3 bg-white text-green-700 font-bold text-sm px-6 py-2.5 rounded-xl hover:bg-white/90 transition-colors cursor-pointer"
              onClick={() => trackEvent('smart_banner_cta', { banner_id: rule.id, cta_text: d.ctaText })}
            >
              {d.ctaLink?.startsWith('sms:') ? <MessageCircle className="w-4 h-4" /> : d.ctaPhone ? <Phone className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
              {d.ctaText}
            </a>
          )}
        </div>
        {(d.dismissable !== false) && (
          <button
            onClick={onDismiss}
            className="absolute top-2 right-2 w-11 h-11 flex items-center justify-center rounded-full bg-white/20 active:bg-white/40 transition-colors cursor-pointer"
            aria-label="Dismiss banner"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
    </>
  );
}

// ---- SLIDE-IN COMPONENT ----
function SlideIn({ rule, onDismiss }: { rule: BannerRule; onDismiss: () => void }) {
  const d = rule.display;
  return (
    <>
      {/* Desktop: bottom-right card */}
      <div className={`hidden md:block fixed bottom-4 right-4 z-[60] max-w-sm rounded-xl shadow-2xl ${d.bgColor} ${d.textColor} animate-in slide-in-from-right duration-500`}>
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

      {/* Mobile: bottom floating stacked card (same as Concept A) */}
      <div className={`md:hidden fixed bottom-20 left-3 right-3 z-[60] ${d.bgColor} ${d.textColor} rounded-2xl shadow-2xl animate-in slide-in-from-bottom duration-500`}>
        <div className="p-4 pr-14 text-center">
          {d.title && (
            <p className="font-bold text-base leading-snug">
              {d.icon && <span className="mr-1">{d.icon}</span>}
              {d.title}
            </p>
          )}
          <p className={`text-sm opacity-90 ${d.title ? 'mt-1' : ''}`}>
            {!d.title && d.icon && <span className="mr-1">{d.icon}</span>}
            {d.message}
          </p>
          {d.ctaText && d.ctaLink && (
            <a
              href={d.ctaLink}
              className="inline-flex items-center justify-center gap-2 mt-3 bg-white text-blue-700 font-bold text-sm px-6 py-2.5 rounded-xl hover:bg-white/90 transition-colors cursor-pointer"
              onClick={() => trackEvent('smart_banner_cta', { banner_id: rule.id, cta_text: d.ctaText })}
            >
              {d.ctaLink?.startsWith('sms:') ? <MessageCircle className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
              {d.ctaText}
            </a>
          )}
        </div>
        {(d.dismissable !== false) && (
          <button
            onClick={onDismiss}
            className="absolute top-2 right-2 w-11 h-11 flex items-center justify-center rounded-full bg-white/20 active:bg-white/40 transition-colors cursor-pointer"
            aria-label="Dismiss banner"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
    </>
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

// Convert DB row to BannerRule format
interface DBBanner {
  id: string;
  name: string;
  visitor_type: 'new' | 'returning' | 'all' | null;
  min_visits: number;
  max_visits: number | null;
  min_days_since_first: number;
  max_days_since_first: number | null;
  show_on_paths: string[];
  exclude_paths: string[];
  require_viewed_pages: string[];
  require_not_viewed_pages: string[];
  display_type: 'top-bar' | 'slide-in' | 'modal';
  icon: string | null;
  title: string | null;
  message: string;
  cta_text: string | null;
  cta_link: string | null;
  cta_phone: string | null;
  bg_color: string;
  text_color: string;
  dismissable: boolean;
  dismiss_for_hours: number;
  enabled: boolean;
  priority: number;
  start_date: string | null;
  end_date: string | null;
}

function dbToBannerRule(db: DBBanner): BannerRule {
  return {
    id: db.id,
    conditions: {
      visitorType: db.visitor_type === 'all' ? undefined : (db.visitor_type || undefined),
      minVisits: db.min_visits || undefined,
      maxVisits: db.max_visits || undefined,
      minDaysSinceFirst: db.min_days_since_first || undefined,
      maxDaysSinceFirst: db.max_days_since_first || undefined,
      paths: db.show_on_paths?.length > 0 ? db.show_on_paths : undefined,
      excludePaths: db.exclude_paths?.length > 0 ? db.exclude_paths : undefined,
      hasViewedPages: db.require_viewed_pages?.length > 0 ? db.require_viewed_pages : undefined,
      hasNotViewedPages: db.require_not_viewed_pages?.length > 0 ? db.require_not_viewed_pages : undefined,
    },
    display: {
      type: db.display_type,
      title: db.title || undefined,
      message: db.message,
      ctaText: db.cta_text || undefined,
      ctaLink: db.cta_link || undefined,
      ctaPhone: db.cta_phone || undefined,
      bgColor: db.bg_color,
      textColor: db.text_color,
      dismissable: db.dismissable,
      dismissForHours: db.dismiss_for_hours,
      icon: db.icon || undefined,
    },
    enabled: db.enabled,
    startDate: db.start_date || undefined,
    endDate: db.end_date || undefined,
    priority: db.priority,
  };
}

// ---- MAIN SMART BANNER COMPONENT ----
function SmartBannerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { visitorId, visitCount, isReturning, firstSeen, pagesVisited } = useVisitor();
  const [activeRule, setActiveRule] = useState<BannerRule | null>(null);
  const [visible, setVisible] = useState(false);
  const [rules, setRules] = useState<BannerRule[]>([]);
  const [rulesLoaded, setRulesLoaded] = useState(false);
  const [isPreview, setIsPreview] = useState(false);

  // Check for preview mode: ?banner_preview=<id>
  const previewId = searchParams.get('banner_preview');

  // Fetch banner rules from DB
  useEffect(() => {
    // Not on a private tokenized page, where this component returns null below
    // whatever the rules say: fetching them there is a request issued to
    // decide something already decided, on a page whose whole job is to be
    // quiet. `rulesLoaded` stays false, which is the "nothing to show" state.
    if (isPrivateTokenPage(pathname)) return;
    // If previewing, fetch ALL banners (including disabled) so we can find the preview target
    const url = previewId ? '/api/banners/admin' : '/api/banners';
    fetch(url)
      .then(res => res.ok ? res.json() : [])
      .then((data: DBBanner[]) => {
        setRules(data.map(dbToBannerRule));
        setRulesLoaded(true);
      })
      .catch(() => setRulesLoaded(true));
  }, [previewId, pathname]);

  const findMatchingRule = useCallback(() => {
    if (!rulesLoaded || rules.length === 0) return null;

    // Preview mode: force-show the specific banner, skip all conditions
    if (previewId) {
      const previewRule = rules.find(r => r.id === previewId);
      if (previewRule) return previewRule;
    }

    if (!visitorId) return null;

    const visitorType = isReturning ? 'returning' : 'new';
    const daysSinceFirst = firstSeen
      ? Math.floor((Date.now() - new Date(firstSeen).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // Already sorted by priority from API
    for (const rule of rules) {
      if (evaluateRule(rule, visitorType, visitCount, daysSinceFirst, pathname, pagesVisited)) {
        return rule;
      }
    }
    return null;
  }, [visitorId, isReturning, visitCount, firstSeen, pathname, pagesVisited, rules, rulesLoaded, previewId]);

  useEffect(() => {
    if (!rulesLoaded) return;

    // In preview mode, show immediately with no delay
    if (previewId) {
      const rule = findMatchingRule();
      if (rule) {
        // Intentional synchronous setState for immediate preview display
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setActiveRule(rule);
        setVisible(true);
        setIsPreview(true);
      }
      return;
    }

    // Normal mode: delay banner show by 1.5s so page content loads first
    const timer = setTimeout(() => {
      const rule = findMatchingRule();
      if (rule) {
        setActiveRule(rule);
        setVisible(true);
        setIsPreview(false);
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
  }, [findMatchingRule, isReturning, visitCount, rulesLoaded, previewId]);

  // Broadcast banner visibility to other widgets
  useEffect(() => {
    setBannerVisible(visible);
    return () => setBannerVisible(false);
  }, [visible]);

  const handleDismiss = useCallback(() => {
    if (!activeRule) return;
    setVisible(false);
    setBannerVisible(false);
    setDismissed(activeRule.id);
    // Also set session-scoped dismiss for dismissForHours=0 rules
    if ((activeRule.display.dismissForHours ?? 0) === 0) {
      sessionStorage.setItem(`banner_dismissed_${activeRule.id}`, '1');
    }
    trackEvent('smart_banner_dismissed', { banner_id: activeRule.id });
  }, [activeRule]);

  // Keep the Home Care portal chrome-free (matches StickyCTA / ExitIntentPopup).
  if (pathname.startsWith('/home-care')) return null;
  // And the private tokenized pages. This one needs a CODE-level guard rather
  // than a banner rule: `evaluateRule` only filters on `show_on_paths` when the
  // rule sets one, so every promotion with an empty path list matches every
  // path - including a page showing one client's private pricing.
  if (isPrivateTokenPage(pathname)) return null;
  if (!visible || !activeRule) return null;

  const bannerElement = (() => {
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
  })();

  return (
    <>
      {bannerElement}
      {isPreview && (
        <div className="fixed top-0 left-0 z-[80] m-2">
          <div className="bg-yellow-400 text-yellow-900 text-xs font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 animate-pulse">
            <Eye className="w-3.5 h-3.5" />
            PREVIEW MODE
          </div>
        </div>
      )}
    </>
  );
}

export default function SmartBanner() {
  return (
    <Suspense fallback={null}>
      <SmartBannerInner />
    </Suspense>
  );
}
