# Slice D build report: portfolio project drafts, no AI, ingest API

Builder: Opus (slice D developer).
Branch: `worktree-agent-a869d961f20dde8b3`, based on `fc6fe33`.
The worktree was first cut at `35ba93b`; the branch was reset to `fc6fe33` before any work.
Status: built and verified locally; awaiting reviewer corroboration.
This report does not mark the slice done.

## What was built

### Server

- `src/lib/projects/draft.ts`: the one implementation of create draft, update, publish, unpublish, delete, list and get, used by both the admin routes and the ingest API.
  Writes go through `supabaseRest` with the service key.
  A draft is always `status='draft', active=false, featured=false`; only `publishProject` sets `active=true`.
  An update never changes status, so editing a published project keeps it published.
  Media replacement inserts the new rows first, repoints `featured_image_id`, then deletes the old rows, so a failure part-way leaves extra images rather than none.
  Slugs are made unique (`-2`, `-3`) on create; a slug edit that collides answers 409.
  Images are normalized server-side: default alt text, dense sort order, exactly one featured (flagged, else first After photo), half-pairs dropped.
- `src/lib/projects/slug.ts`: deterministic defaults that replace the AI: slug, SEO title, meta description, alt text, current month.
- `src/lib/projects/fields.ts`: the shared vocabulary (six service types, budgets, durations, materials, features, upload ceilings).
- `src/lib/projects/media.ts`: magic-byte sniffing (JPEG, PNG, WebP, MP4, MOV, WebM; HEIC refused with a sentence that names the fix).
- `src/lib/projects/storage.ts`: service-key storage access (upload, signed upload URL, sniff a stored object by a 32-byte range read, list `drafts/`).
- `src/lib/projects/uploads.ts`: store a file that came through the function (sniffed before storing), mint signed uploads, verify a signed upload after the fact (deleting it if refused).
- `src/lib/projects/ingestAuth.ts`: the bearer check (SEC4), free of Next and Supabase imports so the spec imports it directly.
- `src/lib/projects/ingest.ts`: ingest auth (token or admin session), IP rate limit 30 per minute, the ingest image schema, and resolving `path` / `url` / `file` references to verified storage URLs.
- `src/lib/projects/session.ts`: admin-session check for routes outside `/api/admin/` (same `createServerClient` + `getUser()` as middleware).
- `src/lib/projects/http.ts`: JSON body cap (256 KB), validation answers, revalidation of `/projects/<slug>`, `/portfolio` and `/` on visibility changes, admin URL.
- `src/lib/projects/dates.ts`: `parseDateOnly` and `formatMonthYear` (see the date defect below).
- `src/app/api/admin/projects/route.ts`: `GET` list, `POST` create draft.
- `src/app/api/admin/projects/[id]/route.ts`: `GET`, `PATCH`, `DELETE`.
- `src/app/api/admin/projects/[id]/publish/route.ts`: `{ feature?: boolean }`.
- `src/app/api/admin/projects/[id]/unpublish/route.ts`.
- `src/app/api/admin/projects/upload/route.ts`: multipart photo, or JSON `sign` / `verify` for videos.
- `src/app/api/admin/projects/draft-photos/route.ts`: lists `project-images/drafts/*` with an `in_use` flag.
- `src/app/api/projects/ingest/route.ts`: create a draft from JSON (storage paths or bucket URLs) or multipart (`project` JSON + `files[]`, stored as `projects/<id>_<n>.<ext>`).
- `src/app/api/projects/ingest/[id]/route.ts`: `PATCH`, refuses a published project with 409 unless `allow_published: true`.
- `src/app/api/projects/ingest/[id]/publish/route.ts`.
- `src/app/api/projects/ingest/uploads/route.ts`: signed upload URLs for the CLI (photos up to 25 MB, videos up to 200 MB).

### Admin UI

- `src/components/admin/ProjectUploadSystem.tsx`: rewritten as the tab container plus the single-page form.
  Title, Location (text input with a `<datalist>` of active `service_areas`), service-type chips, one drop zone, the photo grid, the pair tool, then collapsed "More details" and "SEO".
  Required to save: title, location, one service, one finished upload.
  The button reads "Save draft" for new projects and drafts, and "Save changes" for published or archived ones.
  Opens a project directly from `?project=<id>` (the `admin_url` the ingest API returns).
- `src/components/admin/projects/PhotoGrid.tsx`: drop zone and thumbnails; each thumbnail has a Before / During / After toggle (default After), a featured star, remove, an editable alt text, and an uploading or error overlay.
  Controls are always visible, not hover-only, so they work on a tablet.
- `src/components/admin/projects/PairLinker.tsx`: the pair tool, ported; moving a paired photo to another stage unlinks the pair.
- `src/components/admin/projects/MoreDetailsSection.tsx`: client first name, `type="month"` date defaulting to this month, budget and duration selects, challenge, solution, material and feature chips, testimonial with rating, and the Google review picker.
- `src/components/admin/projects/SeoSection.tsx`: SEO title, meta description, slug, focus keyword, search preview; no AI buttons.
- `src/components/admin/projects/DraftPhotosPanel.tsx`: "Draft photos in storage" with thumbnails, name, size, checkboxes, "Start a draft from these".
- `src/components/admin/projects/upload.ts`: browser side of uploads (HEIC conversion, re-encode of large photos, signed video upload).
- `src/components/admin/projects/{api,types,FormBits,MediaThumb,StatusBadge}.ts(x)`.
- `src/components/admin/PortfolioManager.tsx`: Drafts section first (Publish, Publish + feature, Edit, Delete, "From Claude Code" badge), the storage panel, then published and archived projects with status badges.
  The status filter gains Draft.
  Card menu: Edit, Duplicate (now a full copy with media, as a draft), View (by `url_slug`, published only), Unpublish or Publish, Delete.
  Reads go through `GET /api/admin/projects`.
- `src/components/AdminContent.tsx`: projects-tab lines only; the `projectMode` / `editingProject` state is gone, and the initial tab is Projects when the URL has `?project=`.

### CLI and docs

- `scripts/ingest-project.mjs`: no dependencies, Node 18+; signed uploads, HEIC via `sips`, `--from-storage path[:stage]`, `--pair`, `--publish`, `--feature`, `--dry-run`.
- `docs/projects-ingest.md`: setup (Vercel env var), CLI reference, a worked example for Claude Code, the raw API.

### Fixes outside the original file list (each approved by the coordinator)

- `src/app/free-estimate/page.tsx`: its `projects` read had no `.eq('active', true)`, so a draft would have rendered on `/free-estimate`.
  Added the filter.
  Every other public reader (`/projects/[slug]` x3, `/portfolio`, `ProjectGallery`, sitemap) already filtered; the spec now pins that each `.from('projects')` in those files has a matching active filter.
- `src/components/ProjectDetailClient.tsx`: pre-existing production defect, found and fixed.
  `new Date('2026-10-01')` parses as UTC midnight, the evening of September 30 in New Jersey, so the public page showed every completion date a day early, and with month precision a whole month early.
  Both sites now use `formatMonthYear` from `src/lib/projects/dates.ts` (local-noon parse), and the Project Details box shows month and year only.
  No other public reader formats `date_completed` (PortfolioContent, ProjectGallery, free-estimate and the sitemap never read it; the sitemap uses `updated_at`).
- `src/app/api/admin/keyword-research/route.ts`: deleted (see below).
- `tests/project-before-after.spec.ts`: the lightbox test could never run (details under Tests).

### Shared-rig commits cherry-picked from the coordinator

- `7490c06` (from `e0fc151`): development-only `next/image` pattern for local storage.
- `bea9b70` (from `5f427a0`): CSP fix.
  The `media-src` part is a production defect I found: it had no `blob:`, so the admin form's local video preview was blocked while a video uploaded.
  Development `img-src` and `media-src` now also allow the local rig, which is what made every local storage image render broken before.

## What was deleted

- `src/components/admin/project-steps/` (all four steps: `ProjectBasicInfoStep`, `ProjectPhotosStep`, `ProjectDetailsStep`, `ProjectSEOStep`).
- `src/app/api/admin/analyze-project/route.ts` (the Gemini proxy).
- `src/app/api/admin/keyword-research/route.ts` (Gemini on every call, 500 without the key; its only caller was the old SEO step).
  `grep -rn "keyword-research" src scripts` returns nothing; the only remaining mention is the spec's own guard regex.
- With them: the `ai-project-assistant` edge-function call, `smartCategorize`, `analyzeTransformation`, the auto-generate on Next, "AI Suggest", "AI Generate", "Use AI Pick", "AI Slug", every `Sparkles` button.
- `grep -rn "analyze-project\|GEMINI\|ai-project-assistant\|Sparkles" src/components/admin/projects src/components/admin/ProjectUploadSystem.tsx src/components/admin/PortfolioManager.tsx` returns nothing (exit 1).
- `grep -rni "gemini" src` returns nothing (exit 1).

### Env vars

- New: `PROJECT_INGEST_TOKEN` (32+ characters) in Vercel Production; without it every ingest route answers 404.
- No longer read by the site: `GOOGLE_GEMINI_API_KEY`.
  Alex can remove it from Vercel.

## Upload path decision

- Photos in the admin form go through `POST /api/admin/projects/upload` (multipart), are sniffed by magic bytes and stored server-side with the service key.
  A Vercel function body is capped at 4.5 MB, so the browser converts HEIC to JPEG and re-encodes any photo over 3.5 MB (long edge 3200 px, JPEG quality stepping down from 0.86 until under 3.8 MB).
  The server refuses anything over 4 MB.
  Verified: a 10.97 MB, 4032x3024 phone-style JPEG went through the form and was stored as a 3.17 MB, 3200 px JPEG.
- Videos in the admin form do not go browser-direct with the user session as first suggested.
  The server mints a one-object signed upload URL, the browser uploads with `uploadToSignedUrl`, and the server then range-reads the stored object, sniffs it, and deletes it if it is not a video.
  Reason: the local bucket has no storage policies, so a session upload fails locally, while the signed URL works the same everywhere, keeps the server in charge of the object key, and still checks the bytes.
  Declared size is capped at 200 MB.
- The ingest API always stores server-side or verifies server-side: multipart files are sniffed and stored by the route; signed uploads (what the CLI uses) are sniffed when referenced by `path`.
  Verified: the CLI stored the same 10.97 MB photo at full size through a signed URL.
- New objects go to `projects/<timestamp>-<random>.<ext>` (admin, CLI) or `projects/<id>_<n>.<ext>` (multipart ingest).
  Nothing goes to `drafts/` any more; photos picked from `drafts/` are attached by URL, not moved or re-uploaded.

## Acceptance criteria

| AC | Result | Evidence |
| --- | --- | --- |
| PF1 | PASS | One-page form, no step indicator or progress bar, datalist location, chips, one drop zone, Save draft. Spec `the form is one page`, the browser test, screenshots. No Gemini anywhere in `src/` (spec `no Gemini call anywhere in src/`). |
| PF2 | PASS | Browser test asserts the stage toggle (After by default), star, remove and default alt text on a thumbnail; pair tool rendered and used in the walkthrough. |
| PF3 | PASS | Spec PF3: `POST /api/admin/projects` gives `status=draft, active=false, featured=false, source=admin`; `/projects/<slug>` and `/projects/<id>` are 404; `/portfolio` and `/free-estimate` HTML do not contain it. Spec PF4 also checks the homepage gallery in a real browser: a draft forced to `featured=true` stays off it while a featured published project shows. |
| PF4 | PASS | Spec PF4 (API) and the browser test: the Publish button on the draft card answers 200, the card moves to the published grid with a Published badge, and `/projects/<slug>` answers 200. `published_at` is set. Publish + feature sets `featured`. Unpublish returns it to 404. |
| PF5 | PASS | Spec PF5: JSON with a storage `path` and a bucket `url` gives 201 draft `source=api` with the pair kept; multipart with a file gives 201 and stores `projects/<id>_0.jpg`; no token 401; wrong token 401; text file named `.jpg` 415. "Token unset means 404" is covered by direct import of `ingestAuth.ts` (unset, blank, 31 characters all `disabled`). |
| PF6 | PASS | Spec PF6: the listing returns the seeded `drafts/` objects with URL, size and `in_use`. Browser test: ticking a storage photo and "Start a draft from these" opens the form with it attached, no upload request. |
| PF7 | PASS | Spec PF7: PATCH on a published project keeps `status=published, active=true` and the same slug, and the public page shows the new title. The walkthrough opened a published project from `?project=<id>`; the button reads "Save changes". |
| PF8 | PASS | `analyze-project` route deleted; `GOOGLE_GEMINI_API_KEY` is read nowhere in `src/`. |
| SEC1 (ingest) | PASS | Body caps (JSON 256 KB, answered 413 in spec SEC1), zod validation (400 with issues), IP rate limit (verified by hand: requests 1-30 got 401, 31 and 32 got 429 with `Retry-After: 60`), and errors never carry server detail (`errorResponseBody` logs and answers a fixed sentence; spec checks a 401 body). |
| SEC2 (uploads) | PASS for the part that applies | Content type is decided by magic bytes on every path (spec: fake JPEG refused with 415). The private-bucket and signed-read part of SEC2 is about home-services photos; `project-images` is public by design because it feeds the public portfolio. |
| SEC4 | PASS | `tokensMatch` hashes both sides with SHA-256 and compares with `crypto.timingSafeEqual` (always equal length); spec imports and exercises it. |
| SEC5 | PASS | The admin reads and writes `projects` through `/api/admin/projects/*` with the service key. The browser still reads `service_areas` and `google_reviews` with the publishable key; both are existing public tables, not new ones. |

## Click counts measured in the browser

Measured by a Playwright walkthrough (`walk.cjs`, desktop 1440x900 and tablet 820x1180, the real CSP, no bypass):

- Photos to draft: 6.
  Add New Project (1), choose all files at once (1: two JPEGs, a 10.97 MB phone photo, an MP4 and a HEIC), Title (1), Location (1), one service chip (1), Save draft (1).
  No waits for AI; uploads ran while typing.
- Draft to published: 1 (Publish on the draft card).
  Publish + feature is also 1.
- From Claude Code: 0 clicks to a draft (`scripts/ingest-project.mjs`), 1 to publish, or 0 with `--publish`.

## Tests

- `tests/project-drafts.spec.ts` (new, 20 tests): source pins (route and wizard gone, no Gemini anywhere in `src/`, one-page form, public readers filter `active`, View uses `url_slug`), direct-import tests of the token check, magic bytes, date parsing under `America/New_York`, and defaults, then a serial live-backend block (PF3, PF4 including the homepage gallery, PF7, PF5, SEC1, PF6, and the admin browser flow).
  The live block runs with `timezoneId: 'America/New_York'` and asserts the published page shows this month, not last month, and no stars without a testimonial.
  It seeds its own `drafts/zztest-d-spec-*` objects and removes every row titled `ZZTEST-D-SPEC <run>` and the storage objects it created in `afterAll`.
- `tests/project-before-after.spec.ts`: the admin pairing markup did not affect it (its pins are on the public gallery), but its live lightbox test could never run.
  It looked for `a[href^="/projects/"]` on `/portfolio`, and the cards navigate with `router.push` from a hover-revealed "View Details" button, so it skipped on every run.
  It now hovers, waits for the 300 ms slide-in (clicking mid-slide opened the portfolio lightbox instead), clicks, and asserts the counter only when PhotoGallery renders one (more than one item).
  Both branches were exercised: a one-photo project (no counter) and a four-item project ("1 / 4" to "2 / 4").
- `tests/admin-nav-simplified.spec.ts`: all pass in stub mode.
  In the live-backend command one test fails, "the Request a review card queues the day-0/3/7 sequence".
  It signs in with a stub cookie that only a server pointed at the GoTrue stub (127.0.0.1:9099) accepts; against the real local Supabase the page renders empty.
  I proved this rather than assumed it: with the dev server restarted on `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9099`, `E2E_STUB_BACKEND=1` ran all 26 non-live tests in the three files green, that one included.
  It does not touch the Projects tab.

Results on the final commit:

- Live: 33 passed, 1 failed (the stub-only test above), 0 skipped.
- Stub: 26 passed, 8 skipped (the live-backend tests), 0 failed.
- `npm run typecheck`: clean.
- `eslint --max-warnings 0` on every file I touched: clean.
- `chaos:static`: 0 new violations.
  `npm run chaos:static` itself crashes before running any check on this machine (Node 20.20, ts-node with the tsconfig's `module: esnext`, `ERR_UNKNOWN_FILE_EXTENSION`); this is pre-existing and on the coordinator's retro list.
  The command I ran: `node_modules/.bin/ts-node --compiler-options '{"module":"commonjs","moduleResolution":"node"}' scripts/chaos-static.ts`.

## Seen in the browser

- Desktop and tablet screenshots of the manager, the empty form, the form mid-upload, the filled form with both sections open, the manager after save, after publish, the public project page and the edit view.
- Zero CSP violations in the console after the CSP fix.
- The remaining console noise is local schema gaps, not code: `/api/admin/dashboard` 500 (`column blog_posts.title does not exist` locally) and `google_reviews` 404 (the table does not exist locally, so the review picker is empty here).
- The CLI run published a project whose before/after pair rendered as a slider and whose `--date 2026-09` showed as September 2026.

## Uncertain, or not proven here

- Nothing was deployed.
  The 4.5 MB Vercel body cap, the signed-upload PUT against hosted Supabase (the uploads route also returns the publishable key as an `apikey` header in case the gateway wants one), and revalidation on publish under a production build were all verified only against `next dev` and the local Supabase.
- The homepage reorder and the bulk Feature and Archive actions still write from the browser with the user session, as before.
  On production they depend on the existing admin RLS policies; locally the tables have RLS disabled, so no extra policy was needed and none was added.
  Bulk Archive now sets `status='archived'` with `active=false`.
- `in_use` in the storage panel compares exact URL strings.
  If production `project_images` rows store a different URL form (a custom domain or a transformed URL) for `drafts/` objects, those would show as unused.
- Media replacement on update is several REST calls, not one transaction; the ordering means a failure leaves duplicate images, never a project without images.
- Photos uploaded in the form and then abandoned (Cancel) stay in `projects/` as orphans; nothing cleans them.
- The Google review picker and the duplicate-with-media path were exercised only by code reading and typecheck, not in a browser (no `google_reviews` table locally; I did not click Duplicate).

## Commands for a reviewer

```bash
# In the worktree, with the .env.local from the brief and the local Supabase running
npm ci
npm run dev -- -p 3104

# Admin user for the browser test (once)
curl -s -X POST http://127.0.0.1:55421/auth/v1/admin/users \
  -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin-d@local.test","password":"LocalAdmin!2026","email_confirm":true}'

TEST_URL=http://localhost:3104 E2E_LIVE_BACKEND=1 node_modules/.bin/playwright test \
  tests/project-drafts.spec.ts tests/project-before-after.spec.ts tests/admin-nav-simplified.spec.ts --project=chromium
npm run typecheck
node_modules/.bin/eslint --max-warnings 0 src/components/admin/projects src/components/admin/ProjectUploadSystem.tsx \
  src/components/admin/PortfolioManager.tsx src/components/AdminContent.tsx src/components/ProjectDetailClient.tsx \
  src/lib/projects src/app/api/admin/projects src/app/api/projects src/app/free-estimate/page.tsx \
  scripts/ingest-project.mjs tests/project-drafts.spec.ts tests/project-before-after.spec.ts
node_modules/.bin/ts-node --compiler-options '{"module":"commonjs","moduleResolution":"node"}' scripts/chaos-static.ts
grep -rn "analyze-project\|GEMINI\|ai-project-assistant\|Sparkles" src/components/admin/projects \
  src/components/admin/ProjectUploadSystem.tsx src/components/admin/PortfolioManager.tsx   # expect nothing
grep -rni gemini src   # expect nothing

# The CLI against the local site
node scripts/ingest-project.mjs --site http://localhost:3104 --token "$PROJECT_INGEST_TOKEN" \
  --title "ZZTEST-D Review" --location Clifton --service "Kitchen Remodeling" --after some-photo.jpg
```

The one expected failure in that Playwright command is the stub-cookie follow-ups test described under Tests.

Local test data: I removed every row and storage object I created (titles prefixed `ZZTEST-D`, objects `drafts/zztest-d-*` and the `projects/` objects those rows referenced); the `project-images` bucket is empty again, as it was at the start.
The local auth user `admin-d@local.test` is left in place for the reviewer.
The spec seeds and cleans up its own.
