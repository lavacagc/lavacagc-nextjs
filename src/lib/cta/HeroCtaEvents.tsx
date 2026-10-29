'use client';

/**
 * View and click events for the hero CTA pair. Owns no rendering decisions:
 * the variant was chosen before paint by the inline script, which left it on
 * <html> as data-cta-p / data-cta-s. This only reports it.
 *
 * The visitor id is NOT handled here. Middleware issues it as a signed,
 * httpOnly `cta_vid` cookie with the first homepage response (and
 * /api/cta/event mints one if that somehow did not happen), so every beacon
 * already carries the same id and they are sent independently. A click
 * therefore never waits on a view's round trip, which is what used to lose
 * clicks on slow connections; the route records a missing view alongside the
 * click.
 *
 * Self-healing: if the server render of the page failed and React rendered it
 * on the client, the inline script was inserted by React and never executed,
 * so <html> carries no assignment. The same bootstrap then runs here on mount
 * (seen in dev under load, when Testimonials intermittently fails to render on
 * the server). Without this, such a visitor would see the first variant and
 * send nothing.
 */
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { ctaIndex } from './assign';
import { ctaBootstrap, type CtaBootstrapConfig } from './bootstrap';
import type { CtaButton } from './types';

type EventType = 'view' | 'click';

function assigned(button: CtaButton): string | null {
  return document.documentElement.getAttribute(button === 'primary' ? 'data-cta-p' : 'data-cta-s');
}

function canStore(): boolean {
  return document.documentElement.getAttribute('data-cta-ok') === '1';
}

export function HeroCtaEvents({ className, config, children }: { className?: string; config: CtaBootstrapConfig; children: ReactNode }) {
  // Refs survive React's dev-only double effect run: one load, one view each.
  const viewsSent = useRef(false);
  const clicksSent = useRef(new Set<CtaButton>());

  const send = useCallback((button: CtaButton, eventType: EventType) => {
    const key = assigned(button);
    if (!key || !canStore()) return;
    fetch('/api/cta/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ button, variant_key: key, event_type: eventType }),
      // Survives the navigation a click starts.
      keepalive: true,
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (!root.hasAttribute('data-cta-p') && !root.hasAttribute('data-cta-s')) ctaBootstrap(config, ctaIndex);
  }, [config]);

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
