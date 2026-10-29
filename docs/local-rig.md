# Local rig: the site against a local Supabase

Use this for anything that writes to the database, exercises uploads, or needs an admin session.
Production is never the test target.

## Start

```bash
supabase start          # Docker; first run pulls images
supabase db reset       # replay every migration from scratch (about a minute)
supabase status         # prints the local keys
```

Ports: API `http://127.0.0.1:55421`, Postgres `postgresql://postgres:postgres@127.0.0.1:55422/postgres`, Studio `:55423`, Mailpit `:55424`.
The keys `supabase status` prints are the standard local demo keys, not secrets.

`supabase start` restores a stale local backup when one exists; `db reset` is what makes the schema match the repo.

## Environment for a dev server

Export these (or put them in a `.env.local` in a worktree; never replace the main checkout's `.env.local`, which points at production for the live-backend link sweep):

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55421
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon key from supabase status>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<same>
SUPABASE_SECRET_KEY=<service role key from supabase status>
INTERNAL_WEBHOOK_SECRET=<any 32+ chars>
CRON_SECRET=<any 32+ chars>
RECAPTCHA_E2E_BYPASS_TOKEN=<any 32+ chars>
PROJECT_INGEST_TOKEN=<any 32+ chars>
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=test-placeholder-site-key
NEXT_PUBLIC_RECAPTCHA_V2_SITE_KEY=test-placeholder-v2-site-key
NEXT_PUBLIC_SITE_URL=http://localhost:<port>
```

Leave Resend, Telegram, Twilio, SpecNook and Places unset so those paths degrade to `not_configured`, which is itself worth testing.

Port 3000 belongs to the pre-push smoke run; use 3101 and up for dev servers.

## Admin sign-in

The local GoTrue has no users.
Create one, then sign in at `/auth`:

```bash
curl -s -X POST http://127.0.0.1:55421/auth/v1/admin/users \
  -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@local.test","password":"LocalAdmin!2026","email_confirm":true}'
```

## Dev server versus production build on this rig

The CSP in `next.config.ts` allows `http://127.0.0.1:*` for connect, img and media only when `NODE_ENV=development`.
A production build (`npm run build && npm run start`) therefore cannot sign in to the admin or read `google_reviews` from the browser against the local rig; use it for CSP, headers and Lighthouse, and use `next dev` for admin and live-backend specs.
Anything about caching (ISR, `revalidatePath`, "shows on the next request") needs the production build, because `next dev` never caches; a Playwright spec can still drive the admin there with `test.use({ bypassCSP: true })` (see `tests/articles-ingest.spec.ts`).

## Running the live-backend specs

```bash
TEST_URL=http://localhost:3101 E2E_LIVE_BACKEND=1 node_modules/.bin/playwright test tests/<spec> --project=chromium
```

Warm the pages with a few curls first; a cold dev server renders the first parallel loads in about 35 s and the specs time out.

On a production build served with `next start` (which prints "does not work with output: standalone" and runs anyway), a write that revalidates a page shows within a few seconds, not always on the very next request: the first requests after it can still get the old render.
A spec that checks a page right after an admin or agent write polls for up to 10 seconds instead of asserting the first response (`tests/cta-tests.spec.ts` CT5, `tests/experiments.spec.ts` "EX2 cleanup check").
Restore shared state through the admin route (or `POST /api/admin/revalidate`), never only with a direct REST write, or the cached homepage keeps the test's version for the next run.

## Production-only objects

Several tables were created in the Supabase dashboard and never had a migration: `projects`, `project_images`, `rate_limits`, `google_reviews`, the full `leads` column set, and the `app_role` type with `has_role()`.
`supabase/migrations/00000000000001_preview_baseline_fixups.sql` recreates each one guarded, so a replay matches production closely enough to test against.
When a new dashboard-created object turns up, add it guarded the same way.
Put it in a NEW dated migration, not in the fixups file: the fixups version is already applied on the shared rig and on preview branches, so an edit to it never reaches them, while a new version does (the reason `1ae7720` and `20261030000001_blog_posts_local_columns.sql` are separate files).
Each statement must be a no-op on production: `IF NOT EXISTS`, inside a check that the table exists, with no constraint that production rows might break.
The `blog_posts` dashboard columns (title, slug, content, category, author, excerpt, featured_image, meta fields, created_at, updated_at) arrive that way in `20261030000001_blog_posts_local_columns.sql`.

To apply a new migration to the shared rig without a reset (other builders share it), run `psql postgresql://postgres:postgres@127.0.0.1:55422/postgres -v ON_ERROR_STOP=1 -f supabase/migrations/<file>.sql` and then `psql ... -c "NOTIFY pgrst, 'reload schema'"`.
Never `supabase db reset` while other agents use the database.
