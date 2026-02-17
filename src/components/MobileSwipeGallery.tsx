'use client'

import React, { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { X } from "lucide-react";

interface GalleryImage {
  url: string;
  caption?: string;
  media_type?: 'image' | 'video';
}

interface MobileSwipeGalleryProps {
  images: GalleryImage[];
  isOpen: boolean;
  initialIndex: number;
  onClose: () => void;
}

const MobileSwipeGallery = ({ images, isOpen, initialIndex, onClose }: MobileSwipeGalleryProps) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [translateX, setTranslateX] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    }

    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, [isOpen]);

  const handleNext = useCallback(() => {
    if (currentIndex < images.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex, images.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex]);

  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowLeft':
          handlePrev();
          break;
        case 'ArrowRight':
          handleNext();
          break;
        case 'Escape':
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyboard);
    return () => document.removeEventListener('keydown', handleKeyboard);
  }, [isOpen, currentIndex, onClose, handleNext, handlePrev]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartX(e.touches[0].clientX);
    setStartY(e.touches[0].clientY);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - startX;
    const diffY = currentY - startY;

    if (Math.abs(diffX) > Math.abs(diffY)) {
      e.preventDefault();
      setTranslateX(diffX);
    } else if (diffY > 100) {
      onClose();
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;

    const threshold = 50;

    if (translateX > threshold) {
      handlePrev();
    } else if (translateX < -threshold) {
      handleNext();
    }

    setTranslateX(0);
    setIsDragging(false);
  };

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/95 flex flex-col">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 flex justify-between items-center p-4 md:p-6 z-10 bg-gradient-to-b from-black/70 to-transparent">
        <button
          onClick={onClose}
          className="text-white hover:bg-white/10 rounded-full p-2 transition-colors"
          aria-label="Close gallery"
        >
          <X className="w-6 h-6 md:w-8 md:h-8" />
        </button>
        <span className="text-white text-base md:text-lg font-medium">
          {currentIndex + 1} / {images.length}
        </span>
      </div>

      {/* Gallery Track */}
      <div
        className="flex-1 relative overflow-hidden flex items-center justify-center touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          ref={trackRef}
          className="flex h-full transition-transform duration-300 ease-out"
          style={{
            transform: `translateX(calc(-${currentIndex * 100}vw + ${isDragging ? translateX : 0}px))`,
            transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          }}
        >
          {images.map((image, index) => (
            <div
              key={index}
              className="flex-shrink-0 w-screen h-full relative px-4 md:px-8 py-16 md:py-20 box-border"
            >
              {image.media_type === 'video' ? (
                <video
                  src={image.url}
                  className="max-w-full max-h-full object-contain select-none absolute inset-0 m-auto"
                  autoPlay
                  muted
                  loop
                  playsInline
                  controls
                />
              ) : (
                <Image
                  src={image.url}
                  alt={image.caption || `Project image ${index + 1}`}
                  className="object-contain select-none pointer-events-none"
                  fill
                  sizes="100vw"
                  draggable={false}
                  unoptimized
                />
              )}
            </div>
          ))}
        </div>

        {/* Navigation Arrows - Desktop */}
        {images.length > 1 && (
          <>
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 items-center justify-center bg-white/20 hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full transition-all z-10"
              aria-label="Previous image"
            >
              &#8249;
            </button>
            <button
              onClick={handleNext}
              disabled={currentIndex === images.length - 1}
              className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 items-center justify-center bg-white/20 hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full transition-all z-10"
              aria-label="Next image"
            >
              &#8250;
            </button>
          </>
        )}
      </div>

      {/* Caption */}
      {images[currentIndex]?.caption && (
        <div className="absolute bottom-20 md:bottom-24 left-0 right-0 px-6 text-center">
          <p className="text-white text-sm md:text-base bg-black/50 rounded-lg px-4 py-2 inline-block">
            {images[currentIndex].caption}
          </p>
        </div>
      )}

      {/* Indicators */}
      {images.length > 1 && (
        <div className="absolute bottom-6 md:bottom-8 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {images.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className="p-3 transition-all"
              aria-label={`Go to image ${index + 1}`}
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              <span className={`block transition-all ${
                index === currentIndex
                  ? 'w-6 h-2 bg-white rounded-full'
                  : 'w-2 h-2 bg-white/40 hover:bg-white/60 rounded-full'
              }`} />
            </button>
          ))}
        </div>
      )}

      {/* Swipe hint for mobile */}
      <div className="md:hidden absolute bottom-16 left-0 right-0 text-center">
        <p className="text-white/60 text-xs">Swipe left or right - Swipe down to close</p>
      </div>
    </div>
  );
};

export default MobileSwipeGallery;
