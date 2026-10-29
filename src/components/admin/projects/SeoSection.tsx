'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { META_DESCRIPTION_MAX, SEO_TITLE_MAX, renderedSeoTitle } from '@/lib/projects/slug';
import { FoldSection } from './FormBits';
import type { ProjectFormFields, TouchedDefaults } from './types';

interface SeoSectionProps {
  fields: ProjectFormFields;
  update: (patch: Partial<ProjectFormFields>, touched?: keyof TouchedDefaults) => void;
  slugLocked: boolean;
}

function Count({ n, max }: { n: number; max: number }) {
  return <Badge variant={n > max ? 'destructive' : 'secondary'} className="text-[10px]">{n}/{max}</Badge>;
}

/**
 * SEO fields, prefilled from title, location and the story (src/lib/projects/slug.ts)
 * and only overridden when the owner types into them. No AI suggestions.
 */
export function SeoSection({ fields, update, slugLocked }: SeoSectionProps) {
  const rendered = renderedSeoTitle(fields.seo_title);
  return (
    <FoldSection title="SEO" hint="Prefilled from the title and location; edit only if you want to" testId="seo-section">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="pf-seo-title">SEO title</Label>
          <Count n={rendered.length} max={SEO_TITLE_MAX} />
        </div>
        <Input id="pf-seo-title" value={fields.seo_title} onChange={(e) => update({ seo_title: e.target.value }, 'seo_title')} />
        <p className="text-xs text-muted-foreground">&quot; | La Vaca GC&quot; is added automatically.</p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="pf-meta">Meta description</Label>
          <Count n={fields.meta_description.length} max={META_DESCRIPTION_MAX} />
        </div>
        <Textarea id="pf-meta" rows={3} value={fields.meta_description}
          onChange={(e) => update({ meta_description: e.target.value }, 'meta_description')} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pf-slug">URL slug</Label>
          <Input id="pf-slug" value={fields.url_slug}
            onChange={(e) => update({ url_slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-') }, 'url_slug')} />
          <p className="truncate text-xs text-muted-foreground">
            lavacagc.com/projects/<span className="font-medium text-foreground">{fields.url_slug || '...'}</span>
          </p>
          {slugLocked && (
            <p className="text-xs text-amber-700">This project is live. Changing the slug breaks links to the old address.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-keyword">Focus keyword</Label>
          <Input id="pf-keyword" value={fields.focus_keyword} onChange={(e) => update({ focus_keyword: e.target.value })}
            placeholder="e.g. kitchen remodel clifton nj" />
        </div>
      </div>

      {rendered && (
        <div className="rounded-lg border bg-white p-3 text-left" aria-label="Search result preview">
          <p className="truncate text-lg leading-tight text-blue-700">{rendered}</p>
          <p className="truncate text-sm text-green-700">www.lavacagc.com/projects/{fields.url_slug || '...'}</p>
          <p className="line-clamp-2 text-sm text-gray-600">{fields.meta_description}</p>
        </div>
      )}
    </FoldSection>
  );
}
