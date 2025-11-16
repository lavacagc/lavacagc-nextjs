'use client'

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Star } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent } from './ui/card';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { useEffect, useRef, useState } from 'react';

interface GoogleReview {
  id: string;
  review_id: string;
  reviewer_name: string | null;
  reviewer_photo_url: string | null;
  star_rating: number;
  comment: string | null;
  create_time: string | null;
}

export default function Testimonials() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const [isAutoScrolling, setIsAutoScrolling] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  const { data: reviews, isLoading } = useQuery({
    queryKey: ['google-reviews-public'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('google_reviews')
        .select('*')
        .order('create_time', { ascending: false })
        .limit(5);

      if (error) throw error;
      return data as GoogleReview[];
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Intersection observer for mobile - start scrolling when in view
  useEffect(() => {
    if (!isMobile || !sectionRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsAutoScrolling(entry.isIntersecting);
        });
      },
      { threshold: 0.2 }
    );

    observer.observe(sectionRef.current);

    return () => {
      if (sectionRef.current) {
        observer.unobserve(sectionRef.current);
      }
    };
  }, [isMobile]);

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer || !isAutoScrolling || !reviews || reviews.length === 0) return;

    let animationFrameId: number;
    let lastTimestamp: number;

    const autoScroll = (timestamp: number) => {
      if (!lastTimestamp) lastTimestamp = timestamp;
      const deltaTime = timestamp - lastTimestamp;

      // Faster scroll speed for more noticeable effect (60 pixels per second)
      const scrollSpeed = 60;
      const scrollAmount = (scrollSpeed * deltaTime) / 1000;

      scrollContainer.scrollLeft += scrollAmount;

      // Reset to start when reaching the end
      if (scrollContainer.scrollLeft >= scrollContainer.scrollWidth - scrollContainer.clientWidth) {
        scrollContainer.scrollLeft = 0;
      }

      lastTimestamp = timestamp;
      animationFrameId = requestAnimationFrame(autoScroll);
    };

    animationFrameId = requestAnimationFrame(autoScroll);

    // Pause auto-scroll on user interaction
    const handleUserScroll = () => {
      setIsAutoScrolling(false);
    };

    const handleTouchStart = () => {
      setIsAutoScrolling(false);
    };

    scrollContainer.addEventListener('wheel', handleUserScroll, { passive: true });
    scrollContainer.addEventListener('touchstart', handleTouchStart, { passive: true });
    scrollContainer.addEventListener('mousedown', handleUserScroll);

    return () => {
      cancelAnimationFrame(animationFrameId);
      scrollContainer.removeEventListener('wheel', handleUserScroll);
      scrollContainer.removeEventListener('touchstart', handleTouchStart);
      scrollContainer.removeEventListener('mousedown', handleUserScroll);
    };
  }, [isAutoScrolling, reviews]);

  if (isLoading) {
    return (
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <div className="h-8 w-48 bg-muted animate-pulse rounded mx-auto mb-4"></div>
            <div className="h-4 w-64 bg-muted animate-pulse rounded mx-auto"></div>
          </div>
        </div>
      </section>
    );
  }

  if (!reviews || reviews.length === 0) {
    return null;
  }

  return (
    <section id="testimonials" className="py-20 bg-background" ref={sectionRef}>
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-text-primary mb-4">
            What Our
            <span className="text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text"> Clients Say</span>
          </h2>
          <p className="text-xl text-text-secondary max-w-2xl mx-auto">
            Real testimonials from homeowners who trusted us with their renovation projects
          </p>
        </div>

        <div className="relative overflow-hidden">
          <div
            ref={scrollRef}
            className="flex space-x-6 pb-4 overflow-x-auto scrollbar-hide scroll-smooth"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {reviews.map((review) => (
              <Card key={review.id} className="flex-shrink-0 w-[340px] md:w-[400px] hover:shadow-elegant transition-shadow duration-300">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4 mb-4">
                    <Avatar className="h-12 w-12">
                      {review.reviewer_photo_url && (
                        <AvatarImage src={review.reviewer_photo_url} alt={review.reviewer_name || 'Reviewer'} />
                      )}
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {review.reviewer_name?.charAt(0) || 'G'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="font-semibold text-text-primary mb-1">
                        {review.reviewer_name || 'Google User'}
                      </div>
                      <div className="flex items-center gap-1 mb-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`h-4 w-4 ${
                              i < review.star_rating
                                ? 'fill-yellow-400 text-yellow-400'
                                : 'fill-muted text-muted'
                            }`}
                          />
                        ))}
                      </div>
                      {review.create_time && (
                        <div className="text-sm text-text-secondary">
                          {format(new Date(review.create_time), 'MMMM d, yyyy')}
                        </div>
                      )}
                    </div>
                  </div>
                  {review.comment && (
                    <p className="text-text-secondary leading-relaxed line-clamp-6">
                      {review.comment}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="text-center mt-8">
          <a
            href="https://www.google.com/maps/place/La+Vaca+General+Contractors/@40.8090131,-74.2089287,17z"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="See more reviews on Google Maps"
          >
            <Button
              size="lg"
              className="bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button transition-all duration-300 hover:scale-105"
            >
              See More Reviews
            </Button>
          </a>
        </div>
      </div>
    </section>
  );
}
