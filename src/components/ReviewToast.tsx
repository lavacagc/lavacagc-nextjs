'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Star, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { subscribeBannerState, isBannerVisible } from '@/hooks/useBannerState';

const REVIEW_COOLDOWN_KEY = 'lavaca_review_toast_cooldown';

interface Review {
  reviewer_name: string;
  comment: string;
  star_rating: number;
}

export default function ReviewToast() {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [bannerShowing, setBannerShowing] = useState(false);
  const [coolingDown, setCoolingDown] = useState(false);

  // Listen for SmartBanner visibility + set cooldown when banner is dismissed
  useEffect(() => {
    setBannerShowing(isBannerVisible());
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

  // Check cooldown on mount (in case page refreshed during cooldown)
  useEffect(() => {
    const cooldownUntil = parseInt(localStorage.getItem(REVIEW_COOLDOWN_KEY) || '0');
    if (cooldownUntil > Date.now()) {
      setCoolingDown(true);
      setTimeout(() => setCoolingDown(false), cooldownUntil - Date.now());
    }
  }, []);

  // Fetch real 5-star Google reviews from Supabase
  useEffect(() => {
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
  }, []);

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
    if (reviews.length === 0 || isDismissed) return;

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
  }, [reviews, showNext, isDismissed]);

  const handleDismiss = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsVisible(false);
    setIsDismissed(true);
  };

  if (reviews.length === 0 || isDismissed || bannerShowing || coolingDown) return null;

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
