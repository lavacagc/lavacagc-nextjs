# Grill round 1 - publishing a portfolio project

Self-answered by Fable while Alex was away, 2026-10-29.
Every recommended answer was taken as the decision.

Goal under test: fewest clicks from "I have the photos" to "the project is live on the site", and no AI in the path.

## Today, counted

Add New Project (1), drop photos into the Before zone (1), drop into the After zone (1), wait for Gemini to classify each (0 clicks, 10 to 40 seconds), Next (1, waits again for Gemini), fix the title (1+), pick a location in a combobox (2), tick service types (1+), pick a date in a calendar (3), pick a budget (2), Next (1), scroll past challenge, solution, materials, features, duration, rating, testimonial (0 to 10), Next (1), SEO step (0 to 4), Save Project (1).
Save publishes immediately, so a mistake is live.
Featuring on the homepage is a separate trip: select the card (1), Feature (1), confirm (1).
Minimum about seventeen clicks and two AI waits.

---

❓ **Q1** - **Does a project need a wizard at all?**

➡️ No.
One scrolling form.
Required: title, location, one service type, at least one photo.
Everything else collapsed under "More details" and "SEO", prefilled with sensible defaults.

---

❓ **Q2** - **What does Save do?**

➡️ Save writes a draft (`status='draft'`, `active=false`).
Drafts never render publicly.
Publish is a separate single click on the draft card in the manager, with "Publish and feature" as the second option.

---

❓ **Q3** - **Where does the AI go?**

➡️ Away entirely: `analyze-project` route, the Gemini classifier on drop, the auto-generate on Next, the "AI Suggest" title button, the "AI Generate" challenge and solution buttons, the "Use AI Pick" SEO buttons, and the call to the edge function that does not exist.
Alt text defaults to "<Category> - <service> in <location>" and the slug is derived from title and location.
`GOOGLE_GEMINI_API_KEY` becomes unused by the site.

---

❓ **Q4** - **Before and after: still two drop zones?**

➡️ One drop zone.
Each thumbnail has a three-way Before / During / After toggle (default After).
Pairing stays: pick one Before and one After, label it, link.

---

❓ **Q5** - **How does Claude Code get a project in?**

➡️ `POST /api/projects/ingest` with a bearer token (`PROJECT_INGEST_TOKEN`), JSON body of the project fields plus images as either public storage paths already in the `project-images` bucket or multipart files.
It always creates a draft.
`PATCH /api/projects/ingest/<id>` updates a draft.
`POST /api/admin/projects/<id>/publish` is the one-click publish the manager calls, and it also accepts the bearer token so Claude Code can publish if asked to.

---

❓ **Q6** - **The twenty orphaned files in `project-images/drafts/`?**

➡️ A "Draft photos in storage" panel in the manager lists them with thumbnails and a "Start a draft from these" button that attaches the selected files to a new draft without re-uploading.
Nothing is deleted automatically.

---

❓ **Q7** - **Location picker: combobox or text?**

➡️ A text field with datalist suggestions from `service_areas`.
One tap to focus, type, done.

---

❓ **Q8** - **Date completed: calendar or month?**

➡️ A month input (`type="month"`) defaulting to the current month.
One tap.

---

## Click count after this round

Add New Project (1), drop all photos at once (1), type a title (1), type a location (1), tick a service (1), Save draft (1).
Six clicks to a draft, no waits.
Publish (1) from the card.
Publish and feature (1) if it belongs on the homepage.
From Claude Code: zero clicks to a draft, one to publish.
