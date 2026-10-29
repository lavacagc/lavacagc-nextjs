/**
 * withExperiment(page, element, lang): the variant payload a server component
 * renders for one element, applied on the server so the HTML a visitor (or a
 * crawler) receives already carries it. No flicker, no client swap.
 *
 *  - a live experiment: the visitor's hashed variant (seed from `cta_v`,
 *    see assign.ts); a crawler or a visitor without a seed gets the control
 *    and is not counted.
 *  - a concluded experiment: its control, which is the promoted winner. That
 *    is how a promotion becomes the page default.
 *  - a signed-in admin with `?exp=<key>:<variant>` (middleware verifies the
 *    session and forwards it as x-exp-preview): that variant, drafts
 *    included, and nothing is recorded.
 *  - otherwise null: the page renders its own defaults.
 *
 * Reads cookies and headers, so the calling page renders per request (the
 * /home-services pages already do, for the language cookie).
 */
import { cookies, headers } from 'next/headers';
import { CTA_ASSIGN_COOKIE } from '@/lib/cta/types';
import { parsePreview, PREVIEW_HEADER, resolveAssignment, seedFromCookie, type AssignmentReason } from './assign';
import { getExperiment, pickExperiment, renderableExperiments } from './store.server';
import { copyFor, COPY_SLOTS, type ExperimentPayload, type ExperimentVariant } from './types';

export interface ResolvedPayload {
  copy: Partial<Record<(typeof COPY_SLOTS)[number], string>>;
  image?: string;
  color?: string;
  order?: string[];
}

export interface AppliedExperiment {
  key: string;
  variant: string;
  reason: AssignmentReason | 'concluded';
  /** True only for a hashed human on a live experiment: the page renders the tracker. */
  track: boolean;
  preview: boolean;
  payload: ResolvedPayload;
}

export function resolvePayload(payload: ExperimentPayload, lang: 'en' | 'es'): ResolvedPayload {
  const copy: ResolvedPayload['copy'] = {};
  for (const slot of COPY_SLOTS) {
    const text = copyFor(payload[slot], lang);
    if (text) copy[slot] = text;
  }
  return { copy, image: payload.image, color: payload.color, order: payload.order };
}

function applied(key: string, variant: ExperimentVariant, lang: 'en' | 'es', reason: AppliedExperiment['reason'], track: boolean): AppliedExperiment {
  return { key, variant: variant.key, reason, track, preview: reason === 'preview', payload: resolvePayload(variant.payload, lang) };
}

export async function withExperiment(page: string, element: string, lang: 'en' | 'es'): Promise<AppliedExperiment | null> {
  const [all, h, jar] = await Promise.all([renderableExperiments(), headers(), cookies()]);
  const preview = parsePreview(h.get(PREVIEW_HEADER));

  if (preview) {
    // Drafts are not in the render cache, so a preview reads the row itself.
    const row = await getExperiment(preview.key).catch(() => null);
    if (row && row.page === page && row.element === element) {
      const named = row.variants.find((v) => v.key === preview.variant);
      if (named) return applied(row.key, named, lang, 'preview', false);
    }
  }

  const exp = pickExperiment(all, page, element);
  if (!exp) return null;

  if (exp.status === 'concluded') {
    const control = exp.variants.find((v) => v.key === exp.control_key);
    return control ? applied(exp.key, control, lang, 'concluded', false) : null;
  }

  const assignment = resolveAssignment({
    experimentKey: exp.key,
    variants: exp.variants,
    controlKey: exp.control_key,
    seed: seedFromCookie(jar.get(CTA_ASSIGN_COOKIE)?.value),
    userAgent: h.get('user-agent'),
  });
  if (!assignment) return null;
  return applied(exp.key, assignment.variant, lang, assignment.reason, assignment.track);
}
