'use client';

import { useSyncExternalStore } from 'react';

/** Read the readable `br_known` hint cookie (first name) on the client. */
function readKnownName(): string | null {
  if (typeof document === 'undefined') return null;
  const entry = document.cookie.split('; ').find((c) => c.startsWith('br_known='));
  if (!entry) return null;
  try {
    const name = decodeURIComponent(entry.slice('br_known='.length)).trim();
    return name || null;
  } catch {
    return null;
  }
}

// Cookies don't change mid-render, so there's nothing to subscribe to.
const noopSubscribe = () => () => {};

/**
 * "Welcome back, <name>" banner for returning Buy + Remodel subscribers. Reads
 * the non-httpOnly `br_known` cookie set on verification; renders nothing for
 * anonymous visitors. Purely cosmetic — access is enforced server-side.
 *
 * Uses useSyncExternalStore so the cookie is read on the client (server snapshot
 * is null) without a setState-in-effect or a hydration mismatch.
 */
export default function SubscriberGreeting() {
  const name = useSyncExternalStore(noopSubscribe, readKnownName, () => null);

  if (!name) return null;

  return (
    <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
      <span className="font-semibold">Welcome back, {name}.</span>{' '}
      <span className="text-text-muted">Here are the latest Buy + Remodel homes for you.</span>
    </div>
  );
}
