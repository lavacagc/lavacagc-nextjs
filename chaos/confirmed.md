# Confirmed findings (observed, not inferred)

Mode: local app / **production database and production site**. Every probe below was
read-only or side-effect-free; nothing was written, sent, or deleted.

---

## S1-01 - Anyone on the internet can send marketing email from your domain

**Observed.** `POST https://www.lavacagc.com/api/leads/webhook` with `{}` returns
`{"error":"Name and email required"}` HTTP 400 - proving the route is public,
unauthenticated, and processing anonymous input.

- `src/middleware.ts:94` lists `/api/leads/webhook` in `PUBLIC_ROUTES`.
- `src/app/api/leads/webhook/route.ts:14-16` passes the raw body straight to
  `createLeadFollowUpSequence`.
- `src/lib/notify/leadFollowUp.ts:112-205` enqueues a multi-message nurture drip
  (`instant_ack` now, `24h`, `48h`, ...) into `follow_up_queue` with `status:'pending'`.
- `/api/cron/send-follow-ups` (daily 09:00, `vercel.json`) then sends them via Resend.

**Impact.** One POST naming any victim address enqueues several La Vaca-branded emails to
that address. No auth, no reCAPTCHA, no rate limit. The only brake is a per-address dedupe
(`leadFollowUp.ts:138-151`), which stops repeats to the *same* address and does nothing to
stop unlimited *different* ones. Consequences: unsolicited mail from your verified sending
domain, Resend quota burned, and - the reason this is S1 rather than S2 - domain
reputation damage degrades deliverability for **all** mail, including the transactional
receipts and proposal links customers depend on.

**Not tested:** actual sending. Proving it further would mean emailing a real address.

---

## S2-01 - Unauthenticated writes into the referrals table

**Source-confirmed.** `/api/referrals` is public (`src/middleware.ts:99`), performs a
direct `.insert()` (`src/app/api/referrals/route.ts:67`), and has **no** reCAPTCHA
verification and **no** `checkRateLimit` call anywhere in the file.

**Impact.** Anyone can write unbounded rows into a production table, and each row is a
record the owner is expected to act on. Storage is the least of it: the referral pipeline
becomes untrustworthy once it can be stuffed.

---

## S2-02 - The rate limiter fails open, three ways

**Source-confirmed**, `src/lib/rateLimit.ts`:

- `:136` no `SUPABASE_SECRET_KEY` or URL -> `return { allowed: true } // fail open`
- `:151` any PostgREST query error -> `allowed: true`
- `:194` any thrown exception -> `allowed: true`

**Impact.** Every endpoint whose only protection is a rate limit silently becomes
unprotected exactly when the database is unhealthy. Worse, it is a feedback loop: a flood
slows the database, the limiter's own query starts erroring, the limiter opens, and the
flood is admitted at full rate. Failing open is a defensible *availability* choice, but it
must be a deliberate one with an alarm on it, not a silent one.

---

## S3-01 - Public endpoint discloses your secret inventory

**Observed.** `GET https://www.lavacagc.com/api/health/forms` returns **HTTP 200** to an
anonymous browser with a full map of which environment variables are configured, their
internal names and their roles, plus `missingOptional` naming what is absent.

- `src/app/api/health/forms/route.ts:15-21`: the guard is `if (diagKey) { ... }` - when
  `DIAGNOSTICS_KEY` is unset the check is skipped entirely and the endpoint is fully
  public. It is unset in production (proven by the 200 above) and in `.env.local`.

**Impact.** No secret *values* leak, so this is not a credential breach. What leaks is a
reconnaissance map: which protections exist, which are missing, and the exact internal env
var names. It tells an attacker where to push before they push.

---

## Systemic note on severity

Every table in this database is currently small (largest: `seo_metrics` at ~12k rows;
`leads`, `email_log`, `follow_up_queue` are in the hundreds). Load testing at this size
proves nothing, so no synthetic load was generated. The scale risks recorded elsewhere in
this report are therefore **latent** - correct today, dangerous after launch - and are
severity-rated on that basis rather than on today's row counts.
