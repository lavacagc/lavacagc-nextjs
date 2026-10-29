/**
 * Everything a sub receives about an offer, by email and by text, in the sub's
 * language: the offer itself (BD3), and the follow-ups (job taken, counter
 * accepted or rejected, Alex's reply, you won).
 *
 * The email body carries the trade, the TOWN ONLY, the start window, the pay,
 * the expiry, Accept and Respond (both open /offer/<token>), and the SpecNook
 * signup link. The full address is never in a message: it is released on the
 * offer page to the sub who wins the job.
 *
 * Builders are pure; `sendToSub` does the sending and reports each channel's
 * outcome in the vocabulary offer_recipients stores.
 */
import { TRADE_LABEL, t, type Lang } from './catalog';
import { s } from './i18n';
import { formatDollars } from './pricing';
import { sendSms } from './sms';
import { sendTrackedEmail } from '@/lib/notify/sendEmail';
import {
  esc, licenceBar, brandRow, pill, headline, intro, cta, panel, homeCareEmailShell,
  FF, MUTED, HAIRLINE, INK, BODY, BUSINESS_ADDRESS, PHONE, ORANGE_DEEP,
} from '@/lib/homecare/emailShell';
import { cleanEnv } from '@/lib/envClean';

/** Only email.lavaca.link is a verified sending domain (see senders.ts). */
export const OFFER_FROM = 'La Vaca Jobs <alex@email.lavaca.link>';

export function siteUrl(): string {
  return (cleanEnv(process.env.NEXT_PUBLIC_SITE_URL) || 'https://www.lavacagc.com').replace(/\/+$/, '');
}

export function offerLink(token: string): string {
  return `${siteUrl()}/offer/${token}`;
}

const LOCALE: Record<Lang, string> = { en: 'en-US', es: 'es-US' };

/** "Nov 3 - Nov 7", "from Nov 3", or the flexible line. Dates are calendar dates (no zone shift). */
export function startWindowLabel(start: string | null, end: string | null, lang: Lang): string {
  const fmt = (d: string) =>
    new Intl.DateTimeFormat(LOCALE[lang], { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${d.slice(0, 10)}T12:00:00Z`));
  if (start && end) return `${fmt(start)} - ${fmt(end)}`;
  if (start) return lang === 'es' ? `desde ${fmt(start)}` : `from ${fmt(start)}`;
  if (end) return lang === 'es' ? `antes de ${fmt(end)}` : `by ${fmt(end)}`;
  return s('offerStartFlexible', lang);
}

/** "Thu, Oct 30, 2:15 PM" in New Jersey time. */
export function expiryLabel(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  }).format(new Date(iso));
}

export interface OfferMessageContext {
  lang: Lang;
  subName: string;
  trade: string;
  town: string;
  payCents: number;
  scope: string;
  targetStart: string | null;
  targetEnd: string | null;
  expiresAt: string;
  token: string;
  signupUrl: string;
}

function tradeName(trade: string, lang: Lang): string {
  return t(TRADE_LABEL[trade as keyof typeof TRADE_LABEL], lang) || trade;
}

function detailRows(rows: Array<[string, string]>): string {
  const cells = rows.map(([k, v]) =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid ${HAIRLINE};font-family:${FF};font-size:13px;line-height:18px;color:${MUTED};width:120px;vertical-align:top">${esc(k)}</td>` +
    `<td style="padding:8px 0;border-bottom:1px solid ${HAIRLINE};font-family:${FF};font-size:15px;line-height:22px;color:${INK};vertical-align:top">${esc(v)}</td></tr>`,
  ).join('');
  return `  <tr><td class="px" style="padding:22px 40px 0 40px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%">${cells}</table></td></tr>`;
}

/** Transactional sign-off: no unsubscribe (this is work the sub signed up for), but the postal address stays. */
function subFooter(lang: Lang, signupUrl?: string): string {
  const signup = signupUrl
    ? `<a href="${esc(signupUrl)}" style="color:${ORANGE_DEEP};text-decoration:underline">${esc(s('offerSignUpLink', lang))}</a><br />`
    : '';
  return `  <tr><td class="px" style="padding:30px 40px 34px 40px">
    <div style="height:1px;background:${HAIRLINE};line-height:1px;font-size:1px">&nbsp;</div>
    <div style="padding-top:18px;font-family:${FF};font-size:13px;line-height:20px;color:${MUTED}">
      ${signup}- Alex, La Vaca General Contractors<br />
      ${BUSINESS_ADDRESS} &nbsp;&middot;&nbsp; <a href="tel:+12012124917" style="color:${ORANGE_DEEP};text-decoration:none">${PHONE}</a><br />
      <span style="color:#8A8A8A">${esc(s('emailOfferWhy', lang))}</span>
    </div>
  </td></tr>`;
}

export function buildOfferEmail(ctx: OfferMessageContext): { subject: string; html: string; text: string } {
  const { lang } = ctx;
  const trade = tradeName(ctx.trade, lang);
  const pay = formatDollars(ctx.payCents);
  const link = offerLink(ctx.token);
  const when = expiryLabel(ctx.expiresAt, lang);
  const start = startWindowLabel(ctx.targetStart, ctx.targetEnd, lang);
  const subject = s('emailOfferSubject', lang, { trade, town: ctx.town, pay });

  const rows = [
    licenceBar(),
    brandRow(lang === 'es' ? 'Oferta de trabajo' : 'Job offer'),
    pill([esc(trade), esc(ctx.town)]),
    headline(esc(pay), esc(s('offerPay', lang))),
    intro(esc(s('emailOfferHello', lang, { name: ctx.subName || 'there' })), esc(s('emailOfferIntro', lang, { trade, town: ctx.town }))),
    detailRows([
      [s('offerTrade', lang), trade],
      [s('offerTown', lang), ctx.town],
      [s('offerStart', lang), start],
      [s('offerPay', lang), pay],
      [s('offerJob', lang), ctx.scope || trade],
    ]),
    cta(s('offerAccept', lang), link),
    cta(s('offerRespond', lang), link, esc(s('emailOfferExpires', lang, { when }))),
    panel(esc(s('emailOfferAddressNote', lang))),
    subFooter(lang, ctx.signupUrl),
  ].join('\n');

  const text = [
    s('emailOfferHello', lang, { name: ctx.subName || 'there' }),
    '',
    s('emailOfferIntro', lang, { trade, town: ctx.town }),
    '',
    `${s('offerTrade', lang)}: ${trade}`,
    `${s('offerTown', lang)}: ${ctx.town}`,
    `${s('offerStart', lang)}: ${start}`,
    `${s('offerPay', lang)}: ${pay}`,
    `${s('offerJob', lang)}: ${ctx.scope || trade}`,
    '',
    `${s('offerAccept', lang)} / ${s('offerRespond', lang)}: ${link}`,
    s('emailOfferExpires', lang, { when }),
    s('emailOfferAddressNote', lang),
    '',
    `${s('offerSignUpLink', lang)}: ${ctx.signupUrl}`,
    '',
    `- Alex, La Vaca General Contractors · ${PHONE}`,
    s('emailOfferWhy', lang),
  ].join('\n');

  return {
    subject,
    html: homeCareEmailShell({ preheader: esc(s('emailOfferPreheader', lang, { trade, town: ctx.town })), rows }),
    text,
  };
}

export function buildOfferSms(ctx: OfferMessageContext): string {
  const trade = tradeName(ctx.trade, ctx.lang);
  return s('smsOffer', ctx.lang, { trade, town: ctx.town, pay: formatDollars(ctx.payCents), link: offerLink(ctx.token) });
}

export type NoticeKind = 'taken' | 'counter_accepted' | 'counter_rejected' | 'reply_price' | 'reply_details' | 'won';

export interface NoticeContext {
  lang: Lang;
  subName: string;
  trade: string;
  town: string;
  token: string;
  /** The price the notice is about (counter accepted, Alex's price). */
  priceCents?: number;
  /** Alex's reply text, for reply notices. */
  replyText?: string;
}

export function buildNotice(kind: NoticeKind, ctx: NoticeContext): { subject: string; html: string; text: string; sms: string } {
  const { lang } = ctx;
  const trade = tradeName(ctx.trade, lang);
  const link = offerLink(ctx.token);
  const price = ctx.priceCents ? formatDollars(ctx.priceCents) : '';
  const vars = { trade, town: ctx.town, price, link };

  let subject: string;
  let body: string;
  let sms: string;
  let withLink = true;
  switch (kind) {
    case 'taken':
      subject = s('emailTakenSubject', lang, vars);
      body = s('offerTaken', lang);
      sms = s('smsTaken', lang, vars);
      withLink = false;
      break;
    case 'counter_accepted':
      subject = s('emailCounterAcceptedSubject', lang, vars);
      body = s('emailCounterAcceptedBody', lang, vars);
      sms = s('smsCounterAccepted', lang, vars);
      break;
    case 'counter_rejected':
      subject = s('emailReplySubject', lang, vars);
      body = s('offerCounterRejected', lang, vars);
      sms = s('smsCounterRejected', lang, vars);
      break;
    case 'reply_price':
      subject = s('emailReplySubject', lang, vars);
      body = `${s('offerAlexPriceTitle', lang, vars)}. ${s('offerAlexPriceBody', lang)}${ctx.replyText ? `\n\n${ctx.replyText}` : ''}`;
      sms = s('smsReplyPrice', lang, vars);
      break;
    case 'reply_details':
      subject = s('emailReplySubject', lang, vars);
      body = ctx.replyText || s('offerAlexReply', lang);
      sms = s('smsReplyDetails', lang, vars);
      break;
    case 'won':
      subject = s('offerWonTitle', lang);
      body = s('offerAccepted', lang);
      sms = s('smsWon', lang, vars);
      break;
  }

  const bodyHtml = esc(body).replace(/\n/g, '<br />');
  const rows = [
    licenceBar(),
    brandRow(lang === 'es' ? 'Oferta de trabajo' : 'Job offer'),
    pill([esc(trade), esc(ctx.town)]),
    `  <tr><td class="px" style="padding:18px 40px 0 40px;font-family:${FF};font-size:17px;line-height:26px;color:${BODY}"><div style="font-weight:bold;color:${INK}">${esc(s('emailOfferHello', lang, { name: ctx.subName || 'there' }))}</div><div style="padding-top:6px">${bodyHtml}</div></td></tr>`,
    withLink ? cta(s('emailOpenOffer', lang), link) : '',
    subFooter(lang),
  ].join('\n');

  const text = [
    s('emailOfferHello', lang, { name: ctx.subName || 'there' }),
    '',
    body,
    ...(withLink ? ['', `${s('emailOpenOffer', lang)}: ${link}`] : []),
    '',
    `- Alex, La Vaca General Contractors · ${PHONE}`,
  ].join('\n');

  return { subject, html: homeCareEmailShell({ preheader: esc(subject), rows }), text, sms };
}

/**
 * What offer_recipients records per channel:
 * sent | failed | not_configured (no provider key) | skipped (the sub has no address for it).
 */
export type ChannelStatus = 'sent' | 'failed' | 'not_configured' | 'skipped';

export interface SendOutcome {
  email: ChannelStatus;
  sms: ChannelStatus;
}

export async function sendToSub(args: {
  sub: { email: string; phone: string; contact_name: string; business_name: string };
  category: 'sub_offer' | 'sub_offer_notice';
  email: { subject: string; html: string; text: string };
  sms: string;
  sentBy?: string | null;
  campaign?: Record<string, unknown>;
}): Promise<SendOutcome> {
  const { sub } = args;
  const emailPromise: Promise<ChannelStatus> = sub.email.trim()
    ? sendTrackedEmail({
        from: OFFER_FROM,
        to: sub.email.trim(),
        replyTo: cleanEnv(process.env.LEAD_NOTIFICATION_EMAIL) || undefined,
        subject: args.email.subject,
        html: args.email.html,
        text: args.email.text,
        category: args.category,
        toName: sub.contact_name || sub.business_name,
        sentBy: args.sentBy ?? 'system',
        campaign: args.campaign ?? null,
      }).then((r) => {
        if (r.status === 'sent') return 'sent' as const;
        if (r.status === 'skipped' && r.reason === 'no_api_key') return 'not_configured' as const;
        if (r.status === 'skipped') return 'skipped' as const;
        return 'failed' as const;
      }).catch(() => 'failed' as const)
    : Promise.resolve('skipped' as const);

  const smsPromise: Promise<ChannelStatus> = sub.phone.trim()
    ? sendSms({ to: sub.phone, body: args.sms }).then((r) => r.status)
    : Promise.resolve('skipped' as const);

  const [email, sms] = await Promise.all([emailPromise, smsPromise]);
  return { email, sms };
}
