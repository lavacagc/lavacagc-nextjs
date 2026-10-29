# Decision 006 - questions raised by the Phase 2 build

Raised by the builders and reviewers on 2026-10-29. Recommended answers are marked; nothing is decided until Alex answers.

---

❓ **Q19** - **Privacy policy 5.1** says OpenAI helps produce site content. After slice F no OpenAI code remains; Claude Code writes articles through the ingest routes, and Alex can edit and override. Options: (a) reword to "AI tools operated by La Vaca help draft some articles; a person reviews every article before it is published or shortly after, and can take it down at once"; (b) delete the sentence.

➡️ (a). It stays true, names no vendor, and matches the Telegram one-tap unpublish.

---

❓ **Q20** - **Locked legal sentences.** The publish guard holds any legal wording unless it is a locked fact quoted word for word. The seed has two unlocked placeholders, `claim_license` and `claim_insurance`. Alex supplies the exact sentences, for example "La Vaca General Contractors is a licensed New Jersey home improvement contractor, NJ HIC 13VH13373800." and "La Vaca carries general liability insurance and a one-year workmanship warranty on its own work."

➡️ Use those two sentences unless the policy wording differs; I lock them in `content_facts` and every article may quote them.

---

❓ **Q21** - **Union County.** The `service_area` fact names Union County, but the site's county list (`COUNTIES`) is Essex, Morris and Bergen, and the ZIP gate declines Union ZIPs. Options: (a) serve Union: add it to `COUNTIES`, the ZIP map and the SEO copy; (b) drop it from the fact.

➡️ (b) until Alex says Union is served; the request flow already declines those ZIPs, so the fact should not promise it.

---

❓ **Q22** - **The "post published" email.** The retired Supabase function that published scheduled posts also emailed Alex a "post published" note with ready-made social copy. The Vercel cron that replaces it does not. Slice G's Telegram message says what was published with the unpublish link but carries no social copy. Options: (a) accept the Telegram message as the notice; (b) add social copy generation to the article skill so Claude Code posts it with each article (a line in the publish message and a draft under `docs/social/`).

➡️ (b). The copy is cheap for Claude to write at publish time and it is what the old email was used for.

---

❓ **Q23** - **Scheduled posts** now wait for the daily 11:00 UTC cron, so a post scheduled for 09:00 goes live at 11:00. Options: (a) keep daily; (b) run the publish cron hourly (one more cron invocation an hour, cents a month).

➡️ (b).
