'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Search } from 'lucide-react';
import { STREAMS, type StreamKey } from '@/lib/preferences/preferences';

type StreamState = Record<StreamKey, boolean>;
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
  const [loaded, setLoaded] = useState(false);
  const [exists, setExists] = useState(false);
  const [streams, setStreams] = useState<StreamState>({
    home_care: true,
    buy_remodel: true,
    announcements: true,
  });
  const [events, setEvents] = useState<PrefEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const lookup = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!email.trim()) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/preferences?email=${encodeURIComponent(email.trim())}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Lookup failed');
        setExists(data.exists);
        if (data.preferences) setStreams(data.preferences);
        else setStreams({ home_care: true, buy_remodel: true, announcements: true });
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
    [email, toast],
  );

  const toggle = useCallback(
    async (key: StreamKey) => {
      const next = { ...streams, [key]: !streams[key] };
      setStreams(next);
      setSaving(true);
      try {
        const res = await fetch('/api/admin/preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), changes: { [key]: next[key] } }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Save failed');
        setStreams(data.preferences);
        setExists(true);
        // Refresh the audit trail after a change.
        lookup();
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
    [streams, email, toast, lookup],
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
                {email}
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
    </div>
  );
}
