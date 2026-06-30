'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import HeadshotCropper from '@/components/admin/HeadshotCropper';
import { Download, Upload, FileSpreadsheet, Trash2, Edit, Save, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import {
  TEMPLATE_HEADERS,
  TEMPLATE_EXAMPLE_ROW,
  TEMPLATE_SAMPLE_ROWS,
  INSTRUCTIONS_ROWS,
  LISTING_STATUSES,
  RECOMMENDED_SCOPES,
  normalizeRow,
  validateRow,
  deriveSlug,
  addressKey,
  extractBeforePhotos,
  type NormalizedListing,
  type BeforePhoto,
} from '@/lib/listings/columns';

type Listing = Database['public']['Tables']['listings']['Row'];
type PartnerRealtor = Database['public']['Tables']['partner_realtor']['Row'];

interface PreviewRow {
  rowNum: number;
  data: NormalizedListing;
  beforePhotos: BeforePhoto[];
  slug: string;
  error: string | null;
  status: 'new' | 'update' | 'error';
}

interface ImportResult {
  inserted: number;
  updated: number;
  errors: { row: number; reason: string }[];
  warnings: { row: number; reason: string }[];
  queuedRenderings?: number;
}

const money = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export function ListingsManager() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  // Import wizard state
  const [parsedRows, setParsedRows] = useState<PreviewRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit dialog state
  const [editing, setEditing] = useState<Listing | null>(null);

  // Partner agent state
  const [agent, setAgent] = useState<Partial<PartnerRealtor>>({});
  const [savingAgent, setSavingAgent] = useState(false);

  // Publish flag (controls public visibility of the whole Buy + Remodel feature)
  const [published, setPublished] = useState<boolean | null>(null);
  const [savingPublished, setSavingPublished] = useState(false);

  const loadListings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .order('featured', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Failed to load listings', description: error.message, variant: 'destructive' });
    } else {
      setListings(data ?? []);
    }
    setLoading(false);
  }, []);

  const loadAgent = useCallback(async () => {
    const { data } = await supabase.from('partner_realtor').select('*').eq('id', 1).maybeSingle();
    if (data) setAgent(data);
  }, []);

  const loadPublished = useCallback(async () => {
    const { data, error } = await supabase
      .from('site_settings')
      .select('buy_and_remodel_published')
      .eq('id', 1)
      .maybeSingle();
    // If the table/row isn't there yet (migration not run), treat as unpublished.
    setPublished(error ? false : !!data?.buy_and_remodel_published);
  }, []);

  useEffect(() => {
    loadListings();
    loadAgent();
    loadPublished();
  }, [loadListings, loadAgent, loadPublished]);

  // ----- Import wizard -----
  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, TEMPLATE_EXAMPLE_ROW]);
    XLSX.utils.book_append_sheet(wb, ws, 'Listings');
    const instr = XLSX.utils.aoa_to_sheet(INSTRUCTIONS_ROWS);
    XLSX.utils.book_append_sheet(wb, instr, 'Instructions');
    XLSX.writeFile(wb, 'lavaca-listings-template.xlsx');
  };

  // Sample CSV: the exact import columns plus a few fully-filled example homes,
  // for handing to another system to populate. Directly re-importable as-is.
  const downloadSampleCsv = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...TEMPLATE_SAMPLE_ROWS]);
    XLSX.utils.book_append_sheet(wb, ws, 'Listings');
    XLSX.writeFile(wb, 'lavaca-listings-sample.csv', { bookType: 'csv' });
  };

  const parseFile = (file: File) => {
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buf = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
        const existingSlugs = new Set(listings.map((l) => l.slug));
        // Map every existing listing's normalized address -> its slug, plus track
        // addresses seen earlier in this same file, to flag duplicate addresses.
        const existingByAddr = new Map<string, string>();
        for (const l of listings) {
          const k = addressKey(l);
          if (k) existingByAddr.set(k, l.slug);
        }
        const seenInBatch = new Map<string, number>();
        const rows: PreviewRow[] = records.map((rec, i) => {
          const data = normalizeRow(rec);
          const beforePhotos = extractBeforePhotos(rec);
          const slug = deriveSlug(data);
          let error = validateRow(data);
          // Duplicate-address guard (mirrors the server). A matching slug is an
          // update, not a dup; a different slug at the same address is rejected.
          if (!error) {
            const k = addressKey(data);
            if (k) {
              const existingSlug = existingByAddr.get(k);
              const firstRow = seenInBatch.get(k);
              if (existingSlug && existingSlug !== slug) {
                error = 'Duplicate address — a different listing with this address already exists';
              } else if (firstRow != null) {
                error = `Duplicate address — same as row ${firstRow} in this file`;
              } else {
                seenInBatch.set(k, i + 1);
              }
            }
          }
          const status: PreviewRow['status'] = error ? 'error' : existingSlugs.has(slug) ? 'update' : 'new';
          return { rowNum: i + 1, data, beforePhotos, slug, error, status };
        });
        setParsedRows(rows);
        if (rows.length === 0) {
          toast({ title: 'No rows found', description: 'The first sheet had no data rows.', variant: 'destructive' });
        }
      } catch (err) {
        toast({
          title: 'Could not read file',
          description: err instanceof Error ? err.message : 'Unsupported file.',
          variant: 'destructive',
        });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      parseFile(file);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setFileName(file.name);
      parseFile(file);
    }
  };

  const validCount = parsedRows.filter((r) => r.status !== 'error').length;
  const errorCount = parsedRows.length - validCount;

  const commitImport = async () => {
    const rows = parsedRows
      .filter((r) => r.status !== 'error')
      .map((r) => ({ listing: r.data, before_photos: r.beforePhotos }));
    if (rows.length === 0) {
      toast({ title: 'Nothing to import', description: 'All rows have errors.', variant: 'destructive' });
      return;
    }
    setImporting(true);
    try {
      const res = await fetch('/api/admin/listings/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: 'Import failed', description: json.error ?? `HTTP ${res.status}`, variant: 'destructive' });
        return;
      }
      setResult(json as ImportResult);
      toast({
        title: 'Import complete',
        description:
          `${json.inserted} added, ${json.updated} updated, ${json.errors?.length ?? 0} skipped.` +
          (json.queuedRenderings ? ` ${json.queuedRenderings} before/after render(s) queued.` : ''),
      });
      setParsedRows([]);
      setFileName('');
      await loadListings();
    } catch (err) {
      toast({ title: 'Import failed', description: err instanceof Error ? err.message : 'Network error', variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  // ----- Manage -----
  const updateListing = async (id: string, patch: Partial<Listing>) => {
    const { error } = await supabase.from('listings').update(patch).eq('id', id);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return false;
    }
    await loadListings();
    return true;
  };

  const deleteListing = async (l: Listing) => {
    if (!window.confirm(`Delete "${l.address_line1}, ${l.city}"? This cannot be undone.`)) return;
    const { error } = await supabase.from('listings').delete().eq('id', l.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Listing deleted' });
    await loadListings();
  };

  const saveEdit = async () => {
    if (!editing) return;
    const ok = await updateListing(editing.id, {
      address_line1: editing.address_line1,
      city: editing.city,
      county: editing.county,
      zip: editing.zip,
      list_price: editing.list_price,
      beds: editing.beds,
      baths: editing.baths,
      sqft: editing.sqft,
      est_remodel_budget_low: editing.est_remodel_budget_low,
      est_remodel_budget_high: editing.est_remodel_budget_high,
      est_arv: editing.est_arv,
      recommended_scope: editing.recommended_scope,
      short_description: editing.short_description,
      status: editing.status,
      featured: editing.featured,
      sort_order: editing.sort_order,
    });
    if (ok) {
      toast({ title: 'Listing updated' });
      setEditing(null);
    }
  };

  // ----- Partner agent -----
  const saveAgent = async () => {
    setSavingAgent(true);
    const { error } = await supabase
      .from('partner_realtor')
      .update({
        name: agent.name ?? null,
        brokerage: agent.brokerage ?? null,
        phone: agent.phone ?? null,
        email: agent.email ?? null,
        photo_url: agent.photo_url ?? null,
        bio: agent.bio ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);
    setSavingAgent(false);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Partner agent saved' });
    }
  };

  const togglePublished = async (next: boolean) => {
    setSavingPublished(true);
    const { error } = await supabase
      .from('site_settings')
      .update({ buy_and_remodel_published: next, updated_at: new Date().toISOString() })
      .eq('id', 1);
    setSavingPublished(false);
    if (error) {
      toast({
        title: 'Could not update publish status',
        description: `${error.message}. Has the site_settings migration been run?`,
        variant: 'destructive',
      });
      return;
    }
    setPublished(next);
    toast({
      title: next ? 'Buy + Remodel is now live' : 'Buy + Remodel hidden from the public',
      description: next
        ? 'The page is public and the nav link is visible to everyone.'
        : 'Visitors get a 404 and the nav link is hidden. You can still preview it while logged in.',
    });
  };

  const statusBadgeVariant = (s: PreviewRow['status']) =>
    s === 'error' ? 'destructive' : s === 'update' ? 'secondary' : 'default';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-text-primary">Home Listings</h2>
        <p className="text-text-muted">
          Curated &ldquo;buy + remodel&rdquo; homes shown on <code>/buy-and-remodel</code>. Upload a spreadsheet to add or update homes in bulk.
        </p>
      </div>

      {/* Publish gate — controls whether the public can see the feature at all */}
      <Card>
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-text-primary">Publish to the public</span>
              {published === null ? null : published ? (
                <Badge>Live</Badge>
              ) : (
                <Badge variant="secondary">Hidden</Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-text-muted">
              While off, only you (logged in) can preview <code>/buy-and-remodel</code> — visitors get a 404 and the
              nav link is hidden. Populate and preview the homes, then turn this on to go live.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {savingPublished && <Loader2 className="h-4 w-4 animate-spin text-text-muted" />}
            <Switch
              checked={!!published}
              disabled={published === null || savingPublished}
              onCheckedChange={togglePublished}
              aria-label="Publish Buy + Remodel to the public"
            />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="import">
        <TabsList>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="manage">Manage ({listings.length})</TabsTrigger>
          <TabsTrigger value="agent">Partner Agent</TabsTrigger>
        </TabsList>

        {/* ---------- IMPORT ---------- */}
        <TabsContent value="import" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>1. Get the template</CardTitle>
              <CardDescription>
                Download the spreadsheet, fill one row per home, then upload it below. Multi-value cells (photos,
                highlights) use a pipe <code>|</code> between items. Paste the realtor&rsquo;s photo links in the Photo URLs
                column — we host them automatically. The <strong>sample .csv</strong> has the exact columns plus a few
                filled-in example homes — hand it to another system to populate, then upload the result here.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button onClick={downloadTemplate} variant="outline">
                <Download className="w-4 h-4 mr-2" />
                Download .xlsx template
              </Button>
              <Button onClick={downloadSampleCsv} variant="outline">
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Download sample .csv
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2. Upload your spreadsheet</CardTitle>
              <CardDescription>Accepts .xlsx and .csv. Rows are checked before anything is saved.</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 cursor-pointer transition-colors ${
                  dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                }`}
              >
                <FileSpreadsheet className="w-8 h-8 text-primary" />
                <p className="font-medium text-text-primary">{fileName || 'Drop a file here or click to browse'}</p>
                <p className="text-sm text-text-muted">.xlsx or .csv</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>
            </CardContent>
          </Card>

          {parsedRows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>3. Preview &amp; commit</CardTitle>
                <CardDescription>
                  {validCount} ready, {errorCount} with errors. Rows with errors are skipped; everything else is saved.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="max-h-96 overflow-auto border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Row</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead>City</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Remodel</TableHead>
                        <TableHead>Photos</TableHead>
                        <TableHead>Issue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedRows.map((r) => (
                        <TableRow key={r.rowNum}>
                          <TableCell>{r.rowNum}</TableCell>
                          <TableCell>
                            <Badge variant={statusBadgeVariant(r.status)}>
                              {r.status === 'error' ? 'Error' : r.status === 'update' ? 'Update' : 'New'}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{r.data.address_line1 || '—'}</TableCell>
                          <TableCell>{r.data.city || '—'}</TableCell>
                          <TableCell>{money(r.data.list_price)}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {money(r.data.est_remodel_budget_low)}–{money(r.data.est_remodel_budget_high)}
                          </TableCell>
                          <TableCell>{r.data.photo_urls.length}</TableCell>
                          <TableCell className="text-destructive text-sm">{r.error ?? ''}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Button onClick={commitImport} disabled={importing || validCount === 0}>
                  {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                  Import {validCount} {validCount === 1 ? 'home' : 'homes'}
                </Button>
              </CardContent>
            </Card>
          )}

          {result && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-accent-teal" /> Import results
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-text-primary">
                  <strong>{result.inserted}</strong> added, <strong>{result.updated}</strong> updated,{' '}
                  <strong>{result.errors.length}</strong> skipped.
                </p>
                {!!result.queuedRenderings && (
                  <p className="text-sm text-text-secondary">
                    {result.queuedRenderings} before/after render(s) queued — they appear on the listing within a few
                    minutes as the AI generates each &ldquo;after.&rdquo;
                  </p>
                )}
                {result.errors.length > 0 && (
                  <div className="text-sm text-destructive">
                    {result.errors.map((er, i) => (
                      <div key={i}>Row {er.row}: {er.reason}</div>
                    ))}
                  </div>
                )}
                {result.warnings.length > 0 && (
                  <div className="text-sm text-text-muted flex flex-col gap-1">
                    {result.warnings.map((w, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-accent-sunset" /> Row {w.row}: {w.reason}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ---------- MANAGE ---------- */}
        <TabsContent value="manage">
          <Card>
            <CardHeader>
              <CardTitle>Current listings</CardTitle>
              <CardDescription>Edit details, toggle featured, change status, or delete.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-text-muted">Loading…</p>
              ) : listings.length === 0 ? (
                <p className="text-text-muted">No listings yet. Use the Import tab to add homes.</p>
              ) : (
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Address</TableHead>
                        <TableHead>City</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>ARV</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Featured</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {listings.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="whitespace-nowrap">{l.address_line1}</TableCell>
                          <TableCell>{l.city}</TableCell>
                          <TableCell>{money(l.list_price)}</TableCell>
                          <TableCell>{money(l.est_arv)}</TableCell>
                          <TableCell>
                            <Select value={l.status} onValueChange={(v) => updateListing(l.id, { status: v })}>
                              <SelectTrigger className="w-32 h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {LISTING_STATUSES.map((s) => (
                                  <SelectItem key={s} value={s}>
                                    {s}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={!!l.featured}
                              onCheckedChange={(checked) => updateListing(l.id, { featured: checked })}
                            />
                          </TableCell>
                          <TableCell className="text-right space-x-1">
                            <Button size="sm" variant="ghost" onClick={() => setEditing(l)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => deleteListing(l)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- PARTNER AGENT ---------- */}
        <TabsContent value="agent">
          <Card>
            <CardHeader>
              <CardTitle>Partner real estate agent</CardTitle>
              <CardDescription>Shown on every listing card and detail page as the buying contact.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-w-xl">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="agent-name">Name</Label>
                  <Input id="agent-name" value={agent.name ?? ''} onChange={(e) => setAgent({ ...agent, name: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="agent-brokerage">Brokerage</Label>
                  <Input id="agent-brokerage" value={agent.brokerage ?? ''} onChange={(e) => setAgent({ ...agent, brokerage: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="agent-phone">Phone</Label>
                  <Input id="agent-phone" value={agent.phone ?? ''} onChange={(e) => setAgent({ ...agent, phone: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="agent-email">Email</Label>
                  <Input id="agent-email" type="email" value={agent.email ?? ''} onChange={(e) => setAgent({ ...agent, email: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Headshot</Label>
                <HeadshotCropper
                  value={agent.photo_url}
                  onUploaded={(url) => setAgent({ ...agent, photo_url: url })}
                />
              </div>
              <div>
                <Label htmlFor="agent-photo">Photo URL (or paste one directly)</Label>
                <Input id="agent-photo" value={agent.photo_url ?? ''} onChange={(e) => setAgent({ ...agent, photo_url: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="agent-bio">Short bio</Label>
                <Textarea id="agent-bio" value={agent.bio ?? ''} onChange={(e) => setAgent({ ...agent, bio: e.target.value })} />
              </div>
              <Button onClick={saveAgent} disabled={savingAgent}>
                {savingAgent ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save partner agent
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ---------- EDIT DIALOG ---------- */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Edit listing</DialogTitle>
            <DialogDescription>Photos are managed via spreadsheet re-import.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Address</Label>
                  <Input value={editing.address_line1} onChange={(e) => setEditing({ ...editing, address_line1: e.target.value })} />
                </div>
                <div>
                  <Label>City</Label>
                  <Input value={editing.city} onChange={(e) => setEditing({ ...editing, city: e.target.value })} />
                </div>
                <div>
                  <Label>Zip</Label>
                  <Input value={editing.zip ?? ''} onChange={(e) => setEditing({ ...editing, zip: e.target.value })} />
                </div>
                <div>
                  <Label>List Price</Label>
                  <Input type="number" value={editing.list_price ?? ''} onChange={(e) => setEditing({ ...editing, list_price: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div>
                  <Label>ARV</Label>
                  <Input type="number" value={editing.est_arv ?? ''} onChange={(e) => setEditing({ ...editing, est_arv: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div>
                  <Label>Remodel Low</Label>
                  <Input type="number" value={editing.est_remodel_budget_low ?? ''} onChange={(e) => setEditing({ ...editing, est_remodel_budget_low: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div>
                  <Label>Remodel High</Label>
                  <Input type="number" value={editing.est_remodel_budget_high ?? ''} onChange={(e) => setEditing({ ...editing, est_remodel_budget_high: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div>
                  <Label>Beds</Label>
                  <Input type="number" value={editing.beds ?? ''} onChange={(e) => setEditing({ ...editing, beds: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div>
                  <Label>Baths</Label>
                  <Input type="number" step="0.5" value={editing.baths ?? ''} onChange={(e) => setEditing({ ...editing, baths: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div>
                  <Label>Sq Ft</Label>
                  <Input type="number" value={editing.sqft ?? ''} onChange={(e) => setEditing({ ...editing, sqft: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div>
                  <Label>Sort Order</Label>
                  <Input type="number" value={editing.sort_order ?? 0} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Scope</Label>
                  <Select value={editing.recommended_scope ?? 'general'} onValueChange={(v) => setEditing({ ...editing, recommended_scope: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RECOMMENDED_SCOPES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={editing.status} onValueChange={(v) => setEditing({ ...editing, status: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LISTING_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={editing.short_description ?? ''} onChange={(e) => setEditing({ ...editing, short_description: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={!!editing.featured} onCheckedChange={(checked) => setEditing({ ...editing, featured: checked })} />
                <Label>Featured</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={saveEdit}>
              <Save className="w-4 h-4 mr-2" /> Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
