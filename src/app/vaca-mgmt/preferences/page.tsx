'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Search, Download, RefreshCw, Radio } from 'lucide-react';
import { STREAMS, STREAM_KEYS, type StreamKey } from '@/lib/preferences/streams';

type StreamState = Record<StreamKey, boolean>;

type BulkRow = StreamState & {
  email: string;
  updated_at?: string;
};

/** All marketing streams set to `value` — derived so new streams can't be missed. */
const allStreams = (value: boolean): StreamState =>
  Object.fromEntries(STREAM_KEYS.map((k) => [k, value])) as StreamState;
interface PrefEvent {
  id: string;
  stream: string;
  old_value: boolean | null;
  new_value: boolean;
  actor: string;
  actor_detail: string | null;
  created_at: string;
}

export default function AdminPreferencesPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [activeEmail, setActiveEmail] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [exists, setExists] = useState(false);
  const [streams, setStreams] = useState<StreamState>(allStreams(true));
  const [events, setEvents] = useState<PrefEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Bulk list + export
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [bulkTruncated, setBulkTruncated] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [filterStream, setFilterStream] = useState('');
  const [filterState, setFilterState] = useState('');

  // Broadcast suppression sync
  const [audienceId, setAudienceId] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const bulkQuery = useCallback(() => {
    const p = new URLSearchParams({ all: '1' });
    if (filterStream && filterState) {
      p.set('stream', filterStream);
      p.set('state', filterState);
    }
    return p.toString();
  }, [filterStream, filterState]);

  const loadBulk = useCallback(async () => {
    setBulkLoading(true);
    try {
      const res = await fetch(`/api/admin/preferences?${bulkQuery()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Load failed');
      setBulkRows(data.rows || []);
      setBulkTruncated(!!data.truncated);
    } catch (err) {
      toast({
        title: 'Failed to load contacts',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setBulkLoading(false);
    }
  }, [bulkQuery, toast]);

  useEffect(() => {
    loadBulk();
  }, [loadBulk]);

  const syncAudience = useCallback(async () => {
    if (!audienceId.trim()) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/admin/broadcasts/sync-suppression', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audienceId: audienceId.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.status === 'error') throw new Error(data.error || 'Sync failed');
      if (data.status === 'skipped') {
        setSyncResult('Skipped — RESEND_API_KEY not configured in this environment.');
      } else {
        setSyncResult(
          `Synced: ${data.newlyUnsubscribed} newly unsubscribed, ${data.alreadyUnsubscribed} already, of ${data.audienceContacts} in the audience (${data.suppressedInDb} opted out in total).` +
            (data.hasMore ? ' Audience has more pages — run again.' : ''),
        );
      }
    } catch (err) {
      setSyncResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing(false);
    }
  }, [audienceId]);

  const loadContact = useCallback(
    async (target: string) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/preferences?email=${encodeURIComponent(target)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Lookup failed');
        setActiveEmail(target);
        setExists(data.exists);
        if (data.preferences) setStreams(data.preferences);
        else setStreams(allStreams(true));
        setEvents(data.events || []);
        setLoaded(true);
      } catch (err) {
        toast({
          title: 'Lookup failed',
          description: err instanceof Error ? err.message : String(err),
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  const lookup = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const target = email.trim();
      if (!target) return;
      loadContact(target);
    },
    [email, loadContact],
  );

  const toggle = useCallback(
    async (key: StreamKey) => {
      if (!activeEmail) return;
      const next = { ...streams, [key]: !streams[key] };
      setStreams(next);
      setSaving(true);
      try {
        const res = await fetch('/api/admin/preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: activeEmail, changes: { [key]: next[key] } }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Save failed');
        setStreams(data.preferences);
        setExists(true);
        // Refresh the audit trail after a change.
        loadContact(activeEmail);
      } catch (err) {
        toast({
          title: 'Save failed',
          description: err instanceof Error ? err.message : String(err),
          variant: 'destructive',
        });
        setStreams(streams); // revert
      } finally {
        setSaving(false);
      }
    },
    [streams, activeEmail, toast, loadContact],
  );

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Subscription preferences</h1>
        <p className="text-muted-foreground mt-1">
          Look up any contact by email to see and manage which marketing emails they receive, plus
          the full change history.
        </p>
      </div>

      <form onSubmit={lookup} className="flex items-center gap-2 mb-6">
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="contact@example.com"
          className="h-9 max-w-sm"
          type="email"
          data-testid="admin-pref-email"
        />
        <Button type="submit" size="sm" disabled={loading}>
          <Search className="mr-2 h-4 w-4" /> Look up
        </Button>
      </form>

      {loaded && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {activeEmail}
                {!exists && (
                  <Badge variant="outline" className="ml-2 font-normal">
                    no preferences set yet (defaults shown)
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Toggling here is recorded as an admin change. Transactional email always sends.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {STREAMS.map((s) => (
                  <div
                    key={s.key}
                    className="flex items-center justify-between gap-4 rounded-lg border p-4"
                    data-testid={`admin-stream-${s.key}`}
                  >
                    <div>
                      <div className="font-semibold">{s.label}</div>
                      <div className="text-sm text-muted-foreground">{s.description}</div>
                    </div>
                    <Switch
                      checked={streams[s.key]}
                      disabled={saving}
                      onCheckedChange={() => toggle(s.key)}
                      aria-label={`Toggle ${s.label}`}
                      data-testid={`admin-switch-${s.key}`}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Change history</CardTitle>
              <CardDescription>{events.length} recorded change(s), newest first.</CardDescription>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <div className="text-muted-foreground text-sm py-4 text-center">
                  No changes recorded for this contact yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {events.map((ev) => (
                    <div key={ev.id} className="flex items-center justify-between gap-4 text-sm border-b pb-2">
                      <div>
                        <span className="capitalize font-medium">{ev.stream.replace(/_/g, ' ')}</span>{' '}
                        <span className="text-muted-foreground">
                          → {ev.new_value ? 'subscribed' : 'unsubscribed'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <Badge variant="outline" className="font-normal">
                          {ev.actor}
                          {ev.actor_detail ? `: ${ev.actor_detail}` : ''}
                        </Badge>
                        <span className="whitespace-nowrap">
                          {new Date(ev.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Broadcast suppression sync */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Radio className="h-4 w-4" /> Broadcast suppression
          </CardTitle>
          <CardDescription>
            Resend broadcasts send to an audience, so run this right before a broadcast to flag every
            &ldquo;News &amp; offers&rdquo; opt-out as unsubscribed in that audience — the broadcast then skips them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={audienceId}
              onChange={(e) => setAudienceId(e.target.value)}
              placeholder="Resend audience ID"
              className="h-9 max-w-xs font-mono text-sm"
              data-testid="audience-id"
            />
            <Button size="sm" onClick={syncAudience} disabled={syncing || !audienceId.trim()}>
              <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} /> Sync audience
            </Button>
          </div>
          {syncResult && (
            <div className="mt-3 text-sm text-muted-foreground" data-testid="sync-result">
              {syncResult}
            </div>
          )}
        </CardContent>
      </Card>

      {/* All contacts / bulk export */}
      <Card className="mt-6">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">All contacts</CardTitle>
              <CardDescription data-testid="bulk-count">
                {bulkRows.length} preference record(s).
                {bulkTruncated &&
                  ' Showing the most recent only — download the CSV for the complete list.'}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterStream}
                onChange={(e) => setFilterStream(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                data-testid="bulk-stream"
              >
                <option value="">All streams</option>
                {STREAMS.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
              <select
                value={filterState}
                onChange={(e) => setFilterState(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                disabled={!filterStream}
                data-testid="bulk-state"
              >
                <option value="">Any state</option>
                <option value="on">Subscribed</option>
                <option value="off">Unsubscribed</option>
              </select>
              <Button variant="outline" size="sm" onClick={loadBulk} disabled={bulkLoading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${bulkLoading ? 'animate-spin' : ''}`} /> Refresh
              </Button>
              <a href={`/api/admin/preferences?${bulkQuery()}&format=csv`} download>
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" /> CSV
                </Button>
              </a>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {bulkLoading && bulkRows.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">Loading…</div>
          ) : bulkRows.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground" data-testid="bulk-empty">
              No preference records yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                    <th className="py-2 pr-4">Email</th>
                    {STREAMS.map((s) => (
                      <th key={s.key} className="py-2 px-2 text-center">{s.label}</th>
                    ))}
                    <th className="py-2 pl-2 text-right">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkRows.map((r) => (
                    <tr key={r.email} className="border-b last:border-0" data-testid={`bulk-row-${r.email}`}>
                      <td className="py-2 pr-4 break-all">{r.email}</td>
                      {STREAM_KEYS.map((k) => (
                        <td key={k} className="py-2 px-2 text-center">{r[k] ? '✓' : '—'}</td>
                      ))}
                      <td className="py-2 pl-2 text-right text-xs text-muted-foreground whitespace-nowrap">
                        {r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
