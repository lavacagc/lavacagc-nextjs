import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Archive,
  Trash2,
  Mail,
  Phone,
  MapPin,
  AlertCircle,
  CheckSquare,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  inquiry_type: string;
  project_type?: string;
  message?: string;
  budget_range?: string;
  project_timeline?: string;
  address?: string;
  city?: string;
  zip_code?: string;
  preferred_contact_method?: string;
  created_at: string;
  archived_at?: string;
  visitor_id?: string;
  visit_count?: number;
  first_seen?: string;
  referrer?: string;
  /** 'manual' = saved by the admin from the customer search, not a form lead. */
  source?: string | null;
}

interface LeadCardProps {
  lead: Lead;
  isExpanded: boolean;
  isSelected: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
}

// Module-scope so the component type is stable across renders; declared inside
// LeadsManager it would remount every card on any state change.
function LeadCard({ lead, isExpanded, isSelected, onToggleExpand, onToggleSelect }: LeadCardProps) {
  return (
    <Card
      className={`mb-2 transition-colors ${isSelected ? 'border-primary' : ''}`}
    >
      <CardHeader className="py-3 px-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Checkbox
              checked={isSelected}
              onCheckedChange={onToggleSelect}
              onClick={(e) => e.stopPropagation()}
              className="min-h-6 min-w-6 h-6 w-6"
            />
            <div
              className="flex-1 min-w-0 cursor-pointer"
              onClick={onToggleExpand}
            >
              <CardTitle className="text-base font-medium truncate">
                {lead.first_name} {lead.last_name}
              </CardTitle>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {lead.source === 'manual' && (
                <Badge variant="outline" className="text-xs text-primary border-primary/40">
                  manual entry
                </Badge>
              )}
              {(lead.visit_count ?? 0) > 1 && (
                <Badge className="bg-orange-500 text-white text-xs hover:bg-orange-600">
                  <RotateCcw className="w-3 h-3 mr-1" />
                  {lead.visit_count} visits
                </Badge>
              )}
              <Badge variant="secondary" className="text-xs">{lead.inquiry_type}</Badge>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {format(new Date(lead.created_at), 'MMM dd')}
              </span>
            </div>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 pb-4 px-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {lead.project_type && <Badge variant="outline">{lead.project_type}</Badge>}
            {lead.budget_range && <Badge variant="outline">{lead.budget_range}</Badge>}
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <a href={`mailto:${lead.email}`} className="hover:underline">
                {lead.email}
              </a>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-muted-foreground" />
              <a href={`tel:${lead.phone}`} className="hover:underline">
                {lead.phone}
              </a>
            </div>
            {(lead.address || lead.city || lead.zip_code) && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span>
                  {[lead.address, lead.city, lead.zip_code].filter(Boolean).join(', ')}
                </span>
              </div>
            )}
          </div>

          {lead.message && (
            <div className="pt-2 border-t">
              <p className="text-sm text-muted-foreground">Message:</p>
              <p className="text-sm mt-1">{lead.message}</p>
            </div>
          )}

          {lead.project_timeline && (
            <div className="text-sm">
              <span className="text-muted-foreground">Timeline: </span>
              {lead.project_timeline}
            </div>
          )}

          {lead.preferred_contact_method && (
            <div className="text-sm">
              <span className="text-muted-foreground">Preferred contact: </span>
              {lead.preferred_contact_method}
            </div>
          )}

          {/* Visitor tracking info */}
          {lead.visitor_id && (
            <div className="border-t pt-3 mt-3 space-y-1">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Visitor Info</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span>
                  <span className="text-muted-foreground">Visits: </span>
                  <span className="font-medium">{lead.visit_count ?? 1}</span>
                </span>
                {lead.first_seen && (
                  <span>
                    <span className="text-muted-foreground">First seen: </span>
                    {format(new Date(lead.first_seen), 'MMM dd, yyyy')}
                  </span>
                )}
                {lead.referrer && (
                  <span>
                    <span className="text-muted-foreground">Came from: </span>
                    {(() => {
                      try { return new URL(lead.referrer).hostname; }
                      catch { return lead.referrer; }
                    })()}
                  </span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export function LeadsManager() {
  const [activeLeads, setActiveLeads] = useState<Lead[]>([]);
  const [archivedLeads, setArchivedLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [archivedPage, setArchivedPage] = useState(1);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSecondDeleteConfirm, setShowSecondDeleteConfirm] = useState(false);
  const { toast } = useToast();

  const LEADS_PER_PAGE = 10;

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      // Server API route: the browser session can't SELECT leads under RLS.
      const leadsRes = await fetch('/api/leads/list');
      const allLeads: Lead[] = leadsRes.ok ? await leadsRes.json() : [];

      setActiveLeads(allLeads.filter(l => !l.archived_at));
      setArchivedLeads(allLeads.filter(l => !!l.archived_at));
    } catch (error: unknown) {
      toast({
        title: "Error fetching leads",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const bulkArchive = async () => {
    try {
      const { error } = await supabase
        .from('leads')
        .update({ archived_at: new Date().toISOString() })
        .in('id', Array.from(selectedLeads));

      if (error) throw error;

      toast({
        title: "Leads archived",
        description: `${selectedLeads.size} lead(s) have been archived successfully.`,
      });

      setSelectedLeads(new Set());
      fetchLeads();
    } catch (error: unknown) {
      toast({
        title: "Error archiving leads",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };

  const bulkDelete = async () => {
    try {
      const { error } = await supabase
        .from('leads')
        .delete()
        .in('id', Array.from(selectedLeads));

      if (error) throw error;

      toast({
        title: "Leads deleted",
        description: `${selectedLeads.size} lead(s) have been permanently deleted.`,
      });

      setSelectedLeads(new Set());
      setShowDeleteConfirm(false);
      setShowSecondDeleteConfirm(false);
      fetchLeads();
    } catch (error: unknown) {
      toast({
        title: "Error deleting leads",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };

  const toggleLeadSelection = (id: string) => {
    const newSelected = new Set(selectedLeads);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedLeads(newSelected);
  };

  const toggleSelectAll = (leads: Lead[]) => {
    if (selectedLeads.size === leads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(leads.map(l => l.id)));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Loading leads...</p>
      </div>
    );
  }

  // Pagination logic
  const paginatedActiveLeads = activeLeads.slice(
    (currentPage - 1) * LEADS_PER_PAGE,
    currentPage * LEADS_PER_PAGE
  );
  const paginatedArchivedLeads = archivedLeads.slice(
    (archivedPage - 1) * LEADS_PER_PAGE,
    archivedPage * LEADS_PER_PAGE
  );
  const totalActivePages = Math.ceil(activeLeads.length / LEADS_PER_PAGE);
  const totalArchivedPages = Math.ceil(archivedLeads.length / LEADS_PER_PAGE);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Leads Management</h2>
        <p className="text-muted-foreground mt-1">
          Manage your leads and archive completed inquiries. Leads older than 2 years are automatically deleted.
        </p>
      </div>

      {selectedLeads.size > 0 && (
        <Card className="border-primary">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-primary" />
                <span className="font-medium">{selectedLeads.size} lead(s) selected</span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={bulkArchive}
                >
                  <Archive className="w-4 h-4 mr-2" />
                  Archive Selected
                </Button>
                <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive">
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Selected
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-destructive" />
                        Permanent Delete Warning
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        You are about to permanently delete {selectedLeads.size} lead(s). This action CANNOT be undone.
                        Are you absolutely sure you want to continue?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => {
                        setShowDeleteConfirm(false);
                        setShowSecondDeleteConfirm(true);
                      }}>
                        Yes, Continue
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <AlertDialog open={showSecondDeleteConfirm} onOpenChange={setShowSecondDeleteConfirm}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-destructive flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" />
                        FINAL WARNING - This Cannot Be Undone!
                      </AlertDialogTitle>
                      <AlertDialogDescription className="space-y-2">
                        <p className="font-semibold">This is your LAST chance to cancel!</p>
                        <p>Once you click &quot;Permanently Delete&quot;, these {selectedLeads.size} lead(s) will be:</p>
                        <ul className="list-disc list-inside space-y-1 text-sm">
                          <li>Completely removed from the database</li>
                          <li>Unrecoverable by any means</li>
                          <li>Lost forever</li>
                        </ul>
                        <p className="font-semibold mt-4">Are you 100% certain?</p>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>No, Keep Them</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={bulkDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Yes, Permanently Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="active" className="w-full" onValueChange={() => setSelectedLeads(new Set())}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="active">
            Active Leads ({activeLeads.length})
          </TabsTrigger>
          <TabsTrigger value="archived">
            Archived ({archivedLeads.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-6 space-y-4">
          {activeLeads.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center p-8">
                <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">
                  No active leads found
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4">
                <Checkbox
                  checked={selectedLeads.size === paginatedActiveLeads.length && paginatedActiveLeads.length > 0}
                  onCheckedChange={() => toggleSelectAll(paginatedActiveLeads)}
                  className="min-h-6 min-w-6 h-6 w-6"
                />
                <span className="text-sm text-muted-foreground">Select all on this page</span>
              </div>
              <div className="space-y-2">
                {paginatedActiveLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    isExpanded={expandedLeadId === lead.id}
                    isSelected={selectedLeads.has(lead.id)}
                    onToggleExpand={() => setExpandedLeadId(expandedLeadId === lead.id ? null : lead.id)}
                    onToggleSelect={() => toggleLeadSelection(lead.id)}
                  />
                ))}
              </div>
              {totalActivePages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm">
                    Page {currentPage} of {totalActivePages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalActivePages, p + 1))}
                    disabled={currentPage === totalActivePages}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="archived" className="mt-6 space-y-4">
          {archivedLeads.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center p-8">
                <Archive className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">
                  No archived leads found
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4">
                <Checkbox
                  checked={selectedLeads.size === paginatedArchivedLeads.length && paginatedArchivedLeads.length > 0}
                  onCheckedChange={() => toggleSelectAll(paginatedArchivedLeads)}
                  className="min-h-6 min-w-6 h-6 w-6"
                />
                <span className="text-sm text-muted-foreground">Select all on this page</span>
              </div>
              <div className="space-y-2">
                {paginatedArchivedLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    isExpanded={expandedLeadId === lead.id}
                    isSelected={selectedLeads.has(lead.id)}
                    onToggleExpand={() => setExpandedLeadId(expandedLeadId === lead.id ? null : lead.id)}
                    onToggleSelect={() => toggleLeadSelection(lead.id)}
                  />
                ))}
              </div>
              {totalArchivedPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setArchivedPage(p => Math.max(1, p - 1))}
                    disabled={archivedPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm">
                    Page {archivedPage} of {totalArchivedPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setArchivedPage(p => Math.min(totalArchivedPages, p + 1))}
                    disabled={archivedPage === totalArchivedPages}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
