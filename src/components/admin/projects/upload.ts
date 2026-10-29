/**
 * Getting a dropped file into storage from the admin form.
 *
 * Photos: HEIC is converted to JPEG in the browser, and anything over 3.5 MB
 * is re-encoded (long edge 3200 px) so it fits through the upload function,
 * whose body Vercel caps at 4.5 MB. A 10 MB phone photo becomes roughly 1 to
 * 3 MB at a resolution still well past what any page displays. The server
 * sniffs the bytes and stores them with the service key.
 *
 * Videos: too large for any function body, so the server mints a signed upload
 * URL, the browser uploads straight to storage, and the server then sniffs the
 * stored object (deleting it if it is not a video).
 */
import { supabase } from '@/integrations/supabase/client';
import { PROJECT_IMAGES_BUCKET } from '@/lib/projects/fields';
import { convertHeicToJpeg } from '@/utils/heicConverter';
import { api } from './api';

const REENCODE_ABOVE_BYTES = 3.5 * 1024 * 1024;
const TARGET_MAX_BYTES = 3.8 * 1024 * 1024;
const MAX_EDGE = 3200;

export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || /\.(mp4|m4v|mov|webm)$/i.test(file.name);
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    // Honors EXIF orientation, so a portrait phone photo stays upright.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the photo.'))), 'image/jpeg', quality);
  });
}

/** HEIC to JPEG, and large photos re-encoded to fit the upload function. */
export async function prepareImage(file: File): Promise<File> {
  const converted = await convertHeicToJpeg(file);
  if (converted.size <= REENCODE_ABOVE_BYTES) return converted;

  const decoded = await decode(converted);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(decoded.width, decoded.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(decoded.width * scale);
    canvas.height = Math.round(decoded.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not resize the photo.');
    ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
    let blob: Blob | null = null;
    for (const quality of [0.86, 0.8, 0.72, 0.62, 0.5]) {
      blob = await toBlob(canvas, quality);
      if (blob.size <= TARGET_MAX_BYTES) break;
    }
    if (!blob || blob.size > TARGET_MAX_BYTES) throw new Error('This photo is too large even after resizing.');
    return new File([blob], converted.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } finally {
    decoded.close();
  }
}

export interface UploadedMedia {
  url: string;
  media_type: 'image' | 'video';
}

async function uploadVideo(file: File): Promise<UploadedMedia> {
  const signed = await api<{ path: string; token: string }>('/api/admin/projects/upload', {
    method: 'POST',
    body: JSON.stringify({ action: 'sign', filename: file.name, size: file.size, kind: 'video' }),
  });
  const { error } = await supabase.storage
    .from(PROJECT_IMAGES_BUCKET)
    .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type || 'video/mp4' });
  if (error) throw new Error('The video upload did not finish. Try again.');
  return api<UploadedMedia>('/api/admin/projects/upload', {
    method: 'POST',
    body: JSON.stringify({ action: 'verify', path: signed.path }),
  });
}

async function uploadImage(file: File): Promise<UploadedMedia> {
  const prepared = await prepareImage(file);
  const form = new FormData();
  form.append('file', prepared);
  return api<UploadedMedia>('/api/admin/projects/upload', { method: 'POST', body: form });
}

export function uploadMedia(file: File): Promise<UploadedMedia> {
  return isVideoFile(file) ? uploadVideo(file) : uploadImage(file);
}
