'use client';

import { useCallback, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { toast } from '@/hooks/use-toast';
import { Loader2, Upload, X } from 'lucide-react';

/**
 * Round headshot uploader for the partner agent.
 *
 * The admin picks an image, then drags to reposition and zooms inside a circular
 * frame to choose exactly which portion shows. On save we render the chosen
 * region to a square canvas, upload it to the `listings` bucket, and hand the
 * public URL back to the parent (which stores it on partner_realtor.photo_url).
 * The stored image is a square; it's displayed as a circle everywhere via
 * `rounded-full`.
 */

const OUTPUT_SIZE = 512;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

/** Crop `area` (natural-pixel coords from react-easy-crop) into a square PNG blob. */
async function cropToBlob(src: string, area: Area): Promise<Blob> {
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not export image'))), 'image/png'),
  );
}

export default function HeadshotCropper({
  value,
  onUploaded,
}: {
  value?: string | null;
  onUploaded: (url: string) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_: Area, pixels: Area) => setArea(pixels), []);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Pick an image file', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSrc(reader.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!src || !area) return;
    setSaving(true);
    try {
      const blob = await cropToBlob(src, area);
      const path = `partner/headshot-${Date.now()}.png`;
      const { error } = await supabase.storage
        .from('listings')
        .upload(path, blob, { contentType: 'image/png', upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('listings').getPublicUrl(path);
      onUploaded(data.publicUrl);
      setSrc(null);
      toast({ title: 'Headshot ready', description: 'Click “Save agent” to publish it.' });
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="headshot-cropper">
      <div className="flex items-center gap-3">
        {/* Current/round preview */}
        <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border bg-muted">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="Current headshot" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[10px] text-text-muted">No photo</span>
          )}
        </span>

        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-accent">
          <Upload className="h-4 w-4" />
          {value ? 'Replace headshot' : 'Upload headshot'}
          <input type="file" accept="image/*" className="hidden" onChange={onFile} data-testid="headshot-file" />
        </label>
      </div>

      {src && (
        <div className="rounded-lg border p-3">
          <p className="mb-2 text-xs text-text-muted">Drag to reposition, slide to zoom. The circle is what visitors see.</p>
          <div className="relative h-64 w-full overflow-hidden rounded-md bg-black/80">
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="text-xs text-text-muted">Zoom</span>
            <Slider
              value={[zoom]}
              min={1}
              max={3}
              step={0.01}
              onValueChange={(v) => setZoom(v[0])}
              className="flex-1"
              aria-label="Zoom"
            />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setSrc(null)} disabled={saving}>
              <X className="mr-1 h-4 w-4" /> Cancel
            </Button>
            <Button type="button" size="sm" onClick={save} disabled={saving || !area}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Use this crop
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
