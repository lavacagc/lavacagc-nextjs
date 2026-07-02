import { randomBytes } from 'node:crypto';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import type { EmailCategory } from '@/lib/notify/sendEmail';

/**
 * Email preference center helpers (Phase 3).
 *
 * One row per email in public.email_preferences governs the marketing streams a
 * contact receives. Transactional mail is not represented here — it always
 * sends. The self-serve page authenticates by preference_token (a capability),
 * mirroring the existing unsubscribe-token trust model.
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
    description: 'Your monthly seasonal home-maintenance checklist and reminders.',
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

export interface EmailPreferences {
  email: string;
  preference_token: string;
  home_care: boolean;
  buy_remodel: boolean;
  announcements: boolean;
  created_at?: string;
  updated_at?: string;
}

/**
 * Which marketing stream (if any) a given email category belongs to. Categories
 * not listed are transactional/internal and are never suppressed. Kept in sync
 * with EmailCategory in src/lib/notify/sendEmail.ts.
 */
export const CATEGORY_STREAM: Partial<Record<EmailCategory, StreamKey>> = {
  home_care_newsletter: 'home_care',
  buy_remodel: 'buy_remodel',
  broadcast: 'announcements',
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function newToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Fetch the preferences row for an email, creating it (all streams on, fresh
 * token) on first touch. Idempotent via upsert on the email PK.
 */
export async function getOrCreateByEmail(rawEmail: string): Promise<EmailPreferences> {
  const email = normalizeEmail(rawEmail);
  const existing = await supabaseRest<EmailPreferences[]>(
    'GET',
    `email_preferences?email=eq.${encodeURIComponent(email)}&limit=1`,
  );
  if (existing?.[0]) return existing[0];

  // Insert with a fresh token. If a concurrent request already created it,
  // merge-duplicates returns the existing row's data on re-read.
  await supabaseRest(
    'POST',
    'email_preferences',
    { email, preference_token: newToken() },
    { onConflict: 'email', prefer: 'resolution=ignore-duplicates,return=minimal' },
  );
  const rows = await supabaseRest<EmailPreferences[]>(
    'GET',
    `email_preferences?email=eq.${encodeURIComponent(email)}&limit=1`,
  );
  if (!rows?.[0]) throw new Error('Failed to create email_preferences row');
  return rows[0];
}

export async function findByToken(token: string): Promise<EmailPreferences | null> {
  if (!token) return null;
  const rows = await supabaseRest<EmailPreferences[]>(
    'GET',
    `email_preferences?preference_token=eq.${encodeURIComponent(token)}&limit=1`,
  );
  return rows?.[0] ?? null;
}

/** True if the email has opted OUT of the given stream (so we must not send). */
export async function isSuppressed(rawEmail: string, stream: StreamKey): Promise<boolean> {
  try {
    const email = normalizeEmail(rawEmail);
    const rows = await supabaseRest<EmailPreferences[]>(
      'GET',
      `email_preferences?email=eq.${encodeURIComponent(email)}&select=${stream}&limit=1`,
    );
    // No row = never set a preference = subscribed by default.
    if (!rows?.[0]) return false;
    return rows[0][stream] === false;
  } catch {
    // Fail OPEN for suppression checks: a DB hiccup should not silently drop a
    // legitimate send. (Contrast the access gate, which fails closed.)
    return false;
  }
}

export type PrefActor = 'self' | 'admin' | 'webhook' | 'system';

/**
 * Apply a set of stream changes to a preferences row, write an audit event per
 * changed stream, and sync the legacy identity-table status columns so the rest
 * of the app (middleware access gate, newsletter cron) sees the change too.
 */
export async function applyUpdate(args: {
  current: EmailPreferences;
  changes: Partial<Record<StreamKey, boolean>>;
  actor: PrefActor;
  actorDetail?: string | null;
  ip?: string | null;
}): Promise<EmailPreferences> {
  const { current, changes, actor, actorDetail, ip } = args;

  const patch: Record<string, boolean> = {};
  const events: Array<Record<string, unknown>> = [];
  for (const key of STREAM_KEYS) {
    if (typeof changes[key] === 'boolean' && changes[key] !== current[key]) {
      patch[key] = changes[key] as boolean;
      events.push({
        email: current.email,
        stream: key,
        old_value: current[key],
        new_value: changes[key],
        actor,
        actor_detail: actorDetail ?? null,
        ip: ip ?? null,
      });
    }
  }

  if (Object.keys(patch).length === 0) return current;

  await supabaseRest(
    'PATCH',
    `email_preferences?email=eq.${encodeURIComponent(current.email)}`,
    { ...patch, updated_at: new Date().toISOString() },
    { prefer: 'return=minimal' },
  );

  // Best-effort audit — never block the update on the log.
  await supabaseRest('POST', 'preference_events', events, { prefer: 'return=minimal' }).catch(
    (e) => console.error('preference_events insert failed (non-fatal):', e),
  );

  // Sync legacy status columns (best-effort). home_care → homeowners,
  // buy_remodel → newsletter_subscribers. announcements has no identity table.
  await syncLegacyStatus(current.email, patch).catch((e) =>
    console.error('legacy status sync failed (non-fatal):', e),
  );

  return { ...current, ...patch };
}

/**
 * Convenience for the legacy per-stream unsubscribe routes (Home Care /
 * Buy+Remodel): flip a single stream for an email and audit it. Best-effort —
 * callers wrap in catch; keeps email_preferences in sync when a user unsubscribes
 * via an old-style single-purpose link instead of the preference center.
 */
export async function setStreamByEmail(
  rawEmail: string,
  stream: StreamKey,
  value: boolean,
  actor: PrefActor = 'self',
  actorDetail?: string | null,
): Promise<void> {
  const current = await getOrCreateByEmail(rawEmail);
  await applyUpdate({ current, changes: { [stream]: value }, actor, actorDetail });
}

async function syncLegacyStatus(email: string, patch: Record<string, boolean>): Promise<void> {
  const enc = encodeURIComponent(email);
  const nowIso = new Date().toISOString();

  if (typeof patch.home_care === 'boolean') {
    const status = patch.home_care ? 'active' : 'unsubscribed';
    await supabaseRest(
      'PATCH',
      `homeowners?email=eq.${enc}`,
      patch.home_care
        ? { status, unsubscribed_at: null }
        : { status, unsubscribed_at: nowIso },
      { prefer: 'return=minimal' },
    );
  }
  if (typeof patch.buy_remodel === 'boolean') {
    const status = patch.buy_remodel ? 'active' : 'unsubscribed';
    await supabaseRest(
      'PATCH',
      `newsletter_subscribers?email=eq.${enc}`,
      patch.buy_remodel
        ? { status, unsubscribed_at: null }
        : { status, unsubscribed_at: nowIso },
      { prefer: 'return=minimal' },
    );
  }
}
