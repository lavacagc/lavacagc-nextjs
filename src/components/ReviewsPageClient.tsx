'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Star, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent } from './ui/card';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import Link from 'next/link';
import { trackEvent, trackEstimateRequest, trackPhoneClick } from '@/services/analyticsManager';

interface GoogleReview {
  id: string;
  review_id: string;
  reviewer_name: string | null;
  reviewer_photo_url: string | null;
  star_rating: number;
  comment: string | null;
  create_time: string | null;
}

export default function ReviewsPageClient() {
  const { data: reviews, isLoading, error } = useQuery({
    queryKey: ['google-reviews-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('google_reviews')
        .select('*')
        .order('create_time', { ascending: false });

      if (error) throw error;
      return data as GoogleReview[];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <section className="py-12 md:py-16 bg-background">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="h-12 w-12 rounded-full bg-muted"></div>
                    <div className="flex-1">
                      <div className="h-4 w-24 bg-muted rounded mb-2"></div>
                      <div className="h-4 w-32 bg-muted rounded"></div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 w-full bg-muted rounded"></div>
                    <div className="h-4 w-full bg-muted rounded"></div>
                    <div className="h-4 w-2/3 bg-muted rounded"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (error || !reviews || reviews.length === 0) {
    return (
      <section className="py-12 md:py-16 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-text-secondary mb-6">
              Reviews are loading from Google. Check back soon or view our reviews directly on Google.
            </p>
            <a
              href="https://share.google/3IswCVlL2bgoYMBaK"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-primary hover:underline"
            >
              View Reviews on Google
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>
    );
  }

  // Calculate stats
  const averageRating = reviews.reduce((sum, r) => sum + r.star_rating, 0) / reviews.length;
  const fiveStarCount = reviews.filter((r) => r.star_rating === 5).length;
  const fiveStarPercentage = Math.round((fiveStarCount / reviews.length) * 100);

  return (
    <section className="py-12 md:py-16 bg-background">
      <div className="container mx-auto px-4">
        {/* Stats Summary */}
        <div className="max-w-4xl mx-auto mb-12">
          <div className="grid grid-cols-3 gap-4 md:gap-8 text-center">
            <div className="p-4 rounded-lg bg-background-subtle">
              <div className="text-3xl md:text-4xl font-bold text-primary mb-1">
                {averageRating.toFixed(1)}
              </div>
              <div className="text-sm text-text-secondary">Average Rating</div>
            </div>
            <div className="p-4 rounded-lg bg-background-subtle">
              <div className="text-3xl md:text-4xl font-bold text-primary mb-1">
                {reviews.length}
              </div>
              <div className="text-sm text-text-secondary">Total Reviews</div>
            </div>
            <div className="p-4 rounded-lg bg-background-subtle">
              <div className="text-3xl md:text-4xl font-bold text-primary mb-1">
                {fiveStarPercentage}%
              </div>
              <div className="text-sm text-text-secondary">5-Star Reviews</div>
            </div>
          </div>
        </div>

        {/* Reviews Grid with Mid-Page CTA */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {reviews.slice(0, 6).map((review, index) => (
            <React.Fragment key={review.id}>
            {/* Mobile CTA: after 2 reviews */}
            {index === 2 && reviews.length > 2 && (
              <div className="md:hidden col-span-full my-4 p-6 bg-gradient-to-r from-primary/10 to-accent-sunset/10 rounded-2xl border border-primary/20 text-center">
                <h3 className="text-xl font-bold text-text-primary mb-2">Like What You See?</h3>
                <p className="text-text-secondary mb-4">Get a free estimate and see what we can do for your home.</p>
                <div className="flex flex-col gap-3">
                  <Link href="/contact" onClick={() => { trackEvent('cta_click', { location: 'reviews_mid_mobile', destination: 'contact' }); trackEstimateRequest('reviews_mid_mobile'); }} className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-primary to-accent-tangerine text-white font-semibold py-3 px-6 rounded-lg hover:shadow-lg transition-all">
                    Get Your Free Estimate
                  </Link>
                  <a href="tel:2016142814" onClick={() => { trackPhoneClick(); trackEvent('cta_click', { location: 'reviews_mid_mobile', destination: 'phone' }); }} className="text-primary font-semibold hover:underline">
                    Or call (201) 614-2814
                  </a>
                </div>
              </div>
            )}
            {/* Desktop CTA: after 3 reviews (first row on lg grid) */}
            {index === 3 && reviews.length > 3 && (
              <div className="hidden md:block col-span-full my-4 p-8 bg-gradient-to-r from-primary/10 to-accent-sunset/10 rounded-2xl border border-primary/20 text-center">
                <h3 className="text-2xl md:text-3xl font-bold text-text-primary mb-3">Like What You See?</h3>
                <p className="text-lg text-text-secondary mb-6">Our homeowners love their results. Get a free estimate and see what we can do for your home.</p>
                <div className="flex gap-4 justify-center">
                  <Link href="/contact" onClick={() => { trackEvent('cta_click', { location: 'reviews_mid_desktop', destination: 'contact' }); trackEstimateRequest('reviews_mid_desktop'); }} className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-primary to-accent-tangerine text-white font-semibold py-3 px-8 rounded-lg hover:shadow-lg transition-all text-lg">
                    Get Your Free Estimate
                  </Link>
                  <Link href="/calculator" onClick={() => { trackEvent('cta_click', { location: 'reviews_mid_desktop', destination: 'calculator' }); }} className="inline-flex items-center justify-center gap-2 bg-white text-primary font-semibold py-3 px-8 rounded-lg border-2 border-primary hover:bg-primary/5 transition-all text-lg">
                    Try Our Cost Calculator
                  </Link>
                </div>
              </div>
            )}
            <Card
              className="hover:shadow-elegant transition-shadow duration-300"
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-4 mb-4">
                  <Avatar className="h-12 w-12">
                    {review.reviewer_photo_url && (
                      <AvatarImage
                        src={review.reviewer_photo_url}
                        alt={review.reviewer_name || 'Reviewer'}
                      />
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
                  <p className="text-text-secondary leading-relaxed">
                    {review.comment}
                  </p>
                )}
              </CardContent>
            </Card>
            </React.Fragment>
          ))}
        </div>

        {/* Remaining reviews after first 6 */}
        {reviews.length > 6 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto mt-6">
            {reviews.slice(6).map((review) => (
              <Card key={review.id} className="hover:shadow-elegant transition-shadow duration-300">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4 mb-4">
                    <Avatar className="h-12 w-12">
                      {review.reviewer_photo_url && <AvatarImage src={review.reviewer_photo_url} alt={review.reviewer_name || 'Reviewer'} />}
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold">{(review.reviewer_name || 'A').charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-semibold text-text-primary">{review.reviewer_name || 'Anonymous'}</h3>
                      <div className="flex gap-0.5 my-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`h-4 w-4 ${i < (review.rating || 5) ? 'fill-yellow-400 text-yellow-400' : 'fill-muted text-muted'}`} />
                        ))}
                      </div>
                      {review.create_time && <div className="text-sm text-text-secondary">{format(new Date(review.create_time), 'MMMM d, yyyy')}</div>}
                    </div>
                  </div>
                  {review.comment && <p className="text-text-secondary leading-relaxed">{review.comment}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* REMOVED: Old mid-page CTA that was after 6 reviews — now inline in grid above */}
        {false && (
          <div className="max-w-4xl mx-auto my-12 p-8 bg-gradient-to-r from-primary/10 to-accent-sunset/10 rounded-2xl border border-primary/20 text-center">
            <h3 className="text-2xl md:text-3xl font-bold text-text-primary mb-3">
              Like What You See?
            </h3>
            <p className="text-lg text-text-secondary mb-6">
              Our homeowners love their results. Get a free estimate and see what we can do for your home.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/contact"
                onClick={() => {
                  trackEvent('cta_click', {
                    location: 'reviews_mid_page',
                    destination: 'contact',
                    variant: 'Get Your Free Estimate',
                  });
                  trackEstimateRequest('reviews_mid_page');
                }}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button text-white h-12 px-8 transition-all duration-300 hover:scale-105 cursor-pointer"
              >
                Get Your Free Estimate
              </Link>
              <Link
                href="/project-calculator"
                onClick={() => {
                  trackEvent('cta_click', {
                    location: 'reviews_mid_page',
                    destination: 'calculator',
                    variant: 'Calculate Your Project Cost',
                  });
                }}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium border-2 border-primary text-primary hover:bg-primary/10 h-12 px-8 transition-all duration-300 cursor-pointer"
              >
                Calculate Your Project Cost
              </Link>
            </div>
          </div>
        )}

        {/* Remaining Reviews */}
        {reviews.length > 6 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {reviews.slice(6).map((review) => (
              <Card
                key={review.id}
                className="hover:shadow-elegant transition-shadow duration-300"
              >
                <CardContent className="p-6">
                  <div className="flex items-start gap-4 mb-4">
                    <Avatar className="h-12 w-12">
                      {review.reviewer_photo_url && (
                        <AvatarImage
                          src={review.reviewer_photo_url}
                          alt={review.reviewer_name || 'Reviewer'}
                        />
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
                    <p className="text-text-secondary leading-relaxed">
                      {review.comment}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Google Attribution */}
        <div className="text-center mt-12">
          <p className="text-sm text-text-muted">
            Reviews sourced from{' '}
            <a
              href="https://share.google/3IswCVlL2bgoYMBaK"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Google Business Profile
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
