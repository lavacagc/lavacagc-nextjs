# Content freshness plan (14 Aug 2026)

**No code in this plan, and nothing here has been executed.** Blog posts live in the
Supabase `blog_posts` table and are edited through `/vaca-mgmt`, not in the repo, so every
item below is a task for the blog editor. Nothing is deleted, no slug changes, and no
redirects without your approval.

This also stays clear of the site's own SEO pipeline (`seo-ingest` / `seo-suggest` /
`seo-report` / `seo-maintain` crons feeding the `content_actions` queue). Refresh and
consolidation logic already exists there; this plan does not duplicate it.

Every row was read from the live table on 14 Aug 2026, not from a summary.

---

## 1. Posts carrying "2025" — refresh in place

Eleven posts have 2025 in the slug or title. **Keep every slug.** A slug change costs the
existing ranking and needs a redirect; the year in the URL is not worth that. Update the
year references in the body, refresh the figures, and let `updated_at` move so
`dateModified` reflects the edit.

| Slug | Published | Last updated | Note |
|---|---|---|---|
| `bathroom-remodel-cost-nj-2025-price-breakdown` | 2026-03-14 | 2026-03-14 | price figures are the whole value here - they need real 2026 numbers |
| `kitchen-remodel-cost-northern-nj-2025-guide` | 2026-02-21 | 2026-02-23 | same |
| `2025-home-addition-costs-in-millburn-nj-...` | 2025-12-04 | 2026-02-23 | **ranks page 1 - see section 2** |
| `basement-finishing-essex-county-nj-complete-guide` | 2026-02-28 | 2026-02-28 | **ranks page 1 - see section 2** |
| `bathroom-costs-2025` | 2025-12-04 | 2026-02-23 | thin slug; leave it, but the body needs 2026 figures |
| `spring-2025-home-renovation-checklist-nj` | 2026-03-04 | 2026-03-04 | seasonal - re-point at spring 2027 or make it season-agnostic |
| `planning-your-2025-home-maintenance-budget-...` | 2026-02-17 | 2026-02-23 | budget figures are stale |
| `2025-kitchen-trends-bergen-county` | 2025-12-04 | 2026-02-23 | trends posts age fastest |
| `shaping-tomorrows-homes-2025-interior-remodeling-trends-...` | 2025-12-04 | 2026-02-23 | overlaps the row above - see section 4 |
| `top-10-bathroom-remodeling-mistakes-homeowners-made-in-2025-...` | 2026-02-17 | 2026-02-23 | "made in 2025" reads as history; retitle to evergreen |
| `navigating-renovation-costs-how-much-can-a-contractor-go-over-...` | 2025-12-04 | 2026-02-23 | no year in slug; body references only |

**Suggested order:** the two cost guides first (they carry the most commercial intent),
then the two page-1 rankers, then the rest.

## 2. The two page-1 rankers — change as little as possible

`basement-finishing-essex-county-nj-complete-guide` and
`2025-home-addition-costs-in-millburn-nj-...` are ranking. For these:

- **Do not touch the slug, the H1, or the title tag** beyond the year.
- Update figures and add a dated line ("Updated August 2026") so the freshness is visible
  to a reader as well as to a crawler.
- Change one thing at a time and leave two weeks between edits, so if rank moves you know
  which edit moved it.

The site already has a rollback guardrail for exactly this: `seo-rollback` reviews autogen
posts 14 days after publish and reverts a refresh whose CTR dropped more than 20%. Manual
edits do not go through it, so these two want the same discipline applied by hand.

## 3. Expired event posts — retire or repurpose, your call

| Slug | Status | Recommendation |
|---|---|---|
| `host-like-a-pro-world-cup-2026-ready-kitchens-bathrooms-and-basements-...` | published, created 2025-12-04 | The tournament ended 19 July 2026. Repurpose as an evergreen entertaining/hosting renovation guide - the renovation advice survives, the event framing does not. |
| `from-defensive-line-to-drywall-line-what-broncos-vs-jets-teaches-us-ab...` | published, created 2025-12-04 | Weakest of the three. Either repurpose the analogy into an evergreen "how a project team works" piece or unpublish. |
| `nj-snowstorm-february-2026-protect-your-home` | published, created 2026-02-23 | Best candidate for repurposing: rewrite as an evergreen NJ winterization guide. It will earn traffic every winter instead of once. |

**Unpublishing is reversible and does not need a redirect while the slug still resolves.**
Deleting does need one. Recommendation: unpublish or repurpose; delete nothing.

## 4. Duplicate clusters — needs Search Console data before anything moves

These need real query and click data to pick a survivor. **Do not consolidate on intuition:**
merging into the wrong survivor loses the ranking that was already working.

Candidate clusters named in the brief:

- three Livingston kitchen posts
- two Alpine kitchen posts
- two Millburn addition posts
- the eight-post "how to hire a contractor" cluster

**Proposed method, once GSC data is available:**

1. Pull 90 days of clicks, impressions and average position per URL. The site already
   ingests this - `seo_metrics` holds GSC rows keyed by URL, so this is a query rather
   than new plumbing.
2. Survivor = highest clicks; ties broken by best average position, then by most recent
   substantive update.
3. Fold the unique sections of the others into the survivor - genuinely merge, do not
   concatenate.
4. Only then propose 301s, as one list, for your approval.

**Blocked pending your go-ahead:** I did not enumerate the specific URLs in each cluster
here because the brief's descriptions ("three Livingston kitchen posts") did not match
cleanly against the slugs in the table, and guessing which three would be exactly the
error this section warns about. Say the word and I will pull the full published list with
their GSC numbers and bring back named clusters with a survivor recommendation per cluster.

---

## What I did not do, and why

- **No redirects created.** Every one needs your approval per the brief.
- **No posts deleted or unpublished.** Flagged only.
- **No code-based blog posts**, and no refresh/consolidation logic - that pipeline exists.
- **No slug changes**, including on the eleven "2025" posts. The year in a URL is not worth
  the ranking reset.
