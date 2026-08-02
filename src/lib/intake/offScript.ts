/**
 * WEB-017: a freeform question is caught, never answered.
 *
 * The bot acknowledges, promises a real answer, routes the message to Alex and
 * Veronica, and re-asks the question the lead was on. No model is involved at
 * any point, which is the whole reason this file exists rather than a prompt.
 */
import { sendTelegramMessage, escapeTelegram } from '@/lib/notify/telegramMessage';
import { sendTrackedEmail } from '@/lib/notify/sendEmail';

export interface OffScriptContext {
  firstName: string | null;
  email: string | null;
  phone: string | null;
  projectType: string | null;
  question: string;
  intakeUrl: string | null;
}

/** Where the two notifications ended up. Neither is allowed to fail silently. */
export interface RouteOutcome {
  telegram: 'sent' | 'not_configured' | 'failed';
  email: 'sent' | 'failed';
}

/** True when at least one human channel actually carried the question. */
export function reachedAHuman(outcome: RouteOutcome): boolean {
  return outcome.telegram === 'sent' || outcome.email === 'sent';
}

/**
 * Telegram's HTML parse mode supports EXACTLY three entities: &lt;, &gt; and
 * &amp;. Anything else - &middot;, &#128222; - is delivered as literal text, so
 * the message arrives reading "Alex &middot; Kitchen". Real characters only.
 */
export function offScriptTelegram(ctx: OffScriptContext): string {
  const who = ctx.firstName || ctx.email || 'A lead';
  const lines = [
    '<b>Question from a lead, mid-intake</b>',
    '',
    `<b>${escapeTelegram(who)}</b>${ctx.projectType ? ` · ${escapeTelegram(ctx.projectType)}` : ''}`,
    ctx.phone ? `\u{1F4DE} ${escapeTelegram(ctx.phone)}` : null,
    ctx.email ? `✉️ ${escapeTelegram(ctx.email)}` : null,
    '',
    `<i>"${escapeTelegram(ctx.question)}"</i>`,
    '',
    'The assistant did NOT answer this. It told them you would, on the call.',
  ];
  return lines.filter((l) => l !== null).join('\n');
}

export function offScriptEmail(ctx: OffScriptContext): { subject: string; html: string; text: string } {
  const who = ctx.firstName || ctx.email || 'A lead';
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const FF = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

  const subject = `Question from ${who} during intake`;
  const html = `<div style="font-family:${FF};max-width:560px;margin:0 auto;padding:24px;color:#222">
  <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#ea580c;font-weight:700;margin:0 0 10px">Lead asked a question</p>
  <h1 style="font-size:20px;line-height:1.3;margin:0 0 16px">${esc(who)} asked something the assistant would not answer</h1>
  <div style="background:#f8fafc;border-left:3px solid #ea580c;padding:14px 16px;border-radius:0 8px 8px 0;margin-bottom:18px">
    <p style="margin:0;font-size:15px;line-height:1.6;font-style:italic">"${esc(ctx.question)}"</p>
  </div>
  <table style="border-collapse:collapse;font-size:14px;line-height:1.6">
    ${ctx.projectType ? `<tr><td style="padding:2px 12px 2px 0;color:#666">Project</td><td>${esc(ctx.projectType)}</td></tr>` : ''}
    ${ctx.phone ? `<tr><td style="padding:2px 12px 2px 0;color:#666">Phone</td><td>${esc(ctx.phone)}</td></tr>` : ''}
    ${ctx.email ? `<tr><td style="padding:2px 12px 2px 0;color:#666">Email</td><td>${esc(ctx.email)}</td></tr>` : ''}
  </table>
  <p style="font-size:14px;line-height:1.6;color:#666;margin:18px 0 0">
    The assistant acknowledged the question and told them you would answer it on the call. It did not attempt an answer of its own.
  </p>
</div>`;

  const text = [
    `${who} asked something the assistant would not answer:`,
    '',
    `"${ctx.question}"`,
    '',
    ctx.projectType ? `Project: ${ctx.projectType}` : null,
    ctx.phone ? `Phone: ${ctx.phone}` : null,
    ctx.email ? `Email: ${ctx.email}` : null,
    '',
    'The assistant did not attempt an answer. It said you would, on the call.',
  ]
    .filter((l) => l !== null)
    .join('\n');

  return { subject, html, text };
}

/**
 * Route the question to both channels and report what actually happened.
 *
 * Both are awaited. A fire-and-forget fetch is killed when the serverless
 * response returns, which is how notifications go missing on Vercel.
 */
export async function routeOffScript(ctx: OffScriptContext): Promise<RouteOutcome> {
  const built = offScriptEmail(ctx);

  const [telegram, email] = await Promise.all([
    sendTelegramMessage(offScriptTelegram(ctx)).catch((err) => {
      console.error('[intake] off-script telegram threw:', err);
      return 'failed' as const;
    }),
    sendTrackedEmail({
      from: 'La Vaca General Contractors <noreply@email.lavaca.link>',
      to: ['alex@lavacagc.com', 'veronica@lavacagc.com'],
      subject: built.subject,
      html: built.html,
      text: built.text,
      category: 'lead_notification',
    })
      .then((r) => (r && r.status === 'sent' ? ('sent' as const) : ('failed' as const)))
      .catch((err) => {
        console.error('[intake] off-script email threw:', err);
        return 'failed' as const;
      }),
  ]);

  return { telegram, email };
}

/**
 * What the lead is told. Two versions, because a question nobody received must
 * not be answered with a promise that somebody did.
 */
export function offScriptReply(reached: boolean): string[] {
  if (reached) {
    return [
      "Good question, and I'm not going to guess at it.",
      "I've sent it straight to Alex and Veronica and they'll answer it properly on your call.",
    ];
  }
  return [
    "Good question, and I'm not going to guess at it.",
    "I had trouble passing it along just now, so please do ask it on the call - or ring us on (201) 212-4917 and we'll answer straight away.",
  ];
}
