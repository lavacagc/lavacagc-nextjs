'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, RefreshCw, ExternalLink } from 'lucide-react';

interface LogRow {
  id: string;
  lead_id: string | null;
  recipient_email: string;
  recipient_name: string;
  cc_emails: string | null;
  project_type: string;
  estimate_url: string;
  portal_url: string | null;
  update_cadence: string | null;
  sent_at: string;
  sent_by: string | null;
  resend_message_id: string | null;
  status: string;
  error_message: string | null;
}

const STATUS_FILTERS: Array<'' | 'sent' | 'test' | 'failed'> = ['', 'sent', 'test', 'failed'];

export default function EstimateEmailLogPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'' | 'sent' | 'test' | 'failed'>('');

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/admin/estimate-email/log?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load log');
      setRows(data.rows || []);
    } catch (err) {
      toast({
        title: 'Failed to load log',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  useEffect(() => {
    fetchLog();
  }, [fetchLog]);

  const statusBadge = (status: string) => {
    if (status === 'sent') return <Badge variant="default">sent</Badge>;
    if (status === 'test') return <Badge variant="secondary">test</Badge>;
    if (status === 'failed') return <Badge variant="destructive">failed</Badge>;
    return <Badge variant="outline">{status}</Badge>;
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/vaca-mgmt/send-estimate">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Estimate email log</h1>
            <p className="text-muted-foreground mt-1">
              Audit trail of all estimate emails sent via the admin tool.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLog} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="flex gap-2 mb-4" data-testid="status-filter-bar">
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f || 'all'}
            variant={statusFilter === f ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(f)}
            data-testid={`status-filter-${f || 'all'}`}
          >
            {f || 'All'}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {rows.length} {rows.length === 1 ? 'send' : 'sends'}
          </CardTitle>
          <CardDescription>
            Newest first. Click an estimate URL to open the QBO estimate in a new tab.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && rows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No sends yet.</div>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => (
                <div
                  key={row.id}
                  data-testid={`log-row-${row.id}`}
                  className="border rounded-md p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <div className="font-semibold">{row.recipient_name}</div>
                      <div className="text-sm text-muted-foreground">
                        {row.recipient_email}
                        {row.cc_emails ? ` · CC: ${row.cc_emails}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {statusBadge(row.status)}
                      <span className="text-xs text-muted-foreground">
                        {new Date(row.sent_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                    <div>
                      <span className="text-muted-foreground">Project:</span> {row.project_type}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Sent by:</span>{' '}
                      {row.sent_by ?? '—'}
                    </div>
                    <div className="md:col-span-2">
                      <span className="text-muted-foreground">Estimate:</span>{' '}
                      <a
                        href={row.estimate_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1 break-all"
                      >
                        {row.estimate_url}
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                      </a>
                    </div>
                    {row.portal_url && (
                      <div className="md:col-span-2">
                        <span className="text-muted-foreground">Portal:</span>{' '}
                        <a
                          href={row.portal_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-1 break-all"
                        >
                          {row.portal_url}
                          <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        </a>
                      </div>
                    )}
                    {row.update_cadence && (
                      <div>
                        <span className="text-muted-foreground">Cadence:</span>{' '}
                        {row.update_cadence}
                      </div>
                    )}
                    {row.resend_message_id && (
                      <div>
                        <span className="text-muted-foreground">Message ID:</span>{' '}
                        <code className="text-xs">{row.resend_message_id}</code>
                      </div>
                    )}
                    {row.error_message && (
                      <div className="md:col-span-2 text-destructive text-xs mt-1">
                        Error: {row.error_message}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
