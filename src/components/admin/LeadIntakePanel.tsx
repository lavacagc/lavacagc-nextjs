'use client';

import { useEffect, useState } from 'react';
import { MessageSquareQuote, Image as ImageIcon, Loader2 } from 'lucide-react';

/**
 * What a lead told us in the intake chat, shown inside their lead card.
 *
 * Before this there was no reader for any of it. The answers, the sentences
 * leads typed themselves and their uploaded photos were all stored correctly
 * and only reachable by querying the database - so in practice the single
 * Telegram alert was the record, and once it scrolled past, the information
 * was gone.
 *
 * RENDERS NOTHING for a lead with no session, which is most of them. An empty
 * panel full of "N/A" on every lead would make the leads list worse, not
 * better, and would train the eye to skip the section that matters.
 */

interface IntakeResponse {
  hasIntake: boolean;
  startedAt?: string;
  complete?: boolean;
  answers?: Record<string, unknown>;
  inTheirWords?: { step: string | null; body: string; at: string }[];
  photos?: { url: string; uploadedAt: string }[];
}

/** Field keys already shown on the lead card itself - not repeated here. */
const ALREADY_ON_THE_CARD = new Set(['city', 'address', 'message', 'contact_time_preference']);

/** Machine values into the words the owner uses. */
const LABELS: Record<string, string> = {
  scope_tier: 'Scope',
  finish_level: 'Finish level',
  project_timeline: 'Timeline',
  price_reaction: 'Reaction to price',
  scope_detail: 'Scope detail',
};
const VALUES: Record<string, string> = {
  full_gut: 'Full gut',
  practical: 'Practical',
  premium: 'Premium',
  asap: 'ASAP',
  about_expected: 'About what they expected',
  higher: 'Higher than expected',
  lower: 'Lower than expected',
};
const pretty = (v: unknown) =>
  typeof v === 'string' ? VALUES[v] ?? v.replace(/_/g, ' ') : String(v);

/**
 * One state value rather than three booleans, and it is only ever set from a
 * settled fetch - never synchronously in the effect body, which cascades
 * renders. Resetting to `loading` when the id changes is handled by mounting
 * this with key={lead.id}: a remount cannot show the previous lead's photos
 * under the current lead's name, which a manual reset can if it races.
 */
type PanelState =
  | { phase: 'loading' }
  | { phase: 'failed' }
  | { phase: 'ready'; data: IntakeResponse };

export function LeadIntakePanel({ leadId }: { leadId: string }) {
  const [state, setState] = useState<PanelState>({ phase: 'loading' });

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/leads/${leadId}/intake`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<IntakeResponse>;
      })
      .then((body) => { if (live) setState({ phase: 'ready', data: body }); })
      .catch(() => {
        // A failed read says so. Rendering nothing would be indistinguishable
        // from "this lead never did the intake", which is a different fact.
        if (live) setState({ phase: 'failed' });
      });
    return () => { live = false; };
  }, [leadId]);

  if (state.phase === 'loading') {
    return (
      <div className="flex items-center gap-2 pt-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading what they told us…
      </div>
    );
  }
  if (state.phase === 'failed') {
    return (
      <p className="pt-2 text-sm text-amber-700">
        Could not load this lead&apos;s intake just now. Everything else on this card is unaffected.
      </p>
    );
  }
  const data = state.data;
  if (!data.hasIntake) return null;

  const answers = Object.entries(data.answers ?? {})
    .filter(([k, v]) => !ALREADY_ON_THE_CARD.has(k) && v !== null && v !== '');

  return (
    <div className="mt-3 rounded-lg border border-primary/40 bg-primary/5 p-4" data-testid="lead-intake-panel">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          What they told us
        </span>
        <span className="rounded-[5px] bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">
          {data.complete ? 'intake complete' : 'intake started'}
        </span>
        {(data.photos?.length ?? 0) > 0 && (
          <span className="rounded-[5px] border border-border px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
            {data.photos!.length} photo{data.photos!.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {answers.length > 0 && (
        <dl className="grid grid-cols-[minmax(90px,auto)_1fr] gap-x-3 gap-y-1 text-sm">
          {answers.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{LABELS[k] ?? k.replace(/_/g, ' ')}</dt>
              <dd className="font-medium">{pretty(v)}</dd>
            </div>
          ))}
        </dl>
      )}

      {(data.inTheirWords?.length ?? 0) > 0 && (
        <div className="mt-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <MessageSquareQuote className="h-3.5 w-3.5" aria-hidden="true" />
            In their own words
          </p>
          {data.inTheirWords!.map((m, i) => (
            <blockquote key={i} className="border-l-[3px] border-primary pl-3 text-sm">
              {m.body}
            </blockquote>
          ))}
        </div>
      )}

      {(data.photos?.length ?? 0) > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Photos they sent
          </p>
          <div className="flex flex-wrap gap-2">
            {data.photos!.map((p, i) => (
              <a
                key={i}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-md border transition-opacity hover:opacity-90"
                title="Open full size (link expires)"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`Photo ${i + 1} from this lead`} className="h-20 w-28 object-cover" loading="lazy" />
              </a>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Links expire, so they cannot be forwarded by accident. Save the image if you need to keep it.
          </p>
        </div>
      )}
    </div>
  );
}
