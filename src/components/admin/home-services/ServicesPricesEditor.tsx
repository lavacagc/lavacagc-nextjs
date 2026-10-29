'use client';

/**
 * Customers > Services & Prices (docs/phase-2/acceptance-criteria.md, CAT2 to
 * CAT5): the seven home services the /home-services pages render, from the
 * home_services table. The list shows name, starting price and an active
 * switch; Edit opens every field with English and Spanish side by side.
 *
 * A save goes to PATCH /api/admin/home-services/[slug], which validates the
 * whole body (field-level messages come back and sit under their field),
 * stamps who saved it and makes the change live on the next page load.
 *
 * Changing the starting price carries the new amount into the two price
 * display lines, and lists every other field that still quotes the old
 * amount (SEO copy, FAQ answers), because those are written prose and are
 * not rewritten behind the admin's back.
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import type { HomeServiceRow } from '@/lib/home-services/catalogRow';
import type { ServiceFaqItem } from '@/lib/home-services/catalog';
import { loadServiceRows, refreshServiceRows } from './shared';

type FieldErrors = Record<string, string>;

/** A field the server refused gets a red border, not only the message under it. */
const INVALID = 'aria-[invalid=true]:border-red-600 aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-red-600';

/** The form's working copy: lists as one line per item, money as dollars. */
interface Draft {
  active: boolean;
  price: string;
  minimum: string;
  price_display_en: string;
  price_display_es: string;
  price_unit_en: string;
  price_unit_es: string;
  price_note_en: string;
  price_note_es: string;
  name_en: string;
  name_es: string;
  description_en: string;
  description_es: string;
  included_en: string;
  included_es: string;
  raises_en: string;
  raises_es: string;
  seo_title_en: string;
  seo_title_es: string;
  seo_description_en: string;
  seo_description_es: string;
  seo_keywords: string;
  faq: ServiceFaqItem[];
}

/** "$2,095" for whole dollars, "$2.95" otherwise: the way the seed writes prices. */
export function formatPrice(cents: number): string {
  const dollars = cents / 100;
  return cents % 100 === 0
    ? `$${dollars.toLocaleString('en-US')}`
    : `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const dollarsOf = (cents: number | null) => (cents == null ? '' : (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2));

/** Dollars typed by a person ("2,095", "$2.95") to integer cents; NaN when it is not a number. */
function centsOf(input: string): number {
  const clean = input.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return Number.NaN;
  return Math.round(Number(clean) * 100);
}

const toLines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);

function draftOf(row: HomeServiceRow): Draft {
  return {
    active: row.active,
    price: dollarsOf(row.starting_price_cents),
    minimum: dollarsOf(row.minimum_cents),
    price_display_en: row.price_display_en,
    price_display_es: row.price_display_es,
    price_unit_en: row.price_unit_en,
    price_unit_es: row.price_unit_es,
    price_note_en: row.price_note_en ?? '',
    price_note_es: row.price_note_es ?? '',
    name_en: row.name_en,
    name_es: row.name_es,
    description_en: row.description_en,
    description_es: row.description_es,
    included_en: row.included_en.join('\n'),
    included_es: row.included_es.join('\n'),
    raises_en: row.raises_en.join('\n'),
    raises_es: row.raises_es.join('\n'),
    seo_title_en: row.seo_title_en,
    seo_title_es: row.seo_title_es,
    seo_description_en: row.seo_description_en,
    seo_description_es: row.seo_description_es,
    seo_keywords: row.seo_keywords.join('\n'),
    faq: row.faq.map((item) => ({ q: { ...item.q }, a: { ...item.a } })),
  };
}

/** The PATCH body. A price that is not a number is sent as-is so the server names the field. */
function bodyOf(d: Draft): Record<string, unknown> {
  const price = centsOf(d.price);
  const minimum = d.minimum.trim() ? centsOf(d.minimum) : null;
  return {
    active: d.active,
    starting_price_cents: Number.isNaN(price) ? d.price : price,
    minimum_cents: minimum !== null && Number.isNaN(minimum) ? d.minimum : minimum,
    price_display_en: d.price_display_en,
    price_display_es: d.price_display_es,
    price_unit_en: d.price_unit_en,
    price_unit_es: d.price_unit_es,
    price_note_en: d.price_note_en,
    price_note_es: d.price_note_es,
    name_en: d.name_en,
    name_es: d.name_es,
    description_en: d.description_en,
    description_es: d.description_es,
    included_en: toLines(d.included_en),
    included_es: toLines(d.included_es),
    raises_en: toLines(d.raises_en),
    raises_es: toLines(d.raises_es),
    seo_title_en: d.seo_title_en,
    seo_title_es: d.seo_title_es,
    seo_description_en: d.seo_description_en,
    seo_description_es: d.seo_description_es,
    seo_keywords: toLines(d.seo_keywords),
    faq: d.faq,
  };
}

async function patchService(slug: string, body: unknown): Promise<{ ok: true; row: HomeServiceRow } | { ok: false; error: string; fieldErrors: FieldErrors }> {
  const res = await fetch(`/api/admin/home-services/${slug}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, row: data.service as HomeServiceRow };
  return { ok: false, error: data.error || `Save failed (${res.status})`, fieldErrors: data.fieldErrors ?? {} };
}

export default function ServicesPricesEditor() {
  const [rows, setRows] = useState<HomeServiceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    loadServiceRows().then(setRows).catch((err: Error) => setError(err.message));
  }, []);

  const replaceRow = (row: HomeServiceRow) => {
    setRows((prev) => {
      const next = (prev ?? []).map((r) => (r.slug === row.slug ? row : r));
      refreshServiceRows(next);
      return next;
    });
  };

  async function toggleActive(row: HomeServiceRow, active: boolean) {
    setToggling(row.slug);
    const result = await patchService(row.slug, { active });
    setToggling(null);
    if (result.ok === false) {
      toast({ title: 'Could not change it', description: result.error, variant: 'destructive' });
      return;
    }
    replaceRow(result.row);
    toast({ title: `${row.name_en} is now ${active ? 'on' : 'off'}`, description: active ? 'Back on /home-services and in the sitemap.' : 'Gone from /home-services and the sitemap; its page returns 404.' });
  }

  const row = editing ? rows?.find((r) => r.slug === editing) : undefined;
  if (row) return <ServiceForm key={row.slug} row={row} onBack={() => setEditing(null)} onSaved={replaceRow} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Services &amp; Prices</CardTitle>
        <CardDescription>
          The seven home services on /home-services: names, prices and every line of copy, in English and Spanish. A save is live on the next page load.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {!rows && !error && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading services</p>
        )}
        {rows && (
          <ul className="divide-y rounded-md border" data-testid="catalog-list">
            {rows.map((r) => (
              <li key={r.slug} className="flex flex-wrap items-center gap-3 p-3" data-testid="catalog-row" data-slug={r.slug}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.name_en}</p>
                  <p className="text-xs text-muted-foreground">{r.name_es} · /home-services/{r.slug}</p>
                </div>
                <span className="w-28 text-right font-semibold tabular-nums" data-testid="catalog-price">{r.price_display_en}</span>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={r.active}
                    disabled={toggling === r.slug}
                    onCheckedChange={(v) => toggleActive(r, v)}
                    aria-label={`${r.name_en} active`}
                    data-testid="catalog-active"
                  />
                  {r.active ? <Badge variant="outline" className="border-green-300 bg-green-50 text-green-900">On</Badge> : <Badge variant="outline">Off</Badge>}
                </label>
                <Button size="sm" variant="outline" onClick={() => setEditing(r.slug)} aria-label={`Edit ${r.name_en}`}>
                  <Pencil className="mr-1 h-4 w-4" /> Edit
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p id={`${id}-error`} className="mt-1 text-xs font-medium text-red-700" data-testid={`error-${id}`}>{message}</p>;
}

function Counter({ value, max }: { value: string; max: number }) {
  const over = value.length > max;
  return <span className={`text-xs tabular-nums ${over ? 'font-semibold text-red-700' : 'text-muted-foreground'}`}>{value.length}/{max}</span>;
}

function ServiceForm({ row, onBack, onSaved }: { row: HomeServiceRow; onBack: () => void; onSaved: (row: HomeServiceRow) => void }) {
  const [saved, setSaved] = useState<HomeServiceRow>(row);
  const [draft, setDraft] = useState<Draft>(() => draftOf(row));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  /** A new starting price carries into the display lines wherever they quote the old amount. */
  function setPrice(value: string) {
    setDraft((d) => {
      const before = centsOf(d.price);
      const after = centsOf(value);
      if (Number.isNaN(before) || Number.isNaN(after) || before === after) return { ...d, price: value };
      const from = formatPrice(before);
      const to = formatPrice(after);
      return {
        ...d,
        price: value,
        price_display_en: d.price_display_en.split(from).join(to),
        price_display_es: d.price_display_es.split(from).join(to),
      };
    });
  }

  /** Prose that still quotes the saved price after the price was changed. */
  const staleFields = useMemo(() => {
    const now = centsOf(draft.price);
    if (Number.isNaN(now) || now === saved.starting_price_cents) return [];
    const old = formatPrice(saved.starting_price_cents);
    const checks: Array<[string, string]> = [
      ['English price display', draft.price_display_en],
      ['Spanish price display', draft.price_display_es],
      ['English description', draft.description_en],
      ['Spanish description', draft.description_es],
      ['English SEO title', draft.seo_title_en],
      ['Spanish SEO title', draft.seo_title_es],
      ['English SEO description', draft.seo_description_en],
      ['Spanish SEO description', draft.seo_description_es],
      ...draft.faq.flatMap((item, i): Array<[string, string]> => [
        [`FAQ ${i + 1} English answer`, item.a.en],
        [`FAQ ${i + 1} Spanish answer`, item.a.es],
      ]),
    ];
    // "$299" must not match inside "$2,995"; the amount ends at a non-digit.
    const quote = new RegExp(`${old.replace(/[$.,]/g, (c) => `\\${c}`)}(?![\\d,.]\\d|\\d)`);
    return checks.filter(([, text]) => quote.test(text)).map(([label]) => label);
  }, [draft, saved.starting_price_cents]);

  async function save() {
    setSaving(true);
    setFormError(null);
    const result = await patchService(row.slug, bodyOf(draft));
    setSaving(false);
    if (result.ok === false) {
      setErrors(result.fieldErrors);
      setFormError(result.error);
      // The message sits by the Save button; take the admin to the first field it is about.
      requestAnimationFrame(() => {
        const first = document.querySelector<HTMLElement>('[data-testid=catalog-form] [aria-invalid=true]');
        // Focus first: a focus() during the site's smooth scroll cancels the scroll.
        first?.focus({ preventScroll: true });
        first?.scrollIntoView({ block: 'center' });
      });
      return;
    }
    setErrors({});
    setSaved(result.row);
    setDraft(draftOf(result.row));
    setSavedAt(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
    onSaved(result.row);
    toast({ title: `${result.row.name_en} saved`, description: 'Live on /home-services on the next page load.' });
  }

  const err = (key: string) => errors[key];
  const aria = (key: string) => ({ 'aria-invalid': Boolean(err(key)), 'aria-describedby': err(key) ? `${key}-error` : undefined });

  /** One English and Spanish pair of text inputs (or textareas). */
  const pair = (label: string, base: string, opts: { area?: boolean; rows?: number; max?: number; hint?: string } = {}) => (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">{label}</legend>
      {opts.hint && <p className="text-xs text-muted-foreground">{opts.hint}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {(['en', 'es'] as const).map((lang) => {
          const key = `${base}_${lang}` as keyof Draft;
          const value = draft[key] as string;
          const id = `${base}_${lang}`;
          const langLabel = lang === 'en' ? 'English' : 'Spanish';
          return (
            <div key={lang}>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor={id} className="text-xs font-medium">{langLabel} {label.toLowerCase()}</label>
                {opts.max && <Counter value={value} max={opts.max} />}
              </div>
              {opts.area ? (
                <Textarea id={id} rows={opts.rows ?? 3} className={INVALID} value={value} onChange={(e) => set(key, e.target.value as never)} {...aria(id)} />
              ) : (
                <Input id={id} className={INVALID} value={value} onChange={(e) => set(key, e.target.value as never)} {...aria(id)} />
              )}
              <FieldError id={id} message={err(id)} />
            </div>
          );
        })}
      </div>
    </fieldset>
  );

  const setFaq = (i: number, part: 'q' | 'a', lang: 'en' | 'es', value: string) =>
    setDraft((d) => ({ ...d, faq: d.faq.map((item, j) => (j === i ? { ...item, [part]: { ...item[part], [lang]: value } } : item)) }));

  return (
    <Card data-testid="catalog-form" data-slug={row.slug}>
      <CardHeader>
        <Button variant="ghost" size="sm" className="mb-2 w-fit" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> All services
        </Button>
        <CardTitle>{saved.name_en}</CardTitle>
        <CardDescription>
          /home-services/{row.slug}
          {saved.updated_at && ` · last saved ${new Date(saved.updated_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-start gap-6">
          <div>
            <label htmlFor="starting_price" className="mb-1 block text-sm font-semibold">Starting price (USD)</label>
            <Input id="starting_price" inputMode="decimal" className={`w-40 ${INVALID}`} value={draft.price} onChange={(e) => setPrice(e.target.value)} {...aria('starting_price_cents')} aria-describedby={err('starting_price_cents') ? 'starting_price_cents-error' : 'starting_price-hint'} />
            <p id="starting_price-hint" className="mt-1 text-xs text-muted-foreground">For a per-unit price, the unit price.</p>
            <FieldError id="starting_price_cents" message={err('starting_price_cents')} />
          </div>
          <div>
            <label htmlFor="minimum_price" className="mb-1 block text-sm font-semibold">Job minimum (USD, optional)</label>
            <Input id="minimum_price" inputMode="decimal" className={`w-40 ${INVALID}`} value={draft.minimum} onChange={(e) => set('minimum', e.target.value)} {...aria('minimum_cents')} />
            <FieldError id="minimum_cents" message={err('minimum_cents')} />
          </div>
          <label className="flex min-h-10 items-center gap-2 pt-7 text-sm font-semibold">
            <Switch checked={draft.active} onCheckedChange={(v) => set('active', v)} aria-label="Active" />
            {draft.active ? 'On: shown on the site' : 'Off: hidden, its page returns 404'}
          </label>
        </div>

        {staleFields.length > 0 && (
          <p className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" data-testid="catalog-stale-price">
            <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              The old price {formatPrice(saved.starting_price_cents)} still appears in: {staleFields.join(', ')}. Update the wording before you save, or the page will quote two prices.
            </span>
          </p>
        )}

        {pair('Name', 'name', { max: 80 })}
        {pair('Price display', 'price_display', { max: 40, hint: 'The price as the card shows it, for example $299 or $2.95 / sq ft.' })}
        {pair('Price unit', 'price_unit', { max: 120, hint: 'What the starting price covers, one short line.' })}
        {pair('Price note', 'price_note', { max: 160, hint: 'Optional second price line, for example the two-story price. Leave both empty for none.' })}
        {pair('Description', 'description', { area: true, max: 400 })}
        {pair('Included', 'included', { area: true, rows: 5, hint: 'One item per line. The Spanish list needs one line per English line.' })}
        {pair('Raises the price', 'raises', { area: true, rows: 4, hint: 'One item per line. The Spanish list needs one line per English line.' })}
        {pair('SEO title', 'seo_title', { max: 60, hint: 'The browser tab and search result title. " | La Vaca" is added when it still fits.' })}
        {pair('SEO description', 'seo_description', { area: true, max: 160, hint: 'The search result snippet. Lead with the cost and the counties.' })}

        <div>
          <label htmlFor="seo_keywords" className="mb-1 block text-sm font-semibold">Keywords</label>
          <p className="mb-1 text-xs text-muted-foreground">One per line, up to 10.</p>
          <Textarea id="seo_keywords" rows={5} className={INVALID} value={draft.seo_keywords} onChange={(e) => set('seo_keywords', e.target.value)} {...aria('seo_keywords')} />
          <FieldError id="seo_keywords" message={err('seo_keywords')} />
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">FAQ</legend>
          {draft.faq.map((item, i) => (
            <div key={i} className="space-y-2 rounded-md border p-3" data-testid="catalog-faq-item">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Question {i + 1}</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => set('faq', draft.faq.filter((_, j) => j !== i))} aria-label={`Remove question ${i + 1}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {(['en', 'es'] as const).map((lang) => (
                  <div key={lang} className="space-y-2">
                    <label htmlFor={`faq-${i}-q-${lang}`} className="block text-xs font-medium">{lang === 'en' ? 'English' : 'Spanish'} question</label>
                    <Input id={`faq-${i}-q-${lang}`} value={item.q[lang]} onChange={(e) => setFaq(i, 'q', lang, e.target.value)} />
                    <label htmlFor={`faq-${i}-a-${lang}`} className="block text-xs font-medium">{lang === 'en' ? 'English' : 'Spanish'} answer</label>
                    <Textarea id={`faq-${i}-a-${lang}`} rows={4} value={item.a[lang]} onChange={(e) => setFaq(i, 'a', lang, e.target.value)} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <FieldError id="faq" message={err('faq')} />
          <Button type="button" size="sm" variant="outline" onClick={() => set('faq', [...draft.faq, { q: { en: '', es: '' }, a: { en: '', es: '' } }])}>
            <Plus className="mr-1 h-4 w-4" /> Add a question
          </Button>
        </fieldset>

        {formError && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-800" data-testid="catalog-form-error">{formError}</p>}

        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <Button onClick={save} disabled={saving} data-testid="catalog-save">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
          <Button variant="outline" onClick={() => { setDraft(draftOf(saved)); setErrors({}); setFormError(null); }} disabled={saving}>
            Discard changes
          </Button>
          {savedAt && <span className="text-sm text-green-800" data-testid="catalog-saved">Saved at {savedAt}. Live on the next page load.</span>}
        </div>
      </CardContent>
    </Card>
  );
}
