/**
 * "The intake is finished, here is the brief" - the Telegram that arrives when
 * a lead completes the flow.
 *
 * Without this the notification order is backwards. The new-lead alert fires at
 * form submission, when all we know is a name and a project type. The lead then
 * spends three minutes telling us the scope, the timeline, how our starting
 * price landed, the address and when to call - and nobody is told any of it.
 * Alex would ring holding strictly less than the lead had already given us.
 *
 * Telegram only, deliberately. This is a brief to read on a phone before
 * picking it up, not an archive; the answers are on the lead row either way.
 */
import { sendTelegramMessage, escapeTelegramClipped, type TelegramOutcome } from '@/lib/notify/telegramMessage';
import { HOT_AT } from './scoring';

export interface CompletionContext {
  firstName: string | null;
  projectType: string | null;
  answers: Record<string, string>;
  /**
   * The routing decision (WEB-01A), when one was made. Leads the brief, because
   * "is this worth dropping what I am doing for" is the first thing the owner
   * wants to know from a phone.
   *
   * `recorded` is whether the decision reached the lead row. False must be said
   * out loud: a brief that announces a routing the lead has no record of is
   * exactly the state `recordRouting` returns its boolean to avoid. null is a
   * session with no lead row - nothing was due, so nothing is warned about.
   *
   * `signals` are the scorer's own words for how it got there. The brief needs
   * them because the bucket can disagree with the score: an unreadable photo
   * count routes a 45 hot, and "HOT LEAD (45/100)" under a threshold of 55 with
   * no explanation reads to the owner as a bug in the scoring.
   */
  routing?: {
    bucket: 'hot' | 'cold';
    score: number;
    /**
     * What the score was out of. 80 for a project type the flow never asks
     * about price on, so the banner shows the scale the lead was measured on
     * rather than implying a 100 they could not have reached.
     */
    outOf?: number;
    recorded?: boolean | null;
    signals?: string[];
  } | null;
  phone?: string | null;
  email?: string | null;
  /**
   * The photo count, null when it could not be read - which is a different
   * thing from the zero of a lead who sent none, and renders differently.
   * Omitted entirely when the caller has no count to offer either way.
   */
  photoCount?: number | null;
  /** What we told them the work starts at, if anything. */
  priceAnchor?: number | null;
}

/* ── how the stored values read to a human ────────────────────────────────── */

const SCOPE: Record<string, string> = {
  full_gut: 'Full gut, back to studs',
  major_update: 'Major update, moving some walls',
  refresh: 'Refresh, finishes only',
  own_details: 'Described it themselves',
};

const FINISH: Record<string, string> = {
  high_end: 'High end',
  middle: 'Middle',
  practical: 'Practical',
};

const TIMELINE: Record<string, string> = {
  asap: 'As soon as possible',
  '1_3_months': '1 to 3 months',
  '3_6_months': '3 to 6 months',
  later_this_year: 'Later this year',
  planning: 'Just planning',
};

const CONTACT: Record<string, string> = {
  morning: 'Weekday mornings',
  afternoon: 'Weekday afternoons',
  evening: 'Evenings after 5',
  weekends: 'Weekends',
  anytime: 'Anytime',
};

/**
 * The money signal, said in plain words rather than as a code.
 *
 * This is the single most useful line in the message: it is the only read we
 * have on whether the job is affordable to them, and it was obtained without
 * ever asking what their budget was.
 */
export function reactionLine(reaction: string | undefined, anchor: number | null | undefined): string | null {
  if (!reaction) return null;
  const shown = anchor ? `$${anchor.toLocaleString('en-US')}` : 'our starting price';
  switch (reaction) {
    case 'about_expected':
      return `${shown} landed about where they expected`;
    case 'a_bit_more':
      return `${shown} is a bit more than they planned`;
    case 'well_above':
      return `${shown} is WELL ABOVE what they planned`;
    case 'below_expected':
      return `${shown} is less than they expected`;
    default:
      return null;
  }
}

/** How hard this one is worth chasing, from the two signals that carry it. */
export function urgencyLine(timeline: string | undefined, reaction: string | undefined): string | null {
  const soon = timeline === 'asap' || timeline === '1_3_months';
  const priceOk = reaction === 'about_expected' || reaction === 'below_expected';
  if (soon && priceOk) return 'Ready to go and the number works. Call this one first.';
  if (soon && reaction === 'well_above') return 'Wants to start soon but the number is a stretch. Lead with scope options.';
  if (reaction === 'well_above') return 'The number is a stretch for them. Lead with scope options.';
  if (timeline === 'planning') return 'Still planning. No rush, but they gave us everything.';
  return null;
}

/**
 * Per-field budgets, counted in escaped characters.
 *
 * Three of these fields are freeform, and `isValidAnswer` lets each run to 2000
 * characters. Telegram rejects the whole sendMessage over 4096 with a 400, so
 * without a cap the most engaged lead - the one who wrote a long description
 * AND took the "Add my own details" branch - is exactly the one whose brief
 * never arrives. These sum to roughly 2,700 with the labels, which leaves room
 * for the whole of the rest of the message.
 */
const CAP = {
  name: 60,
  projectType: 80,
  message: 900,
  scopeDetail: 700,
  address: 200,
  preset: 80,
  phone: 40,
  line: 160,
  note: 240,
} as const;

/**
 * Why a bucket that disagrees with its own score is not a bug.
 *
 * Two ways it can happen: an unreadable photo count routed hot on the benefit
 * of the doubt, and a project type the flow never asked about price on, which
 * is judged out of 80 and hot at 44. The scorer puts whichever decided it
 * first, so the brief quotes it rather than re-deriving the reasoning
 * downstream and risking a different account of the same decision.
 */
export function bucketExplanation(routing: CompletionContext['routing']): string | null {
  if (!routing || routing.bucket !== 'hot' || routing.score >= HOT_AT) return null;
  return routing.signals?.[0]
    ?? `Under the usual ${HOT_AT} needed, and routed hot on the benefit of the doubt.`;
}

export function completionMessage(ctx: CompletionContext): string {
  const a = ctx.answers;
  const who = ctx.firstName || 'A lead';
  const esc = escapeTelegramClipped;

  const row = (label: string, value: string | null | undefined, max: number): string | null =>
    value ? `<b>${label}</b> ${esc(value, max)}` : null;

  // A hot lead announces itself. A cold one still gets the full brief - cold is
  // a different destination, not a bin - but it does not shout.
  const out = ctx.routing ? `${ctx.routing.score}/${ctx.routing.outOf ?? 100}` : '';
  const banner = ctx.routing
    ? ctx.routing.bucket === 'hot'
      ? `\u{1F525} <b>HOT LEAD (${out}) - ${esc(who, CAP.name)}</b>`
      : `<b>Intake finished - ${esc(who, CAP.name)}</b> (cold, ${out})`
    : `<b>Intake finished - ${esc(who, CAP.name)}</b>`;

  const explained = bucketExplanation(ctx.routing);

  const lines: (string | null)[] = [
    banner,
    ctx.projectType ? esc(ctx.projectType, CAP.projectType) : null,
    // Both of these sit directly under the banner, because each qualifies a
    // claim the banner itself makes - the score it shows, and that it was saved.
    explained ? `<i>${esc(explained, CAP.note)}</i>` : null,
    ctx.routing && ctx.routing.recorded === false
      ? '⚠️ <b>NOT saved to the lead</b> - this routing decision exists only in this message.'
      : null,
    '',
    a.message ? `<i>"${esc(a.message, CAP.message)}"</i>` : null,
    a.message ? '' : null,
    row('Scope', SCOPE[a.scope_tier] ?? a.scope_tier, CAP.preset),
    a.scope_detail ? `<b>In their words</b> ${esc(a.scope_detail, CAP.scopeDetail)}` : null,
    row('Finish', FINISH[a.finish_level] ?? a.finish_level, CAP.preset),
    row('Timeline', TIMELINE[a.project_timeline] ?? a.project_timeline, CAP.preset),
    row('Town', a.city, CAP.preset),
    row('Address', a.address, CAP.address),
    row('Call them', CONTACT[a.contact_time_preference] ?? a.contact_time_preference, CAP.preset),
    ctx.phone ? row('Phone', ctx.phone, CAP.phone) : null,
    // A count that could not be read is not a lead who sent none, and the brief
    // is the surface the owner reads before picking up the phone - the one place
    // that distinction may not go quiet.
    ctx.photoCount === undefined
      ? null
      : ctx.photoCount === null
        ? '<b>Photos</b> count unavailable - could not be read'
        : ctx.photoCount > 0
          ? `<b>Photos</b> ${ctx.photoCount} attached`
          : '<b>Photos</b> none sent',
    '',
  ];

  const money = reactionLine(a.price_reaction, ctx.priceAnchor);
  if (money) lines.push(`\u{1F4B0} ${esc(money, CAP.line)}`);

  const urgency = urgencyLine(a.project_timeline, a.price_reaction);
  if (urgency) lines.push(`\u{1F449} ${esc(urgency, CAP.line)}`);

  return lines.filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Send it. Awaited by the caller, never fire-and-forget: a serverless response
 * that returns first kills the outbound fetch, which is how notifications go
 * missing on Vercel.
 */
export async function sendCompletionAlert(ctx: CompletionContext): Promise<TelegramOutcome> {
  try {
    return await sendTelegramMessage(completionMessage(ctx));
  } catch (err) {
    console.error('[intake] completion alert threw:', err);
    return 'failed';
  }
}
