# Home Care service quotes - acceptance criteria

Owner-approved scope from the Lavish plan review on 2026-07-30
(`.lavish/service-quote-plan.html` - a local review artifact, gitignored, so this
file is the tracked record of what was agreed).
A lighter sibling to Send Estimate for one-visit service work, plus the
scheduling, reminder, portal and completion loop around it.

Every AC below is verified by a test that names it in its title - CP8 excepted,
which is covered across two others (see its note).
`SQ` = send quote, `IN` = intake, `SC` = scheduling, `ICS` = calendar file,
`RM` = reminder, `PT` = portal, `CP` = completion, `CM` = compliance.

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
  homeowner, keyed on the **timestamp** and never on `status`.
  One row carries both current state and history, and they answer different
  questions - see **CP10**. A row with no `completed_at` is not history:
  `booked` and `snoozed` stamp none, and a member retracting their own tick
  clears theirs with it.
- **IN5** Last-done is per `(homeowner, task_key)` and returns the newest row
  when a task has been done in several seasons.
- **IN6** The lead lookup matches the address **case-insensitively**.
  `leads.email` is stored exactly as the customer typed it - the booking form
  only trims it - so a case-sensitive `eq.` against the lowercased param returns
  nothing for anyone whose address autofilled as `Jane.Smith@Gmail.com`. Their
  past requests, the pre-selected services and the scope summary then all simply
  fail to appear, which reads as "this customer has no history" rather than as a
  bug. Matched the way `cancelPendingFollowUps` does it: an escaped `ilike`
  prefilter narrows the candidates and a JS equality check picks the true
  matches, because PostgREST reads `*` as an alias for `%` with no way to escape
  it. `homeowners` keeps its exact match - `normalizeEmail` lowercases it on
  write, so only `leads` is exposed.

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
- **SC9** The windows a customer is already holding are read **before** the
  upsert overwrites anything, across every season, so the requeue can pull
  exactly the reminder of the window the visit has just left. One window can hold
  tasks filed under different seasons, so the read is scoped to the customer and
  never to the season being booked.
  That read **fails closed**. Degraded to `[]`, a failed read does not mean "no
  read" - it means "this customer holds no bookings", the one answer that makes
  the caller cancel nothing while the booking is still written and the request
  still answers 200: "we're coming tomorrow" for a window the visit has left. It
  costs nothing pre-migration either: the upsert writes the same column two
  statements later and would fail anyway.
- **SC10** A service has **one active booking per season** - exactly what
  `homeowner_maintenance`'s unique key on (homeowner, task, season) already
  guarantees. Rescheduling *within* a season is therefore a plain upsert in
  place, and the only thing left to work out is the window it vacated, so that
  window's reminder can be pulled.
  *Which* window that is is matched on **(task, season)**, never on the task
  alone. Reaching across seasons, this function could not tell a move from a
  second booking: booking a spring gutter clean unbooked the October one and
  cancelled its reminder while the toast still read "Visit scheduled" - the visit
  gone from the member's portal and off the cron, with the owner's calendar still
  holding it.
  So nothing here infers a cross-season move, and nothing unbooks a window the
  caller did not name. Guessing at that intent is what the `replaces` handshake
  was for, and it cost three defects - a client that claimed a reschedule on
  every second click, a completion that resolved to the wrong visit, and a
  timestamp comparison that could never match - before a task-wide supersede
  reintroduced the loss from the other direction. The model was collapsed back
  onto the table's own natural key, where each of those is unrepresentable
  rather than handled.
  **Whether a customer may hold both halves of a two-season service at once is
  SC15's question, not this one - and the answer there is no.** Left to this
  function a cross-season booking would simply be written as a second row,
  stranding the first one's reminder, so it is refused before it gets here.
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
- **SC13** And the same rule from the other side: a booking writes the **window**
  onto every row, the **status** onto only some, and a completion column onto
  none.
  Stamping `'booked'` over a member's own completion erased their tick with no
  notice - they ticked the task on Tuesday, the visit moved on Thursday, and it
  was gone - the same narrowing the cancel route makes with `status=eq.booked`
  when it unbooks a visit. Whoever did the work keeps the credit; the booking is
  separate state on the same row.
  A **status** La Vaca set is still retaken: a row left reading `'done'` by us
  labels whoever ticks it next as our work (CP2) and makes "mark completed" treat
  the new visit as already handled, so that visit's window would never come off
  the books. An **expired** completion's status is retaken too - past
  `isRowCurrent` the task has already come back on the portal and in the
  newsletter, so `'booked'` is the truer label.
- **SC16** A booking never clears `completed_at` or `completed_by`, on any row.
  A booking is a statement about the **future**; those two columns are the record
  of a job that already happened - the service history this branch exists to
  accumulate, and what the next quote reads to say "last done Oct 2026 by La
  Vaca" (IN4). Cleared here, booking the gutters again retired last year's
  invoiced visit the moment the return visit was booked.
  Worse on the path CP10 opened, which is the flow the completion email invites
  ("if anything isn't right, tell us and we'll come back"): a member unticks our
  work, so the row is `'todo'` with our completion standing - invisible to any
  `status=eq.done` read - and the redo they asked for was exactly what erased the
  job. Cancel that redo and the DELETE handler restores no timestamp, so it was
  gone for good. `/complete` writes the record for the new visit when the new
  visit happens; until then the old one stands.
  `isRowCurrent` reads the clock matching the row's **current status** because of
  this: `completed_at` for `'done'`, `updated_at` otherwise. State and history no
  longer move together, so `completed_at ?? updated_at` would age a visit booked
  today off last year's completion and expire it straight out of the newsletter's
  suppression set - which is how we would nag a member about work we are booked
  to do.
- **SC14** A booked visit can be **cancelled** from the admin page.
  The DELETE route was fully built and unreachable, so a customer who phoned to
  cancel kept their portal card and got "we're coming tomorrow" for a job nobody
  was attending - the one email the owner does not know is going out. The two
  workarounds both wrote something false: reschedule it to a fake future date, or
  "Mark completed", which stamps the job into the service history and asks the
  customer to rate work that was never performed. The control is confirm-gated,
  names the window it cancels, and the booking list is re-read afterwards.
  The address the reminder cancel matches on is **read from the homeowner row**,
  never taken from the caller. The unbook filters on `homeowner_id` and the
  cancel on the address, so a caller-supplied one let the two name different
  people: the page sent its *lookup* box, which is not bound to the customer
  whose bookings are on screen, and a stale value cleared the window, matched no
  queue row, and still answered "cancelled" - so the customer was told we were
  coming tomorrow for a visit that had been called off. `/complete` already
  resolved it this way; both actions now do.
- **SC15** A service already booked into a **different season** is **refused**,
  not quietly booked twice.
  SC10 keys a booking on (task, season) so the two halves of a two-season service
  cannot disturb each other - but the season is reconciled from the visit *date*,
  and for the two-season services (`clean_gutters`, `roof_inspect`) it flips on
  1 Jun and 1 Dec. A **seven-day** slip from 25 Nov to 3 Dec therefore crossed
  it: a second row under spring while the fall row kept 25 Nov, so the cron sent
  "we're coming tomorrow" on 24 Nov for a visit that had moved and the portal
  showed it until it passed. Nothing distinguished that from a deliberate second
  booking, and nothing marked the stale one.
  Which one it was is not knowable here, and inferring it is the guessing that
  cost three defects. The admin knows, so they decide: the request is refused
  with a **409** that names the service and the visit already on the books, and
  **Cancel visit** (SC14) is one click away on the same screen. Nothing is
  written, so a refused booking leaves no trace.
  The consequence, deliberately: both halves of a two-season service can no
  longer be held at once - the spring clean is booked after the fall one is
  closed out. A booking that cannot be silently duplicated cannot silently
  strand a reminder, and a reminder for a visit nobody is attending is the worst
  outcome in this feature.
  Scoped to windows still **ahead**. A window already past announces nothing -
  its reminder run has fired and the portal card filters to the future - so
  blocking on one would only mean a visit nobody closed out can never be
  re-booked.

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
  The DELETE route takes no `email` at all - it reads the address off the
  homeowner row, so no caller-supplied pattern reaches this query. See **SC14**.
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
  is shared, and no general drain of it has a type filter of its own, so every
  drain skips the types with a dedicated cron.
  There are **two** such drains, and applying the registry to one was not
  enough. `/api/cron/send-follow-ups` (09:00 UTC) would send the reminder a
  second time, at ~4am Eastern on the day of the visit, saying "tomorrow".
  `/api/follow-up` (the admin "process follow-ups" button) flips due rows
  straight to `'sent'` without mailing anything, and `'sent'` and `'responded'`
  both read as closed to the reminder cron's ledger - so it would silently
  swallow the email instead of duplicating it.
  The exclusion therefore lives in a shared query builder,
  `sharedFollowUpQueue`, not in a constant each drain has to remember to spell.
  A registry that relies on being remembered is how this recurred; a test
  asserts neither drain reaches for `.from('follow_up_queue').select(...)`
  itself.
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
- **RM16** A reader of `follow_up_queue` keyed on the **person** is scoped to the
  sequence it means, not to the address alone. The drains were guarded (RM9), but
  two readers still spoke for the whole table:
  `createLeadFollowUpSequence` asks "has this lead already been through the
  drip?" and answered it from any row for that address. Reminder rows stay
  `'sent'` forever, so a walk-in service customer the admin booked by hand who
  later submitted the website form was skipped: their acknowledgement never went
  out, with `duplicate_email` in the log as the only trace. It reads the
  **nurture types** now, which is what the question meant.
  The admin Follow-Ups page bucketed anything it did not recognise as a lead
  drip, so a pending reminder showed as "Lead nurture" and its Stop button - type
  scoped, correctly - cancelled nothing and reported "Nothing left to stop"
  forever. Visit reminders are their own sequence, with their own label, their
  own pill and a Stop path that reaches them; the confirm says plainly that
  stopping one means the customer is never told we are coming.
  Both directions read ONE registry, `FOLLOW_UP_SEQUENCE_TYPES`, so a fourth
  sequence adds itself in one place rather than being rediscovered by each
  caller. **Resend** refuses a dedicated-sender type outright: the generic insert
  cannot carry `visit_start`, so the copy would be a row no cron can ever find.
- **RM15** A ledger row that cannot be **written** stops that send. The claim
  branch already fails closed when another run got there first; the branch that
  creates a missing row has to as well, because a send with no ledger entry is
  one that every retry and every manual re-hit repeats - the exact failure the
  ledger exists to prevent. The recipient is counted `skipped` and logged.

- **RM18** A send that does not complete **releases its claim and fails the run**.
  The claim is taken before the send (RM8), so a fault after it would otherwise
  leave the queue reading `sent` for an email nobody received: that is how an
  unconfigured `RESEND_API_KEY` recorded every visit that night as delivered
  while the route answered `ok`.
  The release is **not** a retry, and the route no longer says it is. Every run
  covers exactly one Eastern day (RM7), so the run after this one looks at the
  *next* day's visits - a row released tonight is outside its window and every
  later one, and `/api/cron/send-follow-ups` skips the type outright (RM9).
  What the release actually buys is a manual re-hit before Eastern midnight:
  `ledgerVerdict` counts `failed` as open, so an authenticated GET can still take
  the row. Nothing schedules that, so the failure is made **loud** instead:
  `console.error` per recipient naming the visit and the reason, and the run
  answers `ok:false` with `degraded: 'reminder_send_failed'` - the same treatment
  the unavailable-ledger branch gets (RM13), and for the same reason: a cron
  failure is silent. A release that could not itself be written is logged too.
  There is **no refusal branch**. `sendTrackedEmail` answers `'unsubscribed'`
  only from `knownSuppressed` or a `preferenceStream` opt-out, and this sender
  passes neither - a night-before reminder for a visit the customer booked is
  transactional and must not be droppable by a marketing opt-out. A guard
  narrowing on that reason reads as an opt-out being honoured here when none is.
- **RM17** A cancel that cannot reach the queue reports `unavailable`; it is
  never reported as done. Both halves of `cancelPendingVisitReminders` used to
  `.catch()` into silence, so a failed cancel was indistinguishable from one with
  nothing to cancel: the DELETE route answered `cancelled` and the toast read
  "Off the books, and the reminder is pulled" while the "we're coming tomorrow"
  was still queued for a visit that had been called off. That is the worst thing
  this feature can emit, and it was the one path in the reminder pipeline that
  failed OPEN - the booking read throws (SC9), the cron sends nothing when its
  ledger read 400s (RM13), an ambiguous slot counts as closed (RM8), and a
  ledger row that cannot be written skips the recipient (RM15).
  A requeue whose cancel failed queues **nothing**: the stale row is still
  pending for a window the visit has left, so a second one would announce both.
  Cancel and complete pass the outcome back to the admin page, which says
  plainly that the reminder is still live and where to stop it.

## PT - the customer portal

- **PT1** An upcoming visit renders on the checklist page above the task list,
  with date, time window and services.
- **PT2** A visit today or tomorrow renders in the prominent state; one further
  out renders in the quiet state.
  The day OF the visit used to be the quietest of the three - a grey
  "Scheduled" band and a bare date - on the one morning the member is most
  likely to open the portal at all.
  The comparison is in Eastern, so a member in another zone sees the day the
  crew and the reminder email do: 11pm Eastern the night before is already
  tomorrow's date in UTC, and read there the card would say "today" a day early.
- **PT3** The card offers an `.ics` download - the customer variant, with no
  alarms - and reschedule links (`mailto:` and `tel:`).
- **PT4** With no scheduled visit, no card renders and the page is unchanged.
- **PT5** A task completed by La Vaca shows `Completed by La Vaca` with the
  date; one the homeowner ticked shows no such label.
  The label needs the row's **current status** to be `'done'`, not just a
  `completed_by` of ours: a row re-booked for a return visit keeps the record of
  the previous job (**SC16**), and that is history rather than something to
  announce on a task that is due again.
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
- **PT7** The card stays up until the visit's window **ends**, not until it
  opens. Filtered on `scheduled_start`, an 08:00-11:00 visit dropped off the
  page at 08:00 sharp - while the crew was pulling up and the member was opening
  the portal to re-check the address, the time and the "we'll text you when
  we're on our way" line.
  `scheduled_end` is nullable and the two-hour fallback was spelled out three
  times - the page, the card and the reminder cron. One `visitEndsAt` now, so
  the page cannot decide a visit is over while the email still says it is on.

## CP - completion

- **CP1** Mark-complete sets `status='done'`, stamps `completed_at`, and writes
  `completed_by='lavaca'`.
- **CP2** The checklist checkbox writes `completed_by='homeowner'`. Attribution
  follows whoever recorded the completion the row is currently showing. The
  column defaults to `'homeowner'` on insert only, and a merge-duplicates upsert
  updates just the columns in the body - so a writer that omits it leaves
  whatever was there. La Vaca cleans the gutters, the member unticks it and later
  does the work themselves: without this the card credits us for their work,
  which is a worse error than showing no label at all.
  A booking writes neither column (**SC16**), so it is the *status* that decides
  what the portal shows - a re-booked row reads `'booked'` and carries no label
  while still holding the record of the job it repeats.
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
  returns as last-done. The only criterion here without a test carrying its own
  name: the chain is covered across two, the mark-complete write (CP1) and the
  last-done reads that assert `by: 'lavaca'` off a completed row (**SC13+SC16**,
  **SC16**).
- **CP9** A booked visit can be marked complete **without re-booking it first**.
  A job is booked on Monday and performed on Thursday, in a different session, so
  gating the button on a schedule POST from the same page load meant re-typing
  the date and clicking "Schedule visit" again just to reveal it - which wiped
  the member's own tick off the row and queued a reminder for a window that had
  already passed. The lookup returns the customer's open bookings, one entry per
  window with every service in it, and each carries its own "Mark completed".
  The completion **names the window** it closes, so it can never reach another
  visit the customer has on the books.

- **CP10** A member unticking a task **keeps** the record that La Vaca did the
  work. Current state and history live on one row and answer different
  questions: unticking says "this needs doing again", which is a statement about
  now, not a claim that we never came. The status goes back to `'todo'`;
  `completed_at` and `completed_by='lavaca'` stand.
  Otherwise one tap erased an invoiced visit from the service history this
  branch exists to build - `lastDoneFor` read through `status='done'`, so the
  next quote said "no record" for work that was performed and billed, and the
  completion email invites exactly that tap ("if anything isn't right, tell us
  and we'll come back"). The history is keyed on the timestamp instead (IN4), so
  preserving it is what makes it count.
  A completion of the member's **own** is still cleared: retracting it is what
  unticking means. Nothing is preserved on a re-tick either - it is theirs now
  (CP2), and last-done reports the most recent job, which is the true one.
  The read that decides this fails closed: a lookup that errors refuses the
  write rather than guessing that nobody has completed the task.

## CM - compliance (applies to every new email)

- **CM1** Every new email carries the CAN-SPAM postal address in HTML and text.
- **CM2** Every new email carries a working unsubscribe link in HTML and text.
- **CM3** Every new email says why the recipient is receiving it.
- **CM4** No new email contains emoji or an em dash (house style).
- **CM5** Every new email uses the shared shell chrome - 600px card, cream page,
  `mso-line-height-rule:exactly`, and the mobile media query.
- **CM6** No environment leaks: with a staging origin, every link in the built
  email points at that origin except the deliberately absolute hosted logo.
- **CM7** An opt-out link is scoped to a stream the unsubscribe page actually
  implements, and its footer says what the link takes away.
  `/unsub` branches on ONE value, `follow_ups`; every other value falls through
  to the marketing cascade and turns off `buy_remodel` and `announcements` too,
  consent that only a fresh double opt-in restores. The quote carried
  `stream=home_care`, which read as scoped and was inert - and claimed a scope
  the recipient may not have, since a quote goes to someone who asked for a
  price and need never have joined Home Care.
  It carries `follow_ups` now: the opt-out that governs automated mail about an
  inquiry (the nurture drip, the post-job review request), while estimates and
  scheduling still come through - so it cannot silence a live negotiation. The
  footer says exactly that, because beside a quote the safe reading of a bare
  "Unsubscribe" is "this cancels my quote".
  The visit reminder is unaffected: it goes to a homeowner row that exists by
  then, so it keeps the correctly-scoped `/api/home-care/unsubscribe?token=`.
