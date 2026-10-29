'use client';

import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { BUDGET_RANGES, COMMON_FEATURES, COMMON_MATERIALS, DURATION_OPTIONS } from '@/lib/projects/fields';
import { cn } from '@/lib/utils';
import { ChipPicker, FoldSection, NativeSelect } from './FormBits';
import type { ProjectFormFields } from './types';

interface Review { id: string; reviewer_name: string; comment: string; star_rating: number }

interface MoreDetailsProps {
  fields: ProjectFormFields;
  update: (patch: Partial<ProjectFormFields>) => void;
}

/** Everything optional about a project, collapsed until wanted. */
export function MoreDetailsSection({ fields, update }: MoreDetailsProps) {
  const [reviews, setReviews] = useState<Review[]>([]);

  useEffect(() => {
    let cancelled = false;
    // google_reviews is an existing, publicly readable table; absent on a local replay, which is fine.
    supabase
      .from('google_reviews')
      .select('id, reviewer_name, comment, star_rating')
      .order('star_rating', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (!cancelled && data) setReviews(data as Review[]);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <FoldSection title="More details" hint="Client, date, budget, story, materials, testimonial" testId="more-details">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pf-client">Client first name</Label>
          <Input id="pf-client" value={fields.client_first_name} onChange={(e) => update({ client_first_name: e.target.value })} placeholder="e.g. Sarah" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-date">Date completed</Label>
          <Input id="pf-date" type="month" value={fields.date_completed} onChange={(e) => update({ date_completed: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-budget">Budget range</Label>
          <NativeSelect id="pf-budget" value={fields.budget_range} onChange={(v) => update({ budget_range: v })} options={BUDGET_RANGES} placeholder="Not set" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-duration">Duration</Label>
          <NativeSelect id="pf-duration" value={fields.duration} onChange={(v) => update({ duration: v })} options={DURATION_OPTIONS} placeholder="Not set" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pf-challenge">Challenge</Label>
        <Textarea id="pf-challenge" rows={4} value={fields.challenge} onChange={(e) => update({ challenge: e.target.value })}
          placeholder="e.g. The existing kitchen was cramped, with outdated appliances and poor lighting." />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pf-solution">Solution</Label>
        <Textarea id="pf-solution" rows={4} value={fields.solution} onChange={(e) => update({ solution: e.target.value })}
          placeholder="e.g. We opened the wall to the dining room and added a quartz island." />
      </div>

      <ChipPicker label="Materials" options={COMMON_MATERIALS} value={fields.materials_used}
        onChange={(v) => update({ materials_used: v })} addPlaceholder="Add a material" />
      <ChipPicker label="Features" options={COMMON_FEATURES} value={fields.special_features}
        onChange={(v) => update({ special_features: v })} addPlaceholder="Add a feature" />

      <div className="space-y-2">
        <Label htmlFor="pf-testimonial">Testimonial</Label>
        {reviews.length > 0 && (
          <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-lg border p-2" data-testid="review-picker">
            <p className="text-xs text-muted-foreground">Pick a Google review:</p>
            {reviews.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => update({ testimonial_text: r.comment, testimonial_rating: r.star_rating, client_first_name: r.reviewer_name })}
                className="block w-full rounded-md border p-2 text-left hover:bg-muted/50"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  {r.reviewer_name}
                  <span className="flex" aria-label={`${r.star_rating} stars`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className={cn('h-3 w-3', n <= r.star_rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted')} aria-hidden />
                    ))}
                  </span>
                </span>
                <span className="line-clamp-2 text-xs text-muted-foreground">{r.comment}</span>
              </button>
            ))}
          </div>
        )}
        <Textarea id="pf-testimonial" rows={3} value={fields.testimonial_text}
          onChange={(e) => update({ testimonial_text: e.target.value })} placeholder="Optional. Leave empty to hide it on the page." />
        <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Client rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={fields.testimonial_rating === n}
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
              onClick={() => update({ testimonial_rating: n })}
              className="rounded p-1 hover:bg-muted"
            >
              <Star className={cn('h-6 w-6', n <= fields.testimonial_rating ? 'fill-yellow-400 text-yellow-500' : 'text-gray-300')} aria-hidden />
            </button>
          ))}
          <span className="ml-1 text-sm text-muted-foreground">{fields.testimonial_rating}/5</span>
          {fields.testimonial_text && (
            <Button type="button" variant="ghost" size="sm" className="ml-auto"
              onClick={() => update({ testimonial_text: '', testimonial_rating: 5 })}>
              Clear testimonial
            </Button>
          )}
        </div>
      </div>
    </FoldSection>
  );
}
