'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, Search, MailOpen, MousePointerClick, AlertTriangle } from 'lucide-react';

export interface EmailListRow {
  id: string;
  category: string;
  to_email: string;
  to_name: string | null;
  from_email: string;
  subject: string;
  status: string;
  resend_message_id: string | null;
  sent_by: string | null;
  delivered_at: string | null;
  first_opened_at: string | null;
  open_count: number;
  first_clicked_at: string | null;
  click_count: number;
  bounced_at: string | null;
  created_at: string;
  sent_at: string | null;
}

const CATEGORIES = [
  '', 'verification', 'welcome', 'estimate', 'lead_followup', 'lead_notification',
  'home_care_newsletter', 'buy_remodel', 'seo_report', 'staged_draft',
  'rollback_digest', 'form_error', 'feedback_request', 'broadcast', 'release', 'other',
];

const STATUS_FILTERS = ['', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'error'];

function statusBadge(row: EmailListRow) {
  const s = row.status;
  const variant =
    s === 'bounced' || s === 'complained' || s === 'failed' || s === 'error'
      ? 'destructive'
      : s === 'opened' || s === 'clicked' || s === 'delivered'
        ? 'default'
        : s === 'skipped'
          ? 'outline'
          : 'secondary';
  return <Badge variant={variant as 'default' | 'secondary' | 'destructive' | 'outline'}>{s}</Badge>;
}

function catLabel(c: string) {
  if (c === 'release') return 'Release notes';
  return c ? c.replace(/_/g, ' ') : 'All categories';
}

export default function EmailsLogPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<EmailListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [submittedQ, setSubmittedQ] = useState('');

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (status) params.set('status', status);
      if (submittedQ) params.set('q', submittedQ);
      const res = await fetch(`/api/admin/emails?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load email log');
      setRows(data.rows || []);
    } catch (err) {
      toast({
        title: 'Failed to load email log',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [category, status, submittedQ, toast]);

  useEffect(() => {
    fetchLog();
  }, [fetchLog]);

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Email tracking</h1>
          <p className="text-muted-foreground mt-1">
            Every email the site has sent — the exact message, who got it, and how it landed.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLog} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3" data-testid="email-filters">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm capitalize"
          data-testid="category-filter"
          aria-label="Filter by category"
        >
          {CATEGORIES.map((c) => (
            <option key={c || 'all'} value={c} className="capitalize">
              {catLabel(c)}
            </option>
          ))}
        </select>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmittedQ(q.trim());
          }}
        >
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search recipient or subject…"
            className="h-9 w-64"
            data-testid="email-search"
          />
          <Button type="submit" variant="outline" size="sm">
            <Search className="h-4 w-4" />
          </Button>
        </form>
      </div>
      <div className="flex flex-wrap gap-2 mb-4" data-testid="status-filter-bar">
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f || 'all'}
            variant={status === f ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatus(f)}
            className="capitalize"
            data-testid={`status-filter-${f || 'all'}`}
          >
            {f || 'All'}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {rows.length} {rows.length === 1 ? 'email' : 'emails'}
          </CardTitle>
          <CardDescription>Newest first. Click a row to see the full email that was sent.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && rows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="empty-state">
              No emails match these filters yet.
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => (
                <Link
                  key={row.id}
                  href={`/vaca-mgmt/emails/${row.id}`}
                  data-testid={`email-row-${row.id}`}
                  className="block border rounded-md p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4 mb-1">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{row.subject}</div>
                      <div className="text-sm text-muted-foreground truncate">
                        {row.to_name ? `${row.to_name} · ` : ''}
                        {row.to_email}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {statusBadge(row)}
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(row.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <Badge variant="outline" className="capitalize font-normal">
                      {catLabel(row.category)}
                    </Badge>
                    {row.open_count > 0 && (
                      <span className="inline-flex items-center gap-1 text-emerald-600">
                        <MailOpen className="h-3.5 w-3.5" /> {row.open_count}
                      </span>
                    )}
                    {row.click_count > 0 && (
                      <span className="inline-flex items-center gap-1 text-blue-600">
                        <MousePointerClick className="h-3.5 w-3.5" /> {row.click_count}
                      </span>
                    )}
                    {row.bounced_at && (
                      <span className="inline-flex items-center gap-1 text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5" /> bounced
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
