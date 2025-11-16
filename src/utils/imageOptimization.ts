// Image optimization utilities for Next.js

export interface ImageSource {
  webp: string;
  fallback: string;
  width: number;
  height: number;
}

export const generateResponsiveImageSources = (
  baseSrc: string,
  sizes: number[] = [320, 640, 768, 1024, 1280, 1920]
): ImageSource[] => {
  const baseFileName = baseSrc.replace(/\.[^/.]+$/, '');
  const extension = baseSrc.split('.').pop();

  return sizes.map(size => ({
    webp: `${baseFileName}-${size}w.webp`,
    fallback: `${baseFileName}-${size}w.${extension}`,
    width: size,
    height: Math.round(size * 0.6) // Maintain aspect ratio
  }));
};

export const getOptimalImageSize = (containerWidth: number): number => {
  const sizes = [320, 640, 768, 1024, 1280, 1920];
  return sizes.find(size => size >= containerWidth) || sizes[sizes.length - 1];
};

export const preloadImage = (src: string, as: 'image' = 'image') => {
  if (typeof document === 'undefined') return;

  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = as;
  link.href = src;
  document.head.appendChild(link);
};

export const preloadCriticalImages = () => {
  if (typeof document === 'undefined') return;

  // Preload hero images and above-the-fold content
  const criticalImages = [
    '/assets/logo.png',
    '/assets/kitchen-project-1.jpg',
    '/assets/bathroom-project-1.jpg'
  ];

  criticalImages.forEach(src => {
    preloadImage(src);
  });
};

// Convert existing images to WebP programmatically (for development)
export const convertToWebP = async (file: File): Promise<string> => {
  if (typeof document === 'undefined') return '';

  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);

      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          resolve(url);
        }
      }, 'image/webp', 0.85);
    };

    img.src = URL.createObjectURL(file);
  });
};

// Next.js specific: Generate blur placeholder data URL
export const generateBlurDataURL = (width: number = 10, height: number = 10): string => {
  const shimmer = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g">
          <stop stop-color="#f0f0f0" offset="20%" />
          <stop stop-color="#e0e0e0" offset="50%" />
          <stop stop-color="#f0f0f0" offset="70%" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="#f0f0f0" />
      <rect id="r" width="${width}" height="${height}" fill="url(#g)" />
      <animate xlinkHref="#r" attributeName="x" from="-${width}" to="${width}" dur="1s" repeatCount="indefinite" />
    </svg>
  `;

  const toBase64 = (str: string) =>
    typeof window === 'undefined'
      ? Buffer.from(str).toString('base64')
      : window.btoa(str);

  return `data:image/svg+xml;base64,${toBase64(shimmer)}`;
};
