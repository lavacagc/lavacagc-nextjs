/**
 * Server-side helpers for the `homeowners` table (La Vaca Home Care opt-in).
 * All access is via SUPABASE_SECRET_KEY (supabaseRest) — no public RLS, mirroring
 * the leads + newsletter pipelines.
 */
import { randomBytes } from 'node:crypto';
import { supabaseRest } from '@/lib/notify/supabase-rest';

export interface Homeowner {
  id: string;
  email: string;
  first_name: string | null;
  phone: string | null;
  zip: string | null;
  home_type: string | null;
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

export function newToken(): string {
  return randomBytes(32).toString('hex');
}

export function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function findOne(column: string, value: string): Promise<Homeowner | null> {
  const rows = await supabaseRest<Homeowner[]>(
    'GET',
    `homeowners?${column}=eq.${encodeURIComponent(value)}&select=*&limit=1`,
  );
  return rows && rows.length > 0 ? rows[0] : null;
}

export function findHomeownerByEmail(email: string): Promise<Homeowner | null> {
  return findOne('email', normalizeEmail(email));
}

/**
 * True only if this email is a CONFIRMED (status='active') La Vaca Home Care
 * subscriber. Pending (unverified) and unsubscribed homeowners both return
 * false. Used to suppress the Home Care promo in lead follow-up emails for
 * people who already receive Home Care mail, so we never pitch a membership
 * to someone who already has it.
 *
 * Reads with SUPABASE_SECRET_KEY (bypasses RLS). Fails OPEN: any lookup error
 * returns false, i.e. the promo is left in place rather than blocking the send.
 * Showing the promo to an already-subscribed recipient is a mild annoyance;
 * dropping it for a genuine prospect over a transient DB blip is the worse miss.
 */
export async function isActiveHomeCareSubscriber(email: string): Promise<boolean> {
  if (!email) return false;
  try {
    const rows = await supabaseRest<Array<{ id: string }>>(
      'GET',
      `homeowners?email=eq.${encodeURIComponent(normalizeEmail(email))}&status=eq.active&select=id&limit=1`,
    );
    return !!rows && rows.length > 0;
  } catch (err) {
    console.error('isActiveHomeCareSubscriber lookup failed (failing open):', err);
    return false;
  }
}

export function findHomeownerByVerifyToken(token: string): Promise<Homeowner | null> {
  return findOne('verify_token', token);
}

export function findHomeownerByUnsubscribeToken(token: string): Promise<Homeowner | null> {
  return findOne('unsubscribe_token', token);
}

export function findHomeownerById(id: string): Promise<Homeowner | null> {
  return findOne('id', id);
}

export async function insertHomeowner(row: Record<string, unknown>): Promise<Homeowner> {
  const rows = await supabaseRest<Homeowner[]>('POST', 'homeowners', row);
  return rows[0];
}

export async function updateHomeowner(id: string, patch: Record<string, unknown>): Promise<void> {
  await supabaseRest(
    'PATCH',
    `homeowners?id=eq.${encodeURIComponent(id)}`,
    { ...patch, updated_at: new Date().toISOString() },
    { prefer: 'return=minimal' },
  );
}

/** Double opt-in consent record (best-effort; never throws to the caller). */
export async function logHomeownerConsent(args: {
  email: string;
  phone?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    const row: Record<string, unknown> = {
      consent_type: 'newsletter_home_care',
      consent_text:
        'Subscribed to La Vaca Home Care seasonal maintenance plan & newsletter via double opt-in email verification.',
      user_email: normalizeEmail(args.email),
      user_phone: args.phone || null,
      user_agent: args.userAgent || null,
    };
    if (args.ip && /^[0-9a-fA-F.:]+$/.test(args.ip) && args.ip !== 'unknown') {
      row.ip_address = args.ip;
    }
    await supabaseRest('POST', 'consent_logs', row, { prefer: 'return=minimal' });
  } catch (err) {
    console.error('Failed to log home-care consent:', err);
  }
}
