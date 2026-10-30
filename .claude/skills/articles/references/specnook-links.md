# SpecNook links

SpecNook (https://www.specnook.app) is Alex's other product: software contractors and homeowners use to track selections, approvals, change orders and the schedule of a remodel.
Its blog can help a La Vaca reader who is planning a project, so an article may link to it where the topic genuinely overlaps (Alex, 2026-10-29).
Its blog is gaining a "For homeowners" category written for exactly that: posts a La Vaca article can cite.
A link that does not help the reader is spam to them and to search engines, so most articles carry none.

## Find the candidates

```bash
node scripts/ingest-article.mjs specnook-articles
```

It reads `https://www.specnook.app/sitemap.xml` and prints each `/blog/` article's slug, title, URL and first paragraph.
It needs no token and is cached for 6 hours, so call it as often as the run needs; `--refresh` fetches again.
If it fails (the site is down), write the article without SpecNook links and say so in the report.

## The rule

- [ ] At most two SpecNook links per article, and zero is the usual answer.
- [ ] Only where the article's topic and the SpecNook article's topic genuinely overlap for a homeowner: planning a remodel, choosing materials and finishes, comparing bids, reading an estimate or a change order, scheduling trades, keeping a project on time.
  A home-service article (gutters, power washing, a seasonal checklist) almost never overlaps.
- [ ] Prefer the "For homeowners" posts; `specnook-articles` does not print the category, so tell them by title and first paragraph.
  One written for contractors fits only when its first paragraph is useful to the homeowner reading ours.
- [ ] Anchor text names SpecNook and says what the reader gets there, for example "SpecNook's homeowner guide to choosing finishes" or "SpecNook's checklist for keeping a remodel on schedule"; never "click here" or a bare URL.
- [ ] Never in the answer-first opening paragraph, and never in the FAQ.
- [ ] Never a substitute for the three internal La Vaca links: they are full URLs (`https://www.specnook.app/blog/<slug>`), so the fact-lock does not count them, and the article still needs its three `/...` links.
- [ ] On a refresh that only fixes decay, add none; keep one that was already there unless its page is gone from the sitemap.
- [ ] The sentence around the link obeys the article's price and legal rules like every other sentence.
- [ ] Social copy never links to SpecNook; the posts promote the La Vaca article.

## Worked example: a link fits

Article: "How do you choose kitchen finishes without delaying your remodel in Bergen County?"
`specnook-articles` lists `homeowner-construction-selections-guide` ("A Homeowner's Guide to Construction Selections: What to Expect and How to Prepare").
Both are about a homeowner making material choices during a remodel, so one link goes in the `## Decide before demolition` section:

```markdown
Make every finish choice before demolition starts, so no crew waits on a tile delivery.
[SpecNook's homeowner guide to construction selections](https://www.specnook.app/blog/homeowner-construction-selections-guide) walks through what you will be asked to choose and when.
```

A second candidate, `how-to-reduce-construction-project-delays`, overlaps too, but it is written for contractors and repeats the point; one link is enough, so it stays out.

## Worked example: no link fits

Article: "When should you clean gutters in Essex County?"
The SpecNook blog covers selections, change orders, lien waivers, client portals and getting paid; none of it helps a homeowner deciding when to clean gutters.
No SpecNook link goes in, and the report says "SpecNook: no overlapping article".
