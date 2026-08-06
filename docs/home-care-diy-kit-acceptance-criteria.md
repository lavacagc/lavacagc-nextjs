# Home Care DIY Kit - acceptance criteria

The DIY Kit puts a short shelf of recommended products on the Home Care maintenance tasks a member can do themselves, links them to Amazon with our Associates tag, and gives the owner a task-first admin screen to stock those shelves.
Approved from the Lavish mockup of 5 Aug 2026 (`.lavish/home-care-diy-shop.html`), across two owner review passes.
This file is the tracked record of what was decided, because the mockup is a working artifact and will not survive the branch.

## Slice 1 - what ships here, and what deliberately does not

Schema, the parse route, the admin screen, and the member-facing shelf on the checklist page.

- `supabase/migrations/20260828000000_home_care_products.sql` - `home_care_products`, `home_care_product_tasks`, `home_care_product_clicks`, and the `home-care-products` storage bucket.
- `supabase/migrations/20260829000000_home_care_price_band_optional.sql` - the price band stops being required. Why, and why the column stays, is D3 below.
- `src/lib/homecare/products.ts` - the pure contract, client-safe because the checklist client imports it: ASIN extraction, link building, the DIY gate, and the retired price-band vocabulary.
- `src/lib/homecare/productShelf.ts` - the server read the checklist page uses, its own module so the service-role import stays out of the client bundle.
- `src/lib/homecare/productAdmin.ts` - the rules the admin routes share: which tasks may be stocked, where a photo is stored, and how a database still missing the price-band migration is named rather than answered generically.
- `src/lib/homecare/shelfPosition.ts` - the slider-bar and counter arithmetic, pure and outside the component so it can be handed real browser measurements.
- `src/lib/homecare/amazonListing.ts` - the best-effort listing reader (title, brand, image URLs) behind `HOME_CARE_IMAGE_FETCH`.
- `src/app/api/admin/home-care/parse-amazon/route.ts` - paste a URL, get back a filled-in draft.
- `src/app/api/admin/home-care/product-image/route.ts` - the manual upload, which is a first-class path and not an error recovery (see the finding below).
- `src/app/api/admin/home-care/products/route.ts` and `.../products/[id]/route.ts` - the CRUD the admin screen drives.
- `src/components/admin/HomeCareShopManager.tsx` plus `src/app/vaca-mgmt/home-care-shop/page.tsx` - the task-first admin screen.
- `src/components/homecare/DiyKitShelf.tsx` - the collapsed strip and the swipe shelf, its own component because it owns a scroll position and a resize listener.
- `src/components/homecare/HomeCareChecklistClient.tsx` plus `src/app/home-care/checklist/page.tsx` - the shelf read, the row it hangs off, and the two row tweaks.
- `tests/home-care-diy-kit*.spec.ts` - AC1 to AC12 below, split across the five files in *How these are verified*.

**Not in this slice**, by the approved plan: the `/home-care/toolkit` page, shelves on the season guide pages, click logging and its admin counts, the coverage panel, and the weekly link-health cron.
The clicks table ships here anyway because a second migration to add one table later is a worse trade than an unused table now.

## Environment variables

Two, both read server-side only, and only one of them has to be provisioned.
This section is what the deployment checklist in `EMAIL_TRACKING_AND_PREFERENCES.md` points at; the behaviour behind each is AC3 and AC7 below, not repeated here.

- **`AMAZON_ASSOCIATES_TAG` must be SET in Vercel, or the feature earns nothing.**
It is the Associates ID appended at render (AC3), so with it unset every product link goes out untagged and no commission is attributed to any tap.
The shelf looks and behaves identically either way, which is what makes the slice safe to ship before the Associates account is approved - but that is a launch step still owed, not a resting state, and nothing on the page will complain about it.
- **`HOME_CARE_IMAGE_FETCH` is an optional kill switch, and it defaults to ON.**
There is nothing to provision unless you want the automatic photo pull disabled; only the value `off` does that (any casing, surrounding space ignored), and unset or any other value leaves the fetch enabled (AC7).
It exists so the fetch can be retired without a deploy.

Neither is `NEXT_PUBLIC_` and neither is a secret - the tag ends up visible in every rendered link anyway.
Do not mark them sensitive in Vercel: that buys nothing here and costs the value on `vercel env pull`.

## How these are verified

Five specs, split by what each can honestly answer.

- `tests/home-care-diy-kit.spec.ts` - the contract: the pure functions, and the rules that live in SQL or in a server component asserted over the files that carry them.
- `tests/home-care-diy-kit-routes.spec.ts` - the running admin routes, through real middleware with the house session cookie. Unhappy paths first: unauthenticated callers, malformed bodies, links with no product in them, every malformed product field, unknown ids, and every refusal the photo uploader makes. Runs in CI on the ordinary stub build.
- `tests/home-care-diy-kit-browser.spec.ts` - the admin screen once React has mounted: a pro task that will not open, a blocked photo pull becoming an upload box, a rejected save that keeps the draft, a database without the migration explaining itself, and no pricing on any of the screen's three surfaces even though the mocked rows still carry bands. Runs in CI.
- `tests/home-care-diy-kit-shelf.spec.ts` - the shelf a MEMBER meets, rendered on the real `/home-care/checklist`: the collapsed strip stating its count and appearing only where something is stocked, the expanded picks with their tagged links and disclosure and no pricing at all, the drawn bar past two picks, a plain grid at two, and the two row tweaks including the icon-only hide being undoable.
The other four never render `DiyKitShelf` itself, so without this one the surface the whole slice exists for was the only part no test had drawn.
It is gated on `HC_SHELF_E2E` rather than run in CI: the page needs an `hc_access` cookie and a catalog behind it, so it needs a server whose Supabase URL points at a stub this spec controls, and that URL is baked at BUILD time - under the ordinary suite build it could only ever assert a redirect.
It must also run against a build rather than `next dev`, because `next/image` validates its src against `images.remotePatterns` in development only and a stub host would throw out of the render.
The full recipe is in the spec's header, which owns it.
- `tests/home-care-diy-kit-live.spec.ts` - the rules only a real database can answer: that the gate resolves against the live catalog, that a product stocked on a task the catalog now calls `pro` stops reaching the member shelf, that the schema refuses a live product with no photo and a duplicate ASIN, that a product stored with no price band is accepted and reads back NULL, and that a `gone` product leaves the member shelf while a `suspect` one stays.
This file WRITES to the database the environment names, so it is guarded by the shared `SKIP_WITHOUT_LIVE_BACKEND` flag as well as by a credentials check.
A credentials check alone was not enough: a shell that has sourced `.env.local` has the keys, so `npm run test:e2e` would have run it against production.
Run it deliberately, against a real `npm run build`, with `E2E_LIVE_BACKEND=1`.

The live file calls the libraries directly rather than the HTTP routes, and that is forced rather than chosen: middleware authenticates the fabricated admin session only against a build whose `NEXT_PUBLIC_SUPABASE_URL` points at the GoTrue stub, and that same baked value is what every server-side read uses.
A build that can authenticate an admin therefore cannot reach the real catalog.
The route spec takes the auth half, the live spec takes the data half, and neither pretends to cover the other.

## Owner decisions on record (binding on the pod)

- **D1** The shelf is a tinted strip, collapsed by default, expanding in place. The booking CTA stays the only orange primary action on the row.
- **D2** Past two products the shelf is a horizontally swipe-able row with a slider bar that is **always drawn**, not the platform scrollbar that fades out.
- **D3** ~~Price bands only ("Under $25"), never a live price.~~ **Superseded 2026-08-06: no pricing at all.**
  The band was never a live price - Amazon permits those only through the Product Advertising API - but choosing one per product turned out to be manual labour for no return, so the owner retired it.
  Nothing collects a band and nothing displays one; a card is a name, a one-line pitch, a photo and a link.
  The column, its CHECK and the vocabulary in `products.ts` all survive, and `20260829000000_home_care_price_band_optional.sql` only drops the NOT NULL, so bands already chosen are kept and the decision is cheap to reverse.
  Both write routes tell one story about a band that DOES arrive, deliberately the same one: a value still in the vocabulary still saves, an explicit null means no band, and anything else is a 422 rather than a value silently dropped into a column the schema still constrains.
  Absent is the normal case now that no form offers one, and it means what it means on each verb: a create records the null nobody said, an edit leaves whatever is stored alone.
  A database that has not had that migration yet is told so by name instead of being handed "Could not save the product.", because since the retirement every create writes the null it forbids.
  If it ever comes back, the argument that produced it still holds: a member deserves to know a dehumidifier is not a $12 purchase before they tap.
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
- The gate is re-checked again at RENDER, so the rule is continuously true rather than true at the moment of stocking.
The catalog is edited as data: a task stocked while it was `either` keeps its join rows after the owner hands that work to the crew, and a read that trusted the join table alone would go on offering a member the gear for it.
`readProductShelves` therefore takes tasks with their `diy_or_pro` rather than bare keys, and drops the ineligible ones before it queries.
The verdict comes from the rows the calling page has already read, so the check costs no extra round trip, and a surface cannot ask for a shelf without saying which side of the line the task is on.
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
- The read is one query for all visible tasks, not one per task.
It is issued AFTER the page's existing `Promise.all`, not inside it, and is therefore one extra sequential round trip.
It cannot join that batch: the keys it is handed are the profile-filtered task list, which is one of the things the batch resolves.
Hoisting it would mean reading shelves for work that is not on the member's plan.

## Finding from the first real run, 5 Aug 2026

The automatic photo pull was exercised against a live Amazon product page from a home network and **was blocked**.
Two things came out of that, and both change decisions rather than just being trivia.

**Amazon's bot wall answers 404, not 503.**
The response is a 1.1KB page reading "To discuss automated access to Amazon data please contact...", returned for a real ASIN and a made-up one alike.
So a link-health checker that reads 404 as "this product is delisted" would mark the entire library dead on the first run that gets walled.
That is the concrete version of the rule already written into the slice 2 design: a block is inconclusive, it is never a strike, and only a positive signal of unavailability may retire a product.
Anything else empties the shelves on a bad afternoon and nobody finds out until a member does.

**Open item, deliberately parked (owner, 5 Aug 2026): move photos onto PA-API once the account qualifies.**
Manual upload is accepted as the interim, and the reminder lives in three places so it cannot quietly become permanent.
A standing panel on the Home Care Shop screen, which sharpens once ten products have been uploaded by hand.
This paragraph.
And the project memory, so the next session raises it rather than waiting to be asked.
The trigger to act is a qualifying sale, not a date: PA-API access opens on the Associates account's first sales, and nothing else unlocks it.
When it does, `parseAmazonListing` is the only seam that changes - the route above it already treats an empty image list as normal.

**The manual upload is the primary path today, not the fallback.**
The parse route still fills in the ASIN from any pasted URL, which is most of the tedium.
Photos come from the upload box until either Amazon stops blocking us or PA-API access opens.
Whether the block also applies from Vercel's IP ranges is unknown until this deploys, and the prior is not encouraging: datacenter ranges are what bot walls are tuned for.
The design already survives this - the route answers 200 with a reason, the schema keeps the product as a draft until it has a picture, and `HOME_CARE_IMAGE_FETCH=off` retires the attempt entirely.

## AC12 - Clicks are counted without identifying anyone

- The click row records the product, the task it appeared on, the surface, and the time. There is no homeowner id, no session id, and no IP on the row, and the table has no column to put one in.
- This is what lets the on-page disclosure say "we count taps, not who tapped" truthfully.
- The route that writes them lands in slice 2. The table and the disclosure copy ship here so the two cannot disagree later.
