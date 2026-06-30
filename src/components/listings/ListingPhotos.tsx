'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  type CarouselApi,
} from '@/components/ui/carousel';

/**
 * Listing photo grid that opens a full-screen lightbox ("shadowbox") carousel
 * when any photo is clicked. Cycles through every photo with arrows / swipe /
 * keyboard, starting on the one the visitor clicked.
 *
 * Renders the same responsive grid the detail page used before (hero + two
 * stacked + thumbnail row), but each tile is now a button.
 */
export default function ListingPhotos({ photos, alt }: { photos: string[]; alt: string }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(0);
  const [api, setApi] = useState<CarouselApi | null>(null);
  const [current, setCurrent] = useState(0);

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

  if (photos.length === 0) return null;

  const tile =
    'relative aspect-[4/3] rounded-lg overflow-hidden bg-muted group cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-primary';
  const img =
    'object-cover transition-transform duration-300 group-hover:scale-[1.03]';

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8" data-testid="listing-photo-grid">
        <button type="button" aria-label={`View photos of ${alt}`} onClick={() => openAt(0)} className={`md:col-span-2 ${tile}`}>
          <Image src={photos[0]} alt={`${alt}`} fill unoptimized className={img} sizes="(max-width: 768px) 100vw, 66vw" />
        </button>

        <div className="grid grid-cols-2 md:grid-cols-1 gap-3">
          {photos.slice(1, 3).map((p, i) => (
            <button key={i} type="button" aria-label={`View photo ${i + 2} of ${alt}`} onClick={() => openAt(i + 1)} className={tile}>
              <Image src={p} alt={`${alt} photo ${i + 2}`} fill unoptimized className={img} sizes="33vw" />
            </button>
          ))}
        </div>

        {photos.length > 3 && (
          <div className="md:col-span-3 grid grid-cols-3 md:grid-cols-6 gap-3">
            {photos.slice(3).map((p, i) => (
              <button key={i} type="button" aria-label={`View photo ${i + 4} of ${alt}`} onClick={() => openAt(i + 3)} className={tile}>
                <Image src={p} alt={`${alt} photo ${i + 4}`} fill unoptimized className={img} sizes="16vw" />
              </button>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-6xl w-[96vw] border-none bg-transparent p-0 shadow-none sm:rounded-none"
          data-testid="listing-lightbox"
        >
          <DialogTitle className="sr-only">Photos of {alt}</DialogTitle>
          <Carousel opts={{ startIndex: start, loop: photos.length > 1 }} setApi={setApi} className="w-full">
            <CarouselContent>
              {photos.map((p, i) => (
                <CarouselItem key={i} className="flex items-center justify-center">
                  <div className="relative w-full" style={{ height: '80vh' }}>
                    <Image src={p} alt={`${alt} photo ${i + 1}`} fill unoptimized className="object-contain" sizes="96vw" priority={i === start} />
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            {photos.length > 1 && (
              <>
                <CarouselPrevious className="left-2 sm:left-4 text-text-primary" />
                <CarouselNext className="right-2 sm:right-4 text-text-primary" />
              </>
            )}
          </Carousel>
          {photos.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm font-medium text-white">
              {current + 1} / {photos.length}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
