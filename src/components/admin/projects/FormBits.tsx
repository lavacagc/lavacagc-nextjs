'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** A collapsed-by-default section ("More details", "SEO"). */
export function FoldSection({ title, hint, children, defaultOpen = false, testId }: {
  title: string; hint?: string; children: ReactNode; defaultOpen?: boolean; testId?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border" data-testid={testId}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span>
            <span className="block text-sm font-semibold">{title}</span>
            {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
          </span>
          <ChevronDown className={cn('h-4 w-4 flex-shrink-0 transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-5 border-t px-4 py-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}

/** Toggle chips over a fixed list, plus free-text additions. */
export function ChipPicker({ label, options, value, onChange, addPlaceholder }: {
  label: string; options: readonly string[]; value: string[]; onChange: (next: string[]) => void; addPlaceholder: string;
}) {
  const [custom, setCustom] = useState('');
  const toggle = (item: string) => onChange(value.includes(item) ? value.filter((v) => v !== item) : [...value, item]);
  const extras = value.filter((v) => !options.includes(v));
  const add = () => {
    const v = custom.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setCustom('');
  };
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {[...options, ...extras].map((item) => {
          const on = value.includes(item);
          return (
            <button
              key={item}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(item)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                on ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-muted',
              )}
            >
              {item}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">{addPlaceholder}</span>
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            placeholder={addPlaceholder}
            className="h-9"
          />
        </label>
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={add} aria-label={`Add: ${addPlaceholder}`}>
          <Plus className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </fieldset>
  );
}

/** A native select styled like the shadcn input: one tap on a tablet, no portal. */
export function NativeSelect({ id, value, onChange, options, placeholder }: {
  id: string; value: string; onChange: (v: string) => void; options: readonly string[]; placeholder: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
      {value && !options.includes(value) && <option value={value}>{value}</option>}
    </select>
  );
}
