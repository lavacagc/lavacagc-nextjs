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
- **SC7** The admin form builds the visit instant in **Eastern**, via
  `easternVisitInstant`. Everything downstream reads a stored instant as Eastern
  wall-clock, and a bare `new Date('2026-08-05T08:00')` is parsed in the
  browser's zone - so booking from a laptop on Pacific would silently store an
  11am window with nothing to surface the error.
- **SC8** The season a booking is filed under comes from the **visit** date,
  reconciled against that task's own catalog seasons, and "mark complete" reuses
  the season the booking was filed under.
  The portal renders a task only in the seasons its catalog row lists, so the
  visit's own season is not always somewhere the row can be seen: gutters are
  `['fall','spring']` and a furnace tune-up is `['fall']`, but both get booked in
  July, which is 'summer'. Filed there the row matches no tab - no booked state,
  no completion label - and the September newsletter still lists August's work as
  outstanding, because suppression is per season too. The visit's own season wins
  when the task applies to it; otherwise the nearest season it does, upcoming
  first. A task with no season to be filed under is **rejected at schedule time**
  rather than written where nobody will ever see it.
  It is derived server-side, because it needs the task's catalog seasons and
  comes out **per task** - one July window can file a gutter clean under 'fall'
  and a deck seal under 'summer'. `/schedule` returns what it filed each task
  under and "mark complete" resolves each task from the row it was booked into.
- **SC9** Rescheduling a visit **across a season boundary** leaves no phantom
  booking. The upsert only reaches the (task, season) row it writes, so a visit
  moved from 5 Sep to 28 Aug would otherwise leave the fall row holding its old
  window: the portal's next-visit card would show a visit that is not happening,
  and the cron would send "we're coming tomorrow" for it. Superseded rows are
  read across **every** season, unbooked before the new row is written, and
  their reminders cancelled.
- **SC10** A service has **one active booking at a time**, which is what
  `homeowner_maintenance`'s unique key on (homeowner, task, season) already
  guarantees - so a reschedule is a plain upsert in place, and whatever window
  these tasks are holding is by definition the one being moved.
  There is no `replaces` handshake and no attempt to tell a move from a second
  concurrent booking of the same service: that is not a thing the business does
  (there are not two scheduled visits to clean the same gutters), and asking the
  caller to name the window it was moving from cost three defects - a client that
  claimed a reschedule on every second click, a completion that resolved to the
  wrong visit, and a timestamp comparison that could never match.
  Windows compare as **instants**, never as strings: PostgREST renders
  `timestamptz` as `2026-09-05T12:00:00+00:00` and `Date#toISOString()` gives
  `2026-09-05T12:00:00.000Z`, the same moment spelled two ways, so a string
  compare silently matches nothing in production while every stubbed test passes.
- **SC12** A window another service still holds is **not** retired. Several
  tasks share one visit, so moving the gutters off a 5 Aug window that also
  carries a dryer vent leaves 5 Aug booked - and, the part that bites, leaves its
  reminder standing. Only a window no booking holds any more has its reminder
  cancelled.
- **SC11** A visit is a row carrying a **window**, never a row whose `status`
  reads `'booked'`. `status` is shared with the member's own checklist checkbox,
  which writes `'done'`/`'todo'` onto the same (homeowner, task, season) row - so
  a member who sees the visit card and ticks "Clean gutters" to acknowledge it
  used to take the visit off the portal and off the reminder cron for a job that
  was still happening, with nothing warning either side. The member's write owns
  `status`, `completed_at` and `completed_by` and carries none of the scheduling
  columns, so their completion is recorded and the booking stands for the owner
  to reconcile. Cancelling and completing are what clear the window.

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
  Cancellation is scoped to the **visit**, never to the address and never to the
  day: a customer with two visits booked keeps the other visit's reminder, and
  that holds for two visits on the SAME date (gutters at 8am, dryer vent at 1pm).
- **RM5** Cancelling or completing a visit cancels that visit's pending
  reminder, and only that one.
  The cancel matches the address EXACTLY: an ilike prefilter narrows the
  candidates and a JS equality check picks the rows, because PostgREST reads `*`
  as an alias for `%` with no way to escape it.
  The DELETE route validates `email` for the same reason.
- **RM6** The cron is `30 23 * * *` UTC, which is 7:30pm Eastern in summer and
  6:30pm in winter. Asserted against `vercel.json`.
- **RM7** The cron selects visits for **tomorrow in Eastern time**, not UTC. A
  visit late tomorrow Eastern is still included.
- **RM8** A reminder is sent at most once per visit, even if the cron runs twice.
  The visit's `follow_up_queue` row is the ledger: the cron claims it
  (`pending` -> `sent`) **before** sending, so a retry finds nothing to claim.
  When a visit holds several rows - rescheduling into the same window cancels one
  and inserts another - the verdict is computed from the whole set rather than
  from whichever row Postgres returned last, and it fails **closed**: a `sent`
  row outranks everything, so a re-run can never produce a second reminder.
- **RM11** A queue row is tied to its visit by `follow_up_queue.visit_start`, not
  by `scheduled_at`. `scheduled_at` is 7:30pm Eastern the night before, the same
  instant for every visit that day, so keying on it made two visits on one date
  share a single row: booking the second pulled the first's reminder and the one
  email that survived named only the earlier job. The column is added by
  `20260817000000_follow_up_queue_visit_start.sql`, nullable so the other
  sequences sharing the table are unaffected.
- **RM9** `/api/cron/visit-reminders` is the **only** sender. `follow_up_queue`
  is shared, and its general drain (`/api/cron/send-follow-ups`, 09:00 UTC) has
  no type filter of its own, so it explicitly skips every type with a dedicated
  cron. Without that the customer would get the reminder twice, the second time
  at ~4am Eastern on the day of the visit, saying "tomorrow".
- **RM10** `follow_up_queue.follow_up_type` carries a CHECK constraint listing
  the sequences that share the table, so `visit_reminder_1d` must be added to it
  or the queue insert fails and booking a visit 500s.
- **RM12** A reminder is queued only while the **run that would carry it** is
  still ahead, not merely while the visit is. The cron looks only at "tomorrow,
  Eastern", so a visit booked at 11pm the night before - or any same-day booking
  - is covered by a run that already fired. Queued anyway, the row would sit
  `pending` forever while the admin was told a reminder was on its way. It
  reports `skipped` instead, and the admin is told to text the customer
  themselves.
- **RM14** That gate is the **covering run**, not the nominal 7:30pm send time.
  The cron is one fixed UTC time with no DST logic (owner's call), so it fires
  at 7:30pm Eastern only under EDT - under EST it fires at 6:30pm, an hour
  *before* the send time the queue row carries. Gated on the send time, any
  winter booking made in that hour passed and then never sent. The run covering
  a visit on Eastern date D is 23:30 UTC on D-1, which is what
  `reminderRunAt` returns and `reminderIsStillUseful` compares against. Tested
  in December as well as August; an August-only test cannot see this.
- **RM13** A migration that has not been hand-applied yet **degrades**; it never
  hard-fails. The queue insert needs both 20260816 (the `follow_up_type` CHECK)
  and 20260817 (`visit_start`), so until they land it 400s - and a booking that
  in fact succeeded must not be reported to the admin as a failure. It returns
  `unavailable` and logs. The cron has no send-once ledger without `visit_start`,
  so it sends **nothing** rather than mailing a batch it cannot guard, and
  reports `degraded` rather than 500ing where a cron failure is silent.
- **RM15** A ledger row that cannot be **written** stops that send. The claim
  branch already fails closed when another run got there first; the branch that
  creates a missing row has to as well, because a send with no ledger entry is
  one that every retry and every manual re-hit repeats - the exact failure the
  ledger exists to prevent. The recipient is counted `skipped` and logged.

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
  The label is keyed per **(task, season)** like the done state is, and only for
  a completion still current under `isRowCurrent`. Keyed on the task alone it
  leaked: a fall gutter clean credited itself on the spring row the member
  ticked, and returned on next fall's re-tick with last year's date.
  The client holds its own copy and drops the key when the member toggles the
  task, because the write reassigns the row to them (`completed_by='homeowner'`)
  - read straight off the prop, the open tab kept the old label over work they
  had just done themselves, until a reload.
- **PT6** A booked task the member ticks stays on the page as a booked visit.
  See **SC11**: the card and the fetch behind it key on the window, not on the
  shared `status` column.

## CP - completion

- **CP1** Mark-complete sets `status='done'`, stamps `completed_at`, and writes
  `completed_by='lavaca'`.
- **CP2** The checklist checkbox writes `completed_by='homeowner'`, and so does
  booking. Attribution follows whoever set the CURRENT status. The column
  defaults to `'homeowner'` on insert only, and a merge-duplicates upsert updates
  just the columns in the body - so a writer that omits it leaves whatever was
  there. La Vaca cleans the gutters, the member unticks it and later does the
  work themselves: without this the card credits us for their work, which is a
  worse error than showing no label at all.
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
- **CP9** A booked visit can be marked complete **without re-booking it first**.
  A job is booked on Monday and performed on Thursday, in a different session, so
  gating the button on a schedule POST from the same page load meant re-typing
  the date and clicking "Schedule visit" again just to reveal it - which wiped
  the member's own tick off the row and queued a reminder for a window that had
  already passed. The lookup returns the customer's open bookings, one entry per
  window with every service in it, and each carries its own "Mark completed".
  The completion **names the window** it closes, so it can never reach another
  visit the customer has on the books.

## CM - compliance (applies to every new email)

- **CM1** Every new email carries the CAN-SPAM postal address in HTML and text.
- **CM2** Every new email carries a working unsubscribe link in HTML and text.
- **CM3** Every new email says why the recipient is receiving it.
- **CM4** No new email contains emoji or an em dash (house style).
- **CM5** Every new email uses the shared shell chrome - 600px card, cream page,
  `mso-line-height-rule:exactly`, and the mobile media query.
- **CM6** No environment leaks: with a staging origin, every link in the built
  email points at that origin except the deliberately absolute hosted logo.
