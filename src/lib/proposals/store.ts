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
    await supabaseRest('DELETE', `proposals?id=eq.${proposal.id}`).catch(() => {});
    throw err;
  }
  return proposal;
}

/**
 * Replace a proposal's lines (the Re-import flow). Deliberately NOT allowed on
 * a revoked proposal - un-revoke by sending first, so a dead link cannot be
 * quietly repointed at new content.
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
    throw new ProposalConflictError('proposal is revoked - re-send it before re-importing');
  }

  // Bounded by the same MAX_LINES the write side enforces, so this read cannot
  // silently truncate the set it is responsible for restoring.
  const previous = (await supabaseRest<StoredLine[]>(
    'GET',
    `proposal_lines?select=${STORED_LINE_COLUMNS}&proposal_id=eq.${proposalId}&order=position.asc&limit=${MAX_LINES}`,
  )) ?? [];

  await supabaseRest('DELETE', `proposal_lines?proposal_id=eq.${proposalId}`);
  try {
    await insertLines(proposalId, lines);
  } catch (err) {
    await restorePreviousLines(proposalId, previous);
    throw err;
  }
}

/**
 * Best-effort undo of the DELETE above. If even this fails the proposal really
 * does have no lines, which an operator must know about NOW - so it is logged
 * loudly, with the id to re-import against and the rows themselves, rather than
 * swallowed behind the original error.
 */
async function restorePreviousLines(proposalId: string, previous: StoredLine[]): Promise<void> {
  if (previous.length === 0) return;
  try {
    await supabaseRest('POST', 'proposal_lines', previous, { prefer: 'return=minimal' });
  } catch (restoreErr) {
    console.error(
      `PROPOSAL DATA LOSS: re-import of proposal ${proposalId} failed AND its ${previous.length} previous ` +
      'line(s) could not be restored - the proposal now has no lines. Re-import its CSV to repair it. ' +
      `Restore error: ${restoreErr instanceof Error ? restoreErr.message : String(restoreErr)}`,
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
   * total only fills in the number.
   */
  truncated: boolean;
}

/** How many proposals the roster shows; also the bound on the counts request. */
export const ROSTER_LIMIT = 200;

/** Longest search term the roster sends: this is a filter, not a document. */
export const MAX_SEARCH_CHARS = 80;

/**
 * A search term as a PostgREST ilike pattern.
 *
 * Everything that is GRAMMAR to the filter parser becomes the wildcard it
 * stands in place of: the comma that separates or() branches, the parens that
 * bound them, the quote and backslash that quote a value. So "Smith, Jane"
 * still finds its row, and no term can reach the parser as syntax. % and _ go
 * the same way - they are LIKE's own wildcards, and an admin typing one means
 * the character rather than "anything".
 */
export function searchPattern(term: string): string {
  return `*${term.trim().slice(0, MAX_SEARCH_CHARS).replace(/[,()"\\%_]/g, '*')}*`;
}

/** The or() filter behind the roster's search box, ready to append to a path. */
function searchFilter(term: string): string {
  if (!term) return '';
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
  // Either signal is enough: a full page means the cap cut it, and a total
  // above the page means so too when the header did arrive.
  const truncated = proposals.length >= ROSTER_LIMIT || (total != null && total > proposals.length);
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

  const byId = new Map(counts.map((c) => [c.proposal_id, c]));
  return {
    proposals: proposals.map((p) => {
      const c = byId.get(p.id);
      return {
        ...p,
        line_count: c?.line_count ?? 0,
        submission_count: c?.submission_count ?? 0,
        latest_total_cents: c?.latest_total_cents ?? null,
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
