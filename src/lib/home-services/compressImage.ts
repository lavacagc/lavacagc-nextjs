/**
 * Browser-side shrink for offer attachments (the sub's detail request and
 * Alex's reply): max 1600 px on the long edge, JPEG 0.8, the same rule as the
 * request flow's photo uploader (RF2). HEIC is converted first.
 *
 * Why: a function body on Vercel is capped near 4.5 MB, and two phone photos
 * straight off the camera are already past that. The server enforces 3.5 MB a
 * file and 4 MB a body regardless (attachments.ts); this keeps ordinary photos
 * well inside it.
 *
 * PDFs and anything the browser cannot decode pass through unchanged and are
 * judged by the server's caps. Client-only (uses canvas).
 */

export const MAX_EDGE = 1600;
export const JPEG_QUALITY = 0.8;

function isHeic(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

function isRaster(file: File): boolean {
  return /^image\/(jpeg|png|webp)$/i.test(file.type) || isHeic(file);
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
    img.src = url;
  });
}

/** One file, shrunk to a JPEG when it is a photo; unchanged otherwise or on any failure. */
export async function compressForUpload(file: File): Promise<File> {
  if (!isRaster(file)) return file;
  try {
    let source: Blob = file;
    if (isHeic(file)) {
      const { convertHeicToJpeg } = await import('@/utils/heicConverter');
      source = await convertHeicToJpeg(file);
    }
    let width = 0;
    let height = 0;
    let draw: ((ctx: CanvasRenderingContext2D, w: number, h: number) => void) | null = null;
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
    if (!ctx) return file;
    // PNG transparency would turn black in a JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    draw(ctx, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob) return file;
    // An already-small JPEG can come out larger; keep whichever is smaller.
    if (file.type === 'image/jpeg' && scale === 1 && blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export async function compressAll(files: File[]): Promise<File[]> {
  return Promise.all(files.map(compressForUpload));
}
