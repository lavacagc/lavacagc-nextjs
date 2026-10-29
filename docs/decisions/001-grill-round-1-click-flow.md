# Grill round 1 - the homeowner click flow

Self-answered by Fable while Alex was away, 2026-10-29.
Every recommended answer was taken as the decision.
Overturn any line at review and the flow changes with it.

Goal under test: fewest clicks and shortest time from landing on the site to a submitted request.

---

❓ **Q1** - **Where does the homepage primary button land?** On `/home-services` at the top of the page, or scrolled straight to the cards?

➡️ Straight to the cards (`/home-services#services`).
The hero above the cards costs a swipe on a phone and the homeowner already chose "service options" on the homepage.
The page still has a hero for direct and Craigslist traffic.

---

❓ **Q2** - **Checkbox on the card or the whole card as the toggle?** A checkbox is a 20 pixel target on a phone.

➡️ The whole card toggles, with a visible checkbox state in the corner.
Tapping the price opens the "what's included" sheet and does not toggle the card.

---

❓ **Q3** - **Does "Request These" open a new page or an in-page sheet?** The spec says no page reloads.

➡️ A full-height bottom sheet on phones and a modal on desktop, rendered on the same page.
URL hash `#request` so the back button closes it.

---

❓ **Q4** - **How many questions per service, and what shape?** The planning spec lists up to five per service, the build spec says two or three taps.

➡️ Exactly three tap groups per service, no typed fields, each with two to four options.
Dropped questions: cabinet current finish, duct square footage, home cleaning square footage, exterior square footage, gutter linear feet and downspout count, drywall wall-or-ceiling.
Photos answer every one of those better than a guess.

---

❓ **Q5** - **Are the service questions required?**

➡️ No.
Every tap group starts unselected and the flow proceeds without them.
A skipped answer costs Alex one question on the call; a required answer costs a bounce.

---

❓ **Q6** - **Where does address go, screen 2 or screen 3?**

➡️ Screen 2, as the spec says, and it is the only required field on that screen.
Out-of-area ZIPs are told immediately on screen 2, before the homeowner types contact details, with the polite decline.

---

❓ **Q7** - **Photo upload on screen 2: required or optional?**

➡️ Optional, with the camera button first on phones.
Uploads start the moment a photo is picked (compressed in the browser, one request per photo) so the submit on screen 3 is instant.

---

❓ **Q8** - **Screen 3 fields.** Name, phone, email, timing, consent. Is email required?

➡️ Name and phone required.
Email optional, timing three taps defaulting to "flexible", consent one checkbox pre-unchecked (TCPA).
Phone is the verification channel and the way Alex actually calls.

---

❓ **Q9** - **When does the one-time text code appear?**

➡️ After submit, on the confirmation screen, as a four-digit field.
The request is already saved as Held; verifying flips it to New.
Nothing blocks the homeowner from leaving.

---

❓ **Q10** - **What does the confirmation screen say and where does it go?**

➡️ "Got it. Alex will text you a firm price after looking at your photos."
A single button back to the page.
No intake-conversation invite (that is the remodel flow).

---

❓ **Q11** - **Language toggle placement.**

➡️ One EN / ES toggle in the page header area, persisted in `?lang=es` and a cookie.
Craigslist posts in Spanish link with `?lang=es` so the page opens in Spanish.

---

❓ **Q12** - **Timing check: five seconds from what?**

➡️ From the first screen open to submit.
A hidden `started_at` is set when the sheet opens; the server drops anything under five seconds.

---

## Click count after this round

From the homepage: 1 (hero button) + N cards (one tap each) + 1 (Request These) + up to 3 taps per service + 1 address + optional photos + 2 required fields + 1 timing + 1 consent + 1 submit.
A single-service request with no photos is eight taps and two typed fields.
From a Craigslist per-service link the card is preselected, so it is seven.
