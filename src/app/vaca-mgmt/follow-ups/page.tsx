'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { RefreshCw, Search } from 'lucide-react';
import {
  buildActiveDrips,
  sequenceOf,
  sequenceLabel,
  followUpTypeLabel,
  type ActiveDrip,
} from '@/lib/followups/activeDrips';
import { ActiveDripsList } from '@/components/admin/ActiveDripsList';
import {
  fetchFollowUpQueue,
  stopDrip,
  cancelFollowUp,
  resendFollowUp,
  type FollowUpQueueRow,
} from '@/lib/followups/followUpsApi';

export default function FollowUpsPage() {
  const [followUps, setFollowUps] = useState<FollowUpQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'drips' | 'all'>('drips');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('pending');

  const fetchFollowUps = useCallback(async () => {
    setLoading(true);
    try {
      setFollowUps(await fetchFollowUpQueue());
    } catch (error) {
      console.error('Error fetching follow-ups:', error);
      toast({ title: 'Error', description: 'Failed to load follow-ups', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFollowUps();
  }, [fetchFollowUps]);

  const drips = useMemo(() => buildActiveDrips(followUps), [followUps]);
  const filteredDrips = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return drips;
    return drips.filter(d => d.name.toLowerCase().includes(q) || d.email.toLowerCase().includes(q));
  }, [drips, search]);

  const dripStats = useMemo(() => ({
    people: new Set(drips.map(d => d.email.toLowerCase())).size,
    pending: drips.reduce((n, d) => n + d.pendingCount, 0),
    review: drips.filter(d => d.sequence === 'review').length,
  }), [drips]);

  const filteredAll = useMemo(
    () => (activeFilter === 'all' ? followUps : followUps.filter(f => f.status === activeFilter)),
    [followUps, activeFilter],
  );

  // Stop an entire drip for one person — only the clicked sequence (nurture vs
  // review), only still-pending rows, via the shared type-scoped helper.
  const handleStopDrip = async (drip: ActiveDrip) => {
    if (!window.confirm(`Stop the ${sequenceLabel(drip.sequence).toLowerCase()} drip for ${drip.name}? This cancels ${drip.pendingCount} pending email${drip.pendingCount === 1 ? '' : 's'}.`)) return;
    try {
      const stopped = await stopDrip(drip.email, drip.sequence);
      toast({
        title: 'Drip stopped',
        description: stopped > 0 ? `Cancelled ${stopped} pending email${stopped === 1 ? '' : 's'} for ${drip.name}.` : 'Nothing left to stop.',
      });
      fetchFollowUps();
    } catch (error) {
      console.error('Error stopping drip:', error);
      toast({ title: 'Error', description: 'Failed to stop the drip', variant: 'destructive' });
    }
  };

  const handleStopFollowUps = async (leadEmail: string, followUpType: string) => {
    try {
      const stopped = await stopDrip(leadEmail, sequenceOf(followUpType));
      toast({ title: 'Success', description: stopped > 0 ? `Stopped ${stopped} pending follow-up${stopped === 1 ? '' : 's'}` : 'No pending follow-ups to stop' });
      fetchFollowUps();
    } catch (error) {
      console.error('Error stopping follow-ups:', error);
      toast({ title: 'Error', description: 'Failed to stop follow-ups', variant: 'destructive' });
    }
  };

  const handleCancel = async (followUpId: string) => {
    try {
      await cancelFollowUp(followUpId);
      toast({ title: 'Success', description: 'Follow-up cancelled' });
      fetchFollowUps();
    } catch (error) {
      console.error('Error cancelling follow-up:', error);
      toast({ title: 'Error', description: 'Failed to cancel follow-up', variant: 'destructive' });
    }
  };

  const handleResend = async (followUp: FollowUpQueueRow) => {
    try {
      await resendFollowUp({
        lead_email: followUp.lead_email,
        lead_name: followUp.lead_name,
        follow_up_type: followUp.follow_up_type,
        email_subject: followUp.email_subject,
        email_body: followUp.email_body,
      });
      toast({ title: 'Success', description: 'Follow-up queued for resending' });
      fetchFollowUps();
    } catch (error) {
      console.error('Error resending follow-up:', error);
      toast({ title: 'Error', description: 'Failed to resend follow-up', variant: 'destructive' });
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      sent: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-600',
      responded: 'bg-blue-100 text-blue-800',
    };
    return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}`}>{status}</span>;
  };

  const now = Date.now();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Follow-Up Management</CardTitle>
          <CardDescription>See who&apos;s on an email drip and stop any one of them</CardDescription>
        </CardHeader>
        <CardContent>
          {/* View tabs + refresh */}
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <div className="inline-flex rounded-lg bg-muted p-1">
              {(['drips', 'all'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${view === v ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
                >
                  {v === 'drips' ? 'Active drips' : 'All emails'}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={fetchFollowUps} className="ml-auto">
              <RefreshCw className="w-4 h-4 mr-1.5" />Refresh
            </Button>
          </div>

          {view === 'drips' ? (
            <>
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 md:gap-4 mb-5">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 md:p-4">
                  <p className="text-2xl font-bold text-yellow-900">{dripStats.people}</p>
                  <p className="text-xs md:text-sm text-yellow-800 font-medium">People on drips</p>
                </div>
                <div className="bg-muted/50 border rounded-lg p-3 md:p-4">
                  <p className="text-2xl font-bold">{dripStats.pending}</p>
                  <p className="text-xs md:text-sm text-muted-foreground font-medium">Emails pending</p>
                </div>
                <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 md:p-4">
                  <p className="text-2xl font-bold text-sky-900">{dripStats.review}</p>
                  <p className="text-xs md:text-sm text-sky-800 font-medium">Review sequences</p>
                </div>
              </div>

              {/* Search */}
              <div className="relative mb-4 max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email…" className="pl-9" />
              </div>

              {filteredDrips.length === 0 ? (
                <div className="border rounded-lg py-12 text-center text-muted-foreground">
                  {drips.length === 0 ? 'Nobody is on an active drip right now.' : 'No matches.'}
                </div>
              ) : (
                <ActiveDripsList drips={filteredDrips} now={now} onStop={handleStopDrip} />
              )}
            </>
          ) : (
            <>
              {/* All-emails filters */}
              <div className="flex gap-2 mb-4 flex-wrap">
                {['all', 'pending', 'sent', 'failed', 'cancelled'].map(filter => (
                  <Button key={filter} variant={activeFilter === filter ? 'default' : 'outline'} size="sm" onClick={() => setActiveFilter(filter)}>
                    {filter.charAt(0).toUpperCase() + filter.slice(1)}
                  </Button>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Lead Name</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Scheduled</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAll.length === 0 ? (
                        <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No follow-ups found</td></tr>
                      ) : filteredAll.map(fu => (
                        <tr key={fu.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="px-4 py-3 font-medium">{fu.lead_name}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{fu.lead_email}</td>
                          <td className="px-4 py-3"><span className="bg-purple-100 text-purple-800 text-xs px-2 py-0.5 rounded-full font-medium">{followUpTypeLabel(fu.follow_up_type)}</span></td>
                          <td className="px-4 py-3">{statusBadge(fu.status)}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(fu.scheduled_at).toLocaleString()}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              {(fu.status === 'pending' || fu.status === 'sent') && (
                                <Button variant="outline" size="sm" onClick={() => handleStopFollowUps(fu.lead_email, fu.follow_up_type)}>Stop follow-ups</Button>
                              )}
                              {fu.status === 'pending' && (<Button variant="outline" size="sm" onClick={() => handleCancel(fu.id)}>Cancel</Button>)}
                              {(fu.status === 'failed' || fu.status === 'sent') && (<Button variant="outline" size="sm" onClick={() => handleResend(fu)}>Resend</Button>)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {filteredAll.length === 0 ? (
                  <div className="border rounded-lg py-10 text-center text-muted-foreground">No follow-ups found</div>
                ) : filteredAll.map(fu => (
                  <div key={fu.id} className="border rounded-lg p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-sm leading-tight truncate">{fu.lead_name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{fu.lead_email}</div>
                      </div>
                      {statusBadge(fu.status)}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1.5">{followUpTypeLabel(fu.follow_up_type)} · {new Date(fu.scheduled_at).toLocaleDateString()}</div>
                    <div className="flex gap-2 mt-2">
                      {(fu.status === 'pending' || fu.status === 'sent') && (
                        <Button variant="outline" size="sm" className="h-8 px-2.5" onClick={() => handleStopFollowUps(fu.lead_email, fu.follow_up_type)}>Stop follow-ups</Button>
                      )}
                      {fu.status === 'pending' && (<Button variant="outline" size="sm" className="h-8 px-2.5" onClick={() => handleCancel(fu.id)}>Cancel</Button>)}
                      {(fu.status === 'failed' || fu.status === 'sent') && (<Button variant="outline" size="sm" className="h-8 px-2.5" onClick={() => handleResend(fu)}>Resend</Button>)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
