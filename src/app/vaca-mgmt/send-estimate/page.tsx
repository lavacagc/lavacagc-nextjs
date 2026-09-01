'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send, Eye, FileText, MailX } from 'lucide-react';
import { stopDrip } from '@/lib/followups/followUpsApi';
import { CustomerSearch, type CustomerHit } from '@/components/admin/CustomerSearch';

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

  // Round 8: three progressive steps - Customer, The estimate, Personalize &
  // send. Chips navigate freely; picking a customer auto-advances; a real send
  // resets to a fresh step 1. Optional extras fold (owner's decision).
  const [step, setStep] = useState(0);
  const [showEstimateExtras, setShowEstimateExtras] = useState(false);
  const [showSendExtras, setShowSendExtras] = useState(false);

  const selectCustomer = (customer: CustomerHit) => {
    setLeadId(customer.id);
    setRecipientName(customer.name ?? '');
    setRecipientEmail(customer.email ?? '');
    if (customer.project_type) setProjectType(customer.project_type);
    setStep(1);
    toast({
      title: 'Customer selected',
      description: `${customer.name ?? customer.email} — fields prefilled`,
    });
  };

  const STEP_LABELS = ['Customer', 'The estimate', 'Personalize & send'] as const;
  const stepChipLabel = (i: number) =>
    i === 0 && recipientName.trim() ? recipientName.trim() : STEP_LABELS[i];

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
        // A real send completes the flow: reset to a fresh step 1 for the
        // next customer (round 8).
        setLeadId(null);
        setRecipientName('');
        setRecipientEmail('');
        setCcEmails('');
        setReplyTo('');
        setProjectType('');
        setEstimateUrl('');
        setPortalUrl('');
        setUpdateCadence('');
        setPersonalNote('');
        setStep(0);
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
      <div className="mb-5">
        <h1 className="text-3xl font-bold">Send Estimate Email</h1>
        <p className="text-muted-foreground mt-1">
          Send a customer their QBO estimate with the La Vaca welcome packet.
        </p>
      </div>

      {/* Stepper (round 8): chips navigate freely; the send-log chip opens the
          standalone page in a new tab - in-place navigation out of the SPA is
          the vanishing-nav trap the owner reported on the email log. */}
      <div className="flex gap-2 flex-wrap items-center mb-4">
        {STEP_LABELS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <button
              key={label}
              type="button"
              onClick={() => setStep(i)}
              data-testid={`se-step-${i}`}
              className={`inline-flex items-center gap-2 border rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                active ? 'border-primary bg-primary/10 text-primary' : done ? 'border-green-600/50 text-green-700' : 'border-border text-muted-foreground'
              }`}
            >
              <span className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-[11px] font-bold ${
                done ? 'bg-green-600 text-white' : active ? 'bg-primary text-white' : 'bg-muted'
              }`}>{i + 1}</span>
              {stepChipLabel(i)}
            </button>
          );
        })}
        <Link href="/vaca-mgmt/send-estimate/log" target="_blank" rel="noopener" className="ml-auto">
          <Button variant="outline" size="sm">
            <FileText className="mr-2 h-4 w-4" /> View send log
          </Button>
        </Link>
      </div>

      {/* Step 1 - customer */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">1. Who is this estimate for?</CardTitle>
            <CardDescription>
              Search by name, email, or phone - or save someone new and they are findable forever.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CustomerSearch onSelect={selectCustomer} selectedId={leadId} />
          </CardContent>
        </Card>
      )}

      {/* Step 2 - the estimate */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">2. The estimate</CardTitle>
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
            </div>

            {/* Optional extras, folded (owner's round-8 decision). */}
            {!showEstimateExtras ? (
              <button
                type="button"
                onClick={() => setShowEstimateExtras(true)}
                data-testid="se-estimate-extras"
                className="text-xs font-bold text-primary hover:underline"
              >
                + Portal link &amp; update cadence (optional)
              </button>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(0)}>Back to customer</Button>
              <Button onClick={() => setStep(2)} data-testid="se-continue">Continue</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3 - personalize and send */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">3. Personalize &amp; send</CardTitle>
            <CardDescription>
              Preview before sending. Test sends always go to alex@lavacagc.com.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
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

            {!showSendExtras ? (
              <button
                type="button"
                onClick={() => setShowSendExtras(true)}
                data-testid="se-send-extras"
                className="text-xs font-bold text-primary hover:underline"
              >
                + CC and reply-to (optional)
              </button>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
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
              </div>
            )}

            <div className="flex flex-col md:flex-row gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button
                type="button"
                variant="outline"
                onClick={handlePreview}
                disabled={isLoadingPreview}
                data-testid="btn-preview"
                className="md:ml-auto"
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
                onClick={() => handleSend(false)}
                disabled={isSending}
                data-testid="btn-send"
              >
                {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Send to customer
              </Button>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleStopFollowUps}
                disabled={!recipientEmail.trim() || isStopping}
                className="text-orange-700 hover:bg-orange-50 hover:text-orange-800"
                data-testid="btn-stop-followups"
              >
                {isStopping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MailX className="mr-2 h-4 w-4" />}
                Stop this customer&apos;s follow-ups
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Collapsed placeholders for the steps ahead */}
      {step === 0 && (
        <>
          <button type="button" onClick={() => setStep(1)} className="mt-3 w-full text-left border rounded-lg bg-background px-4 py-3 text-sm font-bold text-muted-foreground flex items-center gap-2.5" data-testid="se-collapsed-1">
            <span className="w-5 h-5 rounded-full bg-muted inline-flex items-center justify-center text-[11px]">2</span>
            The estimate <span className="font-medium text-xs">- opens when a customer is picked</span>
          </button>
          <button type="button" onClick={() => setStep(2)} className="mt-2 w-full text-left border rounded-lg bg-background px-4 py-3 text-sm font-bold text-muted-foreground flex items-center gap-2.5" data-testid="se-collapsed-2">
            <span className="w-5 h-5 rounded-full bg-muted inline-flex items-center justify-center text-[11px]">3</span>
            Personalize &amp; send
          </button>
        </>
      )}

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
