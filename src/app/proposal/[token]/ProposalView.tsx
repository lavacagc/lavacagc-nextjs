'use client';

/**
 * The client's proposal, and the only interactive thing in the pod.
 *
 * WEB-023 is the rule that shapes this whole component: the running total is
 * ARITHMETIC IN THIS BROWSER. Flipping a switch issues no request, hits no
 * endpoint and waits for nothing, because a client deciding between a $7,400
 * vanity and no vanity does it four or five times in a row and a spinner
 * between each one is what makes a page feel like a form instead of a
 * conversation. The server re-sums the same lines at submit time and the schema
 * ties the stored total to its own snapshot, so nothing here is trusted - it is
 * just fast.
 *
 * WHAT A LOCKED LINE IS. Not a disabled switch: no switch. A disabled control
 * still says "this could have been yours to move", and these lines are the
 * bones of the job. They render in full, with their price, in their own group,
 * and there is nothing in the DOM to flip. The API refuses a payload missing
 * one (WEB-022), so this is the presentation of a rule rather than the rule.
 *
 * WHAT A BUNDLE SHOWS. A name, ONE price, and the member titles. The per-member
 * cents never left the admin - `publicView` strips them server-side, before
 * anything is serialized into this page's props.
 */
import { useMemo, useState } from 'react';
import {
  AirVent, ClipboardCheck, Columns3, Grid3x3, Grip, Hammer, House, Lamp, Layers,
  PaintRoller, Refrigerator, Ruler, ShowerHead, Square, Wrench, Zap,
  Lock, Check, CalendarClock, Loader2, type LucideIcon,
} from 'lucide-react';
import { usd } from '@/lib/proposals/money';
import type { PublicProposal, PublicProposalLine } from '@/lib/proposals/publicView';

/**
 * The registry's icon NAMES to glyphs (WEB-024).
 *
 * The registry decides which icon a category gets; this map only knows how to
 * draw one. A name with no glyph falls back to the house - the same fail-safe
 * direction the registry itself uses for a title it does not recognise - and
 * the acceptance tests assert every name in the registry is present here, so
 * the fallback stays a safety net rather than a silent default.
 */
const ICONS: Record<string, LucideIcon> = {
  'air-vent': AirVent,
  'clipboard-check': ClipboardCheck,
  'columns-3': Columns3,
  'grid-3x3': Grid3x3,
  grip: Grip,
  hammer: Hammer,
  house: House,
  lamp: Lamp,
  layers: Layers,
  'paint-roller': PaintRoller,
  refrigerator: Refrigerator,
  ruler: Ruler,
  'shower-head': ShowerHead,
  square: Square,
  wrench: Wrench,
  zap: Zap,
};

function LineIcon({ name, muted }: { name: string; muted?: boolean }) {
  const Glyph = ICONS[name] ?? House;
  return (
    <span
      aria-hidden="true"
      className={`mt-[1px] flex h-8 w-8 flex-none items-center justify-center rounded-[9px] ${
        muted ? 'bg-neutral-100 text-neutral-400' : 'bg-primary/10 text-primary-dark'
      }`}
    >
      <Glyph className="h-[17px] w-[17px]" strokeWidth={2} />
    </span>
  );
}

/** The member titles of a bundle. Titles only - see the note at the top. */
function Includes({ titles }: { titles: string[] }) {
  return (
    <div className="mt-[7px] rounded-[9px] border border-border/60 bg-background-soft px-[10px] py-2">
      <div className="text-[10.5px] font-extrabold uppercase tracking-[0.09em] text-text-secondary/70">
        Includes
      </div>
      {/* Keyed by position, not by title: two members of one bundle can
          legitimately carry the same title (two 'Recessed light' rows), and the
          list is static, so the index IS the identity here. */}
      <ul className="mt-1 list-disc pl-[15px]">
        {titles.map((t, i) => (
          <li key={`${i}-${t}`} className="text-[12.2px] leading-snug text-text-secondary">{t}</li>
        ))}
      </ul>
    </div>
  );
}

function LockedLine({ line }: { line: PublicProposalLine }) {
  return (
    <div className="flex items-start gap-3 border-b border-border/50 py-3 last:border-b-0">
      <LineIcon name={line.icon} muted />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm font-bold leading-snug text-text-primary">{line.title}</div>
          <div className="whitespace-nowrap text-sm font-bold text-text-primary">{usd(line.price_cents)}</div>
        </div>
        {line.description ? (
          <div className="mt-0.5 text-[12.3px] leading-snug text-text-secondary">{line.description}</div>
        ) : null}
        {line.includes.length > 0 ? <Includes titles={line.includes} /> : null}
        {line.includes.length > 0 ? (
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[10.5px] font-bold text-neutral-600">
            <Lock className="h-[11px] w-[11px]" strokeWidth={2.4} aria-hidden="true" />
            Part of the structure
          </span>
        ) : null}
      </div>
    </div>
  );
}

function OptionalLine({
  line, on, onToggle,
}: {
  line: PublicProposalLine;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 border-b border-border/50 py-3 last:border-b-0">
      <LineIcon name={line.icon} muted={!on} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className={`text-sm font-bold leading-snug ${on ? 'text-text-primary' : 'text-neutral-400'}`}>
            {line.title}
          </div>
          <div className={`whitespace-nowrap text-sm font-bold ${on ? 'text-text-primary' : 'text-neutral-400'}`}>
            {usd(line.price_cents)}
          </div>
        </div>
        {line.description ? (
          <div className="mt-0.5 text-[12.3px] leading-snug text-text-secondary">{line.description}</div>
        ) : null}
        {line.includes.length > 0 ? <Includes titles={line.includes} /> : null}
      </div>
      {/* 44px of target around a 27px switch - the house minimum, which
          globals.css only guarantees for buttons.
          The input FILLS that target rather than being `sr-only`: a visually
          hidden input is a 1px clipped box, so the only thing that could ever
          be clicked was the label around it, and anything that addresses the
          control itself - assistive tech driving the checkbox, an automated
          check, a stylus tap that lands on the switch rather than the row -
          was hitting a box the size of a full stop, or the section behind it. */}
      <span className="relative flex min-h-[44px] min-w-[44px] flex-none items-center justify-end">
        <input
          type="checkbox"
          className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          checked={on}
          onChange={onToggle}
          aria-label={`Include ${line.title}, ${usd(line.price_cents)}`}
        />
        <span
          aria-hidden="true"
          className={`relative block h-7 w-[46px] flex-none rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 ${
            on ? 'bg-primary' : 'bg-neutral-300'
          }`}
        >
          <span
            className={`absolute top-[3px] block h-[21px] w-[21px] rounded-full bg-white shadow transition-transform ${
              on ? 'translate-x-[22px]' : 'translate-x-[3px]'
            }`}
          />
        </span>
      </span>
    </label>
  );
}

interface Props {
  token: string;
  proposal: PublicProposal;
  bookingUrl: string | null;
}

export default function ProposalView({ token, proposal, bookingUrl }: Props) {
  const locked = useMemo(() => proposal.lines.filter((l) => !l.optional), [proposal.lines]);
  const optional = useMemo(() => proposal.lines.filter((l) => l.optional), [proposal.lines]);

  /**
   * What they have turned OFF, rather than what is on.
   *
   * The proposal arrives as the estimate we priced, so the honest starting
   * state is all of it: the switches are for taking things away, and an empty
   * set is "nothing taken away yet". Storing the inverse would mean seeding
   * state from the line list and keeping the two in step.
   */
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  /** Free early telemetry (WEB-027, partial): what they weighed up. */
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<'editing' | 'sending' | 'sent'>('editing');
  const [error, setError] = useState<string | null>(null);
  const [sentTotal, setSentTotal] = useState<number | null>(null);

  const includedLines = useMemo(
    () => proposal.lines.filter((l) => !l.optional || !excluded.has(l.id)),
    [proposal.lines, excluded],
  );
  const totalCents = useMemo(
    () => includedLines.reduce((acc, l) => acc + l.price_cents, 0),
    [includedLines],
  );
  const chosenCount = optional.length - excluded.size;
  /**
   * An all-optional proposal with every switch off (owner decision, 5 Aug 2026).
   *
   * There is nothing to send: the API's schema requires at least one line and
   * the table CHECKs the snapshot is non-empty, so a Send offered here could
   * only ever come back as a refusal - and a refusal about an unreadable payload
   * for a payload this page itself produced. The button is disabled and says
   * why, which is the answer a client turning everything down deserves. The
   * server guard stays exactly where it is; this is the explanation, not the
   * enforcement.
   */
  const nothingChosen = includedLines.length === 0;

  const toggle = (id: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setTouched((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    // A stale refusal sitting above a composition they have since changed reads
    // as a refusal OF that composition.
    setError(null);
  };

  const send = async () => {
    setPhase('sending');
    setError(null);
    try {
      const res = await fetch(`/api/proposal/${encodeURIComponent(token)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          included_line_ids: includedLines.map((l) => l.id),
          touched_line_ids: [...touched],
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error || 'We could not send that just now. Try again in a minute, or call us on (201) 212-4917.');
        setPhase('editing');
        return;
      }
      // The server's own re-sum, shown back rather than our local number: if the
      // two ever disagreed, the number they were promised should be the one we
      // hold.
      setSentTotal(typeof body?.total_cents === 'number' ? body.total_cents : totalCents);
      setPhase('sent');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError('We could not reach our system just now. Try again in a minute, or call us on (201) 212-4917.');
      setPhase('editing');
    }
  };

  if (phase === 'sent') {
    return (
      <main className="min-h-screen bg-background-soft px-5 py-10">
        <div className="mx-auto w-full max-w-lg rounded-2xl border border-border bg-card p-7 shadow-card">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary-dark">
            <Check className="h-6 w-6" strokeWidth={2.6} aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-2xl font-extrabold leading-tight text-text-primary">
            Sent to Alex
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-text-secondary">
            He has your proposal exactly as you left it, and he will call you within one business day to
            walk it through and book your start date. Nothing is charged and nothing is booked until
            you have spoken.
          </p>
          <div className="mt-5 rounded-xl bg-background-soft px-4 py-3">
            <div className="text-xs font-semibold text-text-secondary">What you sent</div>
            <div className="mt-1 text-2xl font-extrabold tracking-tight text-text-primary">
              {usd(sentTotal ?? totalCents)}
            </div>
            <div className="mt-1 text-xs text-text-secondary">
              {includedLines.length} line{includedLines.length === 1 ? '' : 's'}
              {proposal.lockedTotalCents > 0
                ? `, including ${usd(proposal.lockedTotalCents)} of structural work`
                : ''}.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPhase('editing')}
            className="mt-5 w-full rounded-xl border-[1.5px] border-primary bg-card px-5 text-sm font-bold text-primary-dark transition-colors hover:bg-primary/5"
          >
            Change something and send again
          </button>
          <p className="mt-3 text-center text-xs text-text-secondary">
            Changing your mind is fine - send it as many times as you need to.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background-soft">
      {/* Full-bleed on a phone, a bounded document from `sm` up. No
          `overflow-hidden` to clip the rounded corners: it would make the total
          bar's `position: sticky` stop working, so the bar rounds its own
          bottom corners instead. */}
      <div className="mx-auto w-full max-w-lg bg-card sm:my-8 sm:rounded-2xl sm:border sm:border-border sm:shadow-card">
        <header className="border-b border-border/60 px-[18px] pb-[14px] pt-4">
          <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-primary-dark">
            <House className="h-[15px] w-[15px]" strokeWidth={2.2} aria-hidden="true" />
            La Vaca General Contractors
          </div>
          <h1 className="mt-2.5 text-[19px] font-extrabold leading-tight text-text-primary">
            {proposal.title}
          </h1>
          <p className="text-[13px] text-text-secondary">Prepared for {proposal.clientName}</p>
        </header>

        <p className="border-b border-border/60 bg-primary/[0.03] px-[18px] py-3.5 text-[13.5px] leading-relaxed text-text-primary">
          Here is your project priced line by line. The work at the top is the bones of the job. The
          choices below are yours - switch them on or off and your total moves with them.
        </p>

        {locked.length > 0 ? (
          <section className="px-[18px] pb-1 pt-4">
            <div className="mb-2.5 flex items-center justify-between gap-2.5">
              <h2 className="text-xs font-extrabold uppercase tracking-[0.1em] text-text-secondary">
                Included in your project
              </h2>
              <span className="text-[11.5px] text-text-secondary/80">
                {locked.length} item{locked.length === 1 ? '' : 's'}
              </span>
            </div>
            {locked.map((line) => <LockedLine key={line.id} line={line} />)}
          </section>
        ) : null}

        {optional.length > 0 ? (
          <section className="border-t-8 border-background-soft px-[18px] pb-1 pt-4">
            <div className="mb-2.5 flex items-center justify-between gap-2.5">
              <h2 className="text-xs font-extrabold uppercase tracking-[0.1em] text-text-secondary">
                Your choices
              </h2>
              <span className="text-[11.5px] text-text-secondary/80" data-testid="proposal-chosen-count">
                {chosenCount} of {optional.length} on
              </span>
            </div>
            {optional.map((line) => (
              <OptionalLine
                key={line.id}
                line={line}
                on={!excluded.has(line.id)}
                onToggle={() => toggle(line.id)}
              />
            ))}
          </section>
        ) : null}

        <div className="sticky bottom-0 border-t border-border bg-card px-[18px] pb-[18px] pt-3.5 shadow-[0_-8px_20px_-12px_rgba(0,0,0,0.18)] sm:rounded-b-2xl">
          {error ? (
            <p role="alert" className="mb-2.5 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] leading-snug text-red-800">
              {error}
            </p>
          ) : null}
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12.5px] font-semibold text-text-secondary">Your total</span>
            <span
              className="text-[26px] font-extrabold tracking-tight text-text-primary"
              aria-live="polite"
              data-testid="proposal-total"
            >
              {usd(totalCents)}
            </span>
          </div>
          <p className="mt-[3px] text-[11.5px] text-text-secondary/80">
            {proposal.lockedTotalCents > 0
              ? `Includes ${usd(proposal.lockedTotalCents)} of structural work`
              : 'Every line here is yours to choose'}
            {optional.length > 0 ? ` and ${chosenCount} of your ${optional.length} choices` : ''}.
          </p>
          {nothingChosen ? (
            <p
              id="proposal-nothing-chosen"
              className="mt-2.5 rounded-lg bg-background-soft px-3 py-2 text-[12.5px] leading-snug text-text-secondary"
            >
              Turn at least one choice on, or call us on (201) 212-4917 and we will talk through a
              different scope.
            </p>
          ) : null}
          <button
            type="button"
            onClick={send}
            disabled={phase === 'sending' || nothingChosen}
            aria-describedby={nothingChosen ? 'proposal-nothing-chosen' : undefined}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-[15.5px] font-extrabold text-white shadow-button transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-primary"
          >
            {phase === 'sending' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Sending
              </>
            ) : 'Send this back to Alex'}
          </button>
          {bookingUrl ? (
            <a
              href={bookingUrl}
              className="mt-2 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-primary bg-card px-5 text-[14.5px] font-bold text-primary-dark transition-colors hover:bg-primary/5"
            >
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
              Book a time to talk it through
            </a>
          ) : null}
          <p className="mt-2.5 text-center text-[11px] leading-snug text-text-secondary/80">
            This page is private to you. Anyone you share the link with can see it.
          </p>
        </div>
      </div>
    </main>
  );
}
