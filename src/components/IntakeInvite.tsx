/**
 * WEB-012, path one: the on-page offer to answer a few questions, shown on the
 * confirmation panel right after a lead submits.
 *
 * Renders NOTHING when there is no url. The session is created best-effort at
 * submit time, so a null here is a real possibility, and a dead button is worse
 * than no button.
 *
 * Skipping is offered in plain words on purpose. A lead who feels trapped in a
 * second form is worse than a lead with fewer fields filled in, and the
 * low-intent path picks up anyone who never opens it.
 */
import { ArrowRight } from 'lucide-react';

export default function IntakeInvite({ url }: { url?: string | null }) {
  if (!url) return null;

  return (
    <div className="mt-6 w-full rounded-2xl border border-primary/25 bg-primary/[0.06] p-5 text-center">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.09em] text-primary-dark">
        Before we call
      </p>
      <p className="mt-1.5 text-lg font-extrabold leading-snug text-text-primary">
        Make the call worth your time
      </p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-text-secondary">
        Our assistant can take a few details so the call is about your project rather than paperwork.
        About three minutes, and it&apos;s mostly buttons.
      </p>
      <a
        href={url}
        data-testid="intake-invite-link"
        className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white shadow-button transition-all hover:-translate-y-[1px]"
      >
        Add a few details <ArrowRight className="h-4 w-4" />
      </a>
      <p className="mt-3 text-xs text-text-muted">
        Or skip it — we&apos;ll still call you within 24 hours.
      </p>
    </div>
  );
}
