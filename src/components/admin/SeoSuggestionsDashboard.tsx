'use client';

/**
 * SEO Suggestions - the review queue for the weekly scorer's content_actions
 * (refresh / new / consolidate), with rationale and expected click-lift.
 *
 * The owner approves or rejects. Drafting is Claude Code's job now (decision
 * 004, Q11): "Draft with Claude Code" shows the exact CLI commands for the
 * action (src/lib/articles/cliCommand.ts). What Claude writes lands back on
 * the action as its draft, and "Send to blog" (new) or "Apply to live post"
 * (refresh, consolidate) take it from there.
 *
 * Data: /api/admin/content-actions (list + approve/reject),
 *       /api/admin/content-actions/stage and /apply.
 */
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Loader2, RefreshCw, Check, X, Terminal, AlertTriangle, Send, Copy, Upload } from 'lucide-react';
import { claudeCodeCommands, claudeCodePrompt } from '@/lib/articles/cliCommand';

interface PostLite {
  title: string;
  slug: string;
}
interface ActionItem {
  id: string;
  action_type: 'refresh' | 'consolidate' | 'new';
  target_query: string | null;
  target_post_id: string | null;
  consolidate_into_id: string | null;
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
  const [showCli, setShowCli] = useState<string | null>(null);

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

  const apply = async (id: string) => {
    if (!confirm('Apply this draft to the live post? The current version is saved first, and the 14-day check can roll it back.')) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch('/api/admin/content-actions/apply', {
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
      setError(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setBusyId(null);
    }
  };

  const pending = actions.filter((a) => a.status === 'pending');
  const rest = actions.filter((a) => a.status !== 'pending');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-60">
          <h2 className="text-2xl font-bold text-slate-900">SEO Suggestions</h2>
          <p className="text-sm text-slate-500">
            Opportunities scored from Search Console and GA4. Approve one, then draft it with Claude Code.
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
                  cliOpen={showCli === a.id}
                  onToggleCli={() => setShowCli(showCli === a.id ? null : a.id)}
                  onStage={() => stage(a.id)}
                  onApply={() => apply(a.id)}
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
                  cliOpen={showCli === a.id}
                  onToggleCli={() => setShowCli(showCli === a.id ? null : a.id)}
                  onStage={() => stage(a.id)}
                  onApply={() => apply(a.id)}
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
  cliOpen,
  onToggleCli,
  onStage,
  onApply,
}: {
  a: ActionItem;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onReject: () => void;
  cliOpen: boolean;
  onToggleCli: () => void;
  onStage: () => void;
  onApply: () => void;
}) {
  const reason = (a.rationale?.reason as string) ?? '';
  const canStage = a.status === 'drafted' && a.action_type === 'new' && !!a.draft_markdown;
  const canApply = a.status === 'drafted' && a.action_type !== 'new' && !!a.draft_markdown;
  return (
    <Card className="p-4">
      {/* Phones: badge, text and buttons stack, so a long button label never
          sits on top of the status pill or squeezes the title to an ellipsis. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Badge className={`${TYPE_STYLE[a.action_type]} self-start shrink-0`}>{TYPE_LABEL[a.action_type]}</Badge>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-900 break-words sm:truncate">{targetLabel(a)}</div>
          {reason && <div className="text-sm text-slate-500 mt-0.5">{reason}</div>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 mt-1">
            {a.expected_lift_clicks != null && <span>~{a.expected_lift_clicks} clicks/mo upside</span>}
            <Badge className={`${STATUS_STYLE[a.status] ?? ''} text-[10px] whitespace-nowrap`}>{a.status}</Badge>
            {a.draft_markdown && (
              <button className="underline" onClick={onToggle}>
                {expanded ? 'Hide draft' : 'View draft'}
              </button>
            )}
            {a.status === 'completed' && a.published_post && (
              <a className="underline text-violet-700" href={`/blog/preview/${a.published_post.slug}`} target="_blank" rel="noreferrer">
                Linked post: preview
              </a>
            )}
          </div>
        </div>
        <div className="flex flex-row flex-wrap gap-2 sm:flex-col sm:shrink-0">
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
            <Button size="sm" variant="secondary" onClick={onToggleCli} aria-expanded={cliOpen}>
              <Terminal className="h-4 w-4 mr-1" />
              {a.draft_markdown ? 'Re-draft with Claude Code' : 'Draft with Claude Code'}
            </Button>
          )}
          {canStage && (
            <Button size="sm" onClick={onStage} disabled={busy} title="Create an unpublished blog draft + email you">
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              Send to blog
            </Button>
          )}
          {canApply && (
            <Button size="sm" onClick={onApply} disabled={busy} title="Save the live post, then rewrite it from this draft">
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
              Apply to live post
            </Button>
          )}
        </div>
      </div>

      {cliOpen && <ClaudeCodePanel a={a} />}

      {expanded && a.draft_markdown && (
        <pre className="mt-3 max-h-96 overflow-auto rounded bg-slate-50 p-3 text-xs whitespace-pre-wrap text-slate-700">
          {a.draft_markdown}
        </pre>
      )}
    </Card>
  );
}

/** The commands that draft this action with Claude Code (RM3), with a copy button. */
function ClaudeCodePanel({ a }: { a: ActionItem }) {
  const commands = claudeCodeCommands(a);
  const prompt = claudeCodePrompt(a);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(commands.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm" data-testid="claude-code-panel">
      <p className="text-slate-600">
        Ask Claude Code: <span className="font-medium text-slate-800">{prompt}</span>
      </p>
      <p className="mt-2 text-slate-600">Or run these after writing the article to <code>article.md</code>:</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
        <pre className="w-full sm:flex-1 min-w-0 overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-100 whitespace-pre">
          {commands.join('\n')}
        </pre>
        <Button size="sm" variant="outline" className="self-start" onClick={() => void copy()} aria-label="Copy commands">
          <Copy className="h-4 w-4 mr-1" /> {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Setup and every option: docs/articles-ingest.md. The draft shows up here when Claude sends it.
      </p>
    </div>
  );
}
