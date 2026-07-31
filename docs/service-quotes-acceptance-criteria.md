# Home Care service quotes - acceptance criteria

Owner-approved scope from the Lavish plan review on 2026-07-30
(`.lavish/service-quote-plan.html`).
A lighter sibling to Send Estimate for one-visit service work, plus the
scheduling, reminder, portal and completion loop around it.

Every AC below is verified by a named test.
`SQ` = send quote, `IN` = intake, `SC` = scheduling, `RM` = reminder,
`PT` = portal, `CP` = completion, `CM` = compliance.

## Decisions this encodes

These were settled by the owner during review; the ACs assume them.

1. **QuickBooks stays.** Every service quote still carries a real QBO
   `estimate_url`, so `estimate_emails.estimate_url` remains `NOT NULL` and no
   nullable-column migration is needed.
2. **Prices live in QuickBooks, not the email.** The email carries a scope
   summary, not line items or totals.
3. **Credibility is three lines, not five bullets.** Licensed/bonded/insured
   plus HIC, 1-year workmanship warranty, 5.0 on Google. The lifetime Schluter
   warranty is deliberately excluded - it is tile-specific and would be a false
   claim on a gutter clean.
4. **The quote promises a 5-star finish; it never asks for a review.** The ask
   fires after the job. Wording that solicits specifically positive reviews is
   review-gating, which Google prohibits.
5. **Scheduling creates a lightweight homeowner record**, as `status='pending'`
   and `source='service_quote'` so it can never receive marketing.
6. **No automated SMS.** One reminder email at 7:30pm the night before, which
   tells the customer La Vaca will text when on the way; that text is sent by
   hand.
7. **The customer's calendar file lives on the portal**, not attached to email,
   so the only `.ics` ever generated carries internal ops alarms and can only
   reach the owner.

---

## SQ - the service quote email

- **SQ1** `buildServiceQuoteEmail` renders on the shared `emailShell`: licence
  bar, brand row, pill, two-tone headline, orange CTA, navy call block, footer.
- **SQ2** It contains **no** portal URL, no update cadence, no Schluter/lifetime
  warranty, and no four-step QuickBooks walkthrough.
- **SQ3** The CTA links to the QBO `estimateUrl` and is labelled to open the
  estimate. Accepting still happens in QuickBooks.
- **SQ4** A credibility block renders exactly three claims: licensed/bonded/
  insured with the HIC number, the 1-year workmanship warranty, and the Google
  rating. The rating is read from a single exported constant, never inlined, so
  it cannot silently become a false claim.
- **SQ5** The email states a 5-star aim and that La Vaca will ask how it went.
  It does **not** contain the words "review", "5-star review", or any request
  for a positive rating.
- **SQ6** A `validUntil` date renders in both HTML and text; it defaults to
  30 days out when the caller omits it.
- **SQ7** The scope summary and visit-length line render when supplied and are
  HTML-escaped.
- **SQ8** Plain-text and HTML carry the same facts: scope, valid-until, CTA URL.

## IN - intake

- **IN1** `parseTaskKeys` extracts keys from a Home Care lead message of the form
  `... (tasks: clean_gutters,clean_dryer_vent)`, tolerating spaces, and returns
  `[]` for a message with no marker.
- **IN2** Keys resolve against `maintenance_catalog` to title and blurb; an
  unknown key is dropped rather than rendering an empty line.
- **IN3** For a customer with no lead, the full bookable catalog is offered
  (`active=true`, `bookable=true`), sorted by priority.
- **IN4** `lastDoneFor` returns the most recent `completed_at` per task key for a
  homeowner, ignoring rows that are not `status='done'`.
- **IN5** Last-done is per `(homeowner, task_key)` and returns the newest row
  when a task has been done in several seasons.

## SC - scheduling

- **SC1** Scheduling upserts a `homeowners` row by email. An existing member is
  reused, never duplicated (`homeowners.email` is `UNIQUE`).
- **SC2** A record created by scheduling is `status='pending'` and
  `source='service_quote'`.
- **SC3** **A scheduled non-member is never mailed marketing.** The newsletter
  cron selects `status=eq.active`, so a `pending` row is structurally excluded.
  Asserted directly against the cron's recipient query.
- **SC4** Scheduling writes `scheduled_start`, `scheduled_end`,
  `service_address` and sets `status='booked'` on `homeowner_maintenance`.
- **SC5** Scheduling sends **no** verification email - the customer never asked
  for one.
- **SC6** Rescheduling updates the existing row rather than creating a second.

## ICS - the calendar file

- **ICS1** `buildIcs` emits a valid `VCALENDAR`/`VEVENT` with `DTSTART`,
  `DTEND`, `SUMMARY`, `LOCATION` and `DESCRIPTION`, CRLF line endings, and
  `UID`/`DTSTAMP` present.
- **ICS2** Text is escaped per RFC 5545: commas, semicolons and backslashes
  escaped, newlines as `\n`.
- **ICS3** The owner's copy carries two `VALARM` blocks with **absolute**
  triggers - 7:30pm the evening before, and the morning of - never relative
  offsets, which would fire at different clock times for an 8am and a 2pm job.
- **ICS4** The alarm text names the ops action: confirm the visit, and text the
  customer when on the way.
- **ICS5** The customer variant contains **no** `VALARM` at all, so internal ops
  reminders can never reach them.
- **ICS6** `LOCATION` carries the service address.

## RM - the night-before reminder

- **RM1** Scheduling queues one `visit_reminder_1d` row in `follow_up_queue`.
- **RM2** The reminder states the date, the time window and the service address,
  and says La Vaca will text when on the way.
- **RM3** Its reply-to is `alex@lavacagc.com` **and** `veronica@lavacagc.com`.
- **RM4** Rescheduling cancels the pending reminder and queues a new one; a
  reminder for a moved appointment is never sent.
  Cancellation is scoped to the **visit**, never to the address: a customer with
  two visits booked keeps the other visit's reminder.
- **RM5** Cancelling or completing a visit cancels that visit's pending
  reminder, and only that one.
- **RM6** The cron is `30 23 * * *` UTC, which is 7:30pm Eastern in summer and
  6:30pm in winter. Asserted against `vercel.json`.
- **RM7** The cron selects visits for **tomorrow in Eastern time**, not UTC. A
  visit late tomorrow Eastern is still included.
- **RM8** A reminder is sent at most once per visit, even if the cron runs twice.
  The visit's `follow_up_queue` row is the ledger: the cron claims it
  (`pending` -> `sent`) **before** sending, so a retry finds nothing to claim.
- **RM9** `/api/cron/visit-reminders` is the **only** sender. `follow_up_queue`
  is shared, and its general drain (`/api/cron/send-follow-ups`, 09:00 UTC) has
  no type filter of its own, so it explicitly skips every type with a dedicated
  cron. Without that the customer would get the reminder twice, the second time
  at ~4am Eastern on the day of the visit, saying "tomorrow".
- **RM10** `follow_up_queue.follow_up_type` carries a CHECK constraint listing
  the sequences that share the table, so `visit_reminder_1d` must be added to it
  or the queue insert fails and booking a visit 500s.

## PT - the customer portal

- **PT1** An upcoming visit renders on the checklist page above the task list,
  with date, time window and services.
- **PT2** A visit tomorrow renders in the prominent state; one further out
  renders in the quiet state.
- **PT3** The card offers an `.ics` download - the customer variant, with no
  alarms - and reschedule links (`mailto:` and `tel:`).
- **PT4** With no scheduled visit, no card renders and the page is unchanged.
- **PT5** A task completed by La Vaca shows `Completed by La Vaca` with the
  date; one the homeowner ticked shows no such label.

## CP - completion

- **CP1** Mark-complete sets `status='done'`, stamps `completed_at`, and writes
  `completed_by='lavaca'`.
- **CP2** The checklist checkbox writes `completed_by='homeowner'`.
- **CP3** Existing rows default to `'homeowner'` - nothing has ever been
  completed by La Vaca before this change.
- **CP4** Mark-complete is idempotent: a second call sends no second feedback
  email.
- **CP5** It fires the feedback drip with **service** wording. The subject and
  headline are "Please let us know how our team did".
- **CP6** The body puts "if anything isn't right we'll come back" **before** any
  mention of a public word, so it is a feedback request and not review-gating.
- **CP7** The service variant never uses the project copy ("your recent
  project").
- **CP8** Completion feeds the history: a task completed today is what IN4
  returns as last-done.

## CM - compliance (applies to every new email)

- **CM1** Every new email carries the CAN-SPAM postal address in HTML and text.
- **CM2** Every new email carries a working unsubscribe link in HTML and text.
- **CM3** Every new email says why the recipient is receiving it.
- **CM4** No new email contains emoji or an em dash (house style).
- **CM5** Every new email uses the shared shell chrome - 600px card, cream page,
  `mso-line-height-rule:exactly`, and the mobile media query.
- **CM6** No environment leaks: with a staging origin, every link in the built
  email points at that origin except the deliberately absolute hosted logo.
