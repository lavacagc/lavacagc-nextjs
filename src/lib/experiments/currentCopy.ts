/**
 * What each surface shows today, as a payload ready to paste as an
 * experiment's control (skill step "the control is today's copy").
 *
 * The page default is the code's copy (i18n.ts on /home-services), unless an
 * experiment on that element is live or concluded, in which case its control
 * is what visitors without a challenger see. Pure: the caller passes the
 * experiments it read.
 */
import { s, type StringKey } from '@/lib/home-services/i18n';
import { HOME_SERVICES_SECTIONS, SURFACES } from './surfaces';
import { LIVE_STATUSES, type ExperimentPayload, type ExperimentRow } from './types';

const CODE_COPY: Record<string, Partial<Record<keyof ExperimentPayload, StringKey>>> = {
  '/home-services hero': { eyebrow: 'heroEyebrow', title: 'heroTitle', body: 'heroBody', cta: 'heroCta' },
  '/home-services services-heading': { heading: 'servicesTitle', intro: 'servicesIntro' },
};

export interface SurfaceCopy {
  page: string;
  element: string;
  /** Where the copy comes from: the code, or the control of an experiment. */
  source: string;
  payload: ExperimentPayload;
}

type CopySource = Pick<ExperimentRow, 'key' | 'page' | 'element' | 'status' | 'control_key' | 'concluded_at'> & {
  variants: Array<{ key: string; payload: ExperimentPayload }>;
};

export function currentCopy(experiments: CopySource[]): SurfaceCopy[] {
  return SURFACES.map((surface) => {
    const here = experiments
      .filter((e) => e.page === surface.page && e.element === surface.element)
      .filter((e) => (LIVE_STATUSES as readonly string[]).includes(e.status) || e.status === 'concluded')
      .sort((a, b) => ((LIVE_STATUSES as readonly string[]).includes(a.status) ? -1 : 0) - ((LIVE_STATUSES as readonly string[]).includes(b.status) ? -1 : 0) || (b.concluded_at ?? '').localeCompare(a.concluded_at ?? ''));
    const exp = here[0];
    const control = exp?.variants.find((v) => v.key === exp.control_key);
    if (exp && control) {
      return { page: surface.page, element: surface.element, source: `control ${control.key} of ${exp.key} (${exp.status})`, payload: control.payload };
    }
    const keys = CODE_COPY[`${surface.page} ${surface.element}`];
    const payload: ExperimentPayload = {};
    if (keys) {
      for (const [slot, key] of Object.entries(keys)) {
        (payload as Record<string, unknown>)[slot] = { en: s(key as StringKey, 'en'), es: s(key as StringKey, 'es') };
      }
    }
    if (surface.element === 'sections') payload.order = [...HOME_SERVICES_SECTIONS];
    return { page: surface.page, element: surface.element, source: keys || surface.element === 'sections' ? 'code default' : 'none', payload };
  });
}
