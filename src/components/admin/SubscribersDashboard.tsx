'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Eye, ChevronDown, ChevronUp, RefreshCw, MapPin } from 'lucide-react';

interface TopListing { slug: string; views: number }
interface Subscriber {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  zip_codes: string[];
  status: string;
  verified_at: string | null;
  last_seen_at: string | null;
  visitor_id: string | null;
  created_at: string | null;
  recent_views: number;
  last_path: string | null;
  top_listings: TopListing[];
}
interface TrailRow { path: string; listing_slug: string | null; referrer: string | null; created_at: string }

function fmt(ts: string | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function statusColor(status: string): string {
  if (status === 'active') return 'bg-green-100 text-green-800 border-green-200';
  if (status === 'pending') return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

/**
 * Admin "Subscribers" view — who the Buy + Remodel subscribers are and how they
 * use the site. Reads /api/admin/subscribers (admin-gated). Read-only; expand a
 * row to see that subscriber's recent page-view trail.
 */
export default function SubscribersDashboard() {
  const [subs, setSubs] = useState<Subscriber[]>([]);
  const [windowSize, setWindowSize] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [trail, setTrail] = useState<TrailRow[]>([]);
  const [trailLoading, setTrailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/subscribers');
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      setSubs(data.subscribers ?? []);
      setWindowSize(data.activity_window ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load subscribers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    setTrail([]);
    setTrailLoading(true);
    try {
      const res = await fetch(`/api/admin/subscribers?subscriber_id=${encodeURIComponent(id)}`);
      const data = await res.json();
      setTrail(data.activity ?? []);
    } catch {
      setTrail([]);
    } finally {
      setTrailLoading(false);
    }
  };

  const activeCount = subs.filter((s) => s.status === 'active').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" /> Subscribers
          </h2>
          <p className="text-sm text-muted-foreground">
            Buy + Remodel subscribers and how they browse the site. View counts reflect the most recent {windowSize.toLocaleString()} page views.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Total subscribers</p>
          <p className="text-2xl font-bold">{subs.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Active</p>
          <p className="text-2xl font-bold text-green-600">{activeCount}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Seen in recent window</p>
          <p className="text-2xl font-bold">{subs.filter((s) => s.recent_views > 0).length}</p>
        </CardContent></Card>
      </div>

      {error && <Card className="border-red-200 bg-red-50"><CardContent className="p-4 text-sm text-red-700">{error}</CardContent></Card>}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Who&apos;s browsing</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading && subs.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : subs.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No subscribers yet.</p>
          ) : (
            <div className="divide-y">
              {subs.map((s) => (
                <div key={s.id}>
                  <button
                    type="button"
                    onClick={() => toggle(s.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{s.first_name} {s.last_name}</span>
                        <Badge className={`text-[10px] px-1.5 py-0 ${statusColor(s.status)}`}>{s.status}</Badge>
                        {s.zip_codes?.length > 0 && (
                          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-0.5">
                            <MapPin className="w-3 h-3" />{s.zip_codes.slice(0, 3).join(', ')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{s.email}{s.phone ? ` · ${s.phone}` : ''}</p>
                    </div>
                    <div className="hidden sm:block text-right">
                      <p className="text-xs text-muted-foreground">Last seen</p>
                      <p className="text-sm">{fmt(s.last_seen_at)}</p>
                    </div>
                    <div className="text-right w-16">
                      <p className="text-xs text-muted-foreground inline-flex items-center gap-1"><Eye className="w-3 h-3" /> views</p>
                      <p className="text-sm font-semibold">{s.recent_views}</p>
                    </div>
                    {expanded === s.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </button>

                  {expanded === s.id && (
                    <div className="bg-muted/30 px-4 py-3 space-y-3">
                      {s.top_listings.length > 0 && (
                        <div>
                          <p className="text-xs font-medium mb-1">Top listings viewed</p>
                          <div className="flex flex-wrap gap-1.5">
                            {s.top_listings.map((l) => (
                              <Badge key={l.slug} variant="secondary" className="text-[11px]">{l.slug} · {l.views}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-medium mb-1">Recent activity</p>
                        {trailLoading ? (
                          <p className="text-xs text-muted-foreground">Loading…</p>
                        ) : trail.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No page views recorded yet.</p>
                        ) : (
                          <ul className="space-y-1 max-h-64 overflow-y-auto">
                            {trail.map((t, i) => (
                              <li key={i} className="text-xs flex items-center justify-between gap-3">
                                <span className="font-mono truncate">{t.path}</span>
                                <span className="text-muted-foreground flex-shrink-0">{fmt(t.created_at)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      {s.visitor_id && (
                        <p className="text-[11px] text-muted-foreground">Linked device id: <span className="font-mono">{s.visitor_id}</span></p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
