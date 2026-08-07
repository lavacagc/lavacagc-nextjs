# Home Care "who is doing this?" - acceptance criteria

A La Vaca Home Care member picks, per task, whether they are doing it or we are.
Approved in an owner design review on 6 Aug 2026, off the back of a report that DIY tasks "just show DIY" with no way to ask La Vaca to do them instead.
This file is the tracked record of what was decided, and it owns those decisions: the DIY Kit ACs (`home-care-diy-kit-acceptance-criteria.md`) point here for the shelf gate rather than restating it.

`DP` = the choice itself, and everything the card and the consolidated request had to become to carry it.

## The problem this solves

`maintenance_catalog.diy_or_pro` describes the WORK.
Nothing described the homeowner's INTENT, and the checklist showed the consequences twice over.

All 18 catalog rows with `diy_or_pro = 'diy'` are `bookable = false`, so there was literally no path to ask La Vaca to do one.
The badge said DIY and that was the end of the conversation.

The 16 `either` rows offered the DIY Kit shelf and the add-to-request button at the same time and committed to neither, so "What you'll need" was put in front of people who had already decided we should do it.

Two columns fix both, and merging the choice with the add-to-request action is what let the card get SHORTER while gaining a feature.

## Decisions this encodes

Settled by the owner during the review; the ACs below assume them.

1. **Picking "La Vaca does it" IS adding the task to the consolidated request.**
   One tap, not two.
   The choice control replaces both the old DIY/PRO badge and the add-to-request button, because the button and the Pro half of the choice were the same action.
   That merge is why the card lost a row instead of gaining one.
2. **A pro-only task gets no toggle at all.**
   A safety call: we should not hand someone a shopping list for a gas line, and keeping the control off those cards is what makes its presence elsewhere mean "there is a genuine choice here".
3. **The DIY Kit shelf is the reward for saying you are doing the work yourself**, not the default state of a DIY task.
   This was the explicit ask.
4. **`pro_optional` is a new catalog column, deliberately not a flip of `bookable`.**
   `bookable` also drives the admin walk-in service dropdown (`bookableCatalog` in `src/lib/homecare/serviceIntake.ts`) and the "Add to your plan" CTA in the monthly newsletter, so flipping it would put "Watch for settling cracks" in front of staff as a dispatchable job and sell it in an email.
5. **No member-facing pricing anywhere**: the checklist card, the public preview on `/home-care`, and the monthly newsletter.
   Choosing who does a job is not the moment to anchor on a number.
   The `est_cost_low` / `est_cost_high` columns and the admin quoting path are untouched.
6. **The newsletter had to change in the same commit.**
   A member who read a price range in their inbox and found none on the page that link lands them on is the same disagreement `costLabel` was extracted to prevent, just in the other direction.

## DP1 - Three card shapes, decided by the catalog

- `taskChoice()` in `src/lib/homecare/taskChoice.ts` resolves every task to `choose`, `diy_only` or `pro_only`, and that verdict is what the card renders from.
- `choose` is an `either` task, or a `diy` task the owner marked `pro_optional`.
  It shows the "who is doing this?" toggle and no static badge, because the control stands in the badge's place.
- `diy_only` is a `diy` task with no Pro option.
  No control, because there is no choice, and the DIY badge stays a label.
- `pro_only` is any `pro` task.
  Never offered as DIY (decision 2 above), so the `pro` test runs FIRST and a stray `pro_optional` on a pro row cannot turn a safety call into a choice.
- Absent `pro_optional` reads as "no Pro option", never as one.
  That is the state every row is in before the migration is applied, and DP8 is why it matters.

*Covered* by `tests/home-care-diy-or-pro.spec.ts` ("which shape a task card takes"), which runs in CI.

## DP2 - The DIY Kit shelf renders only once the member has said they are doing it

- On a `choose` task nothing is on screen until the member taps "I'll do it".
  Tapping "La Vaca does it" takes it away again: a shopping list is not what somebody who has just asked us to do the job wants to read.
- On a `diy_only` task the shelf renders exactly as it always did.
- On a `pro_only` task it never renders, and a stored `mode` of `pro` drops it whatever shape the catalog now gives the task.
  Those are one guard from two ends, because a mode row can outlive a catalog edit in either direction.
- `shelfVisible()` owns the rule and is re-checked at RENDER, for the same reason the DIY-eligibility gate is (AC1 of the DIY Kit doc).
- Stock is still the first condition.
  This gate only ever REMOVES a shelf, so an unstocked task renders with no strip, no zero count and no layout shift.

*Covered* by `tests/home-care-diy-or-pro.spec.ts` ("when the DIY Kit shelf may render") and, at the wiring, `tests/home-care-diy-kit.spec.ts` (AC5), both in CI.
*Proved in a browser* by `tests/home-care-diy-kit-shelf.spec.ts` S6 and S7, which are gated on `HC_SHELF_E2E` and do not run in CI (that spec's header owns the recipe).

## DP3 - One consolidated request, derived rather than accumulated

- Membership of the request is DERIVED from what is stored, by `requestedTaskKeys()`.
  There is no second set written alongside the modes, so the chip on a card and the sticky pill that sends the request agree by construction rather than by a second write that could miss.
- `mode` is per (task, season) and the request is per task.
  ANY season saying `pro` puts the task on the request, and clearing one season only takes it off when no other season still says so.
- The one input with no stored counterpart is a hand-made pick: the ＋ circle on a pro-only card, and the `?add=` deep link.
- Two exclusions, both about a card and the request never disagreeing.
  A dismissed task is off the page, so it is off the request.
  A stored `pro` only counts while the task still renders the chip that says so, so a task that has since become `diy_only` or `pro_only` cannot hold a silent seat that no card on screen can explain or take back.

*Covered* by `tests/home-care-diy-or-pro.spec.ts` ("what the member has asked us to do") and `tests/home-care-consolidated-requests.spec.ts` (AC2), both in CI.

## DP4 - A deep-linked task stays on the request, and can always be taken off

- The deep links - the newsletter's "Add to plan", a guide's "Add this on my checklist", any `?add=` - put a task on the request before the member has said who is doing it, and it STAYS there when they pick "I'll do it".
  Saying you will also have a go is not a withdrawal of the ask; plenty of members want a quote for the job they are about to attempt.
- A card is therefore never allowed to sit on the request without saying so.
  Where no other control already says it, the card renders "Still on your request" with an explicit removal button whose accessible name is `Remove {task title} from your request`.
  A green "You've got this" chip on a job we are still queued to quote is the precise state this exists to prevent.
- Removal has to hold against the recompute, so it clears every input that could put the task back: the hand-made pick, and every season still storing `pro`.
- Tapping the removal button unmounts it, so it hands focus to a control the card is left showing, resolved by the card rather than inferred - the seasons it clears are by definition not the one on screen.

*Covered* by `tests/home-care-diy-or-pro.spec.ts` ("a deep-linked task stays...", "removing a deep-linked task holds against the recompute") and `tests/home-care-consolidated-requests.spec.ts` (AC2b, which pins the copy, the two cleared inputs and the focus hand-off), both in CI.

## DP5 - The choice persists, and a decided card is quieter than an undecided one

- The choice is stored in `homeowner_maintenance.mode` per (homeowner, task, season), the table's existing unique key.
  It survives a reload and a new device, so a member who picks on their phone is not asked again on a laptop.
- Per-season rather than per-task on purpose: somebody who did the gutters themselves in spring may well want us in autumn, and every other per-task fact on that table already works this way.
- `NULL` is undecided, and that is the state a card opens in.
- A decided card collapses its toggle into a chip, so a returning member's list is two rows per task rather than three.
  Tapping the chip re-sends the mode it is showing, which reads as "clear this": the reversal is written, the task leaves the request, and it stays off across a reload rather than the card quietly re-growing a chip the server still believes in.
- The write is optimistic with a revert and a toast.
  A failed write that silently kept the new state would tell a member we are coming when nobody knows we are.

*Covered* at the persistence boundary by `tests/home-care-diy-kit-shelf.spec.ts` S7, which is gated on `HC_SHELF_E2E` and does not run in CI.
The reload, the chip's reversal and the pill agreeing with it are asserted there against a real page; nothing in CI can stand that page up.

## DP6 - Changing who does a task never erases a completion

- The `mode` write is its own branch in `POST /api/home-care/task` and writes only `mode`, because it is a statement about intent and not about completion.
- The upsert has to carry a `status` for the INSERT case, since the column is `NOT NULL`, so the branch READS the existing status and writes it back.
  A hardcoded `status: 'todo'` would silently un-complete a task whenever the member changed who does it.

*Covered* by `tests/home-care-diy-kit-shelf.spec.ts` S9, gated on `HC_SHELF_E2E` and not run in CI.
Its stub honours PostgREST's `merge-duplicates` and row filters precisely so this can only pass if the route genuinely reads back.

## DP7 - No price reaches a member

- The checklist page does not select `est_cost_low` / `est_cost_high` at all, and the card renders no cost segment.
- `ChecklistPreview` on the public `/home-care` page carries no price, and no copy above it promises one.
- The monthly newsletter prints no dollar figure and no consult stand-in; its meta line is badge then blurb.
  The cron's catalog select dropped both columns rather than fetching numbers nothing renders.
- `src/lib/homecare/cost.ts` is kept with no callers left in `src/`.
  The columns are not going anywhere - the admin service-quote intake still selects them - so the zero-floor rule it took a production disagreement to learn stays written down and asserted for whichever admin surface formats them next.

*Covered* for the newsletter by `tests/home-care-newsletter.spec.ts` ("the newsletter quotes no price, whatever the catalog carries", whose fixtures still carry `est_cost` so it can only pass if the builder ignores them) and for `costLabel`'s surviving rules by the test beside it, both in CI.
*Proved in a browser* for the checklist and its open shelf by `tests/home-care-diy-kit-shelf.spec.ts` S8, gated on `HC_SHELF_E2E`.
**Not covered:** the public `ChecklistPreview` has no price assertion in `tests/home-care-checklist-preview.spec.ts`, so that surface is held by review and by the component's own comment.

## DP8 - Deploying ahead of the migration cannot break the portal

- `supabase/migrations/20260830000000_home_care_diy_or_pro.sql` is hand-applied, like the rest of this schema, and is idempotent.
  It adds `maintenance_catalog.pro_optional` (`NOT NULL DEFAULT false`) and `homeowner_maintenance.mode` (`NULL`, `CHECK (mode IS NULL OR mode IN ('diy','pro'))`), and marks the owner's 13 rows.
  It was written as `20260828000000`, which a sibling branch had already spent on `home_care_products`.
  Supabase keys `supabase_migrations.schema_migrations` on that version alone and not on the filename, so the Preview branch pushed the second file onto the first one's primary key and answered `duplicate key value violates unique constraint "schema_migrations_pkey"`.
  It is `20260830000000` for that reason and must not be renumbered back.
- The rename fixed the collision but not its damage, and `supabase/migrations/20260828120000_home_care_products_preview_fixup.sql` is the second half of the same repair.
  A directory listing puts `..._diy_or_pro.sql` ahead of `..._products.sql`, so the Preview branch had applied THIS file's SQL under version `20260828000000` and then rolled the entire `home_care_products` migration back when it reached the history insert on the same key - its eleven statements had all succeeded, and the twelfth took them with it.
  Preview branches are persistent and run each version exactly once, so the products migration is unreachable on that branch forever, and the next migration in line answered `relation "public.home_care_products" does not exist`.
  The replay re-creates those objects under a version the branch has not seen; it is a guarded, re-runnable copy of `20260828000000`, so it is a no-op on production and on any fresh branch that replays in order.
  Its version number is the whole mechanism: after the last version the damaged branch recorded, and before `20260829000000`, the first migration that reads the table.
  It keeps `price_band NOT NULL` deliberately, so `20260829000000` still does its own work rather than finding it done.
- Both new columns are read through degrade paths, because PostgREST answers an unknown column with a 400 and that would otherwise 500 the portal for every member.
  `fetchCatalog` retries without `pro_optional` and defaults it to `false`; `fetchMaintenanceRows` retries without `mode` and defaults it to `null`.
- What a member loses on a deploy that runs ahead of the migration is the choice, not the checklist.
  Every `diy` task reads as `diy_only` and keeps its shelf exactly as it had it before the choice existed, an `either` task shows no shelf while it waits on an "I'll do it" that cannot be recorded, and the write behind it answers 500 and reverts the card with a toast.
- **This migration has already been applied to production and verified (6 Aug 2026):** both columns exist, the CHECK constraint is present, 13 rows marked.
  That verification is by hand and has no automated equivalent, which is why it is recorded here.
  The renumber above does not disturb it: what was applied was the SQL body, pasted into the editor, and every statement in it is idempotent, so a later run under the new version is a no-op on those columns.

*Covered* for the "absent reads as no Pro option" half by `tests/home-care-diy-or-pro.spec.ts`, and for the pinned selects by `tests/home-care-wave1-growth.spec.ts`, both in CI.
That same spec pins the two rules the Preview branch depends on: that no two migrations share a version, and that the replay still sorts between the migration it copies and the one that reads the table.
The replay itself was checked the way its original was, on a throwaway Postgres 17: applied to a database missing the products schema it lands the tables, the trigger, RLS and the bucket and lets `20260829000000` and `20260830000000` follow; applied to one that already has them it changes nothing, twice over; and `pg_dump` of the two paths differs in nothing.

## DP9 - Which DIY tasks are worth offering as a service

- The owner triaged all 18 `diy` tasks and marked **13** `pro_optional`.
- The five left out are deliberate, not an oversight: the three shut-off locators (`water_shutoff`, `locate_water_shutoff`, `find_gas_shutoff`), the HVAC filter-size note (`know_hvac_filter`), and settling cracks (`nc_settling_cracks`).
  The first four are one-time orientation, better sold as a single walkthrough than as four line items, and the last is an observation rather than a job anyone can be dispatched to do.
- Those 13 plus the 16 `either` rows are the cards that offer a choice.
  The count is not hardcoded anywhere; it falls out of the catalog.

*Covered* only as a rule, not as a roster: `tests/home-care-diy-or-pro.spec.ts` asserts that a marked task becomes a choice and an unmarked one does not.
Which rows carry the flag lives in the migration and in the database, so a later edit to the selection is a data change and no test will notice it.

## The card this had to fit into

The condensing is the other half of the same review, and the DIY Kit ACs own the row-level detail (AC9 there).
What belongs here is why it was possible at all: the choice control replaced two things rather than adding a third, so six rows became three - title, one clamped line of blurb with an inline "more" affordance, then the choice row - and a decided card is two.

One constraint worth carrying across, because it is not visible in the markup: `globals.css` forces every `button` to a 44px minimum WIDTH as well as height.
That is why the blurb's "more" is a span inside a block button with `min-h-0` rather than a button of its own, and why the title-row icons carry negative margins.
Left alone, two icons plus the checkbox took about 100px out of a 328px card and truncated the blurb after three words.

*Covered* by `tests/home-care-capture.spec.ts` (AC8, that the promoted "add details" icon still has no sizing utility of its own and so keeps the global 44px floor) and `tests/home-care-diy-kit.spec.ts` (AC9), both in CI.
