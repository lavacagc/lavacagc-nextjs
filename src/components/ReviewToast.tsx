'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Star, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { subscribeBannerState, isBannerVisible } from '@/hooks/useBannerState';
import { useMobileMenuOpen } from '@/hooks/useMobileMenuState';
import { useAuth } from '@/hooks/useAuth';
import { isPrivateTokenPage } from '@/lib/privatePages';

const REVIEW_COOLDOWN_KEY = 'lavaca_review_toast_cooldown';

// High-intent routes where the review toast distracts from conversion.
// Also suppressed on mobile entirely regardless of route.
const HIGH_INTENT_PATHS = [
  '/services',
  '/home-services',
  '/commercial-services',
  '/request-estimate',
  '/free-estimate',
  '/contact',
];

interface Review {
  reviewer_name: string;
  comment: string;
  star_rating: number;
}

export default function ReviewToast() {
  const pathname = usePathname();
  const { session } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [bannerShowing, setBannerShowing] = useState(() => isBannerVisible());
  const [isMobile, setIsMobile] = useState(false);
  const [coolingDown, setCoolingDown] = useState(() => {
    if (typeof window === 'undefined') return false;
    const cooldownUntil = parseInt(localStorage.getItem(REVIEW_COOLDOWN_KEY) || '0');
    return cooldownUntil > Date.now();
  });
  // The hamburger menu is `lg:hidden`, so it is open-able up to 1023px while
  // this toast only stands down below 768px - in the 768-1023px band it lands
  // on the menu's last entries. Kept OUT of `suppressed` on purpose: that also
  // drives the fetch and rotation effects, and the menu is transient, so
  // folding it in would restart the rotation every time the menu is tapped.
  const menuOpen = useMobileMenuOpen();

  // Track viewport: hide toast entirely on mobile.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  const isHighIntentRoute = HIGH_INTENT_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  // Suppress during admin work: instantly on the admin/auth routes (no async
  // wait), and anywhere a Supabase session is active (the owner browsing the
  // live site while logged in). In this app any authenticated session === admin.
  const isAdminSession =
    pathname.startsWith('/vaca-mgmt') || pathname.startsWith('/auth') || !!session;
  // Private tokenized pages: asking for a Google review on top of a proposal
  // the client has not agreed to yet is asking for a verdict on work that has
  // not started.
  const suppressed = isMobile || isHighIntentRoute || isAdminSession || isPrivateTokenPage(pathname);

  // Listen for SmartBanner visibility + set cooldown when banner is dismissed
  useEffect(() => {
    let wasBannerVisible = isBannerVisible();
    return subscribeBannerState((visible) => {
      setBannerShowing(visible);
      // Banner just got dismissed — start 60s cooldown
      if (wasBannerVisible && !visible) {
        setCoolingDown(true);
        localStorage.setItem(REVIEW_COOLDOWN_KEY, String(Date.now() + 60000));
        setTimeout(() => setCoolingDown(false), 60000);
      }
      wasBannerVisible = visible;
    });
  }, []);

  // Clear cooldown after expiry (if page was loaded during active cooldown)
  useEffect(() => {
    if (!coolingDown) return;
    const cooldownUntil = parseInt(localStorage.getItem(REVIEW_COOLDOWN_KEY) || '0');
    const remaining = cooldownUntil - Date.now();
    if (remaining <= 0) {
      // Use timeout with 0ms to avoid synchronous setState in effect
      const timer = setTimeout(() => setCoolingDown(false), 0);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setCoolingDown(false), remaining);
    return () => clearTimeout(timer);
  }, [coolingDown]);

  // Fetch real 5-star Google reviews from Supabase.
  //
  // Not on a page this toast is suppressed on. Suppression stopped it
  // RENDERING and the query went out anyway, so an admin screen and a client's
  // private proposal page both still asked Supabase for marketing copy neither
  // of them can show - work nobody sees, on a page that should be quiet.
  useEffect(() => {
    if (suppressed) return;
    const fetchReviews = async () => {
      const { data, error } = await supabase
        .from('google_reviews')
        .select('reviewer_name, comment, star_rating')
        .eq('star_rating', 5)
        .not('comment', 'is', null)
        .order('create_time', { ascending: false })
        .limit(10);

      if (!error && data && data.length > 0) {
        const validReviews = data.filter(
          (r) => r.reviewer_name && r.comment && r.comment.length > 10
        );
        if (validReviews.length > 0) {
          setReviews(
            validReviews.map((r) => ({
              reviewer_name: r.reviewer_name!,
              comment: r.comment!,
              star_rating: r.star_rating!,
            }))
          );
        }
      }
    };
    fetchReviews();
  }, [suppressed]);

  const showNext = useCallback(() => {
    if (!isDismissed) {
      setIsVisible(true);
      const hideTimer = setTimeout(() => {
        setIsVisible(false);
      }, 5000);
      return hideTimer;
    }
  }, [isDismissed]);

  useEffect(() => {
    if (suppressed || reviews.length === 0 || isDismissed) return;

    // Show first toast after 10 seconds
    const initialDelay = setTimeout(() => {
      showNext();
    }, 10000);

    // Rotate every 2 minutes
    const rotationInterval = setInterval(() => {
      setCurrentReviewIndex((prev) => (prev + 1) % reviews.length);
      showNext();
    }, 120000);

    return () => {
      clearTimeout(initialDelay);
      clearInterval(rotationInterval);
    };
  }, [reviews, showNext, isDismissed, suppressed]);

  const handleDismiss = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsVisible(false);
    setIsDismissed(true);
  };

  if (suppressed || reviews.length === 0 || isDismissed || bannerShowing || coolingDown || menuOpen) return null;

  const review = reviews[currentReviewIndex];
  const excerpt =
    review.comment.length > 80
      ? review.comment.slice(0, 77).trimEnd() + '...'
      : review.comment;

  return (
    <div
      className={`fixed bottom-20 md:bottom-4 left-4 z-[9998] bg-white rounded-lg shadow-xl border border-gray-200 p-4 max-w-xs transition-all duration-300 ease-out ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
    >
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 transition-colors rounded-full hover:bg-gray-100 cursor-pointer"
        aria-label="Dismiss review"
      >
        <X className="h-4 w-4" />
      </button>
      <Link href="/reviews" className="flex items-start gap-3 cursor-pointer hover:opacity-90">
        <div className="w-10 h-10 bg-gradient-to-r from-[#EE9639] to-[#E08530] rounded-full flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-lg">
            {review.reviewer_name[0].toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-1 mb-1">
            {Array.from({ length: review.star_rating }).map((_, i) => (
              <Star key={i} className="h-4 w-4 text-yellow-400 fill-yellow-400" />
            ))}
          </div>
          <p className="text-sm font-semibold text-gray-900 mb-1">{review.reviewer_name}</p>
          <p className="text-sm text-gray-600 line-clamp-2">&quot;{excerpt}&quot;</p>
        </div>
      </Link>
    </div>
  );
}
