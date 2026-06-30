'use client';

/**
 * SEO Suggestions — Phase 2 (Suggestor) review queue.
 *
 * Shows the content_actions the scoring engine proposed (refresh / new /
 * consolidate), with rationale + expected click-lift. The owner approves or
 * rejects, and can have GPT-5.5 draft an approved action (validated against the
 * fact-lock). Nothing publishes here — drafts are reviewed, Phase 3 schedules.
 *
 * Data: /api/admin/content-actions (list + approve/reject),
 *       /api/admin/content-actions/draft (AI draft).
 */
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Loader2, RefreshCw, Check, X, Sparkles, AlertTriangle, Send } from 'lucide-react';

interface PostLite {
  title: string;
  slug: string;
}
interface ActionItem {
  id: string;
  action_type: 'refresh' | 'consolidate' | 'new';
  target_query: string | null;
  rationale: Record<string, unknown> | null;
  expected_lift_clicks: number | null;
  status: string;
  draft_markdown: string | null;
  created_at: string;
  target_post: PostLite | null;
  consolidate_into: PostLite | null;
  published_post: PostLite | null;
}

const TYPE_LABEL: Record<string, string> = { refresh: 'Refresh', new: 'New post', consolidate: 'Consolidate' };
const TYPE_STYLE: Record<string, string> = {
  refresh: 'bg-amber-100 text-amber-800',
  new: 'bg-emerald-100 text-emerald-800',
  consolidate: 'bg-sky-100 text-sky-800',
};
const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700',
  approved: 'bg-blue-100 text-blue-800',
  drafted: 'bg-violet-100 text-violet-800',
  rejected: 'bg-red-100 text-red-700',
  completed: 'bg-green-100 text-green-800',
  rolled_back: 'bg-orange-100 text-orange-800',
};

function targetLabel(a: ActionItem): string {
  if (a.action_type === 'new') return a.target_query ? `“${a.target_query}”` : 'New article';
  if (a.action_type === 'consolidate') {
    return `${a.target_post?.title ?? 'post'} → ${a.consolidate_into?.title ?? 'primary'}`;
  }
  return a.target_post?.title ?? a.target_query ?? 'post';
}

export default function SeoSuggestionsDashboard() {
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/content-actions', { credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setActions(data.actions ?? []);
      setCounts(data.counts ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setBusyId(id);
    try {
      const res = await fetch('/api/admin/content-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id, decision }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const draft = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch('/api/admin/content-actions/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      await load();
      setExpanded(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Draft failed');
    } finally {
      setBusyId(null);
    }
  };

  const stage = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch('/api/admin/content-actions/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        const extra = Array.isArray(data.issues) && data.issues.length ? ` (${data.issues.join('; ')})` : '';
        throw new Error((data.error || `HTTP ${res.status}`) + extra);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Stage failed');
    } finally {
      setBusyId(null);
    }
  };

  const pending = actions.filter((a) => a.status === 'pending');
  const rest = actions.filter((a) => a.status !== 'pending');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">SEO Suggestions</h2>
          <p className="text-sm text-slate-500">
            AI-scored opportunities from Search Console + GA4. Approve to draft with GPT-5.5 — nothing publishes
            automatically.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(counts).map(([status, n]) => (
          <Badge key={status} className={STATUS_STYLE[status] ?? 'bg-slate-100 text-slate-700'}>
            {status}: {n}
          </Badge>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-red-50 text-red-700 px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 py-12 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading suggestions…
        </div>
      ) : actions.length === 0 ? (
        <Card className="p-10 text-center text-slate-500">
          No suggestions yet. They appear after the weekly scoring run (once Search Console data is flowing).
        </Card>
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <Section title={`Needs review (${pending.length})`}>
              {pending.map((a) => (
                <ActionRow
                  key={a.id}
                  a={a}
                  busy={busyId === a.id}
                  expanded={expanded === a.id}
                  onToggle={() => setExpanded(expanded === a.id ? null : a.id)}
                  onApprove={() => decide(a.id, 'approve')}
                  onReject={() => decide(a.id, 'reject')}
                  onDraft={() => draft(a.id)}
                  onStage={() => stage(a.id)}
                />
              ))}
            </Section>
          )}
          {rest.length > 0 && (
            <Section title={`Reviewed (${rest.length})`}>
              {rest.map((a) => (
                <ActionRow
                  key={a.id}
                  a={a}
                  busy={busyId === a.id}
                  expanded={expanded === a.id}
                  onToggle={() => setExpanded(expanded === a.id ? null : a.id)}
                  onApprove={() => decide(a.id, 'approve')}
                  onReject={() => decide(a.id, 'reject')}
                  onDraft={() => draft(a.id)}
                  onStage={() => stage(a.id)}
                />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function ActionRow({
  a,
  busy,
  expanded,
  onToggle,
  onApprove,
  onReject,
  onDraft,
  onStage,
}: {
  a: ActionItem;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onReject: () => void;
  onDraft: () => void;
  onStage: () => void;
}) {
  const reason = (a.rationale?.reason as string) ?? '';
  const canStage = a.status === 'drafted' && a.action_type === 'new' && !!a.draft_markdown;
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <Badge className={TYPE_STYLE[a.action_type]}>{TYPE_LABEL[a.action_type]}</Badge>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-900 truncate">{targetLabel(a)}</div>
          {reason && <div className="text-sm text-slate-500 mt-0.5">{reason}</div>}
          <div className="flex flex-wrap gap-3 text-xs text-slate-400 mt-1">
            {a.expected_lift_clicks != null && <span>~{a.expected_lift_clicks} clicks/mo upside</span>}
            <Badge className={`${STATUS_STYLE[a.status] ?? ''} text-[10px]`}>{a.status}</Badge>
            {a.draft_markdown && (
              <button className="underline" onClick={onToggle}>
                {expanded ? 'Hide draft' : 'View draft'}
              </button>
            )}
            {a.status === 'completed' && a.published_post && (
              <a className="underline text-violet-700" href={`/blog/preview/${a.published_post.slug}`} target="_blank" rel="noreferrer">
                Staged as draft → preview
              </a>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          {a.status === 'pending' && (
            <>
              <Button size="sm" onClick={onApprove} disabled={busy}>
                <Check className="h-4 w-4 mr-1" /> Approve
              </Button>
              <Button size="sm" variant="outline" onClick={onReject} disabled={busy}>
                <X className="h-4 w-4 mr-1" /> Reject
              </Button>
            </>
          )}
          {(a.status === 'approved' || a.status === 'drafted') && (
            <Button size="sm" variant="secondary" onClick={onDraft} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
              {a.draft_markdown ? 'Re-draft' : 'Draft with AI'}
            </Button>
          )}
          {canStage && (
            <Button size="sm" onClick={onStage} disabled={busy} title="Create an unpublished blog draft + email you">
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              Send to blog
            </Button>
          )}
        </div>
      </div>

      {expanded && a.draft_markdown && (
        <pre className="mt-3 max-h-96 overflow-auto rounded bg-slate-50 p-3 text-xs whitespace-pre-wrap text-slate-700">
          {a.draft_markdown}
        </pre>
      )}
    </Card>
  );
}
