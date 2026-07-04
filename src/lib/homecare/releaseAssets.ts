/**
 * Preflight for release-email image assets.
 *
 * Why this exists: email screenshots are served from the prod site through
 * Cloudflare, which caches error responses for image paths — a screenshot
 * requested before its deploy landed keeps failing from cache long after the
 * file is live (the 2026-07-03 release email shipped with every screenshot
 * broken this way). Each send now probes the exact cache-busted URLs the
 * email will embed and refuses to send while any of them fails.
 *
 * A long-deployed control asset distinguishes "these screenshots are missing"
 * from "the CDN is blocking server-side probes altogether"; in the latter
 * case enforcement is skipped with a loud warning instead of stranding the
 * send button.
 */

export interface AssetPreflightResult {
  ok: boolean;
  /** Failing URLs with their probe outcome, e.g. "https://…/x.png?v=1 → HTTP 404". */
  failures: string[];
  /** Set when the control asset itself failed and enforcement was skipped. */
  warning?: string;
}

// Cloudflare on lavacagc.com 403s non-browser user agents, so probes must
// present as a browser (same reason the Resend scripts do).
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Deployed since launch — if this fails, the probe channel itself is broken.
const CONTROL_PATH = '/logo.png';

async function probe(url: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    const type = res.headers.get('content-type') ?? '';
    await res.body?.cancel().catch(() => {});
    if (res.ok && type.startsWith('image/')) return { ok: true, detail: 'ok' };
    return { ok: false, detail: res.ok ? `content-type ${type || 'unknown'}` : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : 'fetch failed' };
  }
}

/**
 * Probes every screenshot path at `baseUrl` using the same `?v=` token the
 * email will embed, so a passing preflight has warmed the exact cache entries
 * recipients' mail clients will hit.
 */
export async function preflightReleaseAssets(
  baseUrl: string,
  screenshotPaths: Array<string | null>,
  assetVersion: string,
): Promise<AssetPreflightResult> {
  const unique = [...new Set(screenshotPaths.filter((p): p is string => Boolean(p)))];
  if (unique.length === 0) return { ok: true, failures: [] };

  const v = `?v=${encodeURIComponent(assetVersion)}`;
  const control = await probe(`${baseUrl}${CONTROL_PATH}${v}`);
  if (!control.ok) {
    return {
      ok: true,
      failures: [],
      warning:
        `screenshot preflight skipped: control asset ${CONTROL_PATH} failed (${control.detail}) — ` +
        'the CDN may be blocking server probes, so screenshots were NOT verified before this send',
    };
  }

  const results = await Promise.all(
    unique.map(async (p) => ({ p, r: await probe(`${baseUrl}${p}${v}`) })),
  );
  const failures = results.filter((x) => !x.r.ok).map((x) => `${baseUrl}${x.p}${v} → ${x.r.detail}`);
  return { ok: failures.length === 0, failures };
}
