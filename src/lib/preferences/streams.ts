/**
 * Client-safe stream definitions for the email preference center.
 *
 * Kept free of Node-only imports (crypto, Supabase REST) so 'use client'
 * components can import STREAMS/StreamKey without pulling server code into
 * the browser bundle. Server-side helpers live in ./preferences, which
 * re-exports everything here.
 */

export type StreamKey = 'home_care' | 'buy_remodel' | 'announcements';

export interface StreamDef {
  key: StreamKey;
  label: string;
  description: string;
}

export const STREAMS: StreamDef[] = [
  {
    key: 'home_care',
    label: 'La Vaca Home Care',
    description: 'Your seasonal home-maintenance checklist, reminders, and occasional Home Care updates.',
  },
  {
    key: 'buy_remodel',
    label: 'Buy + Remodel listings',
    description: 'New renovation-ready homes as they come to market.',
  },
  {
    key: 'announcements',
    label: 'News & occasional offers',
    description: 'Company news and the occasional promotion — a few times a year at most.',
  },
];

export const STREAM_KEYS: StreamKey[] = STREAMS.map((s) => s.key);

/**
 * Transactional suppression keys — opt-outs that are NOT marketing streams and
 * are therefore excluded from the global marketing cascade (a general /unsub or
 * newsletter one-click never touches them). Currently just lead follow-ups /
 * review requests: their primary purpose is commercial so CAN-SPAM requires a
 * working opt-out, but a marketing unsubscribe should not silence a lead's sales
 * nurture (owner decision 2026-07). Only the follow-up emails read/flip this.
 */
export type TransactionalKey = 'follow_ups';
export const TRANSACTIONAL_KEYS: TransactionalKey[] = ['follow_ups'];

/**
 * Every per-email suppression flag we persist: marketing streams + transactional
 * opt-outs. `applyUpdate` and the row shape iterate this; the marketing cascade
 * (`/unsub`, one-click) iterates STREAM_KEYS only.
 */
export type SuppressionKey = StreamKey | TransactionalKey;
export const SUPPRESSION_KEYS: SuppressionKey[] = [...STREAM_KEYS, ...TRANSACTIONAL_KEYS];

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
