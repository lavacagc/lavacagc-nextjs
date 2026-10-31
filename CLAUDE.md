# Lavaca General Contractors Website

## Project Overview

Next.js 16 website for Lavaca General Contractors, a luxury home remodeling company serving New Jersey. The site includes portfolio galleries, service descriptions, a project cost calculator, blog, and contact forms.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS with shadcn/ui components
- **Database/Backend**: Supabase (auth, storage, edge functions)
- **Testing**: Playwright
- **Deployment**: Vercel, through `.github/workflows/deploy.yml` (migrate, build, smoke, promote); see README "Deploys"

## Reading this codebase (token budget)

Read `docs/codemap/CONTEXT.md` before opening source to answer "how does X work".
Query structure instead of opening files: `node scripts/query-map.mjs --impact <file>` and `--trace <entry>`.
Run `node scripts/check-freshness.mjs` first: FRESH means trust the map, DRIFTED means trust it except the files it names, STALE means read source.
Grep and read line ranges; never read whole directories; summarize build and test output instead of pasting it.

| Read | When |
| --- | --- |
| `docs/testing.md` | before running or writing Playwright specs |
| `docs/local-rig.md` | before testing off production (local Supabase) |
| `docs/home-care-audit.md` | before touching Home Care, CI/CD or deploys |
| `docs/engagement-and-experiments.md`, `docs/experiments.md` | before changing A/B tests or tracking |
| `README.md` "Deploys" | before deploying, rolling back or editing workflows |

## Project Structure

```
src/
├── app/           # Next.js App Router pages
│   ├── about/
│   ├── admin/     # Admin dashboard
│   ├── api/       # API routes
│   ├── blog/
│   ├── contact/
│   ├── portfolio/
│   ├── process/
│   ├── project-calculator/
│   ├── services/
│   └── locations/
├── components/    # React components (shadcn/ui + custom)
├── hooks/         # Custom React hooks
├── lib/           # Utility libraries
├── services/      # API service layer
├── types/         # TypeScript type definitions
└── utils/         # Helper functions
```

## Common Commands

```bash
npm run dev         # Start development server
npm run build       # Production build (also type-checks + lints every route)
npm run typecheck   # tsc --noEmit on its own
npm run test:e2e    # Build the app for the suite, then run Playwright
npm run test:ui     # Playwright with UI, against a build test:build already made
npm run audit       # Site audit vs localhost:3000 (start a server first)
npm run audit:prod  # Site audit vs production - exits nonzero even when healthy
```

Before running Playwright, read `docs/testing.md`: the suite needs the stub build (`npm run test:e2e`), and every script pins its backend.

`npm run lint`, `npm run typecheck` and `npm run build` are the gauntlet the
**no-mistakes gate runs for you** on every ship - see *Shipping changes* below.
Run them by hand only for quick local iteration, not as a manual pre-push
checklist. The Playwright suite is deliberately NOT in that gauntlet: it needs
`.env.local` secrets the gate's worktree does not have, so browser-level
verification stays a **manual pre-gate step**.

## Where to look

- Testing off production: `docs/local-rig.md` (local Supabase, admin sign-in, dev versus production build on the rig).
- Home Services build (priced services, request flow, bids, CTA tests, portfolio drafts): `docs/home-services/` (audit, acceptance criteria, follow-ups, reports) and `docs/decisions/`.
- Claude Code project ingest: `docs/projects-ingest.md`.
- Claude Code article routes and CLI (write, publish, SEO feedback, publish guard, unpublish link): `docs/articles-ingest.md`; the skill that drives them: `.claude/skills/articles/SKILL.md`.
- A/B experiments (assignment, funnel, evaluator and veto, agent routes and CLI): `docs/experiments.md`; the routine that drives them: `.claude/skills/experiments/SKILL.md`.
- The sitemap (why it is a route handler, the daily watcher, how to move it back when the Next.js fix ships): `docs/sitemap.md`.

## Path Aliases

Use `@/` to import from `src/`:
```typescript
import { Button } from "@/components/ui/button"
```

## Environment Variables

Required in `.env.local`:
- Supabase connection credentials
- Google Analytics configuration

## Key Integrations

- **Supabase**: Database, authentication, file storage
- **Google Analytics**: GA4 scroll and engagement tracking
- **Google reCAPTCHA**: Form spam protection

## Development Guidelines

- Components use shadcn/ui with Radix UI primitives
- Forms use react-hook-form with zod validation
- Images are optimized via Next.js Image component with Supabase storage
- Security headers are configured in `next.config.ts`

## Progress board in the CLI (standing rule, added 2026-10-29)

Alex follows the work from the terminal, so every long-running phase gets a progress board in the reply, refreshed whenever a step changes state.
Post one when a phase starts, when it moves, and when it ends; never let more than one step pass silently.
The board has, in this order:

- A one-line title: what is running, on which branch or commit.
- A bar and a percent, counted in steps done out of steps total, with an estimated time to completion from the measured durations of the steps already finished (say "no estimate yet" rather than invent one).
- One line per step: name, state (done, running, pending, failed), measured duration, and round when it has one.
- A "Who" line per active worker: the agent (pipeline daemon, a named builder or reviewer subagent, the Lavish poll, me) and the model it runs on, or "model unknown" when the tool does not expose it.

Format, so it reads the same every time:

```
Pipeline run 3 · no-mistakes · feat/home-services-request-flow @ 776297a
[██████░░░░] 6/9 · 67% · ETA ~5 min (review 4m38s, test 3m11s measured)
  intent done 0s · rebase done 2s · review done 4m38s (fix round 1) · test done 3m11s
  document running 29s · lint pending · push pending · pr pending · ci pending
Who: no-mistakes daemon v1.41 (Claude Code CLI, Opus per ~/.no-mistakes/config.yaml) on document · Fable 5.1 driving the gates · Lavish poll idle, waiting on Q7-Q12
```

Subagents are named in the board by role (builder slice A, reviewer B) with their model, so the record shows who built and who reviewed what.

The same board lives persistently at the bottom of the terminal, in the Claude Code status line (`~/.claude/statusline.mjs`, refreshed every 5 seconds):
the first line is the model, folder and branch; the no-mistakes gate for this repo appears by itself, read from the daemon's state, with bar, step, ETA from past runs, agent and model, branch and PR.
Every other long job (a builder or reviewer subagent, a Lavish poll, a Playwright run, a CI wait) is shown there only if it writes a progress file, so start one when the job starts and finish it when it ends:

```sh
node ~/.claude/progress.mjs start <job> <total-steps> "<role> · <model> · <what>"   # PROGRESS_EXPECTED_MS=600000 for a time-based job
node ~/.claude/progress.mjs set <job> <done> "<current step>"
node ~/.claude/progress.mjs done <job> ok|failed
```

The file names the job's pid (`PROGRESS_PID` when the writer is not the job itself); a job whose process is gone disappears from the bar.

## Shipping changes - the no-mistakes gate

Every change ships through the **no-mistakes** gate (`/no-mistakes`), not by
hand. The gate runs one pipeline - review → test → lint → docs → push → PR → CI -
in a disposable worktree, auto-applies safe fixes, escalates judgement calls, and
only forwards to `origin` + opens the PR once every check is green. Config lives
in `.no-mistakes.yaml` (gate commands: `npm run lint`, and
`npm run typecheck && npm run build`, each preceded by `npm ci` when the fresh
worktree has no `node_modules`).
That file also owns a repo-wide rule worth knowing before you add any script,
workflow step or hook: pinned dependencies are invoked through `npm run`, never
`npx` - a bare `npx tsc` runs an unrelated registry package that type-checks
nothing.

So **do not** treat these as separate manual steps - the gate owns them:

- hand-running lint / type-check / build as a pre-push checklist
- `git push origin` and hand-writing a PR body
- babysitting CI and fixing red checks one by one

The pre-push hook no longer starts a server (2026-10-31: build and smoke moved to CI), so `npm run test:e2e` can run beside `no-mistakes axi run`.

One exception, decided 2026-10-29: the weekly article routine's social-copy
PR (a single new file under `docs/social/`, nothing else) is opened directly
with `gh pr create` and merged without a gate run; the No Co-Authored-By CI
check and the docs-only pre-push rule still apply to it.

What stays a **manual pre-gate step**: browser-level Playwright / visual
acceptance checks against a real dev server. The gate's worktree has no
Supabase / Resend / reCAPTCHA secrets, so it can't run the env-dependent suite -
verify rendered output locally (see the acceptance-criteria workflow) before you
gate. Still commit on a feature branch (never the default branch) before running
the gate.

## Slash Commands

### /test-web

**Description:** Visually audits the local web development server.

**Instructions:**
When I type `/test-web`, perform these steps strictly in order:

1. **Target**: Confirm the local server URL (default to http://localhost:3000 if not specified).
2. **Capture**:
   - Use `browser_navigate` to open the URL.
   - Use `browser_screenshot` to capture the current state.
3. **Audit**: Critique the UI against **Modern Web Standards**:
   - **Responsiveness**: Does the layout break? (Mention if you need to resize the browser to test mobile).
   - **Hierarchy**: Are headings distinct from body text?
   - **Whitespace**: Is the padding consistent?
4. **Report**: Output a list of "Visual Defects" found.
