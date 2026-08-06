/**
 * Proposal Pod - Slice 2: the server-side store.
 *
 * Every write to proposals/proposal_lines goes through here, server-side with
 * the service key (the tables are deny-by-default; see 20260824000000). The
 * callers are the /api/admin/proposals routes, which the middleware already
 * gates behind an admin session - this module re-validates SHAPES, not auth.
 *
 * The import preview runs entirely in the admin's browser (parseProposalCsv is
 * pure), so what arrives here is the FINAL composition: ordinary lines plus
 * any bundles the admin composed. The schema enforces the money invariants
 * (integer cents, caps, bundle members summing to the bundle price); this
 * module enforces them too so an admin gets a readable error instead of a
 * constraint name.
 */
import { z } from 'zod';
import { supabaseRest, supabaseRestCounted } from '@/lib/notify/supabase-rest';
import { newProposalToken } from './token';
import { MAX_LINES, MAX_TITLE_CHARS, MAX_DESCRIPTION_CHARS, MAX_PRICE_CENTS } from './csv';

const BundleMemberSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE_CHARS),
  price_cents: z.number().int().min(0).max(MAX_PRICE_CENTS),
});

export const ProposalLineInputSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE_CHARS),
  description: z.string().trim().max(MAX_DESCRIPTION_CHARS).default(''),
  price_cents: z.number().int().min(0).max(MAX_PRICE_CENTS),
  optional: z.boolean(),
  category: z.string().trim().min(1).max(40),
  // A bundle is composed FROM imported lines, so it can never hold more
  // members than a CSV may hold lines. Same bound in the schema
  // (proposal_lines_bundle_member_cap), so neither layer is the only one
  // standing between an admin API call and an unbounded members array.
  bundle_members: z.array(BundleMemberSchema).min(2).max(MAX_LINES).nullish(),
});

/** Every write path shares one line-array bound: at least one, at most MAX_LINES. */
export const ProposalLinesSchema = z.array(ProposalLineInputSchema).min(1).max(MAX_LINES);

export const CreateProposalSchema = z.object({
  client_name: z.string().trim().min(1).max(120),
  client_email: z.string().trim().email().max(320).nullish(),
  title: z.string().trim().min(1).max(200),
  lead_id: z.string().uuid().nullish(),
  lines: ProposalLinesSchema,
});

/**
 * A refused state transition, as a type rather than a message the caller has
 * to string-match. The route maps this to 409; anything else is a 500.
 */
export class ProposalConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProposalConflictError';
  }
}

export type ProposalLineInput = z.infer<typeof ProposalLineInputSchema>;
export type CreateProposalInput = z.infer<typeof CreateProposalSchema>;

export interface ProposalRow {
  id: string;
  token: string;
  client_name: string;
  client_email: string | null;
  title: string;
  status: 'draft' | 'sent' | 'revoked';
  lead_id: string | null;
  sent_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A bundle's price must equal its members' sum - checked here so the admin
 * sees which line is wrong, and re-checked by the schema so a future writer
 * that skips this module still cannot store disagreeing money.
 */
export function bundleSumError(lines: ProposalLineInput[]): string | null {
  for (const l of lines) {
    if (!l.bundle_members) continue;
    const sum = l.bundle_members.reduce((acc, m) => acc + m.price_cents, 0);
    if (sum !== l.price_cents) {
      return `Bundle "${l.title}": members sum to ${sum} cents but the bundle price is ${l.price_cents} cents.`;
    }
  }
  return null;
}

/** A proposal_lines row exactly as it is stored, for snapshot-and-restore. */
interface StoredLine {
  id: string;
  proposal_id: string;
  position: number;
  title: string;
  description: string;
  price_cents: number;
  optional: boolean;
  category: string;
  bundle_members: { title: string; price_cents: number }[] | null;
}

const STORED_LINE_COLUMNS =
  'id,proposal_id,position,title,description,price_cents,optional,category,bundle_members';

async function insertLines(proposalId: string, lines: ProposalLineInput[]): Promise<void> {
  await supabaseRest('POST', 'proposal_lines', lines.map((l, i) => ({
    proposal_id: proposalId,
    position: i,
    title: l.title,
    description: l.description,
    price_cents: l.price_cents,
    optional: l.optional,
    category: l.category,
    bundle_members: l.bundle_members ?? null,
  })), { prefer: 'return=minimal' });
}

export async function createProposal(input: CreateProposalInput): Promise<ProposalRow> {
  const rows = await supabaseRest<ProposalRow[]>('POST', 'proposals', [{
    token: newProposalToken(),
    client_name: input.client_name,
    client_email: input.client_email ?? null,
    title: input.title,
    lead_id: input.lead_id ?? null,
  }]);
  const proposal = rows?.[0];
  if (!proposal) throw new Error('proposal insert returned no row');
  try {
    await insertLines(proposal.id, input.lines);
  } catch (err) {
    // A proposal without lines is a broken artifact - take the parent with it
    // (no submissions can exist yet, so the RESTRICT cannot fire).
    await supabaseRest('DELETE', `proposals?id=eq.${proposal.id}`, undefined, {
      prefer: 'return=minimal',
    }).catch(() => {});
    throw err;
  }
  return proposal;
}

/**
 * Replace a proposal's lines (the Re-import flow). Deliberately NOT allowed on
 * a revoked proposal - bring it back to draft first (restoreProposal, or a
 * re-send once there is a client page to send to), so a dead link cannot be
 * quietly repointed at new content.
 *
 * WHAT THAT GUARD IS AND IS NOT. It is a read-then-write: the status is read
 * here and the lines are swapped in two further requests, so what it refuses is
 * the DELIBERATE flow - an admin arming Re-import on a row that already reads
 * revoked, which is the case the roster's own disabled button and this 409 both
 * answer. What it cannot refuse is a revoke that lands in the millisecond
 * between the read and the swap: that re-import commits, and the proposal ends
 * up revoked with a new line set underneath it.
 *
 * That residual is accepted rather than engineered away. Both actors are the
 * same single-operator admin surface; a revoked proposal's link does not serve
 * at all while it is revoked, whatever its lines say, so the outcome is not a
 * live link repointed at new content but a dead one holding different rows; and
 * the only way back is restoreProposal, which puts the proposal in front of the
 * admin as a draft before anything can be sent. Closing it properly would mean
 * doing the check and the swap in one statement - a SECURITY DEFINER function -
 * which is machinery this pod does not need.
 *
 * Where PostgREST CAN carry a precondition it is carried, and that is the
 * module's rule: restoreProposal puts `status=eq.revoked` in the PATCH filter
 * so the write itself is the check. A conditional DELETE cannot be written the
 * same way here, because the condition lives on `proposals` and the rows being
 * deleted live on `proposal_lines`, and PostgREST has no cross-table filter.
 *
 * Old submissions keep their own snapshots by design (Slice 1's whole
 * argument), so replacing lines never rewrites what a client already agreed to.
 *
 * PostgREST gives us no transaction across the DELETE and the INSERT, so the
 * old rows are snapshotted first and put back if the insert throws - the same
 * compensation posture as createProposal, which deletes the parent when its
 * lines fail. A proposal with zero lines is a broken artifact, and a SENT one
 * is a live client link pointing at nothing.
 *
 * updated_at is NOT written here. proposal_lines_touch_proposal (20260824000000)
 * fires on every one of the deletes and inserts below and moves the parent's
 * updated_at itself, and proposals_set_updated_at would overwrite anything this
 * module sent anyway. A PATCH on top is a round trip that can only add a failure
 * mode: throwing after the lines are already correctly replaced, which sends the
 * admin to re-import a proposal that was never wrong.
 */
export async function replaceLines(proposalId: string, lines: ProposalLineInput[]): Promise<void> {
  const existing = await supabaseRest<{ id: string; status: string }[]>(
    'GET', `proposals?select=id,status&id=eq.${proposalId}&limit=1`,
  );
  const proposal = existing?.[0];
  if (!proposal) throw new Error('no such proposal');
  if (proposal.status === 'revoked') {
    throw new ProposalConflictError('proposal is revoked - restore it to draft before re-importing');
  }

  // Bounded by the same MAX_LINES the write side enforces, so this read cannot
  // silently truncate the set it is responsible for restoring.
  const previous = (await supabaseRest<StoredLine[]>(
    'GET',
    `proposal_lines?select=${STORED_LINE_COLUMNS}&proposal_id=eq.${proposalId}&order=position.asc&limit=${MAX_LINES}`,
  )) ?? [];

  // The deleted rows are already held in `previous`; asking PostgREST to
  // serialize them back is up to MAX_LINES of bundle_members blobs nobody reads.
  await supabaseRest('DELETE', `proposal_lines?proposal_id=eq.${proposalId}`, undefined, {
    prefer: 'return=minimal',
  });
  try {
    await insertLines(proposalId, lines);
  } catch (err) {
    await restorePreviousLines(proposalId, previous, lines.length);
    throw err;
  }
}

/**
 * How many lines the proposal actually holds right now.
 *
 * Null is "could not be read", never a number to act on - the caller is already
 * in a failure it is trying to describe, so this one must not add a claim of its
 * own on top of it.
 */
async function countLines(proposalId: string): Promise<number | null> {
  try {
    const { rows, total } = await supabaseRestCounted<{ id: string }>(
      `proposal_lines?select=id&proposal_id=eq.${proposalId}&limit=1`,
    );
    // The exact count answers when the header arrives. Without it, an empty
    // page is still proof of zero; a non-empty one says only "some".
    return total ?? (rows.length === 0 ? 0 : null);
  } catch {
    return null;
  }
}

/**
 * Best-effort undo of the DELETE above, and an honest report when even that
 * fails.
 *
 * This log line exists to be read during an incident and is the only signal the
 * operator gets, so it states what IS rather than what is feared. A failed
 * restore does not prove the proposal is empty: an insert whose response was
 * lost - a timeout, a reset connection, a 502 in front of PostgREST - commits
 * server-side anyway, and then the snapshot going back collides with
 * proposal_lines_position and throws for the one reason that means the NEW lines
 * are already in place. So the count is read back and the wording follows it,
 * with the repair matched to each case; the rows themselves are logged either
 * way, because they are what a repair would be built from.
 */
async function restorePreviousLines(
  proposalId: string, previous: StoredLine[], attemptedCount: number,
): Promise<void> {
  if (previous.length === 0) return;
  try {
    await supabaseRest('POST', 'proposal_lines', previous, { prefer: 'return=minimal' });
  } catch (restoreErr) {
    const held = await countLines(proposalId);
    const state = held === 0
      ? 'it now holds NO lines: re-import its CSV to repair it'
      : held == null
        ? 'its line count could not be read either: READ its lines before repairing anything'
        : held === attemptedCount
          ? `it holds ${held} line(s), the count the re-import was writing - the new set most likely `
            + 'landed and only its response was lost, so verify those lines rather than re-importing blind'
          : `it holds ${held} line(s), neither the ${previous.length} it started with nor the `
            + `${attemptedCount} the re-import was writing: READ its lines before repairing anything`;
    console.error(
      `PROPOSAL LINES AT RISK: re-import of proposal ${proposalId} failed AND its ${previous.length} previous `
      + `line(s) could not be put back - ${state}. `
      + `Restore error: ${restoreErr instanceof Error ? restoreErr.message : String(restoreErr)}`,
      JSON.stringify(previous),
    );
  }
}

/**
 * A roster row. The three counts are NULLABLE, and null means "not known right
 * now" rather than zero: when the counts aggregate cannot be read, the roster
 * still serves and says so instead of printing a confident 0.
 */
export interface RosterEntry extends ProposalRow {
  line_count: number | null;
  submission_count: number | null;
  latest_total_cents: number | null;
}

export interface Roster {
  proposals: RosterEntry[];
  /** False when the counts could not be read; the lifecycle controls still work. */
  counts_available: boolean;
  /**
   * Proposals matching the search, ignoring the page cap - so the page can say
   * how many it is NOT showing. Null when the total could not be read.
   */
  total: number | null;
  /**
   * True when this page stopped at the cap rather than at the estate.
   *
   * `total` alone was not enough to know that: it is read off Content-Range,
   * which a missing header, PostgREST's uncounted `*`, or a proxy that strips
   * the header all reduce to null - and a truncated page with no total rendered
   * with no notice at all, which is the silent truncation the count exists to
   * remove. The server knows without the header, so it says so directly and the
   * total only fills in the number. When the count IS readable it decides on its
   * own: a page as long as the cap is not truncated if that is the whole estate.
   */
  truncated: boolean;
}

/** How many proposals the roster shows; also the bound on the counts request. */
export const ROSTER_LIMIT = 200;

/** Longest search term the roster sends: this is a filter, not a document. */
export const MAX_SEARCH_CHARS = 80;

/**
 * The characters a search term cannot carry through literally: what is GRAMMAR
 * to the filter parser - the comma that separates or() branches, the parens
 * that bound them, the quote and backslash that quote a value - and what is a
 * WILDCARD to the matcher underneath it: LIKE's own % and _, and the * that
 * PostgREST itself translates into %.
 *
 * The last one is the one that actually reaches the pattern, so leaving it live
 * while neutralizing the rest meant the only wildcard the matcher ever saw was
 * one an admin typed by hand.
 */
const SEARCH_UNSENDABLE = /[,()"\\%_*]/g;

/**
 * A search term as a PostgREST ilike pattern.
 *
 * Every unsendable character stands in as `_`, ONE character rather than a run,
 * so the term keeps the shape the admin typed: "Smith, Jane" still finds its
 * row, no term can reach the parser as syntax, and a title holding a literal
 * asterisk finds itself instead of most of the estate.
 */
export function searchPattern(term: string): string {
  return `*${term.trim().slice(0, MAX_SEARCH_CHARS).replace(SEARCH_UNSENDABLE, '_')}*`;
}

/** The or() filter behind the roster's search box, ready to append to a path. */
function searchFilter(term: string): string {
  if (!term) return '';
  // A term of nothing BUT unsendable characters ("***") carries no information,
  // and the pattern it makes matches every row - a filter that quietly means
  // "everything" on a roster whose search exists to reach one proposal. It
  // matches nothing instead (id is the primary key, so it is never null), and
  // the page says no proposal matched rather than pretending they all did.
  if (!term.slice(0, MAX_SEARCH_CHARS).replace(SEARCH_UNSENDABLE, '').trim()) {
    return '&id=is.null';
  }
  const p = searchPattern(term);
  return `&or=${encodeURIComponent(
    `(client_name.ilike.${p},client_email.ilike.${p},title.ilike.${p})`,
  )}`;
}

interface RosterCountRow {
  proposal_id: string;
  line_count: number;
  submission_count: number;
  latest_total_cents: number | null;
}

/**
 * The roster: the proposals, plus their counts.
 *
 * The counts are aggregated in Postgres and returned one row per proposal
 * (proposal_roster_counts, 20260826000000), NOT by pulling every line and every
 * submission back and counting them in JS. That older shape was unbounded on
 * both reads, so PostgREST's max-rows cap would quietly truncate it once the
 * estate grew past a few full proposals and the admin would read a wrong count
 * as data loss. This response is bounded by the number of proposals asked for.
 *
 * The counts DEGRADE rather than blind the roster. They are a decoration on a
 * panel whose real job is Copy link, Re-import and above all Revoke - the D3
 * kill switch on a live client link - so an aggregate that is missing (the
 * window between this code deploying and its migration being hand-applied at
 * go-live) or simply failing must not take those buttons down with it. The
 * failure is logged server-side and reported to the page, which says the counts
 * are unavailable instead of showing zeros it cannot stand behind.
 *
 * The page itself is capped at ROSTER_LIMIT, so the response carries the exact
 * total as well and the caller can SEARCH past the cap. Without both, the
 * oldest-updated proposals simply vanished off the end of the list with nothing
 * saying so - and Copy link, Re-import and Revoke are rendered per row, so a
 * proposal that falls off the page is one whose live client link can no longer
 * be killed. The search is server-side (client name, email, title) precisely so
 * that reachability does not depend on where a proposal sits in the order.
 */
export async function listProposals(search?: string | null): Promise<Roster> {
  const term = (search ?? '').trim();
  const { rows, total } = await supabaseRestCounted<ProposalRow>(
    `proposals?select=*${searchFilter(term)}&order=updated_at.desc&limit=${ROSTER_LIMIT}`,
  );
  const proposals = rows ?? [];
  // The exact count decides whenever it arrives. A full page is only EVIDENCE
  // of a cap, and it is wrong for an estate of exactly ROSTER_LIMIT - which
  // would tell the admin their oldest proposals were hidden while every one of
  // them was on screen. The fallback is for the case the count is unreadable,
  // which is the only case it was ever needed for.
  const truncated = total != null ? total > proposals.length : proposals.length >= ROSTER_LIMIT;
  if (proposals.length === 0) {
    return { proposals: [], counts_available: true, total, truncated };
  }

  let counts: RosterCountRow[] | null = null;
  try {
    counts = (await supabaseRest<RosterCountRow[]>(
      'POST', 'rpc/proposal_roster_counts', { proposal_ids: proposals.map((p) => p.id) },
    )) ?? [];
  } catch (err) {
    console.error(
      'proposal roster counts unavailable (serving the roster without them):',
      err instanceof Error ? err.message : String(err),
    );
  }
  if (!counts) {
    return {
      proposals: proposals.map((p) => ({
        ...p, line_count: null, submission_count: null, latest_total_cents: null,
      })),
      counts_available: false,
      total,
      truncated,
    };
  }

  // A proposal the aggregate answered for gets its numbers; one it did NOT gets
  // nulls, never zeros. The function selects one row per id that exists, so a
  // missing row means the answer is short - a response truncated by max-rows, a
  // proposal deleted between the two reads, an empty body behind a 200 - and
  // "0 lines, 0 submissions" is a claim none of those support. Null is this
  // module's word for not known right now, and the roster renders it as such.
  // The banner stays down: it speaks for the whole aggregate, which arrived.
  const byId = new Map(counts.map((c) => [c.proposal_id, c]));
  return {
    proposals: proposals.map((p) => {
      const c = byId.get(p.id);
      return {
        ...p,
        line_count: c ? c.line_count : null,
        submission_count: c ? c.submission_count : null,
        // Null from a row that IS present is the honest "no submission yet".
        latest_total_cents: c ? c.latest_total_cents : null,
      };
    }),
    counts_available: true,
    total,
    truncated,
  };
}

/**
 * Revoke: the explicit admin kill switch (owner decision D3).
 *
 * updated_at is not written here for the reason replaceLines gives above:
 * proposals_set_updated_at owns that column, and a value sent from this module
 * is overwritten before the row is written.
 */
export async function revokeProposal(proposalId: string): Promise<void> {
  await supabaseRest('PATCH', `proposals?id=eq.${proposalId}`, {
    status: 'revoked',
    revoked_at: new Date().toISOString(),
  }, { prefer: 'return=minimal' });
}

/**
 * Restore: revoked -> draft, the way back from the kill switch.
 *
 * Revoking is meant to be reversible - the lifecycle has always said so, and
 * re-sending was the documented way back. But re-sending needs a client page to
 * send a link TO, and that is Slice 3, so until it lands a revoked proposal had
 * exactly one control left (Copy link): Revoke hides itself once used, Send is
 * refused while CLIENT_PAGE_LIVE is false, and re-import is refused while the
 * status reads revoked. This is the door that does not depend on any of that,
 * and it stays the right one afterwards: a proposal whose lines are wrong is
 * repaired as a draft and sent again, rather than being re-sent to a client in
 * order to earn the right to fix it.
 *
 * The filter carries the precondition, so the write itself is the check: only a
 * row that is still revoked when this reaches Postgres is updated, and an empty
 * result is the refusal. A read-then-write would decide on a status that could
 * have changed in between - and the lifecycle CHECK
 * (proposals_revoked_at_matches_status) is what makes clearing revoked_at part
 * of leaving 'revoked' rather than a second statement that could be forgotten.
 * sent_at is deliberately left alone: a proposal that was sent did send, and the
 * schema keeps that timestamp for exactly that reason.
 */
export async function restoreProposal(proposalId: string): Promise<void> {
  const rows = await supabaseRest<ProposalRow[]>(
    'PATCH', `proposals?id=eq.${proposalId}&status=eq.revoked`,
    { status: 'draft', revoked_at: null },
  );
  if (!rows || rows.length === 0) {
    throw new ProposalConflictError('only a revoked proposal can be restored - this one is not revoked');
  }
}

/**
 * Move a proposal's `updated_at` forward, changing nothing else.
 *
 * A draft's link is live for `DRAFT_LINK_LIFETIME_MS` measured from that column
 * (publicView.ts), and the send route calls this BEFORE it hands the email to
 * the mailer. That ordering is the point: the write that was supposed to move
 * the timestamp is `markSent`, and the case worth covering is `markSent`
 * FAILING after a client's inbox already holds the link. Touching first makes a
 * delivered link live for the whole window whatever fails behind it, instead of
 * re-running the same kind of write in the same outage.
 *
 * The payload is the status the caller just read, filtered on that same status,
 * for two reasons. `proposals_set_updated_at` owns `updated_at` and overwrites
 * anything this module sends for it, so what is needed is any successful UPDATE
 * on the row rather than a value. And writing back a status that is still the
 * stored one cannot trip a lifecycle CHECK, while the filter means a status
 * changed by somebody else in between updates nothing at all rather than being
 * quietly reverted.
 *
 * NEVER THROWS, and REPORTS. The lifetime of a link is not a precondition for
 * delivering a proposal an admin asked to send, so a failure here is logged and
 * swallowed - but the caller has to know, because what it tells the admin about
 * the client's access afterwards is only true if this landed. False is "not
 * refreshed, or not known to be", which is the answer that makes somebody act.
 *
 * The UPDATED ROWS are what that report is read off, which is why this asks for
 * a representation rather than the cheaper `return=minimal`. The filter above
 * can match nothing - that is the whole point of it - and a PATCH that matched
 * no row is a 204 under `return=minimal`, indistinguishable from one that
 * wrote. So "did not throw" is not "did write": a status changed between the
 * caller's read and this statement would have answered true over a timestamp
 * that never moved, and every sentence the callers build on that boolean
 * promises a window the link does not have. Zero rows is `false`, like any
 * other refresh that did not happen.
 */
export async function touchProposal(
  proposalId: string,
  status: ProposalRow['status'],
): Promise<boolean> {
  try {
    const rows = await supabaseRest<ProposalRow[]>(
      'PATCH', `proposals?id=eq.${proposalId}&status=eq.${status}`,
      { status },
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch (err) {
    console.error(
      `proposal ${proposalId} link-window refresh failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return false;
  }
}

async function patchSent(proposalId: string): Promise<void> {
  await supabaseRest('PATCH', `proposals?id=eq.${proposalId}`, {
    status: 'sent',
    sent_at: new Date().toISOString(),
    revoked_at: null,
  }, { prefer: 'return=minimal' });
}

/**
 * Mark sent (also the un-revoke path: sending a revoked proposal revives it).
 * The lifecycle CHECK requires revoked_at to clear when status leaves
 * 'revoked', and sent_at to exist while status is 'sent'.
 *
 * The caller reaches here only AFTER the client's inbox already holds the
 * tokenized link, so this write is what keeps the record and the inbox saying
 * the same thing: a proposal left at 'revoked' behind a link a client just
 * received is the dead end CLIENT_PAGE_LIVE exists to prevent, arriving through
 * the back door. A PATCH by id is idempotent, so a transient failure is retried
 * once here rather than costing the admin a second email.
 */
export async function markSent(proposalId: string): Promise<void> {
  try {
    await patchSent(proposalId);
  } catch (err) {
    console.error(
      `proposal ${proposalId} status write failed after delivery, retrying once:`,
      err instanceof Error ? err.message : String(err),
    );
    await patchSent(proposalId);
  }
}
