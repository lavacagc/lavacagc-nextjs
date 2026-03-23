'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, TrendingUp, Users, Mail, Target, RefreshCw } from 'lucide-react';

interface LeadRow {
  id: string;
  created_at: string;
  inquiry_type: string;
  project_type: string | null;
}

interface EstimateLeadRow {
  id: string;
  created_at: string | null;
  lead_source: string | null;
  lead_status: string | null;
}

interface FollowUpRow {
  id: string;
  status: string;
  created_at: string;
  sent_at: string | null;
}

interface DashboardMetrics {
  leadsThisWeek: number;
  leadsThisMonth: number;
  leadsBySource: Record<string, number>;
  leadScoreDistribution: { hot: number; warm: number; cold: number };
  followUpStats: { sent: number; pending: number; failed: number; responded: number };
  totalContactFormLeads: number;
  totalEstimateLeads: number;
}

function BarChart({ data, maxValue }: { data: { label: string; value: number; color: string }[]; maxValue: number }) {
  if (maxValue === 0) maxValue = 1;
  return (
    <div className="space-y-3">
      {data.map((item) => (
        <div key={item.label} className="space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">{item.label}</span>
            <span className="text-sm font-bold">{item.value}</span>
          </div>
          <div className="h-6 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${item.color}`}
              style={{ width: `${Math.max((item.value / maxValue) * 100, 2)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function FunnelStep({ label, value, percentage, color }: { label: string; value: number; percentage: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <div className="flex justify-between mb-1">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-sm text-muted-foreground">{value}</span>
        </div>
        <div className="h-8 bg-gray-100 rounded overflow-hidden relative">
          <div
            className={`h-full rounded transition-all duration-500 ${color} flex items-center justify-end pr-2`}
            style={{ width: `${Math.max(percentage, 3)}%` }}
          >
            {percentage > 15 && (
              <span className="text-xs font-bold text-white">{percentage.toFixed(0)}%</span>
            )}
          </div>
          {percentage <= 15 && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-500">
              {percentage.toFixed(0)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, subtitle, color }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  subtitle?: string;
  color: string;
}) {
  return (
    <div className={`${color} border rounded-lg p-4`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4" />
        <p className="text-sm font-medium">{label}</p>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {subtitle && <p className="text-xs mt-1 opacity-75">{subtitle}</p>}
    </div>
  );
}

export default function ConversionDashboard() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString();

      // Fetch all data in parallel
      const [leadsRes, estimateLeadsRes, followUpsRes] = await Promise.all([
        supabase.from('leads').select('id, created_at, inquiry_type, project_type').order('created_at', { ascending: false }),
        supabase.from('estimate_leads').select('id, created_at, lead_source, lead_status').order('created_at', { ascending: false }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from as any)('follow_up_queue').select('id, status, created_at, sent_at').order('created_at', { ascending: false }),
      ]);

      const leads = (leadsRes.data || []) as LeadRow[];
      const estimateLeads = (estimateLeadsRes.data || []) as EstimateLeadRow[];
      const followUps = (followUpsRes.data || []) as unknown as FollowUpRow[];

      // Combine for time-based metrics
      const allLeadDates = [
        ...leads.map(l => l.created_at),
        ...estimateLeads.map(l => l.created_at).filter(Boolean) as string[],
      ];

      const leadsThisWeek = allLeadDates.filter(d => d >= weekAgo).length;
      const leadsThisMonth = allLeadDates.filter(d => d >= monthAgo).length;

      // Leads by source
      const leadsBySource: Record<string, number> = {};

      // Contact form leads
      leads.forEach(l => {
        const source = l.inquiry_type || 'contact_form';
        leadsBySource[source] = (leadsBySource[source] || 0) + 1;
      });

      // Estimate/calculator leads
      estimateLeads.forEach(l => {
        const source = l.lead_source || 'calculator';
        leadsBySource[source] = (leadsBySource[source] || 0) + 1;
      });

      // Lead score distribution based on estimate_leads.lead_status
      const hot = estimateLeads.filter(l => l.lead_status === 'hot' || l.lead_status === 'converted').length;
      const warm = estimateLeads.filter(l => l.lead_status === 'warm' || l.lead_status === 'contacted' || l.lead_status === 'new').length;
      const cold = estimateLeads.filter(l => l.lead_status === 'cold' || l.lead_status === 'lost' || l.lead_status === 'archived').length;

      // Follow-up stats
      const followUpStats = {
        sent: followUps.filter(f => f.status === 'sent').length,
        pending: followUps.filter(f => f.status === 'pending').length,
        failed: followUps.filter(f => f.status === 'failed').length,
        responded: followUps.filter(f => f.status === 'responded').length,
      };

      setMetrics({
        leadsThisWeek,
        leadsThisMonth,
        leadsBySource,
        leadScoreDistribution: { hot, warm, cold },
        followUpStats,
        totalContactFormLeads: leads.length,
        totalEstimateLeads: estimateLeads.length,
      });
    } catch (err) {
      console.error('Error fetching metrics:', err);
      setError(err instanceof Error ? err.message : 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center">
            <p className="text-red-600 font-medium">Failed to load analytics</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
            <Button onClick={fetchMetrics} className="mt-4" variant="outline">
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!metrics) return null;

  const totalLeads = metrics.totalContactFormLeads + metrics.totalEstimateLeads;
  const totalFollowUps = metrics.followUpStats.sent + metrics.followUpStats.pending + metrics.followUpStats.failed + metrics.followUpStats.responded;

  // Source label mapping
  const sourceLabels: Record<string, string> = {
    contact_form: 'Contact Form',
    calculator: 'Calculator',
    chatbot: 'Chatbot',
    referral: 'Referral',
    general: 'General Inquiry',
    quote: 'Quote Request',
    service: 'Service Inquiry',
    website: 'Website',
    google: 'Google',
    direct: 'Direct',
  };

  const sourceData = Object.entries(metrics.leadsBySource)
    .sort(([, a], [, b]) => b - a)
    .map(([source, count], idx) => ({
      label: sourceLabels[source] || source.charAt(0).toUpperCase() + source.slice(1).replace(/_/g, ' '),
      value: count,
      color: ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500', 'bg-cyan-500', 'bg-indigo-500'][idx % 7],
    }));

  const maxSourceValue = Math.max(...sourceData.map(s => s.value), 1);

  // Funnel values
  const funnelSteps = [
    { label: 'Total Leads', value: totalLeads, color: 'bg-blue-500' },
    { label: 'Follow-Ups Sent', value: metrics.followUpStats.sent, color: 'bg-indigo-500' },
    { label: 'Responses', value: metrics.followUpStats.responded, color: 'bg-green-500' },
  ];
  const maxFunnel = Math.max(...funnelSteps.map(s => s.value), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Conversion Dashboard
          </h2>
          <p className="text-sm text-muted-foreground">Lead generation and follow-up analytics</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchMetrics} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Leads This Week"
          value={metrics.leadsThisWeek}
          color="bg-blue-50 border-blue-200 text-blue-900"
        />
        <StatCard
          icon={Users}
          label="Leads This Month"
          value={metrics.leadsThisMonth}
          color="bg-green-50 border-green-200 text-green-900"
        />
        <StatCard
          icon={Target}
          label="Total All Time"
          value={totalLeads}
          subtitle={`${metrics.totalContactFormLeads} form + ${metrics.totalEstimateLeads} calculator`}
          color="bg-purple-50 border-purple-200 text-purple-900"
        />
        <StatCard
          icon={Mail}
          label="Follow-Ups Sent"
          value={metrics.followUpStats.sent}
          subtitle={`${metrics.followUpStats.pending} pending`}
          color="bg-orange-50 border-orange-200 text-orange-900"
        />
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Leads by Source */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Leads by Source</CardTitle>
            <CardDescription>Where your leads are coming from</CardDescription>
          </CardHeader>
          <CardContent>
            {sourceData.length > 0 ? (
              <BarChart data={sourceData} maxValue={maxSourceValue} />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No lead data yet</p>
            )}
          </CardContent>
        </Card>

        {/* Lead Score Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Lead Temperature</CardTitle>
            <CardDescription>Distribution of estimate leads by status</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart
              data={[
                { label: '🔥 Hot (Converted/Hot)', value: metrics.leadScoreDistribution.hot, color: 'bg-red-500' },
                { label: '🌡️ Warm (New/Contacted)', value: metrics.leadScoreDistribution.warm, color: 'bg-yellow-500' },
                { label: '❄️ Cold (Lost/Archived)', value: metrics.leadScoreDistribution.cold, color: 'bg-blue-400' },
              ]}
              maxValue={Math.max(
                metrics.leadScoreDistribution.hot,
                metrics.leadScoreDistribution.warm,
                metrics.leadScoreDistribution.cold,
                1
              )}
            />

            {/* Summary */}
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">
                  Total estimate leads: <span className="font-bold text-foreground">{metrics.totalEstimateLeads}</span>
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Follow-up Email Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Follow-Up Email Stats</CardTitle>
          <CardDescription>Status of automated follow-up emails</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{metrics.followUpStats.sent}</p>
              <p className="text-xs text-green-600 font-medium">Sent</p>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-yellow-700">{metrics.followUpStats.pending}</p>
              <p className="text-xs text-yellow-600 font-medium">Pending</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-red-700">{metrics.followUpStats.failed}</p>
              <p className="text-xs text-red-600 font-medium">Failed</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-blue-700">{metrics.followUpStats.responded}</p>
              <p className="text-xs text-blue-600 font-medium">Responded</p>
            </div>
          </div>

          {/* Email delivery rate */}
          {totalFollowUps > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Delivery Success Rate</span>
                <span className="font-bold">
                  {((metrics.followUpStats.sent / Math.max(metrics.followUpStats.sent + metrics.followUpStats.failed, 1)) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-green-500 transition-all"
                  style={{ width: `${(metrics.followUpStats.sent / totalFollowUps) * 100}%` }}
                />
                <div
                  className="h-full bg-yellow-500 transition-all"
                  style={{ width: `${(metrics.followUpStats.pending / totalFollowUps) * 100}%` }}
                />
                <div
                  className="h-full bg-red-500 transition-all"
                  style={{ width: `${(metrics.followUpStats.failed / totalFollowUps) * 100}%` }}
                />
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${(metrics.followUpStats.responded / totalFollowUps) * 100}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Conversion Funnel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Conversion Funnel</CardTitle>
          <CardDescription>From leads to responses</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {funnelSteps.map((step) => (
            <FunnelStep
              key={step.label}
              label={step.label}
              value={step.value}
              percentage={(step.value / maxFunnel) * 100}
              color={step.color}
            />
          ))}

          {/* Conversion rates */}
          <div className="pt-4 border-t space-y-1">
            <p className="text-sm text-muted-foreground">
              Lead → Follow-Up Rate:{' '}
              <span className="font-bold text-foreground">
                {totalLeads > 0 ? ((metrics.followUpStats.sent / totalLeads) * 100).toFixed(1) : 0}%
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              Follow-Up → Response Rate:{' '}
              <span className="font-bold text-foreground">
                {metrics.followUpStats.sent > 0
                  ? ((metrics.followUpStats.responded / metrics.followUpStats.sent) * 100).toFixed(1)
                  : 0}%
              </span>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
