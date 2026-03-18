'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Star } from 'lucide-react';

const REVIEWS = [
  { name: 'Kirsten M.', text: 'Incredible bathroom renovation!', stars: 5 },
  { name: 'Sean R.', text: 'Amazing work on our basement wet bar', stars: 5 },
  { name: 'Gerrick H.', text: 'Transformed our basement into a hangout spot', stars: 5 },
  { name: 'Kevin P.', text: 'Professional, on time, great communication', stars: 5 },
  { name: 'Ray T.', text: 'Beautiful basement with fireplace and bar', stars: 5 },
];

export default function ReviewToast() {
  const [isVisible, setIsVisible] = useState(false);
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);

  useEffect(() => {
    // Show first toast after 2 seconds
    const initialDelay = setTimeout(() => {
      setIsVisible(true);
      
      // Auto-hide after 5 seconds
      setTimeout(() => {
        setIsVisible(false);
      }, 5000);
    }, 2000);

    // Set up rotation: every 8-10 seconds (randomized)
    const rotationInterval = setInterval(() => {
      const randomDelay = 8000 + Math.random() * 2000; // 8-10 seconds
      
      setTimeout(() => {
        // Hide current toast
        setIsVisible(false);
        
        // After fade out (300ms), show next review
        setTimeout(() => {
          setCurrentReviewIndex((prev) => (prev + 1) % REVIEWS.length);
          setIsVisible(true);
          
          // Auto-hide after 5 seconds
          setTimeout(() => {
            setIsVisible(false);
          }, 5000);
        }, 300);
      }, randomDelay);
    }, 13500); // Average cycle: 8.5s display + 5s visible = 13.5s

    return () => {
      clearTimeout(initialDelay);
      clearInterval(rotationInterval);
    };
  }, []);

  const currentReview = REVIEWS[currentReviewIndex];

  return (
    <Link
      href="/reviews"
      className={`fixed bottom-4 left-4 z-[9998] bg-white rounded-lg shadow-xl border border-gray-200 p-4 max-w-xs transition-all duration-300 ease-out cursor-pointer hover:shadow-2xl hover:scale-105 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-gradient-to-r from-[#EE9639] to-[#E08530] rounded-full flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-lg">{currentReview.name[0]}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-1">
            {Array.from({ length: currentReview.stars }).map((_, i) => (
              <Star key={i} className="h-4 w-4 text-yellow-400 fill-yellow-400" />
            ))}
          </div>
          <p className="text-sm font-semibold text-gray-900 mb-1">{currentReview.name}</p>
          <p className="text-sm text-gray-600 line-clamp-2">&quot;{currentReview.text}&quot;</p>
        </div>
      </div>
    </Link>
  );
}
