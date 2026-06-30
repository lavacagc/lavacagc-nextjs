'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { ArrowLeftRight } from 'lucide-react';
import BeforeAfterSlider from '@/components/BeforeAfterSlider';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  type CarouselApi,
} from '@/components/ui/carousel';

export interface BeforeAfterPair {
  before: string;
  after: string;
  label?: string;
}

/** A plain media item: a URL string (image) or an object that can flag a video. */
export type PhotoInput = string | { src: string; kind?: 'image' | 'video' };

type Photo = { src: string; isVideo: boolean };

type GalleryItem =
  | { kind: 'photo'; src: string; isVideo: boolean }
  | { kind: 'ba'; before: string; after: string; label: string };

function normalizePhoto(p: PhotoInput): Photo {
  if (typeof p === 'string') return { src: p, isVideo: false };
  return { src: p.src, isVideo: p.kind === 'video' };
}

/**
 * Shared photo gallery + full-screen lightbox ("shadowbox").
 *
 * Plain photos (or videos) and before/after pairs live in ONE grid. A
 * before/after tile shows the "after" image with a "Before / After" badge;
 * clicking it opens a draggable comparison slider inside the same shadowbox.
 * Plain media open standalone. Clicking any tile starts the carousel on that
 * item; arrows and the arrow keys cycle through everything.
 *
 * Embla's drag-to-swipe is disabled (watchDrag: false) so it never fights the
 * slider's own horizontal drag — navigation is via the arrows and arrow keys.
 *
 * Used by both the Buy + Remodel listings (AI renderings, aiNote) and the real
 * Projects/portfolio (real before/after photos, no AI note).
 */
export default function PhotoGallery({
  photos,
  beforeAfters = [],
  alt,
  aiNote = false,
  testIdPrefix = 'listing',
}: {
  photos: PhotoInput[];
  beforeAfters?: BeforeAfterPair[];
  alt: string;
  /** When true, before/after captions mention the AI-generated remodel (listings). */
  aiNote?: boolean;
  /** Prefix for the grid + lightbox data-testids (e.g. "listing", "project"). */
  testIdPrefix?: string;
}) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(0);
  const [api, setApi] = useState<CarouselApi | null>(null);
  const [current, setCurrent] = useState(0);

  const items: GalleryItem[] = [
    ...photos.map(normalizePhoto).map((p): GalleryItem => ({ kind: 'photo', src: p.src, isVideo: p.isVideo })),
    ...beforeAfters.map((b): GalleryItem => ({ kind: 'ba', before: b.before, after: b.after, label: b.label || 'Before / After' })),
  ];

  const openAt = (i: number) => {
    setStart(i);
    setCurrent(i);
    setOpen(true);
  };

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    api.on('select', onSelect);
    onSelect();
    return () => {
      api.off('select', onSelect);
    };
  }, [api]);

  if (items.length === 0) return null;

  const hasBa = beforeAfters.length > 0;

  const tile =
    'relative aspect-[4/3] rounded-lg overflow-hidden bg-muted group cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-primary';
  const imgCls = 'object-cover transition-transform duration-300 group-hover:scale-[1.03]';

  // Thumbnail content for one grid tile (photo/video, or a before/after showing "after").
  // Plain render helper (not a component) so it isn't re-created each render.
  const thumb = (item: GalleryItem, index: number) => {
    if (item.kind === 'photo') {
      return item.isVideo ? (
        <video src={item.src} className={`absolute inset-0 h-full w-full ${imgCls}`} muted loop playsInline />
      ) : (
        <Image src={item.src} alt={`${alt} photo ${index + 1}`} fill unoptimized className={imgCls} sizes="(max-width: 768px) 100vw, 33vw" />
      );
    }
    return (
      <>
        <Image src={item.after} alt={`${item.label} — after`} fill unoptimized className={imgCls} sizes="(max-width: 768px) 100vw, 33vw" />
        <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white">
          <ArrowLeftRight className="h-3 w-3" /> Before / After
        </span>
      </>
    );
  };

  const rest = items.slice(3);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2" data-testid={`${testIdPrefix}-photo-grid`}>
        <button type="button" aria-label={`View photos of ${alt}`} onClick={() => openAt(0)} className={`md:col-span-2 ${tile}`}>
          {thumb(items[0], 0)}
        </button>

        {items.length > 1 && (
          <div className="grid grid-cols-2 md:grid-cols-1 gap-3">
            {items.slice(1, 3).map((item, i) => (
              <button key={i} type="button" aria-label={`View item ${i + 2} of ${alt}`} onClick={() => openAt(i + 1)} className={tile}>
                {thumb(item, i + 1)}
              </button>
            ))}
          </div>
        )}

        {rest.length > 0 && (
          <div className="md:col-span-3 grid grid-cols-3 md:grid-cols-6 gap-3">
            {rest.map((item, i) => (
              <button key={i} type="button" aria-label={`View item ${i + 4} of ${alt}`} onClick={() => openAt(i + 3)} className={tile}>
                {thumb(item, i + 3)}
              </button>
            ))}
          </div>
        )}
      </div>

      {hasBa ? (
        <p className="mb-8 text-xs text-text-muted">
          Tiles marked <span className="font-medium">Before / After</span> open a draggable slider
          {aiNote ? ' — compare today’s space with an AI-generated remodel at the same angle.' : ' — drag to compare the space before and after.'}
        </p>
      ) : (
        <div className="mb-8" />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-6xl w-[96vw] border-none bg-transparent p-0 shadow-none sm:rounded-none"
          data-testid={`${testIdPrefix}-lightbox`}
        >
          <DialogTitle className="sr-only">Photos of {alt}</DialogTitle>
          <Carousel opts={{ startIndex: start, loop: items.length > 1, watchDrag: false }} setApi={setApi} className="w-full">
            <CarouselContent>
              {items.map((item, i) => (
                <CarouselItem key={i} className="flex items-center justify-center">
                  {item.kind === 'photo' ? (
                    <div className="relative w-full flex items-center justify-center" style={{ height: '80vh' }}>
                      {item.isVideo ? (
                        <video src={item.src} className="max-h-full max-w-full object-contain" controls autoPlay muted loop playsInline />
                      ) : (
                        <Image src={item.src} alt={`${alt} photo ${i + 1}`} fill unoptimized className="object-contain" sizes="96vw" priority={i === start} />
                      )}
                    </div>
                  ) : (
                    <div className="flex w-full flex-col items-center justify-center gap-3">
                      <div className="mx-auto w-full" style={{ maxWidth: 'min(92vw, 104vh)' }}>
                        <BeforeAfterSlider beforeImage={item.before} afterImage={item.after} />
                      </div>
                      <p className="text-sm text-white/85">
                        {aiNote ? `${item.label} — AI-generated remodel · drag to compare` : `${item.label} · drag to compare`}
                      </p>
                    </div>
                  )}
                </CarouselItem>
              ))}
            </CarouselContent>
            {items.length > 1 && (
              <>
                <CarouselPrevious className="left-2 sm:left-4 text-text-primary" />
                <CarouselNext className="right-2 sm:right-4 text-text-primary" />
              </>
            )}
          </Carousel>
          {items.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm font-medium text-white">
              {current + 1} / {items.length}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
