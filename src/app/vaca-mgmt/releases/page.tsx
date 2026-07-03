'use client';

/**
 * Admin · Release Notes (R1) — review the queued feature announcements,
 * preview/test the email, and (only ever manually) send it to all Home Care
 * members. Entries are written as features ship; this screen is the trigger.
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Megaphone, RefreshCw, Send, FlaskConical, Trash2, Pencil, X, Check } from 'lucide-react';

interface ReleaseEntry {
  id: string;
  headline: string;
  subhead: string;
  benefit: string;
  screenshot_path: string | null;
  status: 'queued' | 'sent';
  sort_order: number;
  created_at: string;
  sent_at: string | null;
}

interface EditState {
  headline: string;
  subhead: string;
  benefit: string;
}

export default function ReleasesAdminPage() {
  const { toast } = useToast();
  const [queued, setQueued] = useState<ReleaseEntry[]>([]);
  const [sent, setSent] = useState<ReleaseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState>({ headline: '', subhead: '', benefit: '' });
  const [confirmingSend, setConfirmingSend] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/releases', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setQueued(data.queued ?? []);
      setSent(data.sent ?? []);
    } catch {
      toast({ title: 'Could not load the release queue', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const startEdit = (e: ReleaseEntry) => {
    setEditing(e.id);
    setConfirmingDelete(null);
    setEdit({ headline: e.headline, subhead: e.subhead, benefit: e.benefit });
  };

  const saveEdit = async (id: string) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/releases?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(edit),
      });
      if (!res.ok) throw new Error(String(res.status));
      setEditing(null);
      await load();
      toast({ title: 'Entry updated' });
    } catch {
      toast({ title: 'Update failed', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/releases?id=${id}`, { method: 'DELETE', credentials: 'same-origin' });
      if (!res.ok) throw new Error(String(res.status));
      await load();
      toast({ title: 'Entry removed' });
    } catch {
      toast({ title: 'Delete failed', variant: 'destructive' });
    } finally {
      setBusy(null);
      setConfirmingDelete(null);
    }
  };

  const sendRelease = async (mode: 'test' | 'all') => {
    setBusy(`send-${mode}`);
    try {
      const res = await fetch('/api/admin/releases/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(mode === 'all' ? { mode, confirm: true } : { mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? String(res.status));
      if (mode === 'test') {
        toast({ title: `Test sent to ${data.to}`, description: `${data.features} feature${data.features === 1 ? '' : 's'} in the email — check your inbox.` });
      } else {
        toast({ title: `Release sent to ${data.sent} member${data.sent === 1 ? '' : 's'}`, description: `${data.suppressed} suppressed by preferences · ${data.failures} failures.${data.warning ? ` ${data.warning}.` : ''}` });
        setConfirmingSend(false);
        await load();
      }
    } catch (err) {
      toast({ title: 'Send failed', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const Entry = (e: ReleaseEntry) => (
    <div key={e.id} className="rounded-xl border border-border bg-card p-4">
      {editing === e.id ? (
        <div className="space-y-2">
          <Input value={edit.headline} onChange={(ev) => setEdit({ ...edit, headline: ev.target.value })} placeholder="Headline" />
          <Textarea value={edit.subhead} onChange={(ev) => setEdit({ ...edit, subhead: ev.target.value })} placeholder="Subhead" rows={2} />
          <Textarea value={edit.benefit} onChange={(ev) => setEdit({ ...edit, benefit: ev.target.value })} placeholder="Why it matters for the member" rows={2} />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => saveEdit(e.id)} disabled={busy === e.id}><Check className="h-4 w-4 mr-1" /> Save</Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(null)}><X className="h-4 w-4 mr-1" /> Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-4">
          {e.screenshot_path && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={e.screenshot_path} alt="" className="hidden sm:block w-28 rounded-lg border border-border shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-bold text-text-primary">{e.headline}</p>
            <p className="text-sm text-text-secondary mt-0.5">{e.subhead}</p>
            <p className="text-xs text-text-secondary mt-1.5"><span className="font-bold text-primary">Why it matters:</span> {e.benefit}</p>
            {e.status === 'sent' && e.sent_at && (
              <p className="text-xs text-text-muted mt-1.5">Sent {new Date(e.sent_at).toLocaleDateString()}</p>
            )}
          </div>
          {e.status === 'queued' && (
            confirmingDelete === e.id ? (
              <span className="inline-flex shrink-0 items-center gap-2">
                <span className="text-sm font-semibold text-destructive">Remove this entry?</span>
                <Button size="sm" variant="destructive" onClick={() => remove(e.id)} disabled={busy === e.id}>
                  <Trash2 className="h-4 w-4 mr-1" /> Remove
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmingDelete(null)}>Cancel</Button>
              </span>
            ) : (
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" onClick={() => startEdit(e)} aria-label="Edit entry"><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(e.id)} disabled={busy === e.id} aria-label="Delete entry"><Trash2 className="h-4 w-4" /></Button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 p-1">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-primary" /> Release Notes</CardTitle>
          <CardDescription>
            Queued feature announcements for Home Care members. Nothing is ever emailed automatically —
            test it to your own inbox, then send when you&apos;re ready. Sends are preference-aware and tracked in Email Tracking.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{queued.length} queued</Badge>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
            <div className="flex-1" />
            <Button size="sm" variant="outline" onClick={() => sendRelease('test')} disabled={busy !== null || queued.length === 0}>
              <FlaskConical className="h-4 w-4 mr-1" /> Send test to me
            </Button>
            {confirmingSend ? (
              <span className="inline-flex items-center gap-2">
                <span className="text-sm font-semibold text-destructive">Email every active member?</span>
                <Button size="sm" variant="destructive" onClick={() => sendRelease('all')} disabled={busy !== null}>
                  <Send className="h-4 w-4 mr-1" /> Yes, send it
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmingSend(false)}>Cancel</Button>
              </span>
            ) : (
              <Button size="sm" onClick={() => setConfirmingSend(true)} disabled={busy !== null || queued.length === 0}>
                <Send className="h-4 w-4 mr-1" /> Send to all members
              </Button>
            )}
          </div>

          {loading ? (
            <p className="text-sm text-text-secondary py-6 text-center">Loading…</p>
          ) : queued.length === 0 ? (
            <p className="text-sm text-text-secondary py-6 text-center">Nothing queued. New entries are added as features ship.</p>
          ) : (
            <div className="space-y-3">{queued.map(Entry)}</div>
          )}
        </CardContent>
      </Card>

      {sent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Previously announced</CardTitle>
            <CardDescription>Features already included in a sent edition.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">{sent.map(Entry)}</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
