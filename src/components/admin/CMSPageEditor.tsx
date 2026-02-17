'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';

// Use untyped client since cms_pages isn't in generated types yet
const supabaseCms = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import {
  Plus, Edit, Trash2, Save, X, ArrowUp, ArrowDown,
  Copy, Eye, FileText, ChevronDown, ExternalLink, Loader2,
} from 'lucide-react';
import type {
  CMSPage, CMSSection, CMSSectionType,
  HeroSection, BeforeAfterSection, FeaturesSection,
  TestimonialsSection, TextSection, CTASection,
  FAQSection, GallerySection,
} from '@/types/cms';
import { SECTION_TYPE_LABELS, createDefaultSection } from '@/types/cms';

// ─── Section Editors ───────────────────────────────────────────────

function HeroEditor({ section, onChange }: { section: HeroSection; onChange: (s: HeroSection) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label>Heading</Label>
        <Input value={section.heading} onChange={e => onChange({ ...section, heading: e.target.value })} placeholder="Main headline..." />
      </div>
      <div>
        <Label>Subheading</Label>
        <Textarea value={section.subheading} onChange={e => onChange({ ...section, subheading: e.target.value })} placeholder="Supporting text..." rows={2} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>CTA Text</Label>
          <Input value={section.ctaText} onChange={e => onChange({ ...section, ctaText: e.target.value })} placeholder="Get Free Estimate" />
        </div>
        <div>
          <Label>CTA Link</Label>
          <Input value={section.ctaLink} onChange={e => onChange({ ...section, ctaLink: e.target.value })} placeholder="/contact" />
        </div>
      </div>
      <div>
        <Label>Background Image URL</Label>
        <Input value={section.backgroundImage} onChange={e => onChange({ ...section, backgroundImage: e.target.value })} placeholder="/images/hero.jpg" />
      </div>
    </div>
  );
}

function BeforeAfterEditor({ section, onChange }: { section: BeforeAfterSection; onChange: (s: BeforeAfterSection) => void }) {
  const updateItem = (idx: number, field: string, value: string) => {
    const items = [...section.items];
    items[idx] = { ...items[idx], [field]: value };
    onChange({ ...section, items });
  };
  const addItem = () => onChange({ ...section, items: [...section.items, { beforeImage: '', afterImage: '', caption: '' }] });
  const removeItem = (idx: number) => onChange({ ...section, items: section.items.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-3">
      <div>
        <Label>Heading</Label>
        <Input value={section.heading} onChange={e => onChange({ ...section, heading: e.target.value })} placeholder="See the Transformation" />
      </div>
      {section.items.map((item, idx) => (
        <Card key={idx} className="border-dashed">
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Item {idx + 1}</span>
              {section.items.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => removeItem(idx)}><Trash2 className="h-3 w-3" /></Button>
              )}
            </div>
            <div>
              <Label>Before Image URL</Label>
              <Input value={item.beforeImage} onChange={e => updateItem(idx, 'beforeImage', e.target.value)} placeholder="/images/before.jpg" />
            </div>
            <div>
              <Label>After Image URL</Label>
              <Input value={item.afterImage} onChange={e => updateItem(idx, 'afterImage', e.target.value)} placeholder="/images/after.jpg" />
            </div>
            <div>
              <Label>Caption</Label>
              <Input value={item.caption} onChange={e => updateItem(idx, 'caption', e.target.value)} placeholder="Kitchen Remodel" />
            </div>
          </CardContent>
        </Card>
      ))}
      <Button variant="outline" size="sm" onClick={addItem}><Plus className="h-3 w-3 mr-1" /> Add Item</Button>
    </div>
  );
}

function FeaturesEditor({ section, onChange }: { section: FeaturesSection; onChange: (s: FeaturesSection) => void }) {
  const iconOptions = ['Shield', 'Award', 'Clock', 'Star', 'CheckCircle', 'Calendar', 'Home', 'Hammer', 'Wrench', 'Paintbrush', 'Zap', 'Phone', 'DollarSign', 'Heart', 'ThumbsUp'];
  const updateItem = (idx: number, field: string, value: string) => {
    const items = [...section.items];
    items[idx] = { ...items[idx], [field]: value };
    onChange({ ...section, items });
  };
  const addItem = () => onChange({ ...section, items: [...section.items, { icon: 'Shield', title: '', description: '' }] });
  const removeItem = (idx: number) => onChange({ ...section, items: section.items.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-3">
      <div>
        <Label>Heading</Label>
        <Input value={section.heading} onChange={e => onChange({ ...section, heading: e.target.value })} placeholder="Why Choose Us" />
      </div>
      {section.items.map((item, idx) => (
        <Card key={idx} className="border-dashed">
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Feature {idx + 1}</span>
              {section.items.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => removeItem(idx)}><Trash2 className="h-3 w-3" /></Button>
              )}
            </div>
            <div>
              <Label>Icon</Label>
              <Select value={item.icon} onValueChange={v => updateItem(idx, 'icon', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {iconOptions.map(icon => (
                    <SelectItem key={icon} value={icon}>{icon}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Title</Label>
              <Input value={item.title} onChange={e => updateItem(idx, 'title', e.target.value)} placeholder="Feature title" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} rows={2} placeholder="Feature description..." />
            </div>
          </CardContent>
        </Card>
      ))}
      <Button variant="outline" size="sm" onClick={addItem}><Plus className="h-3 w-3 mr-1" /> Add Feature</Button>
    </div>
  );
}

function TestimonialsEditor({ section, onChange }: { section: TestimonialsSection; onChange: (s: TestimonialsSection) => void }) {
  const updateItem = (idx: number, field: string, value: string | number) => {
    const items = [...section.items];
    items[idx] = { ...items[idx], [field]: value };
    onChange({ ...section, items });
  };
  const addItem = () => onChange({ ...section, items: [...section.items, { quote: '', author: '', rating: 5 }] });
  const removeItem = (idx: number) => onChange({ ...section, items: section.items.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-3">
      <div>
        <Label>Heading</Label>
        <Input value={section.heading} onChange={e => onChange({ ...section, heading: e.target.value })} placeholder="What Our Clients Say" />
      </div>
      {section.items.map((item, idx) => (
        <Card key={idx} className="border-dashed">
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Testimonial {idx + 1}</span>
              {section.items.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => removeItem(idx)}><Trash2 className="h-3 w-3" /></Button>
              )}
            </div>
            <div>
              <Label>Quote</Label>
              <Textarea value={item.quote} onChange={e => updateItem(idx, 'quote', e.target.value)} rows={3} placeholder="Customer testimonial..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Author</Label>
                <Input value={item.author} onChange={e => updateItem(idx, 'author', e.target.value)} placeholder="John D., City, NJ" />
              </div>
              <div>
                <Label>Rating (1-5)</Label>
                <Select value={String(item.rating)} onValueChange={v => updateItem(idx, 'rating', Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map(n => (
                      <SelectItem key={n} value={String(n)}>{'★'.repeat(n)}{'☆'.repeat(5 - n)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      <Button variant="outline" size="sm" onClick={addItem}><Plus className="h-3 w-3 mr-1" /> Add Testimonial</Button>
    </div>
  );
}

function TextEditor({ section, onChange }: { section: TextSection; onChange: (s: TextSection) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label>Heading</Label>
        <Input value={section.heading} onChange={e => onChange({ ...section, heading: e.target.value })} placeholder="Section heading" />
      </div>
      <div>
        <Label>Content (Markdown supported)</Label>
        <Textarea value={section.content} onChange={e => onChange({ ...section, content: e.target.value })} rows={8} placeholder="Write your content here. Supports markdown..." className="font-mono text-sm" />
      </div>
    </div>
  );
}

function CTAEditor({ section, onChange }: { section: CTASection; onChange: (s: CTASection) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label>Heading</Label>
        <Input value={section.heading} onChange={e => onChange({ ...section, heading: e.target.value })} placeholder="Ready to Start?" />
      </div>
      <div>
        <Label>Description</Label>
        <Textarea value={section.description} onChange={e => onChange({ ...section, description: e.target.value })} rows={2} placeholder="Supporting text..." />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>CTA Text</Label>
          <Input value={section.ctaText} onChange={e => onChange({ ...section, ctaText: e.target.value })} placeholder="Contact Us" />
        </div>
        <div>
          <Label>CTA Link</Label>
          <Input value={section.ctaLink} onChange={e => onChange({ ...section, ctaLink: e.target.value })} placeholder="/contact" />
        </div>
      </div>
      <div>
        <Label>Phone Number</Label>
        <Input value={section.phone} onChange={e => onChange({ ...section, phone: e.target.value })} placeholder="(201) 212-4917" />
      </div>
    </div>
  );
}

function FAQEditor({ section, onChange }: { section: FAQSection; onChange: (s: FAQSection) => void }) {
  const updateItem = (idx: number, field: string, value: string) => {
    const items = [...section.items];
    items[idx] = { ...items[idx], [field]: value };
    onChange({ ...section, items });
  };
  const addItem = () => onChange({ ...section, items: [...section.items, { question: '', answer: '' }] });
  const removeItem = (idx: number) => onChange({ ...section, items: section.items.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-3">
      <div>
        <Label>Heading</Label>
        <Input value={section.heading} onChange={e => onChange({ ...section, heading: e.target.value })} placeholder="Frequently Asked Questions" />
      </div>
      {section.items.map((item, idx) => (
        <Card key={idx} className="border-dashed">
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Q&A {idx + 1}</span>
              {section.items.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => removeItem(idx)}><Trash2 className="h-3 w-3" /></Button>
              )}
            </div>
            <div>
              <Label>Question</Label>
              <Input value={item.question} onChange={e => updateItem(idx, 'question', e.target.value)} placeholder="How long does it take?" />
            </div>
            <div>
              <Label>Answer</Label>
              <Textarea value={item.answer} onChange={e => updateItem(idx, 'answer', e.target.value)} rows={3} placeholder="Typically 2-4 weeks..." />
            </div>
          </CardContent>
        </Card>
      ))}
      <Button variant="outline" size="sm" onClick={addItem}><Plus className="h-3 w-3 mr-1" /> Add Q&A</Button>
    </div>
  );
}

function GalleryEditor({ section, onChange }: { section: GallerySection; onChange: (s: GallerySection) => void }) {
  const updateImage = (idx: number, field: string, value: string) => {
    const images = [...section.images];
    images[idx] = { ...images[idx], [field]: value };
    onChange({ ...section, images });
  };
  const addImage = () => onChange({ ...section, images: [...section.images, { src: '', alt: '', caption: '' }] });
  const removeImage = (idx: number) => onChange({ ...section, images: section.images.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-3">
      <div>
        <Label>Heading</Label>
        <Input value={section.heading} onChange={e => onChange({ ...section, heading: e.target.value })} placeholder="Our Work" />
      </div>
      {section.images.map((img, idx) => (
        <Card key={idx} className="border-dashed">
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Image {idx + 1}</span>
              {section.images.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => removeImage(idx)}><Trash2 className="h-3 w-3" /></Button>
              )}
            </div>
            <div>
              <Label>Image URL</Label>
              <Input value={img.src} onChange={e => updateImage(idx, 'src', e.target.value)} placeholder="/images/project.jpg" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Alt Text</Label>
                <Input value={img.alt} onChange={e => updateImage(idx, 'alt', e.target.value)} placeholder="Kitchen remodel" />
              </div>
              <div>
                <Label>Caption</Label>
                <Input value={img.caption} onChange={e => updateImage(idx, 'caption', e.target.value)} placeholder="Modern kitchen" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      <Button variant="outline" size="sm" onClick={addImage}><Plus className="h-3 w-3 mr-1" /> Add Image</Button>
    </div>
  );
}

// ─── Section Editor Dispatcher ─────────────────────────────────────

function SectionEditor({ section, onChange }: { section: CMSSection; onChange: (s: CMSSection) => void }) {
  switch (section.type) {
    case 'hero': return <HeroEditor section={section} onChange={onChange} />;
    case 'before-after': return <BeforeAfterEditor section={section} onChange={onChange} />;
    case 'features': return <FeaturesEditor section={section} onChange={onChange} />;
    case 'testimonials': return <TestimonialsEditor section={section} onChange={onChange} />;
    case 'text': return <TextEditor section={section} onChange={onChange} />;
    case 'cta': return <CTAEditor section={section} onChange={onChange} />;
    case 'faq': return <FAQEditor section={section} onChange={onChange} />;
    case 'gallery': return <GalleryEditor section={section} onChange={onChange} />;
    default: return null;
  }
}

// ─── Section Builder ───────────────────────────────────────────────

function SectionBuilder({ sections, onChange }: { sections: CMSSection[]; onChange: (s: CMSSection[]) => void }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const moveSection = (idx: number, direction: 'up' | 'down') => {
    const newSections = [...sections];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= newSections.length) return;
    [newSections[idx], newSections[targetIdx]] = [newSections[targetIdx], newSections[idx]];
    onChange(newSections);
    setExpandedIdx(targetIdx);
  };

  const removeSection = (idx: number) => {
    onChange(sections.filter((_, i) => i !== idx));
    setExpandedIdx(null);
  };

  const updateSection = (idx: number, section: CMSSection) => {
    const newSections = [...sections];
    newSections[idx] = section;
    onChange(newSections);
  };

  const addSection = (type: CMSSectionType) => {
    const newSection = createDefaultSection(type);
    onChange([...sections, newSection]);
    setExpandedIdx(sections.length);
    setAddMenuOpen(false);
  };

  const sectionTypes: CMSSectionType[] = ['hero', 'before-after', 'features', 'testimonials', 'text', 'cta', 'faq', 'gallery'];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">Page Sections</Label>
        <span className="text-xs text-muted-foreground">{sections.length} section{sections.length !== 1 ? 's' : ''}</span>
      </div>

      {sections.length === 0 && (
        <div className="text-center py-8 border-2 border-dashed rounded-lg text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No sections yet. Add your first section below.</p>
        </div>
      )}

      {sections.map((section, idx) => (
        <Card key={idx} className="overflow-hidden">
          <div
            className="flex items-center gap-2 px-4 py-3 bg-muted/50 cursor-pointer hover:bg-muted/80 transition-colors"
            onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${expandedIdx === idx ? 'rotate-0' : '-rotate-90'}`} />
            <Badge variant="outline" className="text-xs">{SECTION_TYPE_LABELS[section.type]}</Badge>
            <span className="text-sm text-muted-foreground truncate flex-1">
              {'heading' in section && section.heading ? section.heading : '(untitled)'}
            </span>
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
              <Button variant="ghost" size="sm" disabled={idx === 0} onClick={() => moveSection(idx, 'up')} className="h-7 w-7 p-0">
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" disabled={idx === sections.length - 1} onClick={() => moveSection(idx, 'down')} className="h-7 w-7 p-0">
                <ArrowDown className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => removeSection(idx)} className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
          {expandedIdx === idx && (
            <CardContent className="pt-4">
              <SectionEditor section={section} onChange={s => updateSection(idx, s)} />
            </CardContent>
          )}
        </Card>
      ))}

      {/* Add Section */}
      <div className="relative">
        <Button variant="outline" className="w-full" onClick={() => setAddMenuOpen(!addMenuOpen)}>
          <Plus className="h-4 w-4 mr-2" /> Add Section
        </Button>
        {addMenuOpen && (
          <Card className="absolute top-full left-0 right-0 mt-1 z-20 shadow-lg">
            <CardContent className="p-2">
              <div className="grid grid-cols-2 gap-1">
                {sectionTypes.map(type => (
                  <Button key={type} variant="ghost" className="justify-start text-sm h-9" onClick={() => addSection(type)}>
                    {SECTION_TYPE_LABELS[type]}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Slug Generator ────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-/]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── Main Component ────────────────────────────────────────────────

interface CMSPageFormData {
  title: string;
  slug: string;
  meta_description: string;
  page_type: 'landing' | 'resource' | 'campaign';
  status: 'draft' | 'published';
  sections: CMSSection[];
}

export function CMSPageEditor() {
  const [pages, setPages] = useState<CMSPage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CMSPageFormData>({
    title: '',
    slug: '',
    meta_description: '',
    page_type: 'landing',
    status: 'draft',
    sections: [],
  });
  const [autoSlug, setAutoSlug] = useState(true);
  const [view, setView] = useState<'list' | 'editor'>('list');

  // Load pages
  const loadPages = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabaseCms
        .from('cms_pages')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setPages((data || []) as unknown as CMSPage[]);
    } catch (error) {
      console.error('Error loading CMS pages:', error);
      toast({ title: 'Error', description: 'Failed to load pages', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadPages(); }, [loadPages]);

  // Create new page
  const handleNew = () => {
    setEditingPageId(null);
    setFormData({
      title: '',
      slug: '',
      meta_description: '',
      page_type: 'landing',
      status: 'draft',
      sections: [],
    });
    setAutoSlug(true);
    setView('editor');
  };

  // Edit existing page
  const handleEdit = (page: CMSPage) => {
    setEditingPageId(page.id);
    setFormData({
      title: page.title,
      slug: page.slug,
      meta_description: page.meta_description || '',
      page_type: page.page_type,
      status: page.status,
      sections: page.sections,
    });
    setAutoSlug(false);
    setView('editor');
  };

  // Duplicate page
  const handleDuplicate = async (page: CMSPage) => {
    try {
      const newSlug = `${page.slug}-copy`;
      const { error } = await supabaseCms
        .from('cms_pages')
        .insert({
          title: `${page.title} (Copy)`,
          slug: newSlug,
          meta_description: page.meta_description,
          page_type: page.page_type,
          status: 'draft',
          sections: page.sections as unknown as Record<string, unknown>[],
        });

      if (error) throw error;
      toast({ title: 'Duplicated', description: `Page duplicated as "${page.title} (Copy)"` });
      loadPages();
    } catch (error) {
      console.error('Error duplicating page:', error);
      toast({ title: 'Error', description: 'Failed to duplicate page', variant: 'destructive' });
    }
  };

  // Delete page
  const handleDelete = async (page: CMSPage) => {
    if (!confirm(`Delete "${page.title}"? This cannot be undone.`)) return;
    try {
      const { error } = await supabaseCms
        .from('cms_pages')
        .delete()
        .eq('id', page.id);

      if (error) throw error;
      toast({ title: 'Deleted', description: `"${page.title}" has been deleted.` });
      loadPages();
    } catch (error) {
      console.error('Error deleting page:', error);
      toast({ title: 'Error', description: 'Failed to delete page', variant: 'destructive' });
    }
  };

  // Save page
  const handleSave = async (publish: boolean = false) => {
    if (!formData.title.trim()) {
      toast({ title: 'Validation Error', description: 'Title is required', variant: 'destructive' });
      return;
    }
    if (!formData.slug.trim()) {
      toast({ title: 'Validation Error', description: 'Slug is required', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      const status = publish ? 'published' : formData.status;
      const payload = {
        title: formData.title.trim(),
        slug: formData.slug.trim(),
        meta_description: formData.meta_description.trim() || null,
        page_type: formData.page_type,
        status,
        sections: formData.sections as unknown as Record<string, unknown>[],
        updated_at: new Date().toISOString(),
        ...(publish ? { published_at: new Date().toISOString() } : {}),
      };

      if (editingPageId) {
        const { error } = await supabaseCms
          .from('cms_pages')
          .update(payload)
          .eq('id', editingPageId);
        if (error) throw error;
      } else {
        const { error } = await supabaseCms
          .from('cms_pages')
          .insert(payload);
        if (error) throw error;
      }

      toast({
        title: publish ? 'Published!' : 'Saved',
        description: publish
          ? `"${formData.title}" is now live at /cms/${formData.slug}`
          : `"${formData.title}" saved as draft.`,
      });

      if (publish) {
        setFormData(prev => ({ ...prev, status: 'published' }));
      }
      loadPages();
    } catch (error) {
      console.error('Error saving page:', error);
      const msg = error instanceof Error ? error.message : 'Failed to save page';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle title change with auto-slug
  const handleTitleChange = (title: string) => {
    setFormData(prev => ({
      ...prev,
      title,
      ...(autoSlug ? { slug: slugify(title) } : {}),
    }));
  };

  // ─── List View ─────────────────────────────────────────────────

  if (view === 'list') {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Pages / CMS</CardTitle>
              <CardDescription>Manage landing pages and marketing pages</CardDescription>
            </div>
            <Button onClick={handleNew}><Plus className="h-4 w-4 mr-2" /> New Page</Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : pages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium mb-1">No pages yet</p>
              <p className="text-sm">Create your first landing page to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 font-medium">Title</th>
                    <th className="text-left py-3 px-2 font-medium hidden sm:table-cell">Slug</th>
                    <th className="text-left py-3 px-2 font-medium">Status</th>
                    <th className="text-left py-3 px-2 font-medium hidden md:table-cell">Type</th>
                    <th className="text-left py-3 px-2 font-medium hidden lg:table-cell">Updated</th>
                    <th className="text-right py-3 px-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.map(page => (
                    <tr key={page.id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-2 font-medium">{page.title}</td>
                      <td className="py-3 px-2 text-muted-foreground hidden sm:table-cell">
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">/cms/{page.slug}</code>
                      </td>
                      <td className="py-3 px-2">
                        <Badge variant={page.status === 'published' ? 'default' : 'secondary'}>
                          {page.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-muted-foreground capitalize hidden md:table-cell">{page.page_type}</td>
                      <td className="py-3 px-2 text-muted-foreground hidden lg:table-cell">
                        {new Date(page.updated_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(page)} title="Edit">
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDuplicate(page)} title="Duplicate">
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          {page.status === 'published' && (
                            <Button variant="ghost" size="sm" asChild title="View page">
                              <a href={`/cms/${page.slug}`} target="_blank" rel="noopener noreferrer">
                                <Eye className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(page)} title="Delete" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // ─── Editor View ───────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => { setView('list'); loadPages(); }}>
          <X className="h-4 w-4 mr-2" /> Back to Pages
        </Button>
        <div className="flex items-center gap-2">
          {formData.status === 'published' && formData.slug && (
            <Button variant="outline" size="sm" asChild>
              <a href={`/cms/${formData.slug}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Preview
              </a>
            </Button>
          )}
          <Button variant="outline" onClick={() => handleSave(false)} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Draft
          </Button>
          <Button onClick={() => handleSave(true)} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
            Publish
          </Button>
        </div>
      </div>

      {/* Page settings */}
      <Card>
        <CardHeader>
          <CardTitle>{editingPageId ? 'Edit Page' : 'New Page'}</CardTitle>
          <CardDescription>Set the page title, URL, and SEO settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Page Title</Label>
            <Input
              value={formData.title}
              onChange={e => handleTitleChange(e.target.value)}
              placeholder="Spring Renovation Sale"
              className="text-lg"
            />
          </div>

          <div>
            <Label>URL Slug</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">/cms/</span>
              <Input
                value={formData.slug}
                onChange={e => {
                  setAutoSlug(false);
                  setFormData(prev => ({ ...prev, slug: e.target.value }));
                }}
                placeholder="spring-renovation"
              />
            </div>
          </div>

          <div>
            <Label>Meta Description (SEO)</Label>
            <Textarea
              value={formData.meta_description}
              onChange={e => setFormData(prev => ({ ...prev, meta_description: e.target.value }))}
              placeholder="A brief description for search engines..."
              rows={2}
            />
            <p className="text-xs text-muted-foreground mt-1">{formData.meta_description.length}/160 characters</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Page Type</Label>
              <Select value={formData.page_type} onValueChange={(v: 'landing' | 'resource' | 'campaign') => setFormData(prev => ({ ...prev, page_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="landing">Landing Page</SelectItem>
                  <SelectItem value="resource">Resource Page</SelectItem>
                  <SelectItem value="campaign">Campaign Page</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v: 'draft' | 'published') => setFormData(prev => ({ ...prev, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sections */}
      <Card>
        <CardHeader>
          <CardTitle>Page Content</CardTitle>
          <CardDescription>Build your page by adding and arranging sections</CardDescription>
        </CardHeader>
        <CardContent>
          <SectionBuilder
            sections={formData.sections}
            onChange={sections => setFormData(prev => ({ ...prev, sections }))}
          />
        </CardContent>
      </Card>

      {/* Bottom actions */}
      <div className="flex items-center justify-end gap-2 pb-8">
        <Button variant="outline" onClick={() => { setView('list'); loadPages(); }}>Cancel</Button>
        <Button variant="outline" onClick={() => handleSave(false)} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Draft
        </Button>
        <Button onClick={() => handleSave(true)} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
          Publish
        </Button>
      </div>
    </div>
  );
}
