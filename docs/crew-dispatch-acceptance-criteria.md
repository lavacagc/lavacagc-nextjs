# Crew dispatch - acceptance criteria

Scheduling a visit told the customer and the owner, and never told the people doing the work.
This closes that gap: an email to the crew with the calendar invite attached, a per-person confirm link, and a two-stage escalation when nobody answers.

Owner decisions this was built to, from the Lavish review on 31 July 2026:

- **No Gmail integration.** A link and an attachment in an ordinary email, sent through Resend. No API, no OAuth, no mailbox access.
- **The "on our way" message stays a real text, sent by a person.** No automated customer email on the day. The live reminder copy is untouched.
- **A configurable recipient list**, pre-seeded with alex@ and veronica@.
- **`[ACTION REQUIRED]`** in caps on the dispatch subject.
- **5pm Telegram nudge, 6pm Telegram alert**, both to the existing chat.

## Calendar delivery

1. `buildIcs({ variant: 'crew' })` emits `METHOD:REQUEST`, not `METHOD:PUBLISH`.
   This is what makes Gmail render its own "Add to calendar" control on the attachment rather than offering a file download.
2. A crew file carries an `ORGANIZER` line, which RFC 5545 requires for a `REQUEST`.
   The organizer is **derived from the address the dispatch is sent from** (`HOME_CARE_FROM`), never written out again.
   Gmail and Outlook check that the sender is entitled to act as the organizer before rendering their own RSVP control; on a mismatch they fall back to offering the file as a plain download, which is exactly what `METHOD:REQUEST` was chosen to avoid.
3. A crew file carries one `ATTENDEE` line per recipient, with `RSVP=TRUE`.
   The `CN` is a **parameter** value, so it is DQUOTE-wrapped per RFC 5545 §3.1 rather than backslash-escaped the way a TEXT value is.
   `CN=Ramirez\, Jr` is read as two parameters or rejected outright, which would break the invite for exactly the person whose name has a comma in it; a quoted value has no escape of its own, so an embedded DQUOTE is dropped.
4. A crew file carries a `SEQUENCE`, and it **actually counts up**: `visit_dispatch.ics_sequence` is incremented whenever a visit that has already been dispatched issues another calendar message.
   A client applies a re-send to the event it holds only when the number is higher than the one it stored, so a re-dispatch or a retraction at the same number can be discarded as a duplicate.
5. A crew file carries **both** owner alarms: 7:30pm the night before to confirm, and 7:00am on the day to text the customer.
6. The 7:00am alarm names the customer and includes their phone number when we have one.
7. The customer variant still carries **no** `VALARM` at all, and still contains "We'll text you when we're on our way".
8. The owner variant is unchanged: `METHOD:PUBLISH`, no attendees, both alarms.
9. Alarm triggers are absolute `DATE-TIME` values, not relative offsets, so an evening visit's alarms still land in the evening and the morning.
10. `googleCalendarUrl` builds a `calendar.google.com/calendar/render?action=TEMPLATE` link with `dates` in `YYYYMMDDTHHMMSSZ/YYYYMMDDTHHMMSSZ` form.
11. That link involves no API call, no credential and no Google integration - it is string building only.

## The dispatch email

12. The subject begins with the literal `[ACTION REQUIRED]`.
13. The subject continues with the date, the arrival window and the street, so Gmail does not collapse five different visits into one thread.
    The `[CANCELLED]` retraction is the same subject with the other prefix, built by the same function.
    Gmail threads on subject and the retraction is meant to land in the conversation holding the invite it withdraws, so the street rule is precisely the thing that must not drift between them - two copies of it were two chances for one to change and start a second conversation nobody is looking at.
14. Caps are confined to the prefix; the rest of the subject is sentence case.
15. The body names the customer, the address, the services and - when given - the sub.
16. The body says **when** the customer is told, read off the visit's own date, and says so only when a reminder was actually queued - see AC114.
17. The body explains what the attachment is for, naming when each of its two alarms fires and omitting one that has already gone - see AC114.
18. The email carries **no unsubscribe link and no postal address**: it is internal operational mail to staff, not a commercial message, and a "stop receiving these" link on the email that says where to be tomorrow would be a way to break the schedule.
19. Every customer-facing Home Care email still carries both - this changes nothing there.
20. The send passes **no `preferenceStream`**, so a marketing opt-out can never suppress a dispatch.
21. One email per recipient, never one email to several: the confirm link identifies the person, so a shared message would record the wrong one as having confirmed.
22. The `.ics` rides as an attachment named `visit.ics`.
    Both crew calendar messages - the invite and the `METHOD:CANCEL` that withdraws it - go out through **one** `sendCrewMail` envelope, differing only in `category`.
    The `campaign` shape is what the `email_log` audit reads and what records the attachment name, and the content type is what makes the invite render as a calendar card, so two copies of those ten lines is two chances for one of them to rot.

## Attachments in the send chokepoint

23. `sendTrackedEmail` accepts `attachments` and base64-encodes the content, because that is the only shape Resend's JSON API takes.
23a. The `.ics` is **sent as a calendar part**: `text/calendar; charset=utf-8; method=REQUEST` on the invite, `; method=CANCEL` on the retraction.
    Gmail and Outlook decide whether to render their own "Add to calendar" / RSVP card off the MIME **part**, not off the bytes - an attachment with no declared type is offered as a plain file download, which is the desktop-Gmail download-and-import path the owner rejected and the exact outcome AC1's `METHOD:REQUEST` was chosen to avoid.
    Without it that decision is inert, which is how this survived ten rounds: AC1 and AC2 assert what the FILE contains, and nothing asserted how it was sent.
    The type is read off the file itself (`icsContentType`), so the header can never disagree with the body - a CANCEL announced as a REQUEST is a retraction a client is entitled to ignore, leaving the visit and its 7:00am "text the customer" alarm exactly where they were.
    `contentType` is optional on `TrackedEmailBase.attachments` and spread rather than set, so every send that does not ask for one produces exactly the request it produced before.
24. Attachment **bytes are never written to `email_log`**. Only the filenames are recorded, on the `campaign` field.
25. A send with no attachments produces exactly the request it produced before.

## Recipients

26. `dispatch_recipients` is seeded with `alex@lavacagc.com` and `veronica@lavacagc.com`, the same two addresses that are already `SERVICE_REPLY_TO`.
27. Email uniqueness is enforced case-insensitively, so `Alex@` and `alex@` cannot both receive every dispatch.
28. `resolveRecipients()` with no selection returns **everyone active** - not nobody. A booking made without touching the picker must still reach the crew.
29. `resolveRecipients([])` behaves the same way, for the same reason.
30. An inactive recipient is dropped even when explicitly named, so deactivating someone actually stops their mail.
31. The admin page pre-ticks everyone active on load.
32. Deselecting everyone disables the Schedule button and shows "nobody will be told to go".
92. A crew list that could **not be read** is never shown as an empty one, because the two lead to *opposite* outcomes.
    An empty list dispatches to nobody, and the panel says so; a failed read leaves no selection to send, and no selection means AC28 - the server dispatches to **every** active recipient, including anyone the admin meant to un-tick.
    Showing the same copy for both warned that nobody would be told at the precise moment everybody was, on the one thing this feature exists to do.
    So the read is checked for `res.ok` before anything is replaced, and a failure says the list could not be read and describes what booking now will actually do.
    The Crew page holds to the same rule: it already toasted the failure, but the toast fades and what stayed on screen was "Nobody yet" under "Nobody is active - scheduling a visit will tell no one", which is a statement about the business rather than about a read.
81. Un-ticking somebody and re-dispatching the **same** window **retires** their assignment: their confirm token stops working, and the escalation neither waits on them nor counts their answer.
    Deselecting on the picker is the only way to take somebody off a visit, and re-booking the same window is a re-dispatch rather than a supersede, so nothing else would ever clean the row up.
    Left live, a tap from somebody no longer on the visit satisfies "somebody confirmed" and silences the 5pm and 6pm chases for a visit the people actually going have never answered - and they would still show as having confirmed it on the admin list.
    Put back on the visit later, they are revived as unanswered rather than counted as having confirmed a visit they were off; a revival that did not land skips the send rather than mailing a link that is still dead.
    Their row is never deleted: it is the record that they were sent it.
    **Accepted gap, deliberate (owner decision, 31 July 2026):** a dropped recipient is *not* sent a `METHOD:CANCEL`, so the visit stays on their calendar with its 7:00am "text the customer when the crew is on the way" alarm.
    The mitigation is AC82, not a retraction - do not "fix" this by mailing one.
85. Everything `ensureAssignments` could **not** do is handed back rather than logged, and a send carrying any of it reports `sent_degraded` - never a clean `sent`.
    A retirement that did not land is the worst failure in this feature, because it does not lose information, it *disables the safety net*: the dropped person keeps a live token, and one tap from them satisfies "somebody confirmed" for a visit the people actually going have never answered.
    A revival that did not land is the milder twin - that person is skipped rather than mailed a link that is still dead - and is named too, because the only other clue would be a "dispatched to" list shorter than what the admin ticked.
    A send that could not be stamped onto its dispatch row is the third: the row now says it never went, so the 5pm stage chases it as "nobody was ever told" *and* cancelling the visit retracts nothing, since a retraction only goes out for a dispatch that sent.
    All three reach the admin toast by name, and the toast still says who *was* mailed rather than telling the admin to call people who received it.
    No write in `ensureAssignments` throws out of it, including the insert: that insert and the retire PATCH hit the same table, so whatever breaks one breaks both - which makes a combined failure the *likeliest* way to reach the catch, not the least, and throwing would take the retirement verdict with it and collapse both into a generic `unavailable`.

## Booking

33. The dispatch runs **after** the booking is written, and never throws: a booking that succeeded is never reported as failed because the dispatch could not go out.
34. The schedule response reports the dispatch outcome and the addresses it reached.
35. The admin toast reports the reminder and the dispatch as two separate outcomes, and is destructive if either failed.
36. `no_recipients` is reported distinctly, because "nobody is configured" and "the send failed" need different fixes.
37. Re-dispatching a visit reuses its `visit_dispatch` row, so escalation stamps and existing confirmations survive.
96. That row is a **read-then-insert**, not an upsert, and the comment says so.
    `on_conflict` would switch the Prefer header to `return=minimal` (supabase-rest.ts), leaving every first dispatch with no row to hand back and reporting `unavailable` - so the conflict is recovered where it happens instead.
    Two callers that both miss the row - a cron retry overlapping a booking, the same window saved from two tabs - race, the loser's insert violates `idx_visit_dispatch_visit`, and it re-reads the winner's row rather than failing a booking over a race it lost.
97. The recovered row goes through the **same sub write** the row that was already there does, and reports it the same way.
    The likeliest racer is exactly the caller with no sub to contribute - the escalation cron creating tomorrow's row at 21:00 UTC, against a booking for that same window - so handing the winner's row straight back dropped the sub the admin had just typed from the row *and* from the email built off it, under a clean `sent`.
93. **Whatever is in the Sub box wins.** A name replaces the one stored, and an EMPTY box clears it.
    The old fill-only rule was borrowed from `ensureServiceHomeowner`, where "only fill blanks" is right because the CUSTOMER owns that data and a booking must not overwrite what they told us themselves. The admin is the sole author of this field, so the same rule produced the opposite of the right behaviour: a sub was write-once per window, and after Ramirez fell through the crew were re-mailed "Sub: Ramirez Exteriors - confirm they are booked" with no way to correct it short of cancelling the visit and re-booking it - which mails a `[CANCELLED]` and then a fresh `[ACTION REQUIRED]` for a visit that never moved.
    ABSENT and EMPTY are therefore different answers the whole way down: the page always sends the field, the schema turns `''` into an explicit `null` rather than erasing it, and `ensureVisitDispatch` writes whatever was supplied - including the clear.
    A caller that omits the field entirely still leaves the stored sub alone, which is why this is absent-vs-empty rather than "always write": the escalation cron passes no sub, and chasing a visit must never wipe one as a side effect.
98. **The Sub box shows the sub stored on the visit it is aimed at**, which is what makes AC93 safe to have.
    A box that is authoritative on save and always opens blank makes the destructive direction the default: re-saving a window to add a second person or fix the address - the documented way to do both, see AC37 - cleared the stored sub, and the clear *succeeded*, so AC90 never fired and the toast read clean. The crew were then re-mailed a dispatch with no sub row, their confirm page lost its "Sub" line and its "Confirm - sub is booked" wording, and a later flag alert could not name who was booked.
    So `/intake` returns the sub on each booked window off its dispatch row, and the box follows the visit the date and From time name until the admin types over it.
    Looking up another customer or saving drops the typed value, and so does aiming the form at a window that carries its own sub, so a sub typed for one visit can never overwrite another's - and after a save the box agrees with the row rather than with the email that has already gone out.
    A window whose sub could not be read counts as carrying one, because treating an unreadable value as an absent one is the mistake this screen closed everywhere else.
    An ordinary correction to the date or the arrival window keeps what was typed: dropping the edit on every keystroke defended the rule above by throwing away the admin's input, and noticing the From time reads 08:00 rather than 09:00 after typing a sub is ordinary.
    Clearing is deliberate rather than confirmed: no prompt, because one firing on every visit that never had a sub is noise. The name being on the screen is what makes deleting it a decision.
    A sub that could **not be read** is not shown as the absence of one - not on a failed dispatch read, not on a failed visit list, not on a failed lookup. The box says so instead, because an empty box is a clear and the row is what it would be cleared from. (Only the dispatch-row read decides this; the assignments read failing leaves the sub perfectly known.)
    An earlier revision of this criterion recorded an audit concluding the sub was the only field on this screen whose default was destructive, and that the address was the one other value written onto the window.
    **That audit was wrong**, and AC99 is the correction: `taskKeys` is written onto the window too, and it decides which rows are written at all.
99. **The ticked services show what the visit the form is aimed at actually holds**, the way the Sub box shows its sub.
    `taskKeys` is the third field written onto the window and the sharpest of them: `scheduleVisit` upserts `scheduled_start`, `scheduled_end` and `service_address` onto exactly the selected (task, season) rows, and the same list is the `services` the crew dispatch and the customer's re-queued reminder both name.
    Left to the customer's last REQUEST, the documented flow of re-saving a booked window to add a second crew member (AC37) mailed both a service list drawn from what they once asked for: a visit holding gutters and a dryer vent, re-saved against a lead that only asked for gutters, told everybody "Clean gutters" while the dryer vent stayed booked into that window, unmentioned.
    The confirm page and the escalation read the booked rows through `visitContextFor`, so the email and the visit disagreed.
    So the selection is derived, not stored: what the admin has ticked, else what the visit holds, else what the request asked for.
    Aiming the form at a window on the books hands the ticks back to it, saving hands them back to the row just written, and looking up another customer drops them.
    Un-ticking is **not** a way to take a service off a visit - `scheduleVisit` upserts and never unbooks - so once the ticks differ from the window, the screen says what un-ticking does and does not do.
    Dropping a service is what "Cancel visit" is for.
    A visit list that could **not be read** is not the absence of a window: the ticks fall back to the request, and the screen says the visit was never checked against them, the same rule the sub follows.
    This replaces the audit AC98 used to record.
    The corrected one: of everything the booking sends, three values land on the visit - the services, the address and the sub.
    The sub can be cleared and now shows what it would clear (AC98, AC100); the services now show what they would change (this one); the address cannot go blank, because the button is disabled without one, but it *can* be silently replaced, since the box fills from the customer record rather than from the window - so a window booked at a different address says which one it is holding and that saving replaces it.
    Everything else that reaches the customer record fills blanks only (`ensureServiceHomeowner`).
    The crew picker defaults to every active recipient, which is the *non*-destructive direction: an untouched picker retires nobody (AC81), it only ever adds.
100. A sub the box could **not show** is left alone, never cleared.
    The last hole in AC93's "whatever is in the box wins": on a failed dispatch-row read the box resolves to `''`, and sending that was an explicit clear - a read that failed turned into a destructive instruction.
    The write *succeeded*, so `subRecorded` was `ok`, AC90 never fired and the toast read clean.
    So a box that is not showing the row omits `subName` from the POST altogether and `ensureVisitDispatch`'s absent-means-leave-alone path (AC93) preserves what is stored; the toast says the sub was not touched and that the crew email names a value nobody on screen has seen.
    A deliberate clear still works, because typing in the box - including emptying it - is what makes the edit real.
101. **A customer lookup clears every per-customer field before it fills any of them.**
    The resets used to sit inside branches - the services and the scope sentence behind "this lead named some tasks", the name and address behind "there is a homeowner record" - so a walk-in with neither kept the previous customer's on screen, and both buttons accept that state.
    "Send quote" then mailed one customer a scope sentence written for another, and "Schedule visit" booked their window onto another customer's services at another customer's address, which is what the crew dispatch and the night-before reminder are both built from.
    Pre-dates crew dispatch and fixed here: it is the same defect as a sub surviving into the next customer, on four fields that fix did not cover.
    The reset alone is not the whole guarantee, because it only runs on a lookup: AC104 covers the one that failed, and AC107 the retyped box that never reached one at all.
90. A sub the row would **not store** - or would not **clear** - is reported, not just logged, and the send reports `sent_degraded` rather than a clean `sent`.
    The email is right either way - it is built from the value handed back, never re-read - so the divergence between what was mailed and what is stored is invisible from everywhere else: the confirm page silently drops its "Sub" row and its button reverts from "Confirm - sub is booked" to "Confirm - I am on this", and a later flag alert about the visit cannot name who was booked for it. A clear that did not land is the mirror image, and just as quiet: the email leaves the sub off while the row still names them.
    The admin toast is the only place that is ever said, so it names the sub - or says it could not be cleared, which has no name to give - and tells them to re-save.
    The write stays best-effort - a sub that could not be stored is no reason to fail a booking the customer has already been given - which is exactly why it has to be *reported* instead.
89. Every reader that resolves a visit's dispatch row goes through **one** `dispatchForVisit(homeownerId, visitStart)`, the rule `assignmentsForDispatch` and `DISPATCH_ASSIGNMENT_COLUMNS` already hold the sibling read to.
    The (homeowner, window) key is exactly the value that must not drift: the `visitKey` normalisation and the URL encoding both have to be right in every copy, and a reader that got either wrong would quietly find no row and report a dispatched visit as never dispatched.
38. Re-dispatching reuses each recipient's existing assignment row and token, so a re-send never silently un-confirms a visit the crew already signed off.
39. `dispatched_at` is stamped only when at least one email actually landed.
40. Cancelling a visit deletes its dispatch row, so re-booking that window later does not inherit `nudged_at` and go unchased.
    So does **completing** one, and so does a **reschedule** for the window it moved off - all three retire the same way, because all three leave the same stale row behind.

## Confirming

41. `GET /crew/confirm/<token>` **mutates nothing.** Mail scanners and link-preview bots fetch every URL in an inbox; a GET that confirmed would mark visits confirmed that no human has looked at, and the escalation would then stay silent for exactly the visits it exists to catch.
42. The mutation is `POST /api/crew/confirm` only.
43. The page is `noindex`, since the token is the only credential.
44. An unknown token and a malformed token get the same answer, so live tokens cannot be enumerated.
91. A token that could **not be read** gets its own answer - "We could not check your link", with "your link is probably fine" - and is never rendered as the invalid one.
    This is the outer half of AC87: `lookupByToken` reports `not_found` and `unavailable` as separate verdicts rather than throwing, because either Supabase read behind it can fail - a 5xx, a revoked grant, RLS reached without the service key - and a caller folding that into the null a missing token produces states flatly that a perfectly good link is dead, sending somebody through their inbox for a newer email that does not exist.
    The page and its own API had disagreed about the same event: the route already caught the throw and answered `500 server_error`, and now reads that verdict instead of catching for itself, so the two cannot drift apart again.
    The deliberately generic answer stays reserved for a token that really is unknown, so AC44 still holds.
45. A token whose visit has been cancelled or closed out shows "no longer on the books" instead of a confirm button.
87. A visit that could **not be read** gets its own answer - "We could not check this visit", with "do not assume it is cancelled" - and is never rendered as the cancelled one.
    `lookupByToken` hands back a `visitRead` verdict rather than folding a failed read into a null the page cannot tell from an unbooked window.
    This is the worst place in the feature to fail open: the admin screen showing `none` hides information, but this screen would actively tell the person who is supposed to drive to the house that the job is off - and they would then neither go nor confirm, leaving the 5pm chase to report "nobody has confirmed" for a visit we told them was cancelled.
46. "Something is wrong" opens a note field rather than submitting immediately - what they type is the whole value of the button.
47. A flag records the note; a confirm clears it.
48. Both a confirm and a flag stamp `confirmed_at`, because both mean a human has *looked* at this - which is not the same as the visit being dealt with.
108. **A confirmation does not close the door.** "Something is wrong" survives it, and so does the office number.
    The confirmed screen was terminal and was the only terminal state with neither a way to raise a problem nor a phone number on it.
    Their own confirmation is what silences the 5pm and 6pm chases (AC55), so a sub cancelling overnight left the one person who knows with no route back into the system at all: every automatic check had already been switched off by their earlier answer, and the flag alert - the thing that Telegrams the owner the moment it is tapped - was unreachable.
    This was a UI gate only. `POST /api/crew/confirm` already accepts `action=flag` on a confirmed row: `alreadyTold` is false, the PATCH filters on the id and `neq.retired` alone, and `notifyFlag` fires normally.
    So re-flagging genuinely **reopens** the visit rather than merely recording a note - a flag outranks a confirmation in `dispatchStateOf` (AC78) and the escalation skips only on a *live* `confirmed` (AC55), so any chase still ahead of the visit resumes.
    For the case this exists for there is usually none: "the sub cancels at 6am" is a SAME-DAY event, and the escalation only ever reads tomorrow's window, so both stages ran the night before.
    The mechanism that helps there is the immediate Telegram, which fires either way - and what the alert says about a chase is conditioned on one actually being able to run (AC110).
    The note form is spelled once above both screens that open it, so the two entrances cannot drift into different forms.
    A **flagged** screen stays terminal, because clearing a flag is the admin's (AC76) - raising one again is not the same act as deciding one is sorted.
49. `/api/crew/` is public in middleware, guarded by the token rather than a session.
    A server error on this public route answers a flat `server_error`; the thrown detail - table names, the token filter, PostgREST's own error body - stays in the logs.
82. A **retired** token gets its own answer - "You are no longer on this visit", with "please don't text the customer about it" - never the generic "this link is not valid", and `POST /api/crew/confirm` refuses it with `410`.
    This is the mitigation for the gap AC81 accepts: the event is still on their calendar and its 7:00am alarm will still fire, so this page is where somebody acting on that alarm learns the visit is not theirs *before* they text a customer about a job they are not going to.
    An unknown token keeps the generic answer, so AC44 still holds and live tokens cannot be enumerated.
    The **write re-asserts it too**: the PATCH filters `status=neq.retired` and treats zero returned rows as the same answer.
    The status check above it reads a snapshot, and an admin re-dispatching the window in the gap retires this row - a filter on the id alone would write `confirmed` straight back over it, which is the precise failure the `retired` status exists to prevent.
    The same shape as the escalation's claim, which re-asserts `is.null` for the same reason (AC57).

## Escalation

50. Two stages on one route: `?stage=nudge` at 21:00 UTC and `?stage=escalate` at 22:00 UTC.
51. Both always run before the 23:30 UTC customer reminder, in both DST seasons.
52. Fixed UTC times with the DST drift accepted, matching the decision already made for the 7:30pm reminder rather than introducing a second convention.
53. The query is driven off `homeowner_maintenance`, like the reminder cron - so a cancelled or completed visit, whose window is cleared, is structurally excluded rather than excluded by a rule someone has to remember.
54. Tasks sharing a window are one visit, so a three-task booking produces one message.
55. A visit is skipped **only** when an assignment reads `confirmed`.
    A `flagged` assignment does **not** count as answered: a flag says this visit has a problem, and the customer is still told at 7:30pm that we are coming, so it is the one visit that most needs chasing.
    Both stages carry the flag note in the message, so the owner sees *what* is wrong rather than only that something is.
    The note is never **traded away** for another line: it and the dispatch line are separate entries in the message, not branches of one ternary.
    They were branches, and `neverDispatched` outranked the flag - so a visit whose dispatch email went out but whose write-back failed (`recorded: 'unavailable'`) dropped the highest-signal content in the message in favour of a sentence that was itself untrue.
    The chase stops when the office clears the flag from the admin list (76-78), not when the crew taps something.
56. A stage that has already stamped its column is skipped, making a cron retry a no-op.
57. The stamp is claimed **before** the send, re-asserting `is.null`, so a concurrent run cannot double-send.
58. A failed send releases its stamp, so a manual re-hit before the customer reminder can still get through.
88. A claim that **threw** is not a claim somebody else won.
    Zero rows and no error is the lost race, and skipping is right; a PATCH that failed is a visit nobody will be told about, so it is logged, pushed into `failed`, and turns the run's `ok` false.
    Folding the two together answered `ok: true` with the visit counted under `already_chased` - silence from the last line of defence before the 7:30pm customer reminder, in the one cron nobody watches.
59. A visit with no dispatch row at all is chased *harder*, not skipped - nobody was ever told - and a row is created so the stamp has somewhere to live.
    "No dispatch was ever sent" is said only when there is **nobody it could have been sent to**.
    A row carrying live assignments but no `dispatched_at` is a send whose write-back failed, not a crew nobody told, and stating the second would send the owner chasing people who already have the visit - so that case says the visit does not *read* as dispatched, names who it went to, and says the record may simply not show it.
60. If that row cannot be created, the visit is skipped rather than messaged, so a failure cannot produce repeat sends.
61. The message names the customer, the window, the address, the services and the customer's phone number.
    It is a **pure builder** - `escalationMessage` in `src/lib/homecare/dispatchAlerts.ts` - alongside `buildDispatchEmail`, `buildDispatchCancelledEmail` and `buildIcs`, rather than assembled inline between the claim and the send.
    It carries more conditional logic than any other message here (dispatched vs never-dispatched vs write-back-failed, flag note present or not, which stage), and inline it could only be pinned by grepping route source - so the branch that distinguishes "nobody was ever told" from "the record does not show it" was asserted as a string rather than as output, which is why it went wrong once with nothing objecting.
    `flagAlertMessage` and `siblingVerdict` moved for the same reason, so both Telegram alerts can be rendered and asserted without a bot token.
62. The 6pm message says the customer is told in about 90 minutes; the 5pm one says tonight.
63. Telegram HTML is escaped, so an address containing `&` or `<` cannot break the message.
64. `?dryRun=1` reports who would be chased and stamps nothing.
    `would_chase` is pushed where a chase really happens - the dry run reporting one, or a claim that was won - and never speculatively then unwound.
    It used to be pushed before the dry-run check and `.pop()`ed back off in each of the three failure paths below it, which held only for as long as everybody remembered: one new `continue` in between leaves a phantom entry in the number read as "visits chased".
65. A run that could not do its whole job reports `ok: false` and names which part, in a `degraded` list.
    A stage that told nobody is `escalation_send_failed`.
    A read that hit its own ceiling is `visit_read_truncated`: `MAX_PER_RUN` caps **task** rows, not visits, so a busy day's last visits are simply not in the list - and reporting `visits: byVisit.size` with a clean `ok: true` is the same silence one step earlier, from the last line of defence before the 7:30pm customer reminder.
    That verdict is **exact**, and the visit at the boundary is dropped rather than chased.
    The read takes one row more than the cap, because `visits.length === MAX_PER_RUN` cannot tell a genuinely-full page from a truncated one and cried wolf on a day with exactly 200 task rows.
    Ordering by `(scheduled_start, homeowner_id)` makes the boundary a whole visit rather than an arbitrary slice of whichever visits share a start time, and that visit is dropped whole: grouped from only the task rows that fit, its message would list an incomplete services line, and stamping it claims the send-once ledger so no re-hit could ever correct it.
    An empty page after that drop still reports the truncation rather than a flat `ok: true`.

## Flagging a problem reaches somebody

66. `POST /api/crew/confirm` with `action=flag` Telegrams the operations chat **immediately**, naming who flagged it, the customer, the date and window, the address and the sub, and carrying the note verbatim.
    Everything interpolated is escaped for Telegram's HTML mode.
67. The flag is written **before** the Telegram is attempted, and a failed send is logged rather than returned as an error: the crew member's tap records either way, and the escalation still carries the flag, so a Telegram outage cannot bury the problem.
    The screen then says which of those two happened.
    The route answers `notified`, and only `sent` and `duplicate` mean somebody has the message; anything else - Telegram down, no chat configured, an answer this screen does not recognise - renders "we could NOT get the alert through to the office", with (201) 212-4917 as a tap-to-call link.
    It used to render "Flagged. The office has it." either way, off a field the route computes, logs and hands back.
    That is the worst place in the feature for it: a colleague who has already confirmed silences both chases (AC55), so with Telegram down there is no later message at all, and the person standing at the house - told the office had it - was the only one who could have closed the gap.
    No silent retry: it delays the screen and still needs this message for when the retry also fails.
    `duplicate` counts as told because it now means a previous alert for this exact note is **recorded as delivered** (AC74), not merely that a flag already existed.
    Re-opening the link later says the same thing the tap did, off that same record: the screen has no third "we never saw the outcome" state to default to, and no stamp means nobody has read it, whether it was never attempted or never landed.
    It used to default to the reassuring copy on load, so anybody re-opening the email after seeing the red "call us" screen was told the opposite.
74. Only the **transition into** a flag alerts, judged against the row as it was before the write.
    This route is public and unthrottled and the token rides in an email that can be forwarded, so alerting on every POST would let one link drive unlimited messages into the operations chat - and an honest double-tap would tell the owner the same thing twice.
    A changed note is a new thing to say, and does alert.
    The guard dedupes **delivered** alerts, not attempts: `notified_at` on the assignment is stamped only for a Telegram that genuinely returned `sent`, and a repeat tap is quiet only when it finds that stamp.
    Keyed on the flag's existence alone it short-circuited the send whether or not anybody was ever told, and the sequence that exposes it is a phone at a job site - tap one writes the flag, Telegram fails, the response is lost on a bad signal, they tap again and are told the office has it.
    Both properties hold together, which is the point: no spam from repeated taps, and no silent "the office has it" for an alert that never sent.
    The stamp belongs to the flag as it currently reads, so any tap about to attempt a fresh alert clears it first - otherwise a failed send for a changed note would inherit the old note's delivery - and a recipient put back on the visit starts with none.
    The stamp is also written back **only onto the row this request wrote**: `recordNotified` re-asserts `updated_at=eq.<the value its own PATCH set>` alongside the status, a compare-and-swap that drops the stamp rather than letting it settle on a flag it does not describe.
    Re-asserting the status alone is not enough, and the sequence that exposes it is the same phone at the same job site: tap one types "sub cancelled" and its response is lost on a bad signal, so the note field is still open and still populated; they correct it to "van broken" and tap again, that send fails, and the screen rightly says nobody was told.
    Tap one's Telegram - six seconds of timeout behind it - then returns `sent` and stamps a row now reading "van broken", so the next tap of that note is answered `duplicate` and told the office has it, for a note nobody was ever told.
    A changed note is new information and must always get through.
    The flag itself is still written before the Telegram is attempted: the notification failing must never cost us the record.
75. The alert states what the **rest of the crew** has actually said, read off the other assignments on the same dispatch: whoever has already confirmed is named, or it says plainly that nobody has.
    This matters more than it looks: the escalation skips any visit with a `confirmed` assignment, so when a colleague has already answered, this alert is the only message the owner will ever get about the problem.
    It cannot be the one that says something false.
    A read that fails says so rather than guessing either way - both of them: the sibling verdict, and the visit itself, which otherwise degraded quietly to "A customer" with no address and no services and no sign that anything had failed.

## Clearing a flag

76. Clearing a flag is an **admin** action on `POST /api/admin/service-quote/dispatch`, gated by the admin session like every other `/api/admin/*` route - never the public token endpoint, which is guarded by a link in somebody's inbox.
    It marks that visit's **flagged** assignments confirmed, which is what the escalation reads, and touches nothing else: somebody who never answered still has not answered.
    The note is kept - it is the record of what was wrong, and the visit having been sorted does not make it untrue.
77. The "On the books" list on `/vaca-mgmt/send-service-quote` shows each visit's dispatch state - awaiting, confirmed, or flagged with the note - read alongside the bookings themselves.
    This is the only surface a flag ever reaches: *clearing* one is the admin's alone (AC76), so a flagged crew screen is terminal, and without this list a flagged visit is chased at 5pm and 6pm until its window passes with no way to stop it.
    "Mark handled" is offered only where there is a flag to clear, and is confirm-gated exactly as "Mark completed" is.
78. A flag **outranks** a confirmation in that state.
    A colleague having confirmed silences both chases, which is precisely why the problem somebody raised has to stay visible somewhere else.
86. Clearing a flag reports what actually **moved**, not what the click intended.
    The route answers `nothing_to_handle` when the PATCH matched no row - the flag went in another tab, or the assignment was retired between the list being read and the button being pressed - and the toast is written from the state re-read **after** the write.
    Only a visit that now reads `confirmed` is described as one that will not be chased again: a flag cleared off a visit nobody has confirmed is still chased at 5pm and 6pm, so saying otherwise would be a promise the escalation does not keep.
95. A **re-read that failed** after that write is `unknown`, never a 500 over a write that landed.
    The flags really are cleared and the chases really have stopped by that point, so answering "Failed" told the admin the opposite - and the page throws before refreshing, leaving the stale "Flagged by ..." row and its "Mark handled" button on screen, so the visit might be called off over a problem already closed.
    The toast has its own `unknown` branch for the same reason its neighbours do: asserting "nobody on this visit has confirmed" about a state that could not be read is the same failed-read-as-a-definite-answer, just in the safe direction.
84. A dispatch read that FAILS reads as `unknown`, never as `none`, and the list says so on the visit.
    Both queries behind that state are best-effort so a lookup is still worth answering without them - but the screen renders nothing at all for a visit in state `none`, so failing open would make a flagged visit vanish from the only surface a flag reaches, taking its "Mark handled" button with it.
    Failing closed to "could not read what the crew has said" is safe; failing open to "never dispatched" is what hides a flag.
    The screen fails closed the same way: the intake read is checked for `res.ok` before anything is replaced, a failed refresh **keeps the list it had** and says the refresh failed rather than emptying the panel.
    The trap is the timing - a refresh runs straight after a cancel or a completion, where a shrinking list is what success looks like, so a blanked panel read as the write having worked.
    So does the read of the visits themselves: it stays best-effort, because the scheduling columns are hand-applied and a lookup is worth answering without them, but it now hands back `bookingsRead: 'unavailable'` rather than an empty list wearing a 200.
    And so does the **customer record** the whole panel hangs off - the visits, the crew state on them, and the buttons that complete, cancel or clear a flag all need it - so a failed read of that answers `unavailable` too rather than rendering as a customer with no record.
    A **lookup** replaces the list either way - those windows belong to a different customer, and leaving them would aim "Mark completed" at this homeowner - and says out loud that this is not "nothing booked".
102. That state is carried all the way to the screen: the "On the books" panel renders on the list having contents **or** on the list being unreadable, never on its length alone.
    Gated on length, `bookingsRead: 'unavailable'` rendered identically to a customer with nothing booked - the panel and its "Mark handled" button simply were not there - and the only signal was a toast that fades.
    The panel therefore says, persistently, that the visits could NOT be read and that this is not "nothing on the books", and marks a list kept through a failed refresh as being of unknown age rather than showing it as current.
    That line is gated on nothing but the state it describes. The two warnings written for the same failure - `sq-tasks-unread` and `sq-sub-unread` - are about a named window and only speak once a date and a From time pick one out, which a fresh lookup has not done; a third warning with a gate of its own would have left the same hole.
103. Every other panel on that screen follows the same rule, because a panel gated purely on the length of a list that can also fail to load has exactly this shape.
    The **customer record** answers `homeownerRead`, because `homeowner: null` is also what a walk-in reads as: a failed read draws a blank name and address for a customer we have on file and greys out completing, cancelling and clearing a flag, with nothing on screen saying why.
    Their **past requests** answer `requestsRead`, because an empty list reads as "they have never asked us for anything" - and the scope sentence the quote mails and the services it is ticked for are both pre-filled from it.
    What they have had **done** answers `historyRead`, because an empty history prints "no record" against every service on the page, which is a definite claim about completions nobody read, and "you last had this done 14 months ago" is the line the quote is argued from. Those rows read "not read" instead.
    Each is reported by the intake route as its own verdict rather than folded into a neighbour's, and each is stated on the screen where it is acted on.
    That rule is spelled **once** on the route, as `readOrNull(what, read)`: hand back `null` when a read failed, never the empty answer, and say which read it was on the way past.
    Four hand-written copies of it had nothing to object with when a fifth read swallowed itself to `[]`, and this is the rule the whole answer turns on.
104. A lookup that **failed** takes the previous customer off the screen, exactly as one that succeeded does.
    Both paths go through one `clearCustomer`, because the reset used to live inline on the success path only - every setter inside the `try`, above the throw.
    So a failed lookup left the last customer's `homeownerId` live under an email box showing somebody else's address, and "Mark completed", "Cancel visit" and "Mark handled" are gated on that id, not on the box: all three stayed enabled and fired against **their** visit.
    Their visits stayed listed too, relabelled by the round-102 panel as this customer's "list of unknown age".
    That is the same one-customer's-work-on-another's mix-up the success-path reset was written to stop, arriving through the other door.
    What is deliberately kept is what the admin typed and no lookup fills - the CC line, the note, the estimate URL, the window - none of which names a customer or aims an action at one.
    The failure toast says the screen has been cleared rather than that nothing on it changed.
105. `sq-homeowner-unread` reads its claim about those buttons off the **same value that gates them**, rather than asserting it alongside.
    Stated flatly, "nothing below can be marked completed, cancelled or handled" was false wherever an id survived that state - the failed lookup above, and a booking made after a failed record read, which still hands back a real id - and a banner promising a safety the screen does not have is worse than no banner.
106. The refresh re-reads the customer **on screen**, never whatever the lookup box holds, and a refresh that cannot run is a failed read rather than a silent no-op.
    `refreshBookings` read by the box, which is free text bound to nothing below it, while `cancel`, `complete` and `markHandled` all fire against `homeownerId` and then toast success.
    That mismatch had two silent answers in it: **emptied**, the refresh returned without reading at all, so "Visit cancelled - off the books, and the reminder is pulled" appeared beside the visit still listed as booked with no unread marker anywhere; **retyped**, it replaced the panel with somebody else's visits under this customer's id, with nothing on screen marking the swap.
    So the address the customer was loaded with is recorded when they are loaded - by a lookup, or by the booking that creates a walk-in - and cleared with them, and the refresh reads by that.
    It is a ref rather than state because `schedule` books and refreshes inside one handler, where a setter's value would not be visible to the call it makes.
    With nobody loaded there is nobody to re-read, and that fails down the same path as any other unreadable answer: one exit, so a path added later cannot skip the verdict.
107. **"Send quote" and "Schedule visit" act on the customer who was loaded**, never on the free-text lookup box beside them.
    The last door left open on AC101, and it needs no second lookup to walk through - only a box retyped and left, which is what a half-finished second lookup looks like.
    Only the *identity* came from the box; the name, the address, the phone and the ticked services all belonged to whoever was loaded, so acting there split one action between two people.
    This one corrupts rather than merely displays: `ensureServiceHomeowner` writes the loaded customer's phone and address onto the **typed** customer's record, `scheduleVisit` books the loaded customer's services at their address under the typed one, the crew are mailed one name for the other's homeowner, and the typed customer's 7:30pm reminder lists services they never asked for. "Send quote" mails them a scope sentence written for somebody else.
    So one `actionCustomer()` answers "who is this for?" for both handlers, and a disagreement is a state to **resolve**, never to split: both buttons are switched off, both handlers refuse before they write, and a line on screen names the two people the screen is holding rather than only saying something is wrong.
    A walk-in is not that state - with nobody loaded, every field on the card was typed here and the box is the only identity there is - and the comparison is case-insensitive, because an address is.
    There are two refusals rather than one, because "the box names somebody else" and "there is nobody here yet" are different states, and a refusal describing the wrong one is the same defect as a banner asserting a safety the screen does not have (AC105).
    `cancel`, `complete` and `markHandled` already fire against `homeownerId` and are unaffected; the line says so, because those visits do still belong to the loaded customer.
109. The three row actions share **one** busy state and **one** disabled condition.
    `completing`, `cancelling` and `handling` were three `useState<string | null>` holding the same fact - which row is mid-write - mutually exclusive by construction, with `completing !== null || cancelling !== null || handling !== null || !homeownerId` written out at all three buttons.
    A fourth action meant four edits, and forgetting one leaves a button live during another action's write.
    So `rowBusy: { action, start } | null` holds it, `rowLocked` is spelled once, and `runRowAction` spells the prelude and epilogue all three share: the customer this page holds, the question asked before the write, the lock, and the failure toast.
    The per-action success toasts stay where they are - they are deliberate, and each says something different.
110. **Nothing promises a chase that cannot run.** Every "5pm and 6pm will pick this up" is conditioned on `chasesAhead`, which is the one place that question is answered.
    The flag alert closed with "5pm and 6pm will chase it" whenever no colleague had confirmed, and the escalation only ever reads **tomorrow's** window (`tomorrowEasternWindow`) and skips a stage already stamped (AC56).
    So the promise was false in exactly the two most urgent cases: a visit **today**, which is what re-flagging after a confirmation exists for (AC108) and is structurally out of the cron's scope, and a visit tomorrow flagged after both stages have run.
    In both, that Telegram is the only message the owner will ever get about the problem, and it ended by telling them another one was coming - the same failure-reads-as-success shape, in the message that replaces the chase.
    Extending the cron to cover today would be the wrong fix on the merits: the 5pm/6pm stages exist to catch an unconfirmed visit *before* the customer is told at 7:30pm the night before, and for a same-day flag the customer has already been told. The immediate alert is the mechanism, and it has fired. What was broken is the sentence.
    `chasesAhead` answers it exactly, from the visit's own start and the two stamps on its dispatch row: each stage is ahead only while its stamp is unclaimed **and** its run has not yet fired for that visit.
    The run instants come from the fixed-UTC convention the schedule already uses (21:00, 22:00, 23:30), so no second copy of the timetable can drift from `vercel.json`.
    A released stamp - a send that failed and put its claim back (AC58) - reads as spent, and correctly: only a manual re-hit can use it, and no scheduled run looks at that visit again.
    The same rule conditions the "5pm and 6pm will keep chasing it" the admin is told when a flag is cleared (AC86), which is the one screen a flag can be acted on from.
    What that alert says about the CUSTOMER is a separate question with a separate source - see AC115 - because the clock cannot answer it.
111. **The crew screen promises nothing that has already happened.** Every forward-looking sentence on it is conditioned on the visit's own date.
    "The customer is told at 7:30pm tonight" and "you will get a reminder at 7:00am" were both stated unconditionally, and both are true only for a visit *tomorrow*.
    The person AC108 was written for - re-opening the link on the **morning** of the visit because the sub fell through - is precisely the one being told a deadline was still ahead when the customer had been told the night before and the 7:00am alarm had already fired. A promise about something that cannot happen reads as reassurance, on the one screen whose job is to make somebody ring the office.
    The verdict is computed once on the server, from the reminder ledger (AC115) and `morningAlarmAhead`, and handed to both the flag panels and the footer, so the two cannot drift.
    `morningAlarmAhead` goes through the same `easternWallClock(easternDay(start), 7, 0)` that `buildIcs` sets the alarm with, so the screen cannot promise a reminder the invite does not carry; the reminder clause names its date through `customerReminderWhen`, the same helper the dispatch email uses, rather than keeping a second copy of "tonight" here.
112. **A lookup already running cannot be overtaken.** The Enter key on the box is gated on `loading` exactly as the "Look up" button is.
    The button was disabled and the key was not, and no response was matched to its request - so a lookup for A that **failed** after a lookup for B had already loaded ran the reset and wiped B off the screen, toasting "Whoever was on screen has been cleared off it" about a customer who had just loaded correctly.
    The identity outcome was already safe (each closure carries its own address, and `splitIdentity` catches a mismatch); the verdict was not, which is the half this fixes.
    Behind the gate, each lookup takes a ticket and only the latest may say anything - including switching the spinner off - so a response that is no longer the one being waited on is dropped whole rather than half-applied, and a path added later cannot reopen the race.
113. **A chase still to come is named by the stages that are actually left**, never by the fixed phrase "5pm and 6pm".
    `chasesAhead` already answers which stages survive (AC110); `chaseStageLabel` renders that answer, and every sentence naming a time goes through it - the Telegram alert's `chaseSentence`, and the question and the toast on the admin flag list.
    The moment that distinction bites is the likeliest one this button is ever pressed in: the owner receives the 5pm Telegram, opens the list at 5:30pm and clears the flag. The nudge has fired and only the escalation remains, so "5pm and 6pm will keep chasing it" names a chase that already ran as one still to come.
    `chaseSentence` moved to `visitSchedule.ts` to be shared, which also keeps `escapeTelegram` out of a client bundle - it sits beside `chasesAhead`, the only thing that knows the answer.
    The verdict is re-read **after** the write as well as before the question: the round trip can cross 5pm.
    The sentence crediting a colleague's confirmation with the silence goes through the same label: it read "so the 5pm and 6pm chases stay quiet" whatever was actually left, so in the case a re-flag exists for - the visit is today, and both stages went last night - it attributed to that confirmation a silence nothing was ever going to break.
114. **The dispatch email states its deadlines off the visit's own date, and only when they exist.**
    It hard-coded "the customer gets their reminder at 7:30pm **tonight** either way" and "one at 7:30pm tonight to confirm, and one at 7:00am **tomorrow** to text {customer}". Both are true for a visit booked for tomorrow and no other, and a dispatch goes out the *moment* a visit is booked - routinely days or weeks ahead. Booking a 20 August visit on 1 August told the crew that a deadline nearly three weeks away was tonight, and an alarm nearly three weeks away was tomorrow morning. The `.ics` in the same email sets both alarms off the visit's own date, so the body contradicted its own attachment.
    The wording is now derived, not softened: `customerReminderWhen` and `morningAlarmWhen` say "at 7:30pm tonight" for a visit tomorrow and "at 7:30pm on Tue 4 Aug" otherwise, because the crew need to know *when* and a vague sentence is no more use than a wrong one.
    The worse half was the reminder itself. `requeueVisitReminder` answers `skipped` when the covering run has already fired and `unavailable` when the queue write failed, and the booking route holds that verdict at the line **above** the one that sends the dispatch - yet the email asserted flatly that the customer gets their reminder. The verdict is now carried into `buildDispatchEmail`, and only `queued` earns the promise; the other two say no automatic reminder is going out and to text the customer directly. Same shape as `notified` in the flag screen (AC70): the information existed in the same request and was thrown away at the last step.
    An alarm that has already fired is never described as coming. Both are absolute instants on the visit's own dates, so a same-day booking arrives after one or both have passed, and the copy drops to what is left - or to "text them yourself before you go" when neither is.
    The HTML and the text part render the **same two strings**, built once. They carried the same claims in two places, which is a second bug waiting: a text part that drifts tells half the crew something the other half was never told.
    The invite's own 7:30pm alarm carried the same defect - "Confirm tomorrow's visit for {customer}. The customer reminder email has gone out." - and now takes `customerReminded`, which fails **closed**: unset, the alarm says nothing about the customer rather than asserting they were told. Both internal callers pass the real verdict, the crew invite from the send and the owner's own file through a `reminded` flag on its download link.
    The **retraction** was swept for the same shape and had one. A retraction goes out for any window whose START is still ahead (AC72), which includes the morning **of** the visit - and by then the 7:00am "text the customer when the crew is on the way" alarm has fired. "Do not text {customer} about it" is then advice about something already done, and "delete the event so its 7:00am reminder cannot fire" is about an alarm that has. In that window the email now says the reminder has already gone off and to tell the customer the visit is off, which is the thing that actually matters there and was missing entirely.
115. **"Has the customer been told?" is read, never inferred from the clock.** The reminder ledger answers it, and the three surfaces that outlive the send ask it rather than each working one out.
    AC114 gave `buildDispatchEmail` and `buildIcs` the booking's own `requeueVisitReminder` verdict, but that verdict lives only for the length of that request - and the crew confirm page, the flag alert and the 5pm/6pm chase all derived the same fact from the time of day afterwards.
    The clock knows when a reminder *would* go, not whether one exists, and the two disagree in an ordinary case: a **same-day booking** is past the covering run, so `requeueVisitReminder` answers `skipped` and no `follow_up_queue` row is ever written.
    The dispatch email then correctly said "No automatic reminder is going out to the customer for this visit - text {customer} yourself", and the confirm page it links to said the opposite - "the customer has ALREADY been told we are coming" - with the flag alert telling the owner the same.
    A crew member deciding whether to phone the customer reads that line.
    So `customerReminderState` reads the rows, matched on the same (address, visit start) pair the reminder cron matches its own ledger on and through the same `ledgerVerdict` - and it answers what that cron will actually do, because that cron is the thing that does or does not send.
    A delivered row is `told`.
    Rows the cron skips - all cancelled, `ledgerVerdict`'s `closed` - are `none`: somebody pulled that reminder deliberately.
    Everything left is a visit it will send for, and that includes **no row at all**: finding none, the cron backfills a fresh row and mails the customer.
    Either way it is `coming` only while a run that can carry it is still ahead, and `none` past that, because no later run ever looks at that visit again.
    Mapping an empty ledger to `none` was a defect this criterion introduced and then had to correct.
    `unavailable` at booking - the queue insert failed - leaves no row behind, and the three surfaces then said "nobody is telling them we are coming" about a visit the cron announces ninety minutes after the 5pm/6pm chase names it, dropping the 7:30pm deadline that gives both stages their urgency.
    A state machine written over the ledger has to say what the reader of that ledger does with it, not what its rows look like.
    A read that FAILED is `unavailable`, and is never folded into one of the other three: "we could not look" is not "nobody is telling them", and this reaches the one screen whose job is to make somebody pick up the phone.
    Each surface states that verdict in its own register.
    The crew screen names the reminder's date through `customerReminderWhen` when one is coming, and says plainly that nobody has told them when none is.
    The flag alert says the same to the owner, including that it could not find out.
    The chase drops its "the customer is told at 7:30pm tonight" deadline for a visit that has none, because a chase naming a deadline nothing will keep reads as a safety net for the one visit that has no safety net at all.
    Same shape as `notified` in AC67 and the reminder verdict in AC114: the information existed and was thrown away one step later.

## Retiring a visit

68. Retiring a **cancelled** visit mails everyone who received the invite a `METHOD:CANCEL` `.ics` - on cancel, and for a window a reschedule moved off.
    Deleting the row does nothing to the event already on somebody's phone, and that event carries the 7:00am "text the customer when the crew is on the way" alarm - the only thing in the system that produces that text.
    A **completed** visit clears its row the same way but retracts nothing: the job happened, and telling the crew "this visit is off, you are not going" about work they have just finished would be a lie.
69. The retraction carries the **same UID** as the invite it withdraws, reconstructed from the dispatch row and the recipient, with a **higher `SEQUENCE`**.
    A different UID files a second, cancelled event and leaves the live one alone; an equal SEQUENCE can be discarded as a duplicate.
70. A retraction carries **no `VALARM`**. Retracting a visit must never deliver the alarm that tells somebody to text the customer about it.
71. The recipients are read **before** the dispatch row is deleted - the assignments cascade with it, taking the addresses and the UIDs - and the visit is described from a read taken **before** the window was cleared, because an unbooked window no longer knows its services.
    They are read **only when a retraction is owed**: a completion retracts nothing, and neither does a dispatch that never sent or a window already past, so reading their recipients would be a round trip per window for a value that is then discarded.
72. Only a dispatch that actually sent, for a window **still ahead**, is retracted.
    A cancellation for an invite nobody received is noise on the one channel the crew has to keep trusting, and so is one for a window already past - it has no 7:00am alarm left to fire.
    Re-booking a service into a later window in the same season puts exactly such a window through here, so the cutoff is the same one `crossSeasonBookings` applies, and it is injectable so it can be tested rather than only observed in production.
    The row still comes off either way: a stale row is what makes the next booking of that window inherit the stamps saying it has already been chased.
    What did go out is auditable: the retraction logs under its own `crew_dispatch_cancelled` category, which the admin email log can filter for and labels in full.
79. Whether the retraction actually **reached each recipient** is reported, never assumed.
    A per-recipient failure is collected rather than only logged, a throw is treated as nobody having been told, and both callers surface it - the cancel in its response and the admin toast, the reschedule in `stillHolding` on the schedule response.
    A retraction that silently failed leaves the crew holding the visit and its 7:00am "text the customer" alarm, which is the precise outcome the retraction exists to prevent, so it must never be reported as clean.
83. `clearVisitDispatch` returns **two independent verdicts** - `status`, whether the row came off, and `retraction`, whether the crew was told - and **all three** callers surface both.
    `status: 'unavailable'` is the worse of the two and used to be the silent one: the catch returns before the cancellation is even attempted, so an empty `unretracted` alongside it means nobody was told rather than everybody was, and the surviving row makes the next booking of that window inherit the stamps saying it has already been chased.
    So the cancel toast says the crew record could not be cleared and is destructive, the schedule response carries `unretiredWindows` next to `stillHolding` and the toast names it, and the complete toast reads the `dispatch` the route has always returned.
    "Reported, never assumed" is not satisfied by reporting only the half that happens to be readable.
80. A visit with no stored `scheduled_end` resolves through `visitEndsAt`, never a fallback spelled out again.
    That helper says two hours; an hour written out here made the 5pm Telegram and the crew's confirm page describe one visit as "8:00 - 10:00am" and "8:00 - 9:00am", and the CANCEL `.ics` inherited the shorter one.
    The retraction now takes the window straight off the visit it was handed rather than working one out for itself, so there is only ever the one fallback to keep right.
94. A retraction that cannot **name** what it is retracting is not sent at all, and says so.
    Every visit read in this feature goes through one `readVisitContext`, which reports `ok`, `none` or `unavailable` instead of throwing - so a read that FAILED can no longer arrive as the same null an empty answer produces, and both callers hand that verdict down rather than its value.
    Without it a cancellation went out built entirely from defaults: "the customer", a blank address, no work, and a subject trailing off after the dash - a `[CANCELLED]` the crew cannot tie to any job - and it was reported as `sent`.
    So `sendDispatchRetraction` requires a real visit, the outcome `unavailable` is told apart from a send that was attempted and failed, everybody is listed as still holding it, and the toast tells the admin to call them.

## Row-level security

73. `dispatch_recipients`, `visit_dispatch` and `visit_dispatch_recipients` all have RLS enabled with no policy, the same as every other table in this schema.
    Supabase grants `anon` and `authenticated` full privileges on `public` tables at bootstrap, and the publishable key ships to the browser - so without RLS, `visit_dispatch_recipients` hands out every live confirm token to anyone who asks for it.

## What was deliberately not built

- **No Gmail API.** Nothing reads a mailbox, and no crew reply is parsed - a one-tap link records a precise timestamp where parsing "yeah we're good" would guess.
- **No automated "on our way" customer email.** The 7:00am alarm prompts a person to send the text we promised in writing.
- **No SMS.** Unchanged from the service-quote slice.
- **No subcontractor table.** The sub is free text on the visit until it earns more.
- **No rate limit on `POST /api/crew/confirm`.** This is a deliberate owner decision taken on 1 August 2026, not an oversight, and it is the one place this feature departs from a repo-wide convention - so do not "fix" it by accident.
  Every other entry in `PUBLIC_ROUTES` self-guards with `checkRateLimit`/`getClientIp` from `src/lib/rateLimit.ts`, and the middleware annotates them as "rate-limited, self-guarded"; this route does not.
  Rate limiting was not part of the requested design, and the confirm token is 32 random bytes, so guessing one is not a realistic attack.
  The accepted consequence is that an unauthenticated caller who repeats a POST makes the route do a few Supabase reads - `lookupByToken` plus `readVisitContext` - before the token can be rejected.
  What that decision does **not** cover is the alert volume, and that is guarded separately: AC74's transition guard means only a genuine change of state Telegrams the chat at all.
- **No per-person Telegram.** A bot cannot message someone who has never messaged it first, so per-person alerts would silently reach nobody. Both stages go to the existing owner chat. The recipient row is where a `chat_id` would go if that changes.
