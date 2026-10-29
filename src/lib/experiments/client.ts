'use client';

/**
 * The browser half of the funnel: fire-and-forget beacons to
 * /api/experiments/event. Nothing here decides anything; the server checks
 * every claim against the visitor's cookies.
 */
export type ClientEvent =
  | { event: 'view' | 'click'; experiment_key: string; variant_key: string }
  | { event: 'request_started' };

export const EXPERIMENT_EVENT_PATH = '/api/experiments/event';

export function sendExperimentEvent(body: ClientEvent): void {
  try {
    void fetch(EXPERIMENT_EVENT_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // Survives the navigation a click starts.
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // A beacon must never break the page.
  }
}

/** request_started at most once per page load, however often the flow opens. */
let requestStartedSent = false;
export function sendRequestStarted(): void {
  if (requestStartedSent) return;
  requestStartedSent = true;
  sendExperimentEvent({ event: 'request_started' });
}
