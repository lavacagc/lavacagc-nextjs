# Home Care DIY Kit - acceptance criteria

The DIY Kit puts a short shelf of recommended products on the Home Care maintenance tasks a member can do themselves, links them to Amazon with our Associates tag, and gives the owner a task-first admin screen to stock those shelves.
Approved from the Lavish mockup of 5 Aug 2026 (`.lavish/home-care-diy-shop.html`), across two owner review passes.
This file is the tracked record of what was decided, because the mockup is a working artifact and will not survive the branch.

## Slice 1 - what ships here, and what deliberately does not

Schema, the parse route, the admin screen, and the member-facing shelf on the checklist page.

- `supabase/migrations/20260828000000_home_care_products.sql` - `home_care_products`, `home_care_product_tasks`, `home_care_product_clicks`, and the `home-care-products` storage bucket.
- `src/lib/homecare/products.ts` - the pure contract: ASIN extraction, link building, price bands, and the server read the checklist page uses.
- `src/lib/homecare/amazonListing.ts` - the best-effort listing reader (title, brand, image URLs) behind `HOME_CARE_IMAGE_FETCH`.
- `src/app/api/admin/home-care/parse-amazon/route.ts` - paste a URL, get back a filled-in draft.
- `src/app/api/admin/home-care/product-image/route.ts` - the manual upload, which is a first-class path and not an error recovery (see the finding below).
- `src/app/api/admin/home-care/products/route.ts` and `.../products/[id]/route.ts` - the CRUD the admin screen drives.
- `src/components/admin/HomeCareShopManager.tsx` plus `src/app/vaca-mgmt/home-care-shop/page.tsx` - the task-first admin screen.
- `src/components/homecare/HomeCareChecklistClient.tsx` - the collapsed strip, the swipe shelf, and the two row tweaks.
- `tests/home-care-diy-kit.spec.ts` - AC1 to AC12 below.

**Not in this slice**, by the approved plan: the `/home-care/toolkit` page, shelves on the season guide pages, click logging and its admin counts, the coverage panel, and the weekly link-health cron.
The clicks table ships here anyway because a second migration to add one table later is a worse trade than an unused table now.

## Owner decisions on record (binding on the pod)

- **D1** The shelf is a tinted strip, collapsed by default, expanding in place. The booking CTA stays the only orange primary action on the row.
- **D2** Past two products the shelf is a horizontally swipe-able row with a slider bar that is **always drawn**, not the platform scrollbar that fades out.
- **D3** Price bands only ("Under $25"), never a live price. Amazon only permits live prices through the Product Advertising API, which we do not have access to yet.
- **D4** The admin works **item first**: pick the maintenance task, then stock it. Never product-first with a hunt for the task afterwards.
- **D5** Pro-only tasks are **locked in the UI**, not hidden, and an eligible task shows nothing until the owner puts items in it by hand. Curation is manual on purpose.
- **D6** Photos are pulled from the pasted Amazon link automatically, with manual upload as the fallback and PA-API as the eventual upgrade. `HOME_CARE_IMAGE_FETCH=off` disables the fetch without a deploy.
- **D7** La Vaca applies to Amazon Associates immediately and ships monetized. The tag is an env var, never stored on a row.
- **D8** Clicks are counted at product level and disclosed in plain language. No homeowner id is ever written to a click row.
- **D9** "Learn more" moves up beside the DIY badge. "Not relevant" becomes an eye icon.

## AC1 - Only DIY-eligible tasks can carry a shelf

- A product may be linked to a task whose `maintenance_catalog.diy_or_pro` is `diy` or `either`.
- A task whose value is `pro` is rendered in the admin as locked, with the lock stated, and its row cannot open the stocking panel.
- The gate is re-checked server-side on write: a POST naming a pro task is rejected with 422, so a crafted request cannot do what the UI refuses to.
- 34 of the 54 active catalog tasks are eligible at the time of writing (18 `diy`, 16 `either`). That number is not hardcoded anywhere; it falls out of the catalog.

## AC2 - An Amazon URL parses to an ASIN, or fails loudly

- `https://www.amazon.com/dp/B08XYZ1234`, `/gp/product/B08XYZ1234`, `/Some-Product-Name/dp/B08XYZ1234/ref=sr_1_3?keywords=x`, a bare `B08XYZ1234`, and an `amzn.to` short link that resolves to one of those all yield `B08XYZ1234`.
- An ASIN is exactly ten characters of `[A-Z0-9]`, upper-cased before storage. A lowercase paste is normalized rather than rejected, because Amazon's own URLs are case-tolerant and the ASIN is not.
- A non-Amazon host, a search URL with no product in it, or a string that merely contains ten characters somewhere fails with a message naming what was wrong. Nothing partial is stored.
- The same ASIN cannot be added twice: `home_care_products.asin` is UNIQUE, and the admin screen offers the existing product for reuse instead of reporting a constraint error.

## AC3 - The affiliate tag is applied at render, never stored

- Rows store the ASIN. The outbound URL is composed at render time as `https://www.amazon.com/dp/<ASIN>?tag=<AMAZON_ASSOCIATES_TAG>`.
- With the env var unset the link still renders, tagless, and the page is otherwise identical. That is what makes the feature safe to ship before the Associates account is approved.
- No row anywhere in the database contains the string `tag=`. Rotating the Associates ID is a config change, not a migration.

## AC4 - Every outbound product link is marked and disclosed

- Each link carries `rel="sponsored nofollow noopener"` and `target="_blank"`. `sponsored` is what Google requires of a monetized link, and this site's organic ranking is the whole lead engine.
- Every rendered shelf carries the disclosure line in the same block as the links, not in a footer and not in the privacy policy alone. Both Amazon and the FTC require the disclosure to be clear and near the links.
- The disclosure states the commission, that it costs the member nothing extra, and that taps are counted but not attributed to a person.

## AC5 - The shelf renders only where it has something to say

- A task with no active products renders exactly as it does today. No empty strip, no zero count, no layout shift.
- A product that is inactive, or whose `link_status` is `gone`, does not render. Hiding is fail-closed: the member never taps a link we know is dead.
- The strip is collapsed on first render and states the count. Expanding it is one tap and does not navigate.

## AC6 - Past two products the shelf swipes, and says so

- With one or two products the shelf is a plain two-column grid.
- With three or more it is a horizontally scrolling row with CSS scroll-snap, and a slider bar is drawn beneath it whose thumb width is the visible fraction. The bar renders on every platform, because the point of it is to tell a member there is more to the right when the platform scrollbar has faded out.
- The counter reads "1 - 2 of 4" and updates on scroll. On a pointer device the same bar is draggable and gets previous/next arrows.

## AC7 - Photos come from the listing, and the failure path is a real path

- `POST /api/admin/home-care/parse-amazon` returns the ASIN plus, best effort, the title, the brand, and up to five image URLs read from the listing.
- Images are **downloaded into our own storage**, never hotlinked. A product's card survives Amazon changing an image URL, and `next/image` gets a host it is already configured for.
- When the fetch is blocked, times out, or returns something unparseable, the route answers 200 with `images: []` and a `reason`, and the admin screen shows the upload box. A blocked fetch is not an error state for the owner; it is the second half of the same flow.
- With `HOME_CARE_IMAGE_FETCH=off` the route skips the fetch entirely and answers with the ASIN alone.
- A product cannot be made `active` with no image. That is a CHECK constraint, not a UI rule, because a shelf card with no photo is the one thing that makes the whole feature look broken.

## AC8 - The admin screen is task-first

- The screen opens on the list of maintenance tasks, filterable by season and searchable, showing each task's item count.
- Choosing a task opens its shelf. Adding a product is either a pasted URL or a pick from the existing library.
- A product added from the library is **linked, not copied**. Editing it once fixes it on every task that shows it.
- A product's editor offers "also show on these items", so one paste can serve several tasks without going back to the task list.
- Pro tasks appear in the list, visibly locked, and do not open.

## AC9 - The two row tweaks

- "Learn more" renders in the meta line beside the DIY/PRO badge, not in the action row.
- "Not relevant" is an icon-only button carrying an accessible name ("Not relevant - hide this task"), with a hover tooltip on pointer devices.
- Because a phone has no hover and an icon-only dismiss is otherwise unrecoverable on a mis-tap, dismissing shows an undo affordance that restores the task. The dismiss itself is unchanged: it still writes `status = 'dismissed'` with season `'all'`.
- The button keeps a 44px tap target, per the global rule in `globals.css`. The visual shrinks inside a nested span; the button does not.

## AC10 - Deny by default, like every other Home Care table

- All three tables have RLS enabled and **no policies**, so the publishable key can neither read nor write them. Every read is server-side through `SUPABASE_SECRET_KEY`.
- The admin routes sit behind `/api/admin/*`, which middleware already gates. The routes do not re-implement auth; they do re-check the DIY gate (AC1), because that is a rule about the data and not about the caller.

## AC11 - The checklist page degrades rather than fails

- The product read is fail-soft: a missing table (a Supabase Preview branch where the migration has not been replayed, a restored copy) yields no shelves and a working checklist, exactly as `readHomeRecords` does today.
- The read is one query for all visible tasks, issued inside the page's existing `Promise.all`. It adds one round trip, not one per task.

## Finding from the first real run, 5 Aug 2026

The automatic photo pull was exercised against a live Amazon product page from a home network and **was blocked**.
Two things came out of that, and both change decisions rather than just being trivia.

**Amazon's bot wall answers 404, not 503.**
The response is a 1.1KB page reading "To discuss automated access to Amazon data please contact...", returned for a real ASIN and a made-up one alike.
So a link-health checker that reads 404 as "this product is delisted" would mark the entire library dead on the first run that gets walled.
That is the concrete version of the rule already written into the slice 2 design: a block is inconclusive, it is never a strike, and only a positive signal of unavailability may retire a product.
Anything else empties the shelves on a bad afternoon and nobody finds out until a member does.

**The manual upload is the primary path today, not the fallback.**
The parse route still fills in the ASIN from any pasted URL, which is most of the tedium.
Photos come from the upload box until either Amazon stops blocking us or PA-API access opens.
Whether the block also applies from Vercel's IP ranges is unknown until this deploys, and the prior is not encouraging: datacenter ranges are what bot walls are tuned for.
The design already survives this - the route answers 200 with a reason, the schema keeps the product as a draft until it has a picture, and `HOME_CARE_IMAGE_FETCH=off` retires the attempt entirely.

## AC12 - Clicks are counted without identifying anyone

- The click row records the product, the task it appeared on, the surface, and the time. There is no homeowner id, no session id, and no IP on the row, and the table has no column to put one in.
- This is what lets the on-page disclosure say "we count taps, not who tapped" truthfully.
- The route that writes them lands in slice 2. The table and the disclosure copy ship here so the two cannot disagree later.
