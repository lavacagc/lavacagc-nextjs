/**
 * Proposal Pod - Slice 3: the client-facing read.
 *
 * The token IS the authorisation. `proposals`, `proposal_lines` and
 * `proposal_submissions` are all RLS-on with no policies (20260824000000), so
 * the publishable key that ships in the browser bundle can read none of them;
 * this module runs server-side with the secret key and hands the page a
 * projection that has already had everything client-unsafe removed.
 *
 * TWO THINGS ARE REMOVED, and they are removed HERE rather than in the page, so
 * every future caller inherits the same contract:
 *
 *  1. **Member prices.** A bundle is one client-facing line: a name, ONE price,
 *     and the member TITLES (owner decision, slice 2). The per-member cents are
 *     the admin's working, and the whole point of bundling is that the client
 *     does not see them. `bundle_members` is read and reduced to titles before
 *     it can reach a serializer.
 *  2. **Everything not rendered.** No `token`, no `lead_id`, no timestamps. What
 *     a server component passes to a client component is serialized into the
 *     HTML, so a field carried "just in case" is a field published.
 *
 * THREE STATES, and they must stay distinct - the same posture as
 * src/app/intake/[token]/page.tsx:
 *
 *   ok         - a proposal we found and may serve.
 *   missing    - a token that is not ours, a proposal that is revoked, or a
 *                DRAFT whose 24-hour window has run out. ONE answer for all of
 *                them, deliberately: a page that told them apart would let
 *                anyone test whether a token is live.
 *   unreadable - we could not ask. Telling somebody holding a good link that it
 *                is invalid sends them away for good.
 */
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { iconForCategory } from './categories';
import { MAX_LINES } from './csv';

/**
 * The token recipe, mirroring `proposals_token_recipe` in 20260824000000.
 *
 * Checked BEFORE any database round trip: a malformed token cannot match a
 * column CHECKed against this pattern, so asking is a query that is guaranteed
 * to return nothing, and the cheapest way to answer a scanner walking the route
 * is not to ask at all.
 */
export const PROPOSAL_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/**
 * How long a DRAFT's link stays live, measured from `updated_at` (owner
 * decision, 5 Aug 2026). ONE number, read by both doors below.
 *
 * A draft has to open at all because Copy link is offered on one in the roster,
 * and the client an admin pastes it to has to be able to answer - preview-only
 * was considered and rejected. Bounding the window to a day bounds the hazard
 * that openness creates, which is an accidental tap recording a submission on a
 * proposal nobody ever sent, without breaking hand delivery.
 *
 * `updated_at` rather than `created_at`, deliberately: `proposal_lines_touch_proposal`
 * (20260824000000) moves it on every re-import, so correcting a draft's lines
 * reopens its proof-reading window, and an untouched draft still expires 24
 * hours after creation because the two columns are equal then.
 *
 * A SENT proposal is untouched by this. Owner decision D3 governs that link - no
 * hard expiry, revocable from the admin - and still does.
 */
export const DRAFT_LINK_LIFETIME_MS = 24 * 60 * 60 * 1000;

/** The stored lifecycle, mirroring the `proposals_status_check` of 20260824000000. */
export type ProposalStatus = 'draft' | 'sent' | 'revoked';

/**
 * May this proposal's link serve at all?
 *
 * ONE rule for both doors - the lookup below and `submitProposal` - so the
 * submit route can never accept an answer on a link the page would no longer
 * serve. Every `false` is answered as `missing`, identically to a token that
 * was never ours.
 *
 * An `updated_at` we cannot read closes the window rather than opening it. The
 * column is `NOT NULL DEFAULT now()`, so this is unreachable from a healthy
 * database; if it ever is reached, a draft that stops resolving is recoverable
 * (re-import, or Send it) and a draft that never stops is not.
 *
 * A type PREDICATE rather than a plain boolean, so a caller that has taken the
 * early return holds a status the client projection can carry: 'revoked' cannot
 * survive this check, and the compiler is the one saying so.
 */
export function proposalLinkIsLive<T extends { status: ProposalStatus; updated_at: string | null }>(
  head: T,
  now: number = Date.now(),
): head is T & { status: Exclude<ProposalStatus, 'revoked'> } {
  if (head.status === 'revoked') return false;
  if (head.status !== 'draft') return true;
  const touched = head.updated_at ? Date.parse(head.updated_at) : NaN;
  if (Number.isNaN(touched)) return false;
  return now - touched < DRAFT_LINK_LIFETIME_MS;
}

/** A line as the client's browser is allowed to see it. */
export interface PublicProposalLine {
  id: string;
  title: string;
  description: string;
  price_cents: number;
  optional: boolean;
  /** Registry category slug, kept for the icon lookup and for test assertions. */
  category: string;
  /** The lucide icon name the registry assigns this category (WEB-024). */
  icon: string;
  /** Bundle member TITLES. Empty for an ordinary line. Never prices. */
  includes: string[];
}

/** A proposal as the client's browser is allowed to see it. */
export interface PublicProposal {
  id: string;
  title: string;
  clientName: string;
  status: 'draft' | 'sent';
  lines: PublicProposalLine[];
  /** The lines the client cannot decline, summed. */
  lockedTotalCents: number;
}

export type ProposalLookup =
  | { state: 'ok'; proposal: PublicProposal }
  | { state: 'missing' }
  | { state: 'unreadable' };

/**
 * The columns the client read needs, and not one more.
 *
 * `updated_at` is read to judge the draft window and never travels into the
 * projection below - see the note on timestamps at the top of this file.
 */
const PROPOSAL_COLUMNS = 'id,client_name,title,status,updated_at';
const LINE_COLUMNS = 'id,position,title,description,price_cents,optional,category,bundle_members';

interface ProposalHead {
  id: string;
  client_name: string;
  title: string;
  status: ProposalStatus;
  updated_at: string | null;
}

interface LineRow {
  id: string;
  position: number;
  title: string;
  description: string | null;
  price_cents: number;
  optional: boolean;
  category: string;
  bundle_members: { title: string; price_cents: number }[] | null;
}

/**
 * Strip a stored line to what the client may see.
 *
 * `bundle_members` arrives as objects carrying prices and leaves as titles.
 * That mapping is the single place the member-price contract is enforced, and
 * it is why this returns a NEW object rather than spreading the row: a spread
 * would carry every column the SELECT happened to include, and the next person
 * to add a column to that list would publish it without noticing.
 */
function toPublicLine(row: LineRow): PublicProposalLine {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    price_cents: row.price_cents,
    optional: row.optional,
    category: row.category,
    icon: iconForCategory(row.category),
    includes: (row.bundle_members ?? []).map((m) => m.title),
  };
}

/**
 * Resolve a token to the proposal it names.
 *
 * Deliberately does NOT rate limit: the caller owns that, because only the
 * caller knows whether this lookup is a page view (charge failures only, so a
 * real recipient behind a carrier NAT is never throttled onto an error page) or
 * a submission (charge everything).
 */
export async function lookupPublicProposal(token: string): Promise<ProposalLookup> {
  if (!PROPOSAL_TOKEN_RE.test(token)) return { state: 'missing' };

  let head: ProposalHead | undefined;
  try {
    const rows = await supabaseRest<ProposalHead[]>(
      'GET',
      `proposals?select=${PROPOSAL_COLUMNS}&token=eq.${encodeURIComponent(token)}&limit=1`,
    );
    head = rows?.[0];
  } catch (err) {
    // The message, never the error object: this query is keyed on the token
    // itself, and supabaseRest blanks credentials out of what it throws.
    console.error('[proposal] token lookup failed:', err instanceof Error ? err.message : String(err));
    return { state: 'unreadable' };
  }

  if (!head) return { state: 'missing' };
  // The D3 kill switch, and the draft window. Same answer as an unknown token
  // for both, on purpose.
  if (!proposalLinkIsLive(head)) return { state: 'missing' };

  let lines: LineRow[];
  try {
    lines = (await supabaseRest<LineRow[]>(
      'GET',
      `proposal_lines?select=${LINE_COLUMNS}&proposal_id=eq.${head.id}&order=position.asc&limit=${MAX_LINES}`,
    )) ?? [];
  } catch (err) {
    console.error('[proposal] line read failed:', err instanceof Error ? err.message : String(err));
    return { state: 'unreadable' };
  }

  // A proposal with no lines is a broken artifact, not a dead link. Both write
  // paths guarantee at least one (createProposal deletes the parent when its
  // lines fail; replaceLines puts the old set back), so reaching here means
  // something went wrong on OUR side - which is what 'unreadable' says, and it
  // is the state whose page tells the client their link is probably fine.
  if (lines.length === 0) {
    console.error(`[proposal] proposal ${head.id} resolved but holds no lines`);
    return { state: 'unreadable' };
  }

  const publicLines = lines.map(toPublicLine);
  return {
    state: 'ok',
    proposal: {
      id: head.id,
      title: head.title,
      clientName: head.client_name,
      status: head.status,
      lines: publicLines,
      lockedTotalCents: publicLines
        .filter((l) => !l.optional)
        .reduce((acc, l) => acc + l.price_cents, 0),
    },
  };
}
