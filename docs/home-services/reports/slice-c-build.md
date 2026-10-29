# Slice C build report - homepage hero CTA multivariate test

Builder: Opus (slice C).
Branch: `worktree-agent-ad83187885343b4e4`, based on `fc6fe33` (`feat/home-services-request-flow`).
The worktree was first cut at `35ba93b` (origin/main) without slice 0; it was reset to `fc6fe33` before any work, so nothing was rebased.
Coordinator rig fixes cherry-picked on top: `e0fc151` (dev next/image host) as `d005f6c`, `5f427a0` (dev CSP) as `a63b514`.
Status: built and verified locally; not self-approved, for the reviewer to corroborate.

## What was built

Homepage:

- `src/app/page.tsx`: fetches active variants on the server and passes them to `Hero`; `export const revalidate = 300`.
- `src/components/Hero.tsx`: the two buttons are now `next/link` links (`/home-services#services`, `/portfolio`) rendered from the variants, with the colour and subtext of the assigned variant.
  The video, overlays, trust tiles and "See Our Work" scroll hint are unchanged.
  The old scroll-to-estimate and scroll-to-projects handlers are gone.
- `src/components/ABTesting.tsx`: deleted (no importers existed).

Library (`src/lib/cta/`):

- `types.ts`: buttons, keys A to G, destinations, cookie names, the hardcoded fallback.
- `assign.ts`: FNV-1a hash assignment, `cta_v` cookie parse and serialise, sticky resolution.
- `useHeroCta.ts`: browser half: visitor id, assignment via `useSyncExternalStore`, view and click events.
- `variants.server.ts`: server read of active variants with the publishable key (the migration's sanctioned "Exception 1"), never throws, 3 s timeout, fallback per button.
- `color.ts`: hex or Tailwind class list validation and rendering.
- `http.ts`: streaming JSON body reader with a hard byte cap.
- `report.ts`: pure leader board computation.
- `admin.server.ts`: secret-key data access for the admin routes.

API:

- `src/app/api/cta/event/route.ts`: `POST` public event sink.
- `src/app/api/admin/cta/report/route.ts`: `GET` leader board.
- `src/app/api/admin/cta/variants/route.ts`: `GET` list, `POST` create, `PATCH` update.
- `src/app/api/admin/cta/settings/route.ts`: `GET` and `PATCH` `cta_min_visitors`.

Admin (Marketing > CTA Tests):

- `src/components/admin/home-services/CtaTestsDashboard.tsx`: replaces the placeholder.
- `src/components/admin/home-services/cta/ButtonReportCard.tsx`, `VariantEditor.tsx`, `ctaApi.ts`, `format.ts`.

Tests:

- `tests/cta-tests.spec.ts` (new).
- `tests/hero-trust-badges.spec.ts` and `tests/flows.spec.ts` pinned none of the old button text, so neither was changed.

## Contracts as implemented

Assignment: `cta_vid` is a UUID v4 cookie (180 days, path `/`, SameSite=Lax, Secure on https), created if absent.
`cta_v` holds `P=<key>;S=<key>`, stored URI-encoded (`P%3DA%3BS%3DA`) because a raw `;` would end the cookie.
A stored key that is still active is kept; otherwise the index is `fnv1a(cta_vid + ":" + button) % activeCount`.
The button name is mixed into the hash so the two buttons are assigned independently; hashing the id alone would pair primary A with secondary A for every visitor whenever both have the same variant count, confounding the two tests.
If the visitor id cannot be stored (cookies blocked), the visitor sees the first variant and no events are sent.
The hardcoded fallback variants never send events, since no table row backs them.

Events: `POST /api/cta/event` with `{ button, variant_key, event_type, visitor_id }`.
Order: rate limit `cta:<ip>` 60 per minute (429 with Retry-After), then a 1 KB body cap (413; Content-Length check plus streaming cut-off), then strict zod (400 `Invalid event`, unknown keys rejected, `visitor_id` must be a UUID).
The insert uses the secret key; a 23505 duplicate is answered exactly like a first write.
Server errors are logged and answered with a generic message.
Views fire once per page load after assignment (`fetch` with `keepalive`), clicks on `pointerdown` and `click`, once per button per page load.
Because `visitor_id` must be a UUID, the browser-created test rows cannot carry the `zztest-c-` prefix; the spec records every visitor id it creates and deletes exactly those, and rows it inserts directly do use `zztest-c-` ids.

Report (`GET /api/admin/cta/report`): per button and variant, views and clicks are exact row counts per (button, key, type), which are distinct visitors because of the unique index.
Requests, valid leads and won come only from `home_service_requests.cta_variant_primary` or `_secondary`, as appropriate for the button.
Valid lead: if any `home_service_requests` row has `phone_verified = true`, SMS is taken to be in use and valid means `phone_verified`; otherwise valid means status in new, contacted, bid_sent, assigned or won.
The response states the rule it applied in `valid_lead_rule`, and the leader rule in `leader_rule`.
`click_rate = clicks / views` and `request_rate = requests / views`, null without views.
`sample_size` is the fewest views among active variants.
`leader_status` is one of `leader`, `not_enough_visitors` (sample_size below `cta_min_visitors`), `tied`, `single_variant` or `no_active_variants`; `leader` is only set for `leader`.
So the leader is named only once every active variant has the minimum views, which is how the planned "among variants with at least the minimum" and "n of N" read together.
Attributed requests are read in one request capped at 10,000 rows; `requests_truncated` says if the cap was hit.

Variants: create takes the next free key A to G and is added inactive; an eighth is refused with 409.
Update covers wording (1 to 60 chars), subtext (up to 80, blank clears), colour (hex, or a Tailwind class list; blank clears) and active.
Deactivating the only active variant of a button is refused with 409, and the switch is disabled in the tab.
Every write calls `revalidatePath('/')`.

## Hydration decision

Chosen: render the first active variant on the server, swap to the visitor's own variant right after hydration, and keep the button pair transparent until then.
The server HTML always holds real `<a href>` links with real wording, so the buttons stay crawlable (SEO3) and the homepage stays static ISR.
The swap uses `useSyncExternalStore` with a server snapshot (first variant) and a client snapshot (assigned variant), so hydration matches and no `suppressHydrationWarning` is needed.
Without the transparency, a B visitor saw A's wording for about 140 ms in dev before it changed, which is a visible flash and contaminates the test.
With it, the first visible frame is always the assigned wording: measured on the production build at 390 px over six fresh visitors, first visible at 108 to 184 ms, never the wrong variant, no hydration errors.
If JavaScript never runs, a CSS animation reveals the server-rendered variant after 1.5 s (checked with JavaScript disabled: opacity 0, then 1 after 2 s).
Rejected alternatives: reading the cookie on the server makes the homepage dynamic; a client-only island would drop the links from the server HTML.

## Caching decision (found during verification)

The variants fetch first carried its own `next: { revalidate: 300 }` data cache.
After a dev server restart, the homepage served secondary variant B, a row the spec had already deleted.
Cause, confirmed by reproduction: `next dev` keeps the `revalidatePath` state in memory but the fetch cache on disk, so the restart brought back the pre-edit entry.
Fix: the fetch has no data cache of its own, and the page ISR (`revalidate = 300` plus `revalidatePath('/')`) is the only cache layer.
Checked on a production build (`next start` on port 3113): `/` builds as static `○` with a 5 m revalidate (`x-nextjs-cache: HIT`, `s-maxage=300`).
An admin edit showed on the next request, still showed after a server restart, and the revert also showed immediately.
I could not test on Vercel, where the cache and the revalidation are platform-managed; the local production build is the closest rig available.

## Acceptance matrix

| AC | Result | Evidence |
| --- | --- | --- |
| CT1 | PASS | Spec `CT1 + SEO3`: both links in the server HTML with the right hrefs, seeded wording visible. Also checked once without the gallery stubs against the real seeded gallery: no runtime overlay, no page errors, buttons correct. |
| CT2 | PASS | Spec `CT2` (x2): the same `cta_v` and key across three reloads, both A and B over 20 fresh visitors, exactly one view row per visitor per button, and a stored inactive key (E) reassigned to an active one. |
| CT3 | PASS | Spec `CT3`: one click row after a click, still one after a second click on a later visit, secondary tracked separately. |
| CT4 | PASS | Spec `CT4`: inserted known events and requests, asserted deltas for views, clicks, requests, valid (rule-aware) and won, the request rate and sample size, `not_enough_visitors` at threshold sample+1 (and the tab shows "Not enough visitors yet (n of N)"), and the leader at threshold sample (the tab shows "Leader: B"). Unauthenticated report: 401. |
| CT5 | PASS | Spec `CT5`: created up to seven (keys from B, added inactive), eighth refused 409, wording/subtext/colour update, bad colour and blank wording 400, last active refused 409, and after the switch the homepage served the new variant with its colour (rgb 31,122,77) and subtext. Also exercised by hand in the tab (inline edit with colour, toast, disabled switch). |
| CT6 | PASS | `ABTesting.tsx` deleted; source spec checks it is gone and unreferenced. |
| SEO3 | PASS | Real `<a href>` in the server HTML (spec), `next/link` in source (spec); no JS needed to follow them. |
| SEC1 | PASS | Spec `SEC1` on `/api/cta/event`: 413 over 1 KB, 400 for bad UUID, extra keys and bad JSON, generic error bodies, duplicates free, 429 with Retry-After from the 61st call per IP, another IP unaffected. Verified against the real `rate_limits` table after the coordinator created it locally. Admin routes are behind middleware auth and also capped (1 to 2 KB) and zod-validated. |
| SEC5 | PASS | Admin routes and the tab read only through `supabaseRest` (secret key); source spec asserts no publishable key or browser client in those files. The homepage read uses the publishable key by design (RLS exposes active rows only). |

## Commands for the reviewer

```
npm ci
# .env.local as in the slice brief; dev server:
npm run dev -- -p 3103
TEST_URL=http://localhost:3103 E2E_LIVE_BACKEND=1 node_modules/.bin/playwright test tests/cta-tests.spec.ts tests/hero-trust-badges.spec.ts --project=chromium
npm run typecheck
node_modules/.bin/eslint --max-warnings 0 src/components/Hero.tsx src/app/page.tsx src/lib/cta src/app/api/cta src/app/api/admin/cta src/components/admin/home-services/CtaTestsDashboard.tsx src/components/admin/home-services/cta tests/cta-tests.spec.ts
npm run chaos:static   # needs Node 24, see below
```

Last results: cta-tests 10 of 10 green (3 source, 7 live), hero-trust-badges 3 of 5 green; typecheck clean; eslint clean; chaos static "no new violations".

## Uncertain or not mine

- `hero-trust-badges.spec.ts`: the two "scrolls testimonials into view" tests fail on this rig because the local database has no `google_reviews` table (PostgREST 404), so `Testimonials` returns null and `#testimonials` never exists. No migration creates that table, and the hero code those tests use (the two scroll buttons) is unchanged by this slice. I did not run them against the base commit to prove the same failure there; the cause is read directly from the 404 and `Testimonials.tsx` line 138.
- `npm run chaos:static` fails to start under the default Node 20.20.0 (`ERR_UNKNOWN_FILE_EXTENSION` from ts-node). It runs under Node 24.18.0 (`node node_modules/ts-node/dist/bin.js scripts/chaos-static.ts`) and reports no new violations. This predates the slice and is outside my files.
- The admin dashboard tab raises "Failed to load dashboard data" (`AdminDashboard.tsx`) on this rig; it predates this slice.
- `cta_events` held 8 rows from four untagged visitors at the end (07:00 and 07:04 UTC). They match when I ran `hero-trust-badges.spec.ts`, which loads the homepage, but other builders also load it, so I left them rather than delete rows I cannot prove are mine.
- Colour as a Tailwind class list only renders classes that already exist in the compiled CSS; the editor offers a hex picker for that reason.
- Two admins deactivating the last two active variants at the same instant could race past the "last active" check; the homepage then falls back to the built-in wording rather than break.
- The variant read on the homepage happens at most once per ISR regeneration; on a total read failure it serves the fallback for up to five minutes or until the next admin edit.

## Shared database state at hand-off

`cta_variants` matches the seed: primary A and B active, C to E inactive, secondary A active, no colours, seeded subtexts.
`site_settings.cta_min_visitors` is 100.
No `zztest-c` requests, events or variants remain.
The admin user `admin-c@local.test` exists in local GoTrue.

## Fixes after review

Review: `docs/home-services/reports/slice-c-review.md` (ACCEPT WITH FIXES, six items).
Commits: `99148e6` (the six fixes), `81410e2` (self-heal, editor panel, spec hardening), `b65be51` (cherry-pick of `363a6f5`, chaos static on Node 20), plus this report and the contract update in `acceptance-criteria.md`.
This section supersedes the earlier "Contracts as implemented" (assignment, cookies, events) and "Hydration decision" sections where they differ.

### 1. HIGH - independent assignment

`ctaIndex` in `src/lib/cta/assign.ts` now runs the murmur3 fmix32 finalizer after FNV-1a and before the modulo.
Reproduced first, over 10,000 deterministic seeds with two variants per button: FNV-1a alone served only `00` (4,960) and `11` (5,040).
With fmix32 the four combinations are 2,517, 2,507, 2,494 and 2,482.
Unit tests (no server needed): pinned vectors; all four P2 x S2 cells within 5% of even (2,500 +/- 125) over 10,000 visitors; each button alone within 10% of even for 2 to 7 variants (5% at n = 7 would sit inside sampling noise, so the marginal check uses 10% and the joint check keeps the required 5%).

### 2. MEDIUM - no hidden period, no flash

Every active variant of each button is now a real server-rendered `<a href>` (`src/lib/cta/HeroCta.tsx`, a server component passed into the client `Hero` as a slot from `src/app/page.tsx`).
An inline script placed before the buttons (`src/lib/cta/bootstrap.ts`) reads `cta_v`, or draws a seed and assigns by hash, writes `cta_v` back, and sets `data-cta-p` / `data-cta-s` on `<html>`.
Static CSS shows only the link `<html>` names, and the first variant when no attribute is set (no JavaScript).
Nothing in the React tree depends on the choice; `<html>` already carries `suppressHydrationWarning`.
The opacity gate and `useHeroCta.ts` are gone.
The script is self-contained, embeds the exact `ctaIndex` via `toString()`, and seeds only from `crypto.getRandomValues` (no `Math.random` fallback; without crypto nothing is assigned or counted).
Size as served: 924 bytes in dev, 893 bytes on the minified production build; the unit test also checks the seven-plus-seven-key worst case stays under 1,024 bytes.
`compactJs` strips whitespace only because no string literal in the two functions contains whitespace, and the spec asserts that.
Measured on the production build at iPhone 13 size with CPU 6x and slow 4G (the reviewer's profile), six fresh visitors: the first frame that shows a primary button shows the assigned variant at full opacity, at 1,064 to 1,088 ms, before first contentful paint (1,124 to 1,160 ms), with no later change; the reviewer measured 2,446 to 2,558 ms hidden and 2 of 4 wrong first.
The spec asserts this frame by frame under the same throttling (`fix 2: ... throttled phone`), passing on both the dev server and the production build.
Without JavaScript the first variant of each button shows at once and the links navigate (spec).
Found while verifying: under concurrent load the dev server sometimes fails to server-render `Testimonials` ("No QueryClient set", pre-existing), React then renders the page on the client, and a client-inserted inline script never runs.
In that case the first variant showed and nothing was counted.
`HeroCtaEvents` now runs the same bootstrap on mount when `<html>` has no assignment; a spec test serves the page with the script stripped and expects the hash-computed key and two views, and it goes red when the self-heal is removed.

### 3. MEDIUM - server-minted, signed visitor id

`cta_vid` is now `<uuid v4>.<HMAC-SHA256(uuid) with INTERNAL_WEBHOOK_SECRET, base64url>`, minted only by `POST /api/cta/event` and set httpOnly, SameSite=Lax, Secure on https, 180 days (`src/lib/cta/visitor.server.ts`).
The body no longer carries a visitor id (strict zod rejects one with 400).
A request with no cookie mints an id and records the event; a badly signed cookie gets 204, nothing recorded, and a fresh signed cookie.
Only active (button, key) pairs are recorded (`src/lib/cta/activePairs.server.ts`, a 30 s in-memory cache that the admin variants route clears on every write); others get 204.
A click is recorded only when the same visitor already has a view of the same variant; otherwise 204.
The client sends events one after another, so a first-time visitor's second view and click carry the cookie the first view minted.
Rate limiting is unchanged (`cta:<ip>`, 60 per minute, keyed by `getClientIp`).
The Hero no longer reads or writes `cta_vid`.
Because the browser cannot read `cta_vid`, the assignment seed lives in `cta_v` as `R` (approved by the coordinator); the cookie contract is updated in `acceptance-criteria.md` ("Attribution cookies and parameters").

### 4. LOW - deterministic stickiness and evenness

The live spec sets `cta_v=R=<known seed>` and expects exactly the hash-computed keys, for six seeds; a stored `P=B` with a seed that hashes to A must show B, a stored `P=A` with a seed that hashes to B must show A, and a stored inactive `P=E` falls back to the hash.
Evenness is exact in the unit tests above.
Sabotage runs on this code (each change applied alone, the named tests run against the dev server, then reverted):

| Sabotage | Result |
| --- | --- |
| S1 random pick in the pre-paint script | 2 failed (known seed; script check rejects `Math.random`) |
| S2 stored `cta_v` key ignored | 1 failed (stored key beats the hash) |
| S3 fmix32 removed | 2 failed (pinned vectors, joint 2x2) |
| S4 click accepted without a view | 1 failed (fix 3) |
| S5 unsigned visitor id accepted | 1 failed (fix 3) |
| S6 inactive pairs accepted | 1 failed (fix 3) |
| S7 wording freeze removed | 1 failed (CT5 + fix 6) |
| S8 client self-heal removed | 1 failed (script-stripped page) |

The reviewer's earlier sabotage runs (in the review) were against the old design and are superseded by these.
The spec now records every server-minted visitor id from the responses and closes leftover contexts before cleanup, so a failing test leaves no rows behind (checked: zero rows after the sabotage runs).

### 5. LOW - homepage specs no longer write events

`tests/helpers/ctaEventStub.ts` is a Playwright `test` with an automatic fixture that answers `**/api/cta/event` with 204 in every context.
`tests/hero-trust-badges.spec.ts` and `tests/flows.spec.ts` import `test` and `expect` from it (one import line each, nothing else changed).
After a full run of both specs, `cta_events` held zero rows.
The 8 untagged rows the review listed were already gone when I checked.

### 6. Wording frozen once a variant has events

`PATCH /api/admin/cta/variants` refuses a wording change with 409 when the variant has any `cta_events` row ("Deactivate it and add a new variant instead"); the same wording, subtext and colour still save.
In the tab, typing a new wording for such a variant turns Save into "Deactivate <key> and add new variant" with an explanation; it creates the new variant, switches it on, then switches the old one off.
The editor moved out of the sideways-scrolling table into a full-width panel below it, because on a phone the inline editor sat off-screen (checked at 1,280 px and 390 px, no horizontal page overflow).

### Results after the fixes

- `npm run typecheck`: clean.
- `eslint --max-warnings 0` on every changed file: clean.
- `npm run chaos:static` on the default Node 20.20.0: exit 0, "no new violations".
- `TEST_URL=http://localhost:3103 E2E_LIVE_BACKEND=1 node_modules/.bin/playwright test tests/cta-tests.spec.ts tests/hero-trust-badges.spec.ts tests/flows.spec.ts --project=chromium`: 44 passed (cta-tests 19, hero-trust-badges 5, flows 20), zero `cta_events` rows left.
- The same cta-tests browser tests against the production build (`next start` on 3113, admin tests excluded because the production CSP correctly blocks local sign-in): 11 passed.
- `npm run build`: `/` is still static (`○`, revalidate 5m).

### Not mine, found on the way

- `flows.spec.ts` "no JavaScript errors on page load" is flaky under parallel load: a hydration mismatch in the Services section (`TrackedSection` around `src/components/Services.tsx`). With `Hero.tsx` and `page.tsx` temporarily reverted to the base commit it failed 5 of 24 runs with the identical diff, so it predates this slice.
- Under the same load the dev server intermittently fails to server-render `Testimonials` ("No QueryClient set") and once answered `GET /` with 500. I did not determine whether this happens in production.
- The dev server process was once terminated externally mid-run (exit 144, no error in its log); the rerun was clean.
- The untracked `tests/zz-rc-hero.spec.ts` in this worktree is the reviewer's and is left alone.
