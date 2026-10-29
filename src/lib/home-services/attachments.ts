/**
 * Files on an offer conversation: the sub's detail request (OF4) and Alex's
 * answer (BD5). Up to 3 files, 6 MB each, type decided by magic bytes, stored
 * privately under service-request-photos/offers/<offer id>/<recipient id>/.
 */
import { randomUUID } from 'crypto';
import { MAX_RESPONSE_FILES, MAX_RESPONSE_FILE_BYTES, type Attachment } from './offerRules';
import { extensionFor, removeObjects, sniffContentType, uploadObject } from './storage';

export type AttachmentError = 'too_many_files' | 'file_too_big' | 'bad_file_type' | 'upload_failed';

/** Multipart bodies carry at most 3 x 6 MB plus form fields. */
export const MAX_MULTIPART_BYTES = MAX_RESPONSE_FILES * MAX_RESPONSE_FILE_BYTES + 64 * 1024;

export async function storeAttachments(
  files: File[],
  offerId: string,
  recipientId: string,
  who: 'sub' | 'admin',
): Promise<{ ok: true; attachments: Attachment[] } | { ok: false; error: AttachmentError }> {
  const real = files.filter((f) => f && f.size > 0);
  if (real.length > MAX_RESPONSE_FILES) return { ok: false, error: 'too_many_files' };
  if (real.some((f) => f.size > MAX_RESPONSE_FILE_BYTES)) return { ok: false, error: 'file_too_big' };

  const prepared: Array<{ bytes: Uint8Array; type: ReturnType<typeof sniffContentType>; name: string }> = [];
  for (const file of real) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffContentType(bytes);
    if (!type) return { ok: false, error: 'bad_file_type' };
    prepared.push({ bytes, type, name: file.name.slice(0, 120) });
  }

  const stored: Attachment[] = [];
  for (const p of prepared) {
    const path = `offers/${offerId}/${recipientId}/${who}-${randomUUID()}.${extensionFor(p.type!)}`;
    const ok = await uploadObject(path, p.bytes, p.type!);
    if (!ok) {
      await removeObjects(stored.map((s) => s.storage_path));
      return { ok: false, error: 'upload_failed' };
    }
    stored.push({ storage_path: path, content_type: p.type!, bytes: p.bytes.byteLength, name: p.name });
  }
  return { ok: true, attachments: stored };
}

export const ATTACHMENT_ERROR_TEXT: Record<AttachmentError, string> = {
  too_many_files: 'Up to 3 files.',
  file_too_big: 'Each file must be 6 MB or less.',
  bad_file_type: 'Files must be JPEG, PNG, WebP, HEIC or PDF.',
  upload_failed: 'A file could not be stored. Try again.',
};
