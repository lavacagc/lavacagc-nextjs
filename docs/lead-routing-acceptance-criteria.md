# Lead scoring and routing - acceptance criteria

Slice B of the website spec (`02-website-nextjs.md`), covering WEB-019, WEB-01A and WEB-01B.
Depends on slice A, which captures the answers this scores.

## The problem this solves

`scoreLead()` runs at form-submit time and is dominated by project type, which contributes 50 to 95 of the points against an 80-point "hot" threshold.
Measured against the live weights: a bathroom lead from **Princeton**, outside the service area, with no phone number, scores **105 and buckets hot**.
Almost every lead is hot, so the tier cannot route anything.

Adding the spec's missing signals to that engine would make it worse, not better - more points, same saturated threshold.

## The shape instead

Two scores, at two moments, for two purposes.

| | When | Signals | Purpose |
|---|---|---|---|
| `score` / `tier` | Form submit | project type, contact completeness, source, budget hints | Unchanged. Triage on what little we know. |
| `intake_score` / `intake_bucket` | Intake completed | the spec's four, plus the price reaction | Routing. |

This is what WEB-019 actually describes: "every **completed chat** produces a hot or cold bucket".
The signals it lists are mostly unknown at submit time, and only exist once the lead has answered.

Honouring decision D3: the three-tier `tier` column keeps its meaning and no historical lead changes, while the routing bucket is two-valued.

## AC1 - The four signals the spec names

`scoreIntake()` reads exactly these, and each contributes a recorded reason:

- **Town** - in the service area or not, via the same `cityInServiceArea` predicate the flow and the scorer already share.
- **Scope tier** - `full_gut` > `major_update` > `refresh`. A lead who described it themselves scores neutral, not zero: they told us more, not less.
- **Timeline** - `asap` and `1_3_months` are the money; `planning` is not.
- **Photos** - supplied or not.
  A count that could not be read is neither: the read is retried once, and if it still fails it scores nothing and is recorded as "photo count unavailable", because writing "No photos" onto the lead on the strength of a Supabase blip is a permanent false statement.
  Where that missing count would have decided the bucket - the score is under the threshold but within the photo weighting of it - the lead is routed **hot** and the record says so.
  The two errors do not cost the same: a wrongly hot lead costs one phone call, a wrongly cold one is lost.
  The count is never invented, so the score stands as scored.
  `photoCount` is a required input, and only `null` earns the unavailable signal and the benefit of the doubt: "not supplied" must not be able to become "we could not tell" by omission.

## AC2 - The fifth signal, added deliberately

**Price reaction is scored, and it is the heaviest single input.**

The spec lists four signals because it was written before the price question existed. A lead who answered "well above what I planned" is materially colder than one who answered "about what I expected", whatever the other four say, and ignoring that to match a list would be pedantry.

Recorded here as an addition to WEB-019, not an oversight.

## AC3 - Two buckets, and the threshold is defensible

- The bucket is `hot` or `cold`. No third value.
- A lead who is out of area **and** priced out **and** just planning cannot reach `hot` on project type alone. The Princeton case above must come out `cold`.
- A lead in area, full gut, starting soon, price landed fine must come out `hot`.
- Thresholds are constants with a comment explaining the arithmetic, so they can be tuned without re-deriving them.

## AC4 - The routing decision is recorded, not just made

WEB-01A's criterion is that "the routing decision and its recipient are logged on the lead".

- `routed_to`, `routed_at` and `routing_reason` are written on the lead.
- The reason is human-readable, not a code.
- A routing write that fails is logged loudly and does not silently leave the lead unrouted.
- The owner's brief says when the write failed, rather than announcing a routing the lead has no record of.
- A session with no lead row is **not** a failed write: nothing was due, `recordRouting` answers null rather than false, and the brief warns about nothing.
  A warning raised when no record was ever due teaches the reader to ignore the warning that matters.
- The routing verdict is server-written and is **never** accepted from a request body.
  `/api/leads/submit` is unauthenticated and its schema passes unknown keys through, so `intake_score`, `intake_bucket`, `intake_signals`, `routed_to`, `routed_at` and `routing_reason` are dropped by the sanitizer with a loud note - which also keeps a CHECK-violating `intake_bucket` from making Postgres reject the whole submission and lose the lead.

## AC5 - Hot and cold go different places

- **Hot**: the owner alert says so and leads with why, so it is actionable on a phone.
- **Cold**: enters nurture, and no visit alert is raised.
- Neither path drops the lead. Cold is a different destination, not a bin.
- A bucket that disagrees with its own score explains itself.
  The benefit of the doubt can render "HOT LEAD (45/100)" against a threshold of 55, so the scorer's leading signal travels with the decision and is quoted under the banner.
  Unexplained, the one message the owner reads before picking up the phone looks like a bug in the scoring, on the occasion they most need to trust the label.
- The brief renders three different photo facts three different ways: a count, "none sent", and "count unavailable".
  Everywhere else in this feature a failed read reads differently from an absent thing, and the brief is not an exception.

## AC6 - WEB-01B, the lead who never opened the chat

- A cron finds sessions created more than N hours ago with `opened_at IS NULL`.
- Each is flagged for manual follow-up and enters nurture.
- Non-engagement is recorded as a signal on the lead rather than inferred later from an absence.
  That write is retried once: the alert has gone and the stamp stays set, so the session is a candidate for no future run and nothing else would ever retry it.
- The alert fires **once** per session. A second run must not re-alert.
- Both stages run every three hours across the working day - 13:00, 16:00, 19:00 and 22:00 UTC, which is 9am to 6pm Eastern in summer and an hour earlier in winter.
  A 6-hour threshold checked once a day is inoperative: the cron time, not the threshold, decides when the alert lands, and a lead who submits at 10am waits until the following morning.
  Daytime only, because these land in the owner's personal chat - a 3am chase is worse than a late one - and the elapsed hours are computed from the timestamp, so they stay true whenever the run lands.
  Fixed UTC with the hour of DST drift accepted, the same convention the dispatch escalation crons use.

## AC7 - The lead who started and stopped

Not in the spec, and raised because slice A left it in the gap between "never opened" and "completed".

- A session opened but not completed, and **quiet for N hours**, produces one Telegram carrying whatever they did answer.
  The clock is `updated_at`, which every answer writes - not `opened_at`.
  A lead who opened the link at 16:00 and answered a question at 20:55 is still mid-conversation, and telling the owner they "did not finish" a minute before the completion brief arrives would make both messages untrustworthy.
- It says plainly how far they got and how long they have been quiet, so a half-answered lead is not mistaken for a finished one.
- Fires once, like AC6.
- A lead who **declined** at the consent step is not chased: they answered the question that was asked.
- Every lead-supplied field in the message is clipped.
  Over Telegram's 4096-character limit the send 400s, the claim is released, and the same session fails identically on every run afterwards - so that lead is never chased at all.

## AC8 - Failure reads as failure

- A cron that cannot read its candidates says so and reports zero processed, rather than reporting success on an empty list it never actually fetched.
- An alert that fails to send leaves the "alerted" stamp unset, so the next run retries rather than assuming it went.
- The claim is **proven, not assumed**: the PATCH returns the rows it affected, so a run that matched none knows it lost the race and skips that candidate instead of sending a second alert.
- The claim re-asserts everything that made the row a candidate, not just the unset stamp.
  The list is read once and worked through one at a time, so the claim is the only atomic point in the run: a lead who opens their link or finishes mid-run is skipped rather than told they never opened it and re-routed cold.
- A run that could not drain its backlog reports `truncated`, so it does not read like a run that had nothing left to do.
- `ok` follows a `degraded` list naming what went wrong - failed sends, failed routing writes, a truncated read - so a half-done run is visible in the cron log rather than only in a counter in a body nobody reads.
- That list names the **fault**, not the stage after it: `chase_claim_failed` for a claim Supabase refused, `chase_send_failed` for a send Telegram refused, `chase_threw` for anything else.
  It is the only field the cron log surfaces, so pointing at Telegram when the database is unreachable defeats the purpose of having it.
- Any throw after the stamp is written releases the claim, and the loop guards each candidate.
  Otherwise one bad row leaves itself and every candidate after it claimed and unsent, which no future run can see.
- The route sets `maxDuration = 300` like every other looping cron here: a run killed mid-loop leaves candidates claimed but unsent, and those keep their stamp and are never chased again.

## Out of scope

- Changing `scoreLead()`'s existing weights or thresholds. Live data depends on them, and the routing problem is solved by not asking them to route.
- Re-scoring historical leads.
