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
14. Caps are confined to the prefix; the rest of the subject is sentence case.
15. The body names the customer, the address, the services and - when given - the sub.
16. The body says the customer is told at 7:30pm whether or not this is confirmed.
17. The body explains what the attachment is for, including the 7:00am text reminder.
18. The email carries **no unsubscribe link and no postal address**: it is internal operational mail to staff, not a commercial message, and a "stop receiving these" link on the email that says where to be tomorrow would be a way to break the schedule.
19. Every customer-facing Home Care email still carries both - this changes nothing there.
20. The send passes **no `preferenceStream`**, so a marketing opt-out can never suppress a dispatch.
21. One email per recipient, never one email to several: the confirm link identifies the person, so a shared message would record the wrong one as having confirmed.
22. The `.ics` rides as an attachment named `visit.ics`.

## Attachments in the send chokepoint

23. `sendTrackedEmail` accepts `attachments` and base64-encodes the content, because that is the only shape Resend's JSON API takes.
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
90. A sub the row would **not store** is reported, not just logged, and the send reports `sent_degraded` rather than a clean `sent`.
    The email is right either way - it is built from the value handed back, never re-read - so the divergence between what was mailed and what is stored is invisible from everywhere else: the confirm page silently drops its "Sub" row and its button reverts from "Confirm - sub is booked" to "Confirm - I am on this", and a later flag alert about the visit cannot name who was booked for it.
    The admin toast is the only place that is ever said, so it names the sub and tells them to re-save.
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
49. `/api/crew/` is public in middleware, guarded by the token rather than a session.
    A server error on this public route answers a flat `server_error`; the thrown detail - table names, the token filter, PostgREST's own error body - stays in the logs.
82. A **retired** token gets its own answer - "You are no longer on this visit", with "please don't text the customer about it" - never the generic "this link is not valid", and `POST /api/crew/confirm` refuses it with `410`.
    This is the mitigation for the gap AC81 accepts: the event is still on their calendar and its 7:00am alarm will still fire, so this page is where somebody acting on that alarm learns the visit is not theirs *before* they text a customer about a job they are not going to.
    An unknown token keeps the generic answer, so AC44 still holds and live tokens cannot be enumerated.

## Escalation

50. Two stages on one route: `?stage=nudge` at 21:00 UTC and `?stage=escalate` at 22:00 UTC.
51. Both always run before the 23:30 UTC customer reminder, in both DST seasons.
52. Fixed UTC times with the DST drift accepted, matching the decision already made for the 7:30pm reminder rather than introducing a second convention.
53. The query is driven off `homeowner_maintenance`, like the reminder cron - so a cancelled or completed visit, whose window is cleared, is structurally excluded rather than excluded by a rule someone has to remember.
54. Tasks sharing a window are one visit, so a three-task booking produces one message.
55. A visit is skipped **only** when an assignment reads `confirmed`.
    A `flagged` assignment does **not** count as answered: a flag says this visit has a problem, and the customer is still told at 7:30pm that we are coming, so it is the one visit that most needs chasing.
    Both stages carry the flag note in the message, so the owner sees *what* is wrong rather than only that something is.
    The chase stops when the office clears the flag from the admin list (76-78), not when the crew taps something.
56. A stage that has already stamped its column is skipped, making a cron retry a no-op.
57. The stamp is claimed **before** the send, re-asserting `is.null`, so a concurrent run cannot double-send.
58. A failed send releases its stamp, so a manual re-hit before the customer reminder can still get through.
88. A claim that **threw** is not a claim somebody else won.
    Zero rows and no error is the lost race, and skipping is right; a PATCH that failed is a visit nobody will be told about, so it is logged, pushed into `failed`, and turns the run's `ok` false.
    Folding the two together answered `ok: true` with the visit counted under `already_chased` - silence from the last line of defence before the 7:30pm customer reminder, in the one cron nobody watches.
59. A visit with no dispatch row at all is chased *harder*, not skipped - nobody was ever told - and a row is created so the stamp has somewhere to live.
60. If that row cannot be created, the visit is skipped rather than messaged, so a failure cannot produce repeat sends.
61. The message names the customer, the window, the address, the services and the customer's phone number.
62. The 6pm message says the customer is told in about 90 minutes; the 5pm one says tonight.
63. Telegram HTML is escaped, so an address containing `&` or `<` cannot break the message.
64. `?dryRun=1` reports who would be chased and stamps nothing.
65. A run that could not deliver reports `ok: false` with `degraded: 'escalation_send_failed'`.

## Flagging a problem reaches somebody

66. `POST /api/crew/confirm` with `action=flag` Telegrams the operations chat **immediately**, naming who flagged it, the customer, the date and window, the address and the sub, and carrying the note verbatim.
    Everything interpolated is escaped for Telegram's HTML mode.
67. The flag is written **before** the Telegram is attempted, and a failed send is logged rather than returned as an error: the crew member's tap records either way, and the escalation still carries the flag, so a Telegram outage cannot bury the problem.
74. Only the **transition into** a flag alerts, judged against the row as it was before the write.
    This route is public and unthrottled and the token rides in an email that can be forwarded, so alerting on every POST would let one link drive unlimited messages into the operations chat - and an honest double-tap would tell the owner the same thing twice.
    A changed note is a new thing to say, and does alert.
75. The alert states what the **rest of the crew** has actually said, read off the other assignments on the same dispatch: whoever has already confirmed is named, or it says plainly that nobody has.
    This matters more than it looks: the escalation skips any visit with a `confirmed` assignment, so when a colleague has already answered, this alert is the only message the owner will ever get about the problem.
    It cannot be the one that says something false.
    A read that fails says so rather than guessing either way - both of them: the sibling verdict, and the visit itself, which otherwise degraded quietly to "A customer" with no address and no services and no sign that anything had failed.

## Clearing a flag

76. Clearing a flag is an **admin** action on `POST /api/admin/service-quote/dispatch`, gated by the admin session like every other `/api/admin/*` route - never the public token endpoint, which is guarded by a link in somebody's inbox.
    It marks that visit's **flagged** assignments confirmed, which is what the escalation reads, and touches nothing else: somebody who never answered still has not answered.
    The note is kept - it is the record of what was wrong, and the visit having been sorted does not make it untrue.
77. The "On the books" list on `/vaca-mgmt/send-service-quote` shows each visit's dispatch state - awaiting, confirmed, or flagged with the note - read alongside the bookings themselves.
    This is the only surface a flag ever reaches: the crew screen is terminal by design, and without it a flagged visit is chased at 5pm and 6pm until its window passes with no way to stop it.
    "Mark handled" is offered only where there is a flag to clear, and is confirm-gated exactly as "Mark completed" is.
78. A flag **outranks** a confirmation in that state.
    A colleague having confirmed silences both chases, which is precisely why the problem somebody raised has to stay visible somewhere else.
86. Clearing a flag reports what actually **moved**, not what the click intended.
    The route answers `nothing_to_handle` when the PATCH matched no row - the flag went in another tab, or the assignment was retired between the list being read and the button being pressed - and the toast is written from the state re-read **after** the write.
    Only a visit that now reads `confirmed` is described as one that will not be chased again: a flag cleared off a visit nobody has confirmed is still chased at 5pm and 6pm, so saying otherwise would be a promise the escalation does not keep.
84. A dispatch read that FAILS reads as `unknown`, never as `none`, and the list says so on the visit.
    Both queries behind that state are best-effort so a lookup is still worth answering without them - but the screen renders nothing at all for a visit in state `none`, so failing open would make a flagged visit vanish from the only surface a flag reaches, taking its "Mark handled" button with it.
    Failing closed to "could not read what the crew has said" is safe; failing open to "never dispatched" is what hides a flag.
    The screen fails closed the same way: the intake read is checked for `res.ok` before anything is replaced, a failed refresh **keeps the list it had** and says the refresh failed rather than emptying the panel.
    The trap is the timing - a refresh runs straight after a cancel or a completion, where a shrinking list is what success looks like, so a blanked panel read as the write having worked.
    So does the read of the visits themselves: it stays best-effort, because the scheduling columns are hand-applied and a lookup is worth answering without them, but it now hands back `bookingsRead: 'unavailable'` rather than an empty list wearing a 200.
    A **lookup** replaces the list either way - those windows belong to a different customer, and leaving them would aim "Mark completed" at this homeowner - and says out loud that this is not "nothing booked".

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

## Row-level security

73. `dispatch_recipients`, `visit_dispatch` and `visit_dispatch_recipients` all have RLS enabled with no policy, the same as every other table in this schema.
    Supabase grants `anon` and `authenticated` full privileges on `public` tables at bootstrap, and the publishable key ships to the browser - so without RLS, `visit_dispatch_recipients` hands out every live confirm token to anyone who asks for it.

## What was deliberately not built

- **No Gmail API.** Nothing reads a mailbox, and no crew reply is parsed - a one-tap link records a precise timestamp where parsing "yeah we're good" would guess.
- **No automated "on our way" customer email.** The 7:00am alarm prompts a person to send the text we promised in writing.
- **No SMS.** Unchanged from the service-quote slice.
- **No subcontractor table.** The sub is free text on the visit until it earns more.
- **No per-person Telegram.** A bot cannot message someone who has never messaged it first, so per-person alerts would silently reach nobody. Both stages go to the existing owner chat. The recipient row is where a `chat_id` would go if that changes.
