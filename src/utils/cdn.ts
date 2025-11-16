// CDN configuration and utilities for Next.js

export const CDN_BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://cdn.lavacagc.com'
  : '';

export const optimizeImageUrl = (
  src: string,
  width?: number,
  height?: number,
  format: 'webp' | 'jpeg' | 'png' = 'webp',
  quality = 85
): string => {
  if (!CDN_BASE_URL) return src;

  const params = new URLSearchParams();
  if (width) params.set('w', width.toString());
  if (height) params.set('h', height.toString());
  params.set('f', format);
  params.set('q', quality.toString());

  return `${CDN_BASE_URL}${src}?${params.toString()}`;
};

export const generateImageSrcSet = (
  src: string,
  sizes = [320, 640, 768, 1024, 1280, 1920],
  format: 'webp' | 'jpeg' = 'webp'
): string => {
  return sizes
    .map(size => `${optimizeImageUrl(src, size, undefined, format)} ${size}w`)
    .join(', ');
};

export const preloadCriticalAssets = () => {
  if (typeof document === 'undefined') return;

  const criticalAssets = [
    '/src/assets/logo.webp',
    '/src/assets/kitchen-project-1.webp',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
  ];

  criticalAssets.forEach(asset => {
    const link = document.createElement('link');
    link.rel = 'preload';

    if (asset.includes('.webp')) {
      link.as = 'image';
      link.type = 'image/webp';
    } else if (asset.includes('fonts.googleapis.com')) {
      link.as = 'style';
      link.crossOrigin = 'anonymous';
    }

    link.href = asset;
    document.head.appendChild(link);
  });
};

// Resource prioritization
export const addResourceHints = () => {
  if (typeof document === 'undefined') return;

  const hints = [
    { rel: 'dns-prefetch', href: '//fonts.googleapis.com', crossOrigin: false },
    { rel: 'dns-prefetch', href: '//fonts.gstatic.com', crossOrigin: false },
    { rel: 'preconnect', href: 'https://fonts.googleapis.com', crossOrigin: true },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: true }
  ];

  hints.forEach(hint => {
    const link = document.createElement('link');
    link.rel = hint.rel;
    link.href = hint.href;
    if (hint.crossOrigin) {
      link.crossOrigin = 'anonymous';
    }
    document.head.appendChild(link);
  });
};
