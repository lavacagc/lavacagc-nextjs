'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Search, UserPlus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * The shared customer typeahead used by Send Estimate and Send Service Quote.
 *
 * Searches the leads list by name / email / phone as you type (the existing
 * /api/admin/estimate-email/leads endpoint), and always offers a final "save a
 * new customer" row for people who never came in as a lead - they are stored
 * as a lead with source 'manual' (owner's decision 2026-08-08: one people
 * list, no separate customers table), so both tabs find them forever after.
 */

export interface CustomerHit {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  project_type: string | null;
  city: string | null;
  source: string | null;
  created_at: string;
}

interface CustomerSearchProps {
  onSelect: (customer: CustomerHit) => void;
  selectedId?: string | null;
  placeholder?: string;
  /**
   * 'list' - single narrow column (Send Estimate's sidebar). 'grid' - result
   * cards spread across the full width (the proposal builder and Send Service
   * Quote), per the owner's round-5 note: use the real estate.
   */
  layout?: 'list' | 'grid';
}

/** Type-first: nobody is listed until the query reaches this many characters. */
const MIN_QUERY_CHARS = 2;

export function CustomerSearch({ onSelect, selectedId, placeholder, layout = 'list' }: CustomerSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', city: '' });
  // Guards against a slow earlier response overwriting a newer one.
  const searchStamp = useRef(0);

  const search = useCallback(async (q: string) => {
    const stamp = ++searchStamp.current;
    setIsSearching(true);
    try {
      const res = await fetch(`/api/admin/estimate-email/leads?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search failed');
      if (stamp === searchStamp.current) setResults(data.leads || []);
    } catch (err) {
      if (stamp === searchStamp.current) {
        toast({
          title: 'Customer search failed',
          description: err instanceof Error ? err.message : String(err),
          variant: 'destructive',
        });
      }
    } finally {
      if (stamp === searchStamp.current) setIsSearching(false);
    }
  }, []);

  // Debounced, and TYPE-FIRST (owner's round-5 decision, applied everywhere):
  // below the minimum the list stays empty instead of showing the 25 newest.
  useEffect(() => {
    if (query.trim().length < MIN_QUERY_CHARS) {
      // Invalidate any in-flight search so its late answer can't repopulate.
      searchStamp.current++;
      setResults([]);
      setIsSearching(false);
      return;
    }
    const t = setTimeout(() => {
      search(query);
    }, 250);
    return () => clearTimeout(t);
  }, [query, search]);

  const openAddDialog = () => {
    // Seed the dialog from whatever was typed: words become the name, an
    // @-string becomes the email.
    const typed = query.trim();
    const seed = { firstName: '', lastName: '', email: '', phone: '', city: '' };
    if (typed.includes('@')) {
      seed.email = typed;
    } else if (typed) {
      const [first, ...rest] = typed.split(/\s+/);
      seed.firstName = first;
      seed.lastName = rest.join(' ');
    }
    setForm(seed);
    setShowAddDialog(true);
  };

  const saveCustomer = async () => {
    if (!form.firstName.trim() || !form.email.trim()) {
      toast({ title: 'Missing info', description: 'First name and email are required.', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    try {
      // Server-side write: /api/admin/customers runs the sanitizer chokepoint
      // and inserts with the secret key. A browser-side supabase insert is
      // blocked by the site's connect-src CSP.
      const res = await fetch('/api/admin/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          city: form.city,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');

      const hit: CustomerHit = data.customer;
      setShowAddDialog(false);
      setResults((prev) => [hit, ...prev]);
      onSelect(hit);
      toast({ title: 'Customer saved', description: `${hit.name} is saved and selected - findable by name, email, or phone from now on.` });
    } catch (err) {
      // PostgrestError isn't an Error instance but carries .message - without
      // this the toast reads "[object Object]".
      const message =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message ?? String(err);
      toast({
        title: 'Could not save the customer',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const belowMinimum = query.trim().length < MIN_QUERY_CHARS;
  const grid = layout === 'grid';

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground ${grid ? 'h-5 w-5' : 'h-4 w-4'}`} />
        <Input
          data-testid="customer-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder ?? 'Search by name, email, phone...'}
          className={grid ? 'pl-10 h-11 text-base' : 'pl-9'}
        />
      </div>

      {belowMinimum ? (
        <div className="text-center py-8 text-muted-foreground" data-testid="customer-search-hint">
          <p className="text-sm font-semibold text-foreground">Start typing to find a customer</p>
          <p className="text-sm mt-0.5">Results appear from the second letter - nobody is listed until you ask.</p>
        </div>
      ) : (
        <div
          className={
            grid
              ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[440px] overflow-y-auto'
              : 'space-y-1 max-h-[440px] overflow-y-auto'
          }
        >
          {isSearching && <div className="text-sm text-muted-foreground p-2">Searching…</div>}
          {!isSearching && results.length === 0 && (
            <div className="text-sm text-muted-foreground p-2">Nobody found.</div>
          )}
          {!isSearching && results.map((c) => (
            <button
              key={c.id}
              type="button"
              data-testid={`customer-row-${c.id}`}
              onClick={() => onSelect(c)}
              className={`w-full text-left p-3 rounded-md border transition-colors hover:bg-muted/50 ${
                selectedId === c.id ? 'border-primary bg-primary/5' : 'border-border'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm truncate">{c.name ?? '(no name)'}</span>
                {c.source === 'manual' && (
                  <span className="text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 bg-primary/10 text-primary whitespace-nowrap">
                    saved by you
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground truncate">{c.email ?? '-'}</div>
              <div className="text-xs text-muted-foreground">
                {[c.phone, c.city].filter(Boolean).join(' · ') || 'No contact details'}
              </div>
            </button>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        className={grid ? 'mx-auto flex' : 'w-full'}
        data-testid="customer-add-button"
        onClick={openAddDialog}
      >
        <UserPlus className="w-4 h-4 mr-2" />
        {query.trim() && belowMinimum === false && results.length === 0 && !isSearching
          ? `Save "${query.trim()}" as a new customer`
          : 'Save a new customer'}
      </Button>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save a new customer</DialogTitle>
            <DialogDescription>
              Saved once, findable forever - they will also appear in your Leads tab tagged as a manual entry.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cs-first">First name *</Label>
              <Input id="cs-first" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cs-last">Last name</Label>
              <Input id="cs-last" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="cs-email">Email *</Label>
              <Input id="cs-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cs-phone">Phone</Label>
              <Input id="cs-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cs-city">City (optional)</Label>
              <Input id="cs-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={saveCustomer} disabled={isSaving} data-testid="customer-save-button">
              {isSaving ? 'Saving…' : 'Save & select'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
