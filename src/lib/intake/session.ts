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

/**
 * The site-relative link. This is what the browser gets back from the submit
 * route: the confirmation panel is already on whichever host served the form,
 * so a path is correct on the apex, on www, on a preview and on localhost
 * alike, and nothing about the link is derived from a client-supplied Host.
 */
export function intakePathFor(token: string): string {
  return `/intake/${encodeURIComponent(token)}`;
}

/** The absolute link, for anywhere there is no page to be relative to - email. */
export function intakeUrlFor(origin: string, token: string): string {
  return `${origin}${intakePathFor(token)}`;
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
 * Columns the lead forms already write, where the intake must ADD to what is
 * there rather than replace it.
 *
 * `leads.message` is the one that matters: RequestEstimateForm composes the
 * property type, the services of interest, the timing, the call window and the
 * lead's own notes into it, and it now renders the intake invite on its
 * confirmation panel. A blind PATCH would destroy all of that the moment the
 * same lead answered the intake's opening question. The migration's own note
 * says these columns are "filled, not duplicated" - filled, not overwritten.
 */
const APPEND_COLUMNS = new Set(['message']);

const INTAKE_SEPARATOR = '--- Added in the intake conversation ---';

/**
 * Read the column and return what should be written in its place.
 *
 * Throws if the read fails, which the caller turns into "write nothing". Not
 * knowing what is already there is precisely when overwriting is unsafe.
 */
async function appendedValue(leadId: string, field: string, value: string): Promise<string | null> {
  const rows = await supabaseRest<Record<string, string | null>[]>(
    'GET',
    `leads?id=eq.${leadId}&select=${encodeURIComponent(field)}&limit=1`,
  );
  const existing = (Array.isArray(rows) && rows[0] ? rows[0][field] : null)?.trim() ?? '';
  if (!existing) return value;
  // A retried answer must not stack up a second copy.
  if (existing.includes(value)) return null;
  return `${existing}\n\n${INTAKE_SEPARATOR}\n${value}`;
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
    const next =
      APPEND_COLUMNS.has(field) && typeof value === 'string'
        ? await appendedValue(leadId, field, value)
        : value;
    if (next === null) return;
    await supabaseRest(
      'PATCH',
      `leads?id=eq.${leadId}`,
      { [field]: next },
      { prefer: 'return=minimal' },
    );
  } catch (err) {
    console.error(`[intake] failed to mirror ${field} to lead ${leadId}:`, err);
  }
}

/**
 * Persist the routing decision on the lead (WEB-01A).
 *
 * Its acceptance criterion is that the decision AND its recipient are logged,
 * so a failure here is not cosmetic - it leaves a lead that was routed with no
 * record of where or why. Logged loudly, and reported to the caller so the
 * brief can say the record is missing rather than imply it is there.
 *
 * null, not false, when there is no lead row to write to: a session whose lead
 * insert returned nothing never had a record for this to be missing from, and
 * warning that a routing decision was lost when none was ever due teaches the
 * reader to ignore the warning that matters.
 */
export async function recordRouting(args: {
  leadId: string | null;
  score: number;
  bucket: 'hot' | 'cold';
  signals: string[];
  routedTo: string;
  reason: string;
}): Promise<boolean | null> {
  if (!args.leadId) return null;
  try {
    await supabaseRest(
      'PATCH',
      `leads?id=eq.${args.leadId}`,
      {
        intake_score: args.score,
        intake_bucket: args.bucket,
        intake_signals: args.signals,
        routed_to: args.routedTo,
        routed_at: new Date().toISOString(),
        routing_reason: args.reason,
      },
      { prefer: 'return=minimal' },
    );
    return true;
  } catch (err) {
    console.error(`[intake] FAILED to record routing for lead ${args.leadId}:`, err);
    return false;
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

/**
 * How many photos this session has already stored, or null when that could not
 * be read.
 *
 * The two callers want opposite things from a failed read, so the distinction
 * is made here once rather than guessed at twice.
 */
export async function countPhotosOrNull(sessionId: string): Promise<number | null> {
  try {
    const rows = await supabaseRest<{ id: string }[]>(
      'GET',
      `lead_intake_photos?session_id=eq.${sessionId}&select=id`,
    );
    return Array.isArray(rows) ? rows.length : null;
  } catch (err) {
    console.error('[intake] failed to count photos:', err);
    return null;
  }
}

/**
 * The scoring read: the same count, tried a second time before it is allowed to
 * answer "unknown".
 *
 * The count is worth 10 points and can decide the bucket, and these reads fail
 * transiently or not at all, so one retry closes most of the window at the cost
 * of one request on a path that runs once per completed intake. It still
 * answers null rather than inventing a number - "we could not tell" survives to
 * the scorer, which knows what to do with it.
 */
export async function countPhotosForScoring(
  sessionId: string,
  read: (id: string) => Promise<number | null> = countPhotosOrNull,
): Promise<number | null> {
  const first = await read(sessionId);
  return first === null ? read(sessionId) : first;
}

/**
 * The same count, with a failed read treated as 0.
 *
 * For the upload path only, which uses it to decide whether there is room for
 * more: refusing an upload because Supabase blinked would cost a real lead
 * their photos. Scoring must NOT use this - see `countPhotosOrNull`.
 */
export async function countPhotos(sessionId: string): Promise<number> {
  return (await countPhotosOrNull(sessionId)) ?? 0;
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
