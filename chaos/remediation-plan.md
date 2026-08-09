# Chaos Monkey - remediation plan

Generated from `chaos/findings.json`. Every finding below was **observed**, not inferred:
either reproduced against the running production site with a side-effect-free probe, read
directly out of the production database, or confirmed by reading the exact lines of source
named in each entry. Hypotheses that could not be confirmed are in the *Unverified* section
at the end rather than padded into the count.

## Executive summary

One endpoint lets anyone on the internet send La Vaca-branded email to any address they
choose, which risks the sending-domain reputation that every customer email depends on - fix
that today, it is a ten-minute change. Below it sit nine S2 issues that share three root
causes: the server trusts input the browser already validated, protections fail *open* when
their own dependency is missing, and reads have no explicit ceiling so truncation is
invisible. Nothing here is on fire at today's data volumes - the largest table is about
twelve thousand rows - but four of these become outages or silent data loss at launch
volume, which is precisely when nobody has time to debug them.

## Risk table

Sorted by severity, then by ascending effort - so the cheap high-severity work is at the top.

| # | Sev | Effort | Finding | Surface |
|---|-----|--------|---------|---------|
| CM-01 | **S1** | S | Unauthenticated endpoint sends marketing email from your domain to any address | `POST /api/leads/webhook` |
| CM-02 | **S2** | S | A raw POST can forge its own lead score and page you as a HOT lead | `POST /api/leads/submit` |
| CM-03 | **S2** | S | Rejected submissions alert you - so the rate limit buys an attacker 10 messages a minute | `POST /api/leads/submit` |
| CM-04 | **S2** | S | Server-side database role has no statement timeout - one bad query can hold a connection for two minutes | `database role configuration` |
| CM-07 | **S2** | S | Member release email silently drops everyone past the thousandth recipient | `POST /api/admin/releases/send` |
| CM-05 | **S2** | M | Capability tokens and customer PII are recorded by third-party analytics | `/crew/confirm/[token], /intake/[token], /proposal/[token], /preferences?token=` |
| CM-06 | **S2** | M | Rate limiter fails open, so every limit disappears exactly when the database is struggling | `src/lib/rateLimit.ts` |
| CM-08 | **S2** | M | Referral form endpoint is completely ungated | `POST /api/referrals` |
| CM-09 | **S2** | M | Server accepts data every browser form rejects, including unvalidated email | `POST /api/leads/submit` |
| CM-10 | **S2** | M | Customer intake photos are stored in a world-readable bucket | `storage bucket intake-photos` |
| CM-11 | **S3** | S | Public endpoint discloses which secrets are configured | `GET /api/health/forms` |
| CM-12 | **S3** | S | Every lead sends you two owner emails and assesses the same captcha token twice | `ContactForm, EstimateForm, HomeEstimateForm` |
| CM-13 | **S3** | S | An oversized number in a submission destroys the lead with a 500 | `POST /api/leads/submit` |
| CM-14 | **S3** | L | Reads that grow with the business have no row cap | `~45 call sites; see chaos/recon-queries.md` |

## Fix order, grouped by shared root cause

Grouped deliberately: fixing a class in one pass is cheaper and safer than fixing five
instances of it on five different days.

**1. Close the open doors (do this first - CM-01 today).**
`CM-01` remove `/api/leads/webhook` from the public list and require the internal secret.
`CM-08` give `/api/referrals` the body cap, honeypot, rate limit and captcha that
`/api/home-care/subscribe` already has. `CM-11` make the diagnostics guard fail closed.
These are three small, independent edits against the same class: *public surface with no gate*.

**2. Stop trusting the browser.**
`CM-02` strip server-owned columns (`score`, `tier`, `scoring_reasons`) before the sanitizer
and always score server-side. `CM-09` bring server validation up to the strictest client rule,
starting with email format. `CM-13` clamp integers to their column range so an absurd number
cannot destroy a lead. All three live in `/api/leads/submit` and its sanitizer - one pass,
one review, one set of tests.

**3. Make protections fail loudly instead of silently.**
`CM-06` the rate limiter should stay fail-open for genuine outages but must say so, and must
fail *closed* on the paths that spend money. `CM-03` stop alerting on rejections the caller
caused, so the rate limit cannot be turned into a megaphone.

**4. Make ceilings explicit.**
`CM-04` give `service_role` a statement timeout - the single highest-leverage line in this
document, because it bounds the damage of bugs nobody has found yet. `CM-07` fix the
truncation counter that can never fire. `CM-14` work the uncapped-read backlog, growing tables
first, with the static check holding the line behind you.

**5. Stop leaking to third parties.**
`CM-05` one shared exclusion predicate for analytics, covering every token-authenticated route.
`CM-10` make the intake photo bucket private while it is still empty - the cheapest this fix
will ever be. `CM-12` delete the duplicate browser-side owner notification.

## The single most important thing

**CM-01.** Not because it is the most sophisticated - it is the least - but because it is
live, trivially exploitable by anyone who reads the route list, and its damage is not
recoverable by a later fix. Rate limits can be added after abuse; a sending domain that has
been used to mail strangers keeps that reputation for months, and the cost lands on every
proposal link and receipt you send afterwards.

## Full findings

### CM-01 - Unauthenticated endpoint sends marketing email from your domain to any address

**Severity** S1 &nbsp;|&nbsp; **Effort** S &nbsp;|&nbsp; **Surface** `POST /api/leads/webhook`

**What happens.** No auth, no rate limit, no captcha, no schema. Only brake is a per-address dedupe that does nothing across distinct addresses.

**Why it matters.** Anyone can send La Vaca-branded email to arbitrary recipients. Burns Resend quota, and sustained abuse degrades sending-domain reputation - which silently breaks deliverability for ALL mail including proposal links and receipts.

**Evidence.**

- `curl -X POST https://www.lavacagc.com/api/leads/webhook -H 'Content-Type: application/json' -d '{}'`
- `Observed: HTTP 400 {"error":"Name and email required"} - proving the route is public, unauthenticated and processing anonymous input`
- `A body of {"name":"x","email":"victim@example.com"} would enqueue instant_ack + 24h + 48h + 7d messages`

**Root cause.** '/api/leads/webhook' is listed in PUBLIC_ROUTES (src/middleware.ts:94) and the route hands the raw body straight to createLeadFollowUpSequence (src/app/api/leads/webhook/route.ts:15) with no validation or throttle.

**Fix.** This route exists only for internal callers, and its own docblock says internal callers should import the function directly. Remove it from PUBLIC_ROUTES and require INTERNAL_WEBHOOK_SECRET like /api/notify/*. If an external caller genuinely needs it, keep the secret and add a per-email rate limit.

```ts
// middleware.ts - delete '/api/leads/webhook' from PUBLIC_ROUTES
// add to the internal-secret carve-out used by /api/notify/*
if (pathname.startsWith('/api/leads/webhook') && !verifyInternalSecret(request)) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

**Risk of the fix.** Low. Grep shows no first-party caller: the lead route imports createLeadFollowUpSequence directly.

**Acceptance criteria** - every one machine-checkable, and each set carries a negative
(the bad thing is blocked) plus a positive (legitimate use still works):

- **negative** - An anonymous POST to /api/leads/webhook is refused with 401 and enqueues nothing
  - `test`: `tests/chaos/regressions/webhook-auth.spec.ts` -> expect `401`
- **positive** - A POST carrying x-internal-secret still creates the follow-up sequence
  - `test`: `tests/chaos/regressions/webhook-auth.spec.ts` -> expect `200`
- **systemic** - No route that sends email or Telegram is reachable without auth, a captcha or a rate limit
  - `test`: `tests/chaos/regressions/spend-paths.spec.ts` -> expect `every outbound-capable public route is gated`
- **negative** - follow_up_queue gains no row from the anonymous attempt
  - `sql`: `select count(*) from follow_up_queue where lead_email = 'chaos-probe@example.invalid'` -> expect `0`

**Graduates to** `tests/chaos/regressions/webhook-auth.spec.ts` tagged @isolation @smoke

---

### CM-02 - A raw POST can forge its own lead score and page you as a HOT lead

**Severity** S2 &nbsp;|&nbsp; **Effort** S &nbsp;|&nbsp; **Surface** `POST /api/leads/submit`

**What happens.** A body containing {"score":100,"tier":"hot"} is stored verbatim and short-circuits scoring; the Telegram alert then renders 'New HOT Lead' / 'Score: 100/100'

**Why it matters.** The prioritisation signal the owner acts on can be forged by anyone. Also poisons every downstream report that groups by tier, and there is no range check - negative or absurd scores store fine.

**Evidence.**

- `LeadSubmitSchema ends in .passthrough() (src/app/api/leads/submit/route.ts:100), so unknown keys survive`
- `sanitizeLeadForInsert accepts 'tier' (leadSanitize.ts:72), 'score' (:86) and 'scoring_reasons' (:88) as writable columns`
- `route.ts:445 'if (!finalLeadData.score)' skips scoreLead entirely when the caller supplied one`

**Root cause.** Trust boundary: .passthrough() lets caller-controlled keys reach the sanitizer, and the scoring step treats a caller-supplied score as authoritative.

**Fix.** Strip server-owned columns from the request before sanitising, and always score server-side. Do not rely on the schema alone - the sanitizer is the chokepoint.

```ts
const SERVER_OWNED = ['score','tier','scoring_reasons'] as const;
for (const k of SERVER_OWNED) delete (leadFields as Record<string, unknown>)[k];
// then score unconditionally
const scoringResult = scoreLead(prepareLeadForScoring(leadFields));
```

**Risk of the fix.** Low. No form sends these fields today.

**Acceptance criteria** - every one machine-checkable, and each set carries a negative
(the bad thing is blocked) plus a positive (legitimate use still works):

- **negative** - A submit carrying score:100/tier:hot stores the server-computed score, not 100
  - `test`: `tests/chaos/regressions/lead-score-integrity.spec.ts` -> expect `stored score != 100`
- **positive** - A normal submission still gets a computed score and tier
  - `test`: `tests/chaos/regressions/lead-score-integrity.spec.ts` -> expect `score is a number 0-100 and tier in hot|warm|cold`
- **systemic** - No server-owned column is writable through the public submit path
  - `test`: `tests/chaos/regressions/lead-score-integrity.spec.ts` -> expect `every SERVER_OWNED key is stripped before sanitise`

**Graduates to** `tests/chaos/regressions/lead-score-integrity.spec.ts` tagged @isolation

---

### CM-03 - Rejected submissions alert you - so the rate limit buys an attacker 10 messages a minute

**Severity** S2 &nbsp;|&nbsp; **Effort** S &nbsp;|&nbsp; **Surface** `POST /api/leads/submit`

**What happens.** 5 deliberately-invalid requests per minute per IP produce ~10 owner notifications per minute per IP

**Why it matters.** An attacker can flood the owner's phone and inbox, and burn Resend quota, at 5 requests a minute - low enough to look like normal traffic. The consent route already solved this exact problem (consent/log/route.ts:48-50 deliberately does not alert on 429/400).

**Evidence.**

- `checkRateLimit runs at route.ts:348, BEFORE the validation checks at :362 (recaptcha) and :375 (contact required)`
- `Each of those failure paths calls reportFailure (:363, :376, :424) which fires 1 Telegram + 1 Resend (formErrorAlert.ts:83,124)`
- `One junk key in an otherwise valid body triggers the sanitize warning alert at :495 - another Telegram + Resend`

**Root cause.** Validation failures are treated as system faults worth alerting on, and the alert sits inside the rate-limited path rather than behind its own budget.

**Fix.** Do not alert on client-fault rejections (400/429). Alert only on server faults (5xx, DB write failures), and put a separate low ceiling on alerting itself.

```ts
// mirror consent/log: skip alerting for client-caused rejections
if (status >= 500) await reportFailure(...);
// and cap alerts independently of the request limit
const alertBudget = await checkRateLimit(`alert:${ip}`, 2, 60*60*1000);
```

**Risk of the fix.** Low, but note the trade-off: genuine misconfiguration that causes mass 400s becomes quieter, so keep a daily digest.

**Acceptance criteria** - every one machine-checkable, and each set carries a negative
(the bad thing is blocked) plus a positive (legitimate use still works):

- **negative** - 20 invalid submissions produce zero owner alerts
  - `test`: `tests/chaos/regressions/alert-amplification.spec.ts` -> expect `0 telegram/resend calls`
- **positive** - A genuine server-side failure still alerts once
  - `test`: `tests/chaos/regressions/alert-amplification.spec.ts` -> expect `exactly 1 alert`
- **systemic** - No public route fires an owner alert on a 4xx it generated itself
  - `test`: `tests/chaos/regressions/alert-amplification.spec.ts` -> expect `no alert on any 4xx path`

**Graduates to** `tests/chaos/regressions/alert-amplification.spec.ts` tagged @isolation

---

### CM-04 - Server-side database role has no statement timeout - one bad query can hold a connection for two minutes

**Severity** S2 &nbsp;|&nbsp; **Effort** S &nbsp;|&nbsp; **Surface** `database role configuration`

**What happens.** anon = 3s, authenticated = 8s, service_role = (none) -> falls back to the database default of 120s

**Why it matters.** Every server-side query in this app runs as service_role (SUPABASE_SECRET_KEY). A single pathological query holds a pooled connection for two minutes; a handful exhausts the pool and takes the whole site down. This is the limit that protects the database from bugs nobody predicted, and it is the one that is missing.

**Evidence.**

- `select rolname, rolconfig from pg_roles where rolname in ('anon','authenticated','service_role')`

**Root cause.** service_role was never given a rolconfig statement_timeout, so it inherits the 120s database default.

**Fix.** Set a statement timeout on service_role. 15s is generous for every query this app legitimately makes (the slowest measured route is far below it) while bounding the damage of a runaway one.

```ts
ALTER ROLE service_role SET statement_timeout = '15s';
-- long-running maintenance jobs that genuinely need more should raise it
-- per-transaction: SET LOCAL statement_timeout = '60s';
```

**Risk of the fix.** Medium - a cron doing a genuinely long job would now be cut off. Audit the crons first; raise per-transaction where needed.

**Acceptance criteria** - every one machine-checkable, and each set carries a negative
(the bad thing is blocked) plus a positive (legitimate use still works):

- **negative** - service_role can no longer run a query longer than the timeout
  - `sql`: `select rolconfig from pg_roles where rolname='service_role'` -> expect `contains statement_timeout=15s`
- **positive** - Every cron route still completes inside the timeout
  - `test`: `tests/chaos/regressions/cron-budget.spec.ts` -> expect `all cron handlers complete`
- **systemic** - No role is left without a statement timeout
  - `sql`: `select rolname from pg_roles where rolname in ('anon','authenticated','service_role','authenticator') and (rolconfig is null or not (array_to_string(rolconfig,',') like '%statement_timeout%'))` -> expect `0 rows`

**Graduates to** `tests/chaos/regressions/cron-budget.spec.ts` tagged @budget

---

### CM-07 - Member release email silently drops everyone past the thousandth recipient

**Severity** S2 &nbsp;|&nbsp; **Effort** S &nbsp;|&nbsp; **Surface** `POST /api/admin/releases/send`

**What happens.** PostgREST applies its own default row ceiling to an uncapped request, so homeowners.length can never exceed the cap the code slices at. truncated is therefore structurally always 0.

**Why it matters.** Past the ceiling, members silently never receive the release and the UI reports zero truncation. Latent today (4 active members) and certain at scale. The guard the author wrote cannot fire.

**Evidence.**

- `releases/send/route.ts:158-160 reads homeowners?status=eq.active with NO limit= clause`
- `RECIPIENT_CAP = 1000 (:40); recipients = homeowners.slice(0, 1000) (:162)`
- `truncated = homeowners.length - recipients.length (:163)`

**Root cause.** The row cap is implicit (PostgREST's default) rather than explicit, so the code cannot distinguish 'exactly 1000' from 'at least 1000'.

**Fix.** Ask for one more row than the cap so truncation is detectable, or read an exact count. Then either mail in batches or report honestly.

```ts
const rows = await supabaseRest<HomeownerRow[]>('GET',
  `homeowners?select=...&status=eq.active&limit=${RECIPIENT_CAP + 1}`);
const truncated = Math.max(0, rows.length - RECIPIENT_CAP);
const recipients = rows.slice(0, RECIPIENT_CAP);
```

**Risk of the fix.** Low.

**Acceptance criteria** - every one machine-checkable, and each set carries a negative
(the bad thing is blocked) plus a positive (legitimate use still works):

- **negative** - With more active members than the cap, truncated is greater than zero
  - `test`: `tests/chaos/regressions/release-truncation.spec.ts` -> expect `truncated > 0`
- **positive** - With fewer members than the cap, all are mailed and truncated is 0
  - `test`: `tests/chaos/regressions/release-truncation.spec.ts` -> expect `truncated == 0`
- **systemic** - No query relies on the server's implicit row ceiling: every read that feeds a count or a cap sets limit= explicitly
  - `command`: `npm run chaos:lint:uncapped` -> expect `exit 0`

**Graduates to** `tests/chaos/regressions/release-truncation.spec.ts` tagged @budget

---

### CM-05 - Capability tokens and customer PII are recorded by third-party analytics

**Severity** S2 &nbsp;|&nbsp; **Effort** M &nbsp;|&nbsp; **Surface** `/crew/confirm/[token], /intake/[token], /proposal/[token], /preferences?token=`

**What happens.** Clarity replays those pages - including the token in the recorded URL - and Meta Pixel receives the URL

**Why it matters.** The token IS the credential: anyone with access to the Clarity account (or a breach of it) can replay the session and reuse a live token. Customer address and phone are exported to Microsoft and Meta without consent, which is also a privacy-policy and GPC-compliance problem. NOTE: the proposal-page case was previously accepted as a known risk; the crew-confirm page (address + phone) and intake (lead PII) extend beyond what was accepted.

**Evidence.**

- `src/app/layout.tsx:108-128 loads Microsoft Clarity (session recording) and Meta Pixel on EVERY page, gated only on hostname and GPC - no path exclusion`
- `src/components/Analytics.tsx:21 excludes only /admin, /vaca-mgmt and /auth from GA`
- `src/app/crew/confirm/[token]/page.tsx renders the customer's name, phone and address`

**Root cause.** Analytics is mounted globally in the root layout with an exclusion list that predates the token-authenticated surfaces.

**Fix.** Move the exclusion decision into one shared predicate used by BOTH the layout scripts and Analytics.tsx, and add every token-authenticated path to it.

```ts
export const ANALYTICS_EXCLUDED = [/^\/admin/,/^\/vaca-mgmt/,/^\/auth/,/^\/proposal\//,/^\/intake\//,/^\/crew\//,/^\/preferences/];
export const isAnalyticsExcluded = (p: string) => ANALYTICS_EXCLUDED.some(rx => rx.test(p));
// layout: render the Clarity/Pixel <Script> only when !isAnalyticsExcluded(pathname)
```

**Risk of the fix.** Low. Losing analytics on these pages is the intent.

**Acceptance criteria** - every one machine-checkable, and each set carries a negative
(the bad thing is blocked) plus a positive (legitimate use still works):

- **negative** - No Clarity or Meta Pixel request is made from a token-authenticated page
  - `test`: `tests/chaos/regressions/analytics-exclusion.spec.ts` -> expect `zero requests to clarity.ms or facebook.net`
- **positive** - Analytics still loads on ordinary marketing pages
  - `test`: `tests/chaos/regressions/analytics-exclusion.spec.ts` -> expect `clarity script present on /`
- **systemic** - Every route segment carrying a [token] param is in the exclusion list
  - `test`: `tests/chaos/regressions/analytics-exclusion.spec.ts` -> expect `each token route matches isAnalyticsExcluded`

**Graduates to** `tests/chaos/regressions/analytics-exclusion.spec.ts` tagged @isolation @smoke

---

### CM-06 - Rate limiter fails open, so every limit disappears exactly when the database is struggling

**Severity** S2 &nbsp;|&nbsp; **Effort** M &nbsp;|&nbsp; **Surface** `src/lib/rateLimit.ts`

**What happens.** It silently allows, with only a console.error

**Why it matters.** Every endpoint whose sole protection is a rate limit becomes unprotected during a database incident. It is also a feedback loop: load slows the DB, the limiter's own query errors, the limiter opens, and the load is admitted at full rate. Compounds CM-03 (alert flooding) and CM-08 (ungated referrals).

**Evidence.**

- `rateLimit.ts:136 missing key/URL -> {allowed:true}`
- `rateLimit.ts:151 any query error -> {allowed:true}`
- `rateLimit.ts:194 any exception -> {allowed:true}`

**Root cause.** Availability was chosen over protection, silently and without an alarm.

**Fix.** Keep failing open for genuine outages - refusing real customers is worse - but make it loud and bounded: count the failures, alert once per window, and fail CLOSED for the endpoints whose abuse is expensive (anything that sends email or spends money).

```ts
export async function checkRateLimit(bucket, limit, windowMs, options) {
  // ...
  if (error) {
    void noteLimiterDegraded(bucket);           // alert once per window
    return { allowed: options.failClosed !== true, degraded: true };
  }
}
// callers that spend money pass failClosed: true
```

**Risk of the fix.** Medium - failing closed can reject legitimate traffic during an outage, which is why only the spend paths get it.

**Acceptance criteria** - every one machine-checkable, and each set carries a negative
(the bad thing is blocked) plus a positive (legitimate use still works):

- **negative** - With the limiter's backing store erroring, a spend-path request is refused
  - `test`: `tests/chaos/regressions/rate-limit-degraded.spec.ts` -> expect `429`
- **positive** - With the store healthy, traffic under the limit still passes
  - `test`: `tests/chaos/regressions/rate-limit-degraded.spec.ts` -> expect `200`
- **systemic** - Every limiter fail-open path emits a degraded signal
  - `test`: `tests/chaos/regressions/rate-limit-degraded.spec.ts` -> expect `degraded:true on all three branches`

**Graduates to** `tests/chaos/regressions/rate-limit-degraded.spec.ts` tagged @isolation

---

### CM-08 - Referral form endpoint is completely ungated

**Severity** S2 &nbsp;|&nbsp; **Effort** M &nbsp;|&nbsp; **Surface** `POST /api/referrals`

**What happens.** It has none, and no length caps on names or message - the browser's maxLength attributes are the only bound that exists

**Why it matters.** Anyone can write unlimited rows, of unlimited size, into a production table the owner is expected to act on. The referral pipeline becomes untrustworthy and the table becomes a storage cost.

**Evidence.**

- `middleware.ts:99 lists /api/referrals as public`
- `referrals/route.ts contains no checkRateLimit, no reCAPTCHA verification and no honeypot`
- `request.json() at :6 has no body-size cap`
- `the insert at :67 writes straight to the referrals table`

**Root cause.** The route predates the hardening applied to /api/leads/submit and never received it.

**Fix.** Apply the pattern /api/home-care/subscribe already uses: body cap, honeypot, per-IP rate limit, reCAPTCHA, and server-side length caps.

```ts
const body = await readJsonCapped(request, MAX_BODY_BYTES);
if (body.website) return NextResponse.json({ success: true });   // honeypot
const rl = await checkRateLimit(`referrals:${ip}`, 5, 60_000);
if (!rl.allowed) return NextResponse.json({ error: 'Too many' }, { status: 429 });
const parsed = ReferralSchema.parse(body);   // with .max() on every string
```

**Risk of the fix.** Low, but the form must send the honeypot field and surface a 429 politely.

**Acceptance criteria** - every one machine-checkable, and each set carries a negative
(the bad thing is blocked) plus a positive (legitimate use still works):

- **negative** - The 6th referral in a minute from one IP is refused with 429
  - `test`: `tests/chaos/regressions/referrals-gated.spec.ts` -> expect `429`
- **negative** - A 1MB referral body is refused rather than stored
  - `test`: `tests/chaos/regressions/referrals-gated.spec.ts` -> expect `413 or 400`
- **positive** - A normal referral from the form still succeeds
  - `test`: `tests/chaos/regressions/referrals-gated.spec.ts` -> expect `200 and one row`
- **systemic** - Every public write endpoint has a captcha, a rate limit or a honeypot
  - `test`: `tests/chaos/regressions/spend-paths.spec.ts` -> expect `no ungated public write route`

**Graduates to** `tests/chaos/regressions/referrals-gated.spec.ts` tagged @isolation

---

### CM-09 - Server accepts data every browser form rejects, including unvalidated email

**Severity** S2 &nbsp;|&nbsp; **Effort** M &nbsp;|&nbsp; **Surface** `POST /api/leads/submit`

**What happens.** The client is stricter on email format, phone shape, ZIP shape, name charset and length caps

**Why it matters.** A direct POST stores unusable contact data. The email case is the worst: garbage passes the schema, the lead row is created, and then createLeadFollowUpSequence refuses to send (leadFollowUp.ts:122) - so the customer gets no acknowledgement and the only trace is a log line. That is silent lead damage, the failure class this project already has history with.

**Evidence.**

- `email: optStr(320) with NO format check (route.ts:72) while all six forms enforce z.string().email() or a regex`
- `phone optStr(60), zip optStr(20), first/last name optStr(200), city optStr(200) - no server regex against client rules at ContactForm.tsx:44,49,58 and EstimateForm.tsx:52,67,76,80`
- `/api/home-care/subscribe already does it right: z.string().email().max(320)`

**Root cause.** The submit schema was written to be maximally forgiving (optStr truncates rather than rejects) so a lead is never lost, and format checking was never added back at the layer that could reject safely.

**Fix.** Keep the forgiving posture for optional fields, but validate the two that decide whether the lead is contactable at all. Reject an unparseable email outright rather than storing a lead that can never be answered.

```ts
email: z.string().trim().max(320).email().nullish(),
phone: z.string().trim().max(60).regex(PHONE_RE).nullish(),
zip_code: z.string().trim().max(20).regex(/^\d{5}(-\d{4})?$/).nullish(),
```

**Risk of the fix.** Medium - tightening a lead intake path can reject real submissions. Ship behind a log-only mode first: record what WOULD have been rejected for a week before enforcing.

**Acceptance criteria** - every one machine-checkable, and each set carries a negative
(the bad thing is blocked) plus a positive (legitimate use still works):

- **negative** - A submit with email 'not-an-email' is refused and writes no lead row
  - `test`: `tests/chaos/regressions/lead-validation-parity.spec.ts` -> expect `400, 0 rows`
- **positive** - Every payload the six browser forms can legitimately produce is still accepted
  - `test`: `tests/chaos/regressions/lead-validation-parity.spec.ts` -> expect `200 for all form fixtures`
- **systemic** - For each field, the server rule is at least as strict as the strictest client rule
  - `test`: `tests/chaos/regressions/lead-validation-parity.spec.ts` -> expect `no field where client is stricter`

**Graduates to** `tests/chaos/regressions/lead-validation-parity.spec.ts` tagged @isolation

---

### CM-10 - Customer intake photos are stored in a world-readable bucket

**Severity** S2 &nbsp;|&nbsp; **Effort** M &nbsp;|&nbsp; **Surface** `storage bucket intake-photos`

**What happens.** The bucket is public; URLs are permanent and require no authentication once known

**Why it matters.** LATENT TODAY - the bucket currently holds zero objects, so nothing is exposed yet. The moment intake photos are used, every uploaded photo becomes permanently world-readable to anyone who obtains the URL, and CM-05 actively exports URLs to third-party analytics.

**Evidence.**

- `select id, public from storage.buckets -> intake-photos public = true`
- `photo/route.ts:119 uses getPublicUrl, so the stored URL never expires`
- `object path is `${session.id}/${Date.now()}-${name}` - the session UUID makes an individual URL unguessable`

**Root cause.** The bucket was created with public = true and the upload path uses getPublicUrl rather than a signed URL.

**Fix.** Flip the bucket private, add an owner-scoped RLS policy, and serve through createSignedUrl with a short expiry. Do it before the intake photo flow carries real customers.

```ts
update storage.buckets set public = false where id = 'intake-photos';
-- read policy: only the service role, since the app proxies reads
// route: const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
```

**Risk of the fix.** Low while the bucket is empty - this is the cheapest moment to fix it.

**Acceptance criteria** - every one machine-checkable, and each set carries a negative
(the bad thing is blocked) plus a positive (legitimate use still works):

- **negative** - The bucket is not public
  - `sql`: `select public from storage.buckets where id='intake-photos'` -> expect `false`
- **negative** - An unauthenticated GET of a known object path is refused
  - `test`: `tests/chaos/regressions/intake-photo-privacy.spec.ts` -> expect `400 or 403`
- **positive** - The intake session that uploaded a photo can still display it
  - `test`: `tests/chaos/regressions/intake-photo-privacy.spec.ts` -> expect `signed URL resolves 200`
- **systemic** - No bucket holding customer-supplied private content is public
  - `sql`: `select id from storage.buckets where public = true and id in ('intake-photos','calculator-pdfs','compliance-documents')` -> expect `no bucket containing customer PII`

**Graduates to** `tests/chaos/regressions/intake-photo-privacy.spec.ts` tagged @isolation

---

### CM-11 - Public endpoint discloses which secrets are configured

**Severity** S3 &nbsp;|&nbsp; **Effort** S &nbsp;|&nbsp; **Surface** `GET /api/health/forms`

**What happens.** The guard is `if (diagKey) { ... }` (health/forms/route.ts:15-21) - when DIAGNOSTICS_KEY is unset the check is skipped entirely. It is unset in production.

**Why it matters.** No secret values leak, so this is not a credential breach. What leaks is a reconnaissance map: internal env var names, their roles, and which protections are absent - it tells an attacker where to push.

**Evidence.**

- `curl https://www.lavacagc.com/api/health/forms -> HTTP 200 with the full env inventory`

**Root cause.** The guard fails open when its own key is missing.

**Fix.** Fail closed: no key configured means the endpoint is unavailable, not unprotected.

```ts
const diagKey = process.env.DIAGNOSTICS_KEY;
if (!diagKey) return NextResponse.json({ error: 'not available' }, { status: 404 });
if (request.nextUrl.searchParams.get('key') !== diagKey) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
```

**Risk of the fix.** Low. Set DIAGNOSTICS_KEY in Vercel at the same time or the endpoint goes dark.

**Acceptance criteria** - every one machine-checkable, and each set carries a negative
(the bad thing is blocked) plus a positive (legitimate use still works):

- **negative** - With no DIAGNOSTICS_KEY set, the endpoint returns 404 and no env data
  - `test`: `tests/chaos/regressions/health-forms-guard.spec.ts` -> expect `404, body has no 'env' key`
- **positive** - With the key set and supplied, the report still renders
  - `test`: `tests/chaos/regressions/health-forms-guard.spec.ts` -> expect `200 with env`
- **systemic** - No route treats a missing guard secret as permission to proceed
  - `command`: `grep -rn 'if (.*Key) {' src/app/api | grep -v 'return'` -> expect `no fail-open guard remains`

**Graduates to** `tests/chaos/regressions/health-forms-guard.spec.ts` tagged @smoke

---

### CM-12 - Every lead sends you two owner emails and assesses the same captcha token twice

**Severity** S3 &nbsp;|&nbsp; **Effort** S &nbsp;|&nbsp; **Surface** `ContactForm, EstimateForm, HomeEstimateForm`

**What happens.** Two owner emails per lead from those three forms, plus the same reCAPTCHA token submitted for a second assessment

**Why it matters.** Doubles Resend spend on the highest-volume path, doubles inbox noise on the notification the owner actually reads, and wastes reCAPTCHA Enterprise assessments. Live today on every real lead, not latent.

**Evidence.**

- `ContactForm.tsx:276, EstimateForm.tsx:358, HomeEstimateForm.tsx:296 all invoke the send-lead-notification edge function from the browser`
- `src/app/api/leads/submit/route.ts:585 ALSO sends sendNewLeadEmail server-side for the same lead`

**Root cause.** The server-side notification was added later and the browser-side edge-function call was never removed.

**Fix.** Delete the browser-side invoke. The server path is strictly better: it cannot be skipped by a direct caller, and it already handles failures.

```ts
// remove the supabase.functions.invoke('send-lead-notification', ...) block
// the server already notified in /api/leads/submit
```

**Risk of the fix.** Low - verify the server path notifies for every one of the three forms before deleting.

**Acceptance criteria** - every one machine-checkable, and each set carries a negative
(the bad thing is blocked) plus a positive (legitimate use still works):

- **negative** - Submitting the contact form triggers exactly one owner notification
  - `test`: `tests/chaos/regressions/single-owner-alert.spec.ts` -> expect `1 notification`
- **positive** - The owner notification still contains the lead's details
  - `test`: `tests/chaos/regressions/single-owner-alert.spec.ts` -> expect `name and contact present`
- **systemic** - No browser component invokes send-lead-notification
  - `command`: `grep -rn "send-lead-notification" src/` -> expect `no matches`

**Graduates to** `tests/chaos/regressions/single-owner-alert.spec.ts` tagged @flow

---

### CM-13 - An oversized number in a submission destroys the lead with a 500

**Severity** S3 &nbsp;|&nbsp; **Effort** S &nbsp;|&nbsp; **Surface** `POST /api/leads/submit`

**What happens.** The lead is lost with a 500 - the exact failure mode the sanitizer was written to prevent

**Why it matters.** A real customer filling in an implausible square footage loses their enquiry entirely, and the owner never learns it existed.

**Evidence.**

- `square_footage and visit_count are absent from LeadSubmitSchema, so they ride .passthrough() uncapped`
- `leadSanitize.ts:131 Math.trunc accepts 9e99 because Number.isFinite(9e99) is true`
- `PostgREST rejects the value for an int4 column, insertLead errors, route.ts:459-473 returns 500 and the submission is gone`

**Root cause.** Integer columns are trusted to be in range because Number.isFinite passed, without checking int4 bounds.

**Fix.** Clamp integer columns to the column's real range in the sanitizer, and give the known numeric fields explicit schema bounds.

```ts
const INT4_MAX = 2147483647;
const n = Math.trunc(value);
if (!Number.isSafeInteger(n) || Math.abs(n) > INT4_MAX) { adjustments.push(`${key}: out of range, dropped`); continue; }
// schema: square_footage: z.number().int().min(0).max(1_000_000).nullish()
```

**Risk of the fix.** Low.

**Acceptance criteria** - every one machine-checkable, and each set carries a negative
(the bad thing is blocked) plus a positive (legitimate use still works):

- **negative** - A submission with square_footage 9e99 still creates the lead
  - `test`: `tests/chaos/regressions/lead-numeric-bounds.spec.ts` -> expect `200 and a lead row`
- **positive** - A normal square_footage is stored unchanged
  - `test`: `tests/chaos/regressions/lead-numeric-bounds.spec.ts` -> expect `value preserved`
- **systemic** - No integer column can be written a value outside its range
  - `test`: `tests/chaos/regressions/lead-numeric-bounds.spec.ts` -> expect `all INTEGER_COLUMNS clamped`

**Graduates to** `tests/chaos/regressions/lead-numeric-bounds.spec.ts` tagged @isolation

---

### CM-14 - Reads that grow with the business have no row cap

**Severity** S3 &nbsp;|&nbsp; **Effort** L &nbsp;|&nbsp; **Surface** `~45 call sites; see chaos/recon-queries.md`

**What happens.** Roughly 45 reads have no explicit cap and silently inherit the server's ceiling; several loops issue one query per row

**Why it matters.** LATENT. Today the largest table is ~12k rows and the rest are in the hundreds, so nothing is slow and no load test would show anything. After launch these become slow pages, truncated dashboards that silently under-report, and - combined with CM-04's missing statement timeout - a route that can hold connections long enough to affect the whole site.

**Evidence.**

- `ConversionDashboard.tsx:110 reads leads with no .limit()`
- `admin/dashboard/route.ts:38 reads a 30-day email_log slice with no cap, plus three exact counts`
- `admin/follow-ups/route.ts:39 selects * from follow_up_queue where each row carries full rendered email HTML`
- `portfolio/page.tsx:92 and ProjectGallery.tsx:121 issue one project_images query per project`

**Root cause.** PostgREST returns a bounded page by default, so an uncapped read looks correct in every test written against small data.

**Fix.** Treat it as one class, not 45 bugs. Add an explicit cap to every read of a growing table, make the cap visible in the response so truncation is never silent, and add a lint that fails the build on a new uncapped read.

```ts
// make the ceiling explicit and detectable in the shared helper
export async function supabaseRestPage<T>(path: string, cap: number) {
  const rows = await supabaseRest<T[]>('GET', `${path}&limit=${cap + 1}`);
  return { rows: rows.slice(0, cap), truncated: rows.length > cap };
}
```

**Risk of the fix.** Low per site, but there are many; do the growing tables first (leads, email_log, follow_up_queue, homeowners, seo_metrics).

**Acceptance criteria** - every one machine-checkable, and each set carries a negative
(the bad thing is blocked) plus a positive (legitimate use still works):

- **budget** - Query count for each instrumented route does not grow as rows grow
  - `test`: `tests/chaos/budgets.spec.ts` -> expect `maxQueriesGrowthRatio <= 1.2 between small and large`
- **positive** - Every list view still shows its data at small scale
  - `test`: `tests/chaos/regressions/list-views.spec.ts` -> expect `rows rendered`
- **systemic** - A newly added uncapped read of a growing table fails the build
  - `command`: `npm run chaos:lint:uncapped` -> expect `exit 0`
- **negative** - A truncated list reports truncation rather than showing a silently short list
  - `test`: `tests/chaos/regressions/list-views.spec.ts` -> expect `truncated flag surfaced`

**Graduates to** `tests/chaos/budgets.spec.ts` tagged @budget @nightly

---

## Limits proposed

| Limit | Value | Justification |
|---|---|---|
| `service_role` statement_timeout | **15s** | anon is 3s and authenticated is 8s; service_role has none and inherits 120s. 15s is well above every query this app makes and far below the point where one query monopolises a pooled connection. |
| `/api/referrals` per IP | **5 / minute** | matches `/api/leads/submit`, which handles a higher-value action with the same abuse shape. |
| `/api/referrals` body | **16 KB** | the cap `/api/leads/submit` already uses; the form's own fields total well under 2 KB. |
| `/api/crew/confirm` per IP | **20 / 10 min** | it is a token-guessing surface today with no ceiling at all; 20 allows a crew member retrying on bad signal and stops unbounded enumeration. |
| owner alerts per IP | **2 / hour** | an alert is for the owner to act on; more than two an hour from one source is abuse, not signal. |
| explicit read cap on growing tables | **cap + 1 rows** | requesting one more row than the cap is what makes truncation detectable instead of silent (CM-07). |

## Coverage - what was and was not tested

Stated explicitly, because silence that implies coverage is worse than an honest gap.

**Tested:** full source recon of all 82 API routes and 70 page routes (auth guards, validation
ladders, token lifecycles, query shapes); live production telemetry (`pg_stat_statements`,
per-table scan counts, role configuration, storage bucket flags); and two side-effect-free
probes against the live site.

**Not tested:**

- Generated load and N+1 measurement at medium/large scale - the database is production and every table is small (largest ~12k rows), so synthetic load would prove nothing and risk real data. Query-count instrumentation is proposed instead.
- The stochastic monkey - not run, because the only running app instance talks to the production database.
- Actual email delivery from CM-01 - proving it further would mean emailing a real person.
- Anonymous enumeration of intake-photos - inconclusive: the bucket is empty, so the LIST probe could not distinguish RLS from emptiness.
- Coverage crawl DID run (80 routes as anonymous and as admin, both passing). It ran against the STUB build, so database-driven route families (services, locations, blog, projects) render empty there - those paths were spot-checked 200 in production instead, and `npm run test:links` is the live-backend sweep that covers them properly.
- Dead-control detection (clicking every button to find ones that do nothing). The upstream crawler does this; it was removed here because the only available build talks to the production database and a mis-clicked control writes real data. Needs a seeded local stack.

## Residue

- No rows written, no emails sent, no files uploaded. Two side-effect-free probes against production: GET /api/health/forms and POST /api/leads/webhook with an empty body (rejected at validation before any write).

## Unverified

Reported as hypotheses, deliberately not counted as findings.

- **homeowners.access_token never expires and is never rotated; it buys a 30-day session that can book paid work at the member's address.**  
  *Why unverified:* Reported by source recon; the lifecycle claim is sound from the code but no probe was run against a live member token, and doing so would touch a real customer's account.
- **The intake session token has no expiry column and no revocation check.**  
  *Why unverified:* Source-confirmed by recon; not probed, because a live intake token belongs to a real lead.
- **/api/crew/confirm is deliberately unthrottled and PATCHes dispatch state.**  
  *Why unverified:* Documented as intentional in the route; brute-force resistance rests entirely on token entropy, which was not independently measured.
- **An unauthenticated read of seo_metrics returned 2 rows, implying a public RLS policy on that table.**  
  *Why unverified:* Observed while testing something else; not investigated. Worth a look - it may be intentional.

