# Phase 2 retro

Written 2026-10-29 after PR #105 merged and production was verified.
One day: planning in the morning, four slices built and reviewed in parallel through the afternoon, five follow-up decisions, two gate runs, deploy.

## What the process caught, by whom

| Found by | What | Would have reached |
| --- | --- | --- |
| Slice F reviewer | A refresh publish applied a draft the fact-lock had rejected (wrong phone went live on the rig) | Production |
| Slice H reviewer | Seven ways of writing a price into a variant slipped past the check; a third of fresh visitors saw one | Production, against Alex's one hard rule |
| Slice H reviewer | Auto-promotion went ahead when the veto message was never delivered; "24 hours" on a weekly cron | Production |
| Q21 builder | Slice H rewrote the `cta_v` cookie and dropped the hero variants the request route records (a Phase 1 regression that three reviews missed) | Production |
| Gate reviewer, run 1 | Veto link life ran from proposal, not delivery; two JSON-LD blocks embedded token-written titles unescaped | Production |
| Gate reviewer, run 2 | The seed fallback I added for the pages also fed the publish guard, so an outage made it fail open | Production |
| Planner, on a preview | Service pages returned 500 when the database had not run the migration | The deploy window on every release |
| Four reviewers | A dozen phone-layout defects, two older than this work | Alex's phone |

Every builder reported green gates before every one of these was found.
The gates were true; the claims they did not cover were where the defects lived.

## What worked

- One builder and one independent reviewer per slice, with the reviewer required to reproduce by hand in a real browser on a production build, found more than the specs did.
- The planner answering reviewer questions as decisions, written into the criteria the same hour (review_hold semantics, cron cadence, delivered-veto rule), kept four parallel agents on one story.
- A rig-only env file for every agent, after the first two were told to copy a file that pointed at production.
- Dry-running fifty migrations against production inside rolled-back transactions turned a scary history repair into twelve minutes of evidence.
- The progress bar at the bottom of the terminal, with one row per agent and its model, let Alex follow nine agents without reading transcripts.

## What to change next time

- Give every builder the rig env file in the first brief; never say "copy .env.local".
- Make "fail closed" an explicit criterion for any guard, and list every caller before adding a fallback to a shared read.
- Reviewers should run the Phase 1 regression specs (CT, request flow) on every slice, not only the slice's own specs; the cookie regression hid for three reviews because nobody ran them.
- Start the gate only after the stub suite finishes; both take port 3000.
- Push the branch before opening the PR costs a Vercel preview (the ignore-build rule skips PR-less pushes); open the PR first or redeploy once.
- Screenshots under `docs/phase-2/reports/shots/` are 18 MB in git; next phase, keep evidence shots out of the repo (storage bucket or the Lavish folder) and link them from the reports.

## Numbers

| | |
| --- | --- |
| Slices | 4, plus 5 decision follow-ups |
| Builder rounds | 11 |
| Reviewer rounds | 13 |
| Gate runs | 2 (one fix round each) |
| Stub specs at ship | 2,787 passed, 0 failed |
| Files changed on the PR | 318 plus follow-ups |
| Wall clock from branch cut to production | about 5 hours |
