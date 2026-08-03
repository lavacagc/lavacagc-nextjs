# Privacy Policy v2.1 — Changes for Attorney Review

**Prepared for:** Counsel reviewing the Lavaca / La Vaca General Contractors LLC privacy policy
**Subject document:** `src/content/privacy-policy-content.md` (rendered live at `/privacy-policy`)
**Version change:** 2.0 → **2.1**  ·  **Last Updated:** November 12, 2025 → **June 30, 2026**
**Prepared by:** Engineering (not legal advice — provided so counsel can confirm the disclosures match what the software actually does)

---

## Why the policy changed

We added a feature that **identifies and tracks verified "Buy + Remodel" subscribers**: when a
visitor submits the unlock form and verifies their email, we recognize them on return and record
the pages they view across the site, linked to their name and email. While reviewing the policy for
that change we also found the prior v2.0 text **under-disclosed tracking that was already live** on
the site (Microsoft Clarity session recordings, Google Ads Enhanced Conversions, the OpenAI chat
assistant, reCAPTCHA Enterprise, a persistent visitor identifier, and several subprocessors). v2.1
brings the written policy in line with what the code does.

**The two questions for counsel:**
1. Are the **new disclosures** (subscriber identification + activity tracking; AI chat) adequate,
   and is anything legally required that we still don't say (e.g., consent mechanics, CCPA/CPRA
   "sale/share" characterization for the advertising integrations, opt-out parity)?
2. Are the **catch-up disclosures** of already-live tracking sufficient to address the gap that
   existed under v2.0?

Everything below is **additive** — no prior disclosures were removed or weakened.

---

## What the system actually does (engineering ground truth)

So counsel can judge whether the wording is accurate, not just plausible:

- **Subscriber identity cookie.** On email verification we set two 30-day cookies: `br_access`
  (httpOnly, HMAC-signed, carries the subscriber's database ID — this is the authoritative identity,
  not readable by JavaScript) and `br_known` (readable, contains only the subscriber's **first
  name**, used client-side to show the greeting and to decide whether to send tracking). The
  unsubscribe action clears **both**.
- **Activity tracking.** While a verified subscriber browses, the client sends a beacon on each page
  navigation to `/api/buy-and-remodel/track`. The server resolves the subscriber from the signed
  `br_access` cookie and writes one row per page view to a `subscriber_activity` table:
  **path, listing slug (if a listing page), referrer, the persistent visitor_id, IP address,
  user-agent, timestamp** — linked to that subscriber. Tracking is **site-wide** (every page, not
  just listings). For **anonymous** (non-subscriber) visitors the endpoint writes nothing.
- **Linking prior anonymous history.** The persistent `visitor_id` (a random ID in the browser's
  local storage, also used by Google Analytics, Microsoft Clarity, and the Meta Pixel) is stamped
  onto the subscriber record, which can connect a subscriber to browsing they did **before** signing
  up, on the same device.
- **Retention.** Subscriber activity rows persist in our database; the policy states a ceiling of
  "duration of subscription + up to 24 months, or until you unsubscribe or request deletion."
- **Admin visibility.** Only authenticated admins can read this data (database row-level security +
  an admin-gated API). It is not exposed publicly.
- **AI chat.** Chat messages are stored by us and sent to **OpenAI** to generate replies; contact
  details typed into chat can create a lead.

> ⚠️ **Accuracy flags counsel should weigh, not just the prose:**
> - The cookie table lists `_ga`, `_gid`, `_clck`, Meta Pixel, etc. as **"Analytics" / "Marketing"
>   cookies that can be disabled via cookie settings.** Counsel should confirm our consent banner
>   actually gates these (i.e., that the "can be disabled" claim is operationally true), since an
>   inaccurate consent claim is itself a risk.
> - `br_access` / `br_known` / `lavaca_visitor` are listed as **essential**. Confirm that
>   characterization is defensible (the visitor identifier feeds analytics/advertising, which some
>   regimes would not treat as strictly essential).
> - The advertising integrations (Google Ads Enhanced Conversions with hashed email/phone, Meta
>   Pixel) may constitute a **"sale" or "share"** under CCPA/CPRA. The policy elsewhere has a
>   Do-Not-Sell/Share mechanism; counsel should confirm these integrations are correctly wired into
>   that mechanism and the opt-out is honored.

---

## Section-by-section changes

Legend: **[NEW]** = section added in v2.1 · **[+]** = bullets/rows added to an existing section ·
**[~]** = existing wording revised.

### Header **[~]**
| | |
|---|---|
| **Was** | `Last Updated: November 12, 2025` · `Version: 2.0` |
| **Now** | `Last Updated: June 30, 2026` · `Version: 2.1` |

---

### §3.2 Information Automatically Collected **[+]**
Four bullets added:

- **Persistent Visitor Identifier** — "We assign your browser a random identifier (stored on your
  device) and use it to recognize returning visits and to connect your activity across the analytics
  and advertising tools described in Sections 5 and 6 (for example Google Analytics, Microsoft
  Clarity, and the Meta Pixel)."
- **Session Recordings and Heatmaps** — "Through Microsoft Clarity we record sessions (a play-back
  of mouse movement, clicks, scrolling, and pages viewed) and generate heatmaps… Clarity
  automatically masks typed text in form fields. See Section 5.2."
- **Advertising Click Identifiers** — captures the Google Click Identifier ("gclid") and campaign
  data to measure ad performance.
- **Security and Anti-Abuse Data** — logs IP addresses and request metadata to rate-limit forms,
  detect bots (incl. Google reCAPTCHA), and protect the site.

---

### §3.3 Information from Third Parties **[~]**
- Analytics providers list: added **Microsoft Clarity** (was "Google Analytics" only).
- Advertising networks: relabeled **"Meta/Facebook Pixel"** (was "Facebook Pixel").

---

### §3.4 Subscriber Accounts and Activity Tracking **[NEW]** — *primary new disclosure*

Full text added:

> If you sign up for our **"Buy + Remodel"** listings by submitting the unlock form and verifying
> your email address, you become an identified subscriber. When you verify, we place a cookie on
> your browser that **recognizes you when you return** and unlocks the full listing details.
>
> While you are signed in as a subscriber, **we record the pages you view across our Website and
> associate that activity with your name and email address**, together with the date/time, the page
> address, the referring page, your IP address, and browser information. We use this to understand
> which homes and topics interest you, to recognize returning subscribers, and to improve our
> services and communications. Where you previously browsed the Website anonymously on the same
> device, we may **link that prior activity (and the associated analytics/session data) to your
> subscriber identity** using the persistent visitor identifier described in Section 3.2.
>
> This identified tracking applies only to verified subscribers. You can stop it at any time by
> using the **unsubscribe link** in any of our emails, which removes you from the list, **clears
> your access cookie, and ends this identified activity tracking** (you would need to subscribe
> again to regain access). You may also exercise the rights in Section 8 (including access and
> deletion) with respect to this information.

*Counsel: please confirm this is adequate for (a) the linkage of prior-anonymous browsing to a named
identity, and (b) whether affirmative consent (vs. notice + opt-out via unsubscribe) is required.*

---

### §3.5 AI Chat Assistant **[NEW]**

Full text added:

> Our Website offers an AI-powered chat assistant. **Messages you send to the chat are stored by us
> and transmitted to our AI provider, OpenAI, to generate responses.** We also retain the
> conversation, associated with your visitor identifier, and if you provide contact details (such as
> your name, email, or phone) in the chat, **we may use them to create a lead and follow up with
> you.** Please **do not enter sensitive personal information** (such as financial account or
> government ID numbers) into the chat.

---

### §5.1 Service Providers **[~ / +]**

Replaced four generic categories ("Hosting Providers", "Email Service Providers", "CRM Systems",
"Cloud Storage Services") with **named subprocessors**:

- **Hosting, Database, and Storage** — **Supabase** (database, file storage, authentication) +
  website hosting provider.
- **Email Delivery** — **Resend** (recipient name, email, message content).
- **Internal Team Notifications** — **Telegram** (alerts staff of new leads incl. name, contact
  details, inquiry).
- **AI Assistant Provider** — **OpenAI** (processes chat messages; see §3.5).
- **Bot Detection** — **Google reCAPTCHA Enterprise** (receives IP, interaction signals, site token).

(Existing **QuickBooks Payments** disclosure retained.)

*Counsel: confirm whether any of these require a named-subprocessor list, DPA references, or
international-transfer disclosures (e.g., OpenAI).*

---

### §5.2 Analytics and Advertising Partners **[~ / +]**

- **Google Ads (including Enhanced Conversions)** **[~]** — now discloses that for conversion
  measurement we may send Google a **"cryptographically hashed (SHA-256) version of your email
  address and/or phone number"** ("Enhanced Conversions"); Google matches on the hash and does not
  receive plaintext from us.
- **Microsoft Clarity** **[NEW row]** — session recordings + heatmaps; links to Microsoft's privacy
  statement.
- **Meta Pixel (Facebook/Instagram)** **[~]** — relabeled from "Facebook Pixel (Meta)"; adds that it
  matches visitors across sessions using a visitor identifier.
- **"Information Shared with These Partners"** **[+]** — added: our **persistent visitor identifier**;
  for Clarity, **session recordings and heatmap interactions**; **hashed email/phone for Google Ads
  Enhanced Conversions**.

---

### §6.6 Cookies Tables **[+]**

**Essential cookies** — added rows:
- `br_access` — "Grants verified Buy + Remodel subscribers access to listing details (signed,
  identifies your subscription)" — **30 days**.
- `br_known` — "Recognizes a returning subscriber to display a greeting and your unlocked content" —
  **30 days**.
- `lavaca_visitor / lavaca_visitor_id` — "Persistent visitor identifier… to recognize return visits
  and link activity across our analytics tools (stored in your browser's local storage)" —
  **Until cleared**.
- (also: `cookie_consent` row relabeled `cookie_consent / lavaca_cookie_consent`.)

**Analytics cookies** — added rows:
- `_clck` (Microsoft Clarity) — persists a Clarity user ID — **1 year**.
- `_clsk` (Microsoft Clarity) — links page views into one session recording — **1 day**.

*See the accuracy flags above re: whether `br_*` / `lavaca_visitor` belong under "essential."*

---

### §7.1 Data Retention Schedule **[+]**

Two rows added:
- **Subscriber Activity Logs** (pages viewed while signed in as a Buy + Remodel subscriber, linked
  to identity) — "Duration of your subscription + up to 24 months, or until you unsubscribe or
  request deletion."
- **AI Chat Transcripts** (messages exchanged with the chat assistant) — "Up to 24 months, or until
  you request deletion. Our AI provider (OpenAI) retains data per its own policies."

---

## Items NOT changed (for counsel's awareness)

- The **Do-Not-Sell/Share and data-rights request mechanisms** (§8 and the request forms) were not
  modified; §3.4 and §3.5 point to them as the opt-out/rights path.
- **Company identity in the policy:** La Vaca General Contractors LLC, NJHIC #13VH13373800,
  51 Crestmont Rd, West Orange, NJ 07052, alex@lavacagc.com, (201) 212-4917.
- **Known inconsistency (not fixed):** the policy uses `alex@lavacagc.com` as the privacy contact
  while the site **footer** uses `info@lavacagc.com`. Flagging so counsel can tell us which should be
  the official privacy contact; we'll standardize on counsel's direction.

---

*This summary is provided by engineering to support legal review. It is not legal advice. The
authoritative text is `src/content/privacy-policy-content.md` at version 2.1.*
