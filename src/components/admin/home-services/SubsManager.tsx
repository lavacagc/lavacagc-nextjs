'use client';

/**
 * Customers > Subs (AD5): the roster bid requests go to. Add, edit, approve or
 * suspend; trades and counties; language for their offers; insurance and HIC
 * expiry. An expired date shows a red flag, and that sub gets no offers until
 * it is renewed (BD3) - the row says so.
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Pencil, UserPlus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { COUNTIES } from '@/lib/home-services/catalog';
import type { SubRow } from '@/lib/home-services/offerRules';
import { LabeledSelect, TRADE_OPTIONS, fetchJson, jsonInit, tradeName } from './shared';

type Sub = SubRow & { insuranceExpired: boolean; hicExpired: boolean };

interface Draft {
  id?: string;
  business_name: string;
  contact_name: string;
  phone: string;
  email: string;
  trades: string[];
  counties: string[];
  language: 'en' | 'es';
  status: 'pending' | 'approved' | 'suspended';
  specnook_sub_id: string;
  insurance_expires_at: string;
  hic_expires_at: string;
  notes: string;
}

const EMPTY: Draft = {
  business_name: '', contact_name: '', phone: '', email: '', trades: [], counties: [], language: 'en',
  status: 'pending', specnook_sub_id: '', insurance_expires_at: '', hic_expires_at: '', notes: '',
};

const STATUS_STYLE: Record<Draft['status'], string> = {
  approved: 'border-green-300 bg-green-50 text-green-900',
  pending: 'border-amber-300 bg-amber-50 text-amber-900',
  suspended: 'border-zinc-300 bg-zinc-100 text-zinc-700',
};

export default function SubsManager() {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [specnook, setSpecnook] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchJson<{ subs: Sub[]; specnook: boolean }>('/api/admin/subs');
      setSubs(data.subs);
      setSpecnook(data.specnook);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load subs');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function edit(sub: Sub) {
    setFormError(null);
    setDraft({
      id: sub.id, business_name: sub.business_name, contact_name: sub.contact_name, phone: sub.phone, email: sub.email,
      trades: sub.trades, counties: sub.counties, language: sub.language, status: sub.status,
      specnook_sub_id: sub.specnook_sub_id ?? '', insurance_expires_at: sub.insurance_expires_at ?? '',
      hic_expires_at: sub.hic_expires_at ?? '', notes: sub.notes,
    });
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setFormError(null);
    try {
      const body = { ...draft, specnook_sub_id: draft.specnook_sub_id || null };
      if (draft.id) await fetchJson('/api/admin/subs', jsonInit('PATCH', body));
      else await fetchJson('/api/admin/subs', jsonInit('POST', body));
      toast({ title: draft.id ? 'Sub updated' : 'Sub added', description: draft.business_name });
      setDraft(null);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(sub: Sub, status: Draft['status']) {
    try {
      await fetchJson('/api/admin/subs', jsonInit('PATCH', { id: sub.id, status }));
      await load();
    } catch (e) {
      toast({ title: 'Could not update', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    }
  }

  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  return (
    <div className="space-y-4" data-testid="subs-manager">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold">Subs</h2>
          <p className="text-sm text-muted-foreground">
            Bid requests go to approved subs in the trade and county, with insurance and HIC in date.
            {!specnook && ' SpecNook not connected: approval is the status set here.'}
          </p>
        </div>
        <Button onClick={() => { setFormError(null); setDraft({ ...EMPTY }); }} data-testid="subs-add"><UserPlus className="mr-1.5 h-4 w-4" aria-hidden /> Add sub</Button>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/40 p-3 text-sm font-medium text-destructive" role="alert">The roster could not be read, so this is not an empty list: {error}</p>
      ) : loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" /></div>
      ) : subs.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No subs yet. Add the first one.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2" data-testid="subs-list">
          {subs.map((s) => {
            const lapsed = s.insuranceExpired || s.hicExpired;
            return (
              <li key={s.id}>
                <Card className={lapsed ? 'border-red-300' : ''} data-testid="sub-card" data-sub-name={s.business_name}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">{s.business_name}</CardTitle>
                        <CardDescription className="truncate">{[s.contact_name, s.phone, s.email].filter(Boolean).join(' · ') || 'No contact details'}</CardDescription>
                      </div>
                      <Badge variant="outline" className={STATUS_STYLE[s.status]} data-testid="sub-status">{s.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p><span className="text-muted-foreground">Trades: </span>{s.trades.length ? s.trades.map(tradeName).join(', ') : 'none'}</p>
                    <p><span className="text-muted-foreground">Counties: </span>{s.counties.length ? s.counties.join(', ') : 'any'} · {s.language === 'es' ? 'Spanish' : 'English'}</p>
                    <p className="flex flex-wrap gap-x-3">
                      <span className={s.insuranceExpired ? 'font-semibold text-red-700' : ''}>Insurance: {s.insurance_expires_at ?? 'not on file'}</span>
                      <span className={s.hicExpired ? 'font-semibold text-red-700' : ''}>HIC: {s.hic_expires_at ?? 'not on file'}</span>
                    </p>
                    {lapsed && (
                      <p className="flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-800" data-testid="sub-expired-flag">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {s.insuranceExpired && s.hicExpired ? 'Insurance and HIC expired' : s.insuranceExpired ? 'Insurance expired' : 'HIC expired'} - gets no offers until renewed
                      </p>
                    )}
                    {s.specnook_sub_id && <p className="text-xs text-muted-foreground">SpecNook id {s.specnook_sub_id}</p>}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => edit(s)} data-testid="sub-edit"><Pencil className="mr-1 h-3.5 w-3.5" aria-hidden />Edit</Button>
                      {s.status !== 'approved' && <Button size="sm" variant="outline" onClick={() => setStatus(s, 'approved')} data-testid="sub-approve">Approve</Button>}
                      {s.status !== 'suspended' && <Button size="sm" variant="ghost" onClick={() => setStatus(s, 'suspended')} data-testid="sub-suspend">Suspend</Button>}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => { if (!o) setDraft(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? 'Edit sub' : 'Add sub'}</DialogTitle>
            <DialogDescription>Approved subs in the trade and county get every bid request for it.</DialogDescription>
          </DialogHeader>
          {draft && (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }} data-testid="sub-form">
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField id="sub-business" label="Business name" value={draft.business_name} onChange={(v) => setDraft({ ...draft, business_name: v })} required />
                <TextField id="sub-contact" label="Contact name" value={draft.contact_name} onChange={(v) => setDraft({ ...draft, contact_name: v })} />
                <TextField id="sub-phone" label="Mobile phone" value={draft.phone} onChange={(v) => setDraft({ ...draft, phone: v })} type="tel" />
                <TextField id="sub-email" label="Email" value={draft.email} onChange={(v) => setDraft({ ...draft, email: v })} type="email" />
              </div>
              <fieldset>
                <legend className="mb-1 text-xs font-medium text-muted-foreground">Trades</legend>
                <div className="grid grid-cols-2 gap-1.5">
                  {TRADE_OPTIONS.map((t) => (
                    <label key={t.value} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={draft.trades.includes(t.value)} onCheckedChange={() => setDraft({ ...draft, trades: toggle(draft.trades, t.value) })} aria-label={t.label} />
                      {t.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-1 text-xs font-medium text-muted-foreground">Counties (none ticked = any county)</legend>
                <div className="flex flex-wrap gap-4">
                  {COUNTIES.map((c) => (
                    <label key={c} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={draft.counties.includes(c)} onCheckedChange={() => setDraft({ ...draft, counties: toggle(draft.counties, c) })} aria-label={c} />
                      {c}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-3 sm:grid-cols-2">
                <LabeledSelect id="sub-language" label="Language for offers" value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value as Draft['language'] })}>
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                </LabeledSelect>
                <LabeledSelect id="sub-status" label="Status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Draft['status'] })}>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="suspended">Suspended</option>
                </LabeledSelect>
                <TextField id="sub-insurance" label="Insurance expires" value={draft.insurance_expires_at} onChange={(v) => setDraft({ ...draft, insurance_expires_at: v })} type="date" />
                <TextField id="sub-hic" label="HIC expires" value={draft.hic_expires_at} onChange={(v) => setDraft({ ...draft, hic_expires_at: v })} type="date" />
                <TextField id="sub-specnook" label="SpecNook id" value={draft.specnook_sub_id} onChange={(v) => setDraft({ ...draft, specnook_sub_id: v })} />
              </div>
              <div>
                <label htmlFor="sub-notes" className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
                <Textarea id="sub-notes" rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} maxLength={4000} />
              </div>
              {formError && <p className="text-sm font-medium text-destructive" role="alert" data-testid="sub-form-error">{formError}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
                <Button type="submit" disabled={saving || !draft.business_name.trim()} data-testid="sub-save">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : draft.id ? 'Save changes' : 'Add sub'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TextField({ id, label, value, onChange, type = 'text', required }: {
  id: string; label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} />
    </div>
  );
}
