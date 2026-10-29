# Grill round 1 - Phase 2: admin pricing, SEO feedback loop, Claude-run articles

Asked of Alex on the Lavish review page, 2026-10-29, while he was present.
Recommended answers are marked; nothing below is decided until he answers.

Request in his words: "add instructions on how to take the pictures, make the hero text less wordy and easier to read, we want the message to be quick and convenient; modify the pricing and the services from the admin side, optimised for SEO by potentially using the open-seo repo; routes so Claude Code can add projects, optimise for SEO based on feedback from GA and open-seo, and edit or publish articles for SEO with Claude without my supervision, using the grill-me skill to make sure the article is sane, factual and plain English for SEO, AEO and local SEO."

Already done on the branch: photo-taking tips in the request flow, shorter hero copy on the homepage and the home services page.

---

❓ **Q7** - **Admin editing of prices and services**: move the seven services into a `home_services` table (seeded from `catalog.ts`) with an admin editor for price, unit, name, description, included and raises lists, SEO title and description, active flag; keep the tap questions in code because they are structural. Pages read the table with hourly ISR and revalidate on save.

➡️ Yes. The questions stay in code; everything a customer reads becomes editable.

---

❓ **Q8** - **open-seo**: it is an open-source Semrush alternative that needs a paid DataForSEO key for every lookup, runs self-hosted (Docker) or hosted at $10 a month, and exposes an MCP server for Claude Code. The site already ingests Google Search Console and GA4 into `seo_metrics` daily. Options: (a) feed Claude Code from the existing GSC and GA4 data and add open-seo's MCP later only for keyword and rank research; (b) adopt the hosted open-seo MCP now; (c) self-host it.

➡️ (a). It costs nothing new, the feedback loop uses data we already have, and the MCP can be added to Claude Code in an afternoon when keyword research is wanted.

---

❓ **Q9** - **Article routes for Claude Code**: `POST /api/articles/ingest` (draft), `PATCH /api/articles/ingest/<id>`, `POST /api/articles/ingest/<id>/publish`, `GET /api/articles/seo-feedback` (per-article impressions, clicks, CTR, position, decaying pages, from `seo_metrics`), all behind the same bearer token as the project ingest; plus a Claude Code skill that drafts or edits an article, runs grill-me on facts and plain English, checks AEO (answer-first opening, FAQ schema) and local SEO (town and county, service area), and only then calls publish.

➡️ Yes, mirrored on the project ingest so one token and one pattern cover both.

---

❓ **Q10** - **Publishing without supervision**: (a) Claude publishes directly when the existing fact-lock (`draftGuardrails`, `content_facts`) passes and the piece makes no price or legal claim, and sends a Telegram with a one-tap unpublish; anything else stays a draft; (b) everything stays a draft until Alex taps publish.

➡️ (a). It is what "without my supervision" asks for, with the fact-lock as the only gate and an undo in the notification.

---

❓ **Q11** - **Removing the OpenAI drafting** (Lavish Q3): delete `content-actions/draft` and the AI half of the `seo-maintain` cron, drop the `openai` package, keep the GSC and GA4 ingest, the weekly report and the suggestion queue as the data Claude Code reads.

➡️ Yes. Claude Code becomes the only writer; the site keeps the data.

---

❓ **Q12** - **Sequencing**: Phase 2 on a new branch after PR #104 merges, with the same structure (audit, acceptance criteria, Opus builders, independent reviews).

➡️ Yes. #104 is validated; stacking Phase 2 on it would re-validate 100 commits.
