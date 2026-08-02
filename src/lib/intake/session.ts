/**
 * Reading and writing an intake session.
 *
 * Every read here distinguishes "there is no such session" from "I could not
 * reach the database". They render differently and they must: telling a lead
 * their link is invalid when the truth is that Supabase timed out sends them
 * away for good, and that failure-reads-as-success pattern was the single
 * largest defect class in the crew dispatch review.
 */
import { randomBytes } from 'crypto';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import type { StepId } from './flow';

export interface IntakeSession {
  id: string;
  lead_id: string | null;
  token: string;
  first_name: string | null;
  project_type: string | null;
  status: 'pending' | 'active' | 'completed' | 'declined';
  current_step: StepId;
  answers: Record<string, string>;
  opened_at: string | null;
  completed_at: string | null;
  declined_at: string | null;
}

/** What a lookup found. `unreadable` is not `missing`. */
export type SessionLookup =
  | { state: 'found'; session: IntakeSession }
  | { state: 'missing' }
  | { state: 'unreadable' };

/** 32 random bytes, so guessing a token is not a realistic attack. */
export function newIntakeToken(): string {
  return randomBytes(32).toString('base64url');
}

export function intakeUrlFor(origin: string, token: string): string {
  return `${origin}/intake/${encodeURIComponent(token)}`;
}

/**
 * Create the session for a freshly inserted lead.
 *
 * Returns null rather than throwing: a lead that saved but whose intake session
 * did not is still a lead, and must still produce its alerts and its ack email.
 * The caller degrades to the old behaviour instead of failing the submission.
 */
export async function createIntakeSession(args: {
  leadId: string | null;
  firstName: string | null;
  projectType: string | null;
}): Promise<{ token: string } | null> {
  const token = newIntakeToken();
  try {
    await supabaseRest('POST', 'lead_intake_sessions', {
      lead_id: args.leadId,
      token,
      first_name: args.firstName,
      project_type: args.projectType,
      status: 'pending',
      current_step: 'consent',
      answers: {},
    });
    return { token };
  } catch (err) {
    console.error('[intake] failed to create session:', err);
    return null;
  }
}

export async function lookupByToken(token: string): Promise<SessionLookup> {
  if (!token || token.length < 16) return { state: 'missing' };
  try {
    const rows = await supabaseRest<IntakeSession[]>(
      'GET',
      `lead_intake_sessions?token=eq.${encodeURIComponent(token)}&limit=1`,
    );
    if (!Array.isArray(rows)) return { state: 'unreadable' };
    if (rows.length === 0) return { state: 'missing' };
    return { state: 'found', session: rows[0] };
  } catch (err) {
    console.error('[intake] session lookup failed:', err);
    return { state: 'unreadable' };
  }
}

/**
 * Stamp the first open. WEB-01B reads the absence of this to find leads who
 * never engaged, so it must only ever be written once.
 */
export async function markOpened(session: IntakeSession): Promise<void> {
  if (session.opened_at) return;
  try {
    await supabaseRest(
      'PATCH',
      `lead_intake_sessions?id=eq.${session.id}&opened_at=is.null`,
      { opened_at: new Date().toISOString(), status: 'active', updated_at: new Date().toISOString() },
      { prefer: 'return=minimal' },
    );
  } catch (err) {
    // Not fatal. A missing open stamp costs us a low-intent signal; it must not
    // cost the lead their conversation.
    console.error('[intake] failed to stamp opened_at:', err);
  }
}

/** Persist one answer and advance. Throws so the route can tell the lead. */
export async function recordAnswer(args: {
  session: IntakeSession;
  field: string | undefined;
  value: string;
  nextStep: StepId;
  terminal: boolean;
  declined: boolean;
}): Promise<void> {
  const now = new Date().toISOString();
  const answers = { ...args.session.answers };
  if (args.field) answers[args.field] = args.value;

  await supabaseRest(
    'PATCH',
    `lead_intake_sessions?id=eq.${args.session.id}`,
    {
      answers,
      current_step: args.nextStep,
      updated_at: now,
      ...(args.declined ? { status: 'declined', declined_at: now } : {}),
      ...(args.terminal && !args.declined ? { status: 'completed', completed_at: now } : {}),
    },
    { prefer: 'return=minimal' },
  );
}

/**
 * Mirror the answer onto the lead itself.
 *
 * Separate from `recordAnswer` and deliberately non-fatal: the session is the
 * source of truth for the conversation, and a lead row that lags by one field
 * is recoverable, whereas a conversation that refuses to advance is not.
 */
export async function mirrorToLead(
  leadId: string | null,
  field: string | undefined,
  value: string | number,
): Promise<void> {
  if (!leadId || !field) return;
  try {
    await supabaseRest(
      'PATCH',
      `leads?id=eq.${leadId}`,
      { [field]: value },
      { prefer: 'return=minimal' },
    );
  } catch (err) {
    console.error(`[intake] failed to mirror ${field} to lead ${leadId}:`, err);
  }
}

/** Record an off-script question. Returns the row id so routing can stamp it. */
export async function recordOffScript(args: {
  sessionId: string;
  step: string;
  body: string;
}): Promise<string | null> {
  try {
    const rows = await supabaseRest<{ id: string }[]>('POST', 'lead_intake_events', {
      session_id: args.sessionId,
      kind: 'off_script',
      step: args.step,
      body: args.body,
    });
    return Array.isArray(rows) && rows[0] ? rows[0].id : null;
  } catch (err) {
    console.error('[intake] failed to store off-script message:', err);
    return null;
  }
}

/** Stamp an off-script row once it has actually reached a human. */
export async function markRouted(eventId: string): Promise<void> {
  try {
    await supabaseRest(
      'PATCH',
      `lead_intake_events?id=eq.${eventId}`,
      { routed_at: new Date().toISOString() },
      { prefer: 'return=minimal' },
    );
  } catch (err) {
    console.error('[intake] failed to stamp routed_at:', err);
  }
}

export async function recordPhoto(args: {
  sessionId: string;
  leadId: string | null;
  storagePath: string;
  publicUrl: string | null;
}): Promise<void> {
  await supabaseRest('POST', 'lead_intake_photos', {
    session_id: args.sessionId,
    lead_id: args.leadId,
    storage_path: args.storagePath,
    public_url: args.publicUrl,
  });
}
