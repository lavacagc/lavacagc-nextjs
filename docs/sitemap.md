# The sitemap: how it is served, watched, and moved back one day

## How it is served

`/sitemap.xml` is a rewrite (next.config.ts) to the route handler `src/app/api/sitemap/route.ts`.
The entries come from `buildSitemapEntries` in `src/lib/sitemap.ts`; the XML comes from `renderSitemapXml` in `src/lib/sitemapXml.ts`, byte for byte what a `src/app/sitemap.ts` metadata route would render.
The blog and project lists are cached under `SITEMAP_TAG`, which every blog, project and home-service catalog writer expires along with `revalidatePath('/api/sitemap')` (`src/lib/revalidate.ts`), and the route regenerates at least hourly.
When the database cannot be read and no cached rows are left, the route answers 503 with Retry-After, never a sitemap with pages missing.

## Why it is not `src/app/sitemap.ts`

Since Next.js 16.2 the Vercel adapter emits a metadata route like `sitemap.ts` as a static file, so its `revalidate`, its tagged caches and `revalidatePath('/sitemap.xml')` never regenerate it (vercel/next.js#99055, fix in PR #99056).
In production on 2026-10-29 a published article reached `/blog` in seconds while `/sitemap.xml` kept serving the file from the last deploy.
A route handler whose path does not end in `sitemap.xml` is an ordinary ISR function, so on-demand revalidation works; PR #113 proved it on a preview and in production (`x-vercel-cache: REVALIDATED` on the request after a publish).

## The watcher

`/api/cron/sitemap-watch` runs daily at 06:45 UTC (vercel.json) and reads the sitemap back the way a crawler does.

- It fetches `/sitemap.xml` through the CDN, rebuilds the expected entries from the database, and compares them (`src/lib/sitemapWatch.ts`).
  The fetch goes to `SITEMAP_WATCH_HOST`, which is set to the project's vercel.app alias (`lavacagc-nextjs-138k.vercel.app`) in every Vercel environment (production, preview and development), else to `VERCEL_URL` (the deployment's own address), and never to `www.lavacagc.com`: Cloudflare answers a Vercel function's request to the public host with its managed challenge (proven on a preview on 2026-10-29).
  `/sitemap.xml` is outside the middleware matcher, so the vercel.app alias serves it from the same route and the same ISR cache without the canonical redirect.
  `VERCEL_PROJECT_PRODUCTION_URL` is deliberately not used: Vercel sets it to the shortest production custom domain, which is behind Cloudflare, and on the preview it resolved to `https://www.lavacagc.com/sitemap.xml` and was challenged.
  That covers the bug class the watcher exists for (a file no publish regenerates) and leaves out the Cloudflare hop and the www edge entry; to check those by hand, compare the blog lastmods of `https://www.lavacagc.com/sitemap.xml` and the vercel.app host from a browser or curl (they matched on 2026-10-29).
  The JSON answer names the URL it read under `fetched`.
  Posts and projects are read uncached.
  The active home-service slugs come through the catalog's tagged cache, the same one the sitemap uses, which `invalidateCatalog` expires on every save.
- Blog and project entries are compared by lastmod; every other entry is dated by the clock at generation and compared by presence only.
- A row-dated change younger than the grace window (two ISR windows, two hours) is reported as pending and not alarmed; older than that, a post not listed or a lastmod behind its row is drift.
- Presence-only and unexpected entries (an unpublished post, a deactivated project, a switched-off service) get no grace window: every writer that changes what the sitemap lists, including a catalog save, expires `SITEMAP_TAG` and revalidates both sitemap paths on the spot, so a difference the daily run sees is real.
- It also asks GitHub whether PR #99056 has merged.
  The announcement is sent once, in the run after the merge (a 26-hour window: one daily run plus cron jitter); the JSON answer carries `upstream.merged` on every run.
  `GITHUB_TOKEN` is optional: when set, the request sends it as a bearer token so it is not held to the unauthenticated rate limit (60 requests an hour per IP, shared on Vercel).
- Telegram to the owner on drift, on a 503, on a sitemap it cannot read (a Cloudflare challenge page, a network error) and on a database it cannot read. A healthy day is silent; the JSON answer carries the detail either way, and the status is 503 whenever the check did not pass so the Vercel cron log shows it.

Run it by hand against production with the production `CRON_SECRET`:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" https://www.lavacagc.com/api/cron/sitemap-watch | jq
```

A preview deployment has its own `CRON_SECRET` (Vercel, Preview scope) so the route can be exercised there before a merge.

The comparison rules are pinned in `tests/sitemap-watch.spec.ts`.

## Moving it back when the upstream fix ships

When a Next.js release includes PR #99056:

1. Upgrade Next.js and confirm on a Vercel preview that a `src/app/sitemap.ts` with `export const revalidate = 3600` is listed as an ISR function in the deployment's output, not under static files.
2. Recreate `src/app/sitemap.ts` as `export default () => buildSitemapEntries()` with `export const revalidate = 3600`.
3. Delete `src/app/api/sitemap/route.ts`, the `/sitemap.xml` rewrite in next.config.ts, `SITEMAP_ROUTE` and its uses in `src/lib/revalidate.ts` (the writers then revalidate `/sitemap.xml`), and the `/api/sitemap` exclusion in `src/middleware.ts`.
4. Keep the watcher: it is the check that this move did not bring the static file back. On the preview, publish a test article and confirm `/sitemap.xml` lists it on the next request before merging.
