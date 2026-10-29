# Q22 review - social copy at publish time

Reviewer: Opus (independent reviewer, slice G).
Builder: Opus (builder slice G).
Branch reviewed: `phase2/q22-social` at `c4f1f69`, cut from `fb48960`.
Decision: `docs/decisions/006-phase-2-open-questions.md`, Q22 (b).
Rig: the shared local Supabase, rig env as both env files, a fresh production build (`npm run build`, exit 0) on port 3124.
My one post (`review-g-q22-gutters`) was deleted afterwards.

## Q22 review

### Verdict: **REJECT, with two small fixes**

The design is right and most of it works: the social file is checked by the article's own `claimReasons` before anything is written, a failure is 422 with nothing published, the caption rides in the Telegram, the cut at 4,096 is correct, and the CLI's success line is honest.
Two things block.
First, the publish route still reads its body with a 1 KB cap, so a social file written the way the skill asks for (a hook, three sentences, a call, a Google post, an X post, hashtags) is refused with 413 before it is checked.
Second, a claim inside a compound hashtag (`#FullyInsured`, `#Save20`) passes the guard, although the checklist promises hashtags are held to the article's rules.

| Check | Result |
| --- | --- |
| Social file with "from $199, fully insured" | PASS: CLI exit 2, both reasons, "nothing was published"; row unchanged (`published = false`, `published_at`, `publish_nonce` and `review_hold` all null) |
| Clean file with "Gutter cleaning starts at $279" (743 bytes) | PASS: exit 0, URL, unpublish link, `Telegram to Alex: not_configured`, row live |
| A realistic file (1,652 bytes, every post well under its limit) | **FAIL, fix 1**: `publish failed (413): Request body is too large.`, exit 1 |
| Mocked Telegram text carries the caption | PASS |
| Cut at 4,096 with the note | PASS (pure) |
| CLI exit codes and success line | PASS |
| Skill under 120 lines, new reference | PASS (105 lines; `references/social.md` reads correctly) |
| SK3 test fix | PASS |
| Hashtags held to the price and legal rules | **FAIL, fix 2**: `#FullyInsured` and `#Save20` pass |
| Gates | PASS |

### By hand on the production build

The article was created with the CLI (the SK2 gutter article from the slice G review), then published three ways:

1. `publish <id> --social social-bad.md` (caption "Gutter cleaning from $199, fully insured."):
   `The social copy did not pass, nothing was published:`, then `Price claim: "from $199" in the Instagram caption` and `Legal claim: "insured" in the Instagram caption (...)`, `Fix <file> and publish again.`, exit 2.
   The row stayed a draft with `published_at`, `publish_nonce` and `review_hold` all null, so nothing was written.
2. `publish <id> --social social-real.md`: a file a skill-following writer produces (a hook line, a 115-word paragraph, the $279 starting price, the service URL, a 4-sentence Google post, a 2-sentence X post, four hashtags; 1,652 bytes, the caption about 900 characters against a 2,200 limit).
   Answer: `publish failed (413): Request body is too large.`, exit 1.
   Cause: `src/app/api/articles/ingest/[id]/publish/route.ts` line 90 still calls `readArticleBody(request, 1024)`, the cap from slice F, when the body held only `action_id`.
   The new `social` field allows 16 KB in its zod schema, but the body never gets that far: any file over about 1 KB is refused, so the 2,200, 1,500 and 280 limits can never be reached through the route.
   The builder's live spec and hand run both used files under 1 KB (the spec's sample is about 900 bytes), which is why this did not show.
3. `publish <id> --social social-good.md` (743 bytes, "Gutter cleaning starts at $279 for a single-story home."):
   `Published: ...`, `Unpublish link (7 days): ...`, `Telegram to Alex: not_configured`, then `Social copy: checked; the Telegram was not sent (not_configured), so the caption is only in <file>.`, exit 0.
   The success line no longer claims the Telegram when it was not sent; with `sent` it says the caption is in the Telegram (read in the source).

### The Telegram text (mocked fetch)

`notifyArticlePublished` with `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` set and `fetch` replaced, using the clean file's caption, sent this to `https://api.telegram.org/bot<token>/sendMessage`:

```
New article published: When should you clean gutters in Essex County? https://www.lavacagc.com/blog/review-g-q22-gutters
Unpublish: https://www.lavacagc.com/articles/unpublish/abc.def

Instagram caption:
Leaves in your gutters again?

Clean your gutters twice a year in Essex County. Gutter cleaning starts at $279 for a single-story home. Water that spills over a clogged gutter can soak the ground next to your foundation.

Book it: http://localhost:3124/home-services/gutter-cleaning
```

The cut, on `publishedMessage`:

| Caption | Message length | At most 4,096 | Note last | Half entity |
| --- | --- | --- | --- | --- |
| 2,200 plain characters | 2,340 | yes | no cut needed | no |
| 2,200 `&` (11,000 escaped) | 4,092 | yes | yes, "(Caption cut to fit Telegram; the full copy is in docs/social/t.md.)" | no |
| 900 x `<b>` | 4,096 | yes | yes | no |

A caption within the 2,200 limit is cut only when escaping inflates it, so the cut is a safety net, which is the right design.

### Probing the social-copy guard (pure)

| Change to the clean file | Result | Judgement |
| --- | --- | --- |
| none | passes | correct |
| `#Guaranteed` | held | correct |
| `$349` (drywall's price) in the gutter caption | held | correct |
| `#FullyInsured` | passes | **Fix 2.** The hashtags are joined as `FullyInsured`, where `\binsured\b` cannot match. |
| `#Save20` | passes | **Fix 2.** Same cause. |
| The only call is `https://example.com/anything` | passes | Advisory: `SERVICE_CALL` accepts any URL, not only a La Vaca service page. |
| `Article:` on another host, `https://evil.example/blog/<slug>` | passes | Advisory: only the path is checked; the URL is not used for anything, so low risk. |

### Skill and reference

`SKILL.md` is 105 lines (under 120), with the new step 6 "Social copy" before the publish and `--social` on the publish command.
`references/social.md` (53 lines) has the file shape the parser reads, the four posts with their limits, and a checklist that matches what the route enforces (except compound hashtags, fix 2).
It reads correctly; one note for the fix round: the reference should warn that the whole file must stay under the route's body cap once fix 1 sets it, or the cap should be at least the 16 KB the schema allows plus JSON overhead.

### The SK3 test fix

`tests/articles-publish-guard.spec.ts` now reads `content_facts` for `claim_*` keys and asserts each is listed in the feedback exactly when its `lock` is true.
On the rig both are locked (`claim_license`, `claim_insurance`, Q20), and the live run passed.
That is the right assertion: it states the rule (only locked facts are offered) instead of a snapshot of the lock state.

### Gates on `c4f1f69`

| Gate | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run chaos:static` | total 0, baselined 0, NEW 0 |
| `npm run build` (rig env) | exit 0 |
| `TEST_URL=http://localhost:3124 E2E_LIVE_BACKEND=1 E2E_ISR=1 playwright test tests/articles-social-copy.spec.ts tests/articles-publish-guard.spec.ts tests/articles-ingest.spec.ts --project=chromium` (production build) | 124 passed, 1 skipped (ART1 over HTTP, stub only) |
| `npm run test:e2e -- <the slice G stub subset> tests/articles-social-copy.spec.ts tests/home-services-catalog.spec.ts --project=chromium` (`.env.local` aside) | exit 0, 268 passed, 50 skipped (live-backend specs) |

The worktree's `.next` is the stub build from `test:e2e`.

### Fix list

1. Raise the body cap of `POST /api/articles/ingest/<id>/publish` so a 16 KB social file fits with its JSON encoding (for example 24 KB, or the schema's limit plus overhead in one named constant), and add a live spec that publishes a file at every limit (2,200-character caption, 1,500-character Google post, 280-character X post, five hashtags) through the CLI.
2. Split hashtags into words before `claimReasons` (case changes and letter-digit boundaries: `#FullyInsured` to "Fully Insured", `#Save20` to "Save 20"), and add both to the pure spec as held.

Advisories (not blocking): require the caption's call to be a La Vaca URL or path (`/home-services/`, `/services/`, `/free-estimate`), not any URL; check the `Article:` host against the site origin; mention the file-size limit in `references/social.md`.
