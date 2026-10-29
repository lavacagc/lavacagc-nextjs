'use client';

/**
 * View and click events for the hero CTA pair. Owns no rendering decisions:
 * the variant was chosen before paint by the inline script, which left it on
 * <html> as data-cta-p / data-cta-s. This only reports it.
 *
 * The visitor id is NOT handled here. /api/cta/event mints it as a signed,
 * httpOnly `cta_vid` cookie on the first event. Events are therefore sent one
 * after another: if a first-time visitor's two views went out in parallel,
 * each would mint its own id and the click that follows would not find its
 * view under the id that stuck.
 */
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { CtaButton } from './types';

type EventType = 'view' | 'click';

function assigned(button: CtaButton): string | null {
  return document.documentElement.getAttribute(button === 'primary' ? 'data-cta-p' : 'data-cta-s');
}

function canStore(): boolean {
  return document.documentElement.getAttribute('data-cta-ok') === '1';
}

export function HeroCtaEvents({ className, children }: { className?: string; children: ReactNode }) {
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  // Refs survive React's dev-only double effect run: one load, one view each.
  const viewsSent = useRef(false);
  const clicksSent = useRef(new Set<CtaButton>());

  const send = useCallback((button: CtaButton, eventType: EventType) => {
    const key = assigned(button);
    if (!key || !canStore()) return;
    queue.current = queue.current
      .then(() =>
        fetch('/api/cta/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ button, variant_key: key, event_type: eventType }),
          // Survives the navigation a click starts.
          keepalive: true,
        }),
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (viewsSent.current) return;
    viewsSent.current = true;
    send('primary', 'view');
    send('secondary', 'view');
  }, [send]);

  const onActivate = useCallback(
    (target: EventTarget | null) => {
      const link = target instanceof Element ? target.closest('a[data-cta-button]') : null;
      const button = link?.getAttribute('data-cta-button');
      if (button !== 'primary' && button !== 'secondary') return;
      if (clicksSent.current.has(button)) return;
      clicksSent.current.add(button);
      send(button, 'click');
    },
    [send],
  );

  return (
    <div
      className={className}
      onPointerDown={(e) => onActivate(e.target)}
      // Keyboard activation (Enter on a link) fires click without pointerdown.
      onClick={(e) => onActivate(e.target)}
    >
      {children}
    </div>
  );
}
