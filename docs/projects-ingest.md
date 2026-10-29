# Adding portfolio projects from Claude Code

Claude Code can put a finished job on the website as a portfolio project without opening the admin.
It creates a DRAFT, which never shows on the public site.
Alex reviews it in the admin and publishes it with one click, or tells Claude Code to publish it.

Decision record: `docs/decisions/002-grill-round-1-project-upload.md` (Q5).

## One-time setup

1. Generate a token of at least 32 characters, for example `openssl rand -hex 32`.
2. In Vercel, add the environment variable `PROJECT_INGEST_TOKEN` with that value to Production (and Preview if you want to test there), then redeploy.
3. Keep the same value in your shell or in `.env.local` as `PROJECT_INGEST_TOKEN` for the CLI.

If the variable is missing or shorter than 32 characters, every `/api/projects/ingest` route answers 404 to everyone, signed-in admins included.
That is deliberate: a deploy that forgot the token exposes nothing.

## The CLI

`scripts/ingest-project.mjs` needs Node 18 or newer and nothing else.

```bash
export PROJECT_INGEST_TOKEN=...   # the value from Vercel

node scripts/ingest-project.mjs \
  --site https://www.lavacagc.com \
  --title "Modern Kitchen Remodel" \
  --location "Clifton" \
  --service "Kitchen Remodeling" \
  --before ~/Jobs/smith/before-1.jpg \
  --after ~/Jobs/smith/after-1.heic \
  --after ~/Jobs/smith/after-2.jpg \
  --after ~/Jobs/smith/walkthrough.mov \
  --pair \
  --challenge "A dark galley kitchen with no counter space." \
  --solution "We opened the wall to the dining room and added a quartz island." \
  --date 2026-10
```

It prints the draft id, its slug, and an admin link such as `https://www.lavacagc.com/vaca-mgmt?tab=projects&project=<id>`, which opens the project in the editor.

| Option | Meaning |
| --- | --- |
| `--site` | The site to post to. Default `PROJECT_INGEST_SITE`, then `https://www.lavacagc.com`. |
| `--token` | The ingest token. Default `PROJECT_INGEST_TOKEN`. |
| `--title`, `--location` | Required. |
| `--service` | Required, repeatable. One of: Kitchen Remodeling, Bathroom Renovation, Basement Finishing, Home Additions, Whole Home Remodel, Custom Living Space. |
| `--before`, `--during`, `--after` | Local photo or video files, repeatable. JPEG, PNG, WebP, HEIC (converted with `sips` on macOS), MP4, MOV, WebM. |
| `--from-storage <path>[:before\|:during\|:after]` | A file already in the `project-images` bucket, for example `drafts/1760035527927-bund8n.jpg:after`. Default stage is after. Nothing is re-uploaded. |
| `--pair` | Link the first Before and the first After as a before/after slider. |
| `--challenge`, `--solution`, `--client`, `--date YYYY-MM`, `--budget`, `--duration`, `--slug`, `--keyword` | Optional details. |
| `--material`, `--feature-item` | Optional, repeatable chips. |
| `--publish` | Publish right after creating the draft. |
| `--feature` | Publish and put it on the homepage. |
| `--dry-run` | Show what would be sent, send nothing. |

Local files go to storage through signed upload URLs, so a full-size 10 MB phone photo never passes through a size-capped function.
The server reads the first bytes of every file and refuses anything that is not a real photo or video, whatever its name says.
Whatever is left out, the server fills with fixed defaults: the slug from title and location, the SEO title as `<title> in <location>`, the meta description from the challenge and solution, and alt text such as `After - Kitchen Remodeling in Clifton`.

## Worked example for Claude Code

Alex says: "The Smith kitchen in Clifton is done, photos are in ~/Jobs/smith, put it on the site as a draft."

1. List the folder and sort the photos into before and after by looking at them (or by their names if Alex named them).
2. Run the CLI with `--before` and `--after` for each, `--pair` if there is an obvious matching angle, and a one-sentence `--challenge` and `--solution` if Alex described the job.
   Do not invent details Alex did not give.
3. Reply with the admin link the CLI printed and say it is a draft.
4. Only if Alex says "publish it" (or "publish and feature it"), publish it with the API call below, or re-run with `--publish` when creating.

To start from the photos that are already sitting in storage (the admin's "Draft photos in storage" panel lists them):

```bash
node scripts/ingest-project.mjs --title "Basement Finish" --location "Parsippany" \
  --service "Basement Finishing" \
  --from-storage drafts/1760035527927-bund8n.jpg:before \
  --from-storage drafts/1760035531112-k2m9qa.jpg
```

## The API, for anything that is not the CLI

All routes take `Authorization: Bearer <PROJECT_INGEST_TOKEN>` (or a signed-in admin session) and are rate limited to 30 requests a minute per IP.
Answers are `{ id, url_slug, status, admin_url }`.
Errors are `{ error }` with a status code, plus `issues` for validation failures, and never include server internals.
The site's bot filter refuses a few client user agents (curl, wget, python-requests and others), so send a browser-like `User-Agent` when testing with curl (`curl -A "Mozilla/5.0" ...`).

| Route | What it does |
| --- | --- |
| `POST /api/projects/ingest` | Create a draft. JSON: `{ title, location, service_types: [...], images: [{ path \| url, category, alt_text?, is_featured?, pair_key?, caption? }], ...optional fields }`. `path` is a key in `project-images`; `url` is a public URL in that bucket. Or multipart: a `project` field holding that JSON plus `files[]`; each file is stored as `projects/<id>_<n>.<ext>`, an image entry can point at one with `{ "file": n }`, and unreferenced files are added as After photos. Multipart bodies are capped at 4.5 MB on Vercel, so use signed uploads for large files. |
| `POST /api/projects/ingest/uploads` | `{ files: [{ filename, size, kind: "image" \| "video" }] }` answers signed upload URLs. PUT each file's bytes to its `signed_url` with its `Content-Type` (and the returned `headers`), then reference it by `path` in the create call. Photos up to 25 MB, videos up to 200 MB, checked again on the stored object. A stored object the create call refuses (wrong bytes, over the cap) is deleted, since nothing references it; a `drafts/` photo you merely referenced is never deleted. A 503 means storage did not answer the check; retry. |
| `PATCH /api/projects/ingest/<id>` | Update a draft. Any subset of the create fields; `images`, when sent, replaces all media. A published project answers 409 unless the body has `"allow_published": true`. |
| `POST /api/projects/ingest/<id>/publish` | Publish (`{ "feature": true }` also puts it on the homepage). |

Example, publishing a draft:

```bash
curl -A "Mozilla/5.0" -X POST "https://www.lavacagc.com/api/projects/ingest/<id>/publish" \
  -H "Authorization: Bearer $PROJECT_INGEST_TOKEN"
```

## What the owner sees

In the admin, Content > Projects shows the draft at the top under Drafts, marked "From Claude Code", with Publish, Publish + feature, Edit and Delete.
Publishing makes it live on `/projects/<slug>`, `/portfolio`, and with feature on the homepage, at once (the pages are revalidated on publish).

## First run after deploy: the twenty photos already in `drafts/`

Production's `project-images/drafts/` folder holds twenty uploads from October 2025 that never became projects.
Their upload timestamps fall into eight groups, three of which are the same photo and video uploaded three times (identical sizes).
After the branch is deployed and `PROJECT_INGEST_TOKEN` is set in Vercel, this creates one draft per group with a placeholder title; Alex retitles, picks the location and service, and publishes from the Drafts section.

| Draft | Files (bucket path under `drafts/`) | Note |
| --- | --- | --- |
| 1 | `1760035527927-bund8n.jpg`, `1760035528881-sy94v.jpg` | two photos |
| 2 | `1760036430841-997oy.jpg`, `1760036431194-oxllou.jpg` | two photos |
| 3 | `1760037196040-lzxu8f.jpg`, `1760037197481-ph4st.MOV` | photo plus video; `1760037210351-mp7c1j.jpg`, `1760037211988-gazxuf.MOV`, `1760037415857-j94tr5.jpg`, `1760037417342-8egksa.MOV` are byte-identical re-uploads and are skipped |
| 4 | `1760037993595-43pmp.jpg`, `1760037995478-kjyqn.jpg` | two photos |
| 5 | `1760038440520-7gyl9.jpg`, `1760038443111-tmdypk.jpg` | two photos |
| 6 | `1760039172881-u0uk3.jpg`, `1760039174662-s2r0l.jpeg` | two photos |
| 7 | `1760040697398-dspj0f.jpeg`, `1760040698288-2sgnil.jpeg` | two photos |
| 8 | `1760979633596-z72pch.jpeg`, `1760979633887-6161ab.jpeg` | two photos, uploaded 2025-10-20 |

```bash
export SITE=https://www.lavacagc.com PROJECT_INGEST_TOKEN=<from Vercel>
node scripts/ingest-project.mjs --site $SITE --token $PROJECT_INGEST_TOKEN --title "Draft 1 - retitle me" --location "Northern NJ" --service "Kitchen Remodeling" --from-storage drafts/1760035527927-bund8n.jpg --from-storage drafts/1760035528881-sy94v.jpg
# ... one call per row above; the CLI prints each draft's admin URL
```

The location and service type are placeholders because the photos carry no metadata; the admin form requires both, so the CLI passes them and Alex corrects them before publishing.
Nothing is published by this run.
