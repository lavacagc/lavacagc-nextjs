/**
 * The admin editor and list publish through the server so the publish guard
 * holds them the same way it holds Claude (PG4). Browser-side caller of
 * POST /api/admin/articles/<id>/publish (admin session cookie, same origin).
 *
 * Client-safe.
 */

export type AdminPublishResult =
  | { status: 'published'; slug: string; overridden: boolean }
  | { status: 'held'; reasons: string[] }
  | { status: 'error'; message: string };

export async function adminPublishArticle(id: string, opts: { override?: boolean } = {}): Promise<AdminPublishResult> {
  try {
    const res = await fetch(`/api/admin/articles/${encodeURIComponent(id)}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(opts.override ? { override: true } : {}),
    });
    const body = await res.json().catch(() => ({})) as { slug?: string; overridden?: boolean; hold?: string[]; error?: string };
    if (res.status === 409 && Array.isArray(body.hold)) return { status: 'held', reasons: body.hold };
    if (!res.ok) return { status: 'error', message: body.error || `Publish failed (${res.status})` };
    return { status: 'published', slug: body.slug ?? '', overridden: body.overridden === true };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Publish failed' };
  }
}
