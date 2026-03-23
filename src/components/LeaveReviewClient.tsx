'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Star, ExternalLink, MessageSquare, Heart, Send, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

const GOOGLE_REVIEW_URL = 'https://g.page/r/CflitSa4DKHAEBM/review';

type Step = 'rating' | 'google' | 'feedback' | 'thanks';

export default function LeaveReviewClient() {
  const [step, setStep] = useState<Step>('rating');
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleRatingSelect = (selected: number) => {
    setRating(selected);
    // 4-5 stars → send to Google
    // 1-3 stars → capture feedback internally
    if (selected >= 4) {
      setStep('google');
    } else {
      setStep('feedback');
    }
  };

  const handleFeedbackSubmit = async () => {
    if (!feedback.trim()) return;
    setSubmitting(true);

    try {
      // Try internal_feedback table first (preferred)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: fbError } = await (supabase.from as any)('internal_feedback').insert({
        rating,
        name: name.trim() || null,
        email: email.trim() || null,
        feedback: feedback.trim(),
        source: 'leave-a-review',
      });

      // If internal_feedback table doesn't exist, store as a chat conversation
      if (fbError) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from as any)('chat_conversations').insert({
          visitor_id: `review-${Date.now()}`,
          lead_captured: !!(name.trim() || email.trim()),
          lead_data: {
            type: 'review-feedback',
            rating,
            name: name.trim() || null,
            email: email.trim() || null,
            feedback: feedback.trim(),
          },
          page_url: '/leave-a-review',
        });
      }
    } catch {
      // Silently fail — we don't want to block the user
      console.error('Failed to save feedback');
    }

    setSubmitting(false);
    setStep('thanks');
  };

  return (
    <div className="py-12 md:py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-2xl mx-auto">

          {/* Rating Step */}
          {step === 'rating' && (
            <div className="text-center">
              <div className="mb-8">
                <h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-4">
                  How Was Your Experience?
                </h1>
                <p className="text-lg text-text-secondary max-w-xl mx-auto">
                  We value your feedback. Let us know how we did on your renovation project.
                </p>
              </div>

              <Card className="border-2">
                <CardContent className="p-8 md:p-12">
                  <p className="text-lg text-text-secondary mb-6">
                    Tap a star to rate your experience
                  </p>

                  <div className="flex items-center justify-center gap-2 md:gap-3 mb-6">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => handleRatingSelect(star)}
                        onMouseEnter={() => setHoveredRating(star)}
                        onMouseLeave={() => setHoveredRating(0)}
                        className="p-1 transition-transform hover:scale-110 active:scale-95 cursor-pointer"
                        aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                      >
                        <Star
                          className={`h-12 w-12 md:h-16 md:w-16 transition-colors ${
                            star <= (hoveredRating || rating)
                              ? 'fill-yellow-400 text-yellow-400'
                              : 'fill-muted text-muted-foreground/30'
                          }`}
                        />
                      </button>
                    ))}
                  </div>

                  <div className="text-sm text-text-muted">
                    {hoveredRating === 1 && 'Poor'}
                    {hoveredRating === 2 && 'Below Average'}
                    {hoveredRating === 3 && 'Average'}
                    {hoveredRating === 4 && 'Great'}
                    {hoveredRating === 5 && 'Excellent!'}
                  </div>
                </CardContent>
              </Card>

              <p className="text-sm text-text-muted mt-6">
                Your honest feedback helps us improve our services
              </p>
            </div>
          )}

          {/* Google Review Step (4-5 stars) */}
          {step === 'google' && (
            <div className="text-center">
              <div className="mb-8">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mb-6">
                  <Heart className="h-10 w-10 text-green-600 fill-green-600" />
                </div>
                <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">
                  Thank You!
                </h2>
                <p className="text-lg text-text-secondary max-w-xl mx-auto">
                  We&apos;re thrilled you had a great experience! Would you mind sharing your feedback on Google? It helps other homeowners find us.
                </p>
              </div>

              <Card className="border-2 border-primary/20">
                <CardContent className="p-8">
                  <div className="flex items-center justify-center gap-1 mb-6">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`h-8 w-8 ${
                          star <= rating
                            ? 'fill-yellow-400 text-yellow-400'
                            : 'fill-muted text-muted-foreground/30'
                        }`}
                      />
                    ))}
                  </div>

                  <a
                    href={GOOGLE_REVIEW_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-md text-base font-medium bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button text-white h-14 px-10 transition-all duration-300 hover:scale-105 cursor-pointer"
                  >
                    Leave a Google Review
                    <ExternalLink className="h-5 w-5" />
                  </a>

                  <p className="text-sm text-text-muted mt-4">
                    Opens Google Reviews in a new tab
                  </p>
                </CardContent>
              </Card>

              <button
                onClick={() => setStep('feedback')}
                className="mt-6 text-sm text-text-muted hover:text-text-secondary underline cursor-pointer"
              >
                I&apos;d prefer to leave private feedback instead
              </button>
            </div>
          )}

          {/* Internal Feedback Step (1-3 stars or opted out of Google) */}
          {step === 'feedback' && (
            <div className="text-center">
              <div className="mb-8">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-100 mb-6">
                  <MessageSquare className="h-10 w-10 text-blue-600" />
                </div>
                <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">
                  We Want to Hear From You
                </h2>
                <p className="text-lg text-text-secondary max-w-xl mx-auto">
                  {rating <= 3
                    ? "We're sorry your experience wasn't perfect. Your feedback helps us improve. Please let us know what we could have done better."
                    : "We'd love to hear more about your experience. Your feedback is valuable to us."}
                </p>
              </div>

              <Card className="border-2 text-left">
                <CardContent className="p-6 md:p-8">
                  <div className="space-y-5">
                    <div>
                      <label htmlFor="review-name" className="block text-sm font-medium text-text-primary mb-1.5">
                        Name <span className="text-text-muted">(optional)</span>
                      </label>
                      <input
                        id="review-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                        className="w-full px-4 py-3 rounded-md border border-border bg-background text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                      />
                    </div>

                    <div>
                      <label htmlFor="review-email" className="block text-sm font-medium text-text-primary mb-1.5">
                        Email <span className="text-text-muted">(optional — so we can follow up)</span>
                      </label>
                      <input
                        id="review-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full px-4 py-3 rounded-md border border-border bg-background text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                      />
                    </div>

                    <div>
                      <label htmlFor="review-feedback" className="block text-sm font-medium text-text-primary mb-1.5">
                        Your Feedback
                      </label>
                      <textarea
                        id="review-feedback"
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        placeholder="Tell us about your experience..."
                        rows={5}
                        className="w-full px-4 py-3 rounded-md border border-border bg-background text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none"
                      />
                    </div>

                    <Button
                      onClick={handleFeedbackSubmit}
                      disabled={!feedback.trim() || submitting}
                      className="w-full h-12 bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button text-white cursor-pointer"
                    >
                      {submitting ? (
                        'Submitting...'
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Submit Feedback
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Thank You Step */}
          {step === 'thanks' && (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-green-100 mb-8">
                <CheckCircle2 className="h-14 w-14 text-green-600" />
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">
                Thank You for Your Feedback
              </h2>
              <p className="text-lg text-text-secondary max-w-xl mx-auto mb-8">
                Your input means a lot to us. We take every piece of feedback seriously and use it to improve our services for future homeowners.
              </p>
              {email && (
                <p className="text-sm text-text-muted mb-8">
                  We&apos;ll be in touch if we have any follow-up questions.
                </p>
              )}
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/"
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button text-white h-12 px-8 cursor-pointer"
                >
                  Back to Home
                </Link>
                <a
                  href="/portfolio"
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium border-2 border-primary text-primary hover:bg-primary/10 h-12 px-8 cursor-pointer"
                >
                  View Our Work
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
