import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { format, formatDistanceToNowStrict } from 'date-fns';
import {
  Mail,
  Inbox,
  TrendingUp,
  Send,
  AlertTriangle,
  Plus,
  Pencil,
  ExternalLink,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * The owner's one-glance page (redesigned 2026-08-08 to the owner's brief):
 * "is everything running fine, and what needs updating - show me my latest
 * articles so I can click, edit, preview." Four live pulse tiles, an attention
 * banner, and the article list. Everything arrives in ONE fetch from
 * /api/admin/dashboard.
 */

// The amber "time to post" nudge fires after this many days without a new
// published article. 14 by the owner's explicit choice (2026-08-08).
const STALENESS_NUDGE_DAYS = 14;

interface DashboardArticle {
  id: string;
  title: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

interface DashboardData {
  articles: DashboardArticle[];
  drafts: number;
  lastPublishedAt: string | null;
  emails30d: { total: number; failed: number; bounced: number; ok: number };
  leads7d: number;
  pendingSuggestions: number;
  pendingFollowUps: number;
}

interface AdminDashboardProps {
  onNavigateToTab: (tab: string) => void;
  /** Open the blog editor for a post id, or a fresh editor when null. */
  onEditPost: (postId: string | null) => void;
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

interface PulseTileProps {
  icon: LucideIcon;
  value: string;
  label: string;
  goto: string;
  warn: boolean;
  onClick: () => void;
}

function PulseTile({ icon: Icon, value, label, goto, warn, onClick }: PulseTileProps) {
  return (
    <button
      onClick={onClick}
      className="relative text-left bg-background border rounded-lg p-4 shadow-sm hover:border-primary transition-colors"
    >
      <span
        aria-label={warn ? 'needs attention' : 'healthy'}
        className={`absolute top-4 right-4 w-2.5 h-2.5 rounded-full ${warn ? 'bg-amber-500' : 'bg-green-600'}`}
      />
      <Icon className="w-4 h-4 text-muted-foreground mb-2" />
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      <div className="text-xs font-semibold text-primary mt-2">{goto}</div>
    </button>
  );
}

export function AdminDashboard({ onNavigateToTab, onEditPost }: AdminDashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/dashboard');
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Failed to load dashboard');
        if (!cancelled) setData(body);
      } catch (error) {
        console.error('Error loading dashboard data:', error);
        if (!cancelled) {
          toast({
            title: 'Error',
            description: 'Failed to load dashboard data',
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Dashboard data could not be loaded. Try reloading the page.</p>
      </div>
    );
  }

  const emailProblems = data.emails30d.failed + data.emails30d.bounced;
  const staleDays = data.lastPublishedAt ? daysSince(data.lastPublishedAt) : null;
  const needsNewPost = staleDays === null || staleDays > STALENESS_NUDGE_DAYS;
  const attention = needsNewPost || emailProblems > 0;

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold">Dashboard</h2>

      {/* Pulse tiles - each number is a real, checkable fact and one click
          from its tab. Green across the board = everything is running fine. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PulseTile
          icon={Mail}
          value={`${data.emails30d.ok} / ${emailProblems}`}
          label="Emails delivered / problems (30d)"
          goto={emailProblems > 0 ? `${data.emails30d.failed} failed, ${data.emails30d.bounced} bounced - open Email Log` : 'Open Email Log'}
          warn={emailProblems > 0}
          onClick={() => onNavigateToTab('emails')}
        />
        <PulseTile
          icon={Inbox}
          value={String(data.leads7d)}
          label="New leads (7 days)"
          goto="Open Leads"
          warn={false}
          onClick={() => onNavigateToTab('leads')}
        />
        <PulseTile
          icon={TrendingUp}
          value={String(data.pendingSuggestions)}
          label="Content updates waiting for review"
          goto="Open SEO suggestions"
          warn={data.pendingSuggestions > 0}
          onClick={() => onNavigateToTab('seo')}
        />
        <PulseTile
          icon={Send}
          value={String(data.pendingFollowUps)}
          label="Follow-up emails queued"
          goto="Open Follow-Ups"
          warn={false}
          onClick={() => onNavigateToTab('follow-ups')}
        />
      </div>

      {attention && (
        <div className="border border-amber-300 border-l-4 border-l-amber-500 bg-amber-50 rounded-lg p-4">
          <div className="flex items-center gap-2 font-semibold text-amber-900 text-sm mb-1.5">
            <AlertTriangle className="w-4 h-4" />
            Needs your attention
          </div>
          <ul className="list-disc list-inside space-y-1 text-sm text-amber-900">
            {needsNewPost && (
              <li>
                {data.lastPublishedAt
                  ? <>No new article since <b>{format(new Date(data.lastPublishedAt), 'MMM d')}</b> - {staleDays} days.</>
                  : <>No articles published yet.</>}{' '}
                <button className="font-semibold text-primary hover:underline" onClick={() => onEditPost(null)}>
                  Write one now
                </button>
                {data.pendingSuggestions > 0 && (
                  <>
                    {' or '}
                    <button className="font-semibold text-primary hover:underline" onClick={() => onNavigateToTab('seo')}>
                      review the {data.pendingSuggestions} queued suggestion{data.pendingSuggestions === 1 ? '' : 's'}
                    </button>
                  </>
                )}
                .
              </li>
            )}
            {emailProblems > 0 && (
              <li>
                {data.emails30d.failed} email{data.emails30d.failed === 1 ? '' : 's'} failed and {data.emails30d.bounced} bounced in the last 30 days.{' '}
                <button className="font-semibold text-primary hover:underline" onClick={() => onNavigateToTab('emails')}>
                  See which ones
                </button>
                .
              </li>
            )}
          </ul>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap space-y-0">
          <div>
            <CardTitle>Your articles</CardTitle>
            <CardDescription className="mt-1">
              Newest first. Edit opens the editor; View opens the live page in a new tab.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => onNavigateToTab('blog')}>
              Drafts ({data.drafts})
            </Button>
            <Button size="sm" onClick={() => onEditPost(null)}>
              <Plus className="w-4 h-4 mr-1.5" />
              New Post
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {data.articles.length === 0 ? (
            <p className="text-muted-foreground text-sm px-6 py-8 text-center">
              No published articles yet.
            </p>
          ) : (
            <div className="divide-y">
              {data.articles.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 px-6 py-3 flex-wrap hover:bg-muted/30">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{a.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Updated {format(new Date(a.updated_at), 'MMM d, yyyy')} ({formatDistanceToNowStrict(new Date(a.updated_at), { addSuffix: true })})
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button variant="outline" size="sm" onClick={() => onEditPost(a.id)}>
                      <Pencil className="w-3.5 h-3.5 mr-1.5" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(`/blog/${a.slug}`, '_blank', 'noopener')}
                    >
                      <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                      View live
                    </Button>
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
