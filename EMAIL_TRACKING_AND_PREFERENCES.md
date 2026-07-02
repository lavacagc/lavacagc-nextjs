# Email Tracking & Preference Center - Implementation Summary

**Branch:** `feat/email-tracking-preferences`
**Scope:** universal outbound-email audit log (Phase 1), admin Email Tracking UI + Resend delivery webhook (Phase 2), self-serve preference center + admin subscription control (Phase 3).

---

## What Was Built

### Phase 1: Universal outbound email log

**Files:**
- `src/lib/notify/sendEmail.ts` — `sendTrackedEmail()`, the single chokepoint every outbound email funnels through
- `supabase/migrations/20260731000000_create_email_log.sql` — `public.email_log` table
- `scripts/verify-email-log.ts` — end-to-end proof script

Every sender in `src/lib/notify/*` (home care, listings, leads, estimates, SEO report, staged drafts, rollback digest, form-error alerts, feedback requests) plus the cron routes now send via `sendTrackedEmail` instead of constructing their own Resend client. Each send writes one audit row to `public.email_log` with the **exact rendered HTML/text** that went out, a `category` (see `EmailCategory` in `sendEmail.ts`), optional links to domain entities (`homeowner_id` / `subscriber_id` / `lead_id`), `campaign` metadata, and `sent_by` (admin email when admin-triggered, else `system`).

Logging is **best-effort by contract**: a failed `email_log` insert is swallowed and never changes the send result.

### Phase 2: Admin Email Tracking UI + Resend delivery webhook

**Files:**
- `src/app/api/webhooks/resend/route.ts` — `POST /api/webhooks/resend`
- `src/app/api/admin/emails/route.ts` — `GET /api/admin/emails?category=&status=&q=&limit=` (light list rows)
- `src/app/api/admin/emails/[id]/route.ts` — `GET /api/admin/emails/[id]` (single row incl. full HTML body)
- `src/app/vaca-mgmt/emails/page.tsx` + `src/app/vaca-mgmt/emails/[id]/page.tsx` — admin list + "see exactly what was sent" HTML viewer
- `src/components/admin/AdminSidebar.tsx` / `src/components/AdminContent.tsx` — new **Email Tracking** tab

The webhook receives Resend delivery events (signed with Svix; the signature **is** the auth — unsigned requests are rejected 400), matches them to `email_log` rows by `resend_message_id`, and backfills `delivered_at`, `first_opened_at`/`open_count`, `first_clicked_at`/`click_count`, `bounced_at`, `complained_at`, and `last_event_at`. Status only advances forward (an out-of-order `sent` event can't clobber `opened`); negative terminal states (`bounced`/`complained`/`failed`) are sticky. Events with no matching `email_log` row get a 404 while the event is less than 24 h old (so Svix retries — a fresh event may have raced `sendTrackedEmail`'s post-send insert) and are acked after that cutoff (deliberately unlogged sends, e.g. `log: false`). A **permanent** bounce or spam complaint also **auto-suppresses** the address: every marketing stream is turned off, audited as a `webhook` actor change. Transient/undetermined bounces (e.g. mailbox full) update the log but never suppress.

### Phase 3: Email preference center

**Files:**
- `src/lib/preferences/streams.ts` — client-safe stream definitions (`STREAMS`, `StreamKey`, `normalizeEmail`; no Node imports, so `'use client'` components can import it without pulling server code into the browser bundle)
- `src/lib/preferences/preferences.ts` — token helpers, `applyUpdate` audit + legacy sync; re-exports everything in `streams.ts` for server callers
- `supabase/migrations/20260801000000_create_email_preferences.sql` — `public.email_preferences` + `public.preference_events`
- `src/app/preferences/page.tsx` + `PreferencesClient.tsx` — public self-serve page at `/preferences?token=…`
- `src/app/api/preferences/route.ts` — `GET/POST /api/preferences` (token-authenticated)
- `src/app/api/preferences/unsubscribe/route.ts` — footer links + RFC 8058 one-click (List-Unsubscribe) target
- `src/app/api/admin/preferences/route.ts` — admin view/toggle, bulk list, CSV export
- `src/app/vaca-mgmt/preferences/page.tsx` — admin **Subscriptions** tab
- `src/lib/notify/resendAudience.ts` + `src/app/api/admin/broadcasts/sync-suppression/route.ts` — broadcast suppression sync

One row per (lowercased) email governs three **marketing streams** — `home_care`, `buy_remodel`, `announcements` (labels in `STREAMS`). Transactional mail (verification, estimates, lead follow-ups, internal notifications) is not represented and always sends. Authentication for the self-serve page is the `preference_token`, a capability — same trust model as the existing unsubscribe links. The page fails safe: a footer-link unsubscribe arrives as an in-page confirm prompt (nothing changes until the recipient confirms), a failed save reverts the toggle and shows an error-styled message, and a 429/5xx on load shows a retryable "Try again" state instead of the invalid-link screen.

How each stream is enforced:
- **home_care** — the newsletter sender passes `preferenceStream: 'home_care'` to `sendTrackedEmail`, which skips suppressed recipients (logged as `skipped`/`unsubscribed` so the admin sees the intentional non-send) and attaches per-recipient `List-Unsubscribe` + one-click headers. Stream-governed sends are strictly single-recipient — a multi-recipient send with a `preferenceStream` is rejected and logged as `error` (suppression and the unsubscribe token are per-recipient). The newsletter footer also carries a "Manage email preferences" link.
- **buy_remodel** — kept in sync with the legacy `newsletter_subscribers.status` column, which the Buy+Remodel flows already treat as the source of truth (active-subscriber checks). The subscribe-flow emails (verification, welcome) are transactional and always send.
- **announcements** — Resend broadcasts send to an audience outside the wrapper, so opt-outs are mirrored onto the audience's `unsubscribed` contact flag via `POST /api/admin/broadcasts/sync-suppression { audienceId }` (run right before sending a broadcast; idempotent).

Every stream change is audited in `preference_events` (old/new value, actor `self | admin | webhook | system`, actor detail, IP). Changes also sync the legacy status columns (`homeowners.status`, `newsletter_subscribers.status`) both ways: the old single-purpose unsubscribe links (`/api/home-care/unsubscribe`, `/api/buy-and-remodel/unsubscribe`) now write through to `email_preferences` too. Re-enabling a stream only promotes `unsubscribed` legacy rows back to `active` — `pending` rows stay pending until they complete double opt-in verification.

---

## API Routes

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/webhooks/resend` | Svix signature (`RESEND_WEBHOOK_SECRET`) | Delivery events → `email_log` backfill + permanent-bounce/complaint auto-suppress |
| `GET/POST /api/preferences` | `preference_token` | Self-serve page: read / update streams |
| `GET/POST /api/preferences/unsubscribe` | `preference_token` | Footer links (GET — mutates nothing, redirects to the preference center with a confirm prompt) + RFC 8058 one-click (POST, unsubscribes all marketing) |
| `GET /api/admin/emails` | admin middleware | Email log list (filter by `category`, `status`, `q`, `limit`) |
| `GET /api/admin/emails/[id]` | admin middleware | Single email incl. full rendered body |
| `GET/POST /api/admin/preferences` | admin middleware | Contact lookup + audit trail, admin toggles, bulk list (`?all=1`, optional `stream`/`state`; JSON responses carry a `truncated` flag when the `limit` was hit), CSV export (`&format=csv` — paginates to completion, never truncates) |
| `POST /api/admin/broadcasts/sync-suppression` | admin middleware | Mirror `announcements` opt-outs onto a Resend audience |

`/api/webhooks/resend` and `/api/preferences` are declared in `PUBLIC_ROUTES` in `src/middleware.ts`.

The public preference endpoints are rate-limited per IP via the existing `rate_limits` table (`src/lib/rateLimit.ts`): `GET /api/preferences` 30/min, `POST /api/preferences` 15/min, unsubscribe `GET` 30/min, one-click `POST` 60/min. Over the limit, the JSON endpoints return 429 with a `Retry-After` header; the unsubscribe `GET` instead skips the DB lookup and still redirects to the preference center (the page validates the token itself), so a scanner burst from a shared gateway IP can't break a real click.

## Admin UI

Both live under the existing `/vaca-mgmt` admin (sidebar tabs):
- **Email Tracking** — every sent email, newest first, with status badges (sent → delivered → opened → clicked; bounced/complained/failed; error = rejected before/while sending, e.g. a misconfigured stream-governed send; skipped = intentional suppression), category/status filters and search; per-row detail view renders the exact HTML that was sent.
- **Subscriptions** — look up any contact's streams + change history, toggle streams as admin (audited), bulk list with per-stream on/off filters (flagged when it shows only the most recent records), CSV export, and the broadcast suppression sync button.

## Database

Apply both migrations (Supabase dashboard SQL editor or CLI):
1. `supabase/migrations/20260731000000_create_email_log.sql`
2. `supabase/migrations/20260801000000_create_email_preferences.sql`

All three tables have RLS enabled with **no public policies** — access is server-side via `SUPABASE_SECRET_KEY` only.

## Environment Variables

| Var | Status | Used for |
|---|---|---|
| `RESEND_API_KEY` | already set | All sends + audience suppression sync |
| `RESEND_WEBHOOK_SECRET` | **new — required for Phase 2** | Svix signature verification (`whsec_…` from the Resend dashboard) |
| `SUPABASE_SECRET_KEY` | already set | `email_log` / `email_preferences` reads + writes |
| `NEXT_PUBLIC_SITE_URL` | already set (falls back to `https://www.lavacagc.com`) | Unsubscribe / preference-center URLs in headers and footers |

## Deployment Checklist

- [ ] Apply both migrations
- [ ] Set `RESEND_WEBHOOK_SECRET` in Vercel
- [ ] In the Resend dashboard → Webhooks, add `https://www.lavacagc.com/api/webhooks/resend` (all `email.*` events) and copy its signing secret
- [ ] Verify Phase 1 end-to-end: `scripts/verify-email-log.ts` sends one real tracked email to the owner's inbox and prints the audit row (run command in the file header; needs `.env.local` with `RESEND_API_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`)
- [ ] Before any Resend broadcast, run the suppression sync for the target audience (admin Subscriptions tab, or `POST /api/admin/broadcasts/sync-suppression`)
