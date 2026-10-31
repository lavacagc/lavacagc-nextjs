// Pure helpers for the warranty notification, split out so they can be tested
// against a real bucket (photos.test.ts) without serving the function.

/** Object paths the form uploads: `<ms>-<index>-<file name>`, no folders. */
export const PHOTO_PATH = /^[0-9]+-[0-9]+-[^/\\]{1,1000}$/;
export const PHOTO_LINK_SECONDS = 60 * 60 * 24 * 30;

/** Every visitor-supplied string is escaped before it enters an email's HTML. */
export const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

interface SigningClient {
  storage: {
    from(bucket: string): {
      createSignedUrls(paths: string[], expiresIn: number): Promise<{
        data: { signedUrl: string | null }[] | null;
        error: { message: string } | null;
      }>;
    };
  };
}

/** Signed links to private warranty photos; any that fail are reported by path. */
export async function signWarrantyPhotos(client: SigningClient, paths: string[]) {
  if (paths.length === 0) return { urls: [] as string[], unsigned: [] as string[] };
  const { data, error } = await client.storage.from('warranty-images').createSignedUrls(paths, PHOTO_LINK_SECONDS);
  if (error) console.error('Signing warranty photos failed:', error.message);
  const urls: string[] = [];
  const unsigned: string[] = [];
  paths.forEach((p, i) => {
    const u = data?.[i]?.signedUrl;
    if (u) urls.push(u); else unsigned.push(p);
  });
  return { urls, unsigned };
}
