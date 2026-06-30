'use client';

import { useEffect, useState } from 'react';

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

/**
 * "Welcome back, <name>" banner for returning Buy + Remodel subscribers. Reads
 * the non-httpOnly `br_known` cookie set on verification; renders nothing for
 * anonymous visitors. Purely cosmetic — access is enforced server-side.
 *
 * The cookie is client-only, so we render null on the server/first paint and read
 * it after mount. (We intentionally setState once on mount to pick up the
 * client-only cookie value — useSyncExternalStore did not reliably surface it in
 * the production build.)
 */
export default function SubscriberGreeting() {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of a client-only cookie after mount
    setName(readKnownName());
  }, []);

  if (!name) return null;

  return (
    <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
      <span className="font-semibold">Welcome back, {name}.</span>{' '}
      <span className="text-text-muted">Here are the latest Buy + Remodel homes for you.</span>
    </div>
  );
}
