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

## Booking

33. The dispatch runs **after** the booking is written, and never throws: a booking that succeeded is never reported as failed because the dispatch could not go out.
34. The schedule response reports the dispatch outcome and the addresses it reached.
35. The admin toast reports the reminder and the dispatch as two separate outcomes, and is destructive if either failed.
36. `no_recipients` is reported distinctly, because "nobody is configured" and "the send failed" need different fixes.
37. Re-dispatching a visit reuses its `visit_dispatch` row, so escalation stamps and existing confirmations survive.
38. Re-dispatching reuses each recipient's existing assignment row and token, so a re-send never silently un-confirms a visit the crew already signed off.
39. `dispatched_at` is stamped only when at least one email actually landed.
40. Cancelling a visit deletes its dispatch row, so re-booking that window later does not inherit `nudged_at` and go unchased.
    So does **completing** one, and so does a **reschedule** for the window it moved off - all three retire the same way, because all three leave the same stale row behind.

## Confirming

41. `GET /crew/confirm/<token>` **mutates nothing.** Mail scanners and link-preview bots fetch every URL in an inbox; a GET that confirmed would mark visits confirmed that no human has looked at, and the escalation would then stay silent for exactly the visits it exists to catch.
42. The mutation is `POST /api/crew/confirm` only.
43. The page is `noindex`, since the token is the only credential.
44. An unknown token and a malformed token get the same answer, so live tokens cannot be enumerated.
45. A token whose visit has been cancelled or closed out shows "no longer on the books" instead of a confirm button.
46. "Something is wrong" opens a note field rather than submitting immediately - what they type is the whole value of the button.
47. A flag records the note; a confirm clears it.
48. Both a confirm and a flag stamp `confirmed_at`, because both mean a human has *looked* at this - which is not the same as the visit being dealt with.
49. `/api/crew/` is public in middleware, guarded by the token rather than a session.
    A server error on this public route answers a flat `server_error`; the thrown detail - table names, the token filter, PostgREST's own error body - stays in the logs.

## Escalation

50. Two stages on one route: `?stage=nudge` at 21:00 UTC and `?stage=escalate` at 22:00 UTC.
51. Both always run before the 23:30 UTC customer reminder, in both DST seasons.
52. Fixed UTC times with the DST drift accepted, matching the decision already made for the 7:30pm reminder rather than introducing a second convention.
53. The query is driven off `homeowner_maintenance`, like the reminder cron - so a cancelled or completed visit, whose window is cleared, is structurally excluded rather than excluded by a rule someone has to remember.
54. Tasks sharing a window are one visit, so a three-task booking produces one message.
55. A visit is skipped **only** when an assignment reads `confirmed`.
    A `flagged` assignment does **not** count as answered: a flag says this visit has a problem, and the customer is still told at 7:30pm that we are coming, so it is the one visit that most needs chasing.
    Both stages carry the flag note in the message, so the owner sees *what* is wrong rather than only that something is.
56. A stage that has already stamped its column is skipped, making a cron retry a no-op.
57. The stamp is claimed **before** the send, re-asserting `is.null`, so a concurrent run cannot double-send.
58. A failed send releases its stamp, so a manual re-hit before the customer reminder can still get through.
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

## Retiring a visit

68. Retiring a **cancelled** visit mails everyone who received the invite a `METHOD:CANCEL` `.ics` - on cancel, and for a window a reschedule moved off.
    Deleting the row does nothing to the event already on somebody's phone, and that event carries the 7:00am "text the customer when the crew is on the way" alarm - the only thing in the system that produces that text.
    A **completed** visit clears its row the same way but retracts nothing: the job happened, and telling the crew "this visit is off, you are not going" about work they have just finished would be a lie.
69. The retraction carries the **same UID** as the invite it withdraws, reconstructed from the dispatch row and the recipient, with a **higher `SEQUENCE`**.
    A different UID files a second, cancelled event and leaves the live one alone; an equal SEQUENCE can be discarded as a duplicate.
70. A retraction carries **no `VALARM`**. Retracting a visit must never deliver the alarm that tells somebody to text the customer about it.
71. The recipients are read **before** the dispatch row is deleted - the assignments cascade with it, taking the addresses and the UIDs - and the visit is described from a read taken **before** the window was cleared, because an unbooked window no longer knows its services.
72. Only a dispatch that actually sent is retracted. A cancellation for an invite nobody received is noise on the one channel the crew has to keep trusting.

## Row-level security

73. `dispatch_recipients`, `visit_dispatch` and `visit_dispatch_recipients` all have RLS enabled with no policy, the same as every other table in this schema.
    Supabase grants `anon` and `authenticated` full privileges on `public` tables at bootstrap, and the publishable key ships to the browser - so without RLS, `visit_dispatch_recipients` hands out every live confirm token to anyone who asks for it.

## What was deliberately not built

- **No Gmail API.** Nothing reads a mailbox, and no crew reply is parsed - a one-tap link records a precise timestamp where parsing "yeah we're good" would guess.
- **No automated "on our way" customer email.** The 7:00am alarm prompts a person to send the text we promised in writing.
- **No SMS.** Unchanged from the service-quote slice.
- **No subcontractor table.** The sub is free text on the visit until it earns more.
- **No per-person Telegram.** A bot cannot message someone who has never messaged it first, so per-person alerts would silently reach nobody. Both stages go to the existing owner chat. The recipient row is where a `chat_id` would go if that changes.
