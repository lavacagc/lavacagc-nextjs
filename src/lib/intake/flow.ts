/**
 * The intake conversation, as pure data.
 *
 * There is no model call anywhere in this file or in anything that imports it.
 * Every question is either a preset list or a plain text field, which is what
 * makes each answer a clean database column instead of a sentence somebody has
 * to interpret later - and what makes the whole flow unit-testable without a
 * browser or a database.
 *
 * Order is WEB-015's: warmest first, most revealing last, so each easy answer
 * makes the next one feel natural. The word "budget" appears nowhere in the
 * copy, deliberately - see `pricing.ts` for how the money question is asked
 * instead.
 */
import { priceAnchorFor, hasPriceAnchor, NO_ANCHOR_SENTENCE } from './pricing';
import { isServiceArea } from './serviceArea';

export type StepId =
  | 'consent'
  | 'project'
  | 'town'
  | 'scope'
  | 'scope_detail'
  | 'finish'
  | 'timeline'
  | 'price'
  | 'address'
  | 'contact_time'
  | 'done'
  | 'declined';

export type StepKind = 'buttons' | 'text';

export interface StepOption {
  /** Stored value. Stable, snake_case, never shown to the lead. */
  value: string;
  /** What the lead reads on the button. */
  label: string;
  /** Quieter styling. Still a real answer, not an escape hatch. */
  soft?: boolean;
}

export interface Step {
  id: StepId;
  kind: StepKind;
  /** One bubble per entry, rendered in order. */
  say: string[];
  options?: StepOption[];
  /** Placeholder for a text step. */
  placeholder?: string;
  /** Where the answer lands. Absent for steps that store nothing. */
  field?: string;
}

export interface FlowContext {
  firstName: string;
  projectType: string | null;
  /** The town the lead typed at the `town` step, once they have. */
  town?: string | null;
  /** How they answered `scope`, which decides whether `scope_detail` is asked. */
  scope?: string | null;
  /** Their contact-time answer, used to personalise the close. */
  contactTime?: string | null;
}

/* ── the money question ───────────────────────────────────────────────────── */

const PRICE_REACTIONS: StepOption[] = [
  { value: 'about_expected', label: 'About what I expected' },
  { value: 'a_bit_more', label: 'A bit more than I planned' },
  { value: 'well_above', label: 'Well above what I planned' },
  // "Under what I'd budgeted" was the approved wording, changed to this by one
  // word: it was the only place in the whole flow the word "budget" appeared,
  // and keeping that guarantee absolute is worth more than the original phrase.
  { value: 'below_expected', label: 'Less than I expected' },
];

/* ── the steps ────────────────────────────────────────────────────────────── */

/**
 * Build the step a lead is currently on.
 *
 * Steps are built rather than held as a constant because three of them read
 * context: the opener uses the first name, the price step uses the project
 * type, and the scope acknowledgement depends on whether the town matched.
 */
export function buildStep(id: StepId, ctx: FlowContext): Step {
  const first = ctx.firstName || 'there';
  const project = ctx.projectType ? ctx.projectType.toLowerCase() : 'project';

  switch (id) {
    case 'consent':
      return {
        id,
        kind: 'buttons',
        say: [
          `Hi ${first}. I'm La Vaca's AI assistant.`,
          `Thanks for reaching out about your ${project}. Alex asked me to get a few details down before he calls, so the call can be about your project instead of paperwork.`,
          'This should take about 3 minutes. Is that okay?',
        ],
        options: [
          { value: 'yes', label: 'Sure, go ahead' },
          { value: 'no', label: "I'd rather just get a call", soft: true },
        ],
      };

    case 'project':
      return {
        id,
        kind: 'text',
        field: 'message',
        placeholder: 'Type your answer',
        say: [
          'Great. Tell me about your project, in your own words. What are you hoping to do?',
          'If you have photos of the space, add them here too. Alex will look at them before he calls.',
        ],
      };

    case 'town':
      return {
        id,
        kind: 'text',
        field: 'city',
        placeholder: 'Your town',
        say: [
          'Perfect, thank you.',
          "What town are you in? We're in Essex County and work across Essex, Morris and Bergen, so this tells me who's closest to you.",
        ],
      };

    case 'scope': {
      // The warm line is only true for towns we are actually near, so it is
      // only said for those. An unmatched town gets the question with no
      // preamble rather than a pleasantry that is false.
      const warm = isServiceArea(ctx.town) ? ["Good, that's ten minutes from us."] : [];
      return {
        id,
        kind: 'buttons',
        field: 'scope_tier',
        say: [...warm, 'Is this a full gut, or more of a refresh?'],
        options: [
          { value: 'full_gut', label: 'Full gut, back to studs' },
          { value: 'major_update', label: 'Major update, moving some walls' },
          { value: 'refresh', label: 'Refresh, new finishes on the same bones' },
          { value: 'own_details', label: 'Add my own details', soft: true },
        ],
      };
    }

    case 'scope_detail':
      return {
        id,
        kind: 'text',
        field: 'scope_detail',
        placeholder: 'Describe the scope',
        say: ['Go ahead, tell me what the scope looks like.'],
      };

    case 'finish':
      return {
        id,
        kind: 'buttons',
        field: 'finish_level',
        say: ['And on finishes, where are you leaning?'],
        options: [
          { value: 'high_end', label: 'High end, this is our forever home' },
          { value: 'middle', label: 'Somewhere in the middle' },
          { value: 'practical', label: 'Practical, solid but sensible' },
        ],
      };

    case 'timeline':
      return {
        id,
        kind: 'buttons',
        field: 'project_timeline',
        say: ['When are you hoping to start?'],
        options: [
          { value: 'asap', label: 'As soon as we can' },
          { value: '1_3_months', label: '1 to 3 months' },
          { value: '3_6_months', label: '3 to 6 months' },
          { value: 'later_this_year', label: 'Later this year' },
          { value: 'planning', label: 'Just planning for now', soft: true },
        ],
      };

    case 'price': {
      const anchor = priceAnchorFor(ctx.projectType);
      // Callers should not route here without an anchor - `nextStep` skips the
      // step entirely - but if one does, say the honest thing rather than
      // render an empty question.
      if (!anchor) {
        return { id, kind: 'buttons', say: [NO_ANCHOR_SENTENCE], options: PRICE_REACTIONS };
      }
      return {
        id,
        kind: 'buttons',
        field: 'price_reaction',
        say: [
          'One more, then the easy ones.',
          `${anchor.sentence} That's not a quote, I just don't want to waste your afternoon.`,
          'Where does that sit against what you had in mind?',
        ],
        options: PRICE_REACTIONS,
      };
    }

    case 'address':
      return {
        id,
        kind: 'text',
        field: 'address',
        placeholder: 'Street address, town',
        say: ["What's the address, so we can get someone out to you?"],
      };

    case 'contact_time':
      return {
        id,
        kind: 'buttons',
        field: 'contact_time_preference',
        say: ["Last one. When's usually good to reach you?"],
        // These five values are five of the six the leads table's check
        // constraint allows, so no answer here can be rejected on write.
        options: [
          { value: 'morning', label: 'Weekday mornings' },
          { value: 'afternoon', label: 'Weekday afternoons' },
          { value: 'evening', label: 'Evenings after 5' },
          { value: 'weekends', label: 'Weekends' },
          { value: 'anytime', label: 'Anytime works', soft: true },
        ],
      };

    case 'declined':
      return {
        id,
        kind: 'buttons',
        say: [
          'Of course, no problem at all.',
          `Alex or Veronica will call you within 24 hours, ${first}. Nothing else needed from you.`,
        ],
      };

    case 'done':
      return {
        id,
        kind: 'buttons',
        say: [
          `That's everything, thank you ${first}.`,
          closingPromise(ctx.contactTime),
          "They'll have your photos and everything you told me, so you won't have to repeat any of it. If something changes before then, just reply to the email I sent you.",
        ],
      };
  }
}

/**
 * WEB-018's promise, stated explicitly rather than implied, and reflecting the
 * contact-time answer when there is one so the close does not ignore what they
 * just told us.
 */
export function closingPromise(contactTime: string | null | undefined): string {
  const base = 'Alex or Veronica will call you within 24 hours';
  switch (contactTime) {
    case 'morning':
      return `${base}, and they'll aim for a morning.`;
    case 'afternoon':
      return `${base}, and they'll aim for an afternoon.`;
    case 'evening':
      return `${base}, and they'll aim for an evening.`;
    case 'weekends':
      return `${base}, and they'll try for the weekend.`;
    default:
      return `${base}.`;
  }
}

/**
 * Where a given answer leads.
 *
 * Two branches carry real weight. Declining at `consent` ends the flow
 * immediately rather than nagging, and the price step is skipped whole for
 * project types with no honest starting number.
 */
export function nextStep(current: StepId, answer: string, ctx: FlowContext): StepId {
  switch (current) {
    case 'consent':
      return answer === 'yes' ? 'project' : 'declined';
    case 'project':
      return 'town';
    case 'town':
      return 'scope';
    case 'scope':
      return answer === 'own_details' ? 'scope_detail' : 'finish';
    case 'scope_detail':
      return 'finish';
    case 'finish':
      return 'timeline';
    case 'timeline':
      return hasPriceAnchor(ctx.projectType) ? 'price' : 'address';
    case 'price':
      return 'address';
    case 'address':
      return 'contact_time';
    case 'contact_time':
      return 'done';
    default:
      return current;
  }
}

/** A step that ends the conversation. No further answers are accepted. */
export function isTerminal(id: StepId): boolean {
  return id === 'done' || id === 'declined';
}

/** Validate an answer before it is written. Presets must be a listed value. */
export function isValidAnswer(step: Step, answer: string): boolean {
  const trimmed = answer.trim();
  if (!trimmed) return false;
  if (step.kind === 'buttons') {
    return (step.options ?? []).some((o) => o.value === trimmed);
  }
  return trimmed.length <= 2000;
}
