'use client';

/**
 * Staff "Home Record" view (My Home Systems, Slice 6).
 *
 * Roster of homeowners who saved home details, and a per-homeowner detail view
 * of those facts (shut-off locations, panel map, appliance sizes) so the crew
 * can prep a visit. This page is need-to-know: the API behind it re-checks the
 * session email against the dedicated HOME_CARE_STAFF_EMAILS allowlist (403 for
 * every other admin), and every detail view is audit-logged server-side BEFORE
 * the values are returned. The recent-access list below the facts makes that
 * log visible to the team.
 *
 * No sensitive value ever renders without a corresponding audit row - the API
 * enforces it, this page just explains it.
 */
import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, ArrowLeft, ShieldCheck, ShieldX, Eye, MapPin, Wrench } from 'lucide-react';

interface RosterRow {
  id: string;
  first_name: string | null;
  email: string;
  zip: string | null;
  home_type: string | null;
  status: string;
  fact_count: number;
  last_updated: string;
}

interface FactRow {
  fact_key: string;
  label: string;
  kind: string;
  summary: string;
  updated_by: string;
  updated_at: string;
}

interface AccessRow {
  staff_email: string;
  created_at: string;
}

interface DetailPayload {
  homeowner: {
    id: string;
    first_name: string | null;
    email: string;
    zip: string | null;
    home_type: string | null;
    status: string;
  };
  facts: FactRow[];
  recent_access: AccessRow[];
}

function ownerName(o: { first_name: string | null; email: string }) {
  return o.first_name?.trim() || o.email;
}

function homeTypeLabel(t: string | null) {
  return t ? t.replace(/_/g, ' ') : null;
}

export default function HomeRecordsPage() {
  const { toast } = useToast();
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchRoster = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/home-care/home-records');
      const data = await res.json();
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Failed to load home records');
      setRoster(data.roster || []);
    } catch (err) {
      toast({
        title: 'Failed to load home records',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  const openRecord = useCallback(
    async (homeownerId: string) => {
      setDetailLoading(true);
      try {
        const res = await fetch(
          `/api/admin/home-care/home-records?homeowner_id=${encodeURIComponent(homeownerId)}`,
        );
        const data = await res.json();
        if (res.status === 403) {
          setForbidden(true);
          return;
        }
        if (!res.ok) throw new Error(data.error || 'Failed to load this home record');
        setDetail(data as DetailPayload);
      } catch (err) {
        toast({
          title: 'Failed to load this home record',
          description: err instanceof Error ? err.message : String(err),
          variant: 'destructive',
        });
      } finally {
        setDetailLoading(false);
      }
    },
    [toast],
  );

  if (forbidden) {
    return (
      <div className="container mx-auto p-6 max-w-3xl">
        <Card data-testid="home-records-forbidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldX className="h-5 w-5 text-destructive" />
              Home Care staff only
            </CardTitle>
            <CardDescription>
              Saved home details include shut-off locations, so this page is limited to the Home
              Care staff list - not every admin login. If you should have access, ask Alex to add
              your email to the staff list.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (detail) {
    const o = detail.homeowner;
    return (
      <div className="container mx-auto p-6 max-w-4xl" data-testid="home-record-detail">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDetail(null)}
              data-testid="back-to-roster"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              All home records
            </Button>
            <h1 className="text-3xl font-bold mt-2">{ownerName(o)}</h1>
            <p className="text-muted-foreground mt-1">
              {o.email}
              {o.zip ? ` · ${o.zip}` : ''}
              {homeTypeLabel(o.home_type) ? ` · ${homeTypeLabel(o.home_type)}` : ''}
            </p>
          </div>
          <Badge variant={o.status === 'active' ? 'default' : 'secondary'} className="capitalize">
            {o.status}
          </Badge>
        </div>

        <div
          className="flex items-center gap-2 rounded-md border border-input bg-muted/40 px-4 py-3 mb-6 text-sm text-muted-foreground"
          data-testid="access-logged-notice"
        >
          <ShieldCheck className="h-4 w-4 flex-shrink-0" />
          This view was just logged - every look at a homeowner&apos;s saved details is recorded
          with who, what, and when.
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">
              Saved home details ({detail.facts.length})
            </CardTitle>
            <CardDescription>
              What {ownerName(o)} has saved about their home. Bring this to the visit - it is why
              they told us.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {detail.facts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" data-testid="no-facts">
                Nothing saved yet.
              </div>
            ) : (
              <div className="space-y-2">
                {detail.facts.map((f) => (
                  <div
                    key={f.fact_key}
                    className="border rounded-md p-4"
                    data-testid={`fact-${f.fact_key}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 font-semibold">
                          {f.kind === 'location' ? (
                            <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          ) : (
                            <Wrench className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          )}
                          {f.label}
                        </div>
                        <div className="text-sm mt-1 break-words">{f.summary}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <Badge variant="outline" className="capitalize font-normal">
                          {f.updated_by === 'staff' ? 'added by staff' : 'from homeowner'}
                        </Badge>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(f.updated_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Eye className="h-4 w-4" />
              Recent access
            </CardTitle>
            <CardDescription>Who opened this record last (newest first).</CardDescription>
          </CardHeader>
          <CardContent>
            {detail.recent_access.length === 0 ? (
              <div className="text-sm text-muted-foreground">No access recorded yet.</div>
            ) : (
              <div className="space-y-1" data-testid="recent-access">
                {detail.recent_access.map((a, i) => (
                  <div
                    key={`${a.created_at}-${i}`}
                    className="flex items-center justify-between text-sm py-1"
                  >
                    <span className="truncate">{a.staff_email}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                      {new Date(a.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Home records</h1>
          <p className="text-muted-foreground mt-1">
            Home details Home Care members saved - shut-off spots, panel notes, filter sizes - so
            the crew arrives knowing where things are.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchRoster} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div
        className="flex items-center gap-2 rounded-md border border-input bg-muted/40 px-4 py-3 mb-6 text-sm text-muted-foreground"
        data-testid="staff-only-notice"
      >
        <ShieldCheck className="h-4 w-4 flex-shrink-0" />
        Need-to-know: this page is limited to the Home Care staff list, and opening a record is
        logged.
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {roster.length} {roster.length === 1 ? 'home' : 'homes'} with saved details
          </CardTitle>
          <CardDescription>Most recently updated first. Open one to see its details.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && roster.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Loading…</div>
          ) : roster.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="empty-roster">
              No homeowners have saved home details yet.
            </div>
          ) : (
            <div className="space-y-2">
              {roster.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => openRecord(row.id)}
                  disabled={detailLoading}
                  data-testid={`roster-row-${row.id}`}
                  className="block w-full text-left border rounded-md p-4 hover:bg-muted/50 transition-colors disabled:opacity-60"
                >
                  <span className="flex items-start justify-between gap-4">
                    <span className="min-w-0">
                      <span className="block font-semibold truncate">{ownerName(row)}</span>
                      <span className="block text-sm text-muted-foreground truncate">
                        {row.email}
                        {row.zip ? ` · ${row.zip}` : ''}
                        {homeTypeLabel(row.home_type) ? ` · ${homeTypeLabel(row.home_type)}` : ''}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant="outline" className="font-normal">
                        {row.fact_count} {row.fact_count === 1 ? 'detail' : 'details'}
                      </Badge>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(row.last_updated).toLocaleDateString()}
                      </span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
