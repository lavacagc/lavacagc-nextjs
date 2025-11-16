'use client'

import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi
} from "@/components/ui/carousel";
import MobileSwipeGallery from "./MobileSwipeGallery";

interface ProjectImage {
  url: string;
  caption?: string;
  media_type?: 'image' | 'video';
}

interface ProjectImageGalleryProps {
  images?: { before: string; after: string; caption: string }[] | ProjectImage[];
  title?: string;
}

const ProjectImageGallery = ({ images = [], title }: ProjectImageGalleryProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [api, setApi] = useState<CarouselApi>();
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [galleryStartIndex, setGalleryStartIndex] = useState(0);

  useEffect(() => {
    if (!api) return;

    api.on("select", () => {
      setCurrentIndex(api.selectedScrollSnap());
    });
  }, [api]);

  // Convert images to gallery format
  const galleryImages = images.map((image) => {
    if ('before' in image) {
      return { url: image.before, caption: image.caption };
    }
    return { url: image.url, caption: image.caption };
  });

  const openGallery = (index: number) => {
    setGalleryStartIndex(index);
    setIsGalleryOpen(true);
  };

  if (images.length === 0) return null;

  const currentImage = images[currentIndex];
  const isLegacyImage = 'before' in currentImage;

  return (
    <>
      <div className="space-y-6">
        {title && (
          <h3 className="text-2xl font-bold text-text-primary text-center">{title}</h3>
        )}

        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <Carousel
              setApi={setApi}
              className="w-full touch-pan-y"
              opts={{
                align: "start",
                loop: true,
                dragFree: false,
                watchDrag: true,
                containScroll: "trimSnaps",
              }}
            >
              <CarouselContent>
                {images.map((image, index) => {
                  const isLegacy = 'before' in image;
                  return (
                    <CarouselItem key={index}>
                      <div
                        className="relative aspect-video bg-gray-100 overflow-hidden select-none cursor-pointer"
                        onClick={() => openGallery(index)}
                      >
                        {isLegacy ? (
                          // Legacy before/after image support
                          <img
                            src={image.before}
                            alt={image.caption || 'Home renovation project before and after transformation by La Vaca General Contractors'}
                            className="w-full h-full object-cover pointer-events-none"
                            draggable="false"
                          />
                        ) : image.media_type === 'video' ? (
                          // Video support with autoplay muted
                          <video
                            src={image.url}
                            className="w-full h-full object-cover pointer-events-none"
                            autoPlay
                            muted
                            loop
                            playsInline
                          />
                        ) : (
                          // New multi-image support with aspect ratio handling
                          <div className="relative w-full h-full">
                            {/* Blurred background */}
                            <div
                              className="absolute inset-0 scale-110 blur-md opacity-50 pointer-events-none"
                              style={{
                                backgroundImage: `url(${image.url})`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                                filter: 'blur(20px)',
                              }}
                            />

                            {/* Main centered image */}
                            <div className="absolute inset-0 flex items-center justify-center">
                              <img
                                src={image.url}
                                alt={image.caption || 'Professional home renovation and remodeling project by La Vaca General Contractors Northern NJ'}
                                className="max-w-full max-h-full object-contain pointer-events-none"
                                style={{ zIndex: 1 }}
                                draggable="false"
                              />
                            </div>
                          </div>
                        )}

                        {/* Click to expand hint */}
                        <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors flex items-center justify-center">
                          <span className="opacity-0 hover:opacity-100 transition-opacity text-white bg-black/70 px-4 py-2 rounded-lg text-sm font-medium">
                            Tap to expand
                          </span>
                        </div>
                      </div>

                      {/* Image Caption */}
                      {image.caption && (
                        <div className="p-4 bg-card">
                          <p className="text-center text-text-secondary">{image.caption}</p>
                        </div>
                      )}
                    </CarouselItem>
                  );
                })}
              </CarouselContent>

              {/* Navigation Arrows - visible on all devices */}
              {images.length > 1 && (
                <>
                  <CarouselPrevious className="left-2 md:left-4 h-10 w-10 md:h-12 md:w-12 bg-black/80 hover:bg-black text-white border-2 border-white shadow-2xl" />
                  <CarouselNext className="right-2 md:right-4 h-10 w-10 md:h-12 md:w-12 bg-black/80 hover:bg-black text-white border-2 border-white shadow-2xl" />
                </>
              )}

              {/* Image counter */}
              {images.length > 1 && (
                <div className="absolute bottom-4 right-4 bg-black/70 text-white px-3 py-1 rounded-full text-sm font-medium z-10">
                  {currentIndex + 1} / {images.length}
                </div>
              )}
            </Carousel>
          </CardContent>
        </Card>

        {/* Thumbnail Navigation */}
        {images.length > 1 && (
          <div className="flex justify-center gap-2 flex-wrap">
            {images.map((_, index) => (
              <button
                key={index}
                onClick={() => api?.scrollTo(index)}
                className={`w-3 h-3 rounded-full transition-all ${
                  index === currentIndex
                    ? 'bg-primary'
                    : 'bg-gray-300 hover:bg-gray-400'
                }`}
              />
            ))}
          </div>
        )}

        {/* Instructions */}
        {images.length > 1 && (
          <div className="text-center text-sm text-text-secondary">
            <p className="hidden md:block">Use arrows or dots to navigate - Click image to expand</p>
            <p className="md:hidden">Swipe or tap dots to navigate - Tap image to expand</p>
          </div>
        )}
      </div>

      {/* Full-screen mobile swipe gallery */}
      <MobileSwipeGallery
        images={galleryImages}
        isOpen={isGalleryOpen}
        initialIndex={galleryStartIndex}
        onClose={() => setIsGalleryOpen(false)}
      />
    </>
  );
};

export default ProjectImageGallery;
