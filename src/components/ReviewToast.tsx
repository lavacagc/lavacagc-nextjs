'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Review {
  reviewer_name: string;
  comment: string;
  star_rating: number;
}

export default function ReviewToast() {
  const [isVisible, setIsVisible] = useState(false);
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);
  const [reviews, setReviews] = useState<Review[]>([]);

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
    setIsVisible(true);
    const hideTimer = setTimeout(() => {
      setIsVisible(false);
    }, 5000);
    return hideTimer;
  }, []);

  useEffect(() => {
    if (reviews.length === 0) return;

    // Show first toast after 3 seconds
    const initialDelay = setTimeout(() => {
      showNext();
    }, 3000);

    // Rotate every 12-15 seconds
    const rotationInterval = setInterval(() => {
      setCurrentReviewIndex((prev) => (prev + 1) % reviews.length);
      showNext();
    }, 12000 + Math.random() * 3000);

    return () => {
      clearTimeout(initialDelay);
      clearInterval(rotationInterval);
    };
  }, [reviews, showNext]);

  if (reviews.length === 0) return null;

  const review = reviews[currentReviewIndex];
  // Truncate long comments to ~80 chars
  const excerpt =
    review.comment.length > 80
      ? review.comment.slice(0, 77).trimEnd() + '...'
      : review.comment;

  return (
    <Link
      href="/reviews"
      className={`fixed bottom-4 left-4 z-[9998] bg-white rounded-lg shadow-xl border border-gray-200 p-4 max-w-xs transition-all duration-300 ease-out cursor-pointer hover:shadow-2xl hover:scale-105 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-gradient-to-r from-[#EE9639] to-[#E08530] rounded-full flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-lg">
            {review.reviewer_name[0].toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-1">
            {Array.from({ length: review.star_rating }).map((_, i) => (
              <Star key={i} className="h-4 w-4 text-yellow-400 fill-yellow-400" />
            ))}
          </div>
          <p className="text-sm font-semibold text-gray-900 mb-1">{review.reviewer_name}</p>
          <p className="text-sm text-gray-600 line-clamp-2">&quot;{excerpt}&quot;</p>
        </div>
      </div>
    </Link>
  );
}
