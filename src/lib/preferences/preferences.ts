import { randomBytes } from 'node:crypto';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { purgeHomeRecordsByEmail } from '@/lib/homecare/retention';
import {
  normalizeEmail,
  SUPPRESSION_KEYS,
  type SuppressionKey,
} from '@/lib/preferences/streams';

/**
 * Email preference center helpers (Phase 3).
 *
 * One row per email in public.email_preferences governs the marketing streams a
 * contact receives. Transactional mail is not represented here — it always
 * sends. The self-serve page authenticates by preference_token (a capability),
 * mirroring the existing unsubscribe-token trust model.
 *
 * Stream definitions live in ./streams (client-safe, no Node imports) and are
 * re-exported here so server callers keep a single import path.
 */

export {
  STREAMS,
  STREAM_KEYS,
  SUPPRESSION_KEYS,
  TRANSACTIONAL_KEYS,
  normalizeEmail,
} from '@/lib/preferences/streams';
export type { StreamKey, StreamDef, SuppressionKey, TransactionalKey } from '@/lib/preferences/streams';

export interface EmailPreferences {
  email: string;
  preference_token: string;
  home_care: boolean;
  buy_remodel: boolean;
  announcements: boolean;
  /** Affirmative-consent monthly-newsletter opt-in. Defaults false; true only on explicit signup. */
  newsletter: boolean;
  /** Transactional lead follow-up / review-request opt-in (not a marketing stream). */
  follow_ups: boolean;
  created_at?: string;
  updated_at?: string;
}

function newToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Fetch the preferences row for an email, creating it (all streams on, fresh
 * token) on first touch. Idempotent via upsert on the email PK.
 *
 * `createDefaults` seeds explicit stream values ONLY when this call actually
 * inserts a brand-new row; an already-existing row is returned untouched (its
 * real consent state is never overwritten). Acquisition entry points that must
 * not inherit the identity-model true-defaults (e.g. an affirmative-consent
 * newsletter-only signup) pass the marketing streams as false here so a net-new
 * contact is not recorded as consenting to streams they never opted into.
 */
export async function getOrCreateByEmail(
  rawEmail: string,
  createDefaults?: Partial<Record<SuppressionKey, boolean>>,
): Promise<EmailPreferences> {
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
    { email, preference_token: newToken(), ...(createDefaults ?? {}) },
    { onConflict: 'email', prefer: 'resolution=ignore-duplicates,return=minimal' },
  );
  const rows = await supabaseRest<EmailPreferences[]>(
    'GET',
    `email_preferences?email=eq.${encodeURIComponent(email)}&limit=1`,
  );
  if (!rows?.[0]) throw new Error('Failed to create email_preferences row');
  return rows[0];
}

/**
 * Build the self-serve preference-center URL for an email, creating the row +
 * token on first touch. Used to put a real "manage preferences" link in email
 * bodies (the footer), alongside the List-Unsubscribe header the wrapper sets.
 */
export async function preferencesUrlFor(baseUrl: string, rawEmail: string): Promise<string> {
  const pref = await getOrCreateByEmail(rawEmail);
  return `${baseUrl}/preferences?token=${encodeURIComponent(pref.preference_token)}`;
}

export async function findByToken(token: string): Promise<EmailPreferences | null> {
  if (!token) return null;
  const rows = await supabaseRest<EmailPreferences[]>(
    'GET',
    `email_preferences?preference_token=eq.${encodeURIComponent(token)}&limit=1`,
  );
  return rows?.[0] ?? null;
}

/**
 * All emails that have opted OUT of a stream. Used to suppress recipients from
 * Resend broadcasts (which send via audiences, outside the sendTrackedEmail
 * wrapper). Paginates so a large opt-out list is fully returned.
 */
export async function getSuppressedEmails(stream: SuppressionKey): Promise<string[]> {
  const out: string[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const rows = await supabaseRest<Array<{ email: string }>>(
      'GET',
      `email_preferences?${stream}=eq.false&select=email&order=email.asc&limit=${pageSize}&offset=${offset}`,
    );
    if (!rows?.length) break;
    for (const r of rows) out.push(r.email);
    if (rows.length < pageSize) break;
  }
  return out;
}

/** True if the email has opted OUT of the given stream (so we must not send). */
export async function isSuppressed(rawEmail: string, stream: SuppressionKey): Promise<boolean> {
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
  changes: Partial<Record<SuppressionKey, boolean>>;
  actor: PrefActor;
  actorDetail?: string | null;
  ip?: string | null;
}): Promise<EmailPreferences> {
  const { current, changes, actor, actorDetail, ip } = args;

  const patch: Record<string, boolean> = {};
  const events: Array<Record<string, unknown>> = [];
  // Iterate ALL suppression keys (marketing streams + transactional follow_ups)
  // so a change to any of them is persisted + audited. syncLegacyStatus below
  // only mirrors the marketing streams (follow_ups has no legacy identity table).
  for (const key of SUPPRESSION_KEYS) {
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
  stream: SuppressionKey,
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

  // Re-enabling a stream only promotes 'unsubscribed' rows back to 'active';
  // 'pending' rows stay pending until they complete double opt-in verification.
  if (typeof patch.home_care === 'boolean') {
    await supabaseRest(
      'PATCH',
      patch.home_care
        ? `homeowners?email=eq.${enc}&status=eq.unsubscribed`
        : `homeowners?email=eq.${enc}`,
      patch.home_care
        ? { status: 'active', unsubscribed_at: null }
        : { status: 'unsubscribed', unsubscribed_at: nowIso },
      { prefer: 'return=minimal' },
    );
    if (!patch.home_care) {
      // Leaving Home Care deletes saved home details (the "deleted when you
      // leave" promise, Slice 8; the staff access log is deliberately kept -
      // see retention.ts). Every leave path - preference center,
      // unsubscribe-by-email, admin Subscriptions, Resend webhook - funnels
      // through here. Never throws; a real failure alerts internally while
      // the opt-out itself still sticks.
      await purgeHomeRecordsByEmail(email, 'preference-stream-off');
    }
  }
  if (typeof patch.buy_remodel === 'boolean') {
    await supabaseRest(
      'PATCH',
      patch.buy_remodel
        ? `newsletter_subscribers?email=eq.${enc}&status=eq.unsubscribed`
        : `newsletter_subscribers?email=eq.${enc}`,
      patch.buy_remodel
        ? { status: 'active', unsubscribed_at: null }
        : { status: 'unsubscribed', unsubscribed_at: nowIso },
      { prefer: 'return=minimal' },
    );
  }
}
