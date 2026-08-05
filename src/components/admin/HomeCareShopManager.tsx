'use client';

/**
 * Customers -> Home Care Shop (DIY Kit, slice 1).
 *
 * TASK FIRST, by owner decision D4. The screen opens on the maintenance catalog,
 * not on a product form: you pick the item you want to stock and fill it, rather
 * than loading a product and then hunting for which of 54 tasks it belongs to.
 *
 * Pro-only tasks are listed and visibly LOCKED rather than hidden (D5), so the
 * exclusion reads as a decision instead of looking like a task that went
 * missing. Nothing is ever stocked automatically: an eligible task shows an
 * empty shelf until somebody puts something on it.
 *
 * Two ways to add, because the owner has both: paste an Amazon link (the route
 * fills in title, brand and photos), or pick something already in the library -
 * which LINKS the existing row rather than copying it, so one fix travels to
 * every shelf the product sits on.
 *
 * House rule honored throughout: globals.css enforces a 44px minimum on every
 * button, and the controls that rule does not reach - the search and paste
 * fields - are sized to it directly.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  Check, ChevronLeft, ChevronRight, ExternalLink, Image as ImageIcon, Info, Library, Link2, Loader2, Lock,
  Package, Plus, RefreshCw, Search, Trash2, Upload, X,
} from 'lucide-react';
import {
  PRICE_BANDS, priceBandLabel, productImageUrl, amazonProductUrl,
  type AdminProduct, type PriceBand, type ProductCategory,
} from '@/lib/homecare/products';

interface ShopTaskRow {
  key: string;
  title: string;
  diy_or_pro: string;
  seasons: string[];
  frequency: string;
  eligible: boolean;
  product_count: number;
}

const SEASONS = ['spring', 'summer', 'fall', 'winter'] as const;
const CATEGORIES: ReadonlyArray<{ value: ProductCategory; label: string }> = [
  { value: 'tool', label: 'Tool' },
  { value: 'consumable', label: 'Consumable' },
  { value: 'safety', label: 'Safety' },
  { value: 'monitor', label: 'Monitor / meter' },
];

/** The draft a paste produces, before it is saved as a product. */
interface Draft {
  asin: string;
  display_name: string;
  brand: string;
  pitch: string;
  images: string[];
  image_source: string | null;
  price_band: PriceBand;
  category: ProductCategory | '';
  task_keys: string[];
  reason?: string;
}

export function HomeCareShopManager() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<ShopTaskRow[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);

  const [view, setView] = useState<'tasks' | 'library'>('tasks');
  const [search, setSearch] = useState('');
  const [season, setSeason] = useState<string>('all');
  const [openTask, setOpenTask] = useState<string | null>(null);

  const [addMode, setAddMode] = useState<'paste' | 'library'>('paste');
  const [pasteUrl, setPasteUrl] = useState('');
  const [parsing, setParsing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/home-care/products');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Could not load the shop.');
      setTasks(data.tasks ?? []);
      setProducts(data.products ?? []);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load the shop.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const productsByTask = useMemo(() => {
    const map = new Map<string, AdminProduct[]>();
    for (const p of products) {
      for (const key of p.task_keys) {
        const list = map.get(key);
        if (list) list.push(p);
        else map.set(key, [p]);
      }
    }
    return map;
  }, [products]);

  const visibleTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (season !== 'all' && !t.seasons.includes(season)) return false;
      if (!q) return true;
      return t.title.toLowerCase().includes(q) || t.key.toLowerCase().includes(q);
    });
  }, [tasks, search, season]);

  const eligibleTasks = useMemo(() => tasks.filter((t) => t.eligible), [tasks]);
  const stockedCount = useMemo(() => tasks.filter((t) => t.product_count > 0).length, [tasks]);
  const activeTask = openTask ? tasks.find((t) => t.key === openTask) ?? null : null;
  const shelf = openTask ? productsByTask.get(openTask) ?? [] : [];

  const resetAdd = () => { setDraft(null); setPasteUrl(''); setAddMode('paste'); };

  const parse = async () => {
    if (!pasteUrl.trim() || !openTask) return;
    setParsing(true);
    try {
      const res = await fetch('/api/admin/home-care/parse-amazon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: pasteUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Could not read that link.');

      if (data.existing) {
        // Already stocked somewhere. Linking beats a second row: one product,
        // many shelves, one place to fix a dead ASIN later.
        await attachExisting(data.existing.id);
        toast({ title: 'Already in your library', description: `"${data.existing.display_name}" is now on this item too.` });
        resetAdd();
        return;
      }

      setDraft({
        asin: data.asin,
        display_name: (data.title ?? '').slice(0, 120),
        brand: data.brand ?? '',
        pitch: '',
        images: data.images ?? [],
        image_source: data.imageSource ?? null,
        price_band: 'under_25',
        category: '',
        task_keys: [openTask],
        reason: data.reason,
      });
    } catch (err) {
      toast({ variant: 'destructive', title: 'That link did not work', description: err instanceof Error ? err.message : '' });
    } finally {
      setParsing(false);
    }
  };

  const uploadImage = async (file: File) => {
    if (!draft) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('asin', draft.asin);
      form.append('file', file);
      const res = await fetch('/api/admin/home-care/product-image', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Upload failed.');
      setDraft({ ...draft, images: [...draft.images, data.path], image_source: 'manual', reason: undefined });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Upload failed', description: err instanceof Error ? err.message : '' });
    } finally {
      setUploading(false);
    }
  };

  const saveDraft = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/home-care/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asin: draft.asin,
          display_name: draft.display_name,
          brand: draft.brand || null,
          pitch: draft.pitch || null,
          images: draft.images,
          image_source: draft.image_source,
          price_band: draft.price_band,
          category: draft.category || null,
          task_keys: draft.task_keys,
          active: draft.images.length > 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Could not save.');
      toast({
        title: draft.images.length > 0 ? 'Added to the shelf' : 'Saved as a draft',
        description: draft.images.length > 0 ? undefined : 'It stays hidden from members until it has a photo.',
      });
      resetAdd();
      await load();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Not saved', description: err instanceof Error ? err.message : '' });
    } finally {
      setSaving(false);
    }
  };

  /** Link an existing library product onto the open task, keeping its other shelves. */
  const attachExisting = async (productId: string) => {
    if (!openTask) return;
    const product = products.find((p) => p.id === productId);
    const next = Array.from(new Set([...(product?.task_keys ?? []), openTask]));
    const res = await fetch(`/api/admin/home-care/products/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_keys: next }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error ?? 'Could not add it to this item.');
    }
    await load();
  };

  const detach = async (product: AdminProduct) => {
    if (!openTask) return;
    const next = product.task_keys.filter((k) => k !== openTask);
    try {
      const res = await fetch(`/api/admin/home-care/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_keys: next }),
      });
      if (!res.ok) throw new Error('Could not remove it.');
      toast({
        title: 'Off this shelf',
        description: next.length > 0 ? `Still shown on ${next.length} other item${next.length === 1 ? '' : 's'}.` : 'Still in your library.',
      });
      await load();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Not removed', description: err instanceof Error ? err.message : '' });
    }
  };

  const toggleActive = async (product: AdminProduct) => {
    try {
      const res = await fetch(`/api/admin/home-care/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !product.active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Could not change it.');
      await load();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Not changed', description: err instanceof Error ? err.message : '' });
    }
  };

  const remove = async (product: AdminProduct) => {
    if (!window.confirm(`Remove "${product.display_name}" from the library and every shelf it is on?`)) return;
    try {
      const res = await fetch(`/api/admin/home-care/products/${product.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not remove it.');
      toast({ title: 'Removed' });
      await load();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Not removed', description: err instanceof Error ? err.message : '' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading the shop...
      </div>
    );
  }

  if (loadError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Home Care Shop</CardTitle>
          <CardDescription>{loadError}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4 mr-2" /> Try again</Button>
        </CardContent>
      </Card>
    );
  }

  // ---------- one task's shelf ----------
  if (activeTask) {
    const otherEligible = eligibleTasks.filter((t) => t.key !== activeTask.key);
    const libraryOptions = products.filter((p) => !p.task_keys.includes(activeTask.key));
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" onClick={() => { setOpenTask(null); resetAdd(); }}>
            <ChevronLeft className="h-4 w-4 mr-1" /> All items
          </Button>
          <h2 className="text-lg font-bold">{activeTask.title}</h2>
          <Badge variant="secondary">{activeTask.diy_or_pro === 'diy' ? 'DIY' : 'DIY / PRO'}</Badge>
          <span className="text-xs text-muted-foreground font-mono">{activeTask.key}</span>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">On this item</CardTitle>
            <CardDescription>
              {shelf.length === 0
                ? 'Nothing yet. Members see no shelf on this task until you add something.'
                : `${shelf.length} product${shelf.length === 1 ? '' : 's'}, shown in this order.`}
            </CardDescription>
          </CardHeader>
          {shelf.length > 0 && (
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {shelf.map((p) => (
                <div key={p.id} className="flex gap-3 items-start border rounded-xl p-3">
                  <ProductThumb product={p} />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm leading-tight">{p.display_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {priceBandLabel(p.price_band)}
                      {p.task_keys.length > 1 && ` · also on ${p.task_keys.length - 1} other item${p.task_keys.length === 2 ? '' : 's'}`}
                      {!p.active && ' · draft'}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" aria-label={`Remove ${p.display_name} from this item`} onClick={() => detach(p)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex gap-2 flex-wrap">
              <Button variant={addMode === 'paste' ? 'default' : 'outline'} onClick={() => setAddMode('paste')}>
                <Link2 className="h-4 w-4 mr-2" /> Paste an Amazon link
              </Button>
              <Button variant={addMode === 'library' ? 'default' : 'outline'} onClick={() => setAddMode('library')}>
                <Library className="h-4 w-4 mr-2" /> Pick from my library ({libraryOptions.length})
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {addMode === 'paste' && !draft && (
              <div className="space-y-2">
                <div className="flex gap-2 flex-wrap">
                  <Input
                    value={pasteUrl}
                    onChange={(e) => setPasteUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') parse(); }}
                    placeholder="https://www.amazon.com/dp/..."
                    className="flex-1 min-w-[240px] min-h-[44px]"
                    aria-label="Amazon product URL"
                  />
                  <Button onClick={parse} disabled={parsing || !pasteUrl.trim()}>
                    {parsing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                    {parsing ? 'Reading...' : 'Parse'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Share link, search-result link or a bare ASIN all work. We keep the ASIN and pull the title and photos.
                </p>
              </div>
            )}

            {addMode === 'paste' && draft && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono">{draft.asin}</Badge>
                  {draft.images.length > 0
                    ? <Badge className="bg-emerald-600">{draft.images.length} photo{draft.images.length === 1 ? '' : 's'} pulled</Badge>
                    : <Badge variant="destructive">photo needed</Badge>}
                  <a
                    href={amazonProductUrl(draft.asin)}
                    target="_blank"
                    rel="sponsored nofollow noopener"
                    className="text-xs font-bold text-primary inline-flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" /> Open on Amazon
                  </a>
                  <Button variant="ghost" size="sm" className="ml-auto" onClick={resetAdd}>Cancel</Button>
                </div>

                {draft.reason && (
                  <p className="text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2">{draft.reason}</p>
                )}

                <div className="flex gap-2 flex-wrap items-center">
                  {draft.images.map((path, i) => (
                    <div key={path} className={`relative h-16 w-16 rounded-lg border overflow-hidden ${i === 0 ? 'ring-2 ring-primary' : ''}`}>
                      <ProductImage path={path} alt={`Photo ${i + 1}`} />
                    </div>
                  ))}
                  <label className="inline-flex">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); }}
                    />
                    <span className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold cursor-pointer min-h-[44px]">
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {draft.images.length > 0 ? 'Add another' : 'Upload a photo'}
                    </span>
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Display name
                    <Input
                      value={draft.display_name}
                      onChange={(e) => setDraft({ ...draft, display_name: e.target.value })}
                      className="mt-1 min-h-[44px] font-normal normal-case tracking-normal text-sm"
                      placeholder="Digital hygrometer, 2-pack"
                    />
                  </label>
                  <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Why this one
                    <Input
                      value={draft.pitch}
                      onChange={(e) => setDraft({ ...draft, pitch: e.target.value })}
                      className="mt-1 min-h-[44px] font-normal normal-case tracking-normal text-sm"
                      placeholder="One at each end of the basement."
                    />
                  </label>
                  <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Price band
                    <select
                      value={draft.price_band}
                      onChange={(e) => setDraft({ ...draft, price_band: e.target.value as PriceBand })}
                      className="mt-1 w-full rounded-lg border bg-background px-3 min-h-[44px] text-sm font-normal normal-case tracking-normal"
                    >
                      {PRICE_BANDS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Category
                    <select
                      value={draft.category}
                      onChange={(e) => setDraft({ ...draft, category: e.target.value as ProductCategory | '' })}
                      className="mt-1 w-full rounded-lg border bg-background px-3 min-h-[44px] text-sm font-normal normal-case tracking-normal"
                    >
                      <option value="">Not set</option>
                      {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </label>
                </div>

                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Also show on these items</div>
                  <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                    {otherEligible.slice(0, 40).map((t) => {
                      const on = draft.task_keys.includes(t.key);
                      return (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => setDraft({
                            ...draft,
                            task_keys: on ? draft.task_keys.filter((k) => k !== t.key) : [...draft.task_keys, t.key],
                          })}
                          className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold ${on ? 'bg-primary/10 border-primary text-primary' : 'bg-muted/40'}`}
                        >
                          {on ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                          {t.title}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Button onClick={saveDraft} disabled={saving || !draft.display_name.trim()}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  {draft.images.length > 0 ? 'Add to this item' : 'Save as draft'}
                </Button>
              </div>
            )}

            {addMode === 'library' && (
              <div className="grid gap-2 sm:grid-cols-2">
                {libraryOptions.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nothing else in the library yet. Paste a link to add your first product.</p>
                )}
                {libraryOptions.map((p) => (
                  <div key={p.id} className="flex gap-3 items-center border rounded-xl p-3">
                    <ProductThumb product={p} />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm leading-tight">{p.display_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.task_keys.length === 0 ? 'not on any item yet' : `on ${p.task_keys.length} item${p.task_keys.length === 1 ? '' : 's'}`}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          await attachExisting(p.id);
                          toast({ title: 'Added', description: `"${p.display_name}" is on this item now.` });
                        } catch (err) {
                          toast({ variant: 'destructive', title: 'Not added', description: err instanceof Error ? err.message : '' });
                        }
                      }}
                    >
                      Add
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------- the task list, and the library ----------
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Package className="h-5 w-5" /> Home Care Shop</h2>
          <p className="text-sm text-muted-foreground">
            {eligibleTasks.length} of {tasks.length} tasks can carry a DIY shelf. {stockedCount} stocked so far.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant={view === 'tasks' ? 'default' : 'outline'} onClick={() => setView('tasks')}>By maintenance item</Button>
          <Button variant={view === 'library' ? 'default' : 'outline'} onClick={() => setView('library')}>Product library ({products.length})</Button>
        </div>
      </div>

      <PaApiReminder productCount={products.length} />

      {view === 'tasks' && (
        <>
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${tasks.length} tasks...`}
                className="pl-9 min-h-[44px]"
                aria-label="Search maintenance tasks"
              />
            </div>
            <select
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className="rounded-lg border bg-background px-3 min-h-[44px] text-sm"
              aria-label="Filter by season"
            >
              <option value="all">All seasons</option>
              {SEASONS.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>

          <div className="border rounded-xl overflow-hidden divide-y">
            {visibleTasks.map((t) => (
              <button
                key={t.key}
                type="button"
                disabled={!t.eligible}
                onClick={() => { setOpenTask(t.key); resetAdd(); }}
                className={`w-full flex items-center gap-3 px-3 py-3 text-left ${t.eligible ? 'hover:bg-muted/50' : 'opacity-60 cursor-not-allowed'}`}
              >
                <span className={`text-[10px] font-extrabold shrink-0 ${t.diy_or_pro === 'pro' ? 'text-amber-700' : t.diy_or_pro === 'diy' ? 'text-emerald-700' : 'text-slate-500'}`}>
                  {t.diy_or_pro === 'pro' ? 'PRO' : t.diy_or_pro === 'diy' ? 'DIY' : 'DIY / PRO'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-sm leading-tight">{t.title}</span>
                  <span className="block text-xs text-muted-foreground font-mono truncate">{t.key}</span>
                </span>
                {t.eligible ? (
                  <>
                    <span className={`text-xs font-bold whitespace-nowrap ${t.product_count > 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {t.product_count > 0 ? `${t.product_count} item${t.product_count === 1 ? '' : 's'}` : 'Add items'}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </>
                ) : (
                  <span className="text-xs font-bold text-muted-foreground inline-flex items-center gap-1 whitespace-nowrap">
                    <Lock className="h-3.5 w-3.5" /> We do this one
                  </span>
                )}
              </button>
            ))}
            {visibleTasks.length === 0 && <p className="p-4 text-sm text-muted-foreground">No task matches that.</p>}
          </div>
        </>
      )}

      {view === 'library' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {products.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nothing stocked yet. Open a maintenance item and paste an Amazon link.
            </p>
          )}
          {products.map((p) => (
            <div key={p.id} className="border rounded-xl p-3 flex gap-3">
              <ProductThumb product={p} />
              <div className="min-w-0 flex-1">
                <div className="font-bold text-sm leading-tight">{p.display_name}</div>
                <div className="text-xs text-muted-foreground font-mono">{p.asin}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {priceBandLabel(p.price_band)} · {p.task_keys.length === 0 ? 'on no item' : `on ${p.task_keys.length} item${p.task_keys.length === 1 ? '' : 's'}`}
                </div>
                <div className="flex gap-1 mt-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => toggleActive(p)}>
                    {p.active ? 'Live' : 'Draft'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(p)} aria-label={`Remove ${p.display_name}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The standing reminder to move photos onto Amazon's API.
 *
 * Amazon blocks the listing fetch from a server, so photos are uploaded by hand
 * today (owner, 5 Aug 2026: "let's do it manually in the meantime but put a
 * reminder so I don't forget to then use the API at some point"). This lives on
 * the shop screen rather than in a doc because this is the screen where the
 * manual work is felt - the reminder should arrive while the cost of not having
 * the API is being paid, not in a file nobody opens.
 *
 * It gets more insistent as the library grows, since the case for the API is
 * exactly "how many photos have I uploaded by hand". Product Advertising API
 * access opens after the Associates account refers its first qualifying sales,
 * which is why the trigger to act on this is a sale, not a date.
 */
function PaApiReminder({ productCount }: { productCount: number }) {
  const earned = productCount >= 10;
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${earned ? 'border-amber-300 bg-amber-50' : 'border-border bg-muted/40'}`}>
      <div className="flex gap-2 items-start">
        <Info className={`h-4 w-4 mt-0.5 shrink-0 ${earned ? 'text-amber-700' : 'text-muted-foreground'}`} />
        <div className="min-w-0">
          <b className="font-bold">Photos are manual for now.</b>{' '}
          <span className="text-muted-foreground">
            Amazon blocks automatic photo pulls from a server. Once the Associates account has referred its first
            qualifying sales, Product Advertising API access opens and photos, titles and stock status come through it
            instead - no uploads, and the link checker gets a real answer about what is still buyable.
            {earned && ` You have uploaded photos for ${productCount} products by hand. Worth checking whether the API is available yet.`}
          </span>
        </div>
      </div>
    </div>
  );
}

function ProductImage({ path, alt }: { path: string; alt: string }) {
  const url = productImageUrl(path);
  if (!url) return <div className="h-full w-full bg-muted" />;
  return <Image src={url} alt={alt} fill sizes="64px" className="object-contain" />;
}

function ProductThumb({ product }: { product: AdminProduct }) {
  const path = product.images[0];
  return (
    <div className="relative h-12 w-12 shrink-0 rounded-lg border overflow-hidden bg-muted/40 flex items-center justify-center">
      {path
        ? <ProductImage path={path} alt={product.display_name} />
        : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
    </div>
  );
}

export default HomeCareShopManager;
