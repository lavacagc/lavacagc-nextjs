# Slice D review: portfolio drafts, one-click publish, ingest API

Reviewer: independent reviewer for slice D (Opus).
Branch reviewed: `worktree-agent-a869d961f20dde8b3` at `6a1d976`, diffed against `fc6fe33`.
Rig: own dev server on port 3114, local Supabase at 127.0.0.1:55421, production build run separately.
Date: 2026-10-29.

**Verdict: ACCEPT WITH FIXES.**

No defect blocks the slice.
Seven low-severity defects need the builder, and one item needs checking on production before launch: whether anonymous REST reads of `projects` are limited to `active = true`.

## Acceptance criteria

| AC | Result | Evidence |
| --- | --- | --- |
| PF1 | CONFIRMED | I walked the form at 1440x900 and 820x1180. It is one page with no step indicator. It has Title, Location with a datalist, six service chips, one drop zone, a photo grid, a pair tool, collapsed "More details" and "SEO", and a "Save draft" button. `grep -rni gemini src` finds nothing, and the spec's source pins pass. |
| PF2 | CONFIRMED | Every thumbnail had a Before / During / After radio group defaulting to After, a star, a delete button and alt text, all visible without hover on the tablet. I set one photo to Before and linked a pair. The database then held `before` and `after` rows sharing one `pair_key`, and the public page rendered a "Before / After" slider. |
| PF3 | CONFIRMED | Saving from the browser returned 201 with `status=draft, active=false, featured=false`. `/projects/<slug>` answered 404. The `/portfolio` and `/` HTML did not contain the title. Every public `.from('projects')` read has `.eq('active', true)`: sitemap, the three reads in `/projects/[slug]`, `/portfolio`, `/free-estimate` and `ProjectGallery`. See the launch follow-up on REST reads below. |
| PF4 | CONFIRMED | One click on the draft card's Publish returned 200. The card moved to Published, `/projects/<slug>` answered 200, and the spec checked `published_at` and that Publish + feature sets `featured`. Making publish write `active: false` broke spec PF4, so the spec does test the switch. |
| PF5 | CONFIRMED | With curl, JSON with a storage `path` returned 201 with `source=api`. Multipart with a file returned 201 and stored `projects/<id>_0.jpg`. No token and a wrong token both returned 401. Called directly, the helper returns `disabled` (the route answers 404) for an unset, empty, 31-character or whitespace-padded token. Making the token check accept anything broke two spec tests. |
| PF6 | CONFIRMED | On my server, the spec's live listing test and browser test passed. The listing returns `drafts/` objects with URL, size and `in_use`. "Start a draft from these" opened the form with the photo attached and made no upload request. The manager showed the "Draft photos in storage" panel. |
| PF7 | CONFIRMED | In the browser I edited a published project: Actions menu, Edit, change title, "Save changes". It stayed `status=published, active=true` with the same slug. `featured_image_id` pointed at a live row and the pair survived. The public page showed the new title. The ingest PATCH answered 409 on a published project unless `allow_published` was sent. |
| PF8 | CONFIRMED | The `analyze-project` and `keyword-research` routes and `project-steps/` are deleted. `grep -rn "analyze-project\|keyword-research\|GEMINI\|ai-project-assistant" src` finds nothing. `Sparkles` remains only as a Lucide icon in unrelated pages (home care, services, blog editor), not in the project path. |
| SEC1 | CONFIRMED | Bodies over 256 KB get 413 (spec). Invalid bodies get 400 with zod issues. Bad JSON gets 400 "Invalid JSON body.". Of 32 calls in a minute, calls 1 to 30 got 401 and calls 31 and 32 got 429 with `Retry-After: 60`. A valid-token call while limited also got 429. Server errors go through `errorResponseBody`, which logs the error and returns a fixed sentence. |
| SEC2 | CONFIRMED (magic bytes); the private-bucket clause does not apply | Every path sniffs bytes. A text file named `.jpg` got 415 through multipart and 422 through a signed upload plus `path`. Server-stored files get the sniffed content type, not the client's. `project-images` is public by design because it feeds the public portfolio, so "private bucket, signed reads with a 7-day TTL" does not apply. Fable should confirm that reading. |
| SEC4 | CONFIRMED | `tokensMatch` SHA-256-hashes both sides and compares the digests with `timingSafeEqual`, so the lengths always match. Timing measured over 200,000 calls was flat: equal, first byte different, last byte different and short token were all within about 1.2 µs. |
| SEC5 | CONFIRMED | The admin reads and writes `projects` and `project_images` through `/api/admin/projects/*` with the service key. The browser still reads `service_areas`, and bulk Feature/Archive and the reorder still write `projects` with the user session. These are existing tables, not new ones. |

Confirmed: 12 of 12, with SEC2 confirmed only for the clause that applies.

## Click counts (measured, scripted Playwright, real CSP, no bypass)

| Flow | Desktop 1440x900 | Tablet 820x1180 |
| --- | --- | --- |
| Photos to draft, with one Before, one After and a linked pair | 10 | 10 |
| Photos to draft, minimum path (no stage change, no pair) | 6 | 6 |
| Draft to published | 1 | 1 |
| Edit a published project's title and save | 4 | 4 |

The 10 are: Add New Project, drop both files, set photo 1 to Before, pick Before in the pair tool, pick After, Link as pair, Title, Location, service chip, Save draft.
That matches the decision's six plus the optional stage toggle and the three-click pair tool.
Getting to the tab (Content, then Projects) adds 2 clicks and is not counted in either number.
Suggestion only: when a project has exactly one unpaired Before and one unpaired After, the pair tool could offer a one-click "Link these two", which would make it 8.

## Browser console (real CSP)

There were no CSP violations at either width, on the form, the manager, the public project page, `/portfolio` or `/`.
The only console error was `/api/admin/dashboard` answering 500, from the local schema gap (`column blog_posts.title does not exist`, 27 times in the server log), not from this slice.
The deep link `/vaca-mgmt?project=<id>` opened the form with no console errors and no hydration warning.
A 9.6 MB, 6000 px JPEG dropped on the tablet form was re-encoded in the browser and stored as 458 KB through the multipart route (201).
Duplicate, which the builder had not clicked, made a full draft copy with both pair rows, the video and the date.

## Defects

| # | Severity | Where | What breaks | Fix |
| --- | --- | --- | --- | --- |
| 1 | Low | `src/lib/projects/ingest.ts:113-114` | When `resolveIngestImages` refuses a signed-upload object (wrong bytes), it answers 422 but leaves the object in the public bucket. I reproduced this with the CLI and a text file named `.jpg`: the object stayed at a public `project-images/projects/...jpg` URL and answered 200. The admin `verify` path does delete. | On a refused `projects/` path that no `project_images` row references, delete it, as `verifyStored` does. |
| 2 | Low | `src/lib/projects/uploads.ts:62-73`, bucket config | The declared `size` on a signed-upload request is never enforced. I declared 100 bytes and PUT 9.6 MB, and storage accepted it. The local bucket has no `file_size_limit` or `allowed_mime_types`, and the production values are unknown. Only token holders and admins can do this. | Set `file_size_limit` (200 MB) and `allowed_mime_types` on the `project-images` bucket, or HEAD the object in verify/resolve and refuse anything over the cap. |
| 3 | Low | `src/lib/projects/uploads.ts:79-84` | `verifyStored` deletes any `projects/` object whose sniff returns null, and a non-200 fetch also returns null. An admin `verify` call on a live project's object during a storage blip would delete that object. | Delete only when the fetch succeeded and the bytes are wrong, and only when no `project_images` row references the path. |
| 4 | Low | `src/lib/projects/media.ts:29` | The JPEG test reads 3 bytes, so a file starting `FF D8 FF` followed by HTML is accepted and saved as a project image. It shows as a broken image on the card, which I saw in the manager. It is served as `image/jpeg` (multipart) or `text/plain` (Supabase's HTML guard), so it is not script-executable. | Optional: confirm the image decodes on the server (for example with image-size or sharp metadata) before storing. |
| 5 | Low | `src/lib/projects/http.ts:61` versus the "Project ingest" contract in `acceptance-criteria.md` | The contract says `admin_url` is `/vaca-mgmt?tab=projects&project=<id>`. The code returns `/vaca-mgmt?project=<id>`. It works, because `AdminContent` opens Projects on `?project=`, but the code and the contract disagree. | Change the contract text to match, or add `tab=projects`. |
| 6 | Low | `tests/admin-nav-simplified.spec.ts:120` | The follow-ups test fails on every live-backend run because it signs in with a stub cookie that only the GoTrue stub accepts. I confirmed this is environmental: the page redirected to `/auth?next=/vaca-mgmt/follow-ups`. A test that always fails in one supported mode hides real failures. | `test.skip(!!process.env.E2E_LIVE_BACKEND, 'stub-cookie sign-in')` on that describe, or sign in for real when live. |
| 7 | Low | `src/components/admin/PortfolioManager.tsx:181` | Bulk Archive and Feature write from the browser and call no revalidation. An archived project stays on cached `/portfolio` and `/` for up to the 60-second ISR window, unlike single Publish and Unpublish. | Route bulk actions through an admin API that calls `revalidateProjectPages()`. |

Cosmetic, not counted: `src/components/AdminContent.tsx:74-75` has a doubled blank line.
`AdminContent.tsx` changes are otherwise limited to the projects tab.

## Launch follow-up (could not verify here)

- **Draft rows on the public REST API.** Locally `projects` has RLS disabled, and the repo has no migration that defines its policies. With the publishable key, `GET /rest/v1/projects?status=eq.draft` returned my draft titles locally. The public pages never render a draft, so PF3 holds. But if production's anonymous select policy is `using (true)`, anyone holding the publishable key can read draft titles, challenge and solution text before Alex publishes. Before launch, check that the production policy is `active = true` for anon. That matters more now that Claude Code creates drafts.

## Gates (run by me)

| Gate | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `eslint --max-warnings 0` on all 41 added or modified ts/tsx/mjs files | exit 0 |
| `ts-node ... scripts/chaos-static.ts` | 0 new violations (2 baselined, 2 fixed since baseline) |
| `npm run build` | exit 0; the four ingest routes are in the route table |
| Specs, live backend, three files | 32 passed, 1 failed (defect 6, environmental), 1 skipped |
| `project-before-after.spec.ts` rerun with published projects present | 6 passed, 0 skipped |
| Sabotage: publish writes `active: false` | spec PF4 failed (`active` expected true) |
| Sabotage: token check returns `valid` for any token | 2 tests failed (helper test, and PF5 got 400 where 401 was expected) |

Both sabotages were reverted with `git checkout`, and `git status` was clean afterwards.

## Other checks

- **Path traversal and foreign URLs on ingest.** `drafts/../../other-bucket/x.jpg`, a percent-encoded `..` inside a bucket URL, an external URL and a lookalike bucket name (`project-images-evil`) all got 400. A missing object got 422.
- **Overwrite.** Object keys are minted by the server (`projects/<ms>-<12 hex>.<ext>`) and every upload uses `upsert: false`. Re-PUTting to a used signed URL, with or without `x-upsert: true`, got 409 Duplicate. A caller cannot overwrite another project's object.
- **Who can mint signed upload URLs.** Only an admin session through `/api/admin/projects/upload`, or the ingest token through `/api/projects/ingest/uploads`. Anonymous calls got 401. The publishable key cannot sign one directly either: storage refused with an RLS error.
- **Anonymous access.** Every `/api/admin/projects*` route answered 401 to GET, POST, PATCH, DELETE, publish, upload-sign and draft-photos. The ingest create, uploads and publish routes answered 401, including with a forged session cookie.
- **Draft-photos listing.** It is admin-only. It returns name, path, public URL, size, created_at, content type and `in_use`, nothing beyond what the public bucket already exposes.
- **Media replacement on PATCH.** After a browser edit, which always resends `images`, `featured_image_id` pointed at one of the new rows and the old rows were gone. Every edit replaces all image rows with new ids, which is acceptable.
- **The 3.5 MB threshold.** Photos up to 3.5 MiB (3,670,016 bytes) pass unchanged, and re-encodes target at most 3.8 MiB. The server refuses a declared body over 4 MiB + 64 KiB (4,259,840 bytes) and a file over 4 MiB. Multipart overhead for one file is a few hundred bytes. Every path stays under Vercel's 4.5 MB (4,500,000 bytes), so the reasoning holds. I could only check this on `next dev`, not on Vercel.
- **Date helper.** `formatMonthYear` is used at both `date_completed` displays in `ProjectDetailClient.tsx` and in the manager. No other public reader formats `date_completed`. The spec pins it under `TZ=America/New_York`. The CLI's `--date 2026-09` rendered "September 2026".
- **CLI.** `scripts/ingest-project.mjs` uploaded a 9.2 MB JPEG at full size, an MP4 and a Before photo through signed URLs. It linked the pair, published with `--publish` and exited 0. An unknown service and a fake photo exited 1 with clear messages.

## Report claims I could not reproduce

- "Live: 33 passed, 0 skipped." I got 32 passed and 1 skipped. The skip is the lightbox test, which skips when no project is published, and my database had none when the run started. With published projects present it passed, so the claim is data-dependent, not wrong.
- "The signed-upload path verifies and deletes refused objects." That is true for the admin form's `verify`, but not for objects refused at ingest `path` resolution (defect 1).
- I did not reproduce the hosted-Supabase signed PUT, the Vercel body cap or revalidation under a production server. Nothing here was deployed.

## The report's "uncertain" list

| Item | Ship? |
| --- | --- |
| Not deployed (4.5 MB cap, hosted signed PUT, revalidation in production) | Fine to ship to Preview. Before launch, smoke test on Preview: one form save with a large photo, one video, one CLI run, and Publish showing up on `/portfolio` without waiting. |
| Reorder and bulk Feature/Archive still write with the browser session | Acceptable. This was existing behaviour. Check on Preview that the production RLS allows it for the admin. See also defect 7. |
| `in_use` compares exact URL strings | Acceptable. The worst case is a photo shown as unused. |
| Media replacement is several calls, not one transaction | Acceptable. I confirmed the ordering: new rows, then the repointed featured row, then deletion of the old rows. |
| Photos abandoned on Cancel stay in `projects/` | Acceptable for launch. Add a periodic cleanup of unreferenced `projects/` objects later. It would also cover defect 1. |
| Google review picker and Duplicate not exercised | Duplicate is now exercised and works. The review picker still needs one check on Preview, where `google_reviews` exists, before launch. |

## Test data

Every row titled `ZZTEST-RD...`, its image rows, the 13 storage objects I created, and the `project-ingest:*` rate-limit rows were deleted.
The `project-images` bucket and the `projects` table were empty afterwards, as they were before I started.
