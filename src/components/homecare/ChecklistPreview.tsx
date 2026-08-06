'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Wrench, PartyPopper } from 'lucide-react';

/**
 * Animated checklist preview for the /home-care landing page. It shows a
 * representative seasonal plan card (mirroring the real portal UI and the
 * homepage HomeCareBanner ChecklistCard) and, as the visitor scrolls it into
 * view, plays a staggered "check things off" animation so they can see the
 * kind of content (and the satisfying done-state) the real checklist gives
 * them. Purely decorative: no real member data, no network, no tracking.
 *
 * This sample is intentionally a fixed summer illustration (not the live
 * season), so the labeled season always matches the hardcoded summer tasks
 * below. Task titles come from the production maintenance catalog.
 *
 * No prices, deliberately. This previews the real checklist, and that stopped
 * quoting them (owner decision 2026-08-06) - a preview showing a price band the
 * page behind it does not is a promise the product no longer makes.
 */

interface PreviewTask {
  title: string;
  blurb: string;
  kind: 'diy' | 'pro';
}

// A representative summer plan: real catalog titles/blurbs, DIY/PRO mix.
const PREVIEW_TASKS: PreviewTask[] = [
  {
    title: 'Service the A/C before the heat wave',
    blurb: 'A tune-up keeps cooling efficient and catches problems before the first hot stretch.',
    kind: 'pro',
  },
  {
    title: 'Clean & seal the deck',
    blurb: 'Wash and reseal to protect the wood through another season of weather.',
    kind: 'pro',
  },
  {
    title: 'Power-wash siding & walkways',
    blurb: "Knock off a winter's grime and spot any siding that needs attention.",
    kind: 'pro',
  },
  {
    title: 'Replace the HVAC filter',
    blurb: 'A fresh filter every few months protects the system and your air quality.',
    kind: 'diy',
  },
  {
    title: 'Seal-coat the driveway',
    blurb: 'A fresh seal-coat protects asphalt from cracks and water in the off-season.',
    kind: 'pro',
  },
  {
    title: 'Test GFCI outlets',
    blurb: 'Press test/reset on kitchen, bath, and exterior outlets to confirm they trip.',
    kind: 'diy',
  },
];

// How many tasks start already checked (mid-plan feel), and the ms between
// each subsequent check-off once the animation fires.
const INITIAL_DONE = 1;
const STAGGER_MS = 620;

export default function ChecklistPreview({ seasonLabel = 'Summer' }: { seasonLabel?: string }) {
  const total = PREVIEW_TASKS.length;
  const cardRef = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [doneCount, setDoneCount] = useState(INITIAL_DONE);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      // No motion: present the finished plan directly.
      setDoneCount(total);
      setStarted(true);
      return;
    }

    // Fire once, when the card is comfortably in view, then check the
    // remaining tasks off one at a time.
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry.isIntersecting || started) return;
        setStarted(true);
        observer.disconnect();
        for (let i = INITIAL_DONE; i < total; i++) {
          const t = setTimeout(() => setDoneCount(i + 1), STAGGER_MS * (i - INITIAL_DONE + 1));
          timers.current.push(t);
        }
      },
      { threshold: 0.45 }
    );
    observer.observe(el);

    const pending = timers.current;
    return () => {
      observer.disconnect();
      pending.forEach(clearTimeout);
    };
    // `started` intentionally omitted: the observer guards on it via closure and
    // we only ever want to wire this up once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  const pct = Math.round((doneCount / total) * 100);
  const complete = doneCount === total;

  return (
    <div
      ref={cardRef}
      aria-hidden
      className="w-full max-w-[440px] rounded-2xl bg-white p-6 text-text-primary shadow-[0_24px_60px_-20px_rgba(0,0,0,0.28)] ring-1 ring-black/5"
    >
      {/* Plan header: season label + ZIP badge */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-base font-extrabold">Your {seasonLabel.toLowerCase()} plan</span>
        <span className="whitespace-nowrap rounded-full border border-[#ffd9ad] bg-[#fff3e6] px-2.5 py-0.5 text-[11px] font-bold text-[#b35c00]">
          Ridgewood, NJ
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-1.5 h-2.5 overflow-hidden rounded-full bg-[#eef1f5]">
        <span
          className="block h-full rounded-full bg-gradient-to-r from-primary to-accent-sunset transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mb-4 flex items-center justify-between text-[12px]">
        <span className="font-semibold text-text-muted">
          {seasonLabel} · {doneCount} of {total} done
        </span>
        <span className={`flex items-center gap-1 font-bold ${complete ? 'text-accent-teal' : 'text-text-muted'}`}>
          {complete ? (
            <>
              <PartyPopper className="h-3.5 w-3.5" /> All handled
            </>
          ) : (
            `${pct}%`
          )}
        </span>
      </div>

      {/* Task rows */}
      <div className="space-y-0">
        {PREVIEW_TASKS.map((task, i) => {
          const isDone = i < doneCount;
          return (
            <div
              key={task.title}
              className="flex items-start gap-3 border-t border-[#f0f2f5] py-3 first:border-t-0"
            >
              {/* Check box → check circle */}
              <span
                className={`mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border-2 transition-all duration-300 ${
                  isDone
                    ? 'scale-100 border-accent-teal bg-accent-teal text-white'
                    : 'border-[#d4dae2] bg-white'
                }`}
              >
                <Check
                  className={`h-3.5 w-3.5 transition-all duration-300 ${
                    isDone ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
                  }`}
                  strokeWidth={3}
                />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span
                    className={`text-[14.5px] font-bold leading-snug transition-colors duration-300 ${
                      isDone ? 'text-text-muted line-through' : 'text-text-primary'
                    }`}
                  >
                    {task.title}
                  </span>
                  <span
                    className={`text-[10.5px] font-extrabold ${
                      task.kind === 'pro' ? 'text-amber-700' : 'text-emerald-700'
                    }`}
                  >
                    {task.kind === 'pro' ? 'PRO' : 'DIY'}
                  </span>
                </div>
                <p
                  className={`mt-0.5 text-[12.5px] leading-relaxed transition-opacity duration-300 ${
                    isDone ? 'text-text-muted/70 opacity-70' : 'text-text-secondary'
                  }`}
                >
                  {task.blurb}
                </p>
              </div>

              {/* Bookable hint on PRO tasks not yet done */}
              {task.kind === 'pro' && !isDone && (
                <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[#ffd9ad] px-2 py-0.5 text-[10.5px] font-bold text-accent-sunset">
                  <Wrench className="h-3 w-3" /> Book it
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
