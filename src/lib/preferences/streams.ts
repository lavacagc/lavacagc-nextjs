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

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
