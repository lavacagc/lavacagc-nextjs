'use client';

import { useState } from 'react';
import { ArrowLeftRight, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { MediaThumb } from './MediaThumb';
import type { FormImage } from './types';

interface PairLinkerProps {
  images: FormImage[];
  onLink: (beforeKey: string, afterKey: string, label: string | undefined) => void;
  onUnlink: (pairKey: string) => void;
}

/**
 * Link one Before photo to one After photo. On the project page each linked
 * pair renders as a draggable before/after slider (src/lib/projects/gallery.ts);
 * everything unpaired stays a standalone photo. Videos are never paired.
 */
export function PairLinker({ images, onLink, onUnlink }: PairLinkerProps) {
  const [pickBefore, setPickBefore] = useState<string | null>(null);
  const [pickAfter, setPickAfter] = useState<string | null>(null);
  const [label, setLabel] = useState('');

  const pairs = new Map<string, { before?: FormImage; after?: FormImage }>();
  for (const img of images) {
    if (!img.pair_key) continue;
    const entry = pairs.get(img.pair_key) ?? {};
    if (img.category === 'before') entry.before = img;
    if (img.category === 'after') entry.after = img;
    pairs.set(img.pair_key, entry);
  }
  const linked = [...pairs.entries()].filter(([, p]) => p.before && p.after) as Array<[string, { before: FormImage; after: FormImage }]>;

  const usable = (img: FormImage) => img.media_type === 'image' && !img.pair_key && img.status !== 'error';
  const befores = images.filter((img) => img.category === 'before' && usable(img));
  const afters = images.filter((img) => img.category === 'after' && usable(img));

  if (linked.length === 0 && (befores.length === 0 || afters.length === 0)) return null;

  const link = () => {
    if (!pickBefore || !pickAfter) return;
    onLink(pickBefore, pickAfter, label.trim() || undefined);
    setPickBefore(null);
    setPickAfter(null);
    setLabel('');
  };

  const picker = (list: FormImage[], picked: string | null, setPicked: (k: string | null) => void, tone: 'before' | 'after') => (
    <div className="grid grid-cols-3 gap-1.5">
      {list.map((img, i) => {
        const selected = picked === img.key;
        return (
          <button
            key={img.key}
            type="button"
            onClick={() => setPicked(selected ? null : img.key)}
            aria-pressed={selected}
            aria-label={`${tone === 'before' ? 'Before' : 'After'} photo ${i + 1}`}
            className={cn(
              'relative aspect-[4/3] overflow-hidden rounded-md border-2 transition',
              selected
                ? tone === 'before' ? 'border-red-500 ring-2 ring-red-500/40' : 'border-green-500 ring-2 ring-green-500/40'
                : 'border-transparent hover:border-muted-foreground/40',
            )}
          >
            <MediaThumb src={img.previewUrl} alt="" sizes="120px" />
            {selected && (
              <span className={cn('absolute inset-0 flex items-center justify-center', tone === 'before' ? 'bg-red-500/25' : 'bg-green-500/25')}>
                <Check className="h-5 w-5 text-white drop-shadow" aria-hidden />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <section className="space-y-3 rounded-lg border p-4" aria-labelledby="pairs-heading" data-testid="pair-linker">
      <div>
        <h3 id="pairs-heading" className="flex items-center gap-2 text-sm font-semibold">
          <ArrowLeftRight className="h-4 w-4 text-primary" aria-hidden />
          Before / After Pairs
          {linked.length > 0 && <Badge variant="secondary" className="text-xs">{linked.length}</Badge>}
        </h3>
        <p className="text-xs text-muted-foreground">
          Link a before photo to its after photo to show them as a slider on the project page.
        </p>
      </div>

      {linked.map(([key, pair]) => (
        <div key={key} className="flex items-center gap-3 rounded-lg border p-2">
          <div className="relative h-14 w-20 flex-shrink-0 overflow-hidden rounded bg-muted">
            <MediaThumb src={pair.before.previewUrl} alt="" sizes="80px" />
          </div>
          <ArrowLeftRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden />
          <div className="relative h-14 w-20 flex-shrink-0 overflow-hidden rounded bg-muted">
            <MediaThumb src={pair.after.previewUrl} alt="" sizes="80px" />
          </div>
          <p className="min-w-0 flex-1 truncate text-sm font-medium">
            {pair.before.caption || pair.after.caption || 'Before / After'}
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={() => onUnlink(key)} className="text-red-600 hover:text-red-700">
            Unlink
          </Button>
        </div>
      ))}

      {befores.length > 0 && afters.length > 0 && (
        <div className="space-y-3 rounded-lg border border-dashed p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs font-semibold text-red-700">Pick the BEFORE photo</p>
              {picker(befores, pickBefore, setPickBefore, 'before')}
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-green-700">Pick the AFTER photo</p>
              {picker(afters, pickAfter, setPickAfter, 'after')}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex-1">
              <span className="sr-only">Pair label</span>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Optional label (e.g. Kitchen)" className="h-9 text-sm" />
            </label>
            <Button type="button" size="sm" className="h-9" disabled={!pickBefore || !pickAfter} onClick={link}>
              <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Link as pair
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
