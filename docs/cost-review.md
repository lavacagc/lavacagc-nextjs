# Vercel and Supabase cost review, 2026-10-29

Question: why do Vercel and Supabase cost so much for this site when it holds far less content than SpecNook, and what should change.
Method: the Vercel billing export (FOCUS records, every day of September and October 2026), the project's build and compute settings, a read-only count of every production table and storage bucket, and a review of what the code does per request, per page build and per cron.
Supabase's invoice could not be read from this machine (no access token), so that half is a set of specific checks with the expected finding for each.

## The answer in one paragraph

The site's traffic costs almost nothing: every usage line that scales with visitors (function CPU, invocations, image optimisation, ISR, data transfer) adds up to about $1 a month.
The Vercel bill is dominated by build minutes, because the project builds on the "turbo" 30-vCPU machine and every push to any branch builds, and by two subscriptions, one of which (Speed Insights Plus) has never recorded data.
Content size is not the driver; build configuration and subscriptions are.
On the Supabase side the database is tiny (the largest table has 23,000 rows), media is served through the CDN cache, and the likely drivers are per-project compute and preview branches left running on open pull requests, which the dashboard will confirm in two minutes.

## Vercel: what the export shows

| Line | September | October (to the 29th) | What it is |
| --- | --- | --- | --- |
| Build CPU Minutes | $12.29 (5,310 min) | $23.36 (14,226 min) | Every deployment, on the turbo build machine |
| Pro subscription | $20.00 | $20.00 | The plan |
| Speed Insights Plus | 0 | $10.00 (new this month) | Add-on; the project reports `hasData: false` |
| Fluid Active CPU | $0.29 (5.9 h) | $0.28 (5.7 h) | Server rendering and API routes |
| Fast Origin Transfer | $0.18 (6.7 GB) | $0.19 (7.3 GB) | Function responses |
| Function Invocations | $0.13 (502,406) | $0.10 (475,424) | Includes middleware on every path |
| Fluid Provisioned Memory | $0.16 | $0.10 | |
| ISR Writes | $0.07 (65,860) | $0.07 (61,835) | Pages with `revalidate = 60` regenerating |
| ISR Reads | $0.03 (198,240) | $0.03 (222,733) | |
| Image Optimization | $0.11 (2,728 transforms) | $0.04 (1,929) | Inside the 5,000 included |
| Everything else | $0.00 | $0.01 | |
| Total usage excluding subscriptions and builds | about $0.97 | about $0.82 | |

The subscription lines are shown at list price; the export prorates them by day.

### Why builds cost that much

- Build machine type is `turbo` with elastic concurrency (project `resourceConfig`). Vercel bills build CPU-minutes, and turbo is 30 vCPUs, so a four-minute build books about 120 CPU-minutes. A standard machine (4 vCPUs) books 16 for a build that takes a little longer. The Next build here is not CPU-bound enough to need turbo.
- Every push to every branch deploys. The no-mistakes gate pushes its fix commits one by one, so one shipping run can trigger three to five preview builds (today: three in ten minutes, all on turbo). PR previews are useful; builds for every intermediate push are not.
- Nothing skips builds for docs-only or test-only commits.

### Why the Speed Insights Plus line is pure waste

The project has Speed Insights enabled since 2025-11-27 and still reports no data, which means the client script is not sending (the site's GA4 web-vitals and Clarity already collect the same signal).
The Plus tier is $10 a month on top of that.

### Traffic-side items, all small but worth tidying

- `src/middleware.ts` matches `/:path*`, so it runs for every static asset and image request, not only pages and APIs. Half a million invocations a month are mostly this. It is inside the included allowance today, but it also adds CDN "additional CPU duration" and makes every static request slower.
- Thirteen pages use `revalidate = 60`. The blog and service pages change a few times a month; regenerating them every minute under traffic is where the 62,000 ISR writes come from. The portfolio already has on-demand revalidation on publish.
- The hero video (3.7 MB) is `<link rel="preload" as="video">` in the root layout, so every page on the site, not only the homepage, asks the browser to fetch it. That is Supabase egress (cached by its CDN, so cheap) and a performance cost rather than a Vercel cost, but it belongs on this list.
- Seventeen crons. The two added by the Home Services build run every 30 minutes and daily; the rest are daily or weekly. Each run is one invocation and a few Supabase reads; together they are cents.

## Supabase: what can be measured from here, and what to check

Measured read-only against production:

- Tables: the largest is `seo_metrics` at 22,962 rows (Search Console ingest). Everything else is under 300 rows. The database is a few megabytes; compute, not storage, is what Supabase bills for it.
- Storage: `blog-images` 103 MB in 68 files (PNGs up to 6.4 MB), `hero-videos` 18.7 MB in 6 files (only one is used), `project-images` with the live project photos (3 to 12 MB JPEGs), plus 20 orphaned uploads in `drafts/`. Under 500 MB in total, inside the Pro allowance.
- Egress: public objects come back from the Supabase CDN as `cf-cache-status: HIT` with `max-age=3600`, so repeat views are cached egress (free on Pro) rather than origin egress. The hero video preload on every page is the one thing that multiplies it.

To confirm in the Supabase dashboard (Organization > Billing > Usage), in order of likely size:

1. **Compute add-ons.** Each project on a Pro organisation carries its own compute instance (Micro is $10 a month and is included for the first project only). If this site and SpecNook are two projects in one organisation, the second project's compute is a line on the bill by itself, and if either instance was ever bumped above Micro, that is the single largest line. This site needs Micro.
2. **Branching.** The repo carries a preview baseline migration, which exists for Supabase branching. Preview branches bill per hour (about $0.014, roughly $10 a month each) for as long as they exist. Two pull requests have been open for weeks (#86 since September, #103). If branching is on and branches persist until the PR closes, that is $20 a month for two previews nobody is using. Check Project > Branches for anything older than a day.
3. **Point-in-time recovery, custom domain, log drains, IPv4 add-on.** Each is a flat add-on ($100, $10, varies, $4). Confirm none is enabled for this project.
4. **Egress.** Expected to be inside the 250 GB Pro allowance given the CDN hits above; if it is not, the hero video preload is the cause.
5. **Database size and MAUs.** Expected tiny.

## Recommendations, in order of money saved

| # | Change | Where | Expected saving | Risk |
| --- | --- | --- | --- | --- |
| 1 | Build machine: turbo to standard | Vercel > Settings > Build and Deployment > Build Machine | $10 to $20 a month (most of the build line) | Builds take a minute or two longer |
| 2 | Cancel Speed Insights Plus; keep the free tier or rely on GA4 web vitals | Vercel > Speed Insights | $10 a month | None; it records nothing today |
| 3 | Build only `main` and pull-request branches; skip builds for docs-only changes | `vercel.json` `git.deploymentEnabled` and an `ignoreCommand` that exits 0 when the diff touches only `docs/`, `tests/`, `.lavish/`, `.claude/` | Most of the remaining build minutes | Previews still exist for PRs |
| 4 | Close or merge the stale PRs and set Supabase branching to delete on close | GitHub #86, #103; Supabase > Branching | up to $20 a month if branches persist | None |
| 5 | Confirm this project's compute is Micro | Supabase > Project > Compute | $0 to $50 a month depending on what it is today | None |
| 6 | Middleware matcher excludes static assets | `src/middleware.ts` `config.matcher` | Invocations down about 70 percent; faster static assets | None |
| 7 | `revalidate = 3600` on blog, services, locations, portfolio pages; keep on-demand revalidation on publish | thirteen page files | ISR writes down about 60x | A content edit can take up to an hour to show unless the admin triggers revalidation, which Projects already does |
| 8 | Move the hero video preload out of the root layout and into the homepage only, or drop the preload and let the `<video>` tag fetch it lazily | `src/app/layout.tsx` | Supabase egress and 3.7 MB off every non-home page load | None |
| 9 | Re-encode the blog PNGs to WebP under 500 KB and delete the five unused hero videos and the orphaned draft uploads | storage | Storage line and Image Optimization source bytes | None |

Items 1 to 3 together take the Vercel bill from about $50 a month to about $22, which is the Pro plan plus a dollar of usage.
Items 4 and 5 are where any surprising Supabase number will be.

## What this review could not see

- The Supabase invoice itself. Running `supabase login` once on this machine would let the next review read usage directly.
- Per-route function CPU: Pro retains runtime logs for one day and this review ran after the day's traffic; the code review stands in for it.
- Why only eleven deployments are listed since September while October booked 14,226 CPU-minutes: the deployments API hides deleted previews, and the gate deletes nothing, so either previews were cleaned up by retention or the per-build CPU-minute figure on turbo is higher than the estimate above. Vercel > Usage > Build shows the per-deployment minutes and settles it.

## Applied on 2026-10-29 (Alex: "apply all of them")

| # | Status | Detail |
| --- | --- | --- |
| 1 | Applied | Project `resourceConfig.buildMachineType` set to `standard`, elastic concurrency off, through the Vercel API; read back and confirmed. |
| 2 | Needs the dashboard | No API exists for the Speed Insights Plus add-on. Vercel > Team settings > Billing > Add-ons > Speed Insights Plus > Cancel (or Project > Speed Insights > Disable). |
| 3 | Applied | `scripts/vercel-ignore-build.sh` registered as the project's Ignored Build Step: preview pushes with no pull request behind them are skipped, and so are commits that touch only docs, tests, review pages or agent config. |
| 4 | Needs Alex | PR #103 (phone fix) should be merged after #104; PR #86's portfolio half is already in #104, its header and menu half is not, so it is a cherry-pick or a close. Supabase branching cleanup needs the dashboard or `supabase login`. |
| 5 | Needs the dashboard | Supabase > Project > Settings > Compute; the site needs Micro. |
| 6 | Applied | Middleware matcher excludes `_next/static`, `_next/image`, favicon, images, fonts, robots and sitemap. |
| 7 | Applied | `revalidate = 3600` on services, locations, portfolio, project, landing and CMS pages; `300` on the two blog pages because the blog editor writes straight to the database and cannot revalidate on save. |
| 8 | Applied | The root-layout `<link rel="preload" as="video">` is gone; the homepage `<video>` fetches it itself. |
| 9 | Deliberately not applied | Deleting the four unused hero videos and re-encoding 33 blog PNGs are irreversible production changes with no measurable saving: storage is inside the Pro allowance and `next/image` already serves WebP and AVIF to visitors. Listed in follow-ups for a content-cleanup day. |

Expected Vercel bill after 1, 3, 6, 7 and 8: the Pro plan plus about $1 of usage, plus Speed Insights Plus until item 2 is done in the dashboard.
