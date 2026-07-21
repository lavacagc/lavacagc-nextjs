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

The webhook receives Resend delivery events (signed with Svix; the signature **is** the auth — unsigned requests are rejected 400), matches them to `email_log` rows by `resend_message_id`, and backfills `delivered_at`, `first_opened_at`/`open_count`, `first_clicked_at`/`click_count`, `bounced_at`, `complained_at`, and `last_event_at`. Status only advances forward (an out-of-order `sent` event can't clobber `opened`); negative terminal states (`bounced`/`complained`/`failed`) are sticky. Events with no matching `email_log` row get a 404 while the event is less than 24 h old (so Svix retries — a fresh event may have raced `sendTrackedEmail`'s post-send insert) and are acked after that cutoff (deliberately unlogged sends, e.g. `log: false`). A **permanent** bounce or spam complaint also **auto-suppresses** the address: every marketing stream is turned off, audited as a `webhook` actor change. Transient/undetermined bounces (e.g. mailbox full) update the log but never suppress. The webhook also handles **contact events** (`contact.updated` / `contact.deleted`): a Resend-side / Gmail-native unsubscribe on a broadcast flows back into our DB and auto-suppresses the marketing streams the same way, so `email_preferences` stays the source of truth (two-way sync). Only marketing streams are suppressed — the transactional `follow_ups` opt-out is never touched by a contact event. Contact-event field shapes are logged on every such event so the assumed payload can be validated against live traffic.

### Phase 3: Email preference center

**Files:**
- `src/lib/preferences/streams.ts` — client-safe stream definitions (`STREAMS`, `StreamKey`, `normalizeEmail`; no Node imports, so `'use client'` components can import it without pulling server code into the browser bundle)
- `src/lib/preferences/preferences.ts` — token helpers, `applyUpdate` audit + legacy sync; re-exports everything in `streams.ts` for server callers
- `supabase/migrations/20260801000000_create_email_preferences.sql` — `public.email_preferences` + `public.preference_events`
- `src/app/preferences/page.tsx` + `PreferencesClient.tsx` — public self-serve page at `/preferences?token=…`
- `src/app/unsub/page.tsx` + `UnsubClient.tsx` — public **tokenless** unsubscribe page at `/unsub` (aliased from `/unsubscribe`); pre-fills from `?email=`
- `src/app/api/preferences/route.ts` — `GET/POST /api/preferences` (token-authenticated)
- `src/app/api/preferences/unsubscribe/route.ts` — footer links + RFC 8058 one-click (List-Unsubscribe) target
- `src/app/api/preferences/unsubscribe-by-email/route.ts` — `POST /api/preferences/unsubscribe-by-email`, the tokenless by-email backend for `/unsub`
- `src/app/api/admin/preferences/route.ts` — admin view/toggle, bulk list, CSV export
- `src/app/vaca-mgmt/preferences/page.tsx` — admin **Subscriptions** tab
- `src/lib/notify/resendAudience.ts` + `src/app/api/admin/broadcasts/sync-suppression/route.ts` — broadcast suppression sync

One row per (lowercased) email governs four **marketing streams** — `home_care`, `buy_remodel`, `announcements`, `newsletter` (labels in `STREAMS`) — plus one **transactional suppression flag**, `follow_ups`, covering lead follow-ups + review-request emails. The first three default **on** and are switched off only on opt-out; `newsletter` is an **affirmative-consent** stream that defaults **off** and flips **on** only on explicit signup (the exit-intent capture → `POST /api/newsletter/subscribe`). The full set of persisted suppression flags is `SUPPRESSION_KEYS` (`STREAM_KEYS` + `TRANSACTIONAL_KEYS`); the marketing cascade (`/unsub`, one-click, broadcasts) iterates `STREAM_KEYS` only, deliberately never flipping `follow_ups`. Lead follow-ups and review requests are commercial in purpose, so CAN-SPAM requires a working opt-out (their footer carries an unsubscribe link + a one-click `List-Unsubscribe` header), but they are treated as transactional in policy: a general marketing unsubscribe does not silence them, and opting out of them does not touch any marketing stream (owner decision 2026-07). Purely transactional mail (verification, estimates, internal notifications) is still not represented and always sends. Authentication for the self-serve page is the `preference_token`, a capability — same trust model as the existing unsubscribe links. The page fails safe: a footer-link unsubscribe arrives as an in-page confirm prompt (nothing changes until the recipient confirms), a failed save reverts the toggle and shows an error-styled message, and a 429/5xx on load shows a retryable "Try again" state instead of the invalid-link screen.

**Tokenless fallback (`/unsub`).** The self-serve preference center requires a signed token, so a recipient who reaches an unsubscribe URL without one — a short link, a mistyped address, a link that never carried a token — would otherwise hit a dead end. `/unsub` (and the `/unsubscribe` alias, a non-permanent redirect that preserves the query string) always lets a recipient opt out by entering their email, satisfying the CAN-SPAM requirement that the mechanism actually works. Submitting turns **every** marketing stream off for that email (via `getOrCreateByEmail` + `applyUpdate`), which cascades to the legacy `homeowners` / `newsletter_subscribers` status the same way any other opt-out does. In **follow-ups mode** (`/unsub?stream=follow_ups`, the link baked into lead follow-up / review-request emails) it instead turns off only the transactional `follow_ups` flag and leaves every marketing stream on — the page renders follow-ups-specific copy making clear other emails are unaffected. The by-email endpoint always answers `200 { ok: true }` for any syntactically valid email so it can't be used to probe whether an address is subscribed, and is rate-limited per IP (20/min) to blunt row-creation abuse.

How each stream is enforced:
- **home_care** — the newsletter sender passes `preferenceStream: 'home_care'` to `sendTrackedEmail`, which skips suppressed recipients (logged as `skipped`/`unsubscribed` so the admin sees the intentional non-send) and attaches per-recipient `List-Unsubscribe` + one-click headers. Stream-governed sends are strictly single-recipient — a multi-recipient send with a `preferenceStream` is rejected and logged as `error` (suppression and the unsubscribe token are per-recipient). The newsletter footer also carries a "Manage email preferences" link.
- **buy_remodel** — kept in sync with the legacy `newsletter_subscribers.status` column, which the Buy+Remodel flows already treat as the source of truth (active-subscriber checks). The subscribe-flow emails (verification, welcome) are transactional and always send.
- **announcements** — enforced two ways. The monthly newsletter cron enumerates the identity-table marketing members (Home Care / Buy+Remodel `active` rows) and sends to them single-recipient through `sendTrackedEmail` with `preferenceStream: 'announcements'` (skips opt-outs, attaches the `List-Unsubscribe` header). Resend *broadcasts* send to an audience outside the wrapper, so opt-outs are mirrored onto the audience's `unsubscribed` contact flag — either on demand via `POST /api/admin/broadcasts/sync-suppression { audienceId }` or automatically by the daily `GET /api/cron/resend-sync` cron. Both call `syncAudienceSuppression`, which is **suppress-only by design (CAN-SPAM safety)**: it only ever adds `unsubscribed:true` and never clears it, so a periodic sweep can never resurrect a Resend-side / Gmail-native opt-out; re-subscription is explicit-operator-only in the Resend dashboard. When a fresh opt-in activates (Home Care / Buy+Remodel verification), `addOrUpdateResendContact` adds them to the broadcast audience, mirroring their current `announcements` state so a new opt-in can't resurrect a prior announcements opt-out.
- **newsletter** — an **affirmative-consent** stream (defaults off, on only on explicit signup via `POST /api/newsletter/subscribe`, which records the consent as a `preference_events` row). The monthly newsletter cron unions in every `email_preferences.newsletter=true` subscriber and sends to them single-recipient through `sendTrackedEmail` with `preferenceStream: 'newsletter'` (skips opt-outs, attaches the per-recipient `List-Unsubscribe` header with `stream=newsletter`). Explicit newsletter consent **wins** over the legacy `announcements` gate: a contact who is both an identity-table member and a newsletter signup is gated on `newsletter`, so their send, footer link, and one-click header all agree. It has no legacy identity table, so `syncLegacyStatus` ignores it.
- **follow_ups** (transactional) — lead follow-ups and review requests pass `preferenceStream: 'follow_ups'`; a recipient who opted out is skipped (logged as `skipped`/`unsubscribed`). The `send-follow-ups` cron additionally **cancels** every remaining pending queue item for that address on opt-out, so an unsubscribe stops the whole remaining sequence, not just the current send. Its opt-out is reached only via the follow-ups-mode unsubscribe link / one-click header on those emails — never the marketing cascade. Lead follow-ups 2 (+24 h) & 3 (+48 h) also embed a **Home Care promo** (a "join Home Care" pitch wrapped in the `HC_PROMO_START`/`HC_PROMO_END` markers from `emailTemplates.ts`, with `lead_followup` UTM tags on the `/home-care` CTA); the cron strips just that block at send time — decided live via `isActiveHomeCareSubscriber()` because the body was frozen into `follow_up_queue` 24–48 h earlier — for recipients who are already active Home Care subscribers, and **fails open** (promo kept on any lookup error).

Every stream change is audited in `preference_events` (old/new value, actor `self | admin | webhook | system`, actor detail, IP). Changes also sync the legacy status columns (`homeowners.status`, `newsletter_subscribers.status`) both ways: the old single-purpose unsubscribe links (`/api/home-care/unsubscribe`, `/api/buy-and-remodel/unsubscribe`) now write through to `email_preferences` too. Re-enabling a stream only promotes `unsubscribed` legacy rows back to `active` — `pending` rows stay pending until they complete double opt-in verification.

---

## API Routes

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/webhooks/resend` | Svix signature (`RESEND_WEBHOOK_SECRET`) | Delivery events → `email_log` backfill + permanent-bounce/complaint auto-suppress; `contact.updated`/`contact.deleted` → mirror a Resend-side unsubscribe back into `email_preferences` (marketing streams only) |
| `GET/POST /api/preferences` | `preference_token` | Self-serve page: read / update streams |
| `GET/POST /api/preferences/unsubscribe` | `preference_token` | Footer links (GET — mutates nothing, redirects to the preference center with a confirm prompt) + RFC 8058 one-click (POST). `stream=follow_ups` targets only the transactional follow-ups opt-out (GET redirects to `/unsub` follow-ups mode); any marketing link unsubscribes all marketing |
| `POST /api/preferences/unsubscribe-by-email` | none (by email) | Tokenless `/unsub` backend: turns off all marketing streams for the given email (or only `follow_ups` when `{ stream: 'follow_ups' }`); always 200 `{ ok: true }` for a valid email (no subscription probing) |
| `POST /api/newsletter/subscribe` | none (rate-limited, self-guarded) | Monthly-newsletter signup (exit-intent capture backend). Records affirmative consent by flipping the `newsletter` stream on via `applyUpdate` (audited `preference_events` row); seeds a net-new contact's other marketing streams off. Mirrors the contact into the Resend audience honoring its `announcements` state. Always 200 `{ ok: true }` for a valid email (no subscription probing) |
| `GET /api/cron/resend-sync` | Bearer `CRON_SECRET` | Daily suppress-only mirror of `announcements` opt-outs onto the Resend broadcast audience (`RESEND_AUDIENCE_ID`) |
| `GET /api/cron/monthly-newsletter` | Bearer `CRON_SECRET` | Navy/gold newsletter to two unioned audiences, each sent single-recipient through its own gate: identity-table marketing members (Home Care + Buy+Remodel `active` rows) gated on `announcements`, plus affirmative-consent subscribers (`email_preferences.newsletter=true`) gated on `newsletter`. Explicit newsletter consent wins for anyone in both. Per-issue dedup for safe re-runs; `?dryRun=1` counts recipients only. **Deliberately left unscheduled** (not in `vercel.json`) — manual trigger only until the owner confirms the first send |
| `GET /api/admin/emails` | admin middleware | Email log list (filter by `category`, `status`, `q`, `limit`) |
| `GET /api/admin/emails/[id]` | admin middleware | Single email incl. full rendered body |
| `GET/POST /api/admin/preferences` | admin middleware | Contact lookup + audit trail, admin toggles, bulk list (`?all=1`, optional `stream`/`state`; JSON responses carry a `truncated` flag when the `limit` was hit), CSV export (`&format=csv` — paginates to completion, never truncates) |
| `POST /api/admin/broadcasts/sync-suppression` | admin middleware | Mirror `announcements` opt-outs onto a Resend audience |

`/api/webhooks/resend`, `/api/preferences`, and `/api/newsletter/` are declared in `PUBLIC_ROUTES` in `src/middleware.ts`.

The public preference endpoints are rate-limited per IP via the existing `rate_limits` table (`src/lib/rateLimit.ts`): `GET /api/preferences` 30/min, `POST /api/preferences` 15/min, unsubscribe `GET` 30/min, one-click `POST` 60/min, tokenless unsubscribe-by-email `POST` 20/min, newsletter subscribe `POST` 10/hour. Over the limit, the JSON endpoints return 429 with a `Retry-After` header; the unsubscribe `GET` instead skips the DB lookup and still redirects to the preference center (the page validates the token itself), so a scanner burst from a shared gateway IP can't break a real click.

## Admin UI

Both live under the existing `/vaca-mgmt` admin (sidebar tabs):
- **Email Tracking** — every sent email, newest first, with status badges (sent → delivered → opened → clicked; bounced/complained/failed; error = rejected before/while sending, e.g. a misconfigured stream-governed send; skipped = intentional suppression), category/status filters and search; per-row detail view renders the exact HTML that was sent.
- **Subscriptions** — look up any contact's streams + change history, toggle streams as admin (audited), bulk list with per-stream on/off filters (flagged when it shows only the most recent records), CSV export, and the broadcast suppression sync button.

## Database

Apply these migrations (Supabase dashboard SQL editor or CLI):
1. `supabase/migrations/20260731000000_create_email_log.sql`
2. `supabase/migrations/20260801000000_create_email_preferences.sql`
3. `supabase/migrations/20260805000000_email_prefs_follow_ups.sql` — adds the transactional `follow_ups` boolean column (default `TRUE`) to `email_preferences`
4. `supabase/migrations/20260810000000_email_prefs_newsletter.sql` — adds the affirmative-consent `newsletter` boolean column (default `FALSE`) to `email_preferences`, plus a partial index on `newsletter = true` for the monthly-newsletter recipient query

All three tables have RLS enabled with **no public policies** — access is server-side via `SUPABASE_SECRET_KEY` only.

## Environment Variables

| Var | Status | Used for |
|---|---|---|
| `RESEND_API_KEY` | already set | All sends + audience suppression sync |
| `RESEND_WEBHOOK_SECRET` | **new — required for Phase 2** | Svix signature verification (`whsec_…` from the Resend dashboard) |
| `RESEND_AUDIENCE_ID` | **new — required for the audience sync / `resend-sync` cron + broadcast opt-in upsert** | Resend broadcast audience id (the `announcements` list); without it the sync + `addOrUpdateResendContact` silently skip |
| `CRON_SECRET` | already set | Bearer auth for `/api/cron/resend-sync` + `/api/cron/monthly-newsletter` (and all `/api/cron/*`) |
| `SUPABASE_SECRET_KEY` | already set | `email_log` / `email_preferences` reads + writes |
| `NEXT_PUBLIC_SITE_URL` | already set (falls back to `https://www.lavacagc.com`) | Unsubscribe / preference-center URLs in headers and footers |

## Deployment Checklist

- [ ] Apply the migrations above (including `20260805000000_email_prefs_follow_ups.sql` and `20260810000000_email_prefs_newsletter.sql`)
- [ ] Set `RESEND_WEBHOOK_SECRET` in Vercel
- [ ] Set `RESEND_AUDIENCE_ID` in Vercel (the broadcast audience id) so the `resend-sync` cron + opt-in contact upsert can run
- [ ] In the Resend dashboard → Webhooks, add `https://www.lavacagc.com/api/webhooks/resend` and subscribe to both the `email.*` events and the `contact.*` events (contact events drive the two-way unsubscribe sync); copy its signing secret
- [ ] Verify Phase 1 end-to-end: `scripts/verify-email-log.ts` sends one real tracked email to the owner's inbox and prints the audit row (run command in the file header; needs `.env.local` with `RESEND_API_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`)
- [ ] Verify suppression invariants end-to-end against a running server: `BASE_URL=http://localhost:3000 node scripts/validate-suppression.mjs` (asserts a follow-ups opt-out leaves marketing on, a marketing opt-out leaves follow-ups on, and the one-click header targets only `follow_ups`)
- [ ] Before any Resend broadcast, run the suppression sync for the target audience (admin Subscriptions tab, or `POST /api/admin/broadcasts/sync-suppression`); the daily `resend-sync` cron keeps it current between broadcasts
