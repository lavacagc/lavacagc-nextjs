'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A project video that only costs something when it is actually on screen.
 *
 * MEASURED, 1 September 2026, production: /portfolio took 10.4 SECONDS to
 * finish loading - the slowest page on the site, and the one whose whole job is
 * showing off the work. The browser was offered about 124 MB of video across
 * twenty-four responses. The three source files behind it declare 22 MB, 21 MB
 * and 15 MB: uncompressed QuickTime straight off a camera.
 *
 * There were two separate causes, in two different components:
 *
 *   PortfolioContent - the page actually measured - rendered a plain
 *   `<video autoPlay loop>` with no lazy loading, no poster and NO preload
 *   attribute. The default is `auto`, so every video began downloading in full
 *   the moment the page loaded, whether or not it was anywhere near the screen.
 *
 *   ProjectGallery mounted its videos on scroll, but then called
 *   observer.disconnect() on the first intersection, so it stopped tracking
 *   visibility forever. With autoPlay + loop, every card ever scrolled past
 *   kept decoding and re-requesting for the life of the page.
 *
 * Both are the same bug wearing different clothes, which is why this now exists
 * once and both use it: mount near the viewport, PLAY when visible, PAUSE when
 * not, and show a still the rest of the time.
 *
 * The poster is a photograph the project already has, so this costs no new
 * storage and no upload - and it is what lets `preload="none"` be safe. Without
 * a poster there would be nothing to look at, so a project with no still falls
 * back to fetching metadata.
 *
 * This does NOT fix the file sizes. Transcoding rewrites objects in production
 * storage and is deliberately a separate, reviewable job - see
 * docs/perf/portfolio-video.md.
 */
export function LazyProjectVideo({
  src,
  title,
  poster,
  className = '',
}: {
  src: string;
  title: string;
  poster?: string;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setMounted(true);

        const video = videoRef.current;
        if (!video) return;
        if (entry.isIntersecting) {
          // play() returns a promise that rejects if the element is removed or
          // the browser refuses autoplay. Neither is worth a console error on a
          // page that is otherwise working.
          void video.play().catch(() => {});
        } else if (!video.paused) {
          video.pause();
        }
      },
      { rootMargin: '100px', threshold: 0.1 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className={className || 'h-full w-full bg-muted'} data-testid="lazy-project-video">
      {mounted && (
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          muted
          loop
          playsInline
          // Deliberately NO autoPlay - the observer owns starting and stopping,
          // so playback is decided in one place instead of split between the
          // browser and us.
          preload={poster ? 'none' : 'metadata'}
          aria-label={`Project video for ${title}`}
        />
      )}
    </div>
  );
}
