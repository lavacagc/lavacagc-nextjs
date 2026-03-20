'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

interface FollowUpItem {
  id: string;
  lead_email: string;
  lead_name: string;
  follow_up_type: string;
  scheduled_at: string;
  sent_at: string | null;
  status: string;
  email_subject: string;
  email_body: string;
  created_at: string;
}

export default function FollowUpsPage() {
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [filteredFollowUps, setFilteredFollowUps] = useState<FollowUpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [stats, setStats] = useState({
    totalPending: 0,
    sentToday: 0,
    failed: 0,
  });

  const fetchFollowUps = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('follow_up_queue')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const followUpData = data || [];
      setFollowUps(followUpData);

      // Calculate stats
      const pending = followUpData.filter(f => f.status === 'pending').length;
      const today = new Date().toDateString();
      const sentToday = followUpData.filter(
        f => f.sent_at && new Date(f.sent_at).toDateString() === today
      ).length;
      const failed = followUpData.filter(f => f.status === 'failed').length;

      setStats({ totalPending: pending, sentToday, failed });
    } catch (error) {
      console.error('Error fetching follow-ups:', error);
      toast({
        title: 'Error',
        description: 'Failed to load follow-ups',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFollowUps();
  }, [fetchFollowUps]);

  useEffect(() => {
    if (activeFilter === 'all') {
      setFilteredFollowUps(followUps);
    } else {
      setFilteredFollowUps(followUps.filter(f => f.status === activeFilter));
    }
  }, [activeFilter, followUps]);

  const handleMarkResponded = async (followUpId: string, leadEmail: string) => {
    try {
      // Cancel all pending follow-ups for this lead
      const { error } = await supabase
        .from('follow_up_queue')
        .update({ status: 'responded' })
        .eq('lead_email', leadEmail)
        .in('status', ['pending', 'sent']);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Marked as responded and cancelled remaining sequence',
      });
      fetchFollowUps();
    } catch (error) {
      console.error('Error marking responded:', error);
      toast({
        title: 'Error',
        description: 'Failed to update status',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = async (followUpId: string) => {
    try {
      const { error } = await supabase
        .from('follow_up_queue')
        .update({ status: 'cancelled' })
        .eq('id', followUpId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Follow-up cancelled',
      });
      fetchFollowUps();
    } catch (error) {
      console.error('Error cancelling follow-up:', error);
      toast({
        title: 'Error',
        description: 'Failed to cancel follow-up',
        variant: 'destructive',
      });
    }
  };

  const handleResend = async (followUp: FollowUpItem) => {
    try {
      // Create a new follow-up with immediate scheduling
      const { error } = await supabase
        .from('follow_up_queue')
        .insert({
          lead_email: followUp.lead_email,
          lead_name: followUp.lead_name,
          follow_up_type: followUp.follow_up_type,
          scheduled_at: new Date().toISOString(),
          status: 'pending',
          email_subject: followUp.email_subject,
          email_body: followUp.email_body,
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Follow-up queued for resending',
      });
      fetchFollowUps();
    } catch (error) {
      console.error('Error resending follow-up:', error);
      toast({
        title: 'Error',
        description: 'Failed to resend follow-up',
        variant: 'destructive',
      });
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
    return (
      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
        {status}
      </span>
    );
  };

  const getFollowUpTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      instant_ack: 'Instant',
      '24h': '24h',
      '48h': '48h',
      '7d': '7d',
      feedback_day0: 'Feedback Day 0',
      feedback_day3: 'Feedback Day 3',
      feedback_day7: 'Feedback Day 7',
    };
    return labels[type] || type;
  };

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
          <CardDescription>
            Manage all automated follow-up emails
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800 font-medium">Total Pending</p>
              <p className="text-2xl font-bold text-yellow-900">{stats.totalPending}</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-800 font-medium">Sent Today</p>
              <p className="text-2xl font-bold text-green-900">{stats.sentToday}</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-800 font-medium">Failed</p>
              <p className="text-2xl font-bold text-red-900">{stats.failed}</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-2 mb-6 flex-wrap">
            {['all', 'pending', 'sent', 'failed'].map(filter => (
              <Button
                key={filter}
                variant={activeFilter === filter ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveFilter(filter)}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchFollowUps}
              className="ml-auto"
            >
              Refresh
            </Button>
          </div>

          {/* Table */}
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Lead Name</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Scheduled At</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Sent At</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFollowUps.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        No follow-ups found
                      </td>
                    </tr>
                  ) : (
                    filteredFollowUps.map(fu => (
                      <tr key={fu.id} className="border-b hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{fu.lead_name}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{fu.lead_email}</td>
                        <td className="px-4 py-3">
                          <span className="bg-purple-100 text-purple-800 text-xs px-2 py-0.5 rounded-full font-medium">
                            {getFollowUpTypeLabel(fu.follow_up_type)}
                          </span>
                        </td>
                        <td className="px-4 py-3">{statusBadge(fu.status)}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {new Date(fu.scheduled_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {fu.sent_at ? new Date(fu.sent_at).toLocaleString() : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            {(fu.status === 'pending' || fu.status === 'sent') && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleMarkResponded(fu.id, fu.lead_email)}
                              >
                                Mark Responded
                              </Button>
                            )}
                            {fu.status === 'pending' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCancel(fu.id)}
                              >
                                Cancel
                              </Button>
                            )}
                            {(fu.status === 'failed' || fu.status === 'sent') && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleResend(fu)}
                              >
                                Resend
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
