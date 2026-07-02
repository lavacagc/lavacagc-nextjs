# SEO Autonomy — Phase 1 (Observer)

Read-only ingest + reporting. Phase 1 takes **no action**; it pulls metrics
from GSC + GA4 into `public.seo_metrics` and surfaces opportunities via
`/api/cron/seo-report`. Later phases will enqueue rows in `content_actions`
for human review.

## Files

| File | Purpose |
| --- | --- |
| `google-auth.ts` | Service-account JWT → access token, with cache + fixture bypass |
| `gsc-client.ts` | Search Console `searchAnalytics.query` (page × query × date) |
| `ga4-client.ts` | GA4 Data API `runReport` (pagePath × date) |
| `url.ts` | Normalize URLs/paths to canonical pagePath for cross-source joins |
| `supabase-rest.ts` | Service-role REST helper, supports upsert via `on_conflict` |
| `fixtures/gsc.json` | Canned GSC rows for offline testing |
| `fixtures/ga4.json` | Canned GA4 rows for offline testing |

Routes:

- `GET /api/cron/seo-ingest?days=N&dryRun=0|1` — Bearer `CRON_SECRET`
- `GET /api/cron/seo-report` — Bearer `CRON_SECRET`

## Local testing (no real Google credentials needed)

The fastest validation — runs the clients + report shaping logic directly:

```bash
SEO_INGEST_MODE=fixture npx tsx scripts/seo-smoke.ts
```

To exercise the HTTP routes end-to-end, add to `.env.local`:

```
CRON_SECRET=local-dev-secret
SEO_INGEST_MODE=fixture
```

Restart `npm run dev`, then:

```bash
curl -H "Authorization: Bearer local-dev-secret" \
  'http://localhost:3001/api/cron/seo-ingest?days=30&dryRun=1'

curl -H "Authorization: Bearer local-dev-secret" \
  'http://localhost:3001/api/cron/seo-report'
```

Or via Playwright:

```bash
CRON_SECRET=local-dev-secret SEO_INGEST_MODE=fixture \
  npx playwright test tests/seo-cron.spec.ts --project=chromium
```

## Production env vars

Set in Vercel → Settings → Environment Variables (Production scope only):

- `GOOGLE_SERVICE_ACCOUNT_B64` — `cat svc.json | base64`
- `GSC_SITE_URL` — `sc-domain:lavacagc.com`
- `GA4_PROPERTY_ID` — numeric property id
- `CRON_SECRET` — already set, gates `/api/cron/*`
- `SEO_REPORT_EMAIL` — optional; weekly digest recipient (defaults to `LEAD_NOTIFICATION_EMAIL`, then `alex@vacamoo.com`)
- `RESEND_API_KEY` — already set; the weekly digest is sent via Resend (through
  `sendTrackedEmail`, so each send is recorded in `email_log` and visible in the
  admin Email Tracking tab)

The service account needs:
- GSC: added as **Restricted user** to the property at search.google.com/search-console/users
- GA4: added with **Viewer** role at Property → Property Access Management

Do **not** set `SEO_INGEST_MODE` in production — fixture mode is local-only.

## Cron schedule (already wired in `vercel.json`)

```json
{ "path": "/api/cron/seo-ingest?days=3", "schedule": "0 6 * * *"  }  // nightly
{ "path": "/api/cron/seo-report?email=1", "schedule": "30 6 * * 1" }  // Mondays
```

- `seo-ingest` runs nightly at 06:00 UTC (~02:00 ET, after GSC's daily finalization).
- `seo-report?email=1` runs Mondays at 06:30 UTC and emails the weekly digest via Resend.
  Without `?email=1` the route just returns the report as JSON (handy for manual checks).

These fire automatically once the Google env vars above are set in Vercel; until then the
ingest run returns a credentials error and the report is empty.
