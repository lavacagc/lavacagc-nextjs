'use client';

/**
 * ContactTimePicker — "When's the best time to reach you?"
 *
 * Shared by every lead-capture form (HomeEstimateForm, EstimateForm,
 * LandingPageLeadForm, ContactForm, ReferralForm). Chip-style single-select
 * because chips convert noticeably better than <select> on mobile and are
 * one tap faster to fill.
 *
 * Contract:
 *   - Optional field with 'anytime' as the default, so it never blocks a
 *     rushed submission. Every lead gets a meaningful signal regardless.
 *   - When the user picks 'specific', a short textarea reveals for free-
 *     form detail (max 200 chars).
 *   - Parent wires value + onChange. ALSO pass timezone via onTimezoneChange
 *     on mount so we capture Intl.DateTimeFormat().resolvedOptions().timeZone
 *     once without the client having to think about it.
 *   - If preferredContactMethod === 'text', the whole component hides —
 *     text is async, so "morning vs evening" isn't useful and one less field
 *     is better for conversion.
 */

import { useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export const CONTACT_TIME_BUCKETS = [
  { value: 'anytime', label: 'Anytime', hint: '' },
  { value: 'morning', label: 'Morning', hint: '8am–12pm' },
  { value: 'afternoon', label: 'Afternoon', hint: '12pm–5pm' },
  { value: 'evening', label: 'Evening', hint: '5pm–8pm' },
  { value: 'weekends', label: 'Weekends', hint: '' },
  { value: 'specific', label: 'Specific time…', hint: '' },
] as const;

export type ContactTimePreference = (typeof CONTACT_TIME_BUCKETS)[number]['value'];

export interface ContactTimePickerProps {
  value: ContactTimePreference;
  onChange: (value: ContactTimePreference) => void;
  details: string;
  onDetailsChange: (value: string) => void;
  onTimezoneChange?: (timezone: string) => void;
  preferredContactMethod?: string;
  className?: string;
  labelOverride?: string;
}

const DETAILS_MAX = 200;

export function ContactTimePicker({
  value,
  onChange,
  details,
  onDetailsChange,
  onTimezoneChange,
  preferredContactMethod,
  className,
  labelOverride,
}: ContactTimePickerProps) {
  // Capture the browser timezone once per mount. We don't prompt for it —
  // Intl reports the OS-level zone, which is what we actually want.
  useEffect(() => {
    if (!onTimezoneChange) return;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) onTimezoneChange(tz);
    } catch {
      // Old browsers with no Intl support — fall back to the server default.
    }
  }, [onTimezoneChange]);

  // Hide entirely for text-based contact; texts are async so the bucket
  // doesn't map onto them cleanly, and every hidden field is a conversion win.
  if (preferredContactMethod === 'text') {
    return null;
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Label className="text-sm">
        {labelOverride || "When's the best time to reach you?"}
        <span className="ml-1 text-xs text-text-muted font-normal">(optional)</span>
      </Label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {CONTACT_TIME_BUCKETS.map((bucket) => {
          const selected = value === bucket.value;
          return (
            <button
              key={bucket.value}
              type="button"
              onClick={() => onChange(bucket.value)}
              className={cn(
                'text-left rounded-md border px-3 py-2 text-sm transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-primary/50',
                selected
                  ? 'border-primary bg-primary/5 text-primary font-medium'
                  : 'border-border bg-background hover:border-primary/40 hover:bg-primary/5',
              )}
              aria-pressed={selected}
            >
              <div>{bucket.label}</div>
              {bucket.hint && (
                <div className="text-xs text-text-muted font-normal mt-0.5">
                  {bucket.hint}
                </div>
              )}
            </button>
          );
        })}
      </div>
      {value === 'specific' && (
        <div className="space-y-1 pt-1">
          <Label htmlFor="contact-time-details" className="text-xs text-text-muted">
            When works best? (e.g., &ldquo;Tuesday after 5pm&rdquo;)
          </Label>
          <textarea
            id="contact-time-details"
            value={details}
            onChange={(e) =>
              onDetailsChange(e.target.value.slice(0, DETAILS_MAX))
            }
            placeholder="Tuesday after 5pm works best"
            maxLength={DETAILS_MAX}
            rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <div className="text-xs text-text-muted text-right">
            {details.length}/{DETAILS_MAX}
          </div>
        </div>
      )}
    </div>
  );
}

export default ContactTimePicker;
