'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Code, Eye } from 'lucide-react';

interface EmailRow {
  id: string;
  category: string;
  to_email: string;
  to_emails: string[] | null;
  to_name: string | null;
  cc_emails: string | null;
  from_email: string;
  reply_to: string | null;
  subject: string;
  html: string | null;
  text: string | null;
  homeowner_id: string | null;
  subscriber_id: string | null;
  lead_id: string | null;
  campaign: Record<string, unknown> | null;
  sent_by: string | null;
  resend_message_id: string | null;
  status: string;
  error_message: string | null;
  delivered_at: string | null;
  first_opened_at: string | null;
  open_count: number;
  first_clicked_at: string | null;
  click_count: number;
  bounced_at: string | null;
  complained_at: string | null;
  last_event_at: string | null;
  created_at: string;
  sent_at: string | null;
}

function ts(v: string | null) {
  return v ? new Date(v).toLocaleString() : null;
}

export default function EmailDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { toast } = useToast();
  const [row, setRow] = useState<EmailRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'rendered' | 'source'>('rendered');

  const fetchRow = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/emails/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load email');
      setRow(data.row);
    } catch (err) {
      toast({
        title: 'Failed to load email',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    fetchRow();
  }, [fetchRow]);

  const timeline: Array<{ label: string; at: string | null; tone?: string }> = row
    ? [
        { label: 'Created', at: row.created_at },
        { label: 'Sent', at: row.sent_at },
        { label: 'Delivered', at: row.delivered_at },
        {
          label: `Opened${row.open_count > 1 ? ` (${row.open_count}×)` : ''}`,
          at: row.first_opened_at,
          tone: 'emerald',
        },
        {
          label: `Clicked${row.click_count > 1 ? ` (${row.click_count}×)` : ''}`,
          at: row.first_clicked_at,
          tone: 'blue',
        },
        { label: 'Bounced', at: row.bounced_at, tone: 'red' },
        { label: 'Complained', at: row.complained_at, tone: 'red' },
      ].filter((e) => e.at)
    : [];

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        {/* Back into the admin SPA (with its sidebar), not the sidebar-less
            standalone list - that strand was the vanishing-nav bug. */}
        <Link href="/vaca-mgmt">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to all emails
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading…</div>
      ) : !row ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="not-found">
          Email not found.
        </div>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <CardTitle className="text-2xl break-words">{row.subject}</CardTitle>
                  <div className="text-sm text-muted-foreground mt-1">
                    <Badge variant="outline" className="capitalize font-normal mr-2">
                      {row.category.replace(/_/g, ' ')}
                    </Badge>
                    <Badge
                      variant={
                        ['bounced', 'complained', 'failed'].includes(row.status)
                          ? 'destructive'
                          : 'default'
                      }
                    >
                      {row.status}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <Field label="To" value={row.to_name ? `${row.to_name} <${row.to_email}>` : row.to_email} />
                <Field label="From" value={row.from_email} />
                {row.cc_emails && <Field label="CC" value={row.cc_emails} />}
                {row.reply_to && <Field label="Reply-To" value={row.reply_to} />}
                <Field label="Sent by" value={row.sent_by ?? 'system'} />
                {row.resend_message_id && (
                  <Field label="Resend ID" value={row.resend_message_id} mono />
                )}
                {row.lead_id && <Field label="Lead" value={row.lead_id} mono />}
                {row.homeowner_id && <Field label="Homeowner" value={row.homeowner_id} mono />}
                {row.subscriber_id && <Field label="Subscriber" value={row.subscriber_id} mono />}
                {row.error_message && (
                  <div className="md:col-span-2 text-destructive text-xs">
                    Error: {row.error_message}
                  </div>
                )}
              </dl>

              {timeline.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2" data-testid="event-timeline">
                  {timeline.map((e) => (
                    <div
                      key={e.label}
                      className="rounded-md border px-3 py-1.5 text-xs"
                    >
                      <span className="font-semibold">{e.label}</span>
                      <span className="text-muted-foreground ml-2">{ts(e.at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">What was sent</CardTitle>
                <div className="flex gap-1">
                  <Button
                    variant={view === 'rendered' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setView('rendered')}
                    data-testid="view-rendered"
                  >
                    <Eye className="mr-2 h-4 w-4" /> Rendered
                  </Button>
                  <Button
                    variant={view === 'source' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setView('source')}
                    data-testid="view-source"
                  >
                    <Code className="mr-2 h-4 w-4" /> Source
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {row.html ? (
                view === 'rendered' ? (
                  <iframe
                    // Sandboxed: no scripts, no same-origin — the stored HTML is
                    // rendered purely for visual inspection, never executed.
                    sandbox=""
                    srcDoc={row.html}
                    title="Email preview"
                    className="w-full h-[600px] rounded-md border bg-white"
                    data-testid="html-iframe"
                  />
                ) : (
                  <pre
                    className="text-xs bg-muted rounded-md p-4 overflow-auto max-h-[600px] whitespace-pre-wrap break-all"
                    data-testid="html-source"
                  >
                    {row.html}
                  </pre>
                )
              ) : row.text ? (
                <pre className="text-sm bg-muted rounded-md p-4 overflow-auto max-h-[600px] whitespace-pre-wrap">
                  {row.text}
                </pre>
              ) : (
                <div className="text-muted-foreground text-sm">No body was stored for this email.</div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`${mono ? 'font-mono text-xs' : ''} break-all`}>{value}</dd>
    </div>
  );
}
