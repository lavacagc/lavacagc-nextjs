'use client'

import React from 'react';
import Script from 'next/script';
import { Star, User, Quote } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface Review {
  author: string;
  rating: number;
  text: string;
  date: string;
  location?: string;
  service?: string;
}

interface ReviewSchemaProps {
  reviews: Review[];
  businessName?: string;
  aggregateRating?: {
    ratingValue: number;
    ratingCount: number;
    bestRating?: number;
    worstRating?: number;
  };
  showReviews?: boolean;
  className?: string;
}

const ReviewSchema: React.FC<ReviewSchemaProps> = ({
  reviews,
  businessName = "La Vaca General Contractors",
  aggregateRating,
  showReviews = true,
  className = ""
}) => {
  // Calculate aggregate rating if not provided
  const calculatedAggregateRating = aggregateRating || {
    ratingValue: reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length,
    ratingCount: reviews.length,
    bestRating: 5,
    worstRating: 1
  };

  // Generate review schema
  const reviewSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": businessName,
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": calculatedAggregateRating.ratingValue.toFixed(1),
      "ratingCount": calculatedAggregateRating.ratingCount,
      "bestRating": calculatedAggregateRating.bestRating || 5,
      "worstRating": calculatedAggregateRating.worstRating || 1
    },
    "review": reviews.map(review => ({
      "@type": "Review",
      "author": {
        "@type": "Person",
        "name": review.author
      },
      "reviewRating": {
        "@type": "Rating",
        "ratingValue": review.rating,
        "bestRating": 5,
        "worstRating": 1
      },
      "reviewBody": review.text,
      "datePublished": review.date
    }))
  };

  const renderStars = (rating: number, size: 'sm' | 'md' = 'sm') => {
    return (
      <div className="flex items-center space-x-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`
              ${size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'}
              ${star <= rating ? 'text-accent-tangerine fill-current' : 'text-muted'}
            `}
          />
        ))}
      </div>
    );
  };

  return (
    <>
      <Script
        id="review-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(reviewSchema) }}
      />

      {showReviews && (
        <section className={`py-16 ${className}`}>
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4 text-text-primary">
                What Our Clients Say
              </h2>

              <div className="flex items-center justify-center space-x-4 mb-6">
                {renderStars(calculatedAggregateRating.ratingValue, 'md')}
                <div className="text-lg font-semibold text-text-primary">
                  {calculatedAggregateRating.ratingValue.toFixed(1)} out of 5
                </div>
                <div className="text-text-secondary">
                  ({calculatedAggregateRating.ratingCount} reviews)
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {reviews.slice(0, 6).map((review, index) => (
                <Card key={index} className="h-full hover:shadow-elegant transition-shadow">
                  <CardContent className="p-6 h-full flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="font-semibold text-text-primary">
                            {review.author}
                          </div>
                          {review.location && (
                            <div className="text-xs text-text-secondary">
                              {review.location}
                            </div>
                          )}
                        </div>
                      </div>
                      {renderStars(review.rating)}
                    </div>

                    <div className="flex-1 mb-4">
                      <Quote className="h-4 w-4 text-muted mb-2" />
                      <p className="text-text-secondary text-sm leading-relaxed italic">
                        &quot;{review.text}&quot;
                      </p>
                    </div>

                    <div className="text-xs text-text-secondary flex justify-between">
                      <span>{new Date(review.date).toLocaleDateString()}</span>
                      {review.service && <span>{review.service}</span>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
};

export default ReviewSchema;
