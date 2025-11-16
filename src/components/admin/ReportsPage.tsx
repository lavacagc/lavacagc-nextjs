import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Download, TrendingUp, DollarSign, Users, Clock } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';

interface LeadStats {
  project_type: string;
  count: number;
  avg_estimate: number;
}

interface SourceStats {
  lead_source: string;
  count: number;
}

export function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('current_month');
  const [totalLeads, setTotalLeads] = useState(0);
  const [leadsByType, setLeadsByType] = useState<LeadStats[]>([]);
  const [leadsBySource, setLeadsBySource] = useState<SourceStats[]>([]);
  const [avgMaterialsPercent, setAvgMaterialsPercent] = useState(0);
  const [avgLaborPercent, setAvgLaborPercent] = useState(0);
  const [totalEstimateValue, setTotalEstimateValue] = useState(0);

  useEffect(() => {
    loadReports();
  }, [dateRange]);

  const getDateRangeFilter = () => {
    const now = new Date();
    switch (dateRange) {
      case 'current_month':
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'last_month':
        const lastMonth = subMonths(now, 1);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
      case 'last_3_months':
        return { start: subMonths(now, 3), end: now };
      case 'last_6_months':
        return { start: subMonths(now, 6), end: now };
      case 'year_to_date':
        return { start: new Date(now.getFullYear(), 0, 1), end: now };
      default:
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  };

  const loadReports = async () => {
    try {
      setLoading(true);
      const { start, end } = getDateRangeFilter();

      // Load all estimate leads in date range
      const { data: leads, error } = await supabase
        .from('estimate_leads')
        .select('*')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString());

      if (error) throw error;

      // Calculate stats
      setTotalLeads(leads?.length || 0);

      // Group by project type
      const typeStats: { [key: string]: { count: number; totalEstimate: number } } = {};
      let totalMaterials = 0;
      let totalLabor = 0;
      let estimateSum = 0;
      let countWithEstimates = 0;

      leads?.forEach(lead => {
        if (!typeStats[lead.project_type_name]) {
          typeStats[lead.project_type_name] = { count: 0, totalEstimate: 0 };
        }
        typeStats[lead.project_type_name].count++;
        
        if (lead.combined_total) {
          typeStats[lead.project_type_name].totalEstimate += lead.combined_total;
          estimateSum += lead.combined_total;
          countWithEstimates++;
          
          if (lead.total_material_cost && lead.total_labor_cost) {
            totalMaterials += lead.total_material_cost;
            totalLabor += lead.total_labor_cost;
          }
        }
      });

      const typeArray = Object.entries(typeStats).map(([type, stats]) => ({
        project_type: type,
        count: stats.count,
        avg_estimate: stats.count > 0 ? stats.totalEstimate / stats.count : 0
      }));

      setLeadsByType(typeArray);
      setTotalEstimateValue(estimateSum);

      // Calculate materials vs labor ratio
      const total = totalMaterials + totalLabor;
      if (total > 0) {
        setAvgMaterialsPercent(Math.round((totalMaterials / total) * 100));
        setAvgLaborPercent(Math.round((totalLabor / total) * 100));
      }

      // Group by lead source
      const sourceStats: { [key: string]: number } = {};
      leads?.forEach(lead => {
        const source = lead.lead_source || 'Unknown';
        sourceStats[source] = (sourceStats[source] || 0) + 1;
      });

      const sourceArray = Object.entries(sourceStats).map(([source, count]) => ({
        lead_source: source,
        count
      }));

      setLeadsBySource(sourceArray);
    } catch (error) {
      console.error('Error loading reports:', error);
      toast({
        title: "Error",
        description: "Failed to load reports",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = async (type: 'all' | 'range') => {
    try {
      let query = supabase.from('estimate_leads').select('*');
      
      if (type === 'range') {
        const { start, end } = getDateRangeFilter();
        query = query
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;

      const headers = [
        'Lead ID', 'Name', 'Email', 'Phone', 'Address', 'Project Type', 
        'Sq Ft', 'Materials Cost', 'Labor Cost', 'Combined Total', 
        'Estimate Range', 'Status', 'Timeline', 'Lead Source', 'Created'
      ];

      const rows = data?.map(lead => [
        lead.id,
        `${lead.first_name} ${lead.last_name}`,
        lead.email,
        lead.phone,
        `${lead.street_address}, ${lead.city}, ${lead.state} ${lead.zip_code}`,
        lead.project_type_name,
        lead.square_footage || 'N/A',
        lead.total_material_cost || 'N/A',
        lead.total_labor_cost || 'N/A',
        lead.combined_total || 'N/A',
        lead.estimate_range_min && lead.estimate_range_max 
          ? `$${lead.estimate_range_min} - $${lead.estimate_range_max}`
          : 'N/A',
        lead.lead_status,
        lead.project_timeline || 'N/A',
        lead.lead_source || 'N/A',
        format(new Date(lead.created_at), 'yyyy-MM-dd HH:mm')
      ]) || [];

      const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `estimate-leads-${type}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      a.click();

      toast({
        title: "Success",
        description: "CSV exported successfully"
      });
    } catch (error) {
      console.error('Error exporting CSV:', error);
      toast({
        title: "Error",
        description: "Failed to export CSV",
        variant: "destructive"
      });
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Calculator Reports</CardTitle>
              <CardDescription>
                Analytics and insights for calculator estimate leads
              </CardDescription>
            </div>
            <div className="space-x-2">
              <Button variant="outline" onClick={() => exportCSV('range')}>
                <Download className="w-4 h-4 mr-2" />
                Export Date Range
              </Button>
              <Button variant="outline" onClick={() => exportCSV('all')}>
                <Download className="w-4 h-4 mr-2" />
                Export All Leads
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="w-64">
              <Label>Date Range</Label>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current_month">This Month</SelectItem>
                  <SelectItem value="last_month">Last Month</SelectItem>
                  <SelectItem value="last_3_months">Last 3 Months</SelectItem>
                  <SelectItem value="last_6_months">Last 6 Months</SelectItem>
                  <SelectItem value="year_to_date">Year to Date</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Users className="w-8 h-8 text-primary" />
              <p className="text-3xl font-bold">{totalLeads}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Estimate Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <DollarSign className="w-8 h-8 text-green-500" />
              <p className="text-3xl font-bold">{formatCurrency(totalEstimateValue)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Materials Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-8 h-8 text-blue-500" />
              <p className="text-3xl font-bold">{avgMaterialsPercent}%</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Labor Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="w-8 h-8 text-orange-500" />
              <p className="text-3xl font-bold">{avgLaborPercent}%</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Leads by Project Type */}
      <Card>
        <CardHeader>
          <CardTitle>Leads by Project Type</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {leadsByType.map(stat => (
              <div key={stat.project_type} className="flex items-center justify-between p-4 border rounded">
                <div>
                  <p className="font-medium">{stat.project_type}</p>
                  <p className="text-sm text-muted-foreground">
                    Average Estimate: {formatCurrency(stat.avg_estimate)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">{stat.count}</p>
                  <p className="text-sm text-muted-foreground">leads</p>
                </div>
              </div>
            ))}
            {leadsByType.length === 0 && (
              <p className="text-center text-muted-foreground py-4">No data for selected period</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Leads by Source */}
      <Card>
        <CardHeader>
          <CardTitle>Leads by Source</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {leadsBySource.map(stat => (
              <div key={stat.lead_source} className="flex items-center justify-between p-4 border rounded">
                <p className="font-medium">{stat.lead_source}</p>
                <div className="text-right">
                  <p className="text-2xl font-bold">{stat.count}</p>
                  <p className="text-sm text-muted-foreground">leads</p>
                </div>
              </div>
            ))}
            {leadsBySource.length === 0 && (
              <p className="text-center text-muted-foreground py-4">No data for selected period</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Materials vs Labor Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Materials vs. Labor Cost Ratio</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Materials</span>
                <span className="text-sm font-medium">{avgMaterialsPercent}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-4">
                <div 
                  className="bg-blue-500 h-4 rounded-full transition-all"
                  style={{ width: `${avgMaterialsPercent}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Labor</span>
                <span className="text-sm font-medium">{avgLaborPercent}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-4">
                <div 
                  className="bg-orange-500 h-4 rounded-full transition-all"
                  style={{ width: `${avgLaborPercent}%` }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
