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
  bundle_members: z.array(BundleMemberSchema).min(2).nullish(),
});

export const CreateProposalSchema = z.object({
  client_name: z.string().trim().min(1).max(120),
  client_email: z.string().trim().email().max(320).nullish(),
  title: z.string().trim().min(1).max(200),
  lead_id: z.string().uuid().nullish(),
  lines: z.array(ProposalLineInputSchema).min(1).max(MAX_LINES),
});

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
 */
export async function replaceLines(proposalId: string, lines: ProposalLineInput[]): Promise<void> {
  const existing = await supabaseRest<{ id: string; status: string }[]>(
    'GET', `proposals?select=id,status&id=eq.${proposalId}&limit=1`,
  );
  const proposal = existing?.[0];
  if (!proposal) throw new Error('no such proposal');
  if (proposal.status === 'revoked') throw new Error('proposal is revoked - re-send it before re-importing');
  await supabaseRest('DELETE', `proposal_lines?proposal_id=eq.${proposalId}`);
  await insertLines(proposalId, lines);
  await supabaseRest('PATCH', `proposals?id=eq.${proposalId}`, {
    updated_at: new Date().toISOString(),
  }, { prefer: 'return=minimal' });
}

export interface RosterEntry extends ProposalRow {
  line_count: number;
  submission_count: number;
  latest_total_cents: number | null;
}

export async function listProposals(): Promise<RosterEntry[]> {
  const proposals = (await supabaseRest<ProposalRow[]>(
    'GET', 'proposals?select=*&order=updated_at.desc&limit=200',
  )) ?? [];
  if (proposals.length === 0) return [];
  const ids = proposals.map((p) => p.id).join(',');
  const [lines, subs] = await Promise.all([
    supabaseRest<{ proposal_id: string }[]>(
      'GET', `proposal_lines?select=proposal_id&proposal_id=in.(${ids})`,
    ),
    supabaseRest<{ proposal_id: string; total_cents: number; created_at: string }[]>(
      'GET', `proposal_submissions?select=proposal_id,total_cents,created_at&proposal_id=in.(${ids})&order=created_at.desc`,
    ),
  ]);
  const lineCount = new Map<string, number>();
  for (const l of lines ?? []) lineCount.set(l.proposal_id, (lineCount.get(l.proposal_id) ?? 0) + 1);
  const subCount = new Map<string, number>();
  const latest = new Map<string, number>();
  for (const s of subs ?? []) {
    subCount.set(s.proposal_id, (subCount.get(s.proposal_id) ?? 0) + 1);
    if (!latest.has(s.proposal_id)) latest.set(s.proposal_id, s.total_cents);
  }
  return proposals.map((p) => ({
    ...p,
    line_count: lineCount.get(p.id) ?? 0,
    submission_count: subCount.get(p.id) ?? 0,
    latest_total_cents: latest.get(p.id) ?? null,
  }));
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
