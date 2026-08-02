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

export interface CompletionContext {
  firstName: string | null;
  projectType: string | null;
  answers: Record<string, string>;
  phone?: string | null;
  email?: string | null;
  photoCount?: number;
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
} as const;

export function completionMessage(ctx: CompletionContext): string {
  const a = ctx.answers;
  const who = ctx.firstName || 'A lead';
  const esc = escapeTelegramClipped;

  const row = (label: string, value: string | null | undefined, max: number): string | null =>
    value ? `<b>${label}</b> ${esc(value, max)}` : null;

  const lines: (string | null)[] = [
    `<b>Intake finished - ${esc(who, CAP.name)}</b>`,
    ctx.projectType ? esc(ctx.projectType, CAP.projectType) : null,
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
    ctx.photoCount ? `<b>Photos</b> ${ctx.photoCount} attached` : null,
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
