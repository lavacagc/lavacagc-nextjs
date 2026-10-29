/**
 * Response shapes the article routes share. Server-only.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { BodyError, readJsonBody, siteOrigin } from '@/lib/projects/http';

/** Where the owner opens the post in the admin editor (AdminContent reads `?post=`). */
export function articleAdminUrl(request: NextRequest, id: string): string {
  return `${siteOrigin(request)}/vaca-mgmt?tab=blog&post=${id}`;
}

/** The admin-only preview of a draft (/blog/preview/[slug]). */
export function articlePreviewUrl(request: NextRequest, slug: string): string {
  return `${siteOrigin(request)}/blog/preview/${slug}`;
}

export function articlePublicUrl(request: NextRequest, slug: string): string {
  return `${siteOrigin(request)}/blog/${slug}`;
}

/** The JSON body, or the error response to send instead. */
export async function readArticleBody(
  request: NextRequest,
  maxBytes?: number,
): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, body: await readJsonBody(request, maxBytes) };
  } catch (err) {
    const e = err as BodyError;
    return { ok: false, response: NextResponse.json({ error: e.message }, { status: e.status ?? 400 }) };
  }
}
