'use client';

import { useRef, useState } from 'react';
import { AlertCircle, Loader2, Star, Trash2, Upload, Link2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { CATEGORY_LABEL, IMAGE_CATEGORIES, type ImageCategory } from '@/lib/projects/fields';
import { MediaThumb } from './MediaThumb';
import type { FormImage } from './types';

interface PhotoGridProps {
  images: FormImage[];
  onAddFiles: (files: File[]) => void;
  onChangeImage: (key: string, patch: Partial<FormImage>) => void;
  onSetFeatured: (key: string) => void;
  onRemove: (key: string) => void;
  invalid?: boolean;
}

const CATEGORY_ACTIVE: Record<ImageCategory, string> = {
  before: 'bg-red-600 text-white border-red-600',
  during: 'bg-amber-500 text-white border-amber-500',
  after: 'bg-green-600 text-white border-green-600',
};

/**
 * One drop zone for every photo and video, then a grid where each thumbnail
 * carries its own Before / During / After toggle (default After), a featured
 * star, a remove button and an editable alt text (decision 002, Q4).
 */
export function PhotoGrid({ images, onAddFiles, onChangeImage, onSetFeatured, onRemove, invalid }: PhotoGridProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const take = (list: FileList | null) => {
    if (list && list.length > 0) onAddFiles(Array.from(list));
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        data-testid="project-dropzone"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
        onDrop={(e) => { e.preventDefault(); setDragging(false); take(e.dataTransfer.files); }}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          dragging ? 'border-primary bg-primary/5' : invalid ? 'border-destructive' : 'border-muted-foreground/30 hover:border-muted-foreground/60',
        )}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
          <Upload className="h-5 w-5 text-muted-foreground" aria-hidden />
        </span>
        <span className="text-sm font-medium">Drop photos and videos here, or tap to choose</span>
        <span className="text-xs text-muted-foreground">JPEG, PNG, WebP, HEIC, MP4, MOV. Each one starts as After; switch it below.</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*,.heic,.heif,.mp4,.mov,.m4v,.webm"
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose photos and videos"
        data-testid="project-file-input"
        onChange={(e) => { take(e.target.files); e.target.value = ''; }}
      />

      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="project-photo-list">
          {images.map((img, i) => (
            <li key={img.key} className="space-y-1.5 rounded-lg border bg-card p-1.5" data-testid="project-photo">
              <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-muted">
                <MediaThumb src={img.previewUrl} alt={img.alt_text || `Photo ${i + 1}`} mediaType={img.media_type} />

                {img.status === 'uploading' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs font-medium text-white">
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> Uploading
                  </div>
                )}
                {img.status === 'error' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-red-900/70 p-2 text-center text-[11px] font-medium text-white">
                    <AlertCircle className="h-4 w-4" aria-hidden />
                    {img.error || 'Upload failed'}
                  </div>
                )}

                <div className="absolute right-1 top-1 flex gap-1">
                  <button
                    type="button"
                    onClick={() => onSetFeatured(img.key)}
                    aria-pressed={img.is_featured}
                    aria-label={img.is_featured ? 'Featured photo' : 'Make this the featured photo'}
                    title={img.is_featured ? 'Featured photo' : 'Make this the featured photo'}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full shadow transition-colors',
                      img.is_featured ? 'bg-yellow-400 text-yellow-950' : 'bg-white/90 text-gray-700 hover:bg-white',
                    )}
                  >
                    <Star className={cn('h-4 w-4', img.is_featured && 'fill-current')} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(img.key)}
                    aria-label="Remove"
                    title="Remove"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-red-600 shadow hover:bg-white"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                {img.pair_key && (
                  <span className="absolute left-1 top-1 flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                    <Link2 className="h-3 w-3" aria-hidden /> Paired
                  </span>
                )}
              </div>

              <div role="radiogroup" aria-label={`Photo ${i + 1} stage`} className="grid grid-cols-3 gap-1">
                {IMAGE_CATEGORIES.map((cat) => {
                  const active = img.category === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => onChangeImage(img.key, { category: cat })}
                      className={cn(
                        'h-8 rounded border text-xs font-medium transition-colors',
                        active ? CATEGORY_ACTIVE[cat] : 'border-input bg-background text-foreground hover:bg-muted',
                      )}
                    >
                      {CATEGORY_LABEL[cat]}
                    </button>
                  );
                })}
              </div>

              <label className="block">
                <span className="sr-only">Alt text for photo {i + 1}</span>
                <Input
                  value={img.alt_text}
                  onChange={(e) => onChangeImage(img.key, { alt_text: e.target.value, altTouched: true })}
                  placeholder="Alt text"
                  className="h-8 text-xs"
                />
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
