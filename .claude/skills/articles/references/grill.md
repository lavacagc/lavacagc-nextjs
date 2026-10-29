# Grill checklist

Grill the draft the way a skeptical editor and a NJ consumer-protection lawyer would, one item at a time.
Mark each item pass or fail with its evidence (the sentence, the source, the count).
Fix every fail in the draft and grill again; the draft is ready only when every item passes.

## Sources (the only ones that count)

| Source | Where you read it | What it settles |
| --- | --- | --- |
| `content_facts` | `facts` in `node scripts/ingest-article.mjs feedback` (locked rows only) | `phone_main`, `hic_number`, `email_info`, `service_area`, `current_year`, and any approved `claim_*` sentence |
| `COUNTIES` | `counties` in the same feedback (from `src/lib/home-services/catalog.ts`) | The only counties an article may target; every town named must sit in one of them (check the town's county, for example on its `/locations/<slug>` page) |
| The service-area sentence | the `service_area` fact | How the article states where La Vaca works |
| The feedback endpoint | `GET /api/articles/seo-feedback` (the `feedback` command) | Which queries and pages the article targets, and their numbers |
| The site itself | the live page you link to (`/home-services/<slug>`, `/services/<slug>`, `/locations/<slug>`) | What a service includes, its published starting price, and that the link resolves |

General knowledge about remodeling is a source only for statements a homeowner can verify themselves and that make no promise for La Vaca (for example "paint needs to cure before cabinets are rehung").

## 1. Facts

- [ ] Every factual sentence is traced to a source above; list sentence and source. A sentence with no source is rewritten as general guidance or cut.
- [ ] Phone and license appear only exactly as `phone_main` and `hic_number`, or not at all.
- [ ] The year, when used, is `current_year`.
- [ ] Every town named is in a county from `COUNTIES`; the `service_area` sentence does not widen that list (it names Union county, which the home services do not cover).
- [ ] The `service_area` fact sentence is in the article, worded as the fact says.
- [ ] No number about La Vaca (jobs done, years in business, ratings, review counts) unless a source above states it.

## 2. Claims the guard holds

- [ ] No price: no dollar amount, per-unit price, "starting at", "costs N" (a year-shaped number counts), estimate or quote figure, discount, or percentage off (in digits or words), unless it is a home service's main starting price exactly as the service page shows it, in its unit, stated as a starting price in a paragraph naming that service.
- [ ] No legal claim: permit, code compliant, to code, building code, warranty, guarantee, insured, bonded, liability, lawsuit, legal, ADA, OSHA, EPA, lead-safe, asbestos, mold remediation; unless the sentence is a locked `claim_*` fact, verbatim.
- [ ] The title, the FAQ questions and answers, the excerpt and the meta description pass the same two checks.

## 3. Plain English

- [ ] Reading grade 8 or below: short sentences (aim under 20 words), common words, one idea per sentence. Rewrite any sentence over 25 words.
- [ ] No jargon without a plain explanation in the same sentence.
- [ ] Active voice, "you" for the homeowner, "we" for La Vaca.
- [ ] No filler openers ("In today's world", "When it comes to"), no hype ("best", "top-rated", "#1") without a source.

## 4. Shape (the guard checks these too)

- [ ] The opening paragraph answers the question in 25 to 70 words, with no link.
- [ ] At least one `##` heading; sections follow the questions a homeowner asks next.
- [ ] At least three internal links, each to a page that exists (open it).
- [ ] SpecNook links, if any: at most two, each passing every item in [specnook-links.md](specnook-links.md), and none counted among the three internal links.
- [ ] `faq.json` has 2 to 6 items when the title is a question, and each answer stands alone in one to three sentences.

## 5. Search fit

- [ ] The target query from the feedback, or its plain wording, is in the title, the opening and one `##` heading.
- [ ] A refresh keeps the slug and every section that still earns clicks; it improves, it does not replace.
- [ ] Every item in [aeo-local-seo.md](aeo-local-seo.md) passes.
