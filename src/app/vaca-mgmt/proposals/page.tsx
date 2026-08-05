'use client';

/**
 * Customers -> Proposals (Proposal Pod, Slice 2).
 *
 * Two panels:
 *  - The roster: every proposal with status, submissions, and the lifecycle
 *    buttons (Copy link, Send, Re-import, Revoke, and Restore to draft on a
 *    row that has been revoked).
 *  - The importer: paste or drop the estimator's client-safe CSV, review the
 *    parsed preview - the category registry's locked/optional badge on every
 *    line with a per-line override switch - COMBINE lines into named bundles,
 *    then Create (draft) and Send.
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
  RefreshCw, Link2, Send, Ban, Upload, Boxes, X, FileUp, Undo2, Search, RotateCcw,
} from 'lucide-react';
import { parseProposalCsv, type ParsedProposalLine } from '@/lib/proposals/csv';
import {
  composeBundle, lockedMemberTitles, restoreMembers, toStoredMembers, type PreviewBundleMember,
} from '@/lib/proposals/bundles';
import { CLIENT_PAGE_LIVE, CLIENT_PAGE_NOT_LIVE_MESSAGE } from '@/lib/proposals/clientPage';

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
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
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
      if (!wasReimport) setSearch('');
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

  const copyLink = async (p: RosterEntry) => {
    const url = `${window.location.origin}/proposal/${p.token}`;
    try {
      // Denied permission or a non-secure context rejects here, and an admin
      // who thinks a private link is on their clipboard when it is not will
      // paste the wrong thing to a client.
      await navigator.clipboard.writeText(url);
    } catch {
      toast({
        title: 'Could not copy the link',
        description: `Copy it by hand: ${url}`,
        variant: 'destructive',
      });
      return;
    }
    toast({ title: 'Link copied', description: 'Private to this client - share deliberately.' });
  };

  const statusBadge = (s: RosterEntry['status']) =>
    s === 'sent' ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">sent</Badge>
      : s === 'revoked' ? <Badge variant="destructive">revoked</Badge>
        : <Badge variant="secondary">draft</Badge>;

  return (
    <div className="space-y-6" data-testid="proposals-admin">
      <Card>
        <CardHeader>
          <CardTitle>Proposals</CardTitle>
          <CardDescription>
            Tokenized client proposals built from the estimator&apos;s client-safe CSV. Locked lines are the bones; optional lines and bundles are the client&apos;s switches.
            {CLIENT_PAGE_LIVE ? null : ' The client page ships in Slice 3, so Send is switched off until then - a proposal email would carry a link that does not resolve yet. Copy link still works for a link you are holding, not sending.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/*
            The roster is capped, so search is how every proposal stays
            reachable: the lifecycle buttons - Revoke above all - live inside a
            row, and a row that falls off the end of the page takes them with it.
          */}
          <form
            className="mb-3 flex flex-wrap items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); loadRoster(search); }}
          >
            <Input
              className="h-11 min-w-48 flex-1"
              type="search"
              placeholder="Search by client name, email or proposal title"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search proposals"
              data-testid="roster-search"
            />
            <Button type="submit" variant="outline" size="sm" data-testid="roster-search-btn">
              <Search className="mr-1 h-4 w-4" />Search
            </Button>
            {activeSearch ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setSearch(''); loadRoster(''); }}
                data-testid="roster-search-clear"
              >
                <X className="mr-1 h-4 w-4" />Clear
              </Button>
            ) : null}
          </form>
          {rosterError ? (
            <div className="flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
              <span>{rosterError}</span>
              <Button size="sm" variant="outline" onClick={() => loadRoster(activeSearch)}><RefreshCw className="mr-1 h-4 w-4" />Retry</Button>
            </div>
          ) : roster === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : roster.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {activeSearch
                ? `No proposals match "${activeSearch}". Clear the search to see the whole roster.`
                : 'No proposals yet - import a CSV below to create the first one.'}
            </p>
          ) : (
            <div className="space-y-2">
              {rosterTruncated ? (
                <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground" data-testid="roster-truncated">
                  {rosterTotal != null && rosterTotal > roster.length
                    ? `Showing ${roster.length} of ${rosterTotal}${activeSearch ? ' matching' : ''} proposals, most recently updated first.`
                    : `Showing the first ${roster.length}${activeSearch ? ' matching' : ''} proposals, most recently updated first.`}
                  {' '}Search by client name, email or title to reach any of the rest - every proposal stays revocable.
                </p>
              ) : null}
              {countsAvailable ? null : (
                <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900" data-testid="counts-unavailable">
                  Line and submission counts could not be read just now, so they are shown as unknown. Everything else on this roster - Copy link, Re-import, Revoke - still works.
                </p>
              )}
              {roster.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3" data-testid={`proposal-${p.id}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{p.client_name}</span>
                      <span className="line-clamp-2 text-sm text-muted-foreground">{p.title}</span>
                      {statusBadge(p.status)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.line_count == null || p.submission_count == null ? (
                        'Counts unavailable'
                      ) : (
                        <>
                          {p.line_count} {plural(p.line_count, 'line')} · {p.submission_count} {plural(p.submission_count, 'submission')}
                          {p.latest_total_cents != null ? ` · latest ${dollars(p.latest_total_cents)}` : ''}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => copyLink(p)}><Link2 className="mr-1 h-4 w-4" />Copy link</Button>
                    {/*
                      replaceLines refuses a revoked proposal outright (409), so
                      the row's own status can say so now rather than after the
                      admin has emptied the importer, pasted the corrected CSV
                      and composed it. Send is gated in the UI for exactly this
                      reason, with the server as the backstop.

                      The tooltip names Restore, not Re-send: Send is switched
                      off for every row until the client page ships, so telling
                      an admin to press it left the row frozen with no way out.
                    */}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || p.status === 'revoked'}
                      title={p.status === 'revoked'
                        ? 'Revoked - restore it to draft before re-importing its lines'
                        : undefined}
                      onClick={() => armReimport(p)}
                      data-testid="reimport-btn"
                    >
                      <FileUp className="mr-1 h-4 w-4" />Re-import
                    </Button>
                    {p.status !== 'revoked' ? (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => act(p, 'revoke')}><Ban className="mr-1 h-4 w-4" />Revoke</Button>
                    ) : (
                      /*
                        The way back. Revoking has always been reversible, but
                        every other door out of it needs the client page: Send is
                        off until Slice 3 and re-import is refused while the
                        status reads revoked, so without this a revoked proposal
                        had exactly one control left - Copy link - and a tooltip
                        pointing at a button that could not be pressed.
                      */
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        title="Back to draft, so its lines can be corrected and it can be sent again"
                        onClick={() => act(p, 'restore')}
                        data-testid="restore-btn"
                      >
                        <RotateCcw className="mr-1 h-4 w-4" />Restore to draft
                      </Button>
                    )}
                    <Button
                      size="sm"
                      disabled={busy || !CLIENT_PAGE_LIVE || !p.client_email}
                      title={!CLIENT_PAGE_LIVE ? CLIENT_PAGE_NOT_LIVE_MESSAGE : p.client_email ? undefined : 'No client email - use Copy link'}
                      onClick={() => act(p, 'send')}
                      data-testid="send-btn"
                    >
                      <Send className="mr-1 h-4 w-4" />{p.status === 'revoked' ? 'Re-send' : 'Send'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{reimportTarget ? `Re-import for ${reimportTarget.client_name}` : 'Import a proposal CSV'}</CardTitle>
          <CardDescription>
            {reimportTarget
              ? 'Same link, corrected lines. Past submissions keep their own snapshots.'
              : 'Drop the estimator’s proposal export (title, description, price). Nothing is created until you press Create; nothing is emailed until you press Send.'}
            {reimportTarget ? (
              <Button size="sm" variant="ghost" className="ml-2" onClick={cancelReimport}><X className="mr-1 h-4 w-4" />Cancel re-import</Button>
            ) : null}
          </CardDescription>
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
                  className={`rounded-lg border p-3 ${r.members ? 'border-primary bg-primary/5' : ''}`}
                  data-testid={r.members ? 'bundle-row' : 'line-row'}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    {/*
                      The tick is the mobile-first path's primary control, so it
                      carries the house 44px target - but globals.css only bumps
                      buttons, and a checkbox is not one. The padded label is the
                      target (the sibling send-service-quote page's pattern); the
                      box itself stays 20px, so the hit area grows and the visual
                      does not.
                    */}
                    <label
                      className="-mx-1.5 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center"
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
                    <Badge variant={r.optional ? 'default' : 'secondary'}>{r.optional ? 'optional' : 'locked'}</Badge>
                    {r.members ? (
                      <Input
                        className="h-11 w-auto min-w-40 flex-1 font-semibold"
                        value={r.title}
                        aria-label="Bundle name"
                        onChange={(e) => renameBundle(r.key, e.target.value)}
                        onBlur={() => commitBundleName(r.key)}
                      />
                    ) : (
                      /*
                        min-w-40, not min-w-0: with a zero basis the name is the
                        only thing on the row that can shrink, so at 390px a line
                        whose price and toggle happen to fit beside it kept them
                        and left the name a 10px box reading "M", while the row
                        below - whose longer toggle wrapped - got 100px. The
                        floor makes the name the item that forces the wrap, so
                        the price and toggle drop to their own line first and
                        every name reads the same width either way.

                        line-clamp-2, not truncate: a line's TITLE is what the
                        admin picks it by when ticking rows to combine, and at
                        390px truncate ellipsised most of them on one line
                        ("Matte black faucet pa..."), leaving two faucet lines
                        that read identically. Two lines is enough for every
                        title the estimator exports, and desktop widths fit one
                        line anyway, so this only changes the narrow case.
                      */
                      <span className="min-w-40 flex-1 line-clamp-2 break-words font-medium" data-testid="line-title">{r.title}</span>
                    )}
                    <div className="flex items-center gap-3">
                      <span className="font-semibold tabular-nums">{dollars(r.priceCents)}</span>
                      <Button size="sm" variant="ghost" onClick={() => toggleOptional(r.key)} aria-label={`Make ${r.title} ${r.optional ? 'locked' : 'optional'}`}>
                        <Undo2 className="mr-1 h-4 w-4" />{r.optional ? 'Lock' : 'Make optional'}
                      </Button>
                    </div>
                  </div>
                  {r.members && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 pl-8 text-xs text-muted-foreground">
                      <span>Includes: {r.members.map((m) => m.title).join(' · ')}</span>
                      <span className="text-muted-foreground/70">(client sees names, never member prices)</span>
                      <Button size="sm" variant="outline" onClick={() => unbundle(r.key)}><Boxes className="mr-1 h-4 w-4" />Unbundle</Button>
                    </div>
                  )}
                  {!r.members && r.description ? (
                    <p className="mt-1 line-clamp-2 pl-8 text-xs text-muted-foreground">{r.description}</p>
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
    </div>
  );
}
