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
  MessageSquare,
  User,
  ChevronDown,
  ChevronUp,
  Plus,
  Clock,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface LeadData {
  email?: string;
  phone?: string;
  projectType?: string;
  location?: string;
  name?: string;
  timeline?: string;
}

interface ChatConversation {
  id: string;
  visitor_id: string;
  messages: ChatMessage[];
  lead_captured: boolean;
  lead_data: LeadData | null;
  ip_address: string | null;
  page_url: string | null;
  created_at: string;
  updated_at: string;
}

export function LeadsManager() {
  const [activeLeads, setActiveLeads] = useState<Lead[]>([]);
  const [archivedLeads, setArchivedLeads] = useState<Lead[]>([]);
  const [chatConversations, setChatConversations] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [expandedChatId, setExpandedChatId] = useState<string | null>(null);
  const [viewingConversation, setViewingConversation] = useState<ChatConversation | null>(null);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [archivedPage, setArchivedPage] = useState(1);
  const [chatPage, setChatPage] = useState(1);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSecondDeleteConfirm, setShowSecondDeleteConfirm] = useState(false);
  const [creatingLeadFromChat, setCreatingLeadFromChat] = useState(false);
  const { toast } = useToast();
  
  const LEADS_PER_PAGE = 10;

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch leads via server API route (bypasses RLS)
      const leadsRes = await fetch('/api/leads/list');
      const allLeads: Lead[] = leadsRes.ok ? await leadsRes.json() : [];
      
      setActiveLeads(allLeads.filter(l => !l.archived_at));
      setArchivedLeads(allLeads.filter(l => !!l.archived_at));

      // Fetch chat conversations via server API route (bypasses RLS)
      const chatsRes = await fetch('/api/leads/conversations');
      const chats: ChatConversation[] = chatsRes.ok ? await chatsRes.json() : [];
      setChatConversations(chats);
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

  const deleteConversation = async (conversationId: string) => {
    try {
      const res = await fetch(`/api/leads/conversations?id=${encodeURIComponent(conversationId)}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete conversation');
      }

      setChatConversations(prev => prev.filter(c => c.id !== conversationId));
      toast({
        title: "Conversation deleted",
        description: "Chat conversation has been permanently deleted.",
      });
    } catch (error: unknown) {
      toast({
        title: "Error deleting conversation",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };

  const createLeadFromConversation = async (conversation: ChatConversation) => {
    setCreatingLeadFromChat(true);
    try {
      const leadData = conversation.lead_data;
      const allUserText = (conversation.messages || [])
        .filter((m: ChatMessage) => m.role === 'user')
        .map((m: ChatMessage) => m.content)
        .join(' ');

      // Parse name from conversation
      const nameMatch = allUserText.match(/(?:my name is|i'm|i am|this is|name:?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
      const firstName = nameMatch ? nameMatch[1].split(' ')[0] : (leadData?.name?.split(' ')[0] || 'Chat');
      const lastName = nameMatch && nameMatch[1].split(' ').length > 1
        ? nameMatch[1].split(' ').slice(1).join(' ')
        : (leadData?.name?.split(' ').slice(1).join(' ') || 'Visitor');

      const { error } = await supabase
        .from('leads')
        .insert({
          first_name: firstName,
          last_name: lastName,
          email: leadData?.email || 'chatbot@lavacagc.com',
          phone: leadData?.phone || '0000000000',
          inquiry_type: leadData?.projectType || 'General Inquiry',
          project_type: leadData?.projectType || null,
          city: leadData?.location || null,
          message: `[Created from chat conversation] ${allUserText.substring(0, 500)}`,
        });

      if (error) throw error;

      toast({
        title: "Lead created",
        description: `Lead created from chat conversation ${conversation.visitor_id}`,
      });

      fetchLeads();
    } catch (error: unknown) {
      toast({
        title: "Error creating lead",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setCreatingLeadFromChat(false);
    }
  };

  /* archiveLead, restoreLead, deleteLead removed — using bulk operations instead */

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

  /* cleanOldLeads removed — not currently used */

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const LeadCard = ({ lead, isArchived: _isArchived }: { lead: Lead; isArchived: boolean }) => {
    const isExpanded = expandedLeadId === lead.id;
    const isSelected = selectedLeads.has(lead.id);
    
    return (
      <Card 
        className={`mb-2 transition-colors ${isSelected ? 'border-primary' : ''}`}
      >
        <CardHeader className="py-3 px-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => toggleLeadSelection(lead.id)}
                onClick={(e) => e.stopPropagation()}
                className="min-h-6 min-w-6 h-6 w-6"
              />
              <div 
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => setExpandedLeadId(isExpanded ? null : lead.id)}
              >
                <CardTitle className="text-base font-medium truncate">
                  {lead.first_name} {lead.last_name}
                </CardTitle>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
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
          </CardContent>
        )}
      </Card>
    );
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
                      <AlertDialogTitle>⚠️ Permanent Delete Warning</AlertDialogTitle>
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
                      <AlertDialogTitle className="text-destructive">🚨 FINAL WARNING - This Cannot Be Undone!</AlertDialogTitle>
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
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="active">
            Active Leads ({activeLeads.length})
          </TabsTrigger>
          <TabsTrigger value="conversations">
            <MessageSquare className="w-4 h-4 mr-1" />
            Chats ({chatConversations.length})
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
                  <LeadCard key={lead.id} lead={lead} isArchived={false} />
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

        <TabsContent value="conversations" className="mt-6 space-y-4">
          {chatConversations.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center p-8">
                <MessageSquare className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">
                  No chat conversations yet
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="space-y-2">
                {chatConversations
                  .slice((chatPage - 1) * LEADS_PER_PAGE, chatPage * LEADS_PER_PAGE)
                  .map((convo) => {
                    const isExpanded = expandedChatId === convo.id;
                    const messageCount = (convo.messages || []).length;
                    const leadData = convo.lead_data;
                    return (
                      <Card key={convo.id} className="mb-2">
                        <CardHeader className="py-3 px-4">
                          <div className="flex justify-between items-center">
                            <div
                              className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                              onClick={() => setExpandedChatId(isExpanded ? null : convo.id)}
                            >
                              <User className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <CardTitle className="text-base font-medium truncate">
                                  {convo.visitor_id.substring(0, 12)}...
                                </CardTitle>
                                <p className="text-xs text-muted-foreground">
                                  {messageCount} message{messageCount !== 1 ? 's' : ''}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {convo.lead_captured && (
                                  <Badge variant="default" className="bg-green-600 text-xs">
                                    Lead Captured
                                  </Badge>
                                )}
                                {leadData?.email && (
                                  <Badge variant="secondary" className="text-xs">
                                    <Mail className="w-3 h-3 mr-1" />
                                    {leadData.email}
                                  </Badge>
                                )}
                                {leadData?.phone && (
                                  <Badge variant="secondary" className="text-xs">
                                    <Phone className="w-3 h-3 mr-1" />
                                    {leadData.phone}
                                  </Badge>
                                )}
                                <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {format(new Date(convo.created_at), 'MMM dd, h:mm a')}
                                </span>
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </div>
                            </div>
                          </div>
                        </CardHeader>

                        {isExpanded && (
                          <CardContent className="pt-0 pb-4 px-4 space-y-3">
                            {/* Lead data summary */}
                            {leadData && (
                              <div className="flex flex-wrap gap-2">
                                {leadData.projectType && (
                                  <Badge variant="outline">{leadData.projectType}</Badge>
                                )}
                                {leadData.location && (
                                  <Badge variant="outline">
                                    <MapPin className="w-3 h-3 mr-1" />
                                    {leadData.location}
                                  </Badge>
                                )}
                              </div>
                            )}

                            {/* Quick preview of last 3 messages */}
                            <div className="space-y-2 border rounded-lg p-3 bg-muted/30 max-h-48 overflow-y-auto">
                              {(convo.messages || []).slice(-4).map((msg: ChatMessage, idx: number) => (
                                <div key={idx} className={`text-sm ${msg.role === 'user' ? 'text-foreground' : 'text-muted-foreground'}`}>
                                  <span className="font-medium">
                                    {msg.role === 'user' ? '👤 Visitor: ' : '🤖 Bot: '}
                                  </span>
                                  <span className="line-clamp-2">{msg.content}</span>
                                </div>
                              ))}
                            </div>

                            {/* Action buttons */}
                            <div className="flex gap-2 pt-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setViewingConversation(convo)}
                              >
                                <MessageSquare className="w-4 h-4 mr-2" />
                                View Full Conversation
                              </Button>
                              {convo.lead_captured && (
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => createLeadFromConversation(convo)}
                                  disabled={creatingLeadFromChat}
                                >
                                  <Plus className="w-4 h-4 mr-2" />
                                  Create Lead
                                </Button>
                              )}
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Conversation</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently delete this chat conversation. This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteConversation(convo.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </CardContent>
                        )}
                      </Card>
                    );
                  })}
              </div>
              {Math.ceil(chatConversations.length / LEADS_PER_PAGE) > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setChatPage(p => Math.max(1, p - 1))}
                    disabled={chatPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm">
                    Page {chatPage} of {Math.ceil(chatConversations.length / LEADS_PER_PAGE)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setChatPage(p => Math.min(Math.ceil(chatConversations.length / LEADS_PER_PAGE), p + 1))}
                    disabled={chatPage === Math.ceil(chatConversations.length / LEADS_PER_PAGE)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* Full conversation viewer dialog */}
        <Dialog open={!!viewingConversation} onOpenChange={(open) => !open && setViewingConversation(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Conversation — {viewingConversation?.visitor_id.substring(0, 12)}...
                {viewingConversation?.lead_captured && (
                  <Badge variant="default" className="bg-green-600 text-xs ml-2">
                    Lead Captured
                  </Badge>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto flex-1 space-y-3 pr-2">
              {(viewingConversation?.messages || []).map((msg: ChatMessage, idx: number) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <p>{msg.content}</p>
                    <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                      {msg.timestamp ? format(new Date(msg.timestamp), 'h:mm a') : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {viewingConversation?.lead_data && (
              <div className="border-t pt-3 mt-3">
                <p className="text-sm font-medium mb-2">Captured Lead Data:</p>
                <div className="flex flex-wrap gap-2">
                  {viewingConversation.lead_data.email && (
                    <Badge variant="secondary">
                      <Mail className="w-3 h-3 mr-1" />
                      {viewingConversation.lead_data.email}
                    </Badge>
                  )}
                  {viewingConversation.lead_data.phone && (
                    <Badge variant="secondary">
                      <Phone className="w-3 h-3 mr-1" />
                      {viewingConversation.lead_data.phone}
                    </Badge>
                  )}
                  {viewingConversation.lead_data.projectType && (
                    <Badge variant="outline">{viewingConversation.lead_data.projectType}</Badge>
                  )}
                  {viewingConversation.lead_data.location && (
                    <Badge variant="outline">
                      <MapPin className="w-3 h-3 mr-1" />
                      {viewingConversation.lead_data.location}
                    </Badge>
                  )}
                </div>
                <Button
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    if (viewingConversation) {
                      createLeadFromConversation(viewingConversation);
                      setViewingConversation(null);
                    }
                  }}
                  disabled={creatingLeadFromChat}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Lead from This Conversation
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

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
                  <LeadCard key={lead.id} lead={lead} isArchived={true} />
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
