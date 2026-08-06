# Lavaca General Contractors Website

## Project Overview

Next.js 16 website for Lavaca General Contractors, a luxury home remodeling company serving New Jersey. The site includes portfolio galleries, service descriptions, a project cost calculator, blog, and contact forms.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS with shadcn/ui components
- **Database/Backend**: Supabase (auth, storage, edge functions)
- **Testing**: Playwright
- **Deployment**: Vercel

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
npm run test:ui     # Playwright with UI - local browser-level verification
npm run audit       # Run site audit locally
npm run audit:prod  # Run site audit on production
```

### Running the Playwright suite

Use **`npm run test:e2e`**. It builds the app the way the suite needs and then
runs Playwright, and it is the same build CI makes (`scripts/test-build.sh` is
called by both, so they cannot drift).

A plain `npm run build` followed by `npx playwright test` does **not** work, and
used to fail 59 specs with pages rendering only "Unauthorized".
`NEXT_PUBLIC_SUPABASE_URL` is inlined at BUILD time, and the admin specs sign in
with a cookie named `sb-127-auth-token` whose name derives from that URL, so
they can only authenticate against a build pointed at the local GoTrue stub.
A global setup now fails the run immediately, naming the fix, rather than
letting that surface as dozens of confusing failures.

Stop any `npm run dev` on port 3000 before running the suite.
Playwright reuses a server already listening there instead of the one it would
start, and `next dev` reads the real Supabase URL from `.env.local` at run time,
so a leftover dev server trips that same guard no matter how you built.

#### Every Playwright script pins its backend - a new one must too

There is no unpinned default, deliberately.
A bare `playwright test` inherits whichever `.next` happened to be built last,
and that is exactly how the live-backend specs end up red against a stub build
with nothing on screen explaining why.
So each `package.json` script that runs `playwright test` states which half of
the trade-off below it is on, and any script added later has to choose:

- **Stub-backed** - set `E2E_STUB_BACKEND=1`.
  This is the default, and it is right for anything running the whole suite or a
  subset of ordinary specs; the live-backend specs then skip and say so, exactly
  as they do in CI.
  Today: `test`, `test:e2e`, `test:ui`, `test:headed`, `test:mobile`,
  `test:flows`.
- **Live-backend** - set `E2E_LIVE_BACKEND=1`.
  Only for specs whose entire point is real Supabase content.
  These need a real `npm run build`, and the flag stands the build guard down, so
  such a script must own its own build rather than inherit one.
  Today: `test:links`.

A subset that mixes the two is stub-backed: skipping the live-backend specs is
honest, running them against a stub is not.
`E2E_LIVE_BACKEND=1` in front of any of them still overrides, for a deliberate
one-off against a real build.
`test:report` only renders an existing report, so it pins nothing.

The trade-off is deliberate: one build cannot satisfy both halves of the suite.
The admin specs need a 127.x origin; the live-backend specs (`links`,
`hero-trust-badges`, `listings-gate`) need the real one, so they SKIP under
`test:e2e` exactly as they do in CI. To run those instead, build normally and
set `E2E_LIVE_BACKEND=1`.

`npm run test:links` is the one script on the other side of that trade-off, and
it is deliberately the LIVE-BACKEND link sweep: walking the real `/locations/*`
and `/services/*` paths only means anything when Supabase has content behind
them.
So it builds normally and sets `E2E_LIVE_BACKEND=1` itself, which both runs its
two specs instead of skipping them and stands the build guard down.
Do not pin it to `E2E_STUB_BACKEND` instead: that would skip both specs and
report a green run that checked nothing.
It owns its build because `E2E_LIVE_BACKEND` disables the guard, so against the
stub `.next` that `test:e2e` leaves behind it would otherwise 404 on every
DB-driven path with nothing to say why.
Production link health is covered independently by `npm run audit:prod`.

Note `test:e2e` leaves `.next` built against a stub Supabase, and `test:links`
replaces it with a real one - run `npm run test:build` before returning to the
rest of the suite, or `npm run build` before serving the app for anything else.

`npm run lint` and `npm run build` (type-check) are the gauntlet the
**no-mistakes gate runs for you** on every ship - see *Shipping changes* below.
Run them by hand only for quick local iteration, not as a manual pre-push
checklist. The Playwright suite is deliberately NOT in that gauntlet: it needs
`.env.local` secrets the gate's worktree does not have, so browser-level
verification stays a **manual pre-gate step**.

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

## Shipping changes - the no-mistakes gate

Every change ships through the **no-mistakes** gate (`/no-mistakes`), not by
hand. The gate runs one pipeline - review → test → lint → docs → push → PR → CI -
in a disposable worktree, auto-applies safe fixes, escalates judgement calls, and
only forwards to `origin` + opens the PR once every check is green. Config lives
in `.no-mistakes.yaml` (gate commands: `npm run lint`, `tsc + next build`).

So **do not** treat these as separate manual steps - the gate owns them:

- hand-running lint / type-check / build as a pre-push checklist
- `git push origin` and hand-writing a PR body
- babysitting CI and fixing red checks one by one

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
