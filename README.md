# La Vaca General Contractors website

Next.js 16 (App Router) on Vercel, Supabase for data, Resend for email.
Agent and contributor rules live in `CLAUDE.md`; the 2026-10-31 audit behind this setup is `docs/home-care-audit.md`.

## Getting started

Node 22 (`.nvmrc`; production runs 22.x).
With fnm: `fnm use` in the repo picks it up.

```bash
npm ci
npm run dev -- -p 3101   # 3000 is left for the Playwright suite
```

`.env.local` points at production Supabase with public keys only.
To develop against a local database instead, follow `docs/local-rig.md`.

## Tests

| Command | What it runs |
| --- | --- |
| `npm run lint` / `npm run typecheck` | ESLint, TypeScript |
| `npm run chaos:static` | structural invariants with a ratchet (`chaos/`) |
| `npm run test:e2e` | stub-backed production build, then the Playwright suite |
| `npm run test:smoke` | the critical-path specs, against an existing `test:build` |
| `node scripts/asset-guard.mjs` | fails on a new `public/` file over 1 MB |
| `deno test --allow-net --allow-env supabase/functions/send-warranty-notification/photos.test.ts` | edge-function helpers (storage half needs staging env, see the file) |

Read `docs/testing.md` before writing or running specs: every Playwright script pins a stub or live backend.

## Pull requests

Changes ship through the no-mistakes gate (`CLAUDE.md`, "Shipping changes").
On every PR, `.github/workflows/ci.yml` runs lint, types, static checks, the asset guard, the migration rollback-note check, a production build, the smoke suite and a gitleaks secret scan.
Its `ci` job is the required check on `main`; docs-only changes skip the build and still pass.
The local pre-push hook runs only the fast checks (types, chaos static, ESLint on changed files).

### Previews

Vercel builds a preview for every pull request.
Previews read and write the **staging** Supabase project `wrffvnmtmtgfrcqvcbia` (free org "La Vaca Staging"), never production.
Outside real production (a Vercel production function: `VERCEL_ENV=production` with the runtime-only `VERCEL_REGION` set) all email is redirected, including previews, `vercel dev`, and local `next dev`/`next start` even on a `.env.local` pulled from production.
It goes to `EMAIL_REDIRECT_TO`, or else Resend's test sink `delivered@resend.dev`, with the real recipients in the subject, and Resend audiences are never written (`src/lib/notify/emailSafety.ts`).
Previews sit behind Vercel Authentication: open them signed in, or use `vercel curl <url>/path`.

Staging gets the schema from `supabase/migrations` and public content from production with `SUPABASE_ACCESS_TOKEN=... node scripts/db/seed-staging.mjs` (an allowlist of content tables; no customer data).

## Deploys

Production deploys only through `.github/workflows/deploy.yml`, on every push to `main` that touches more than docs.
Vercel's own Git deploys of `main` are off (`vercel.json` `git.deploymentEnabled`).

1. **Migrate**: `supabase db push` to production, dry run first. If it fails, nothing else runs and the current site keeps serving.
2. **Build** on the GitHub runner with production's environment (`vercel pull`, `vercel build`).
3. **Deploy without the domain**: `vercel deploy --prebuilt --prod --skip-domain`.
4. **Smoke the new deployment**: `/`, `/services/kitchen-remodeling`, `/home-care` and `/api/health`, which must report this commit (`scripts/smoke.sh`). If it fails, the domain never moves.
5. **Promote**: `vercel promote` switches www.lavacagc.com in one step.
6. **Confirm** the domain serves the new deployment, then smoke www.
7. **Alert** on any failure: Telegram plus a GitHub issue.

Secrets live in the GitHub environment `production-deploy` (only `main` may use it) and in Vercel, never in the repo.

### Migrations

Every new migration needs a `-- Rollback:` comment saying how to undo it; CI fails without one.
Migrations land before the new app, so they must work with the app that is still running: add columns and tables first, remove them in a later deploy.
`.github/workflows/migrations-replay.yml` replays every migration on a fresh database for each PR that touches `supabase/`.
To check production's migration history: `supabase migration list --linked`.
If production drifts from the migrations again, `scripts/db/schema-drift.mjs` turns a schema dump diff into an idempotent migration (see `20261031000200_production_schema_baseline.sql`).

### Edge functions

Supabase edge functions are not deployed by the pipeline.
Deploy one with `supabase functions deploy <name> --project-ref xrvbrnrbnyfdwkfdoepq`, before merging app code that depends on it, and keep it accepting the previous payload until the app is live.

## Rollback

**App, one step:** `vercel rollback --yes` (or in the dashboard, Deployments, the previous production deployment, "Promote").
The previous deployment is still built, so the switch is immediate; the next merge to `main` deploys forward again.

**Database:** run the `-- Rollback:` SQL from the migration's header against production (Supabase SQL editor, or `psql`), then record it with `supabase migration repair --status reverted <version> --linked`.
Roll the app back first when the old app cannot work with the new schema.

## Monitoring

- `GET /api/health`: commit and a 3-second Supabase ping, 200 or 503; exempt from the bot filter so monitors can read it.
- Better Stack uptime checks on `/` and `/api/health` (email alerts).
- Telegram: deploy failures, new leads, form errors.
