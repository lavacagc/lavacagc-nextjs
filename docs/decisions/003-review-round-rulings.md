# Rulings made during the review rounds

Self-answered by Fable while Alex was away, 2026-10-29.
These came up after the two grill rounds, when the independent reviewers challenged the built slices.
Each is one sentence of decision and one of reasoning; the evidence sits in `docs/home-services/reports/`.

## Request flow (slice A)

- Dedupe key includes the phone. Two households at one address are two leads; a stranger who knows an address cannot merge into someone else's request.
- A five-digit ZIP decides the service-area check by itself; the town is a fallback only when the ZIP is missing. A typed town must not bypass the ZIP gate.
- Spanish pages are self-canonical with `en`, `es` and `x-default` hreflang. Canonicalising to English would keep the Spanish pages out of the index.
- Both pages render per request because language comes from cookies and `searchParams`. Accepted for launch; a static `/es/` route tree is a follow-up.
- The verify-attempt counter's read-then-write race is accepted because the per-id limit of 15 an hour bounds it.
- The silent drop for bots returns the exact success shape with a random id, so a bot cannot tell it was dropped.
- The shared header, footer and trust bar stay English on the Spanish page in this run.

## Bids and offers (slice B)

- A SpecNook push that cannot run records `pending`, never `skipped`, and the expiry cron retries pending and failed pushes once the API is configured.
- Homeowner notes never reach a sub: not in the scope prefill, the offer page, the email, or the SpecNook job text.
- A request becomes Assigned only when every trade on it is assigned; an expired-then-resent trade does not hold it back.
- Responses on an offer that was assigned, expired or withdrawn move to `closed` and leave the inbox.
- Sub detail uploads and admin replies compress in the browser and are capped at 3.5 MB per file on the server, under Vercel's 4.5 MB body limit.
- The violation text uses `text-red-700` (6.47:1) because `text-destructive` on the card background measures 3.76:1 and fails AA.
- County comes from the ZIP table first, then the town map.

## CTA tests (slice C)

- Assignment uses an fmix32 finalizer after the FNV-1a hash so the two buttons are independent; FNV alone correlated them.
- Every active variant is server-rendered and an inline pre-paint script under 1 KB selects the visitor's variant, so there is no hidden period and no wording swap on slow phones.
- The visitor id for counting is minted and HMAC-signed by the server as an httpOnly cookie; the assignment seed lives in `cta_v` so the pre-paint script never needs the signed cookie.
- A click counts only after that visitor's view; inactive or unknown variant keys are refused.
- A variant whose key already has events cannot change its wording; the admin deactivates it and adds a new variant instead.
- A stored key must be a single letter from the active list, so a tampered cookie cannot hide a button.

## Portfolio (slice D)

- `project-images` stays a public bucket; the private-bucket clause of SEC2 is for homeowner photos only.
- A refused ingest upload is deleted only when the server minted its key and nothing references it; `drafts/` objects are never deleted.
- A storage read that fails or times out never deletes anything; only a successful read showing wrong bytes or size does.
- `admin_url` is `/vaca-mgmt?tab=projects&project=<id>`, and `?tab=` must name a real tab or the dashboard opens.
- Bulk Archive, Feature, Delete and Reorder go through the server so the public pages revalidate.
- A restrictive anon policy on `projects` and `project_images` hides inactive rows wherever row security is on; the production policy text still needs a dashboard check.

## SEO pass

- The exterior painting offer models the per-square-foot price with `referenceQuantity` (unit `FTK`) and the $3,500 minimum as `eligibleTransactionVolume`, not `minPrice`.
- The landing page carries `Service` nodes for all seven services, an FAQ and a breadcrumb; service pages cross-link to their six siblings and phones get a link list under the cards.
- The footer column headings were fixed from `h4` to the correct level because they tripped the accessibility audit on every page.
