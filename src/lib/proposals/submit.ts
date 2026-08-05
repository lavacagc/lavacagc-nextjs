/**
 * Proposal Pod - Slice 3: the one write a client can make.
 *
 * WEB-022 in one sentence: a client may decline optional work and may not touch
 * locked work. The schema cannot express that - `included_lines` is a JSONB
 * snapshot whose SHAPE is CHECKed, not its relationship to the line set it came
 * from - so it is enforced here, at the only door that writes the table.
 *
 * WHAT THE CLIENT SENDS IS IDS. Not titles, not prices, not a total. Every
 * number in the stored record is re-read from `proposal_lines` under the secret
 * key and re-summed server-side, so the worst a tampered payload can do is name
 * a different set of OPTIONAL ids - which is exactly what the switches are for.
 * A payload carrying prices does not have them ignored by convention; there is
 * nowhere in this module for them to enter.
 *
 * The stored snapshot is the WHOLE composition (slice 1's argument): every
 * locked line plus the optional lines the client kept, each element marked
 * `optional`. A re-import replaces `proposal_lines` wholesale and the ids in
 * older submissions stop resolving, so the record has to stay readable without
 * the rows it was built from.
 */
import { z } from 'zod';
import { supabaseRest, supabaseRestCounted } from '@/lib/notify/supabase-rest';
import { MAX_LINES } from './csv';
import { PROPOSAL_TOKEN_RE } from './publicView';

/** How much of a user-agent string is worth keeping on the audit row. */
const MAX_USER_AGENT_CHARS = 500;

/**
 * The request body: ids, and only ids.
 *
 * `included_line_ids` is bounded by the same MAX_LINES the parser and the store
 * hold, so this door is not a wider frame than the one the lines came in
 * through. `touched_line_ids` is telemetry (owner-approved concession toward
 * WEB-027) and may legitimately be empty: a client who touched nothing touched
 * nothing.
 */
export const ProposalSubmitSchema = z.object({
  included_line_ids: z.array(z.string().uuid()).min(1).max(MAX_LINES),
  touched_line_ids: z.array(z.string().uuid()).max(MAX_LINES).default([]),
});

export type ProposalSubmitInput = z.infer<typeof ProposalSubmitSchema>;

/** One element of a stored snapshot, exactly as `proposal_line_snapshot` requires. */
export interface SnapshotLine {
  id: string;
  title: string;
  price_cents: number;
  optional: boolean;
}

export interface SubmissionRecord {
  proposalId: string;
  clientName: string;
  proposalTitle: string;
  leadId: string | null;
  totalCents: number;
  /** What the client agreed to: every locked line plus the optionals they kept. */
  included: SnapshotLine[];
  /** The optional lines they turned OFF. Not stored; the owner alert prints it. */
  declined: SnapshotLine[];
  /** Optional lines they flipped at least once while deciding. */
  touched: SnapshotLine[];
  /**
   * Did this proposal already carry a submission before this one?
   *
   * Kept SEPARATE from the count below, because it is answerable in a case the
   * count is not. The read asks for one row with `count=exact`, and the exact
   * total arrives on Content-Range - which a proxy can strip, and which
   * PostgREST answers with `*` when it did not count. A row coming back is
   * proof of a prior submission whether or not the header says how many, and
   * folding the two together threw that proof away: a genuine revision was
   * announced to the owner as a first answer.
   *
   * False when nothing is known, which is the neutral wording and true of every
   * submission - where "revised" on a first answer is not.
   */
  isRevision: boolean;
  /**
   * How many came before, when the exact count is readable. Null is "at least
   * one, or none, but not known" - never a confident 0.
   */
  priorSubmissions: number | null;
}

export type SubmitOutcome =
  /** Stored. */
  | { status: 'ok'; record: SubmissionRecord }
  /** Unknown token, or revoked. The route answers with the generic dead end. */
  | { status: 'missing' }
  /** Our side failed. Never reported to the client as a bad link. */
  | { status: 'unreadable' }
  /** The payload broke a rule the client's own page cannot break. 400. */
  | { status: 'refused'; message: string };

interface ProposalHead {
  id: string;
  client_name: string;
  client_email: string | null;
  title: string;
  status: 'draft' | 'sent' | 'revoked';
  lead_id: string | null;
}

interface LineRow {
  id: string;
  title: string;
  price_cents: number;
  optional: boolean;
}

export interface SubmitArgs {
  token: string;
  input: ProposalSubmitInput;
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Validate a client's composition against the stored lines and record it.
 *
 * The order matters: resolve the proposal, then judge the payload against the
 * rows, then write. Judging first would mean trusting the payload to say which
 * proposal it belongs to.
 */
export async function submitProposal(args: SubmitArgs): Promise<SubmitOutcome> {
  const { token, input, ipAddress, userAgent } = args;
  if (!PROPOSAL_TOKEN_RE.test(token)) return { status: 'missing' };

  let head: ProposalHead | undefined;
  let lines: LineRow[];
  try {
    const heads = await supabaseRest<ProposalHead[]>(
      'GET',
      `proposals?select=id,client_name,client_email,title,status,lead_id&token=eq.${encodeURIComponent(token)}&limit=1`,
    );
    head = heads?.[0];
    if (!head) return { status: 'missing' };
    // A revoked link does not serve, and does not accept. Same generic answer.
    if (head.status === 'revoked') return { status: 'missing' };

    lines = (await supabaseRest<LineRow[]>(
      'GET',
      `proposal_lines?select=id,title,price_cents,optional&proposal_id=eq.${head.id}&order=position.asc&limit=${MAX_LINES}`,
    )) ?? [];
  } catch (err) {
    console.error('[proposal submit] read failed:', err instanceof Error ? err.message : String(err));
    return { status: 'unreadable' };
  }

  if (lines.length === 0) {
    console.error(`[proposal submit] proposal ${head.id} resolved but holds no lines`);
    return { status: 'unreadable' };
  }

  const byId = new Map(lines.map((l) => [l.id, l]));
  // Deduplicated: a repeated id is a client that sent the same switch twice,
  // not a line agreed to twice, and the sum must not double-count it.
  const requested = new Set(input.included_line_ids);

  // An id we do not recognise is refused rather than dropped. Dropping it would
  // store a composition the client never saw, and the id could belong to
  // another client's proposal - which this refusal is also what stops.
  for (const id of requested) {
    if (!byId.has(id)) {
      return { status: 'refused', message: 'That selection refers to a line that is not part of this proposal.' };
    }
  }

  // WEB-022. The client's own page renders locked lines with no control at all,
  // so a payload missing one did not come from it.
  const missingLocked = lines.filter((l) => !l.optional && !requested.has(l.id));
  if (missingLocked.length > 0) {
    return {
      status: 'refused',
      message: 'Some of the work in this proposal is not optional and cannot be removed.',
    };
  }

  const snapshot = (l: LineRow): SnapshotLine => ({
    id: l.id,
    title: l.title,
    price_cents: l.price_cents,
    optional: l.optional,
  });

  // Built by walking the STORED lines in their stored order, never the payload:
  // the record is what we hold, in the order the estimate was built.
  const included = lines.filter((l) => requested.has(l.id)).map(snapshot);
  const declined = lines.filter((l) => l.optional && !requested.has(l.id)).map(snapshot);
  const totalCents = included.reduce((acc, l) => acc + l.price_cents, 0);

  // Telemetry is filtered to OPTIONAL lines that exist. A locked line cannot be
  // flipped, so a client reporting one has sent noise, and noise in a column
  // whose whole value is that it describes real hesitation is worse than a gap.
  const touchedIds = new Set(input.touched_line_ids);
  const touched = lines.filter((l) => l.optional && touchedIds.has(l.id)).map(snapshot);

  // Read before the insert so the alert can say "revised" without counting its
  // own row. The two facts are recorded independently - see their notes.
  let priorSubmissions: number | null = null;
  let isRevision = false;
  try {
    const { rows, total } = await supabaseRestCounted<{ id: string }>(
      `proposal_submissions?select=id&proposal_id=eq.${head.id}&limit=1`,
    );
    priorSubmissions = total ?? (rows.length === 0 ? 0 : null);
    // A row IS the answer to "has this happened before", with or without the
    // header that says how many times.
    isRevision = total != null ? total > 0 : rows.length > 0;
  } catch (err) {
    console.error(
      '[proposal submit] prior-submission count unavailable:',
      err instanceof Error ? err.message : String(err),
    );
  }

  try {
    await supabaseRest('POST', 'proposal_submissions', [{
      proposal_id: head.id,
      included_lines: included,
      total_cents: totalCents,
      touched_lines: touched,
      ip_address: ipAddress,
      // The column is TEXT and the header is attacker-controlled and unbounded.
      user_agent: userAgent ? userAgent.slice(0, MAX_USER_AGENT_CHARS) : null,
    }], { prefer: 'return=minimal' });
  } catch (err) {
    console.error('[proposal submit] insert failed:', err instanceof Error ? err.message : String(err));
    return { status: 'unreadable' };
  }

  return {
    status: 'ok',
    record: {
      proposalId: head.id,
      clientName: head.client_name,
      proposalTitle: head.title,
      leadId: head.lead_id,
      totalCents,
      included,
      declined,
      touched,
      isRevision,
      priorSubmissions,
    },
  };
}
