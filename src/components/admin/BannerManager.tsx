'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2, Edit, Eye, EyeOff, GripVertical, Save, X, ExternalLink } from 'lucide-react';

interface Banner {
  id: string;
  name: string;
  visitor_type: 'new' | 'returning' | 'all';
  min_visits: number;
  max_visits: number | null;
  min_days_since_first: number;
  max_days_since_first: number | null;
  show_on_paths: string[];
  exclude_paths: string[];
  require_viewed_pages: string[];
  require_not_viewed_pages: string[];
  display_type: 'top-bar' | 'slide-in' | 'modal';
  icon: string | null;
  title: string | null;
  message: string;
  cta_text: string | null;
  cta_link: string | null;
  cta_phone: string | null;
  bg_color: string;
  text_color: string;
  dismissable: boolean;
  dismiss_for_hours: number;
  enabled: boolean;
  priority: number;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

const DISPLAY_TYPE_LABELS: Record<string, string> = {
  'top-bar': '📢 Top Bar',
  'slide-in': '💬 Slide-in Card',
  'modal': '🖼 Modal Popup',
};

const VISITOR_TYPE_LABELS: Record<string, string> = {
  'new': '🆕 New Visitors',
  'returning': '🔄 Returning Visitors',
  'all': '👥 All Visitors',
};

const COLOR_OPTIONS = [
  { value: 'bg-primary', label: 'Brand Orange', preview: 'bg-orange-500' },
  { value: 'bg-orange-500', label: 'Orange', preview: 'bg-orange-500' },
  { value: 'bg-green-600', label: 'Green', preview: 'bg-green-600' },
  { value: 'bg-blue-600', label: 'Blue', preview: 'bg-blue-600' },
  { value: 'bg-amber-600', label: 'Amber', preview: 'bg-amber-600' },
  { value: 'bg-red-600', label: 'Red', preview: 'bg-red-600' },
  { value: 'bg-purple-600', label: 'Purple', preview: 'bg-purple-600' },
  { value: 'bg-gray-800', label: 'Dark', preview: 'bg-gray-800' },
];

export function BannerManager() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Banner>>({});
  const [isCreating, setIsCreating] = useState(false);

  const loadBanners = useCallback(async () => {
    try {
      const res = await fetch('/api/banners/admin');
      if (res.ok) setBanners(await res.json());
    } catch {
      toast({ title: 'Error', description: 'Failed to load banners', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBanners(); }, [loadBanners]);

  const toggleEnabled = async (banner: Banner) => {
    try {
      const res = await fetch('/api/banners/admin', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: banner.id, enabled: !banner.enabled }),
      });
      if (!res.ok) throw new Error();
      toast({ title: banner.enabled ? 'Banner disabled' : 'Banner enabled' });
      loadBanners();
    } catch {
      toast({ title: 'Error', description: 'Failed to update banner', variant: 'destructive' });
    }
  };

  const deleteBanner = async (id: string) => {
    if (!confirm('Delete this banner?')) return;
    try {
      const res = await fetch('/api/banners/admin', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error();
      toast({ title: 'Banner deleted' });
      loadBanners();
    } catch {
      toast({ title: 'Error', description: 'Failed to delete banner', variant: 'destructive' });
    }
  };

  const startEdit = (banner: Banner) => {
    setEditingId(banner.id);
    setEditForm({ ...banner });
    setIsCreating(false);
  };

  const startCreate = () => {
    setEditingId('new');
    setIsCreating(true);
    setEditForm({
      name: '',
      visitor_type: 'all',
      min_visits: 0,
      max_visits: null,
      min_days_since_first: 0,
      max_days_since_first: null,
      show_on_paths: [],
      exclude_paths: ['/vaca-mgmt', '/admin', '/auth'],
      require_viewed_pages: [],
      require_not_viewed_pages: [],
      display_type: 'top-bar',
      icon: '',
      title: '',
      message: '',
      cta_text: '',
      cta_link: '',
      cta_phone: '',
      bg_color: 'bg-primary',
      text_color: 'text-primary-foreground',
      dismissable: true,
      dismiss_for_hours: 24,
      enabled: true,
      priority: 50,
      start_date: null,
      end_date: null,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
    setIsCreating(false);
  };

  const saveEdit = async () => {
    if (!editForm.name || !editForm.message) {
      toast({ title: 'Name and message are required', variant: 'destructive' });
      return;
    }

    try {
      if (isCreating) {
        const { ...data } = editForm;
        const res = await fetch('/api/banners/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error();
        toast({ title: 'Banner created!' });
      } else {
        const res = await fetch('/api/banners/admin', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editForm),
        });
        if (!res.ok) throw new Error();
        toast({ title: 'Banner updated!' });
      }
      cancelEdit();
      loadBanners();
    } catch {
      toast({ title: 'Error', description: 'Failed to save banner', variant: 'destructive' });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8"><p className="text-muted-foreground">Loading banners...</p></div>;
  }

  // Edit/Create form
  if (editingId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">{isCreating ? 'Create Banner' : 'Edit Banner'}</h2>
          <Button variant="outline" onClick={cancelEdit}><X className="w-4 h-4 mr-2" />Cancel</Button>
        </div>

        {/* Preview */}
        <Card className="border-dashed">
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Preview</CardTitle></CardHeader>
          <CardContent>
            <div className={`rounded-lg p-3 ${editForm.bg_color} ${editForm.text_color} flex items-center gap-3`}>
              {editForm.icon && <span className="text-lg">{editForm.icon}</span>}
              <div className="flex-1">
                {editForm.title && <span className="font-bold mr-2">{editForm.title}</span>}
                <span className="font-medium">{editForm.message || 'Your message here...'}</span>
              </div>
              {editForm.cta_text && (
                <span className="font-semibold underline whitespace-nowrap">{editForm.cta_text}</span>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Basic Info */}
          <Card>
            <CardHeader><CardTitle>Content</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Banner Name (internal)</Label>
                <Input value={editForm.name || ''} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g., Spring Promo" />
              </div>
              <div>
                <Label>Icon (emoji)</Label>
                <Input value={editForm.icon || ''} onChange={e => setEditForm(p => ({ ...p, icon: e.target.value }))} placeholder="e.g., 👋 🏠 ⚡" />
              </div>
              <div>
                <Label>Title (optional, for slide-in/modal)</Label>
                <Input value={editForm.title || ''} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} />
              </div>
              <div>
                <Label>Message *</Label>
                <Textarea value={editForm.message || ''} onChange={e => setEditForm(p => ({ ...p, message: e.target.value }))} placeholder="Your banner message..." />
              </div>
              <div>
                <Label>CTA Button Text</Label>
                <Input value={editForm.cta_text || ''} onChange={e => setEditForm(p => ({ ...p, cta_text: e.target.value }))} placeholder="e.g., Get Free Estimate" />
              </div>
              <div>
                <Label>CTA Link</Label>
                <Input value={editForm.cta_link || ''} onChange={e => setEditForm(p => ({ ...p, cta_link: e.target.value }))} placeholder="/free-estimate or tel:+12012124917" />
              </div>
            </CardContent>
          </Card>

          {/* Targeting */}
          <Card>
            <CardHeader><CardTitle>Targeting</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Who sees this?</Label>
                <Select value={editForm.visitor_type || 'all'} onValueChange={v => setEditForm(p => ({ ...p, visitor_type: v as Banner['visitor_type'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Visitors</SelectItem>
                    <SelectItem value="new">New Visitors Only</SelectItem>
                    <SelectItem value="returning">Returning Visitors Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Min Visits</Label>
                  <Input type="number" min={0} value={editForm.min_visits ?? 0} onChange={e => setEditForm(p => ({ ...p, min_visits: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <Label>Max Visits (blank = no limit)</Label>
                  <Input type="number" min={0} value={editForm.max_visits ?? ''} onChange={e => setEditForm(p => ({ ...p, max_visits: e.target.value ? parseInt(e.target.value) : null }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Min Days Since First Visit</Label>
                  <Input type="number" min={0} value={editForm.min_days_since_first ?? 0} onChange={e => setEditForm(p => ({ ...p, min_days_since_first: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <Label>Max Days (blank = no limit)</Label>
                  <Input type="number" min={0} value={editForm.max_days_since_first ?? ''} onChange={e => setEditForm(p => ({ ...p, max_days_since_first: e.target.value ? parseInt(e.target.value) : null }))} />
                </div>
              </div>
              <div>
                <Label>Exclude Paths (comma-separated)</Label>
                <Input value={(editForm.exclude_paths || []).join(', ')} onChange={e => setEditForm(p => ({ ...p, exclude_paths: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))} placeholder="/vaca-mgmt, /admin" />
              </div>
            </CardContent>
          </Card>

          {/* Appearance */}
          <Card>
            <CardHeader><CardTitle>Appearance</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Display Type</Label>
                <Select value={editForm.display_type || 'top-bar'} onValueChange={v => setEditForm(p => ({ ...p, display_type: v as Banner['display_type'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="top-bar">📢 Top Bar</SelectItem>
                    <SelectItem value="slide-in">💬 Slide-in Card</SelectItem>
                    <SelectItem value="modal">🖼 Modal Popup</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Background Color</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {COLOR_OPTIONS.map(c => (
                    <button
                      key={c.value}
                      onClick={() => setEditForm(p => ({ ...p, bg_color: c.value, text_color: 'text-white' }))}
                      className={`w-8 h-8 rounded-full ${c.preview} border-2 cursor-pointer ${editForm.bg_color === c.value ? 'border-black ring-2 ring-offset-1 ring-black' : 'border-transparent'}`}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={editForm.dismissable !== false} onCheckedChange={v => setEditForm(p => ({ ...p, dismissable: v }))} />
                <Label>User can dismiss</Label>
              </div>
              <div>
                <Label>Dismiss cooldown (hours)</Label>
                <Input type="number" min={0} value={editForm.dismiss_for_hours ?? 24} onChange={e => setEditForm(p => ({ ...p, dismiss_for_hours: parseInt(e.target.value) || 0 }))} />
              </div>
              <div>
                <Label>Priority (lower = shown first)</Label>
                <Input type="number" min={0} value={editForm.priority ?? 50} onChange={e => setEditForm(p => ({ ...p, priority: parseInt(e.target.value) || 50 }))} />
              </div>
            </CardContent>
          </Card>

          {/* Schedule */}
          <Card>
            <CardHeader><CardTitle>Schedule (optional)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Start Date</Label>
                <Input type="datetime-local" value={editForm.start_date ? new Date(editForm.start_date).toISOString().slice(0, 16) : ''} onChange={e => setEditForm(p => ({ ...p, start_date: e.target.value ? new Date(e.target.value).toISOString() : null }))} />
              </div>
              <div>
                <Label>End Date</Label>
                <Input type="datetime-local" value={editForm.end_date ? new Date(editForm.end_date).toISOString().slice(0, 16) : ''} onChange={e => setEditForm(p => ({ ...p, end_date: e.target.value ? new Date(e.target.value).toISOString() : null }))} />
              </div>
              <p className="text-sm text-muted-foreground">Leave empty for always-on banners. Set dates for time-limited promos.</p>
              <div className="flex items-center gap-3">
                <Switch checked={editForm.enabled !== false} onCheckedChange={v => setEditForm(p => ({ ...p, enabled: v }))} />
                <Label>Enabled</Label>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={cancelEdit}>Cancel</Button>
          {!isCreating && editingId && (
            <Button
              variant="outline"
              onClick={() => window.open(`/?banner_preview=${editingId}`, '_blank')}
              className="cursor-pointer"
            >
              <ExternalLink className="w-4 h-4 mr-2" />Preview on Site
            </Button>
          )}
          <Button onClick={saveEdit}><Save className="w-4 h-4 mr-2" />{isCreating ? 'Create Banner' : 'Save Changes'}</Button>
        </div>
      </div>
    );
  }

  // Banner list
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Smart Banners</h2>
          <p className="text-muted-foreground">Personalized messages based on visitor behavior</p>
        </div>
        <Button onClick={startCreate}><Plus className="w-4 h-4 mr-2" />New Banner</Button>
      </div>

      {banners.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground mb-4">No banners yet. Create your first one!</p>
            <Button onClick={startCreate}><Plus className="w-4 h-4 mr-2" />Create Banner</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {banners.map(banner => (
            <Card key={banner.id} className={`transition-all ${!banner.enabled ? 'opacity-60' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <GripVertical className="w-5 h-5 text-muted-foreground flex-shrink-0" />

                  {/* Preview strip */}
                  <div className={`w-2 h-12 rounded-full flex-shrink-0 ${banner.bg_color}`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{banner.name}</span>
                      <Badge variant="outline" className="text-xs">{DISPLAY_TYPE_LABELS[banner.display_type]}</Badge>
                      <Badge variant="outline" className="text-xs">{VISITOR_TYPE_LABELS[banner.visitor_type || 'all']}</Badge>
                      {banner.min_visits > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {banner.max_visits ? `${banner.min_visits}-${banner.max_visits} visits` : `${banner.min_visits}+ visits`}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs">Priority: {banner.priority}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">
                      {banner.icon} {banner.message}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8 cursor-pointer" onClick={() => window.open(`/?banner_preview=${banner.id}`, '_blank')} title="Preview on site">
                      <ExternalLink className="w-4 h-4 text-blue-600" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 cursor-pointer" onClick={() => toggleEnabled(banner)} title={banner.enabled ? 'Disable' : 'Enable'}>
                      {banner.enabled ? <Eye className="w-4 h-4 text-green-600" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 cursor-pointer" onClick={() => startEdit(banner)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 cursor-pointer" onClick={() => deleteBanner(banner.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
