# Q22 build report - social copy at publish time

Builder: Opus (builder slice G).
Decision: `docs/decisions/006-phase-2-open-questions.md`, Q22 (b): the article skill writes social copy with each article; a line in the publish message and a draft under `docs/social/`.
Branch `phase2/q22-social`, cut from `feat/phase-2-admin-catalog-articles-experiments` at `fb48960`.
Nothing here is marked done by the builder.

## What was built

- **Skill** (`.claude/skills/articles/SKILL.md`, 105 lines): a new step 6, "Social copy", between create and publish, and step 7 publishes with `--social docs/social/<slug>.md`.
  The details live in the new `references/social.md` (53 lines): the file shape, the four posts and their limits (Instagram and Facebook caption up to 2,200 characters with a hook, three plain sentences and a call to the service page; Google Business up to 1,500; X up to 280; 3 to 5 hashtags), and the checklist (the article's price and legal rules, nothing new claimed, grade 8).
  The file is saved in the repo at `docs/social/<slug>.md` with the article URL and the date.
- **Why the copy is written before the publish call, not after it.** The Telegram publish message is sent by the publish route itself, so the caption can only ride in it if the publish carries the file. The skill writes the copy once the article exists (its slug and URL are known) and the publish sends both together. If the article is held, no copy goes anywhere.
- **The social-copy guard** (`src/lib/articles/socialCopy.ts`): `parseSocialMarkdown` reads the file; `checkSocialCopy` applies the article's own price and legal rules to every post and to the hashtags, through `claimReasons`, which I extracted from `checkPublishable` so the two cannot drift.
  It also checks the length limits, the hashtag count and shape, that the `Article:` line points at this post, the `Date:` line, and that the caption calls a service page.
- **The route** (`POST /api/articles/ingest/<id>/publish`) takes an optional `social` field (the file's markdown, up to 16 KB).
  It is checked after the fact-lock and the guard pass and before anything is written; a failure is 422 `{ published: false, error, social: [reasons] }` with the article unchanged.
  On a pass the response carries `social: 'included'`, and the caption goes into the "New article published" Telegram through the existing notify path (`announcePublished` and `publishedMessage`).
- **The message** stays under Telegram's 4,096 characters: the caption gets whatever room the title, URL and unpublish link leave, measured after HTML escaping, and if it does not fit it is cut and the message ends with "(Caption cut to fit Telegram; the full copy is in docs/social/<slug>.md.)".
- **The CLI**: `publish` (and `create --publish`) take `--social <file>`. A failing file exits 2 with the reasons and "nothing was published"; a passing one prints `Social copy: checked`, saying plainly when the Telegram was not sent.
- **Docs**: `docs/articles-ingest.md` has a "Social copy" section, the `--social` flag, the worked example's new step and the publish route's new field and 422.

## Evidence

| Item | Evidence | Result |
| --- | --- | --- |
| Social-copy guard, three samples | `tests/articles-social-copy.spec.ts`: `sample 1: clean copy with the catalog starting price for the named service passes` (and a locked claim sentence passes); `sample 2: price and legal claims are held exactly as in an article` ("from $199", "Save 20%", "insured", "guaranteed", another service's catalog price); `sample 3: limits, hashtags, the article line and the call to the service page` (wrong URL, 2,613-character caption, 281-character X post, no service link, two hashtags, a bad hashtag, missing sections). | pass |
| Caption in the Telegram | `the caption follows the unpublish link, escaped` (exact text; without social copy the message is unchanged); `a caption that would pass 4096 characters is cut, with a note naming the file` (2,200 ampersands, 11,000 characters escaped, message at most 4,096, note last, no half entity). | pass |
| Route, live | `failing copy is a 422 and nothing is published; passing copy publishes and is reported as included` (`telegram: not_configured` on the rig). | pass (production build) |
| CLI, by hand on the production build (port 3119) | `create` a gutter article; `publish --social social-bad.md` exited 2 printing `Price claim: "from $199"` and `Legal claim: "insured"` and "nothing was published"; `publish --social social-good.md` (caption "Gutter cleaning starts at $279", the catalog price) exited 0 with the URL, the unpublish link, `Telegram to Alex: not_configured` and the social line; the row was deleted afterwards. | pass |

Telegram is not configured on the rig, so no message reached a real bot; the outgoing text is proven by the pure message tests only.

## Also changed

- `tests/articles-publish-guard.spec.ts` `SK3` asserted that `claim_license` is never offered as a quotable fact; decision Q20 (migration `20261030000004_lock_claim_facts.sql`) locked both claim sentences, so the test now reads the lock state from the table and asserts each claim key is listed exactly when it is locked.
  This failure was already present on `fb48960` and is not a Q22 regression.
- Two source pins now name `checkPublishable(candidate, facts)`, because the publish route loads the facts once for both the guard and the social check (`loadPublishFacts` in `publishFlow.ts`).

## Commands run and results

| Command | Result |
| --- | --- |
| `git reset --hard feat/phase-2-admin-catalog-articles-experiments && git checkout -b phase2/q22-social` | at `fb48960`; `.env.local` and `.env.development.local` are the rig file (checked with `cmp`) |
| `npm run typecheck`, `npm run lint` | clean |
| `npm run chaos:static` | total 0, NEW 0 |
| `npm run build` (rig env) | exit 0 |
| `TEST_URL=http://localhost:3119 E2E_LIVE_BACKEND=1 E2E_ISR=1 playwright test tests/articles-social-copy.spec.ts tests/articles-publish-guard.spec.ts tests/articles-ingest.spec.ts tests/seo-suggestions-ui.spec.ts tests/seo-draft-guardrails.spec.ts --project=chromium` (production build) | 136 passed, 1 skipped (ART1 over HTTP, stub only); the first run failed only the stale SK3 assertion above |
| `npm run test:e2e -- <the slice G stub subset> tests/articles-social-copy.spec.ts tests/home-services-catalog.spec.ts --project=chromium` (`.env.local` aside) | exit 0, 268 passed, 50 skipped (live-backend specs) |
| Row check: `slice-g-%` posts on the rig | 0 |

No migration, environment variable or secret changes.
The worktree's `.next` is the stub build from `test:e2e`.

## Left out, and why

- No social copy for posts that are published by the cron or from the admin: those publishes carry no file, and the decision asks only for the skill's publishes. Their Telegram is unchanged.
- The skill saves `docs/social/<slug>.md` but does not commit it; whoever runs the skill decides whether the run commits, as with any other file.
- No `docs/social/` example file is committed; the format is in `references/social.md`, and the first real publish creates the folder.

## Fix round 1

Review: `docs/phase-2/reports/q22-social-review.md` (REJECT, two fixes and three advisories), taken with `git merge --ff-only f5f746f`.

| Item | Change | Evidence |
| --- | --- | --- |
| 1. A realistic social file got 413 | The publish route's body cap goes from 1 KB (slice F) to 20 KB, room for the 16 KB `social` field plus JSON escaping; every other article route keeps its cap. `references/social.md` and `docs/articles-ingest.md` state the 16 KB file limit. | Live `fix round 1: a file with every post at its limit (2,200 / 1,500 / 280) publishes; the body cap fits the 16 KB field`: a file over 4 KB with each post exactly at its limit and 5 hashtags publishes (200, `social: included`); one character over on X is a 422 naming 281 characters with nothing published; 17 KB of social is a 400 naming the field, not a 413. |
| 2. Claims inside compound hashtags passed | `hashtagWords` splits a hashtag at case changes (keeping acronyms: `#NJHomes` is "NJ Homes") and at letter-digit boundaries before `claimReasons` reads it; a number next to save, off, discount, deal, sale or cheaper in a hashtag is a price claim. | `claims inside compound hashtags are found (#FullyInsured, #Save20)`: `#FullyInsured` gives `Legal claim: "Insured" in the hashtags`, `#Save20` and `#20Off` give price claims, and `#GutterCleaning #EssexCounty #NJHomes #FallChecklist` still passes. |
| Advisory: any URL counted as the call to action | The caption's call must be a URL on www.lavacagc.com or lavacagc.com (or the origin the route runs on, for the rig) to `/home-services/<slug>`, `/services/<slug>` or `/free-estimate`, or one of those paths bare. | `the call to action and the Article line must be on the La Vaca site` (`https://example.com/anything` and `https://www.lavacagc.com/about` are refused, a bare service path and the rig origin pass). |
| Advisory: the `Article:` host was not checked | The `Article:` URL must be on the same hosts and its path exactly `/blog/<slug>`. | Same test: `https://evil.example/blog/<slug>` is refused. |
| Advisory: file-size limit in the reference | Done (fix 1). | |

### Commands and results

| Command | Result |
| --- | --- |
| `npm run typecheck`, `npm run lint` | clean |
| `npm run chaos:static` | total 0, NEW 0 |
| `npm run build` (rig env) | exit 0 |
| `TEST_URL=http://localhost:3119 E2E_LIVE_BACKEND=1 E2E_ISR=1 playwright test tests/articles-social-copy.spec.ts tests/articles-publish-guard.spec.ts tests/articles-ingest.spec.ts --project=chromium` (production build) | 127 passed, 1 skipped (ART1 over HTTP, stub only) |
| `npm run test:e2e -- <the stub subset> --project=chromium` (`.env.local` aside) | exit 0, 270 passed, 51 skipped (live-backend specs) |
| Row check: `slice-g-%` posts on the rig | 0 |
