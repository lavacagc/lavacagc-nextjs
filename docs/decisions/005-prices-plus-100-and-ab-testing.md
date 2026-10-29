# Decision 005 - prices plus $100, one-stop message, and continuous A/B testing

Decided by Alex in the CLI, 2026-10-29.

## Prices

"Add $100 to each service": every flat starting price in `src/lib/home-services/catalog.ts` goes up by $100.
Exterior painting is priced per square foot, so its job minimum goes up by $100 instead ($3,500 to $3,600) and the $2.95 unit price stays.
The gutter two-story note goes up by the same $100 ($249 to $349).

| Service | Before | After |
| --- | --- | --- |
| Cabinet repainting | $1,995 | $2,095 |
| HVAC cleaning | $199 | $299 |
| Air duct cleaning | $349 | $449 |
| Home cleaning | $159 | $259 |
| Exterior painting | $2.95/sq ft, $3,500 minimum | $2.95/sq ft, $3,600 minimum |
| Gutter cleaning | $179 (two story $249) | $279 (two story $349) |
| Drywall repair | $249 | $349 |

Prices are never an A/B variable ("don't play with pricing, pricing should stay the same").
Phase 2 slice E moves these values into the admin-edited table; the seed takes the new numbers.

## Copy

"MEGA SEO and AEO friendly" and "promote that we are fast and convenient, a one-stop shop, you just sit back and watch your home be serviced":

- Every service page answers "How much does X cost in NJ?" first and in full (price, what it covers, what moves it), has a "how long" or "when" answer, and a one-stop answer that names a fitting pairing.
- Meta descriptions lead with the cost and the counties; keywords add the "how much", "cost" and "near me" phrasings people type and ask.
- The landing hero, services heading, step 4 and two new FAQ entries carry the one-stop, sit-back message in English and Spanish; the homepage hero sub-line gains "One stop."
- Titles stay at 60 characters and descriptions at 160, the limits the SEO1 spec enforces.

## Continuous A/B testing (Phase 2 slice H)

Q14 primary metric: submitted request per visitor; revenue per visitor is reported but prices are never varied.
Q15 autonomy: the agent promotes winners itself after a 24-hour Telegram veto window.
Q16 what may be tested: copy, layout, buttons, images, section order, FAQ wording. Never prices.
Q17 first experiment: the plus $100 prices ship as the fixed control; the first test is the one-stop hero copy against the previous hero.
Q18 placement: slice H in Phase 2, after slices E and F.

Design summary (details in `docs/phase-2/acceptance-criteria.md`, slice H): the Phase 1 CTA test generalises into an `experiments` table and a per-visitor funnel (view, click, request started, request submitted, quote accepted, job paid); a weekly evaluator computes the probability each variant beats the control and its expected loss, with a 95 percent threshold and at least 200 visitors per variant or 14 days; one experiment per page; crawlers always get the control; a scheduled Claude routine reads the report, promotes or retires, picks the next hypothesis from the backlog and posts the decision to Telegram.
