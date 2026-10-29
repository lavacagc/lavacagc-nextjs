'use client';

import { useEffect, useState } from 'react';
import { ImagePlus, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { FoldSection } from './FormBits';
import { MediaThumb } from './MediaThumb';
import { projectsApi, type DraftPhoto } from './api';

function formatSize(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * The photos already sitting in `project-images/drafts/` (decision 002, Q6).
 * Pick some and start a draft from them: the form opens with their public URLs
 * attached as After photos, nothing is uploaded again, and nothing is deleted.
 */
export function DraftPhotosPanel({ onStart }: { onStart: (urls: string[]) => void }) {
  const [photos, setPhotos] = useState<DraftPhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [showUsed, setShowUsed] = useState(false);

  const fetchPhotos = () => {
    projectsApi.draftPhotos()
      .then(({ photos: list }) => setPhotos(list))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not list draft photos.'));
  };
  useEffect(fetchPhotos, []);
  const load = () => {
    setError(null);
    setPhotos(null);
    fetchPhotos();
  };

  const unused = photos?.filter((p) => !p.in_use) ?? [];
  const visible = showUsed ? photos ?? [] : unused;
  const toggle = (url: string) => setSelected((s) => (s.includes(url) ? s.filter((u) => u !== url) : [...s, url]));

  return (
    <FoldSection
      title={`Draft photos in storage${photos ? ` (${unused.length})` : ''}`}
      hint="Photos uploaded earlier but never attached to a project"
      testId="draft-photos-panel"
    >
      {error && (
        <div className="flex items-center justify-between gap-3 text-sm text-destructive">
          {error}
          <Button type="button" variant="outline" size="sm" onClick={load}><RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />Retry</Button>
        </div>
      )}
      {!photos && !error && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading photos
        </p>
      )}
      {photos && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {selected.length > 0 ? `${selected.length} selected` : 'Tick the photos that belong to one project.'}
            </p>
            <div className="flex items-center gap-2">
              {photos.length > unused.length && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowUsed((v) => !v)}>
                  {showUsed ? 'Hide ones already used' : `Show ${photos.length - unused.length} already used`}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                disabled={selected.length === 0}
                onClick={() => onStart(selected)}
                data-testid="start-draft-from-photos"
              >
                <ImagePlus className="mr-1.5 h-4 w-4" aria-hidden />
                Start a draft from these
              </Button>
            </div>
          </div>
          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">No unused photos in drafts/.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {visible.map((p) => {
                const on = selected.includes(p.url);
                return (
                  <li key={p.path}>
                    <label
                      className={cn(
                        'block cursor-pointer overflow-hidden rounded-lg border-2 bg-card transition',
                        on ? 'border-primary ring-2 ring-primary/30' : 'border-transparent hover:border-muted-foreground/30',
                      )}
                      data-testid="draft-photo"
                    >
                      <span className="relative block aspect-[4/3] bg-muted">
                        <MediaThumb src={p.url} alt={p.name} mediaType={p.content_type?.startsWith('video/') ? 'video' : 'image'} sizes="200px" />
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(p.url)}
                          className="absolute left-2 top-2 h-5 w-5 accent-primary"
                          aria-label={`Select ${p.name}`}
                        />
                        {p.in_use && <Badge className="absolute right-1 top-1 text-[10px]" variant="secondary">In use</Badge>}
                      </span>
                      <span className="block px-2 py-1.5">
                        <span className="block truncate text-xs font-medium" title={p.name}>{p.name}</span>
                        <span className="block text-[11px] text-muted-foreground">{formatSize(p.size)}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </FoldSection>
  );
}
