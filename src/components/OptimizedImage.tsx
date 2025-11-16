'use client'

import React, { useState, useRef, useEffect } from 'react';

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  loading?: 'lazy' | 'eager';
  priority?: boolean;
  sizes?: string;
}

const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  className = '',
  width,
  height,
  loading = 'lazy',
  priority = false,
  sizes = '100vw'
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority || loading === 'eager');
  const imgRef = useRef<HTMLDivElement>(null);

  // Generate WebP and fallback sources
  const getImageSources = (src: string) => {
    const baseName = src.replace(/\.[^/.]+$/, '');
    const extension = src.split('.').pop();

    return {
      webp: `${baseName}.webp`,
      fallback: src,
      originalExt: extension
    };
  };

  const { webp, fallback } = getImageSources(src);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (priority || loading === 'eager') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: '50px'
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [priority, loading]);

  const handleLoad = () => {
    setIsLoaded(true);
  };

  const imageStyles = `
    ${className}
    ${!isLoaded ? 'opacity-0' : 'opacity-100'}
    transition-opacity duration-300 ease-in-out
  `;

  return (
    <div className="relative overflow-hidden" ref={imgRef}>
      {/* Placeholder */}
      {!isLoaded && (
        <div
          className={`absolute inset-0 bg-muted animate-pulse ${className}`}
          style={{ width, height }}
        />
      )}

      {isInView && (
        <picture>
          <source
            srcSet={webp}
            type="image/webp"
            sizes={sizes}
          />
          <img
            src={fallback}
            alt={alt}
            className={imageStyles}
            width={width}
            height={height}
            loading={loading}
            onLoad={handleLoad}
            decoding="async"
          />
        </picture>
      )}
    </div>
  );
};

export default OptimizedImage;
