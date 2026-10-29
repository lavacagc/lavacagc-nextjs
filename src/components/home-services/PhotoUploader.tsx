'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, X } from 'lucide-react';
import type { Lang } from '@/lib/home-services/catalog';
import { s } from '@/lib/home-services/i18n';

export const MAX_PHOTOS = 10;
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.8;

type Status = 'queued' | 'uploading' | 'done' | 'error';

interface PhotoItem {
  key: string;
  previewUrl: string;
  status: Status;
  progress: number;
  file: File;
  id?: string;
}

export interface PhotoState {
  ids: string[];
  draftToken: string | null;
  busy: boolean;
}

function isHeic(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode failed'));
    };
    img.src = url;
  });
}

/** Max 1600 px on the long edge, JPEG 0.8 (RF2). HEIC is converted first, and only then is heic2any loaded. */
async function compress(file: File): Promise<Blob> {
  let source: Blob = file;
  if (isHeic(file)) {
    const { convertHeicToJpeg } = await import('@/utils/heicConverter');
    source = await convertHeicToJpeg(file);
  }
  let width: number;
  let height: number;
  let draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' }).catch(() => null);
    if (bitmap) {
      width = bitmap.width;
      height = bitmap.height;
      draw = (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h);
    }
  }
  if (!draw) {
    const img = await loadImage(source);
    width = img.naturalWidth;
    height = img.naturalHeight;
    draw = (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h);
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  draw(ctx, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))), 'image/jpeg', JPEG_QUALITY),
  );
}

/** XHR rather than fetch: fetch has no upload progress, and the thumbnails show it. */
function upload(
  blob: Blob,
  draftToken: string | null,
  onProgress: (pct: number) => void,
  register: (xhr: XMLHttpRequest) => void,
): Promise<{ id: string; draft_token: string }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('photo', blob, 'photo.jpg');
    if (draftToken) form.append('draft_token', draftToken);
    const xhr = new XMLHttpRequest();
    register(xhr);
    xhr.open('POST', '/api/home-services/photos');
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      const body = xhr.response as { id?: string; draft_token?: string; error?: string } | null;
      if (xhr.status === 200 && body?.id && body.draft_token) resolve({ id: body.id, draft_token: body.draft_token });
      else reject(new Error(body?.error || `status ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('network'));
    xhr.onabort = () => reject(new Error('aborted'));
    xhr.send(form);
  });
}

export interface PhotoUploads {
  items: PhotoItem[];
  notice: string | null;
  state: PhotoState;
  add: (files: FileList | null) => void;
  remove: (key: string) => void;
  /** Forget everything (after a submitted request); in-flight uploads are aborted. */
  reset: () => void;
}

/**
 * The upload queue, owned by the request flow rather than by the uploader's
 * markup. The sheet's content unmounts when it closes (Radix), and the flow
 * itself stays mounted, so keeping the queue here means a homeowner who closes
 * the sheet to look at another card and reopens it still has every photo, the
 * draft token, and any upload still in flight - exactly like the answers and
 * the address.
 */
export function usePhotoUploads(lang: Lang): PhotoUploads {
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const runningRef = useRef(false);
  const xhrs = useRef(new Map<string, XMLHttpRequest>());
  const itemsRef = useRef<PhotoItem[]>([]);
  itemsRef.current = items;

  const patch = (key: string, change: Partial<PhotoItem>) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...change } : it)));

  // Leaving the page is the only unmount: abort what is still uploading.
  useEffect(() => {
    const live = xhrs.current;
    return () => {
      live.forEach((x) => x.abort());
    };
  }, []);

  async function drain() {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      for (;;) {
        const next = itemsRef.current.find((i) => i.status === 'queued');
        if (!next) break;
        patch(next.key, { status: 'uploading', progress: 0 });
        itemsRef.current = itemsRef.current.map((i) => (i.key === next.key ? { ...i, status: 'uploading' } : i));
        try {
          const blob = await compress(next.file);
          const result = await upload(
            blob,
            tokenRef.current,
            (pct) => patch(next.key, { progress: pct }),
            (xhr) => xhrs.current.set(next.key, xhr),
          );
          tokenRef.current = result.draft_token;
          patch(next.key, { status: 'done', progress: 100, id: result.id });
        } catch (err) {
          if (!(err instanceof Error && err.message === 'aborted')) {
            patch(next.key, { status: 'error' });
            setNotice(err instanceof Error && err.message === 'too_many_photos' ? s('photoLimit', lang) : s('photoFailed', lang));
          }
        } finally {
          xhrs.current.delete(next.key);
        }
        // Let React commit before reading the queue again.
        await new Promise((r) => setTimeout(r, 0));
      }
    } finally {
      runningRef.current = false;
    }
  }

  function add(fileList: FileList | null) {
    if (!fileList?.length) return;
    setNotice(null);
    const live = itemsRef.current.filter((i) => i.status !== 'error').length;
    const room = Math.max(0, MAX_PHOTOS - live);
    const files = Array.from(fileList).slice(0, room);
    if (fileList.length > room) setNotice(s('photoLimit', lang));
    const fresh: PhotoItem[] = files.map((file, i) => ({
      key: `${Date.now()}-${i}-${file.name}`,
      // HEIC has no browser preview; the thumbnail shows a spinner until it uploads.
      previewUrl: isHeic(file) ? '' : URL.createObjectURL(file),
      status: 'queued',
      progress: 0,
      file,
    }));
    itemsRef.current = [...itemsRef.current, ...fresh];
    setItems(itemsRef.current);
    void drain();
  }

  function remove(key: string) {
    xhrs.current.get(key)?.abort();
    const item = itemsRef.current.find((i) => i.key === key);
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
    itemsRef.current = itemsRef.current.filter((i) => i.key !== key);
    setItems(itemsRef.current);
  }

  function reset() {
    xhrs.current.forEach((x) => x.abort());
    itemsRef.current.forEach((i) => i.previewUrl && URL.revokeObjectURL(i.previewUrl));
    itemsRef.current = [];
    tokenRef.current = null;
    setItems([]);
    setNotice(null);
  }

  const state: PhotoState = {
    ids: items.filter((i) => i.status === 'done' && i.id).map((i) => i.id!),
    draftToken: tokenRef.current,
    busy: items.some((i) => i.status === 'queued' || i.status === 'uploading'),
  };

  return { items, notice, state, add, remove, reset };
}

/**
 * Camera first, gallery second (RF2; the camera button only shows on touch
 * devices, where `capture` opens the camera). Each photo is compressed and
 * uploaded the moment it is picked, one at a time so the first response's
 * draft token is reused by the rest. Thumbnails show progress and a remove
 * control; a removed photo is simply not named on submit, and the server purge
 * deletes it after 48 h. Presentational: the queue lives in usePhotoUploads.
 */
export default function PhotoUploader({ lang, uploads }: { lang: Lang; uploads: PhotoUploads }) {
  const { items, notice, add, remove } = uploads;
  const count = items.filter((i) => i.status !== 'error').length;
  const full = count >= MAX_PHOTOS;

  return (
    <div>
      <p className="text-[15px] font-bold text-text-primary">{s('photosLabel', lang)}</p>
      <p className="mt-1 text-sm text-text-secondary">{s('photosHint', lang)}</p>
      <ul className="mt-2 space-y-1 text-sm text-text-secondary" data-testid="photo-tips">
        {(['photoTip1', 'photoTip2', 'photoTip3'] as const).map((k) => (
          <li key={k} className="flex gap-2"><span aria-hidden className="text-primary">&#8226;</span><span>{s(k, lang)}</span></li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2.5">
        <label
          className={`inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-bold text-white focus-within:ring-4 focus-within:ring-secondary/40 [@media(pointer:fine)]:hidden ${full ? 'pointer-events-none opacity-50' : ''}`}
        >
          <Camera aria-hidden className="h-4 w-4" />
          {s('takePhoto', lang)}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={full}
            data-testid="photo-camera"
            onChange={(e) => {
              add(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
        <label
          className={`inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border-2 border-secondary bg-card px-4 py-2.5 text-sm font-bold text-secondary focus-within:ring-4 focus-within:ring-secondary/40 ${full ? 'pointer-events-none opacity-50' : ''}`}
        >
          <ImagePlus aria-hidden className="h-4 w-4" />
          {s('choosePhotos', lang)}
          <input
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            className="sr-only"
            disabled={full}
            data-testid="photo-input"
            onChange={(e) => {
              add(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {notice && (
        <p role="status" className="mt-2 text-sm font-semibold text-red-700">
          {notice}
        </p>
      )}
      {items.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-5" aria-label={s('photosLabel', lang)}>
          {items.map((item, index) => (
            <li
              key={item.key}
              data-testid="photo-thumb"
              data-status={item.status}
              className="relative aspect-square overflow-hidden rounded-lg border border-border bg-background-soft"
            >
              {item.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- local blob: preview, next/image cannot optimise it
                <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
              {(item.status === 'uploading' || item.status === 'queued') && (
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45 text-[11px] font-bold text-white">
                  <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                  <span>
                    {s('uploading', lang)} {item.progress}%
                  </span>
                </span>
              )}
              {item.status === 'error' && (
                <span className="absolute inset-0 flex items-center justify-center bg-red-700/80 p-1 text-center text-[10px] font-bold text-white">
                  {s('photoFailed', lang)}
                </span>
              )}
              <span className="sr-only">
                {index + 1}: {item.status === 'done' ? s('photoUploaded', lang) : item.status === 'error' ? s('photoFailed', lang) : s('uploading', lang)}
              </span>
              <button
                type="button"
                onClick={() => remove(item.key)}
                aria-label={`${s('removePhoto', lang)} ${index + 1}`}
                className="absolute right-0.5 top-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
