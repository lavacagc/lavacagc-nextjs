'use client';

/**
 * Customers -> Proposals (Proposal Pod, Slice 2; customer-first since round 9).
 *
 * One search bar drives the page. Typing searches PEOPLE - saved customers
 * (leads) and the clients on existing proposals together, so a client who only
 * ever arrived as a CSV import stays findable - and selecting someone scopes
 * the page to them: their proposals with the lifecycle buttons (Copy link,
 * Send, Revoke, Restore), Open & modify (loads the proposal into the builder;
 * Save replaces its lines on the same client link), and a New-proposal button
 * pre-filled with them. With nobody selected the page lists the most recent
 * proposals, so the day's work is one glance away.
 *
 * The importer: paste or drop the estimator's client-safe CSV, review the
 * parsed preview - the category registry's locked/optional badge on every
 * line with a per-line override switch - COMBINE lines into named bundles,
 * then Create (draft) and Send. Collapsed behind one click since round 9
 * (building by hand is the front door now), and armed re-imports open it.
 *
 * The preview runs entirely in the browser: parseProposalCsv and the category
 *  registry are pure modules, so nothing exists server-side until Create.
 * Bundling: drag one row onto another (desktop nicety) or tick rows and press
 * Combine (the touch/keyboard path - mobile-first per the approved plan). A
 * bundle shows one name (admin-chosen), ONE summed price, and its member
 * titles; member prices stay admin-side only.
 *
 * House rule honored: every control keeps the global 44px touch minimum -
 * buttons through globals.css, and the controls that base rule does not reach
 * explicitly: the row's selection checkbox through the padded label around it,
 * and the two text fields on the touch path - roster search, and a bundle's
 * name - sized to it directly.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  RefreshCw, Link2, Send, Ban, Upload, Boxes, X, FileUp, Undo2, Search, RotateCcw, Clock3,
  Pencil, UserRound, Loader2,
} from 'lucide-react';
import { parseProposalCsv, type ParsedProposalLine } from '@/lib/proposals/csv';
import { ProposalBuilder, type EditableStoredLine } from '@/components/admin/ProposalBuilder';
import type { CustomerHit } from '@/components/admin/CustomerSearch';
import {
  composeBundle, lockedMemberTitles, restoreMembers, toStoredMembers, type PreviewBundleMember,
} from '@/lib/proposals/bundles';
import { CLIENT_PAGE_LIVE, CLIENT_PAGE_NOT_LIVE_MESSAGE } from '@/lib/proposals/clientPage';
import { DRAFT_WINDOW_HOURS, draftLinkHasExpired } from '@/lib/proposals/linkWindow';
import { cn } from '@/lib/utils';

/** One preview row: an imported line, or a bundle the admin composed. */
interface PreviewRow {
  key: string;
  title: string;
  description: string;
  priceCents: number;
  optional: boolean;
  category: string;
  /**
   * The verdict this row was BADGED with when it entered the preview - the
   * registry's for an imported line, and the registry's again for a line
   * Unbundle put back. `optional` differing from it is the admin's own
   * override, which is what previewHasEdits is asking about.
   *
   * Carried rather than re-derived: categorizeLine walks the whole keyword
   * registry, previewHasEdits runs over every row, and renameBundle rebuilds
   * the rows array on every keystroke in a bundle name - so re-deriving it put
   * a registry sweep of the entire preview behind each character typed. The
   * registry's answer for a given title never changes, so reading it once where
   * the row is built is both cheaper and the same answer.
   *
   * On a bundle it is composeBundle's initialized badge, for the same reading:
   * what the row was created with, before any flip on it.
   */
  registryOptional: boolean;
  /**
   * Present only on bundles: the composed members (admin-side only). These
   * carry the members' descriptions so Unbundle is lossless in the preview;
   * toStoredMembers drops them on the way to the API.
   */
  members?: PreviewBundleMember[];
}

interface RosterEntry {
  id: string;
  client_name: string;
  client_email: string | null;
  title: string;
  status: 'draft' | 'sent' | 'revoked';
  token: string;
  /** Null when the counts aggregate could not be read - unknown, not zero. */
  line_count: number | null;
  submission_count: number | null;
  latest_total_cents: number | null;
  updated_at: string;
}

/**
 * A person the search bar can land on - merged from two sources so both kinds
 * of client resolve to one row: saved customers (leads, which carry a phone
 * and an id the builder links new proposals to) and the client names already
 * on proposals (which may never have had a lead row at all).
 */
interface ClientHit {
  key: string;
  name: string;
  email: string | null;
  phone: string | null;
  leadId: string | null;
  proposalCount: number;
}

/** One identity per person: email when there is one, otherwise the name. */
const clientKey = (email: string | null, name: string) =>
  (email?.trim().toLowerCase()) || `name:${name.trim().toLowerCase()}`;

/**
 * Merge the two searches. Lead hits come first (they carry the richer
 * identity), then proposal clients fold in - a lead who also has proposals
 * gains the count, a proposal-only client gains a row of their own.
 */
function mergeClientHits(leads: CustomerHit[], proposals: RosterEntry[]): ClientHit[] {
  const map = new Map<string, ClientHit>();
  for (const l of leads) {
    const name = l.name?.trim() || l.email || 'Unknown';
    const key = clientKey(l.email, name);
    if (!map.has(key)) {
      map.set(key, { key, name, email: l.email, phone: l.phone, leadId: l.id, proposalCount: 0 });
    }
  }
  for (const p of proposals) {
    const key = clientKey(p.client_email, p.client_name);
    const existing = map.get(key);
    if (existing) existing.proposalCount += 1;
    else map.set(key, { key, name: p.client_name, email: p.client_email, phone: null, leadId: null, proposalCount: 1 });
  }
  return [...map.values()].slice(0, 12);
}

/** Does this roster row belong to the selected person? Email decides when both
 * sides have one; the exact name carries clients whose proposals were imported
 * without an email. Either match keeps the row - a client can have both kinds. */
function belongsTo(p: RosterEntry, c: ClientHit): boolean {
  if (c.email && p.client_email && p.client_email.trim().toLowerCase() === c.email.trim().toLowerCase()) return true;
  return p.client_name.trim().toLowerCase() === c.name.trim().toLowerCase();
}

/** How many recent proposals the fresh page lists before pointing at search. */
const RECENT_LIMIT = 8;

/**
 * The drag-and-drop payload type a preview row starts a drag with, and the only
 * one a preview row acts on when something is dropped. A file drag carries
 * 'Files' and nothing of ours, so it cannot be mistaken for a row.
 */
const ROW_DRAG_TYPE = 'application/x-lavaca-proposal-row';

/** The lifecycle transitions a roster row can ask the API for. */
type LifecycleAction = 'send' | 'revoke' | 'restore';

/**
 * What each transition asks before it runs, and what it says when it lands.
 *
 * Revoke and Restore both change what a link a client may already be holding
 * does, so both ask - the same posture, in both directions. Send asks nothing:
 * it is refused outright while the client page does not exist, and delivering a
 * proposal the admin has just reviewed is the ordinary path.
 */
const CONFIRMS: Record<LifecycleAction, ((p: RosterEntry) => string) | null> = {
  send: null,
  revoke: (p) => `Revoke ${p.client_name}'s link? The page stops resolving until you restore or re-send it.`,
  restore: (p) => `Restore ${p.client_name}'s proposal to draft? Its link starts resolving again, and you can re-import its lines.`,
};

const DONE: Record<LifecycleAction, string> = {
  send: 'Sent', revoke: 'Revoked', restore: 'Restored to draft',
};

const dollars = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

let nextKey = 0;
const rowKey = () => `row-${nextKey++}`;

/**
 * A roster action as a square icon button that grows its label on hover.
 *
 * Owner's call, from the mobile review: the four lifecycle buttons bunched into
 * an unreadable block of pills on a phone, so they are icons there and Send
 * moves out to its own full-width button. On a pointer the label slides open on
 * hover, which is the only place a hover affordance means anything.
 *
 * The label opens from `lg` up ONLY, and that is a width decision rather than an
 * input one. An opening label has to be paid for in row width, and the width has
 * to be reserved or the label steals it from the client's name; the admin shell
 * this page ships inside spends 64px on the sidebar rail plus its container and
 * card padding, so at a 768px tablet there is no room to reserve and the icons
 * stay plain 44px squares with nothing to reserve and no reflow to prevent. See
 * the roster row's actions container for the reservation itself.
 *
 * The label is never the accessible name - `aria-label` carries it whether the
 * label is open, closed, or (on a phone) never rendered at all, so a screen
 * reader and Playwright both read the same button they always did.
 *
 * Two tooltips, deliberately:
 *  - `title` is the ordinary pointer tooltip for a control that WORKS.
 *  - `disabledReason` is why a control does not, and it is a different job.
 *    A disabled button cannot show a tooltip at all - the shared button base
 *    carries `disabled:pointer-events-none`, so the button is not a hit target
 *    and neither `:hover` nor the native tooltip ever fires on it. The reason
 *    therefore rides on the WRAPPER, which does take pointer events and is what
 *    a hover over the glyph actually lands on. A phone has no tooltip at all,
 *    so a stated reason also stops hiding the label: an unavailable control is
 *    never a wordless grey glyph, at any width or on any device. `disabled`
 *    itself stays on the button, so the semantics do not move.
 *
 * 44px square: the house minimum, and globals.css only guarantees the height.
 */
function IconAction({
  icon: Icon, label, title, disabledReason, onClick, disabled, testId,
}: {
  icon: typeof Link2;
  label: string;
  title?: string;
  disabledReason?: string;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  /** Unavailable AND able to say why - the only case that shows words unasked. */
  const explained = Boolean(disabled && disabledReason);
  const tooltip = explained ? disabledReason : title ?? label;
  return (
    <span className="inline-flex shrink-0" title={tooltip}>
      <Button
        size="sm"
        variant="outline"
        className={cn(
          'group h-11 shrink-0 justify-center overflow-hidden transition-[width,padding] duration-200',
          explained
            ? 'w-auto px-3'
            : 'w-11 p-0 lg:hover:w-auto lg:hover:px-3 lg:focus-visible:w-auto lg:focus-visible:px-3',
        )}
        aria-label={label}
        title={tooltip}
        disabled={disabled}
        onClick={onClick}
        data-testid={testId}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span
          className={cn(
            'whitespace-nowrap',
            explained
              ? 'ml-2'
              : 'hidden max-w-0 opacity-0 transition-[max-width,margin,opacity] duration-200 lg:inline lg:group-hover:ml-2 lg:group-hover:max-w-40 lg:group-hover:opacity-100 lg:group-focus-visible:ml-2 lg:group-focus-visible:max-w-40 lg:group-focus-visible:opacity-100',
          )}
          aria-hidden="true"
        >
          {label}
        </span>
      </Button>
    </span>
  );
}

/**
 * POST to an admin proposals endpoint, and turn a failure into a line an admin
 * can act on.
 *
 * The status is read BEFORE the body. The routes answer JSON on every path they
 * own, but a platform failure does not: a function timeout or a gateway error
 * while Supabase is unreachable answers HTML, and parsing that first makes the
 * toast read `Unexpected token 'A', "An error o"... is not valid JSON`. That is
 * the toast Revoke - the kill switch - would show in precisely the outage it
 * exists for. So the API's own `error` is used when the body has one, and the
 * status carries the message when it does not.
 */
async function postProposalAction(url: string, payload: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.ok) return;
  const body: { error?: unknown } | null = await res.json().catch(() => null);
  throw new Error(typeof body?.error === 'string' ? body.error : `HTTP ${res.status}`);
}

/** What a draft's link-window refresh did, in the terms Copy link reports it in. */
interface RefreshOutcome {
  /** Whether the window actually moved. */
  ok: boolean;
  /** What it means for the link, in the words the admin should read. */
  reason: string | null;
  /**
   * The server's answer says the ROW on screen is out of date rather than the
   * write: a 409 (this proposal is not a draft any more) or a 404 (it is gone).
   */
  stale: boolean;
}

/**
 * What a failed refresh means for the link, said once so no branch can lose it.
 *
 * This sentence is the reason the toast exists. The window did not move, so the
 * admin is holding a draft link that may already have stopped opening, and they
 * are about to text it to somebody. Every failure below therefore reports THIS,
 * and only a message written for this action may be shown in its place.
 */
const REFRESH_FAILED = 'Its window could not be refreshed, so it may not open. '
  + 'Send or re-import the proposal, then copy it again.';

/**
 * Move a draft's link window forward, and carry back what it means for the link.
 *
 * A bare `res.ok` was not enough, because the route composes two refusals for a
 * row whose status has moved since the roster was read, and both are written
 * for the admin AND are more accurate than the sentence above: a sent link has
 * no window to move under D3 and never expires, and a revoked one is shut until
 * it is restored rather than merely at risk. Reporting those as "it may not
 * open. Send or re-import the proposal" was false in the first case and advice
 * that mails the client a second copy of their proposal.
 *
 * NO OTHER STATUS speaks for itself. The route's outer catch answers a
 * deliberately generic 'Could not complete that action' for any outage, a
 * gateway answers an HTML error page, and a 404 says only that the row is gone
 * - none of which tells an admin what the link they just copied will do. Those
 * are reported as `REFRESH_FAILED`, which does.
 *
 * `stale` travels separately because it is a different question: whether what
 * needs correcting is the ROSTER rather than the write. A 409 says this row is
 * no longer a draft, a 404 says it is not there at all, and both leave the page
 * rendering a row - and a set of controls - the database has already left
 * behind.
 */
async function refreshDraftWindow(id: string): Promise<RefreshOutcome> {
  let res: Response;
  try {
    res = await fetch(`/api/admin/proposals/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'refresh' }),
    });
  } catch {
    return { ok: false, stale: false, reason: REFRESH_FAILED };
  }
  if (res.ok) return { ok: true, reason: null, stale: false };
  if (res.status !== 409) {
    return { ok: false, stale: res.status === 404, reason: REFRESH_FAILED };
  }
  // Status before body, for the reason postProposalAction gives above: a
  // gateway failure answers HTML, and parsing that first turns the toast into a
  // JSON parser's complaint. Only this status is ever read for its words.
  const body: { error?: unknown } | null = await res.json().catch(() => null);
  return {
    ok: false,
    stale: true,
    reason: typeof body?.error === 'string' ? body.error : REFRESH_FAILED,
  };
}

export default function ProposalsAdminPage() {
  const { toast } = useToast();

  // ---- roster ----
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  /** False when the server served the roster without its counts. */
  const [countsAvailable, setCountsAvailable] = useState(true);
  /** What the search box holds, and the term the roster on screen answers. */
  const [search, setSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  // ---- the one search bar (round 9) ----
  /** The person the page is scoped to; null is the fresh recent-proposals view. */
  const [selectedClient, setSelectedClient] = useState<ClientHit | null>(null);
  const [clientHits, setClientHits] = useState<ClientHit[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  /** The popover only shows while focus is inside the search - the usual combobox rule. */
  const [searchFocused, setSearchFocused] = useState(false);
  /** Guards against a slow earlier people-search landing over a newer one. */
  const peopleStamp = useRef(0);
  // The by-hand proposal builder (round 4). The CSV importer below stays as
  // the side door for when the estimator already made the numbers.
  const [showBuilder, setShowBuilder] = useState(false);
  /** "Open & modify": the proposal loaded into the builder for editing. */
  const [editTarget, setEditTarget] = useState<{
    id: string; title: string; clientName: string; clientEmail: string | null; lines: EditableStoredLine[];
  } | null>(null);
  /** The row whose lines are being fetched, so its button can say so. */
  const [editLoading, setEditLoading] = useState<string | null>(null);
  /** Pre-fills the builder's customer step ("+ New proposal for X"). */
  const [builderCustomer, setBuilderCustomer] = useState<CustomerHit | null>(null);
  /** The importer is collapsed until asked for (round 9). */
  const [showImporter, setShowImporter] = useState(false);
  /** Matching proposals in total; null when the count could not be read. */
  const [rosterTotal, setRosterTotal] = useState<number | null>(null);
  /**
   * Whether this page stopped at the server's cap. Separate from the total
   * because the total can be unreadable, and a truncated roster that says
   * nothing is exactly the silent cut-off the search box exists to answer.
   */
  const [rosterTruncated, setRosterTruncated] = useState(false);

  /**
   * The stamp of the newest roster request. Searches are submitted by hand and
   * answered by a server, so two can be in flight at once and they can land in
   * either order - and the response that lands LAST used to win, whichever term
   * it answered. That left the box reading "Rachel" above Zeta's row, and above
   * "No proposals match ..." naming a term the admin had already replaced. On a
   * roster whose whole job past the 200-row cap is reaching a proposal in order
   * to revoke it, answering the wrong question is not cosmetic.
   */
  const rosterRequest = useRef(0);

  const loadRoster = useCallback(async (term: string) => {
    const stamp = ++rosterRequest.current;
    setRosterError(null);
    const q = term.trim();
    try {
      const res = await fetch(`/api/admin/proposals${q ? `?search=${encodeURIComponent(q)}` : ''}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      // Superseded: a newer search is already on its way, and its term is what
      // the box says. Every piece of roster state moves together or not at all.
      if (stamp !== rosterRequest.current) return;
      setRoster(body.proposals);
      setCountsAvailable(body.counts_available !== false);
      setRosterTotal(typeof body.total === 'number' ? body.total : null);
      setRosterTruncated(body.truncated === true);
      setActiveSearch(q);
    } catch {
      // A failed read is an outage message, never an empty roster - and a stale
      // one must not paint an outage over a roster that has already arrived.
      if (stamp !== rosterRequest.current) return;
      setRosterError('Could not load proposals - refresh to retry.');
    }
  }, []);
  useEffect(() => { loadRoster(''); }, [loadRoster]);

  /**
   * The people search behind the one bar: debounced and TYPE-FIRST (nobody is
   * listed until two characters, the owner's standing rule), asking BOTH
   * sources at once so a saved customer and an import-only client land in the
   * same list. Either source failing alone is tolerated - the other still
   * answers - but both failing says so instead of showing "no matches" for a
   * person who exists.
   */
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) { setClientHits([]); setSearchBusy(false); return; }
    const stamp = ++peopleStamp.current;
    setSearchBusy(true);
    const timer = window.setTimeout(async () => {
      const [leadsRes, proposalsRes] = await Promise.allSettled([
        fetch(`/api/admin/estimate-email/leads?q=${encodeURIComponent(q)}`).then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return (await r.json()).leads as CustomerHit[];
        }),
        fetch(`/api/admin/proposals?search=${encodeURIComponent(q)}`).then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return (await r.json()).proposals as RosterEntry[];
        }),
      ]);
      if (stamp !== peopleStamp.current) return;
      setSearchBusy(false);
      if (leadsRes.status === 'rejected' && proposalsRes.status === 'rejected') {
        toast({ title: 'Search failed', description: 'Could not reach the server - try again.', variant: 'destructive' });
        setClientHits([]);
        return;
      }
      setClientHits(mergeClientHits(
        leadsRes.status === 'fulfilled' ? leadsRes.value ?? [] : [],
        proposalsRes.status === 'fulfilled' ? proposalsRes.value ?? [] : [],
      ));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, toast]);

  /** Land on a person: scope the roster to them, server-side, and clear the box. */
  const selectClient = useCallback((hit: ClientHit) => {
    setSelectedClient(hit);
    setSearch('');
    setClientHits([]);
    // The scoped read uses the strongest term the person has - their email
    // when they have one - and belongsTo() trims title-only lookalikes out of
    // whatever the OR-search returns.
    void loadRoster(hit.email ?? hit.name);
  }, [loadRoster]);

  const clearClient = useCallback(() => {
    setSelectedClient(null);
    void loadRoster('');
  }, [loadRoster]);

  /** The CustomerHit the builder pre-fills from the selected person. An empty
   * id is a person with no lead row - the builder sends lead_id null then. */
  const builderHitFor = (c: ClientHit): CustomerHit => ({
    id: c.leadId ?? '',
    name: c.name,
    email: c.email,
    phone: c.phone,
    project_type: null,
    city: null,
    source: null,
    created_at: '',
  });

  /**
   * "Open & modify": read the proposal's lines and hand them to the builder.
   * Revoked rows never get here - the button is disabled with the reason - and
   * the server refuses a revoked re-import anyway, so this stays a plain read.
   */
  const openEdit = async (p: RosterEntry) => {
    if (editLoading) return;
    setEditLoading(p.id);
    try {
      const res = await fetch(`/api/admin/proposals/${p.id}`);
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.proposal) {
        throw new Error(typeof body?.error === 'string' ? body.error : `HTTP ${res.status}`);
      }
      setShowBuilder(false);
      setBuilderCustomer(null);
      setEditTarget({
        id: p.id,
        title: body.proposal.title,
        clientName: body.proposal.client_name,
        clientEmail: body.proposal.client_email,
        lines: body.lines ?? [],
      });
      requestAnimationFrame(() => {
        document.querySelector('[data-testid="proposal-builder"]')?.scrollIntoView({ behavior: 'smooth' });
      });
    } catch (err) {
      toast({
        title: 'Could not open the proposal',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setEditLoading(null);
    }
  };

  // ---- import preview state ----
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [csvText, setCsvText] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [proposalTitle, setProposalTitle] = useState('');
  const [busy, setBusy] = useState(false);
  /** When set, Create becomes Re-import onto this proposal. */
  const [reimportTarget, setReimportTarget] = useState<RosterEntry | null>(null);
  const dragKey = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  /** The text the current preview was built from, so a re-paste of it re-keys nothing. */
  const lastParsed = useRef<string>('');
  /** Set by an import gesture so the change event that follows is not read as typing. */
  const importing = useRef(false);

  const total = useMemo(() => rows.reduce((a, r) => a + r.priceCents, 0), [rows]);

  /**
   * Parse text into a fresh preview. This DISCARDS the current preview - new
   * keys, no bundles, no per-line overrides - so it runs only on a deliberate
   * import (a file, a paste, the Parse button), never on a keystroke and never
   * on leaving the box: focus moving is not a decision to re-import, and a
   * click anywhere - the Combine bar, a checkbox, the client name - moves it.
   */
  const ingestCsv = useCallback((text: string) => {
    lastParsed.current = text;
    const parsed = parseProposalCsv(text);
    if (!parsed.ok) { setCsvErrors(parsed.errors); setRows([]); setSelected(new Set()); return; }
    setCsvErrors([]);
    setSelected(new Set());
    setRows(parsed.lines.map((l: ParsedProposalLine) => ({
      key: rowKey(),
      title: l.title,
      description: l.description,
      priceCents: l.priceCents,
      optional: l.optional,
      // The parser badges every line off the registry, so this IS the registry's
      // verdict - kept beside the live one rather than asked for again later.
      registryOptional: l.optional,
      category: l.category,
    })));
  }, []);

  /**
   * Does the preview hold work a re-parse would throw away? A composed bundle,
   * or a badge the admin flipped off what the registry said. Derived from the
   * rows rather than tracked by a flag, so a row Unbundle put back carrying an
   * override still counts as one.
   *
   * The comparison is against the verdict each row CARRIES, not against a fresh
   * categorizeLine on its title: this runs over every row on every rows change,
   * and a bundle-name keystroke is a rows change.
   */
  const previewHasEdits = useMemo(
    () => rows.some((r) => r.members != null || r.optional !== r.registryOptional),
    [rows],
  );

  /**
   * Ask before throwing away a preview that holds composed work. EVERY discard
   * goes through here - the Parse button, a paste into a box that already
   * imported, a dropped file, emptying the box - because the loss is the same
   * whichever door it arrives through, and it is invisible either way: no
   * bundles, no overrides, no undo. One door, no exceptions.
   */
  const confirmDiscard = useCallback(() => !previewHasEdits || window.confirm(
    'This discards the current preview: the bundles you composed and any '
    + 'locked/optional badges you set by hand go with it. Continue?',
  ), [previewHasEdits]);

  /**
   * Clear the preview outright - what an emptied paste box should mean. Behind
   * the same confirm as a re-parse, and reports whether it ran so the caller can
   * leave the box holding the text the surviving preview was built from.
   */
  const clearPreview = useCallback((text: string) => {
    if (!confirmDiscard()) return false;
    lastParsed.current = text;
    setRows([]); setSelected(new Set()); setCsvErrors([]);
    return true;
  }, [confirmDiscard]);

  const reparse = useCallback((text: string) => {
    if (!confirmDiscard()) return false;
    ingestCsv(text);
    return true;
  }, [confirmDiscard, ingestCsv]);

  /**
   * Re-parse only when the text actually changed since the last import, and
   * report whether the new text may be committed to the box. Declining leaves
   * the old preview standing, so the box has to keep the text THAT preview was
   * built from - the same rule the clear path follows, in the other direction.
   */
  const parsePastedText = useCallback((text: string) => {
    if (text === lastParsed.current) return true;
    if (!text.trim()) return clearPreview(text);
    return reparse(text);
  }, [clearPreview, reparse]);

  /**
   * Mark the change event about to arrive as an import rather than typing.
   *
   * A paste and a dragged-in text are the same gesture as far as the box is
   * concerned - the admin handing it a CSV - and the one-door rule covers both:
   * they parse, behind the same confirm. What must NOT be marked is the
   * keystroke after either, so the flag is dropped on the next task whether the
   * change event read it or not: a gesture that inserts nothing fires no change
   * event at all, and a flag left armed turns the next character typed into a
   * re-import that silently discards the preview.
   */
  const armImport = useCallback(() => {
    importing.current = true;
    window.setTimeout(() => { importing.current = false; }, 0);
  }, []);

  const onFile = useCallback((f: File | undefined | null) => {
    if (!f) return;
    f.text().then((text) => {
      if (!confirmDiscard()) return;
      setCsvText(text);
      ingestCsv(text);
    }).catch(() => {
      toast({
        title: 'Could not read that file',
        description: 'Try choosing it again, or paste the CSV text instead.',
        variant: 'destructive',
      });
    });
  }, [confirmDiscard, ingestCsv, toast]);

  // ---- bundling ----
  /**
   * Compose the picked rows into a bundle. No name is passed: composeBundle's
   * generated one lands in the row's editable title, and renameBundle is what
   * changes it from there - so a name threaded through here would have no
   * reader, and on the drag path no source either.
   */
  const combine = useCallback((keys: string[]) => {
    setRows((prev) => {
      const chosen = prev.filter((r) => keys.includes(r.key));
      const composed = composeBundle(chosen);
      if (!composed) return prev;
      const bundle: PreviewRow = {
        key: rowKey(), description: '', ...composed, registryOptional: composed.optional,
      };
      const at = prev.findIndex((r) => r.key === chosen[0].key);
      const rest = prev.filter((r) => !keys.includes(r.key));
      rest.splice(at, 0, bundle);
      return rest;
    });
    setSelected(new Set());
  }, []);

  const unbundle = useCallback((key: string) => {
    setRows((prev) => {
      const i = prev.findIndex((r) => r.key === key);
      const b = prev[i];
      if (!b?.members) return prev;
      const restored: PreviewRow[] = restoreMembers(b.members).map((m) => ({
        key: rowKey(), title: m.title, description: m.description, priceCents: m.priceCents,
        optional: m.optional, registryOptional: m.registryOptional, category: m.category,
      }));
      const next = [...prev];
      next.splice(i, 1, ...restored);
      return next;
    });
    // The bundle row is gone, so its tick must go with it - a selection holding
    // keys no row answers to makes Combine claim a count it cannot act on.
    setSelected((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  /**
   * Flip a row's badge. The override is intended - it is the admin's backstop
   * over the registry - but on a BUNDLE that composeBundle locked, turning it
   * optional hands the client one all-or-nothing toggle over structural work
   * whose names the bundle no longer shows. So that one direction names those
   * members and asks first; every other flip is unchanged.
   *
   * A flip on a bundle writes THAT ROW ONLY. Its members keep the intrinsic
   * verdicts they were combined with, which is what Unbundle gives back and
   * what any bundle this one is nested into is judged on - so the demolition
   * inside a package the admin opened up comes back locked, and re-bundling
   * asks about it again rather than carrying the answer somewhere it was never
   * given. A per-line override is how a member's own verdict changes, and it is
   * set before combining, where the line is on screen under its own name.
   */
  const toggleOptional = useCallback((key: string) => {
    const row = rows.find((r) => r.key === key);
    if (row?.members && !row.optional) {
      const locked = lockedMemberTitles(row.members);
      if (locked.length > 0 && !window.confirm(
        `"${row.title}" is locked because it contains work the client is not meant to be able to decline:\n\n`
        + `${locked.map((t) => `  - ${t}`).join('\n')}\n\n`
        + 'Making the bundle optional gives them one toggle over all of it. Continue?',
      )) return;
    }
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, optional: !r.optional } : r)));
  }, [rows]);

  /**
   * Renaming stays free while the admin types - including through empty, which
   * is how anyone replaces a name - but an empty box is never a title. The last
   * non-empty name is remembered here and put back on blur, so a cleared field
   * cannot reach the API as `title: ''` for the schema to reject with a message
   * about a line the admin never sees.
   */
  const lastBundleName = useRef<Map<string, string>>(new Map());

  const renameBundle = useCallback((key: string, title: string) => {
    if (title.trim()) lastBundleName.current.set(key, title);
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, title } : r)));
  }, []);

  const commitBundleName = useCallback((key: string) => {
    setRows((prev) => prev.map((r) => {
      if (r.key !== key || r.title.trim()) return r;
      return {
        ...r,
        title: lastBundleName.current.get(key) ?? `Bundle (${r.members?.length ?? 0} items)`,
      };
    }));
  }, []);

  /**
   * The rows a tick actually resolves to. Combine reads its count from HERE
   * rather than from selected.size, so a key left behind by any future path
   * that removes a row can never advertise a bundle that cannot be composed.
   */
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.key)), [rows, selected]);

  /**
   * A row with no title cannot be written - the schema's `.min(1)` rejects it -
   * so the button refuses first, while the empty box is still on screen.
   */
  const hasUnnamedRow = useMemo(() => rows.some((r) => !r.title.trim()), [rows]);

  const toggleSelected = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  /**
   * Arm a re-import, and empty the importer while doing it.
   *
   * Re-import REPLACES a proposal's lines and is not undoable by the admin (the
   * snapshot restore in replaceLines answers a failed insert, not a mis-aimed
   * one). Leaving whatever preview happened to be loaded meant the rows built
   * for one client - or for a proposal that was never created - silently became
   * the payload for whichever roster row was clicked, at the same moment the
   * client fields that identified them were hidden. So the corrected CSV is
   * parsed fresh, against a target the card names on every screen.
   *
   * Emptying it is still a discard, so it goes through the same door as every
   * other one: Re-import is a small outline button up in the roster, two
   * scroll-lengths away from the preview it would throw out, and arming one by
   * mistake must not cost composed work without a word. Cancel is the same
   * shape one step later - by then the preview was composed FOR the armed
   * target, which makes it more valuable, not less.
   */
  const resetImporter = useCallback(() => {
    setRows([]); setSelected(new Set()); setCsvErrors([]); setCsvText('');
    lastParsed.current = '';
  }, []);

  const armReimport = useCallback((p: RosterEntry) => {
    if (!confirmDiscard()) return;
    resetImporter();
    setReimportTarget(p);
    // The importer is collapsed by default since round 9, and an armed
    // re-import with no importer on screen would be a scroll to nothing.
    setShowImporter(true);
    requestAnimationFrame(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    });
  }, [confirmDiscard, resetImporter]);

  const cancelReimport = useCallback(() => {
    if (!confirmDiscard()) return;
    setReimportTarget(null);
    resetImporter();
  }, [confirmDiscard, resetImporter]);

  // ---- create / reimport / lifecycle ----
  // toStoredMembers, not r.members: the preview carries each member's
  // description so Unbundle is lossless, and bundle_members stores titles and
  // prices only.
  const linesPayload = () => rows.map((r) => ({
    title: r.title,
    description: r.description,
    price_cents: r.priceCents,
    optional: r.optional,
    category: r.category,
    bundle_members: r.members ? toStoredMembers(r.members) : null,
  }));

  const create = async () => {
    setBusy(true);
    // Re-import lands on a row already in view, so its filter is left alone. A
    // NEW proposal has no such guarantee: reloading under the term that happened
    // to be in the box hid it entirely, and a create that appears to have done
    // nothing is one an admin presses again - a duplicate proposal for a real
    // client. So a create clears the search and comes back to the whole roster,
    // where the row it just made is at the top.
    const wasReimport = reimportTarget != null;
    try {
      if (reimportTarget) {
        await postProposalAction(`/api/admin/proposals/${reimportTarget.id}`, {
          action: 'reimport',
          lines: linesPayload(),
        });
        toast({ title: 'Proposal updated', description: `${reimportTarget.client_name} - same link, new lines.` });
      } else {
        await postProposalAction('/api/admin/proposals', {
          client_name: clientName.trim(),
          client_email: clientEmail.trim() || null,
          title: proposalTitle.trim(),
          lines: linesPayload(),
        });
        toast({ title: 'Proposal created (draft)', description: 'Send it or copy the link from the roster.' });
      }
      resetImporter();
      setClientName(''); setClientEmail(''); setProposalTitle('');
      setReimportTarget(null);
      // A new proposal may be for somebody OTHER than the person the page is
      // scoped to, and a scope that hides it invites a duplicate create - so
      // the whole selection clears, and the row lands atop the recent list.
      if (!wasReimport) { setSearch(''); setSelectedClient(null); }
      await loadRoster(wasReimport ? activeSearch : '');
    } catch (err) {
      toast({ title: 'Could not save', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const act = async (p: RosterEntry, action: LifecycleAction) => {
    const ask = CONFIRMS[action];
    if (ask && !window.confirm(ask(p))) return;
    setBusy(true);
    try {
      await postProposalAction(`/api/admin/proposals/${p.id}`, { action });
      toast({ title: DONE[action], description: p.client_name });
      await loadRoster(activeSearch);
    } catch (err) {
      toast({ title: 'Action failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Copy the client's link - and on a DRAFT, move its window forward so what
   * was just handed over resolves for a full window.
   *
   * Copying this link is the act of handing it to somebody: it is how a client
   * with no email address, or one who would rather have it by text, gets their
   * proposal. A draft's link only resolves for a bounded window from its
   * `updated_at`, so before this the button could silently put a URL on the
   * clipboard that had already stopped working - and the admin found out when
   * the client said the link was broken.
   *
   * THE COPY GOES FIRST, and that ordering is load-bearing. A clipboard write
   * is only permitted while the click's user activation is still live, and
   * WebKit drops that activation across an awaited network round trip: with the
   * refresh in front, `writeText` rejected with NotAllowedError on Safari for
   * every DRAFT - precisely the row this whole feature exists for - and Copy
   * link degraded to the copy-it-by-hand toast there. Nothing about WHAT is
   * copied depends on the refresh; only the toast's wording does, and that is
   * composed once the refresh resolves. Do not put the network call back in
   * front of the clipboard write.
   *
   * A refresh that FAILS still leaves the link copied. The URL is the thing
   * being asked for, an expired one is still the right URL for a proposal that
   * Send or Re-import can revive, and refusing to copy would leave an admin
   * with no way to get it at all. What changes is what the toast promises.
   *
   * A clipboard write that fails does NOT skip the refresh either: the admin is
   * about to copy that URL out of the fallback toast by hand, and it has to
   * resolve for them exactly as much as it would have from the clipboard.
   */
  const copyLink = async (p: RosterEntry) => {
    const url = `${window.location.origin}/proposal/${p.token}`;
    let copied = true;
    try {
      // Denied permission or a non-secure context rejects here, and an admin
      // who thinks a private link is on their clipboard when it is not will
      // paste the wrong thing to a client.
      await navigator.clipboard.writeText(url);
    } catch {
      copied = false;
    }

    const refresh = p.status === 'draft' ? await refreshDraftWindow(p.id) : null;
    /** What the toast may say about the window, and only ever the truth of it. */
    let windowNote: string | null = null;
    let refreshFailed = false;
    if (refresh !== null) {
      if (refresh.ok) {
        // THIS ROW, in place - not a re-read of the roster. The roster is
        // ordered `updated_at.desc` and a refresh is a write to exactly that
        // column, so re-reading lifted every copied row to position one: an
        // admin working down a list of drafts watched each row jump to the top
        // as they went, with the next row they were about to click shifting out
        // from under the cursor. The only reader of this column on this page is
        // the expiry hint below, comparing it against a window measured in
        // hours, so the client's own clock is close enough - it differs from
        // the server's stamp by one round trip.
        const refreshedAt = new Date().toISOString();
        setRoster((current) => current?.map(
          (row) => (row.id === p.id ? { ...row, updated_at: refreshedAt } : row),
        ) ?? current);
        windowNote = `It opens for the next ${DRAFT_WINDOW_HOURS} hours.`;
      } else {
        refreshFailed = true;
        windowNote = refresh.reason;
        if (refresh.stale) {
          // The server says this row is not a draft any more, or is not there at
          // all, so the roster is showing a status - and a set of controls - the
          // database has already left behind. Re-read it, with the term the
          // roster on screen answers rather than whatever the search box happens
          // to hold: an unsubmitted term here would silently collapse the roster
          // to a search the admin never ran.
          void loadRoster(activeSearch);
        }
      }
    }

    if (!copied) {
      toast({
        title: 'Could not copy the link',
        description: `Copy it by hand: ${url}${windowNote ? ` - ${windowNote}` : ''}`,
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: 'Link copied',
      description: `Private to this client - share deliberately.${windowNote ? ` ${windowNote}` : ''}`,
      variant: refreshFailed ? 'destructive' : undefined,
    });
  };

  const statusBadge = (s: RosterEntry['status']) =>
    s === 'sent' ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">sent</Badge>
      : s === 'revoked' ? <Badge variant="destructive">revoked</Badge>
        : <Badge variant="secondary">draft</Badge>;

  /**
   * What the list actually shows. Scoped to the selected person when there is
   * one - belongsTo() trims the title-only lookalikes the OR-search let in -
   * and the most recent few otherwise, because with search finding people the
   * unscoped list's job is "what changed lately", not "everything".
   */
  const visibleRoster = useMemo(() => {
    if (roster === null) return null;
    if (selectedClient) return roster.filter((p) => belongsTo(p, selectedClient));
    return roster.slice(0, RECENT_LIMIT);
  }, [roster, selectedClient]);

  return (
    <div className="space-y-6" data-testid="proposals-admin">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap space-y-0">
          <div>
            <CardTitle>Proposals</CardTitle>
            <CardDescription className="mt-1">
              Search a customer to see and edit their proposals, or start a new one. Locked lines are the bones; optional lines and bundles are the client&apos;s switches.
              {CLIENT_PAGE_LIVE ? null : ' The client page ships in Slice 3, so Send is switched off until then - a proposal email would carry a link that does not resolve yet. Copy link still works for a link you are holding, not sending.'}
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditTarget(null);
              setBuilderCustomer(null);
              setShowBuilder(true);
            }}
            data-testid="open-builder"
          >
            New proposal
          </Button>
        </CardHeader>
        <CardContent>
          {/*
            The one search bar (round 9): it finds PEOPLE, and picking one is
            what filters the page. The roster is capped, so this is also how
            every proposal stays reachable - the lifecycle buttons live inside
            a row, and a row past the cap can only be reached through its
            client. Type-first, like every other search on the admin.
          */}
          <div
            className="relative mb-3"
            onFocus={() => setSearchFocused(true)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSearchFocused(false);
            }}
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                className="h-11 pl-9"
                type="search"
                placeholder="Search customers by name or email - pick one to see their proposals"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search customers"
                data-testid="roster-search"
              />
            </div>
            {searchFocused && search.trim().length >= 2 && (
              <div
                className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border bg-background shadow-lg"
                data-testid="client-search-popover"
              >
                {searchBusy ? (
                  <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Searching…
                  </p>
                ) : clientHits.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground" data-testid="client-search-empty">
                    Nobody matches &quot;{search.trim()}&quot;. Somebody brand new is saved from the
                    builder&apos;s customer step - press New proposal.
                  </p>
                ) : (
                  clientHits.map((hit) => (
                    <button
                      key={hit.key}
                      type="button"
                      className="flex w-full items-center gap-3 border-b px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-muted/60"
                      onClick={() => selectClient(hit)}
                      data-testid="client-hit"
                    >
                      <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{hit.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {hit.email ?? 'no email on file'}{hit.phone ? ` · ${hit.phone}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {hit.proposalCount > 0
                          ? `${hit.proposalCount} ${plural(hit.proposalCount, 'proposal')}`
                          : 'no proposals yet'}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Who the page is scoped to - the mock's client header. */}
          {selectedClient && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3" data-testid="client-header">
              <UserRound className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{selectedClient.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {selectedClient.email ?? 'no email on file'}
                  {selectedClient.phone ? ` · ${selectedClient.phone}` : ''}
                </p>
              </div>
              <Button
                size="sm"
                className="h-11"
                onClick={() => {
                  setEditTarget(null);
                  setBuilderCustomer(builderHitFor(selectedClient));
                  setShowBuilder(true);
                  requestAnimationFrame(() => {
                    document.querySelector('[data-testid="proposal-builder"]')?.scrollIntoView({ behavior: 'smooth' });
                  });
                }}
                data-testid="new-for-client"
              >
                New proposal for {selectedClient.name.split(' ')[0]}
              </Button>
              <Button size="sm" variant="ghost" className="h-11" onClick={clearClient} data-testid="client-clear">
                <X className="mr-1 h-4 w-4" />Clear
              </Button>
            </div>
          )}
          {rosterError ? (
            <div className="flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
              <span>{rosterError}</span>
              <Button size="sm" variant="outline" onClick={() => loadRoster(activeSearch)}><RefreshCw className="mr-1 h-4 w-4" />Retry</Button>
            </div>
          ) : visibleRoster === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : visibleRoster.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="roster-empty">
              {selectedClient
                ? `No proposals for ${selectedClient.name} yet - the New proposal button above starts one for them.`
                : 'No proposals yet - press New proposal to build the first one, or import the estimator’s CSV.'}
            </p>
          ) : (
            <div className="space-y-2" data-testid="roster">
              <p className="text-sm font-semibold" data-testid="roster-heading">
                {selectedClient
                  ? `${selectedClient.name}’s proposals (${visibleRoster.length})`
                  : 'Recent proposals'}
              </p>
              {!selectedClient && roster !== null && (roster.length > RECENT_LIMIT || rosterTruncated) ? (
                <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground" data-testid="roster-truncated">
                  Showing the {visibleRoster.length} most recently updated
                  {rosterTotal != null ? ` of ${rosterTotal} proposals` : ' proposals'} - search a
                  customer above to reach everyone else. Every proposal stays revocable through its client.
                </p>
              ) : null}
              {countsAvailable ? null : (
                <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900" data-testid="counts-unavailable">
                  Line and submission counts could not be read just now, so they are shown as unknown. Everything else on this roster - Copy link, Re-import, Revoke - still works.
                </p>
              )}
              {visibleRoster.map((p) => (
                <div key={p.id} className="rounded-lg border p-3" data-testid={`proposal-${p.id}`}>
                  {/*
                    Same two shapes as a preview row, same breakpoint.

                    Below md: identity first, status pinned top-right, actions
                    underneath. The old single wrapping row put a four-button
                    block beside the name, which at 390px collapsed into the
                    bunched-up grid the owner called out.

                    md and up: one line - identity, status, actions - which is
                    the desktop that was already working. `md:contents` dissolves
                    the identity+status wrapper there so all three sit in the
                    outer row, and the name and title go back to sharing a line
                    since they comfortably fit at that width.
                  */}
                  <div className="md:flex md:items-center md:gap-3">
                  <div className="flex items-start gap-2 md:contents">
                    {/*
                      The client's name is what this row is FOR, so from lg -
                      where the actions start reserving room for an opening
                      label - it holds a readable floor of its own.

                      The two floors are sized to coexist, and the numbers are
                      measured rather than derived: at the narrowest lg viewport
                      a row has 852px of CONTENT (1024 less the shell's 64px
                      rail, the container's 32px, the card's border and 48px of
                      padding, and this row's own border and 24px of padding),
                      against 240 + 496 for the two floors, 69 for the widest
                      status badge ("revoked") and 24 for the two gaps - 829,
                      so 23px of slack. Thin on purpose: the floors are what a
                      name and a label each need, not round numbers.

                      Nothing here is self-enforcing, so the browser suite holds
                      the arithmetic instead - B31 pins the measured column
                      widths and B29 the rest-versus-hover equality, and both
                      check the row against the box that clips it rather than
                      asking the document for a scrollbar this shell can never
                      grow. B32 is the proof that check can fail.
                    */}
                    {/*
                      The identity column is the row's click-into target since
                      round 9 - "previous proposals that you can click into and
                      modify", in the owner's words - and it became a BUTTON
                      rather than gaining one: the actions cluster's widths are
                      pinned by B29/B31 down to the pixel, and the identity
                      column is the one part of the row that is already flexible.
                      Its outer geometry is untouched (no padding was added, for
                      exactly that reason), so the measured columns still hold.
                      A revoked row keeps the target but the click says why it
                      will not open - the same posture as Re-import's refusal.
                    */}
                    <button
                      type="button"
                      className="min-w-0 flex-1 rounded-md text-left transition-colors hover:bg-muted/40 lg:min-w-[15rem]"
                      data-testid="roster-identity"
                      onClick={() => {
                        if (p.status === 'revoked') {
                          toast({
                            title: 'This proposal is revoked',
                            description: 'Restore it to draft first - then it can be opened and edited.',
                          });
                          return;
                        }
                        void openEdit(p);
                      }}
                    >
                      <span className="block md:flex md:flex-wrap md:items-baseline md:gap-2">
                        <span className="block font-semibold">{p.client_name}</span>
                        <span className="block line-clamp-2 text-sm text-muted-foreground">{p.title}</span>
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {p.line_count == null || p.submission_count == null ? (
                          'Counts unavailable'
                        ) : (
                          <>
                            {p.line_count} {plural(p.line_count, 'line')} · {p.submission_count} {plural(p.submission_count, 'submission')}
                            {p.latest_total_cents != null ? ` · latest ${dollars(p.latest_total_cents)}` : ''}
                          </>
                        )}
                      </span>
                      <span
                        className={cn(
                          'mt-1 flex items-center gap-1.5 text-xs font-semibold',
                          p.status === 'revoked' ? 'text-muted-foreground' : 'text-primary',
                        )}
                        data-testid="edit-hint"
                      >
                        <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {p.status === 'revoked'
                          ? 'Restore to draft to edit'
                          : editLoading === p.id ? 'Opening…' : 'Open & modify'}
                      </span>
                      {/*
                        A draft whose window has run out. Said on the ROW rather
                        than left for the client to discover, because this is
                        the state in which a link already handed out - texted,
                        read down the phone - has silently stopped opening, and
                        nothing else on this screen distinguishes it from a
                        draft made ten minutes ago.

                        It names the remedy, and Copy link performs that remedy
                        itself, so the hint is a fact about links already out
                        there rather than an obstacle to sharing this one.
                      */}
                      {draftLinkHasExpired(p) ? (
                        <span
                          className="mt-1 flex items-start gap-1.5 text-xs font-medium text-amber-700"
                          data-testid="link-expired-hint"
                        >
                          <Clock3 className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>
                            Link expired after {DRAFT_WINDOW_HOURS}h - any copy already shared has
                            stopped opening. Copying it again refreshes it.
                          </span>
                        </span>
                      ) : null}
                    </button>
                    <div className="shrink-0 md:order-2">{statusBadge(p.status)}</div>
                  </div>
                  {/*
                    From lg the actions reserve their own widest width and hang
                    off the right of it.

                    The hover label used to open IN FLOW inside a row whose only
                    flexible item was the identity column, so every pass of the
                    cursor across Copy link / Re-import / Revoke took up to
                    ~170px off the client name and re-wrapped the title under
                    the cursor, and on a narrow desktop pushed Send to a second
                    line. The floor is the room the longest label ("Restore to
                    draft", on a revoked row that is also showing Re-import's
                    own disabled label) needs, so the label opens into space
                    that was already there and nothing else moves. justify-end
                    is what puts that spare room on the left, where the labels
                    grow into it; Send loses its auto margin here because the
                    whole cluster is now right-aligned.

                    lg and not md, because a reservation is only honest where
                    there is room for it. This page ships inside the dashboard's
                    admin shell, which spends 64px on the sidebar rail before
                    the container and card padding, so a 768px tablet has ~620px
                    of row to divide - reserving 30rem of it left the client's
                    name 43px wide, and 23px on a revoked row. The reservation
                    and the label that needs it are gated on the SAME breakpoint
                    now, so below lg the icons are plain 44px squares: nothing
                    grows, nothing has to be reserved, and the single-line md row
                    the owner asked for keeps its full width.
                  */}
                  <div className="mt-2 flex flex-wrap items-center gap-2 md:order-3 md:mt-0 md:shrink-0 lg:min-w-[31rem] lg:justify-end">
                    <IconAction icon={Link2} label="Copy link" onClick={() => copyLink(p)} />
                    {/*
                      replaceLines refuses a revoked proposal outright (409), so
                      the row's own status can say so now rather than after the
                      admin has emptied the importer, pasted the corrected CSV
                      and composed it. Send is gated in the UI for exactly this
                      reason, with the server as the backstop.

                      The reason names Restore, not Re-send: Send is switched
                      off for every row until the client page ships, so telling
                      an admin to press it left the row frozen with no way out.
                      It rides on `disabledReason`, so it is the tooltip a
                      pointer gets AND the row keeps the word "Re-import" beside
                      the greyed glyph where no tooltip exists.
                    */}
                    <IconAction
                      icon={FileUp}
                      label="Re-import"
                      disabled={busy || p.status === 'revoked'}
                      disabledReason={p.status === 'revoked'
                        ? 'Revoked - restore it to draft before re-importing its lines'
                        : undefined}
                      onClick={() => armReimport(p)}
                      testId="reimport-btn"
                    />
                    {p.status !== 'revoked' ? (
                      <IconAction icon={Ban} label="Revoke" disabled={busy} onClick={() => act(p, 'revoke')} />
                    ) : (
                      /*
                        The way back. Revoking has always been reversible, but
                        every other door out of it needs the client page: Send is
                        off until Slice 3 and re-import is refused while the
                        status reads revoked, so without this a revoked proposal
                        had exactly one control left - Copy link - and a tooltip
                        pointing at a button that could not be pressed.
                      */
                      <IconAction
                        icon={RotateCcw}
                        label="Restore to draft"
                        disabled={busy}
                        title="Back to draft, so its lines can be corrected and it can be sent again"
                        onClick={() => act(p, 'restore')}
                        testId="restore-btn"
                      />
                    )}
                    {/*
                      Send keeps its words. It is the only action here that
                      spends something - it mails a client - so it stays a
                      labelled button rather than a glyph, full width under the
                      icons on a phone and pushed to the row's right edge on a
                      pointer. Owner's call from the mobile review.
                    */}
                    <Button
                      size="sm"
                      className="h-11 w-full sm:ml-auto sm:w-auto lg:ml-0"
                      disabled={busy || !CLIENT_PAGE_LIVE || !p.client_email}
                      title={!CLIENT_PAGE_LIVE ? CLIENT_PAGE_NOT_LIVE_MESSAGE : p.client_email ? undefined : 'No client email - use Copy link'}
                      onClick={() => act(p, 'send')}
                      data-testid="send-btn"
                    >
                      <Send className="mr-1 h-4 w-4" />{p.status === 'revoked' ? 'Re-send' : 'Send'}
                    </Button>
                  </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {(showBuilder || editTarget) && (
        <ProposalBuilder
          // Keyed so an edit initializes fresh rows for ITS proposal - the
          // builder reads `edit` in state initializers, which run once.
          key={editTarget ? `edit-${editTarget.id}` : builderCustomer ? `for-${builderCustomer.id || builderCustomer.email || builderCustomer.name}` : 'new'}
          edit={editTarget ?? undefined}
          initialCustomer={builderCustomer}
          onCreated={() => {
            // An edit, or a proposal built FOR the person on screen, lands in
            // the scoped list the admin is looking at. A proposal built from
            // the header button can be for anyone, and a scope that hides the
            // row it just made invites a duplicate - so that path clears out
            // to the recent list, where the new row is on top.
            const keepScope = editTarget != null || (builderCustomer != null && selectedClient != null);
            setShowBuilder(false);
            setEditTarget(null);
            setBuilderCustomer(null);
            if (keepScope) {
              void loadRoster(activeSearch);
            } else {
              setSelectedClient(null);
              setSearch('');
              void loadRoster('');
            }
          }}
          onClose={() => {
            setShowBuilder(false);
            setEditTarget(null);
            setBuilderCustomer(null);
          }}
          onImportInstead={() => {
            setShowBuilder(false);
            setShowImporter(true);
            requestAnimationFrame(() => {
              document.querySelector('[data-testid="csv-importer-card"]')?.scrollIntoView({ behavior: 'smooth' });
            });
          }}
        />
      )}

      {/*
        The importer is one click away rather than a whole card of paste box
        and drop zone under every visit (round 9): building by hand is the
        front door now, and the estimator's CSV is the side door for when the
        numbers already exist. An armed re-import opens it by itself above.
      */}
      {!showImporter && (
        <p className="text-sm text-muted-foreground">
          Have an estimator CSV instead?{' '}
          <button
            type="button"
            className="font-semibold text-primary underline"
            onClick={() => setShowImporter(true)}
            data-testid="open-importer"
          >
            Import a proposal CSV
          </button>
        </p>
      )}

      {showImporter && (
      <Card data-testid="csv-importer-card">
        <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap space-y-0">
          <div>
          <CardTitle>{reimportTarget ? `Re-import for ${reimportTarget.client_name}` : 'Import a proposal CSV'}</CardTitle>
          <CardDescription>
            {reimportTarget
              ? 'Same link, corrected lines. Past submissions keep their own snapshots.'
              : 'Drop the estimator’s proposal export (title, description, price). Nothing is created until you press Create; nothing is emailed until you press Send.'}
            {reimportTarget ? (
              <Button size="sm" variant="ghost" className="ml-2" onClick={cancelReimport}><X className="mr-1 h-4 w-4" />Cancel re-import</Button>
            ) : null}
          </CardDescription>
          </div>
          {/*
            Collapsing keeps the preview - nothing is discarded, so nothing is
            asked. A collapse WITH a target armed would hide the card that
            names where the next Create lands, so that state keeps the card.
          */}
          {!reimportTarget && (
            <Button size="sm" variant="ghost" onClick={() => setShowImporter(false)} data-testid="close-importer">
              Hide
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {reimportTarget ? (
            <div className="mb-4 rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm" data-testid="reimport-armed">
              <p>
                Replacing the lines on <span className="font-semibold">{reimportTarget.client_name}</span>
                {' - '}<span className="font-semibold">{reimportTarget.title}</span>.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                The importer was emptied when you armed this, so what you load below is what this proposal will hold. Its
                {reimportTarget.line_count == null
                  ? ' current lines are'
                  : ` ${reimportTarget.line_count} current ${plural(reimportTarget.line_count, 'line is', 'lines are')}`} replaced outright, and that cannot be undone from here.
              </p>
            </div>
          ) : null}
          {/*
            The paste box lives INSIDE this drop zone, so every drop that lands
            in it bubbles through here - and a cancelled drop is a cancelled
            insert. Taking the default away from a file drag is the point (the
            browser would otherwise navigate to the file and take the preview
            with it); taking it away from a TEXT drag was collateral, and the
            one drag path that failed with no file, no preview and no word.

            So a file is handled here; a text drop INTO the box keeps its
            default, because the insert is the browser's to perform, and is
            armed as an import so the change event it produces goes through the
            paste path rather than the typing one - dragging a corrected CSV in
            is an import, and leaving it as typing put the new text above a
            preview still built from the old, with Create writing the old rows;
            and a text drop anywhere ELSE in the zone is still stopped rather
            than allowed to navigate the importer away.
          */}
          <div
            className="mb-4 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              if (e.dataTransfer.types.includes('Files')) {
                e.preventDefault();
                onFile(e.dataTransfer.files?.[0]);
                return;
              }
              if (!(e.target instanceof HTMLTextAreaElement)) {
                e.preventDefault();
                return;
              }
              armImport();
            }}
          >
            Drop the CSV here, or
            <Button variant="link" className="px-1" onClick={() => fileInput.current?.click()}>choose a file</Button>
            {/*
              The value is cleared after every pick so choosing the SAME file
              again still fires: the confirm below can be declined, and an input
              that remembers the file it is holding emits no change event for it
              a second time - leaving the admin's only ways forward a different
              file or the paste box.
            */}
            <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" data-testid="csv-file-input"
              onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
            <Textarea
              className="mt-3 font-mono text-xs"
              placeholder="…or paste the CSV text here"
              rows={3}
              data-testid="csv-paste"
              value={csvText}
              // Typing never re-imports, and neither does leaving the box: a
              // fresh parse re-keys every row and throws away the bundles and
              // overrides the admin composed, which is exactly what fixing a
              // typo in here used to cost - on the next click ANYWHERE, since
              // that is what blurs a textarea. Re-importing is the Parse
              // button's job, and it asks first when there is work to lose.
              //
              // Emptying the box does clear the preview, because a cleared box
              // that still shows one reads as though the text is still loaded -
              // but that is a discard like any other, so it asks the same
              // question. Declining keeps the preview AND the text it was built
              // from, since a box left empty beside a live preview is the very
              // mismatch clearing exists to prevent.
              //
              // A paste - and a text dragged into the box, which is the same
              // gesture through another door - IS a deliberate import, so it
              // parses. Here rather than from onPaste/onDrop, because the change
              // event is the first moment the incoming text exists in the value:
              // both of those only arm the flag this branch reads. It commits
              // that text only once the discard is accepted: committing first
              // and asking afterwards left the box holding a corrected CSV
              // above a preview built from the old one, with Create writing the
              // old rows and nothing on screen saying the two panes disagreed -
              // which is exactly where a dropped text landed while it took the
              // typing branch below. Returning without
              // setCsvText leaves this a controlled value React puts straight
              // back, so declining restores the box the surviving preview owns.
              onChange={(e) => {
                const text = e.target.value;
                if (importing.current) {
                  importing.current = false;
                  if (!parsePastedText(text)) return;
                  setCsvText(text);
                  return;
                }
                if (!text.trim() && !clearPreview(text)) return;
                setCsvText(text);
              }}
              onPaste={armImport}
            />
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              disabled={!csvText.trim()}
              onClick={() => reparse(csvText)}
              data-testid="parse-btn"
            >
              <FileUp className="mr-1 h-4 w-4" />Parse pasted CSV
            </Button>
          </div>

          {csvErrors.length > 0 && (
            <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm" data-testid="csv-errors">
              <p className="mb-1 font-semibold">The file was not imported:</p>
              <ul className="list-inside list-disc">{csvErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}

          {rows.length > 0 && (
            <div className="space-y-2" data-testid="preview">
              {rows.map((r) => (
                <div
                  key={r.key}
                  draggable
                  // The drag carries its own identity. A drag that ends anywhere
                  // else - over the drop zone, over the page, back where it
                  // started - used to leave the key armed with nothing on screen
                  // saying so, and the next thing dropped on ANY row was combined
                  // with it: a CSV dragged from Finder onto a row a few pixels
                  // below the drop zone silently became a bundle of two unrelated
                  // lines, and the file itself was swallowed. dragend disarms it,
                  // and the drop acts only on a payload this list started.
                  onDragStart={(e) => {
                    dragKey.current = r.key;
                    e.dataTransfer.setData(ROW_DRAG_TYPE, r.key);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => { dragKey.current = null; }}
                  // preventDefault stays unconditional: without it the browser
                  // handles a dropped file itself and navigates away from the
                  // page, taking the whole preview with it.
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!e.dataTransfer.types.includes(ROW_DRAG_TYPE)) {
                      if (e.dataTransfer.types.includes('Files')) {
                        toast({
                          title: 'Nothing was imported',
                          description: 'Drop the CSV on the dashed box above the preview, not on a line.',
                        });
                      }
                      return;
                    }
                    const from = e.dataTransfer.getData(ROW_DRAG_TYPE) || dragKey.current;
                    dragKey.current = null;
                    if (from && from !== r.key) combine([from, r.key]);
                  }}
                  className={`rounded-lg border px-3 py-2.5 ${r.members ? 'border-primary bg-primary/5' : ''}`}
                  data-testid={r.members ? 'bundle-row' : 'line-row'}
                >
                  {/*
                    Two shapes, one breakpoint, both the owner's call.

                    Below md (tablet and phone): tick and name on one line with
                    the locked/optional badge pinned top-right, price and its
                    toggle on the line below. That replaced a single wrapping
                    row that at 390px broke three different ways depending on
                    title length and read as "all over the place".

                    md and up: everything back on ONE line - tick, badge, name,
                    price, toggle - which is the desktop the owner approved.
                    `md:contents` dissolves the identity wrapper at that width so
                    its three children become items of the outer row directly,
                    and the order utilities put the badge back in front of the
                    name where it reads as a column of statuses down the list.
                  */}
                  <div className="md:flex md:items-center md:gap-3">
                  <div className="flex flex-wrap items-center gap-2 md:contents">
                    {/*
                      The tick is the mobile-first path's primary control, so it
                      carries the house 44px target - but globals.css only bumps
                      buttons, and a checkbox is not one. The padded label is the
                      target (the sibling send-service-quote page's pattern); the
                      box itself stays 20px, so the hit area grows and the visual
                      does not.
                    */}
                    <label
                      className="-mx-1.5 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center md:order-1"
                      data-testid="row-select-target"
                    >
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-primary"
                        checked={selected.has(r.key)}
                        onChange={() => toggleSelected(r.key)}
                        aria-label={`Select ${r.title}`}
                      />
                    </label>
                    {r.members ? (
                      /*
                        A bundle's name is the one thing on this screen the admin
                        TYPES, and at 320px sharing the line with the tick and the
                        badge left it about thirteen characters wide. Below sm it
                        drops to its own full-width line under them (order-last,
                        so the badge keeps the top line); from sm up it sits
                        inline again, where there is room for it.
                      */
                      <Input
                        className="order-last h-11 w-auto min-w-0 flex-1 basis-full font-semibold sm:order-none sm:basis-auto md:order-3"
                        value={r.title}
                        aria-label="Bundle name"
                        onChange={(e) => renameBundle(r.key, e.target.value)}
                        onBlur={() => commitBundleName(r.key)}
                      />
                    ) : (
                      /*
                        min-w-0 is safe again now that the price and its toggle
                        have their own line: the name is the only thing on this
                        one, so nothing competes with it for the width and it
                        cannot be squeezed to the 10px box the old single-row
                        layout produced.

                        line-clamp-2, not truncate: a line's TITLE is what the
                        admin picks it by when ticking rows to combine, and at
                        390px truncate ellipsised most of them on one line
                        ("Matte black faucet pa..."), leaving two faucet lines
                        that read identically. Two lines is enough for every
                        title the estimator exports, and desktop widths fit one
                        line anyway, so this only changes the narrow case.
                      */
                      <span className="min-w-0 flex-1 line-clamp-2 break-words font-medium md:order-3" data-testid="line-title">{r.title}</span>
                    )}
                    {/*
                      self-start, not centred: the row's height comes from the
                      44px tick target, so on a two-line title a centred badge
                      floats between the lines. Pinned to the top it reads as
                      the row's status, which is where the owner asked for it.

                      ml-auto is what keeps the badges in ONE straight column
                      down the preview below sm. A plain line's title carries
                      flex-1 and pushes the badge to the right edge on its own,
                      but a bundle's name field has dropped to a full-width line
                      of its own by then, leaving the tick and the badge alone on
                      the first line with nothing growing between them - so the
                      bundle's badge sat flush against the tick while every
                      neighbour's sat right, which is the ragged column the
                      owner's crowding pass was called to fix. From sm up the
                      name is inline and flexible again, so the auto margin has
                      no free space to claim and is dropped rather than left to
                      compete with it.
                    */}
                    <Badge className="ml-auto mt-1.5 shrink-0 self-start sm:ml-0 md:order-2 md:mt-0 md:self-auto" variant={r.optional ? 'default' : 'secondary'} data-testid="row-badge">{r.optional ? 'optional' : 'locked'}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 md:order-4 md:shrink-0">
                    <span className="font-semibold tabular-nums">{dollars(r.priceCents)}</span>
                    <Button size="sm" variant="ghost" onClick={() => toggleOptional(r.key)} aria-label={`Make ${r.title} ${r.optional ? 'locked' : 'optional'}`}>
                      <Undo2 className="mr-1 h-4 w-4" />{r.optional ? 'Lock' : 'Make optional'}
                    </Button>
                  </div>
                  </div>
                  {r.members && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>Includes: {r.members.map((m) => m.title).join(' · ')}</span>
                      <span className="text-muted-foreground/70">(client sees names, never member prices)</span>
                      <Button size="sm" variant="outline" onClick={() => unbundle(r.key)}><Boxes className="mr-1 h-4 w-4" />Unbundle</Button>
                    </div>
                  )}
                  {!r.members && r.description ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{r.description}</p>
                  ) : null}
                </div>
              ))}

              <div className="sticky bottom-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
                <Button
                  variant="secondary"
                  disabled={selectedRows.length < 2}
                  onClick={() => combine(selectedRows.map((r) => r.key))}
                  data-testid="combine-btn"
                >
                  <Boxes className="mr-1 h-4 w-4" />Combine {selectedRows.length >= 2 ? `${selectedRows.length} into a bundle` : '(select 2+)'}
                </Button>
                <span className="ml-auto text-sm font-semibold">Total {dollars(total)}</span>
              </div>

              {!reimportTarget && (
                <div className="grid gap-3 pt-2 sm:grid-cols-3">
                  <Input placeholder="Client name" value={clientName} onChange={(e) => setClientName(e.target.value)} data-testid="client-name" />
                  <Input placeholder="Client email (optional)" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} data-testid="client-email" />
                  <Input placeholder='Proposal title, e.g. "Your bathroom remodel"' value={proposalTitle} onChange={(e) => setProposalTitle(e.target.value)} data-testid="proposal-title" />
                </div>
              )}

              <Button
                className="w-full sm:w-auto"
                disabled={busy || rows.length === 0 || hasUnnamedRow
                  || (!reimportTarget && (!clientName.trim() || !proposalTitle.trim()))}
                title={hasUnnamedRow ? 'Every line and bundle needs a name' : undefined}
                onClick={create}
                data-testid="create-btn"
              >
                <Upload className="mr-1 h-4 w-4" />
                {reimportTarget ? `Replace ${reimportTarget.client_name}'s lines` : 'Create proposal (draft)'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}
