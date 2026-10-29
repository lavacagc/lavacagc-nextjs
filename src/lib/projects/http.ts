/**
 * Small request/response helpers the project routes share (admin and ingest).
 * Server-only.
 */
import { revalidatePath } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';
import type { ZodError } from 'zod';

/** JSON bodies are form fields and URLs; nothing legitimate comes near this. */
export const MAX_JSON_BYTES = 256 * 1024;

export class BodyError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

/** Parse a JSON body, refusing anything over the cap before or after reading it (SEC1). */
export async function readJsonBody(request: NextRequest, maxBytes = MAX_JSON_BYTES): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new BodyError(413, 'Request body is too large.');
  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new BodyError(413, 'Request body is too large.');
  try {
    return JSON.parse(text);
  } catch {
    throw new BodyError(400, 'Invalid JSON body.');
  }
}

export function validationResponse(error: ZodError): NextResponse {
  return NextResponse.json({
    error: 'Validation failed',
    issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  }, { status: 400 });
}

/**
 * Drop the ISR copies a visibility change affects, so Publish shows up now
 * rather than after the 60-second window, and Unpublish disappears now too.
 * Never throws: a failed revalidation still leaves the 60-second ceiling.
 */
export function revalidateProjectPages(slug?: string | null): void {
  try {
    if (slug) revalidatePath(`/projects/${slug}`);
    revalidatePath('/portfolio');
    revalidatePath('/');
  } catch (err) {
    console.error('project revalidate failed:', err instanceof Error ? err.message : err);
  }
}

/** The public origin for links in API answers. */
export function siteOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '');
  return configured || request.nextUrl.origin;
}

/** Where the owner opens a project in the admin (the contract in acceptance-criteria.md). */
export function adminUrl(request: NextRequest, id: string): string {
  return `${siteOrigin(request)}/vaca-mgmt?tab=projects&project=${id}`;
}
