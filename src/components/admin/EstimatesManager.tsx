import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cancelPendingFollowUps } from '@/lib/notify/cancelFollowUps';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Download, Eye, MapPin, Phone, Mail, Calendar, DollarSign, FileText, Image as ImageIcon, Archive, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import Image from 'next/image';

interface EstimateLead {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
  project_type_name: string;
  project_type_id: string;
  square_footage: number | null;
  space_length: number | null;
  space_width: number | null;
  space_height: number | null;
  total_material_cost: number | null;
  total_labor_cost: number | null;
  combined_total: number | null;
  estimate_range_min: number | null;
  estimate_range_max: number | null;
  project_timeline: string | null;
  project_description: string | null;
  requires_manual_estimate: boolean;
  assessment_requested: boolean;
  consultation_requested: boolean;
  uploaded_images: Array<{ url: string; label?: string; filename?: string }> | null;
  uploaded_plans: Array<{ url: string; label?: string; filename?: string }> | null;
  lead_status: string;
  admin_notes: string | null;
  created_at: string;
  visitor_id?: string;
  visit_count?: number;
  first_seen?: string;
  referrer?: string;
}

interface LeadSelection {
  option_category_name: string;
  option_item_name: string;
  material_cost: number;
  labor_cost: number;
  total_cost: number;
}

export function EstimatesManager() {
  const [leads, setLeads] = useState<EstimateLead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<EstimateLead[]>([]);
  const [selectedLead, setSelectedLead] = useState<EstimateLead | null>(null);
  const [leadSelections, setLeadSelections] = useState<LeadSelection[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProjectType, setFilterProjectType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterTimeline, setFilterTimeline] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [selectedImage, setSelectedImage] = useState('');
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [leadToArchive, setLeadToArchive] = useState<EstimateLead | null>(null);
  const [leadToDelete, setLeadToDelete] = useState<EstimateLead | null>(null);

  useEffect(() => {
    loadLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadLeads uses showArchived from closure, only re-run when showArchived changes
  }, [showArchived]);

  useEffect(() => {
    applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applyFilters reads from state already in deps array
  }, [leads, searchTerm, filterProjectType, filterStatus, filterTimeline, showArchived]);

  const loadLeads = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('estimate_leads')
        .select('*')
        .order('created_at', { ascending: false });

      // Filter archived/active leads
      if (showArchived) {
        query = query.not('archived_at', 'is', null);
      } else {
        query = query.is('archived_at', null);
      }

      const { data, error } = await query;

      if (error) throw error;
      setLeads((data || []) as unknown as EstimateLead[]);
    } catch (error) {
      console.error('Error loading leads:', error);
      toast({
        title: "Error",
        description: "Failed to load estimate leads",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...leads];

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(lead => 
        lead.first_name?.toLowerCase().includes(term) ||
        lead.last_name?.toLowerCase().includes(term) ||
        lead.email?.toLowerCase().includes(term) ||
        lead.phone?.includes(term) ||
        lead.city?.toLowerCase().includes(term)
      );
    }

    // Project type filter
    if (filterProjectType !== 'all') {
      filtered = filtered.filter(lead => lead.project_type_name === filterProjectType);
    }

    // Status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(lead => lead.lead_status === filterStatus);
    }

    // Timeline filter
    if (filterTimeline !== 'all') {
      filtered = filtered.filter(lead => lead.project_timeline === filterTimeline);
    }

    setFilteredLeads(filtered);
  };

  const loadLeadDetails = async (lead: EstimateLead) => {
    setSelectedLead(lead);
    
    // Load selections if not a home addition
    if (!lead.requires_manual_estimate) {
      try {
        const { data, error } = await supabase
          .from('calculator_lead_selections')
          .select('*')
          .eq('estimate_lead_id', lead.id);

        if (error) throw error;
        setLeadSelections(data || []);
      } catch (error) {
        console.error('Error loading selections:', error);
      }
    }
    
    setShowDetailDialog(true);
  };

  const updateLeadStatus = async (status: string) => {
    if (!selectedLead) return;

    try {
      const { error } = await supabase
        .from('estimate_leads')
        .update({ lead_status: status })
        .eq('id', selectedLead.id);

      if (error) throw error;

      loadLeads();
      setSelectedLead({ ...selectedLead, lead_status: status });

      // Estimate accepted → stop the lead follow-up cycle so we don't keep
      // nudging a customer who already said yes. Failure to stop the drip must
      // not fail the status change itself, so surface it separately.
      if (status === 'converted' && selectedLead.email) {
        try {
          const stopped = await cancelPendingFollowUps(supabase, selectedLead.email);
          toast({
            title: "Success",
            description: stopped > 0
              ? `Lead marked Converted · stopped ${stopped} pending follow-up${stopped === 1 ? '' : 's'}`
              : "Lead marked Converted",
          });
        } catch (dripError) {
          console.error('Failed to stop follow-ups on convert:', dripError);
          toast({
            title: "Status updated",
            description: "Marked Converted, but couldn't stop the follow-up emails automatically. Use the Follow-ups admin to stop them.",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Success",
          description: "Lead status updated",
        });
      }
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive"
      });
    }
  };

  const updateAdminNotes = async (notes: string) => {
    if (!selectedLead) return;

    try {
      const { error } = await supabase
        .from('estimate_leads')
        .update({ admin_notes: notes })
        .eq('id', selectedLead.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Notes saved"
      });

      loadLeads();
    } catch (error) {
      console.error('Error updating notes:', error);
      toast({
        title: "Error",
        description: "Failed to save notes",
        variant: "destructive"
      });
    }
  };

  const handleArchiveLead = async () => {
    if (!leadToArchive) return;

    try {
      const { error } = await supabase
        .from('estimate_leads')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', leadToArchive.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Lead archived successfully"
      });

      setShowArchiveDialog(false);
      setLeadToArchive(null);
      setShowDetailDialog(false);
      loadLeads();
    } catch (error) {
      console.error('Error archiving lead:', error);
      toast({
        title: "Error",
        description: "Failed to archive lead",
        variant: "destructive"
      });
    }
  };

  const handleDeleteLead = async () => {
    if (!leadToDelete) return;

    try {
      // Delete lead selections first
      await supabase
        .from('calculator_lead_selections')
        .delete()
        .eq('estimate_lead_id', leadToDelete.id);

      // Delete material estimates
      await supabase
        .from('material_estimates')
        .delete()
        .eq('lead_id', leadToDelete.id);

      // Delete the lead
      const { error } = await supabase
        .from('estimate_leads')
        .delete()
        .eq('id', leadToDelete.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Lead deleted permanently"
      });

      setShowDeleteDialog(false);
      setLeadToDelete(null);
      setShowDetailDialog(false);
      loadLeads();
    } catch (error) {
      console.error('Error deleting lead:', error);
      toast({
        title: "Error",
        description: "Failed to delete lead",
        variant: "destructive"
      });
    }
  };

  const exportToCSV = () => {
    const headers = ['ID', 'Name', 'Email', 'Phone', 'Address', 'Project Type', 'Estimate', 'Status', 'Timeline', 'Created'];
    const rows = filteredLeads.map(lead => [
      lead.id,
      `${lead.first_name} ${lead.last_name}`,
      lead.email,
      lead.phone,
      `${lead.street_address}, ${lead.city}, ${lead.state} ${lead.zip_code}`,
      lead.project_type_name,
      lead.combined_total ? `$${lead.combined_total.toLocaleString()}` : 'Manual Required',
      lead.lead_status,
      lead.project_timeline || 'N/A',
      format(new Date(lead.created_at), 'yyyy-MM-dd')
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estimate-leads-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'new': 'bg-blue-500',
      'contacted': 'bg-yellow-500',
      'assessment_scheduled': 'bg-orange-500',
      'quoted': 'bg-purple-500',
      'converted': 'bg-green-500',
      'lost': 'bg-gray-500'
    };
    return colors[status] || 'bg-gray-500';
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return 'N/A';
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle>Calculator Estimates</CardTitle>
          <CardDescription>
            Manage estimate requests from the project calculators
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search by name, email, phone, city..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterProjectType} onValueChange={setFilterProjectType}>
              <SelectTrigger>
                <SelectValue placeholder="Project Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                <SelectItem value="Bathroom Remodeling">Bathroom</SelectItem>
                <SelectItem value="Kitchen Remodeling">Kitchen</SelectItem>
                <SelectItem value="Living Space Remodeling">Living Space</SelectItem>
                <SelectItem value="Home Addition">Home Addition</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="assessment_scheduled">Assessment Scheduled</SelectItem>
                <SelectItem value="quoted">Quoted</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterTimeline} onValueChange={setFilterTimeline}>
              <SelectTrigger>
                <SelectValue placeholder="Timeline" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Timelines</SelectItem>
                <SelectItem value="ASAP">ASAP</SelectItem>
                <SelectItem value="1-3 months">1-3 months</SelectItem>
                <SelectItem value="3-6 months">3-6 months</SelectItem>
                <SelectItem value="6+ months">6+ months</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <p className="text-sm text-muted-foreground">
                Showing {filteredLeads.length} of {leads.length} leads
              </p>
              <Button 
                variant={showArchived ? "default" : "outline"} 
                size="sm"
                onClick={() => setShowArchived(!showArchived)}
              >
                <Archive className="w-4 h-4 mr-2" />
                {showArchived ? "Show Active" : "Show Archived"}
              </Button>
            </div>
            <Button variant="outline" onClick={exportToCSV}>
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Leads Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Project Type</TableHead>
                  <TableHead>Estimate</TableHead>
                  <TableHead>Timeline</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeads.map((lead) => (
                  <TableRow key={lead.id} className="hover:bg-muted/50">
                    <TableCell>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{lead.first_name} {lead.last_name}</p>
                          {(lead.visit_count ?? 0) > 1 && (
                            <Badge className="bg-orange-500 text-white text-xs hover:bg-orange-600">
                              ↩ {lead.visit_count} visits
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{lead.city}, {lead.state}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{lead.project_type_name}</Badge>
                    </TableCell>
                    <TableCell>
                      {lead.requires_manual_estimate ? (
                        <Badge variant="destructive">Manual Est. Required</Badge>
                      ) : lead.estimate_range_min && lead.estimate_range_max ? (
                        <div className="text-sm">
                          {formatCurrency(lead.estimate_range_min)} - {formatCurrency(lead.estimate_range_max)}
                        </div>
                      ) : (
                        'N/A'
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{lead.project_timeline || 'Not specified'}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(lead.lead_status)}>
                        {lead.lead_status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(lead.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => loadLeadDetails(lead)}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                        {!showArchived && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setLeadToArchive(lead);
                              setShowArchiveDialog(true);
                            }}
                          >
                            <Archive className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setLeadToDelete(lead);
                            setShowDeleteDialog(true);
                          }}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredLeads.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No leads found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Lead Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lead Details</DialogTitle>
          </DialogHeader>

          {selectedLead && (
            <div className="space-y-6">
              {/* Contact Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Contact Information</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Name</p>
                    <p className="text-base">{selectedLead.first_name} {selectedLead.last_name}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Email</p>
                    <a href={`mailto:${selectedLead.email}`} className="text-base text-primary hover:underline flex items-center gap-1">
                      <Mail className="w-4 h-4" />
                      {selectedLead.email}
                    </a>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Phone</p>
                    <a href={`tel:${selectedLead.phone}`} className="text-base text-primary hover:underline flex items-center gap-1">
                      <Phone className="w-4 h-4" />
                      {selectedLead.phone}
                    </a>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Address</p>
                    <a 
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${selectedLead.street_address}, ${selectedLead.city}, ${selectedLead.state} ${selectedLead.zip_code}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-base text-primary hover:underline flex items-center gap-1"
                    >
                      <MapPin className="w-4 h-4" />
                      {selectedLead.street_address}, {selectedLead.city}, {selectedLead.state} {selectedLead.zip_code}
                    </a>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Timeline</p>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      <Badge variant="secondary">{selectedLead.project_timeline || 'Not specified'}</Badge>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Created</p>
                    <p className="text-base">{format(new Date(selectedLead.created_at), 'MMM d, yyyy h:mm a')}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Project Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Project Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Project Type</p>
                    <Badge>{selectedLead.project_type_name}</Badge>
                  </div>

                  {!selectedLead.requires_manual_estimate && (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Square Footage</p>
                          <p className="text-base font-semibold">{selectedLead.square_footage} sq ft</p>
                        </div>
                        {selectedLead.space_length && (
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Length</p>
                            <p className="text-base">{selectedLead.space_length} ft</p>
                          </div>
                        )}
                        {selectedLead.space_width && (
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Width</p>
                            <p className="text-base">{selectedLead.space_width} ft</p>
                          </div>
                        )}
                        {selectedLead.space_height && (
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Height</p>
                            <p className="text-base">{selectedLead.space_height} ft</p>
                          </div>
                        )}
                      </div>

                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-2">Assessment</p>
                        <Badge variant={selectedLead.assessment_requested ? "default" : "secondary"}>
                          {selectedLead.assessment_requested ? "Assessment Requested" : "No Assessment"}
                        </Badge>
                      </div>
                    </>
                  )}

                  {selectedLead.project_description && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Description</p>
                      <p className="text-base whitespace-pre-wrap">{selectedLead.project_description}</p>
                    </div>
                  )}

                  {selectedLead.requires_manual_estimate && (
                    <Badge variant="destructive" className="text-base">
                      ⚠ MANUAL ESTIMATE REQUIRED
                    </Badge>
                  )}
                </CardContent>
              </Card>

              {/* Cost Breakdown (for renovation projects) */}
              {!selectedLead.requires_manual_estimate && selectedLead.combined_total && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <DollarSign className="w-5 h-5" />
                      Cost Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableBody>
                        <TableRow>
                          <TableCell className="font-medium">Total Materials Cost</TableCell>
                          <TableCell className="text-right">{formatCurrency(selectedLead.total_material_cost)}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Total Labor Cost</TableCell>
                          <TableCell className="text-right">{formatCurrency(selectedLead.total_labor_cost)}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Combined Total</TableCell>
                          <TableCell className="text-right font-bold">{formatCurrency(selectedLead.combined_total)}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Customer Saw Range</TableCell>
                          <TableCell className="text-right font-bold text-primary">
                            {formatCurrency(selectedLead.estimate_range_min)} - {formatCurrency(selectedLead.estimate_range_max)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>

                    {leadSelections.length > 0 && (
                      <div className="mt-6">
                        <h4 className="font-medium mb-3">Selected Options</h4>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Option</TableHead>
                              <TableHead className="text-right">Materials</TableHead>
                              <TableHead className="text-right">Labor</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {leadSelections.map((selection, idx) => (
                              <TableRow key={idx}>
                                <TableCell>
                                  <div>
                                    <p className="font-medium">{selection.option_item_name}</p>
                                    <p className="text-sm text-muted-foreground">{selection.option_category_name}</p>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">{formatCurrency(selection.material_cost)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(selection.labor_cost)}</TableCell>
                                <TableCell className="text-right font-medium">{formatCurrency(selection.total_cost)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Uploaded Files */}
              {(selectedLead.uploaded_images?.length > 0 || selectedLead.uploaded_plans?.length > 0) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      Uploaded Files
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {selectedLead.uploaded_images?.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2 flex items-center gap-2">
                          <ImageIcon className="w-4 h-4" />
                          Images ({selectedLead.uploaded_images.length})
                        </h4>
                        <div className="grid grid-cols-3 gap-2">
                          {selectedLead.uploaded_images.map((img, idx: number) => (
                            <Image
                              key={idx}
                              src={img.url}
                              alt={`Upload ${idx + 1}`}
                              width={200}
                              height={96}
                              className="w-full h-24 object-cover rounded cursor-pointer hover:opacity-75 transition-opacity"
                              onClick={() => {
                                setSelectedImage(img.url);
                                setShowImageDialog(true);
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedLead.uploaded_plans?.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2 flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          PDFs ({selectedLead.uploaded_plans.length})
                        </h4>
                        <div className="space-y-2">
                          {selectedLead.uploaded_plans.map((pdf, idx: number) => (
                            <div key={idx} className="flex items-center justify-between p-3 border rounded">
                              <div>
                                <p className="font-medium">{pdf.label || `Document ${idx + 1}`}</p>
                                <p className="text-sm text-muted-foreground">{pdf.filename}</p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(pdf.url, '_blank')}
                              >
                                <Download className="w-4 h-4 mr-1" />
                                View
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Status & Notes */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Status & Notes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-2 block">Status</label>
                    <Select value={selectedLead.lead_status} onValueChange={updateLeadStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="contacted">Contacted</SelectItem>
                        <SelectItem value="assessment_scheduled">Assessment Scheduled</SelectItem>
                        <SelectItem value="quoted">Quoted</SelectItem>
                        <SelectItem value="converted">Converted</SelectItem>
                        <SelectItem value="lost">Lost</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-2 block">Admin Notes</label>
                    <Textarea
                      placeholder="Add internal notes about this lead..."
                      defaultValue={selectedLead.admin_notes || ''}
                      onBlur={(e) => updateAdminNotes(e.target.value)}
                      rows={4}
                    />
                  </div>

                  <div className="flex gap-2 pt-4 border-t">
                    {!showArchived && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setLeadToArchive(selectedLead);
                          setShowArchiveDialog(true);
                        }}
                        className="flex-1"
                      >
                        <Archive className="w-4 h-4 mr-2" />
                        Archive Lead
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      onClick={() => {
                        setLeadToDelete(selectedLead);
                        setShowDeleteDialog(true);
                      }}
                      className="flex-1"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Permanently
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Image Viewer Dialog */}
      <Dialog open={showImageDialog} onOpenChange={setShowImageDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Image Preview</DialogTitle>
          </DialogHeader>
          <Image src={selectedImage} alt="Estimate attachment preview" width={800} height={600} className="w-full h-auto" />
        </DialogContent>
      </Dialog>

      {/* Archive Confirmation Dialog */}
      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this lead?</AlertDialogTitle>
            <AlertDialogDescription>
              This lead will be moved to the archived section. You can view archived leads by clicking &quot;Show Archived&quot;.
              {leadToArchive && (
                <div className="mt-2 font-medium">
                  {leadToArchive.first_name} {leadToArchive.last_name} - {leadToArchive.email}
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchiveLead}>
              Archive Lead
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this lead permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the lead and all associated data.
              {leadToDelete && (
                <div className="mt-2 font-medium text-destructive">
                  {leadToDelete.first_name} {leadToDelete.last_name} - {leadToDelete.email}
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteLead}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
