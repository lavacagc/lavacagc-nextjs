'use client';

/**
 * Portfolio Manager: Drafts first (one-click Publish / Publish + feature), the
 * photos waiting in storage, then every published and archived project.
 *
 * Reads and the draft lifecycle go through /api/admin/projects/* (service key);
 * only the homepage reorder and the bulk Feature / Archive still write from the
 * browser, as they did before, and those set `status` alongside `active`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive, ArrowUpDown, Calendar, Copy, DollarSign, Edit, Eye, EyeOff, Grid, GripVertical, List, Loader2,
  MapPin, MoreHorizontal, Plus, Rocket, Save, Search, Star, Trash2, X,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AdminCheckbox } from '@/components/admin/ui/AdminCheckbox';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { projectsApi } from './projects/api';
import { DraftPhotosPanel } from './projects/DraftPhotosPanel';
import { MediaThumb } from './projects/MediaThumb';
import { StatusBadge } from './projects/StatusBadge';
import type { ProjectListItem } from './projects/types';

interface PortfolioManagerProps {
  onNewProject: (preloadUrls?: string[]) => void;
  onEditProject: (id: string) => void;
}

function coverOf(p: ProjectListItem): { url: string; type: string | null } | null {
  const imgs = [...(p.project_images ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const img = imgs.find((i) => i.is_featured) ?? imgs.find((i) => i.media_type !== 'video') ?? imgs[0];
  return img ? { url: img.image_url, type: img.media_type } : null;
}

function normalize(row: Record<string, unknown>): ProjectListItem {
  const p = row as unknown as ProjectListItem;
  const images = Array.isArray(p.project_images) ? p.project_images : p.project_images ? [p.project_images] : [];
  const status = (p.status ?? (p.active ? 'published' : 'archived')) as ProjectListItem['status'];
  return { ...p, project_images: images, status, service_types: p.service_types ?? [] };
}

export function PortfolioManager({ onNewProject, onEditProject }: PortfolioManagerProps) {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [selected, setSelected] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [reorderList, setReorderList] = useState<ProjectListItem[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isSavingOrder, setIsSavingOrder] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const { projects: rows } = await projectsApi.list();
      setProjects((rows as Record<string, unknown>[]).map(normalize));
    } catch (err) {
      toast({ title: 'Could not load projects', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  const drafts = useMemo(
    () => projects.filter((p) => p.status === 'draft').sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [projects],
  );

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase();
    const list = projects.filter((p) => {
      if (statusFilter === 'draft') { if (p.status !== 'draft') return false; }
      else if (p.status === 'draft') return false;
      if (statusFilter === 'published' && p.status !== 'published') return false;
      if (statusFilter === 'featured' && !(p.featured && p.status === 'published')) return false;
      if (statusFilter === 'archived' && p.status !== 'archived') return false;
      if (serviceFilter !== 'all' && !p.service_types.includes(serviceFilter)) return false;
      if (locationFilter !== 'all' && p.location !== locationFilter) return false;
      if (q && !(p.title.toLowerCase().includes(q) || p.location.toLowerCase().includes(q)
        || p.service_types.some((s) => s.toLowerCase().includes(q)))) return false;
      return true;
    });
    return list.sort((a, b) => {
      switch (sortBy) {
        case 'title': return a.title.localeCompare(b.title);
        case 'location': return a.location.localeCompare(b.location);
        case 'date_completed': return (b.date_completed ?? '').localeCompare(a.date_completed ?? '');
        default: return b.created_at.localeCompare(a.created_at);
      }
    });
  }, [projects, searchTerm, serviceFilter, locationFilter, statusFilter, sortBy]);

  // ---- lifecycle actions ---------------------------------------------------

  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key);
    try {
      await action();
      toast({ title: success });
      await loadProjects();
    } catch (err) {
      toast({ title: 'That did not work', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const publish = (p: ProjectListItem, feature: boolean) =>
    run(`${p.id}:${feature ? 'feature' : 'publish'}`, () => projectsApi.publish(p.id, feature),
      feature ? `"${p.title}" is live and on the homepage` : `"${p.title}" is live`);

  const unpublish = (p: ProjectListItem) =>
    run(`${p.id}:unpublish`, () => projectsApi.unpublish(p.id), `"${p.title}" is back in Drafts`);

  const remove = (p: ProjectListItem) => {
    if (!confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    void run(`${p.id}:delete`, () => projectsApi.remove(p.id), 'Project deleted');
  };

  /** A full copy, media included, as a new draft. */
  const duplicate = (p: ProjectListItem) =>
    run(`${p.id}:duplicate`, async () => {
      const { project } = await projectsApi.get(p.id);
      const imgs = (Array.isArray(project.project_images) ? project.project_images : []) as Array<Record<string, unknown>>;
      const pick = (k: string) => (project[k] === null ? undefined : project[k]);
      await projectsApi.create({
        title: `${p.title} (Copy)`,
        location: p.location,
        service_types: p.service_types,
        client_first_name: pick('client_first_name'),
        date_completed: typeof project.date_completed === 'string' ? project.date_completed.slice(0, 7) : null,
        budget_range: pick('budget_range'),
        duration: pick('duration'),
        challenge: pick('challenge'),
        solution: pick('solution'),
        materials_used: pick('materials_used') ?? [],
        special_features: pick('special_features') ?? [],
        testimonial_text: pick('testimonial_text'),
        testimonial_rating: pick('testimonial_rating'),
        focus_keyword: pick('focus_keyword'),
        images: imgs.map((r, i) => ({
          url: r.image_url,
          media_type: r.media_type === 'video' ? 'video' : 'image',
          category: ['before', 'during', 'after'].includes(String(r.image_category)) ? r.image_category : 'after',
          alt_text: r.alt_text ?? null,
          is_featured: r.is_featured === true,
          sort_order: i,
          pair_key: r.pair_key ?? null,
          caption: r.caption ?? null,
        })),
      });
    }, 'Copied to Drafts');

  const bulk = async (action: 'delete' | 'archive' | 'feature') => {
    if (selected.length === 0) return;
    if (!confirm(`${action[0].toUpperCase()}${action.slice(1)} ${selected.length} project(s)?`)) return;
    await run(`bulk:${action}`, async () => {
      if (action === 'delete') {
        for (const id of selected) await projectsApi.remove(id);
        return;
      }
      const patch = action === 'archive' ? { active: false, status: 'archived' } : { featured: true };
      const { error } = await supabase.from('projects').update(patch).in('id', selected);
      if (error) throw new Error(error.message);
    }, `${selected.length} project(s) updated`);
    setSelected([]);
  };

  // ---- homepage reorder (unchanged behaviour) ------------------------------

  const startReordering = () => {
    setReorderList(projects.filter((p) => p.featured && p.status === 'published').sort((a, b) => a.sort_order - b.sort_order));
    setIsReordering(true);
  };
  const cancelReordering = () => {
    setIsReordering(false);
    setReorderList([]);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };
  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== dropIndex) {
      const updated = [...reorderList];
      const [moved] = updated.splice(draggedIndex, 1);
      updated.splice(dropIndex, 0, moved);
      setReorderList(updated);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };
  const moveProject = (from: number, dir: -1 | 1) => {
    const to = from + dir;
    if (to < 0 || to >= reorderList.length) return;
    const updated = [...reorderList];
    [updated[from], updated[to]] = [updated[to], updated[from]];
    setReorderList(updated);
  };
  const saveOrder = async () => {
    setIsSavingOrder(true);
    try {
      const results = await Promise.all(reorderList.map((p, i) => supabase.from('projects').update({ sort_order: i + 1 }).eq('id', p.id)));
      const failed = results.find((r) => r.error);
      if (failed?.error) throw new Error(failed.error.message);
      toast({ title: 'Order saved' });
      cancelReordering();
      await loadProjects();
    } catch (err) {
      toast({ title: 'Could not save the order', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setIsSavingOrder(false);
    }
  };

  const uniqueServices = [...new Set(projects.flatMap((p) => p.service_types))];
  const uniqueLocations = [...new Set(projects.map((p) => p.location))];
  const liveCount = projects.filter((p) => p.status === 'published').length;
  const featuredCount = projects.filter((p) => p.featured && p.status === 'published').length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
        <span className="sr-only">Loading projects</span>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="portfolio-manager">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Portfolio Manager</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{liveCount} live, {drafts.length} draft{drafts.length === 1 ? '' : 's'}</span>
            <span className="flex items-center gap-1 rounded-md bg-blue-100 px-2 py-0.5 text-blue-800">
              <Star className="h-3 w-3 fill-current" aria-hidden />
              {featuredCount} on homepage
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={startReordering}>
            <ArrowUpDown className="mr-2 h-4 w-4" aria-hidden />
            Reorder
          </Button>
          <Button onClick={() => onNewProject()} data-testid="add-project">
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            Add New Project
          </Button>
        </div>
      </div>

      {/* ---- Drafts ---- */}
      <section aria-labelledby="drafts-heading" className="space-y-3" data-testid="drafts-section">
        <h3 id="drafts-heading" className="text-lg font-semibold">
          Drafts {drafts.length > 0 && <span className="text-muted-foreground">({drafts.length})</span>}
        </h3>
        {drafts.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No drafts. Saved projects land here until you publish them.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {drafts.map((p) => {
              const cover = coverOf(p);
              return (
                <li key={p.id}>
                  <Card className="flex h-full flex-col overflow-hidden" data-testid="draft-card">
                    <div className="relative aspect-video bg-muted">
                      {cover && <MediaThumb src={cover.url} alt={p.title} mediaType={cover.type} sizes="400px" />}
                      <div className="absolute left-2 top-2 flex gap-1">
                        <StatusBadge status="draft" />
                        {p.source === 'api' && <Badge variant="secondary" className="text-xs">From Claude Code</Badge>}
                      </div>
                    </div>
                    <CardContent className="flex flex-1 flex-col gap-3 p-4">
                      <div>
                        <h4 className="font-semibold leading-tight">{p.title}</h4>
                        <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" aria-hidden />{p.location}
                          <span aria-hidden>·</span>
                          {(p.project_images ?? []).length} media
                        </p>
                      </div>
                      <div className="mt-auto grid grid-cols-2 gap-2">
                        <Button size="sm" onClick={() => publish(p, false)} disabled={busy !== null} data-testid="publish-draft">
                          {busy === `${p.id}:publish` ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <Rocket className="mr-1.5 h-4 w-4" aria-hidden />}
                          Publish
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => publish(p, true)} disabled={busy !== null} data-testid="publish-feature-draft">
                          {busy === `${p.id}:feature` ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <Star className="mr-1.5 h-4 w-4" aria-hidden />}
                          Publish + feature
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onEditProject(p.id)} disabled={busy !== null}>
                          <Edit className="mr-1.5 h-4 w-4" aria-hidden />Edit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => remove(p)} disabled={busy !== null} className="text-red-700 hover:text-red-800">
                          <Trash2 className="mr-1.5 h-4 w-4" aria-hidden />Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <DraftPhotosPanel onStart={(urls) => onNewProject(urls)} />

      {/* ---- Reorder ---- */}
      {isReordering && (
        <Card className="border-primary">
          <CardContent className="p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  <ArrowUpDown className="h-5 w-5 text-primary" aria-hidden />Reorder Featured Projects
                </h3>
                <p className="text-sm text-muted-foreground">Drag to set the homepage order. #1 shows first.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={cancelReordering} disabled={isSavingOrder}>
                  <X className="mr-1 h-4 w-4" aria-hidden />Cancel
                </Button>
                <Button size="sm" onClick={saveOrder} disabled={isSavingOrder}>
                  <Save className="mr-1 h-4 w-4" aria-hidden />{isSavingOrder ? 'Saving...' : 'Save Order'}
                </Button>
              </div>
            </div>
            {reorderList.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No featured projects to reorder.</p>
            ) : (
              <div className="space-y-2">
                {reorderList.map((p, index) => {
                  const cover = coverOf(p);
                  return (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={() => setDraggedIndex(index)}
                      onDragOver={(e) => { e.preventDefault(); if (draggedIndex !== null && draggedIndex !== index) setDragOverIndex(index); }}
                      onDrop={(e) => handleDrop(e, index)}
                      onDragEnd={() => { setDraggedIndex(null); setDragOverIndex(null); }}
                      className={cn(
                        'flex cursor-grab items-center gap-3 rounded-lg border bg-background p-3 transition-all active:cursor-grabbing',
                        draggedIndex === index && 'scale-[0.98] opacity-50',
                        dragOverIndex === index ? 'border-2 border-primary bg-primary/5' : 'border-border',
                      )}
                    >
                      <GripVertical className="h-5 w-5 flex-shrink-0 text-muted-foreground" aria-hidden />
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{index + 1}</div>
                      <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded bg-muted">
                        {cover && <MediaThumb src={cover.url} alt={p.title} mediaType={cover.type} sizes="48px" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{p.title}</p>
                        <p className="truncate text-sm text-muted-foreground">{p.location}</p>
                      </div>
                      <div className="flex flex-shrink-0 gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveProject(index, -1)} disabled={index === 0} aria-label="Move up">▲</Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveProject(index, 1)} disabled={index === reorderList.length - 1} aria-label="Move down">▼</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---- All projects ---- */}
      <section aria-labelledby="all-heading" className="space-y-3">
        <h3 id="all-heading" className="text-lg font-semibold">
          {statusFilter === 'draft' ? 'Drafts' : 'Published and archived'}
          <span className="ml-1 text-muted-foreground">({filtered.length})</span>
        </h3>
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 lg:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input placeholder="Search projects..." aria-label="Search projects" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={serviceFilter} onValueChange={setServiceFilter}>
                  <SelectTrigger className="w-40" aria-label="Filter by service"><SelectValue placeholder="Service" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Services</SelectItem>
                    {uniqueServices.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={locationFilter} onValueChange={setLocationFilter}>
                  <SelectTrigger className="w-36" aria-label="Filter by location"><SelectValue placeholder="Location" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    {uniqueLocations.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-36" aria-label="Filter by status" data-testid="status-filter"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="featured">Featured</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-32" aria-label="Sort by"><SelectValue placeholder="Sort by" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created_at">Newest</SelectItem>
                    <SelectItem value="title">Title</SelectItem>
                    <SelectItem value="location">Location</SelectItem>
                    <SelectItem value="date_completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-1 self-start rounded-md border">
                <Button variant={viewMode === 'grid' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('grid')} aria-label="Grid view" aria-pressed={viewMode === 'grid'}>
                  <Grid className="h-4 w-4" aria-hidden />
                </Button>
                <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('list')} aria-label="List view" aria-pressed={viewMode === 'list'}>
                  <List className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {selected.length > 0 && (
          <Alert>
            <AlertDescription>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{selected.length} project(s) selected</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => bulk('feature')}><Star className="mr-1 h-4 w-4" aria-hidden />Feature</Button>
                  <Button size="sm" variant="outline" onClick={() => bulk('archive')}><Archive className="mr-1 h-4 w-4" aria-hidden />Archive</Button>
                  <Button size="sm" variant="destructive" onClick={() => bulk('delete')}><Trash2 className="mr-1 h-4 w-4" aria-hidden />Delete</Button>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {filtered.length === 0 ? (
          <Card>
            <CardContent className="space-y-3 p-8 text-center">
              <h4 className="font-semibold">No projects found</h4>
              <p className="text-sm text-muted-foreground">
                {projects.length === 0 ? 'Add your first project to get started.' : 'Try another filter or search.'}
              </p>
              <Button onClick={() => onNewProject()}><Plus className="mr-2 h-4 w-4" aria-hidden />Add New Project</Button>
            </CardContent>
          </Card>
        ) : (
          <ul className={viewMode === 'grid' ? 'grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3' : 'space-y-4'}>
            {filtered.map((p) => {
              const cover = coverOf(p);
              return (
                <li key={p.id}>
                  <Card className="overflow-hidden" data-testid="project-card">
                    <div className={viewMode === 'list' ? 'flex' : ''}>
                      <div className={cn('relative bg-muted', viewMode === 'list' ? 'w-48 flex-shrink-0' : 'aspect-video')}>
                        {cover ? <MediaThumb src={cover.url} alt={p.title} mediaType={cover.type} sizes="400px" /> : (
                          <div className="flex h-full w-full items-center justify-center"><Grid className="h-8 w-8 text-muted-foreground" aria-hidden /></div>
                        )}
                        <div className="absolute left-2 top-2">
                          <AdminCheckbox
                            checked={selected.includes(p.id)}
                            onCheckedChange={() => setSelected((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id]))}
                            className="bg-white"
                            aria-label={`Select ${p.title}`}
                          />
                        </div>
                        <div className="absolute right-2 top-2 flex gap-1">
                          {p.featured && p.status === 'published' && (
                            <Badge className="bg-yellow-500 text-white" aria-label="Featured on homepage"><Star className="h-3 w-3" aria-hidden /></Badge>
                          )}
                          <StatusBadge status={p.status} />
                        </div>
                      </div>
                      <div className={cn('space-y-2 p-4', viewMode === 'list' && 'flex-1')}>
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-lg font-semibold leading-tight">{p.title}</h4>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" aria-label={`Actions for ${p.title}`} disabled={busy !== null}>
                                <MoreHorizontal className="h-4 w-4" aria-hidden />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => onEditProject(p.id)}><Edit className="mr-2 h-4 w-4" aria-hidden />Edit</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => duplicate(p)}><Copy className="mr-2 h-4 w-4" aria-hidden />Duplicate</DropdownMenuItem>
                              {p.status === 'published' && p.url_slug && (
                                <DropdownMenuItem onClick={() => window.open(`/projects/${p.url_slug}`, '_blank', 'noopener')}>
                                  <Eye className="mr-2 h-4 w-4" aria-hidden />View
                                </DropdownMenuItem>
                              )}
                              {p.status === 'published' ? (
                                <DropdownMenuItem onClick={() => unpublish(p)}><EyeOff className="mr-2 h-4 w-4" aria-hidden />Unpublish</DropdownMenuItem>
                              ) : p.status === 'archived' ? (
                                <DropdownMenuItem onClick={() => publish(p, false)}><Rocket className="mr-2 h-4 w-4" aria-hidden />Publish</DropdownMenuItem>
                              ) : null}
                              <DropdownMenuItem className="text-red-600" onClick={() => remove(p)}><Trash2 className="mr-2 h-4 w-4" aria-hidden />Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <p className="flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="h-4 w-4" aria-hidden />{p.location}</p>
                        <div className="flex flex-wrap gap-1">
                          {p.service_types.slice(0, 2).map((s) => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)}
                          {p.service_types.length > 2 && <Badge variant="outline" className="text-xs">+{p.service_types.length - 2} more</Badge>}
                        </div>
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" aria-hidden />
                            {p.date_completed
                              ? new Date(`${p.date_completed.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
                              : 'No date'}
                          </span>
                          {p.budget_range && <span className="flex items-center gap-1"><DollarSign className="h-4 w-4" aria-hidden />{p.budget_range}</span>}
                        </div>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
