'use client';

import NextImage from 'next/image';
import { cn } from '@/lib/utils';

/**
 * A thumbnail that works for every URL the project flow handles.
 *
 * next/image only accepts the production storage host (next.config.ts
 * remotePatterns); a blob: preview, or a local replay's http://127.0.0.1
 * storage URL, would throw. Those render as a plain <img>; everything on an
 * https Supabase host gets the optimized, resized version, so a grid of 4 MB
 * originals does not download 4 MB each.
 */
const OPTIMIZABLE_PREFIX = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  return url.startsWith('https://') ? `${url.replace(/\/+$/, '')}/storage/v1/object/` : null;
})();

interface MediaThumbProps {
  src: string;
  alt: string;
  mediaType?: string | null;
  sizes?: string;
  className?: string;
}

export function MediaThumb({ src, alt, mediaType, sizes = '200px', className }: MediaThumbProps) {
  if (!src) return <div className={cn('h-full w-full bg-muted', className)} />;
  if (mediaType === 'video' || /\.(mp4|m4v|mov|webm)(\?|$)/i.test(src)) {
    return (
      <video
        src={src}
        className={cn('absolute inset-0 h-full w-full object-cover', className)}
        muted
        playsInline
        preload="metadata"
        aria-label={alt}
      />
    );
  }
  if (OPTIMIZABLE_PREFIX && src.startsWith(OPTIMIZABLE_PREFIX)) {
    return <NextImage src={src} alt={alt} fill sizes={sizes} className={cn('object-cover', className)} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- blob: previews and non-production storage hosts cannot go through next/image
    <img src={src} alt={alt} loading="lazy" className={cn('absolute inset-0 h-full w-full object-cover', className)} />
  );
}
