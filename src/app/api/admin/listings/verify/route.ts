import { NextResponse } from 'next/server';
import { checkImageUrl, type ImageCheckResult } from '@/lib/listings/imageCheck';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

/**
 * Pre-import image verifier. The admin upload wizard posts every photo URL it
 * found in the sheet; we check each one the same way the import will accept it
 * (reachable + actually an image + not oversized) and report what's wrong, so
 * broken/invalid images are caught before committing.
 *
 * Session-protected by middleware (the `/api/admin/` prefix).
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BODY_BYTES = 300_000;
const MAX_URLS = 600;
const CONCURRENCY = 6;

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const urlsInput = (parsed as { urls?: unknown })?.urls;
  if (!Array.isArray(urlsInput)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // De-dupe + trim; one check per distinct URL.
  const urls = [
    ...new Set(
      urlsInput.filter((u): u is string => typeof u === 'string').map((u) => u.trim()).filter(Boolean),
    ),
  ].slice(0, MAX_URLS);

  const ip = getClientIp(request);
  const rl = await checkRateLimit(`listings-verify:${ip}`, 40, 5 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many verification runs, slow down' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
    );
  }

  const results = new Array<ImageCheckResult>(urls.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, urls.length) }, async () => {
      while (cursor < urls.length) {
        const i = cursor++;
        results[i] = await checkImageUrl(urls[i]);
      }
    }),
  );

  return NextResponse.json({ results });
}
