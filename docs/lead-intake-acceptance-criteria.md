# Lead intake chat - acceptance criteria

Slice A of the website spec (`02-website-nextjs.md`), covering WEB-010 through WEB-018.
Approved from the Lavish build render on 1 Aug 2026, after two rounds of owner copy changes.

## What this replaces

The site ran a site-wide `ChatWidget` calling `gpt-4o-mini` on every message.
That contradicted three separate lines of the spec: section 7 bans live LLM calls per chat message, WEB-017 bans the bot answering freeform questions, and the framing constraint requires API token spend near zero.
The owner decided on 1 Aug to retire it completely rather than keep it alongside the new flow.

The public disclosure moved with it.
`src/content/privacy-policy-content.md` described an AI chat assistant that transmitted every message to OpenAI, and listed OpenAI as a processor of personal information.
Section 3.5 now describes this flow instead - what it collects, that the messages go to no AI provider, and that an off-script question is forwarded to a human - with section 5.1 and the section 7.1 retention row updated to match.

## Scope decisions taken before building

Bilingual delivery is **cut from scope**. WEB-010 keeps only its instant-response half, which already passed.

The owner's note "keep the token limit" is implemented as the **per-IP rate limit**, not a token cap, because removing the LLM removes token spend outright.

WEB-016's criterion is "a lead can complete the entire flow without typing, except for the opening open ended question".
This build has **three** typed fields: the project description, the town and the address.
The owner removed the town buttons deliberately, on the grounds that eight presets would miss most of New Jersey.
Recorded as a decision, not a miss.

## AC1 - The LLM is gone

- `src/components/ChatWidget.tsx` and `src/app/api/chat/route.ts` no longer exist.
- No intake or lead code imports the `openai` package.
  The dependency and `OPENAI_API_KEY` **stay**: `content-actions/draft`, `cron/generate-renderings` and `cron/seo-maintain` still use them to generate our own content, and none of the three touches a visitor's words.
- `/api/chat` is removed from middleware `PUBLIC_ROUTES`.
- The `chat_conversations` table and its rows are **left untouched**. Deleting the writer must not delete the history.

## AC2 - Two ways in, one token

- A successful `POST /api/leads/submit` returns an `intakeUrl` in its response body, as a site-relative path.
- The on-page confirmation renders that link, and also offers skipping it in plain words.
- The `instant_ack` email carries the same token, made absolute against the canonical `NEXT_PUBLIC_SITE_URL` rather than the request host.
  An emailed link is opened days later from an inbox, so it cannot point at whichever alias happened to serve the form.
- Both resolve to the same session for the same lead. A token maps to exactly one lead, and no lead can reach another lead's session.

## AC3 - The flow never calls a model

- No route under `/api/intake/` imports or calls any AI SDK.
- Every question except the project description, the town and the address is answerable by tapping a preset.
- The flow definition is pure data and is unit-testable without a database or a browser.

## AC4 - The opening discloses AI and asks consent

- The first message says it is La Vaca's AI assistant.
- It states why it is asking, then asks a low-stakes consent question.
- It says "about 3 minutes" and **never states a question count**, in the chat or in either entry point.
- Declining is honoured: the session records `declined_at` and the lead is still called.

## AC5 - Question order and content

Warmest to most revealing, exactly as WEB-015 orders them:

1. Project, open ended, with photo upload.
2. Town, typed, framed as service.
3. Scope tier, then finish level.
4. Timeline.
5. Price anchor plus reaction.
6. Address, framed as "so we can get someone out to you".
7. Preferred day or time of day.

The word "budget" never appears anywhere in the flow copy.

## AC6 - The price question offers, never asks

- The flow states the owner's real **starting price** for the lead's project type, then asks how that lands.
- The reaction is the recorded signal. The lead is never asked to type or pick a figure of their own.
- Project types with no honest starting number (Interior Finishing, Whole Home Remodeling, Other) **skip the question entirely** rather than show an invented one.
- `price_anchor_shown` records what the lead was actually told, so a later dispute can be checked rather than guessed at.

## AC7 - Off-script text is caught, never answered

- Freeform text at a button step is stored, routed to Alex and Veronica by Telegram and email, and answered with a fixed acknowledgement.
- The acknowledgement promises a real answer and re-asks the current question.
- No freeform input ever produces a generated reply.
- A failure to route the message must say so rather than silently swallowing it.

## AC8 - The town acknowledgement is only said when it is true

- The warm line after the town answer renders **only** when the town matches the service-area list.
- Matching uses the same `SERVICE_AREAS` array the scorer uses, so the two can never disagree.
- An unmatched town gets no line at all, rather than a pleasantry that is false.

## AC9 - The close states the promise

- The final message says explicitly that Alex or Veronica will call within 24 hours.
- It reflects the lead's stated contact-time preference when they gave one.

## AC10 - Data lands in the right columns

- `message`, `city`, `project_timeline`, `address` and `contact_time_preference` are existing columns and are filled, not duplicated.
- `contact_time_preference` values are drawn from the six the database check constraint allows - the flow offers five of them - so no answer can be rejected on write.
- The new fields `scope_tier`, `scope_detail`, `finish_level`, `price_anchor_shown` and `price_reaction` are added by migration.
- `budget_range` is **not** reused for the reaction. It holds real ranges written by the calculator and forms, and the owner alert renders it.

## AC11 - Security

- All three new tables have RLS enabled with zero policies. The publishable key ships in the browser bundle, so an unprotected `lead_intake_sessions` would expose every token.
- Intake tokens are 32 random bytes.
- Every `/api/intake/` route is rate limited per IP, carrying forward the protection `/api/chat` had.
- The intake page is `noindex`.

## AC12 - Failure reads as failure

Carried over from the crew dispatch review, where roughly a dozen instances of the opposite were found:

- An unreadable session renders "we could not load this", not "this link is not valid".
- A failed answer write tells the lead the answer did not save, and does not advance the step.
- A failed photo upload says so and does not claim the photo reached Alex.

## AC13 - finishing the intake tells a human

Found during the owner's own walkthrough on 1 Aug: he completed all eight questions and no Telegram arrived, because nothing sent one.
The notification order was backwards.
The new-lead alert fires at form submission, when all we know is a name and a project type; the lead then spends three minutes giving us scope, timeline, price reaction, address and when to call, and nobody was told any of it.

- Completing the flow sends a Telegram brief carrying every answer.
- Stored codes (`major_update`, `1_3_months`) are translated to words, never shown raw.
- The price reaction is stated in plain language alongside the figure the lead was actually shown.
- The brief includes the final answer, not the stale session copy - `contact_time_preference` is the last thing answered, and reading `session.answers` alone would omit the one field that says when to call.
- Declining at consent sends nothing: there is nothing new to say, and the new-lead alert already went.
- The send is awaited. A fire-and-forget fetch is killed when the serverless response returns.
- A failed brief is logged loudly rather than swallowed.
- **Telegram HTML mode supports exactly three entities: `&lt;`, `&gt;`, `&amp;`.** Anything else arrives as literal text. A test asserts no other entity appears in any Telegram message this feature sends.

## Out of scope for this slice

- Scoring against the new fields. The fields are captured here; WEB-019 wires them in slice B.
- Routing hot leads differently from cold ones (WEB-01A).
- The abandoned-session cron (WEB-01B). The `opened_at` column it needs is created here.

## Running the suite without sending real email

The Playwright config starts `npm run start` on port 3000 and reuses whatever is already there.
That server inherits the shell environment, and `.env.local` refills any key the shell merely unsets.
So a full local run against production credentials fires **4 real form-error alerts per run** - the lead-submit tests deliberately POST bad reCAPTCHA, and the alert path emails for real.

Blank the credentials rather than unsetting them, because an unset key is repopulated from `.env.local` while an empty one is not:

```sh
export RESEND_API_KEY=""
export TELEGRAM_BOT_TOKEN=""
npx playwright test
```

Verified: 1410 pass, 0 emails written to `email_log`.
Kill any stray dev server on port 3000 first - two processes on the same port produce failures that look like real regressions and are not.
