'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { HEX_COLOR, isValidCtaColor } from '@/lib/cta/color';

export interface VariantDraft {
  wording: string;
  subtext: string;
  color: string;
}

interface Props {
  initial: VariantDraft;
  submitLabel: string;
  busy: boolean;
  onSubmit: (draft: VariantDraft) => void;
  onCancel?: () => void;
  /**
   * Set when the variant already has views or clicks. Its wording is then
   * frozen (the counts belong to it); a new wording is offered as "deactivate
   * this one and add a new variant" through `onReplace` instead.
   */
  wordingLocked?: { variantKey: string; onReplace: (draft: VariantDraft) => void };
}

/**
 * Wording, subtext and colour for one variant. Used both inline (edit) and for
 * adding a new variant. Colour is a hex value (recommended; applied inline) or
 * Tailwind classes, which only render if the class already exists in the site CSS.
 */
export function VariantEditor({ initial, submitLabel, busy, onSubmit, onCancel, wordingLocked }: Props) {
  const id = useId();
  const [draft, setDraft] = useState<VariantDraft>(initial);
  const color = draft.color.trim();
  const colorInvalid = color !== '' && !isValidCtaColor(color);
  const wordingMissing = draft.wording.trim() === '';
  const replacing = !!wordingLocked && draft.wording.trim() !== initial.wording.trim();

  return (
    <form
      className="grid gap-3 md:grid-cols-[2fr_2fr_1.4fr_auto] md:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (wordingMissing || colorInvalid) return;
        if (replacing) wordingLocked!.onReplace(draft);
        else onSubmit(draft);
      }}
    >
      <div className="space-y-1">
        <Label htmlFor={`${id}-wording`}>Wording</Label>
        <Input
          id={`${id}-wording`}
          value={draft.wording}
          maxLength={60}
          required
          onChange={(e) => setDraft({ ...draft, wording: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-subtext`}>Subtext (optional)</Label>
        <Input
          id={`${id}-subtext`}
          value={draft.subtext}
          maxLength={80}
          onChange={(e) => setDraft({ ...draft, subtext: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-color`}>Colour (blank = default)</Label>
        <div className="flex gap-2">
          <input
            type="color"
            aria-label="Pick a colour"
            className="h-10 w-10 shrink-0 cursor-pointer rounded-md border bg-background p-1"
            value={HEX_COLOR.test(color) && color.length === 7 ? color : '#f26f21'}
            onChange={(e) => setDraft({ ...draft, color: e.target.value })}
          />
          <Input
            id={`${id}-color`}
            value={draft.color}
            placeholder="#1f7a4d"
            maxLength={120}
            aria-invalid={colorInvalid}
            onChange={(e) => setDraft({ ...draft, color: e.target.value })}
          />
        </div>
        {colorInvalid && <p className="text-xs text-destructive">Use a hex colour like #1f7a4d.</p>}
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || wordingMissing || colorInvalid}>
          {replacing ? `Deactivate ${wordingLocked!.variantKey} and add new variant` : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
      </div>
      {replacing && (
        <p className="text-sm text-amber-800 md:col-span-4" role="status">
          Variant {wordingLocked!.variantKey} already has views or clicks under its current wording, so its wording
          cannot change. Saving will add a new variant with this wording, switch it on, and switch{' '}
          {wordingLocked!.variantKey} off. Subtext and colour can be edited in place.
        </p>
      )}
    </form>
  );
}
