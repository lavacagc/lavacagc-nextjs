'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send, Eye, FileText, Search, MailX } from 'lucide-react';
import { stopDrip } from '@/lib/followups/followUpsApi';

interface LeadHit {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  project_type: string | null;
  city: string | null;
  created_at: string;
}

const PROJECT_TYPES = [
  'Kitchen Remodeling',
  'Bathroom Renovation',
  'Basement Finishing',
  'Home Addition',
  'Whole Home Remodeling',
  'Interior Finishing',
  'Other',
];

export default function SendEstimatePage() {
  const { toast } = useToast();

  // Form state
  const [leadId, setLeadId] = useState<string | null>(null);
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [ccEmails, setCcEmails] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [projectType, setProjectType] = useState('');
  const [estimateUrl, setEstimateUrl] = useState('');
  const [portalUrl, setPortalUrl] = useState('');
  const [updateCadence, setUpdateCadence] = useState<'daily' | 'weekly' | ''>('');
  const [personalNote, setPersonalNote] = useState('');

  // UI state
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  // Lead search
  const [leadSearch, setLeadSearch] = useState('');
  const [leadResults, setLeadResults] = useState<LeadHit[]>([]);
  const [isSearchingLeads, setIsSearchingLeads] = useState(false);

  const searchLeads = useCallback(async (q: string) => {
    setIsSearchingLeads(true);
    try {
      const res = await fetch(
        `/api/admin/estimate-email/leads?q=${encodeURIComponent(q)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search failed');
      setLeadResults(data.leads || []);
    } catch (err) {
      toast({
        title: 'Lead search failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setIsSearchingLeads(false);
    }
  }, [toast]);

  // Debounced lead search
  useEffect(() => {
    const t = setTimeout(() => {
      searchLeads(leadSearch);
    }, 250);
    return () => clearTimeout(t);
  }, [leadSearch, searchLeads]);

  const selectLead = (lead: LeadHit) => {
    setLeadId(lead.id);
    setRecipientName(lead.name ?? '');
    setRecipientEmail(lead.email ?? '');
    if (lead.project_type) setProjectType(lead.project_type);
    toast({
      title: 'Lead selected',
      description: `${lead.name ?? lead.email} — fields prefilled`,
    });
  };

  const buildPayload = (isTest: boolean) => ({
    leadId,
    recipientName: recipientName.trim(),
    recipientEmail: recipientEmail.trim(),
    ccEmails: ccEmails.trim() || undefined,
    replyTo: replyTo.trim() || undefined,
    projectType,
    estimateUrl: estimateUrl.trim(),
    portalUrl: portalUrl.trim() || undefined,
    updateCadence: updateCadence || undefined,
    personalNote: personalNote.trim() || undefined,
    isTest,
  });

  const validateForPreview = (): string | null => {
    if (!recipientName.trim()) return 'Recipient name is required';
    if (!projectType) return 'Project type is required';
    if (!estimateUrl.trim()) return 'Estimate URL is required';
    if (!estimateUrl.startsWith('https://')) return 'Estimate URL must use https://';
    if (portalUrl && !portalUrl.startsWith('https://')) return 'Portal URL must use https://';
    return null;
  };

  const handlePreview = async () => {
    const err = validateForPreview();
    if (err) {
      toast({ title: 'Cannot preview', description: err, variant: 'destructive' });
      return;
    }
    // Preview tolerates a missing recipient email — fill a placeholder so
    // the schema accepts. The actual recipient is irrelevant for preview.
    const previewPayload = {
      ...buildPayload(false),
      recipientEmail: recipientEmail.trim() || 'preview@example.com',
    };
    setIsLoadingPreview(true);
    try {
      const res = await fetch('/api/admin/estimate-email/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(previewPayload),
      });
      const data = await res.json();
      if (!res.ok) {
        const issueMsg = Array.isArray(data.issues) && data.issues.length > 0
          ? data.issues.map((i: { message: string }) => i.message).join(', ')
          : data.error || 'Preview failed';
        throw new Error(issueMsg);
      }
      setPreviewHtml(data.html);
      setIsPreviewOpen(true);
    } catch (err) {
      toast({
        title: 'Preview failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleSend = async (isTest: boolean) => {
    if (!recipientEmail.trim() && !isTest) {
      toast({
        title: 'Recipient email required',
        description: 'Enter the customer email or use "Send test to me".',
        variant: 'destructive',
      });
      return;
    }
    const err = validateForPreview();
    if (err) {
      toast({ title: 'Cannot send', description: err, variant: 'destructive' });
      return;
    }
    if (!isTest) {
      const ok = window.confirm(
        `Send estimate email to ${recipientEmail}?\n\nThis will email the customer immediately.`,
      );
      if (!ok) return;
    }

    setIsSending(true);
    try {
      const res = await fetch('/api/admin/estimate-email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(isTest)),
      });
      const data = await res.json();
      if (!res.ok && data.status !== 'idempotent') {
        const issueMsg = Array.isArray(data.issues) && data.issues.length > 0
          ? data.issues.map((i: { message: string }) => i.message).join(', ')
          : data.error || 'Send failed';
        throw new Error(issueMsg);
      }

      if (data.status === 'idempotent') {
        toast({
          title: 'Already sent',
          description: 'A duplicate send within 30s was suppressed. Message ID reused.',
        });
      } else if (isTest) {
        toast({
          title: 'Test sent',
          description: `Test email sent to alex@lavacagc.com (Message ID: ${data.messageId ?? 'n/a'})`,
        });
      } else {
        toast({
          title: 'Estimate sent',
          description: `Sent to ${recipientEmail} (Message ID: ${data.messageId ?? 'n/a'})`,
        });
      }
    } catch (err) {
      toast({
        title: 'Send failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  // Stop the recipient's remaining nurture follow-ups — for estimates sent to
  // people who haven't (and may never) convert, without marking them a lead
  // status. Scoped so review-request emails are never affected.
  const handleStopFollowUps = async () => {
    const email = recipientEmail.trim();
    if (!email) return;
    if (!window.confirm(`Stop all pending follow-up emails for ${email}?`)) return;
    setIsStopping(true);
    try {
      const stopped = await stopDrip(email, 'nurture');
      toast({
        title: stopped > 0 ? 'Follow-ups stopped' : 'Nothing to stop',
        description: stopped > 0
          ? `Cancelled ${stopped} pending follow-up${stopped === 1 ? '' : 's'} for ${email}.`
          : `No pending follow-ups found for ${email}.`,
      });
    } catch (err) {
      console.error('Failed to stop follow-ups:', err);
      toast({
        title: 'Error',
        description: 'Failed to stop follow-ups.',
        variant: 'destructive',
      });
    } finally {
      setIsStopping(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Send Estimate Email</h1>
          <p className="text-muted-foreground mt-1">
            Send a customer their QBO estimate with the La Vaca welcome packet.
          </p>
        </div>
        <Link href="/vaca-mgmt/send-estimate/log">
          <Button variant="outline" size="sm">
            <FileText className="mr-2 h-4 w-4" /> View send log
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lead picker */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Pick a lead (optional)</CardTitle>
            <CardDescription>
              Searches name, email, or phone. Leave blank for one-off sends.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                data-testid="lead-search-input"
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
                placeholder="Search by name, email, phone..."
                className="pl-9"
              />
            </div>
            <div className="space-y-1 max-h-[480px] overflow-y-auto">
              {isSearchingLeads && (
                <div className="text-sm text-muted-foreground p-2">Searching…</div>
              )}
              {!isSearchingLeads && leadResults.length === 0 && (
                <div className="text-sm text-muted-foreground p-2">No leads found.</div>
              )}
              {leadResults.map((lead) => (
                <button
                  key={lead.id}
                  type="button"
                  data-testid={`lead-row-${lead.id}`}
                  onClick={() => selectLead(lead)}
                  className={`w-full text-left p-3 rounded-md border transition-colors hover:bg-muted/50 ${
                    leadId === lead.id ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                >
                  <div className="font-medium text-sm">{lead.name ?? '(no name)'}</div>
                  <div className="text-xs text-muted-foreground">{lead.email ?? '—'}</div>
                  <div className="text-xs text-muted-foreground">
                    {lead.project_type ?? 'No project type'} · {lead.city ?? 'No city'}
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Form */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Email details</CardTitle>
            <CardDescription>
              Preview before sending. Test sends always go to alex@lavacagc.com.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="recipientName">Recipient name *</Label>
                <Input
                  id="recipientName"
                  data-testid="field-recipient-name"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  maxLength={120}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recipientEmail">Recipient email *</Label>
                <Input
                  id="recipientEmail"
                  data-testid="field-recipient-email"
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  maxLength={255}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="ccEmails">CC (comma-separated, optional)</Label>
                <Input
                  id="ccEmails"
                  data-testid="field-cc-emails"
                  value={ccEmails}
                  onChange={(e) => setCcEmails(e.target.value)}
                  placeholder="spouse@example.com, designer@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="replyTo">Reply-to (optional)</Label>
                <Input
                  id="replyTo"
                  data-testid="field-reply-to"
                  type="email"
                  value={replyTo}
                  onChange={(e) => setReplyTo(e.target.value)}
                  placeholder="info@lavacagc.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="projectType">Project type *</Label>
                <Select value={projectType} onValueChange={setProjectType}>
                  <SelectTrigger id="projectType" data-testid="field-project-type">
                    <SelectValue placeholder="Select project type" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="estimateUrl">QBO estimate URL * (https only)</Label>
                <Input
                  id="estimateUrl"
                  data-testid="field-estimate-url"
                  type="url"
                  value={estimateUrl}
                  onChange={(e) => setEstimateUrl(e.target.value)}
                  placeholder="https://app.qbo.intuit.com/..."
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="portalUrl">Customer portal URL (optional, https only)</Label>
                <Input
                  id="portalUrl"
                  data-testid="field-portal-url"
                  type="url"
                  value={portalUrl}
                  onChange={(e) => setPortalUrl(e.target.value)}
                  placeholder="https://portal.lavacagc.com/..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="updateCadence">Update cadence (optional)</Label>
                <Select
                  value={updateCadence}
                  onValueChange={(v) => setUpdateCadence(v as 'daily' | 'weekly' | '')}
                >
                  <SelectTrigger id="updateCadence" data-testid="field-update-cadence">
                    <SelectValue placeholder="Default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="personalNote">Personal note (optional)</Label>
                <Textarea
                  id="personalNote"
                  data-testid="field-personal-note"
                  value={personalNote}
                  onChange={(e) => setPersonalNote(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="Hey Sarah — was great meeting you and Mike on Tuesday..."
                />
                <div className="text-xs text-muted-foreground">
                  {personalNote.length} / 1000
                </div>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-2 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={handlePreview}
                disabled={isLoadingPreview}
                data-testid="btn-preview"
              >
                {isLoadingPreview ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="mr-2 h-4 w-4" />
                )}
                Preview
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => handleSend(true)}
                disabled={isSending}
                data-testid="btn-send-test"
              >
                {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Send test to me
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleStopFollowUps}
                disabled={!recipientEmail.trim() || isStopping}
                className="md:ml-auto text-orange-700 border-orange-200 hover:bg-orange-50 hover:text-orange-800"
                data-testid="btn-stop-followups"
              >
                {isStopping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MailX className="mr-2 h-4 w-4" />}
                Stop follow-ups
              </Button>
              <Button
                type="button"
                onClick={() => handleSend(false)}
                disabled={isSending}
                data-testid="btn-send"
              >
                {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Send to customer
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Email preview</DialogTitle>
            <DialogDescription>
              This is exactly what the customer will see. Subject line will be:{' '}
              <code className="text-xs">
                Your {projectType || '...'} estimate from La Vaca General Contractors —{' '}
                {recipientName.split(/\s+/)[0] || '...'}
              </code>
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto border rounded-md bg-white">
            <iframe
              data-testid="preview-iframe"
              srcDoc={previewHtml}
              className="w-full h-[70vh] bg-white"
              title="Estimate email preview"
              // No sandbox flags: srcDoc renders in a unique opaque origin,
              // scripts and same-origin access are blocked by default. We
              // intentionally don't grant allow-same-origin/scripts.
              sandbox=""
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
