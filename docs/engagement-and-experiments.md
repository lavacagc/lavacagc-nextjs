# Engagement and perpetual experiments (analysis, 2026-10-31)

Question from Alex: what is costing clicks and engagement, and what can be A/B tested and kept on the latest winner perpetually.
All numbers are read-only production queries on 2026-10-31 (`seo_metrics` GA4 and GSC imports, `leads`, `homeowners`, `home_profiles`, `experiments`, `experiment_events`).

## What the data says

| Signal | Value |
| --- | --- |
| GA4 users, last 90 days | 1,321 (about 80 to 100 a week; a one-off spike of 281 the week of Aug 3) |
| Homepage users, last 30 days | 113, of which 38 engaged sessions |
| Leads per month | 7 to 9 (May to October) |
| Search impressions, last 30 days | 3,777 |
| Search clicks, last 30 days | 2 (0.05 percent CTR) |
| Location pages' average position | 17 to 35 (pages 2 to 4 of Google) |
| Home Care signups, all time | 5 (3 active, 1 unsubscribed, 1 stuck unverified) |
| Running experiment events, Oct 29 to 31 | 18 views, 0 clicks |

GA4 undercounts (it is skipped under GPC and blocked by ad blockers), but the experiments' own first-party view counts, about 4 counted homepage visitors a day, agree with GA4's order of magnitude.

## What is costing engagement, ranked

1. **Search visibility, not on-page conversion, is the ceiling.**
   3,777 impressions turned into 2 clicks because the pages Google shows sit at positions 17 to 35.
   The location pages (`/locations/montclair` 432 impressions, `/locations/west-orange` 391, `/locations/verona` 282, all 0 clicks) are the largest untapped surface.
   No on-page test can lift a page nobody reaches; moving three location pages onto page 1 would multiply traffic several times.
2. **The Home Care signup puts four hops before any value.**
   Form, then wait for an email, then click the link, then a 5-step wizard, before the checklist appears.
   One of five signups (20 percent) never got past the email.
   Showing the checklist right after the gate (signed cookie, verify later for email sends) and making the wizard optional removes three hops.
3. **The gate asks for more than it needs.**
   ZIP is required in the form while the API treats it as optional, and `home_type` is asked again by the wizard.
   First name and email are enough to start.
4. **Engaged sessions are low on key pages.**
   `/free-estimate`: 29 users, 8 engaged (28 percent).
   The homepage: 34 percent engaged.
   Portfolio is the best page: 16 of 16 engaged, and 6 of the 30-day conversions.
5. **The Home Care signup has no tracking at all**, so step drop-off cannot be measured yet (Phase 3 fixes this).

## Why classic A/B tests will not finish here

The evaluator wants 95 percent probability, 200 visitors per variant and 14 days, judged on `request_submitted`.
The homepage gets about 4 counted visitors a day, and the whole site produces 7 to 9 requests a month.
At that rate a two-variant homepage test reaches 200 visitors per variant in roughly 3 months, and with near-zero submissions it would still not reach 95 percent.
Detecting even a large lift in click-through (10 to 15 percent) needs about 700 visitors per variant: about a year on one page.

Two current experiments cannot conclude at all:
- `hero-secondary` is "running" with a single variant, so there is nothing to compare.
- `landing-hero` has been in draft since it was created.

## The perpetual-winner design that fits this traffic

Keep the existing machinery: assignment, payload slots, the publish guard on copy, the Telegram veto and the weekly experiments routine.
Change four things.

1. **Thompson sampling instead of a fixed split.**
   Each visit draws from every variant's Beta posterior and shows the best draw, so traffic moves toward the leader continuously.
   This means the site is always serving its most likely winner, which is what "perpetually updated to the most recent winner" means in practice, without waiting months for a verdict.
   Keep a 10 percent exploration floor per variant so a slow starter can recover.
2. **A high-frequency primary metric with a guardrail.**
   Judge on CTA click-through to the next step (`click`, then `request_started`) and watch `request_submitted` as a guardrail that can veto a variant.
3. **Site-wide surfaces before single pages.**
   The header CTA, sticky mobile CTA, exit-intent offer and Home Care band appear on every page, so they pool all 80 to 100 weekly users instead of one page's 30.
4. **Champion and challenger, forever.**
   When a challenger's probability of being best drops under 5 percent after a minimum exposure, it retires; the weekly routine pulls the next idea from `experiment_backlog` (4 queued today) and adds it.
   A variant that holds above 95 percent for 4 weeks becomes the permanent default through the existing Telegram veto.
   Every promotion and retirement is logged, and the twice-monthly report lists them.

## What to test first (in order)

| # | Surface | Variants | Metric |
| --- | --- | --- | --- |
| 1 | Home Care gate | 2 fields versus 4; checklist-first versus verify-first | gate submit, then first checklist action |
| 2 | Header CTA (site-wide) | wording: "Free estimate" / "Get a starting price" / "See prices" | click-through |
| 3 | Sticky mobile CTA | call versus text versus estimate | click-through, then phone_click |
| 4 | Location page hero | price-led versus portfolio-led opener | engaged session, click-through |
| 5 | Exit-intent offer | Home Care checklist versus estimate | submit |

Prices themselves are never tested (decision 005).

## Where this lands in the plan

- Phase 3 adds the Home Care events and the partner promo, which makes test 1 measurable.
- The bandit, metric and site-wide changes are a Phase 3 slice ("experiments v2"), with tests for the posterior draw, the exploration floor and the guardrail veto.
- The location-page SEO work is outside the A/B system; it goes into the twice-monthly report's recommendations with its own numbers.
- Clean up now: give `hero-secondary` a challenger or retire it, and start or delete `landing-hero`.
