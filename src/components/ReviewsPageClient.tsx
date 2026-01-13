'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Star, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent } from './ui/card';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';

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

        {/* Reviews Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {reviews.map((review) => (
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
