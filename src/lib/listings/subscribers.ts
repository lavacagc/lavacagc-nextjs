/**
 * Server-side helpers for the newsletter_subscribers table behind the
 * "Buy + Remodel" email gate. All access is via SUPABASE_SECRET_KEY
 * (supabaseRest), mirroring the leads pipeline — there is no public RLS.
 */
import { randomBytes } from 'node:crypto';
import { supabaseRest } from '@/lib/notify/supabase-rest';

export interface Subscriber {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  zip_codes: string[];
  status: 'pending' | 'active' | 'unsubscribed';
  verify_token: string | null;
  verify_token_expires_at: string | null;
  unsubscribe_token: string;
  verified_at: string | null;
  unsubscribed_at: string | null;
  source: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** Random URL-safe token (hex). 32 bytes → 64 hex chars. */
export function newToken(): string {
  return randomBytes(32).toString('hex');
}

/** ISO timestamp `hours` from now. */
export function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function findOne(column: string, value: string): Promise<Subscriber | null> {
  const rows = await supabaseRest<Subscriber[]>(
    'GET',
    `newsletter_subscribers?${column}=eq.${encodeURIComponent(value)}&select=*&limit=1`,
  );
  return rows && rows.length > 0 ? rows[0] : null;
}

export function findByEmail(email: string): Promise<Subscriber | null> {
  return findOne('email', normalizeEmail(email));
}

export function findByVerifyToken(token: string): Promise<Subscriber | null> {
  return findOne('verify_token', token);
}

export function findByUnsubscribeToken(token: string): Promise<Subscriber | null> {
  return findOne('unsubscribe_token', token);
}

export async function insertSubscriber(row: Record<string, unknown>): Promise<Subscriber> {
  const rows = await supabaseRest<Subscriber[]>('POST', 'newsletter_subscribers', row);
  return rows[0];
}

export async function updateSubscriber(id: string, patch: Record<string, unknown>): Promise<void> {
  await supabaseRest(
    'PATCH',
    `newsletter_subscribers?id=eq.${encodeURIComponent(id)}`,
    { ...patch, updated_at: new Date().toISOString() },
    { prefer: 'return=minimal' },
  );
}

/** Record a double opt-in consent row (best-effort; never throws to the caller). */
export async function logConsent(args: {
  email: string;
  phone?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    const row: Record<string, unknown> = {
      consent_type: 'newsletter_buy_and_remodel',
      consent_text:
        'Subscribed to La Vaca Buy + Remodel listings & newsletter via double opt-in email verification.',
      user_email: normalizeEmail(args.email),
      user_phone: args.phone || null,
      user_agent: args.userAgent || null,
    };
    // ip_address is a Postgres inet column — only set it when it parses as one.
    if (args.ip && /^[0-9a-fA-F.:]+$/.test(args.ip) && args.ip !== 'unknown') {
      row.ip_address = args.ip;
    }
    await supabaseRest('POST', 'consent_logs', row, { prefer: 'return=minimal' });
  } catch (err) {
    console.error('Failed to log newsletter consent:', err);
  }
}
