'use client';

/**
 * Browser half of the hero CTA test: visitor id, sticky assignment, events.
 *
 * Hydration: the first render (server and client alike) shows the FIRST active
 * variant of each button, so the markup always matches and the links are
 * crawlable without JavaScript. The visitor's own variant is applied right
 * after hydration through useSyncExternalStore's server/client snapshots. Reading the cookie on the server instead would make the
 * homepage dynamic, which it must not be.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { parseAssignmentCookie, resolveVariant, serializeAssignmentCookie, isUuidV4 } from './assign';
import {
  CTA_ASSIGN_COOKIE,
  CTA_COOKIE_MAX_AGE,
  CTA_VID_COOKIE,
  type CtaButton,
  type CtaVariant,
  type HeroCtaVariants,
} from './types';

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) return trimmed.slice(prefix.length);
  }
  return null;
}

function writeCookie(name: string, value: string): void {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${value}; Max-Age=${CTA_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
}

/** crypto.randomUUID only exists in secure contexts; plain-http LAN testing has getRandomValues. */
function uuidV4(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * The visitor id, created if absent. null when it cannot be stored (cookies
 * blocked): such a visitor sees the first variant and sends no events, since an
 * id that changes on every load would count one person many times.
 */
function ensureVisitorId(): string | null {
  try {
    const existing = readCookie(CTA_VID_COOKIE);
    if (isUuidV4(existing)) return existing;
    const fresh = uuidV4();
    writeCookie(CTA_VID_COOKIE, fresh);
    return readCookie(CTA_VID_COOKIE) === fresh ? fresh : null;
  } catch {
    return null;
  }
}

function sendEvent(button: CtaButton, variant: CtaVariant, eventType: 'view' | 'click', visitorId: string): void {
  try {
    void fetch('/api/cta/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ button, variant_key: variant.variant_key, event_type: eventType, visitor_id: visitorId }),
      // Survives the navigation a click starts.
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Analytics must never break the page.
  }
}

export interface HeroCtaAssignment {
  primary: CtaVariant;
  secondary: CtaVariant;
  /** True once the visitor's own variant is applied (after hydration). */
  ready: boolean;
  /** null on the server, and when the id cannot be stored. */
  visitorId: string | null;
}

export interface HeroCtaState extends HeroCtaAssignment {
  trackClick: (button: CtaButton) => void;
}

/**
 * The visitor's assignment, computed once per variants payload and cached so
 * useSyncExternalStore sees a stable snapshot. Computing it creates the visitor
 * id and (re)writes `cta_v`; both writes are idempotent for a given visitor.
 */
const clientCache = new WeakMap<HeroCtaVariants, HeroCtaAssignment>();
const serverCache = new WeakMap<HeroCtaVariants, HeroCtaAssignment>();

function serverAssignment(variants: HeroCtaVariants): HeroCtaAssignment {
  let a = serverCache.get(variants);
  if (!a) {
    a = { primary: variants.primary[0], secondary: variants.secondary[0], ready: false, visitorId: null };
    serverCache.set(variants, a);
  }
  return a;
}

function computeClientAssignment(variants: HeroCtaVariants): HeroCtaAssignment {
  const visitorId = ensureVisitorId();
  if (!visitorId) {
    return { primary: variants.primary[0], secondary: variants.secondary[0], ready: true, visitorId: null };
  }
  const stored = parseAssignmentCookie(readCookie(CTA_ASSIGN_COOKIE));
  const primary = resolveVariant(variants.primary, stored.primary, visitorId, 'primary') ?? variants.primary[0];
  const secondary = resolveVariant(variants.secondary, stored.secondary, visitorId, 'secondary') ?? variants.secondary[0];
  try {
    writeCookie(
      CTA_ASSIGN_COOKIE,
      serializeAssignmentCookie({
        primary: primary.fallback ? undefined : primary.variant_key,
        secondary: secondary.fallback ? undefined : secondary.variant_key,
      }),
    );
  } catch {
    // The assignment still applies for this load; it just will not stick.
  }
  return { primary, secondary, ready: true, visitorId };
}

function clientAssignment(variants: HeroCtaVariants): HeroCtaAssignment {
  let a = clientCache.get(variants);
  if (!a) {
    a = computeClientAssignment(variants);
    clientCache.set(variants, a);
  }
  return a;
}

/** Nothing to subscribe to: the assignment does not change during a page view. */
const subscribe = () => () => undefined;

export function useHeroCta(variants: HeroCtaVariants): HeroCtaState {
  // During hydration React renders the server snapshot (first variant, same
  // markup as the HTML), then re-renders with the client snapshot.
  const assigned = useSyncExternalStore(
    subscribe,
    () => clientAssignment(variants),
    () => serverAssignment(variants),
  );
  const assignedRef = useRef(assigned);
  // Refs survive React's dev-only double effect run, so one load sends one view.
  const viewsSent = useRef(false);
  const clicksSent = useRef(new Set<CtaButton>());

  useEffect(() => {
    assignedRef.current = assigned;
    const { ready, visitorId, primary, secondary } = assigned;
    if (!ready || !visitorId || viewsSent.current) return;
    viewsSent.current = true;
    if (!primary.fallback) sendEvent('primary', primary, 'view', visitorId);
    if (!secondary.fallback) sendEvent('secondary', secondary, 'view', visitorId);
  }, [assigned]);

  const trackClick = useCallback((button: CtaButton) => {
    const { ready, visitorId } = assignedRef.current;
    const variant = assignedRef.current[button];
    if (!ready || !visitorId || variant.fallback) return;
    if (clicksSent.current.has(button)) return;
    clicksSent.current.add(button);
    sendEvent(button, variant, 'click', visitorId);
  }, []);

  return { ...assigned, trackClick };
}
