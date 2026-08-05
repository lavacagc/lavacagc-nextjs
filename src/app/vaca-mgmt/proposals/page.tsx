'use client';

/**
 * Customers -> Proposals (Proposal Pod, Slice 2).
 *
 * Two panels:
 *  - The roster: every proposal with status, submissions, and the lifecycle
 *    buttons (Copy link, Send, Re-import, Revoke).
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
 * House rule honored: buttons keep the global 44px touch minimum.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  RefreshCw, Link2, Send, Ban, Upload, Boxes, X, FileUp, Undo2,
} from 'lucide-react';
import { parseProposalCsv, type ParsedProposalLine } from '@/lib/proposals/csv';
import {
  composeBundle, restoreMembers, toStoredMembers, type PreviewBundleMember,
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
  line_count: number;
  submission_count: number;
  latest_total_cents: number | null;
  updated_at: string;
}

const dollars = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

let nextKey = 0;
const rowKey = () => `row-${nextKey++}`;

export default function ProposalsAdminPage() {
  const { toast } = useToast();

  // ---- roster ----
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const loadRoster = useCallback(async () => {
    setRosterError(null);
    try {
      const res = await fetch('/api/admin/proposals');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRoster((await res.json()).proposals);
    } catch {
      // A failed read is an outage message, never an empty roster.
      setRosterError('Could not load proposals - refresh to retry.');
    }
  }, []);
  useEffect(() => { loadRoster(); }, [loadRoster]);

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
  /** The text the current preview was built from, so blur cannot re-key it for nothing. */
  const lastParsed = useRef<string>('');

  const total = useMemo(() => rows.reduce((a, r) => a + r.priceCents, 0), [rows]);

  /**
   * Parse text into a fresh preview. This DISCARDS the current preview - new
   * keys, no bundles, no per-line overrides - so it runs only on a deliberate
   * import (a file, a paste, leaving the box, the Parse button), never on a
   * keystroke.
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
      category: l.category,
    })));
  }, []);

  /** Clear the preview outright - what an emptied paste box should mean. */
  const clearPreview = useCallback((text: string) => {
    lastParsed.current = text;
    setRows([]); setSelected(new Set()); setCsvErrors([]);
  }, []);

  /** Re-parse only when the text actually changed since the last import. */
  const parsePastedText = useCallback((text: string) => {
    if (text === lastParsed.current) return;
    if (!text.trim()) { clearPreview(text); return; }
    ingestCsv(text);
  }, [clearPreview, ingestCsv]);

  const onFile = useCallback((f: File | undefined | null) => {
    if (!f) return;
    f.text().then((text) => { setCsvText(text); ingestCsv(text); }).catch(() => {
      toast({
        title: 'Could not read that file',
        description: 'Try choosing it again, or paste the CSV text instead.',
        variant: 'destructive',
      });
    });
  }, [ingestCsv, toast]);

  // ---- bundling ----
  const combine = useCallback((keys: string[], name?: string) => {
    setRows((prev) => {
      const chosen = prev.filter((r) => keys.includes(r.key));
      const composed = composeBundle(chosen, name);
      if (!composed) return prev;
      const bundle: PreviewRow = { key: rowKey(), description: '', ...composed };
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
        optional: m.optional, category: m.category,
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

  const toggleOptional = useCallback((key: string) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, optional: !r.optional } : r)));
  }, []);

  const renameBundle = useCallback((key: string, title: string) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, title } : r)));
  }, []);

  /**
   * The rows a tick actually resolves to. Combine reads its count from HERE
   * rather than from selected.size, so a key left behind by any future path
   * that removes a row can never advertise a bundle that cannot be composed.
   */
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.key)), [rows, selected]);

  const toggleSelected = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

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
    try {
      if (reimportTarget) {
        const res = await fetch(`/api/admin/proposals/${reimportTarget.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reimport', lines: linesPayload() }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
        toast({ title: 'Proposal updated', description: `${reimportTarget.client_name} - same link, new lines.` });
      } else {
        const res = await fetch('/api/admin/proposals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_name: clientName.trim(),
            client_email: clientEmail.trim() || null,
            title: proposalTitle.trim(),
            lines: linesPayload(),
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
        toast({ title: 'Proposal created (draft)', description: 'Send it or copy the link from the roster.' });
      }
      setRows([]); setSelected(new Set()); setClientName(''); setClientEmail(''); setProposalTitle('');
      setCsvText(''); lastParsed.current = '';
      setReimportTarget(null);
      await loadRoster();
    } catch (err) {
      toast({ title: 'Could not save', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const act = async (p: RosterEntry, action: 'send' | 'revoke') => {
    if (action === 'revoke' && !window.confirm(`Revoke ${p.client_name}'s link? The page stops resolving until you re-send.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/proposals/${p.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      toast({ title: action === 'send' ? 'Sent' : 'Revoked', description: p.client_name });
      await loadRoster();
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
          {rosterError ? (
            <div className="flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
              <span>{rosterError}</span>
              <Button size="sm" variant="outline" onClick={loadRoster}><RefreshCw className="mr-1 h-4 w-4" />Retry</Button>
            </div>
          ) : roster === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : roster.length === 0 ? (
            <p className="text-sm text-muted-foreground">No proposals yet - import a CSV below to create the first one.</p>
          ) : (
            <div className="space-y-2">
              {roster.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3" data-testid={`proposal-${p.id}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{p.client_name}</span>
                      <span className="truncate text-sm text-muted-foreground">{p.title}</span>
                      {statusBadge(p.status)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.line_count} lines · {p.submission_count} submission{p.submission_count === 1 ? '' : 's'}
                      {p.latest_total_cents != null ? ` · latest ${dollars(p.latest_total_cents)}` : ''}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => copyLink(p)}><Link2 className="mr-1 h-4 w-4" />Copy link</Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => { setReimportTarget(p); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }}>
                      <FileUp className="mr-1 h-4 w-4" />Re-import
                    </Button>
                    {p.status !== 'revoked' ? (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => act(p, 'revoke')}><Ban className="mr-1 h-4 w-4" />Revoke</Button>
                    ) : null}
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
              <Button size="sm" variant="ghost" className="ml-2" onClick={() => setReimportTarget(null)}><X className="mr-1 h-4 w-4" />Cancel re-import</Button>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="mb-4 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
          >
            Drop the CSV here, or
            <Button variant="link" className="px-1" onClick={() => fileInput.current?.click()}>choose a file</Button>
            <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" data-testid="csv-file-input"
              onChange={(e) => onFile(e.target.files?.[0])} />
            <Textarea
              className="mt-3 font-mono text-xs"
              placeholder="…or paste the CSV text here"
              rows={3}
              data-testid="csv-paste"
              value={csvText}
              // Typing never re-imports: a fresh parse re-keys every row and
              // would throw away the bundles and overrides the admin composed,
              // which is exactly what fixing a typo in this box used to do.
              // Emptying it does clear the preview, because a cleared box that
              // still shows a preview reads as though the text is still loaded.
              onChange={(e) => {
                const text = e.target.value;
                setCsvText(text);
                if (!text.trim()) clearPreview(text);
              }}
              onPaste={(e) => {
                const el = e.currentTarget;
                // After the paste has landed in the value, not before.
                window.setTimeout(() => parsePastedText(el.value), 0);
              }}
              onBlur={(e) => parsePastedText(e.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              disabled={!csvText.trim()}
              onClick={() => ingestCsv(csvText)}
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
                  onDragStart={() => { dragKey.current = r.key; }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = dragKey.current; dragKey.current = null;
                    if (from && from !== r.key) combine([from, r.key]);
                  }}
                  className={`rounded-lg border p-3 ${r.members ? 'border-primary bg-primary/5' : ''}`}
                  data-testid={r.members ? 'bundle-row' : 'line-row'}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-primary"
                      checked={selected.has(r.key)}
                      onChange={() => toggleSelected(r.key)}
                      aria-label={`Select ${r.title}`}
                    />
                    <Badge variant={r.optional ? 'default' : 'secondary'}>{r.optional ? 'optional' : 'locked'}</Badge>
                    {r.members ? (
                      <Input
                        className="h-9 w-auto min-w-40 flex-1 font-semibold"
                        value={r.title}
                        aria-label="Bundle name"
                        onChange={(e) => renameBundle(r.key, e.target.value)}
                      />
                    ) : (
                      <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
                    )}
                    <span className="font-semibold tabular-nums">{dollars(r.priceCents)}</span>
                    <Button size="sm" variant="ghost" onClick={() => toggleOptional(r.key)} aria-label={`Make ${r.title} ${r.optional ? 'locked' : 'optional'}`}>
                      <Undo2 className="mr-1 h-4 w-4" />{r.optional ? 'Lock' : 'Make optional'}
                    </Button>
                  </div>
                  {r.members && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 pl-8 text-xs text-muted-foreground">
                      <span>Includes: {r.members.map((m) => m.title).join(' · ')}</span>
                      <span className="text-muted-foreground/70">(client sees names, never member prices)</span>
                      <Button size="sm" variant="outline" onClick={() => unbundle(r.key)}><Boxes className="mr-1 h-4 w-4" />Unbundle</Button>
                    </div>
                  )}
                  {!r.members && r.description ? (
                    <p className="mt-1 truncate pl-8 text-xs text-muted-foreground">{r.description}</p>
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
                disabled={busy || rows.length === 0 || (!reimportTarget && (!clientName.trim() || !proposalTitle.trim()))}
                onClick={create}
                data-testid="create-btn"
              >
                <Upload className="mr-1 h-4 w-4" />
                {reimportTarget ? 'Replace lines on this proposal' : 'Create proposal (draft)'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
