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
