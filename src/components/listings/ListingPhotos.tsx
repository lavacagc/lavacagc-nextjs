'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { ArrowLeftRight } from 'lucide-react';
import BeforeAfterSlider from '@/components/BeforeAfterSlider';
import { sectionLabel } from '@/lib/listings/columns';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  type CarouselApi,
} from '@/components/ui/carousel';

export interface ListingRendering {
  section: string;
  before_url: string;
  after_url: string;
}

type GalleryItem =
  | { kind: 'photo'; src: string }
  | { kind: 'ba'; before: string; after: string; label: string };

/**
 * Listing gallery + full-screen lightbox ("shadowbox").
 *
 * The main photos and the AI before/after renderings live in ONE grid. A
 * before/after tile shows the remodeled "after" with a "Before / After" badge;
 * clicking it opens the draggable comparison slider inside the same shadowbox.
 * Plain photos open as standalone images. Clicking any tile starts the carousel
 * on that item; arrows / keyboard cycle through everything.
 *
 * Embla's drag-to-swipe is disabled (watchDrag: false) so it never fights the
 * slider's own horizontal drag — navigation is via the arrows and arrow keys.
 */
export default function ListingPhotos({
  photos,
  renderings = [],
  alt,
}: {
  photos: string[];
  renderings?: ListingRendering[];
  alt: string;
}) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(0);
  const [api, setApi] = useState<CarouselApi | null>(null);
  const [current, setCurrent] = useState(0);

  const items: GalleryItem[] = [
    ...photos.map((src): GalleryItem => ({ kind: 'photo', src })),
    ...renderings.map((r): GalleryItem => ({ kind: 'ba', before: r.before_url, after: r.after_url, label: sectionLabel(r.section) })),
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

  const tile =
    'relative aspect-[4/3] rounded-lg overflow-hidden bg-muted group cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-primary';
  const img = 'object-cover transition-transform duration-300 group-hover:scale-[1.03]';

  // Thumbnail content for one grid tile (photo, or a before/after showing "after").
  // Plain render helper (not a component) so it isn't re-created each render.
  const thumb = (item: GalleryItem, index: number) =>
    item.kind === 'photo' ? (
      <Image src={item.src} alt={`${alt} photo ${index + 1}`} fill unoptimized className={img} sizes="(max-width: 768px) 100vw, 33vw" />
    ) : (
      <>
        <Image src={item.after} alt={`${item.label} — remodeled`} fill unoptimized className={img} sizes="(max-width: 768px) 100vw, 33vw" />
        <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white">
          <ArrowLeftRight className="h-3 w-3" /> Before / After
        </span>
      </>
    );

  const rest = items.slice(3);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2" data-testid="listing-photo-grid">
        <button type="button" aria-label={`View photos of ${alt}`} onClick={() => openAt(0)} className={`md:col-span-2 ${tile}`}>
          {thumb(items[0], 0)}
        </button>

        <div className="grid grid-cols-2 md:grid-cols-1 gap-3">
          {items.slice(1, 3).map((item, i) => (
            <button key={i} type="button" aria-label={`View item ${i + 2} of ${alt}`} onClick={() => openAt(i + 1)} className={tile}>
              {thumb(item, i + 1)}
            </button>
          ))}
        </div>

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

      {renderings.length > 0 && (
        <p className="mb-8 text-xs text-text-muted">
          Tiles marked <span className="font-medium">Before / After</span> open a draggable slider — compare today&apos;s space with an
          AI-generated remodel at the same angle.
        </p>
      )}
      {renderings.length === 0 && <div className="mb-8" />}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-6xl w-[96vw] border-none bg-transparent p-0 shadow-none sm:rounded-none"
          data-testid="listing-lightbox"
        >
          <DialogTitle className="sr-only">Photos of {alt}</DialogTitle>
          <Carousel opts={{ startIndex: start, loop: items.length > 1, watchDrag: false }} setApi={setApi} className="w-full">
            <CarouselContent>
              {items.map((item, i) => (
                <CarouselItem key={i} className="flex items-center justify-center">
                  {item.kind === 'photo' ? (
                    <div className="relative w-full" style={{ height: '80vh' }}>
                      <Image src={item.src} alt={`${alt} photo ${i + 1}`} fill unoptimized className="object-contain" sizes="96vw" priority={i === start} />
                    </div>
                  ) : (
                    <div className="flex w-full flex-col items-center justify-center gap-3">
                      <div className="mx-auto w-full" style={{ maxWidth: 'min(92vw, 104vh)' }}>
                        <BeforeAfterSlider beforeImage={item.before} afterImage={item.after} />
                      </div>
                      <p className="text-sm text-white/85">
                        {item.label} — AI-generated remodel · drag to compare
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
