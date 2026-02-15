'use client'

import React, { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";

interface BeforeAfterImage {
  before: string;
  after: string;
  caption: string;
}

interface BeforeAfterGalleryProps {
  images: BeforeAfterImage[];
  title?: string;
}

const BeforeAfterGallery = ({ images, title }: BeforeAfterGalleryProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAfter, setShowAfter] = useState(false);

  const nextImage = () => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
    setShowAfter(false);
  };

  const prevImage = () => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
    setShowAfter(false);
  };

  if (!images.length) return null;

  const currentImage = images[currentIndex];

  return (
    <div className="space-y-6">
      {title && (
        <h3 className="text-2xl font-bold text-text-primary text-center">{title}</h3>
      )}

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {/* Main Image Display */}
          <div className="relative aspect-video bg-gray-100">
            <Image
              src={showAfter ? currentImage.after : currentImage.before}
              alt={`${showAfter ? 'After' : 'Before'} - ${currentImage.caption}`}
              className="w-full h-full object-cover transition-all duration-500"
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
            />

            {/* Before/After Toggle */}
            <div className="absolute top-4 left-4">
              <div className="bg-black/70 text-white px-3 py-1 rounded-full text-sm font-medium">
                {showAfter ? 'After' : 'Before'}
              </div>
            </div>

            {/* View Toggle Button */}
            <Button
              onClick={() => setShowAfter(!showAfter)}
              className="absolute top-4 right-4 bg-white/90 text-text-primary hover:bg-white"
              size="sm"
            >
              <Eye className="h-4 w-4 mr-2" />
              {showAfter ? 'Show Before' : 'Show After'}
            </Button>

            {/* Navigation Arrows */}
            {images.length > 1 && (
              <>
                <Button
                  onClick={prevImage}
                  variant="ghost"
                  size="sm"
                  className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  onClick={nextImage}
                  variant="ghost"
                  size="sm"
                  className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>

          {/* Image Caption */}
          <div className="p-4 bg-card">
            <p className="text-center text-text-secondary">{currentImage.caption}</p>
          </div>
        </CardContent>
      </Card>

      {/* Thumbnail Navigation */}
      {images.length > 1 && (
        <div className="flex justify-center gap-2 flex-wrap">
          {images.map((_, index) => (
            <button
              key={index}
              onClick={() => {
                setCurrentIndex(index);
                setShowAfter(false);
              }}
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
      <div className="text-center text-sm text-text-secondary">
        <p>Click &quot;Show After&quot; to see the transformation</p>
        {images.length > 1 && (
          <p className="mt-1">Use arrows or dots to navigate between images</p>
        )}
      </div>
    </div>
  );
};

export default BeforeAfterGallery;
