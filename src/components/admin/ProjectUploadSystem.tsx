'use client';

/**
 * The Projects tab: the Portfolio Manager, and the single-page project form.
 *
 * Decision 002 (docs/decisions/002-grill-round-1-project-upload.md): one
 * scrolling form, no wizard and no AI. Required: title, location, one service
 * type, one photo. Save writes a DRAFT through /api/admin/projects; Publish is
 * a separate click on the draft card. Six clicks from photos to draft:
 * Add New Project, drop photos, title, location, a service, Save draft.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { SERVICE_TYPES, type ImageCategory, type ProjectStatus } from '@/lib/projects/fields';
import {
  currentMonth, defaultAltText, defaultMetaDescription, defaultSeoTitle, deriveSlug,
} from '@/lib/projects/slug';
import { PortfolioManager } from './PortfolioManager';
import { StatusBadge } from './projects/StatusBadge';
import { ApiError, projectsApi } from './projects/api';
import { MoreDetailsSection } from './projects/MoreDetailsSection';
import { PairLinker } from './projects/PairLinker';
import { PhotoGrid } from './projects/PhotoGrid';
import { SeoSection } from './projects/SeoSection';
import { isImageFile, isVideoFile, uploadMedia } from './projects/upload';
import type { FormImage, FormTarget, ProjectFormFields, TouchedDefaults } from './projects/types';

// ---------------------------------------------------------------------------
// Tab container
// ---------------------------------------------------------------------------

/** Reads `?project=<id>` (the admin_url the ingest API hands back) once. */
function projectFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const id = new URLSearchParams(window.location.search).get('project');
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

function clearProjectParam() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('project')) return;
  url.searchParams.delete('project');
  window.history.replaceState(null, '', url.toString());
}

export function ProjectUploadSystem() {
  const [target, setTarget] = useState<FormTarget | null>(() => {
    const id = projectFromUrl();
    return id ? { kind: 'edit', id } : null;
  });

  const close = useCallback(() => {
    clearProjectParam();
    setTarget(null);
    window.scrollTo({ top: 0 });
  }, []);

  if (!target) {
    return (
      <PortfolioManager
        onNewProject={(preloadUrls) => setTarget({ kind: 'new', preloadUrls })}
        onEditProject={(id) => setTarget({ kind: 'edit', id })}
      />
    );
  }
  return <ProjectForm key={target.kind === 'edit' ? target.id : 'new'} target={target} onClose={close} />;
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

const EMPTY_FIELDS: ProjectFormFields = {
  title: '',
  location: '',
  service_types: [],
  client_first_name: '',
  date_completed: '',
  budget_range: '',
  duration: '',
  challenge: '',
  solution: '',
  materials_used: [],
  special_features: [],
  testimonial_text: '',
  testimonial_rating: 5,
  seo_title: '',
  meta_description: '',
  url_slug: '',
  focus_keyword: '',
};

let keySeq = 0;
const newKey = () => `img-${Date.now().toString(36)}-${(keySeq += 1)}`;
const newPairKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `pair-${newKey()}`;

/** Fill each derived field the owner has not typed over. */
function withDefaults(f: ProjectFormFields, touched: TouchedDefaults): ProjectFormFields {
  return {
    ...f,
    seo_title: touched.seo_title ? f.seo_title : defaultSeoTitle(f.title, f.location),
    meta_description: touched.meta_description
      ? f.meta_description
      : f.title ? defaultMetaDescription(f.challenge, f.solution, f.service_types, f.location) : '',
    url_slug: touched.url_slug ? f.url_slug : deriveSlug(f.title, f.location),
  };
}

/** Default alt text follows category, services and location until the owner edits it. */
function withAltDefaults(images: FormImage[], f: ProjectFormFields): FormImage[] {
  return images.map((img) => img.altTouched
    ? img
    : { ...img, alt_text: defaultAltText(img.category, f.service_types, f.location) });
}

function mediaTypeFromUrl(url: string): 'image' | 'video' {
  return /\.(mp4|m4v|mov|webm)(\?|$)/i.test(url) ? 'video' : 'image';
}

type Errors = Partial<Record<'title' | 'location' | 'service_types' | 'images', string>>;

function ProjectForm({ target, onClose }: { target: FormTarget; onClose: () => void }) {
  const isEdit = target.kind === 'edit';
  const [fields, setFields] = useState<ProjectFormFields>(() => ({ ...EMPTY_FIELDS, date_completed: currentMonth() }));
  const [touched, setTouched] = useState<TouchedDefaults>({ seo_title: false, meta_description: false, url_slug: false });
  // A new draft from storage photos: attached as After, no re-upload.
  const [images, setImages] = useState<FormImage[]>(() => (target.kind === 'new' ? target.preloadUrls ?? [] : [])
    .map((url, i) => ({
      key: newKey(),
      url,
      previewUrl: url,
      media_type: mediaTypeFromUrl(url),
      category: 'after' as ImageCategory,
      alt_text: defaultAltText('after', [], ''),
      altTouched: false,
      is_featured: i === 0,
      status: 'ready' as const,
      name: url.split('/').pop(),
    })));
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [areas, setAreas] = useState<string[]>([]);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  /** Once the owner places the star, it stays where they put it. */
  const starTouched = useRef(isEdit);

  // Location suggestions: service_areas is an existing, publicly readable table.
  useEffect(() => {
    supabase.from('service_areas').select('name').eq('active', true).order('name').then(({ data }) => {
      if (data) setAreas(data.map((a: { name: string }) => a.name));
    });
  }, []);

  // Editing: load the project and its media through the admin API.
  useEffect(() => {
    if (target.kind !== 'edit') return;
    let cancelled = false;
    projectsApi.get(target.id).then(({ project: p }) => {
      if (cancelled) return;
      const s = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : '');
      const list = (k: string) => (Array.isArray(p[k]) ? (p[k] as string[]) : []);
      const loaded: ProjectFormFields = {
        title: s('title'),
        location: s('location'),
        service_types: list('service_types'),
        client_first_name: s('client_first_name'),
        date_completed: s('date_completed').slice(0, 7),
        budget_range: s('budget_range'),
        duration: s('duration'),
        challenge: s('challenge'),
        solution: s('solution'),
        materials_used: list('materials_used'),
        special_features: list('special_features'),
        testimonial_text: s('testimonial_text'),
        testimonial_rating: typeof p.testimonial_rating === 'number' && p.testimonial_rating > 0 ? p.testimonial_rating : 5,
        seo_title: s('seo_title'),
        meta_description: s('meta_description'),
        url_slug: s('url_slug'),
        focus_keyword: s('focus_keyword'),
      };
      const t: TouchedDefaults = {
        seo_title: !!loaded.seo_title,
        meta_description: !!loaded.meta_description,
        url_slug: !!loaded.url_slug,
      };
      const rows = (Array.isArray(p.project_images) ? p.project_images : []) as Array<Record<string, unknown>>;
      rows.sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
      const imgs: FormImage[] = rows.map((r) => {
        const url = String(r.image_url ?? '');
        const category = (['before', 'during', 'after'].includes(String(r.image_category)) ? r.image_category : 'after') as ImageCategory;
        return {
          key: newKey(),
          url,
          previewUrl: url,
          media_type: r.media_type === 'video' ? 'video' : mediaTypeFromUrl(url),
          category,
          alt_text: typeof r.alt_text === 'string' ? r.alt_text : '',
          altTouched: typeof r.alt_text === 'string' && r.alt_text.length > 0,
          is_featured: r.is_featured === true,
          pair_key: typeof r.pair_key === 'string' ? r.pair_key : undefined,
          caption: typeof r.caption === 'string' ? r.caption : undefined,
          status: 'ready',
        };
      });
      setTouched(t);
      setFields(withDefaults(loaded, t));
      setImages(withAltDefaults(imgs, loaded));
      setStatus((p.status as ProjectStatus) ?? (p.active ? 'published' : 'archived'));
      setLoading(false);
    }).catch((err) => {
      if (cancelled) return;
      toast({ title: 'Could not open the project', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
      onClose();
    });
    return () => { cancelled = true; };
  }, [target, onClose]);

  const update = useCallback((patch: Partial<ProjectFormFields>, touchedKey?: keyof TouchedDefaults) => {
    const nextTouched = touchedKey ? { ...touched, [touchedKey]: true } : touched;
    if (touchedKey) setTouched(nextTouched);
    const next = withDefaults({ ...fieldsRef.current, ...patch }, nextTouched);
    setFields(next);
    if ('service_types' in patch || 'location' in patch) setImages((prev) => withAltDefaults(prev, next));
    setErrors((e) => {
      const copy = { ...e };
      for (const k of Object.keys(patch)) delete copy[k as keyof Errors];
      return copy;
    });
  }, [touched]);

  // ---- media -------------------------------------------------------------

  const patchImage = useCallback((key: string, patch: Partial<FormImage>) => {
    setImages((prev) => {
      const target = prev.find((i) => i.key === key);
      if (!target) return prev;
      // Moving a paired photo to another stage breaks the pair: unlink both halves.
      const breaksPair = patch.category && patch.category !== target.category && target.pair_key;
      const next = prev.map((img) => {
        if (img.key === key) {
          const merged = { ...img, ...patch };
          if (breaksPair) { merged.pair_key = undefined; merged.caption = undefined; }
          return merged.altTouched ? merged : { ...merged, alt_text: defaultAltText(merged.category, fieldsRef.current.service_types, fieldsRef.current.location) };
        }
        if (breaksPair && img.pair_key === target.pair_key) return { ...img, pair_key: undefined, caption: undefined };
        return img;
      });
      // The automatic star belongs on an After photo: follow it when its photo becomes Before/During.
      if (!starTouched.current && target.is_featured && patch.category && patch.category !== 'after') {
        const after = next.find((i) => i.category === 'after' && i.media_type === 'image');
        if (after) return next.map((i) => ({ ...i, is_featured: i.key === after.key }));
      }
      return next;
    });
  }, []);

  const addFiles = useCallback((files: File[]) => {
    const accepted: Array<{ file: File; item: FormImage }> = [];
    for (const file of files) {
      const video = isVideoFile(file);
      if (!video && !isImageFile(file)) {
        toast({ title: 'Not a photo or video', description: file.name, variant: 'destructive' });
        continue;
      }
      const heic = /\.(heic|heif)$/i.test(file.name) || /hei[cf]/i.test(file.type);
      accepted.push({
        file,
        item: {
          key: newKey(),
          url: '',
          previewUrl: heic ? '' : URL.createObjectURL(file),
          media_type: video ? 'video' : 'image',
          category: 'after',
          alt_text: defaultAltText('after', fieldsRef.current.service_types, fieldsRef.current.location),
          altTouched: false,
          is_featured: false,
          status: 'uploading',
          name: file.name,
        },
      });
    }
    if (accepted.length === 0) return;
    setImages((prev) => {
      const next = [...prev, ...accepted.map((a) => a.item)];
      if (!next.some((i) => i.is_featured)) {
        const first = next.find((i) => i.media_type === 'image') ?? next[0];
        return next.map((i) => ({ ...i, is_featured: i.key === first.key }));
      }
      return next;
    });
    setErrors((e) => ({ ...e, images: undefined }));

    // Three at a time: fast on a good connection, gentle on a phone hotspot.
    const queue = [...accepted];
    const worker = async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const { file, item } = job;
        try {
          const uploaded = await uploadMedia(file);
          if (item.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
          patchImage(item.key, { url: uploaded.url, previewUrl: uploaded.url, media_type: uploaded.media_type, status: 'ready', error: undefined });
        } catch (err) {
          patchImage(item.key, { status: 'error', error: err instanceof Error ? err.message : 'Upload failed' });
        }
      }
    };
    void Promise.all([worker(), worker(), worker()]);
  }, [patchImage]);

  const setFeatured = useCallback((key: string) => {
    starTouched.current = true;
    setImages((prev) => prev.map((i) => ({ ...i, is_featured: i.key === key })));
  }, []);

  const removeImage = useCallback((key: string) => {
    setImages((prev) => {
      const gone = prev.find((i) => i.key === key);
      let next = prev.filter((i) => i.key !== key);
      if (gone?.pair_key) next = next.map((i) => (i.pair_key === gone.pair_key ? { ...i, pair_key: undefined, caption: undefined } : i));
      if (gone?.is_featured && next.length > 0) {
        const first = next.find((i) => i.category === 'after' && i.media_type === 'image') ?? next[0];
        next = next.map((i) => ({ ...i, is_featured: i.key === first.key }));
      }
      if (gone?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(gone.previewUrl);
      return next;
    });
  }, []);

  const linkPair = useCallback((beforeKey: string, afterKey: string, label?: string) => {
    const pair = newPairKey();
    setImages((prev) => prev.map((i) => (i.key === beforeKey || i.key === afterKey ? { ...i, pair_key: pair, caption: label } : i)));
  }, []);

  const unlinkPair = useCallback((pairKey: string) => {
    setImages((prev) => prev.map((i) => (i.pair_key === pairKey ? { ...i, pair_key: undefined, caption: undefined } : i)));
  }, []);

  // ---- save ----------------------------------------------------------------

  const uploading = images.filter((i) => i.status === 'uploading').length;
  const failed = images.filter((i) => i.status === 'error').length;
  const ready = useMemo(() => images.filter((i) => i.status === 'ready'), [images]);
  const isLive = status === 'published';

  const validate = (): Errors => {
    const e: Errors = {};
    if (!fields.title.trim()) e.title = 'Add a title.';
    if (!fields.location.trim()) e.location = 'Add a location.';
    if (fields.service_types.length === 0) e.service_types = 'Pick at least one service.';
    if (ready.length === 0) e.images = 'Add at least one photo or video.';
    return e;
  };

  const save = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) {
      requestAnimationFrame(() => {
        document.querySelector('[data-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      return;
    }
    const body = {
      ...fields,
      title: fields.title.trim(),
      location: fields.location.trim(),
      date_completed: fields.date_completed || null,
      // The public page shows stars whenever a rating is set; without a
      // testimonial there is nothing to rate, so no stars.
      testimonial_rating: fields.testimonial_text.trim() ? fields.testimonial_rating : null,
      url_slug: fields.url_slug.replace(/^-+|-+$/g, ''),
      images: ready.map((img, i) => ({
        url: img.url,
        media_type: img.media_type,
        category: img.category,
        alt_text: img.alt_text,
        is_featured: img.is_featured,
        sort_order: i,
        pair_key: img.pair_key ?? null,
        caption: img.caption ?? null,
      })),
    };
    setSaving(true);
    try {
      if (target.kind === 'edit') {
        await projectsApi.update(target.id, body);
        toast({ title: isLive ? 'Changes saved' : 'Draft saved', description: isLive ? 'The live page updates within a minute.' : 'Publish it from the Drafts list.' });
      } else {
        await projectsApi.create(body);
        toast({ title: 'Draft saved', description: 'It is not on the site yet. Publish it from the Drafts list.' });
      }
      onClose();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not save. Try again.';
      toast({ title: 'Not saved', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
        <span className="sr-only">Loading project</span>
      </div>
    );
  }

  const saveLabel = isEdit && status && status !== 'draft' ? 'Save changes' : 'Save draft';

  return (
    <div className="space-y-6" data-testid="project-form">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            {isEdit ? 'Edit Project' : 'Add New Project'}
            {status && <StatusBadge status={status} />}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isLive ? 'This project is live. Saving keeps it published.' : 'Saving creates a draft. Nothing goes on the site until you publish it.'}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onClose}>
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
          Back to Portfolio
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-6 pt-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5" data-invalid={!!errors.title}>
              <Label htmlFor="pf-title">Title</Label>
              <Input
                id="pf-title"
                value={fields.title}
                onChange={(e) => update({ title: e.target.value })}
                placeholder="e.g. Modern Kitchen Remodel"
                aria-invalid={!!errors.title}
                aria-describedby={errors.title ? 'pf-title-err' : undefined}
                className={cn(errors.title && 'border-destructive')}
              />
              {errors.title && <p id="pf-title-err" className="text-xs text-destructive">{errors.title}</p>}
            </div>
            <div className="space-y-1.5" data-invalid={!!errors.location}>
              <Label htmlFor="pf-location">Location</Label>
              <Input
                id="pf-location"
                list="pf-location-options"
                value={fields.location}
                onChange={(e) => update({ location: e.target.value })}
                placeholder="Town, e.g. Clifton"
                autoComplete="off"
                aria-invalid={!!errors.location}
                aria-describedby={errors.location ? 'pf-location-err' : undefined}
                className={cn(errors.location && 'border-destructive')}
              />
              <datalist id="pf-location-options">
                {areas.map((a) => <option key={a} value={a} />)}
              </datalist>
              {errors.location && <p id="pf-location-err" className="text-xs text-destructive">{errors.location}</p>}
            </div>
          </div>

          <fieldset className="space-y-2" data-invalid={!!errors.service_types} aria-describedby={errors.service_types ? 'pf-services-err' : undefined}>
            <legend className="text-sm font-medium">Service types</legend>
            <div className="flex flex-wrap gap-2">
              {SERVICE_TYPES.map((service) => {
                const on = fields.service_types.includes(service);
                return (
                  <label
                    key={service}
                    className={cn(
                      'flex cursor-pointer select-none items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors',
                      'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                      on ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-muted',
                      errors.service_types && !on && 'border-destructive',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      onChange={() => update({
                        service_types: on ? fields.service_types.filter((s) => s !== service) : [...fields.service_types, service],
                      })}
                    />
                    {service}
                  </label>
                );
              })}
            </div>
            {errors.service_types && <p id="pf-services-err" className="text-xs text-destructive">{errors.service_types}</p>}
          </fieldset>

          <div className="space-y-2" data-invalid={!!errors.images}>
            <p className="text-sm font-medium" id="pf-media-label">Photos and videos</p>
            <PhotoGrid
              images={images}
              onAddFiles={addFiles}
              onChangeImage={patchImage}
              onSetFeatured={setFeatured}
              onRemove={removeImage}
              invalid={!!errors.images}
            />
            {errors.images && <p className="text-xs text-destructive">{errors.images}</p>}
          </div>

          <PairLinker images={images} onLink={linkPair} onUnlink={unlinkPair} />

          <MoreDetailsSection fields={fields} update={update} />
          <SeoSection fields={fields} update={update} slugLocked={isLive} />
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur">
        {(uploading > 0 || failed > 0) && (
          <p className="mr-auto text-sm text-muted-foreground" role="status">
            {uploading > 0 && `Uploading ${uploading} file${uploading > 1 ? 's' : ''}...`}
            {uploading > 0 && failed > 0 && ' '}
            {failed > 0 && <span className="text-destructive">{failed} upload{failed > 1 ? 's' : ''} failed; remove {failed > 1 ? 'them' : 'it'} to save.</span>}
          </p>
        )}
        <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="button" onClick={save} disabled={saving || uploading > 0 || failed > 0} data-testid="project-save">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
          {saving ? 'Saving...' : saveLabel}
        </Button>
      </div>
    </div>
  );
}
