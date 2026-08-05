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
import { supabaseRest } from '@/lib/notify/supabase-rest';
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
  await supabaseRest('PATCH', `proposals?id=eq.${proposalId}`, {
    updated_at: new Date().toISOString(),
  }, { prefer: 'return=minimal' });
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

export interface RosterEntry extends ProposalRow {
  line_count: number;
  submission_count: number;
  latest_total_cents: number | null;
}

/** How many proposals the roster shows; also the bound on the counts request. */
export const ROSTER_LIMIT = 200;

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
 */
export async function listProposals(): Promise<RosterEntry[]> {
  const proposals = (await supabaseRest<ProposalRow[]>(
    'GET', `proposals?select=*&order=updated_at.desc&limit=${ROSTER_LIMIT}`,
  )) ?? [];
  if (proposals.length === 0) return [];
  const counts = (await supabaseRest<RosterCountRow[]>(
    'POST', 'rpc/proposal_roster_counts', { proposal_ids: proposals.map((p) => p.id) },
  )) ?? [];
  const byId = new Map(counts.map((c) => [c.proposal_id, c]));
  return proposals.map((p) => {
    const c = byId.get(p.id);
    return {
      ...p,
      line_count: c?.line_count ?? 0,
      submission_count: c?.submission_count ?? 0,
      latest_total_cents: c?.latest_total_cents ?? null,
    };
  });
}

/** Revoke: the explicit admin kill switch (owner decision D3). */
export async function revokeProposal(proposalId: string): Promise<void> {
  await supabaseRest('PATCH', `proposals?id=eq.${proposalId}`, {
    status: 'revoked',
    revoked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { prefer: 'return=minimal' });
}

/**
 * Mark sent (also the un-revoke path: sending a revoked proposal revives it).
 * The lifecycle CHECK requires revoked_at to clear when status leaves
 * 'revoked', and sent_at to exist while status is 'sent'.
 */
export async function markSent(proposalId: string): Promise<void> {
  await supabaseRest('PATCH', `proposals?id=eq.${proposalId}`, {
    status: 'sent',
    sent_at: new Date().toISOString(),
    revoked_at: null,
    updated_at: new Date().toISOString(),
  }, { prefer: 'return=minimal' });
}
