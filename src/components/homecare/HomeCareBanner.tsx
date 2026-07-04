'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { trackEvent } from '@/services/analyticsManager';
import { currentSeason, SEASON_LABEL } from '@/lib/homecare/season';
import { readHcKnown } from '@/lib/homecare/knownClient';

/**
 * Homepage Home Care band ("Not remodeling yet?") — the flagship promo for
 * the free seasonal checklist, placed after testimonials so the pitch lands
 * with trust already built. Targets visitors the estimate form misses:
 * homeowners who aren't remodel-ready but will take a free maintenance plan
 * (each signup is an owned email channel). Known members get a portal CTA
 * instead of the opt-in pitch.
 */

/** Static mini-checklist visual mirroring the real portal UI (decorative). */
function ChecklistCard({ seasonLabel }: { seasonLabel: string }) {
  return (
    <div aria-hidden className="w-full max-w-[340px] rounded-2xl bg-white p-5 text-text-primary shadow-[0_18px_50px_-18px_rgba(0,0,0,0.5)]">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className="text-sm font-bold">Your {seasonLabel.toLowerCase()} plan</span>
        <span className="whitespace-nowrap rounded-full border border-[#ffd9ad] bg-[#fff3e6] px-2 py-0.5 text-[10.5px] font-bold text-[#b35c00]">
          Ridgewood, NJ
        </span>
      </div>
      <div className="mb-1 h-2 overflow-hidden rounded-full bg-[#f0f2f5]">
        <span className="block h-full w-[58%] rounded-full bg-gradient-to-r from-primary to-accent-sunset" />
      </div>
      <div className="mb-3 text-[11px] text-text-muted">{seasonLabel} · 7 of 12 done</div>
      {[
        { label: 'Clean gutters & downspouts', done: true },
        { label: 'Service the AC before the first heat wave', done: true },
        { label: 'Flush the water heater', done: false },
      ].map((task) => (
        <div key={task.label} className="flex items-start gap-2.5 border-t border-[#f0f2f5] py-2 text-[12.5px]">
          {task.done ? (
            <CheckCircle2 className="mt-px h-[17px] w-[17px] shrink-0 text-accent-teal" />
          ) : (
            <span className="mt-px h-[17px] w-[17px] shrink-0 rounded-[5px] border-2 border-[#d4dae2]" />
          )}
          <span className={task.done ? 'text-text-muted line-through' : ''}>{task.label}</span>
          {!task.done && (
            <span className="ml-auto whitespace-nowrap rounded-full border border-[#ffd9ad] px-2 py-0.5 text-[10.5px] font-bold text-accent-sunset">
              Book it
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function HomeCareBanner() {
  const seasonLabel = SEASON_LABEL[currentSeason()];

  // Known members already have a plan — swap the opt-in pitch CTA for their
  // portal. SSR renders the visitor version; the cookie read swaps after mount.
  const [memberName, setMemberName] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of a client-only cookie after mount
    setMemberName(readHcKnown());
  }, []);

  const ctaHref = memberName ? '/home-care/checklist' : '/home-care';
  const ctaLabel = memberName ? 'Open my checklist' : 'Get my free seasonal plan';

  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-secondary to-[#001c3d] text-white">
      <div className="pointer-events-none absolute right-3 top-3 h-40 w-40 rounded-full bg-primary/15 blur-3xl" aria-hidden />
      <div className="container relative mx-auto flex flex-wrap items-center gap-x-10 gap-y-8 px-4 py-12 md:py-16">
        <div className="min-w-0 flex-[1_1_320px]">
          <div className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-accent-tangerine">
            La Vaca Home Care · Free for NJ homeowners
          </div>
          <h2 className="mb-3 text-2xl font-extrabold leading-tight md:text-3xl lg:text-4xl">
            Not remodeling yet? Your house still has a{' '}
            <span className="bg-gradient-to-r from-primary to-accent-sunset bg-clip-text text-transparent">to-do list.</span>
          </h2>
          <p className="mb-5 max-w-[52ch] text-sm text-[#c7d3e2] md:text-base">
            A free seasonal maintenance plan personalized to your home — gutters, furnace, sump pump, the works. Do it
            yourself with our checklist, or book La Vaca to handle it.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href={ctaHref}
              onClick={() => trackEvent('home_care_promo_click', { placement: 'homepage_band', member: !!memberName })}
              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-primary to-accent-sunset px-6 py-3.5 text-sm font-bold text-white shadow-button transition-all hover:-translate-y-px"
            >
              {ctaLabel}
            </Link>
            {!memberName && (
              <Link
                href="/home-care"
                className="text-sm font-semibold text-[#c7d3e2] underline decoration-[#c7d3e2]/45 underline-offset-4 transition-colors hover:text-white"
              >
                See how it works
              </Link>
            )}
          </div>
          <div className="mt-4 text-xs text-[#8fa3bd]">
            <b className="font-semibold text-[#c7d3e2]">20-second setup</b> · No account · No spam — unsubscribe anytime
          </div>
        </div>
        <div className="flex min-w-0 flex-[0_1_340px] justify-center">
          <ChecklistCard seasonLabel={seasonLabel} />
        </div>
      </div>
    </div>
  );
}
