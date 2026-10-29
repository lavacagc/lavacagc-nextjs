/**
 * The bid request system, server side: sending offers to subs (BD1-BD4), the
 * sub's responses on /offer/<token> (OF1-OF5), Alex's replies from the Sub
 * Responses inbox (BD5-BD7), first-confirmed-acceptance-wins assignment (BD9)
 * and the 24-hour expiry (BD8).
 *
 * All reads and writes go through supabaseRest with the secret key: the new
 * tables have RLS on and no policies (SEC5).
 *
 * THE ASSIGNMENT IS ONE CONDITIONAL WRITE. `PATCH job_offers?id=eq.<id>&status=eq.open`
 * with return=representation: Postgres serialises the two updates on the row,
 * the second one re-evaluates `status = 'open'` after the first commits, finds
 * 'assigned', and updates nothing. Zero rows back means somebody else won, so
 * two subs tapping Accept in the same second cannot both get the job.
 */
import { randomBytes } from 'crypto';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { sendTelegramMessage, escapeTelegram, escapeTelegramClipped } from '@/lib/notify/telegramMessage';
import { sendTrackedEmail } from '@/lib/notify/sendEmail';
import { cleanEnv } from '@/lib/envClean';
import { getSubStatus, isSpecNookConfigured, pushJob, specNookSignupUrl, type SpecNookPushStatus } from '@/lib/specnook/client';
import { TRADE_LABEL, describeAnswers, getService, type Trade } from './catalog';
import { OFFER_TTL_HOURS, formatDollars, subPayViolation } from './pricing';
import {
  REQUEST_ADMIN_COLUMNS, appendNote, countyForRequest, noteLine, serviceForTrade, tradesForServices,
  type HomeServiceRequestRow,
} from './requestsAdmin';
import {
  DECLINE_REASON_LABEL, confirmablePrice, extendedExpiry, offerExclusion, recipientView, todayInNewJersey,
  type Attachment, type DeclineCallRow, type DeclineReason, type JobOfferRow, type OfferRecipientRow,
  type OfferResponseRow, type SubRow,
} from './offerRules';
import { buildNotice, buildOfferEmail, buildOfferSms, offerLink, siteUrl, type NoticeKind } from './offerEmail';
import { sendToSub, type SendOutcome } from './offerSend';
import { signPaths } from './storage';

export const SUB_COLUMNS = 'id,business_name,contact_name,phone,email,trades,counties,language,status,specnook_sub_id,insurance_expires_at,hic_expires_at,callback_count,notes,created_at,updated_at';
export const OFFER_COLUMNS = 'id,request_id,trade,scope_summary,town,sub_pay_cents,customer_price_cents,target_start,target_end,photo_ids,status,assigned_sub_id,assigned_at,specnook_push_status,expires_at,created_at,created_by';
export const RECIPIENT_COLUMNS = 'id,offer_id,sub_id,token,email_status,sms_status,sent_at,opened_at,paused_at,expires_at,closed_reason,created_at';
export const RESPONSE_COLUMNS = 'id,offer_id,recipient_id,sub_id,type,counter_cents,note,decline_reason,attachments,status,admin_reply,admin_reply_at,admin_price_cents,admin_reply_attachments,created_at';

/** 32 random bytes, base64url: 43 characters (SEC3). */
export function generateOfferToken(): string {
  return randomBytes(32).toString('base64url');
}

export function isWellFormedToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

function tradeLabel(trade: string): string {
  return TRADE_LABEL[trade as Trade]?.en ?? trade;
}

function inList(ids: string[]): string {
  return `in.(${ids.map((id) => encodeURIComponent(id)).join(',')})`;
}

function ownerEmail(): string {
  return cleanEnv(process.env.LEAD_NOTIFICATION_EMAIL) || 'alex@vacamoo.com';
}

/** Owner alert: Telegram (the owner's "text") plus an email. Best effort, never throws. */
async function alertOwner(telegramHtml: string, subject: string, text: string): Promise<void> {
  await Promise.all([
    sendTelegramMessage(telegramHtml).catch(() => 'failed'),
    sendTrackedEmail({
      from: 'La Vaca Jobs <alex@email.lavaca.link>',
      to: ownerEmail(),
      subject,
      text,
      category: 'lead_notification',
    }).catch(() => null),
  ]);
}

function adminLink(): string {
  return `${siteUrl()}/vaca-mgmt`;
}

// ---------------------------------------------------------------------------
// Request notes (append-only) with an optimistic retry so two writers do not
// drop each other's line.
// ---------------------------------------------------------------------------

export async function appendRequestNote(
  requestId: string,
  text: string,
  extra: Record<string, unknown> = {},
  by?: string | null,
): Promise<HomeServiceRequestRow | null> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rows = await supabaseRest<Array<Pick<HomeServiceRequestRow, 'admin_notes' | 'updated_at'>>>(
      'GET', `home_service_requests?select=admin_notes,updated_at&id=eq.${requestId}`,
    );
    const current = rows?.[0];
    if (!current) return null;
    const notes = appendNote(current.admin_notes ?? '', noteLine(text, new Date(), by));
    const updated = await supabaseRest<HomeServiceRequestRow[]>(
      'PATCH',
      `home_service_requests?id=eq.${requestId}&updated_at=eq.${encodeURIComponent(current.updated_at)}&select=${REQUEST_ADMIN_COLUMNS}`,
      { ...extra, admin_notes: notes },
    );
    if (updated && updated.length > 0) return updated[0];
  }
  throw new Error('Could not append the note: the request kept changing underneath. Try again.');
}

export async function getRequest(requestId: string): Promise<HomeServiceRequestRow | null> {
  const rows = await supabaseRest<HomeServiceRequestRow[]>(
    'GET', `home_service_requests?select=${REQUEST_ADMIN_COLUMNS}&id=eq.${requestId}`,
  );
  return rows?.[0] ?? null;
}

// ---------------------------------------------------------------------------
// Eligibility and sending (BD1-BD4)
// ---------------------------------------------------------------------------

export interface RecipientPreview {
  trade: Trade;
  county: string | null;
  eligible: Array<Pick<SubRow, 'id' | 'business_name' | 'contact_name' | 'language' | 'email' | 'phone'>>;
  /** Subs who do this trade but will not get it, with the reason. */
  excluded: Array<{ id: string; business_name: string; reason: string }>;
}

/** Who would get an offer for each trade on this request, and who would not and why. */
export async function previewRecipients(request: HomeServiceRequestRow, now: Date = new Date()): Promise<RecipientPreview[]> {
  const trades = tradesForServices(request.services);
  if (trades.length === 0) return [];
  const county = countyForRequest(request);
  const today = todayInNewJersey(now);
  const subs = (await supabaseRest<SubRow[]>(
    'GET', `subs?select=${SUB_COLUMNS}&trades=ov.{${trades.join(',')}}&order=business_name.asc&limit=500`,
  )) ?? [];
  return trades.map((trade) => {
    const eligible: RecipientPreview['eligible'] = [];
    const excluded: RecipientPreview['excluded'] = [];
    for (const sub of subs) {
      if (!sub.trades.includes(trade)) continue;
      const reason = offerExclusion(sub, trade, county, today);
      if (reason) excluded.push({ id: sub.id, business_name: sub.business_name, reason });
      else eligible.push({ id: sub.id, business_name: sub.business_name, contact_name: sub.contact_name, language: sub.language, email: sub.email, phone: sub.phone });
    }
    return { trade, county, eligible, excluded };
  });
}

export interface OfferInput {
  trade: Trade;
  sub_pay_cents: number;
  customer_price_cents: number;
  scope_summary: string;
  town: string;
  photo_ids: string[];
  target_start: string | null;
  target_end: string | null;
}

export interface SentRecipient {
  sub_id: string;
  business_name: string;
  language: string;
  email_status: string;
  sms_status: string;
}

export type TradeSendResult =
  | { trade: Trade; status: 'sent'; offer_id: string; expires_at: string; recipients: SentRecipient[] }
  | { trade: Trade; status: 'no_eligible_subs'; excluded: RecipientPreview['excluded'] }
  | { trade: Trade; status: 'already_open'; offer_id: string; expires_at: string }
  | { trade: Trade; status: 'invalid'; error: string };

export class OfferInputError extends Error {}

/**
 * Send one offer per trade. Every input is validated before anything is written;
 * a trade with no eligible sub (or an offer already open) creates nothing and
 * says why, without blocking the other trades on the same request.
 */
export async function sendBidRequest(
  request: HomeServiceRequestRow,
  inputs: OfferInput[],
  createdBy: string | null,
  now: Date = new Date(),
): Promise<TradeSendResult[]> {
  const requestTrades = tradesForServices(request.services);
  const seen = new Set<string>();
  for (const input of inputs) {
    if (!requestTrades.includes(input.trade)) throw new OfferInputError(`${tradeLabel(input.trade)} is not a service on this request.`);
    if (seen.has(input.trade)) throw new OfferInputError(`${tradeLabel(input.trade)} appears twice.`);
    seen.add(input.trade);
    const violation = subPayViolation(input.customer_price_cents, input.sub_pay_cents);
    if (violation) throw new OfferInputError(`${tradeLabel(input.trade)}: ${violation}`);
    if (input.target_start && input.target_end && input.target_end < input.target_start) {
      throw new OfferInputError(`${tradeLabel(input.trade)}: the end date is before the start date.`);
    }
  }

  // Photos to share must belong to this request.
  const wantedPhotos = Array.from(new Set(inputs.flatMap((i) => i.photo_ids)));
  if (wantedPhotos.length > 0) {
    const owned = (await supabaseRest<Array<{ id: string }>>(
      'GET', `lead_photos?select=id&request_id=eq.${request.id}&id=${inList(wantedPhotos)}`,
    )) ?? [];
    if (owned.length !== wantedPhotos.length) throw new OfferInputError('A selected photo does not belong to this request.');
  }

  const previews = await previewRecipients(request, now);
  const openOffers = (await supabaseRest<Array<Pick<JobOfferRow, 'id' | 'trade' | 'expires_at'>>>(
    'GET', `job_offers?select=id,trade,expires_at&request_id=eq.${request.id}&status=eq.open`,
  )) ?? [];

  const results: TradeSendResult[] = [];
  for (const input of inputs) {
    const open = openOffers.find((o) => o.trade === input.trade);
    if (open) {
      results.push({ trade: input.trade, status: 'already_open', offer_id: open.id, expires_at: open.expires_at });
      continue;
    }
    const preview = previews.find((p) => p.trade === input.trade);
    if (!preview || preview.eligible.length === 0) {
      results.push({ trade: input.trade, status: 'no_eligible_subs', excluded: preview?.excluded ?? [] });
      continue;
    }
    results.push(await sendOneOffer(request, input, preview, createdBy, now));
  }

  const sent = results.filter((r): r is Extract<TradeSendResult, { status: 'sent' }> => r.status === 'sent');
  if (sent.length > 0) {
    const summary = sent.map((r) => {
      const input = inputs.find((i) => i.trade === r.trade)!;
      return `${tradeLabel(r.trade)} at ${formatDollars(input.sub_pay_cents)} to ${r.recipients.length} sub${r.recipients.length === 1 ? '' : 's'}`;
    }).join('; ');
    const moveStatus = ['held', 'new', 'contacted'].includes(request.status) ? { status: 'bid_sent' } : {};
    await appendRequestNote(request.id, `Bid request sent: ${summary}.`, moveStatus, createdBy);
  }
  return results;
}

async function sendOneOffer(
  request: HomeServiceRequestRow,
  input: OfferInput,
  preview: RecipientPreview,
  createdBy: string | null,
  now: Date,
): Promise<TradeSendResult> {
  const expiresAt = new Date(now.getTime() + OFFER_TTL_HOURS * 3600 * 1000).toISOString();
  const [offer] = await supabaseRest<JobOfferRow[]>('POST', `job_offers?select=${OFFER_COLUMNS}`, [{
    request_id: request.id,
    trade: input.trade,
    scope_summary: input.scope_summary,
    town: input.town,
    sub_pay_cents: input.sub_pay_cents,
    customer_price_cents: input.customer_price_cents,
    target_start: input.target_start,
    target_end: input.target_end,
    photo_ids: input.photo_ids,
    expires_at: expiresAt,
    created_by: createdBy,
  }]);

  // Re-read the subs and re-apply the rule: one suspended or removed since the
  // preview must not get the offer.
  const subsById = new Map<string, SubRow>();
  const today = todayInNewJersey(now);
  const fullSubs = ((await supabaseRest<SubRow[]>(
    'GET', `subs?select=${SUB_COLUMNS}&id=${inList(preview.eligible.map((e) => e.id))}`,
  )) ?? []).filter((sub) => offerExclusion(sub, input.trade, preview.county, today) === null);
  for (const sub of fullSubs) subsById.set(sub.id, sub);

  // An offer with no recipients is a dead row that blocks a resend of the
  // trade, so it is removed if the recipients cannot be written.
  let recipients: OfferRecipientRow[];
  try {
    if (fullSubs.length === 0) throw new Error('every eligible sub changed before the send');
    recipients = await supabaseRest<OfferRecipientRow[]>('POST', `offer_recipients?select=${RECIPIENT_COLUMNS}`,
      fullSubs.map((sub) => ({ offer_id: offer.id, sub_id: sub.id, token: generateOfferToken(), expires_at: expiresAt })),
    );
  } catch (err) {
    await supabaseRest('DELETE', `job_offers?id=eq.${offer.id}`, undefined, { prefer: 'return=minimal' }).catch(() => undefined);
    if (fullSubs.length === 0) return { trade: input.trade, status: 'no_eligible_subs', excluded: preview.excluded };
    throw err;
  }

  const signupUrl = specNookSignupUrl(input.trade, offer.id);
  const outcomes = await Promise.all(recipients.map(async (rcpt) => {
    const sub = subsById.get(rcpt.sub_id)!;
    const ctx = {
      lang: sub.language, subName: sub.contact_name || sub.business_name, trade: input.trade, town: input.town,
      payCents: input.sub_pay_cents, scope: input.scope_summary, targetStart: input.target_start, targetEnd: input.target_end,
      expiresAt, token: rcpt.token, signupUrl,
    };
    let outcome: SendOutcome;
    try {
      outcome = await sendToSub({
        sub, category: 'sub_offer', email: buildOfferEmail(ctx), sms: buildOfferSms(ctx), sentBy: createdBy,
        campaign: { offer_id: offer.id, request_id: request.id },
      });
    } catch {
      outcome = { email: 'failed', sms: 'failed' };
    }
    await supabaseRest('PATCH', `offer_recipients?id=eq.${rcpt.id}`, {
      email_status: outcome.email, sms_status: outcome.sms, sent_at: new Date().toISOString(),
    }, { prefer: 'return=minimal' });
    return { sub_id: sub.id, business_name: sub.business_name, language: sub.language, email_status: outcome.email, sms_status: outcome.sms };
  }));

  return { trade: input.trade, status: 'sent', offer_id: offer.id, expires_at: expiresAt, recipients: outcomes };
}

/** Withdraw an open offer (so Alex can resend with different pay before it expires). */
export async function cancelOffer(offerId: string, by: string | null): Promise<boolean> {
  const rows = await supabaseRest<JobOfferRow[]>(
    'PATCH', `job_offers?id=eq.${offerId}&status=eq.open&select=${OFFER_COLUMNS}`, { status: 'cancelled' },
  );
  const offer = rows?.[0];
  if (!offer) return false;
  await supabaseRest('PATCH', `offer_recipients?offer_id=eq.${offerId}&closed_reason=is.null`, { closed_reason: 'cancelled' }, { prefer: 'return=minimal' });
  await appendRequestNote(offer.request_id, `Offer withdrawn: ${tradeLabel(offer.trade)} at ${formatDollars(offer.sub_pay_cents)}.`, {}, by);
  return true;
}

// ---------------------------------------------------------------------------
// Token lookup (the sub's offer page and its POST route)
// ---------------------------------------------------------------------------

export interface FoundOffer {
  recipient: OfferRecipientRow;
  offer: JobOfferRow;
  sub: SubRow;
  responses: OfferResponseRow[];
}

export type TokenLookup =
  | { status: 'not_found' }
  | { status: 'unavailable' }
  | { status: 'found'; found: FoundOffer };

export async function lookupOfferByToken(token: string): Promise<TokenLookup> {
  if (!isWellFormedToken(token)) return { status: 'not_found' };
  try {
    const rcpts = await supabaseRest<OfferRecipientRow[]>(
      'GET', `offer_recipients?select=${RECIPIENT_COLUMNS}&token=eq.${encodeURIComponent(token)}&limit=1`,
    );
    const recipient = rcpts?.[0];
    if (!recipient) return { status: 'not_found' };
    const [offers, subs, responses] = await Promise.all([
      supabaseRest<JobOfferRow[]>('GET', `job_offers?select=${OFFER_COLUMNS}&id=eq.${recipient.offer_id}`),
      supabaseRest<SubRow[]>('GET', `subs?select=${SUB_COLUMNS}&id=eq.${recipient.sub_id}`),
      supabaseRest<OfferResponseRow[]>('GET', `offer_responses?select=${RESPONSE_COLUMNS}&recipient_id=eq.${recipient.id}&order=created_at.asc&limit=100`),
    ]);
    const offer = offers?.[0];
    const sub = subs?.[0];
    if (!offer || !sub) return { status: 'not_found' };
    return { status: 'found', found: { recipient, offer, sub, responses: responses ?? [] } };
  } catch (err) {
    console.error('offer lookup failed:', err instanceof Error ? err.message : String(err));
    return { status: 'unavailable' };
  }
}

/**
 * Can this sub accept? SpecNook's answer when it is configured and knows the
 * sub; otherwise the local subs.status Alex sets. A local suspension always
 * wins, so Alex can stop a sub without waiting on SpecNook.
 */
export async function subCanAccept(sub: Pick<SubRow, 'status' | 'specnook_sub_id'>): Promise<boolean> {
  if (sub.status === 'suspended') return false;
  if (isSpecNookConfigured() && sub.specnook_sub_id) {
    const remote = await getSubStatus(sub.specnook_sub_id);
    if (remote !== 'unknown') return remote === 'approved';
  }
  return sub.status === 'approved';
}

// ---------------------------------------------------------------------------
// The sub's responses (OF4, OF5) and assignment (BD9)
// ---------------------------------------------------------------------------

export type RespondResult =
  | { ok: true; outcome: 'assigned' | 'counter_sent' | 'details_sent' | 'declined' }
  | { ok: false; status: number; error: 'taken' | 'expired' | 'cancelled' | 'not_eligible' | 'nothing_to_confirm' | 'won' | 'server_error' };

function closedError(kind: 'won' | 'taken' | 'expired' | 'cancelled'): RespondResult {
  return { ok: false, status: 409, error: kind };
}

export async function respondToOffer(
  found: FoundOffer,
  action:
    | { action: 'accept' }
    | { action: 'confirm' }
    | { action: 'counter'; price_cents: number; note: string }
    | { action: 'details'; text: string; attachments: Attachment[] }
    | { action: 'decline'; reason: DeclineReason | null; note: string },
  now: Date = new Date(),
): Promise<RespondResult> {
  const { offer, recipient, sub, responses } = found;
  const view = recipientView(offer, recipient, now);
  if (view.kind !== 'live') return closedError(view.kind);

  switch (action.action) {
    case 'accept': {
      if (!(await subCanAccept(sub))) return { ok: false, status: 403, error: 'not_eligible' };
      return assign(found, offer.sub_pay_cents, null, now);
    }
    case 'confirm': {
      if (!(await subCanAccept(sub))) return { ok: false, status: 403, error: 'not_eligible' };
      const price = confirmablePrice(responses);
      if (!price) return { ok: false, status: 409, error: 'nothing_to_confirm' };
      return assign(found, price.cents, price.responseId, now);
    }
    case 'counter': {
      await supabaseRest('POST', 'offer_responses', [{
        offer_id: offer.id, recipient_id: recipient.id, sub_id: sub.id, type: 'counter',
        counter_cents: action.price_cents, note: action.note, status: 'pending',
      }], { prefer: 'return=minimal' });
      const over = subPayViolation(offer.customer_price_cents, action.price_cents);
      await alertOwner(
        `💬 <b>Counter offer</b>\n${escapeTelegram(sub.business_name)} will do ${escapeTelegram(tradeLabel(offer.trade))} in ${escapeTelegram(offer.town)} for <b>${formatDollars(action.price_cents)}</b> (offered ${formatDollars(offer.sub_pay_cents)}).` +
          `${action.note ? `\n"${escapeTelegramClipped(action.note, 800)}"` : ''}${over ? `\n⚠️ ${escapeTelegram(over)}` : ''}\nReview: ${adminLink()}`,
        `Counter offer: ${sub.business_name}, ${tradeLabel(offer.trade)} in ${offer.town}`,
        `${sub.business_name} countered ${formatDollars(action.price_cents)} (offered ${formatDollars(offer.sub_pay_cents)}).\n${action.note}\n${over ?? ''}\nReview in Service Requests > Sub Responses: ${adminLink()}`,
      );
      return { ok: true, outcome: 'counter_sent' };
    }
    case 'details': {
      await supabaseRest('POST', 'offer_responses', [{
        offer_id: offer.id, recipient_id: recipient.id, sub_id: sub.id, type: 'details',
        note: action.text, attachments: action.attachments, status: 'pending',
      }], { prefer: 'return=minimal' });
      // Pause this sub's clock until Alex answers (BD6). An existing pause stands.
      await supabaseRest('PATCH', `offer_recipients?id=eq.${recipient.id}&paused_at=is.null`, { paused_at: now.toISOString() }, { prefer: 'return=minimal' });
      await alertOwner(
        `❓ <b>Sub needs details</b>\n${escapeTelegram(sub.business_name)} on ${escapeTelegram(tradeLabel(offer.trade))} in ${escapeTelegram(offer.town)}:\n"${escapeTelegramClipped(action.text, 1500)}"` +
          `${action.attachments.length ? `\n📎 ${action.attachments.length} file(s)` : ''}\nTheir clock is paused until you answer: ${adminLink()}`,
        `Sub needs details: ${sub.business_name}, ${tradeLabel(offer.trade)} in ${offer.town}`,
        `${sub.business_name} asked:\n${action.text}\n\nTheir clock is paused until you answer in Service Requests > Sub Responses: ${adminLink()}`,
      );
      return { ok: true, outcome: 'details_sent' };
    }
    case 'decline': {
      const [response] = await supabaseRest<OfferResponseRow[]>('POST', `offer_responses?select=${RESPONSE_COLUMNS}`, [{
        offer_id: offer.id, recipient_id: recipient.id, sub_id: sub.id, type: 'decline',
        decline_reason: action.reason, note: action.note, status: 'recorded',
      }]);
      await supabaseRest('POST', 'decline_calls', [{
        response_id: response.id, request_id: offer.request_id, sub_id: sub.id, status: 'open',
      }], { prefer: 'return=minimal' });
      await alertOwner(
        `👎 <b>Decline</b>\n${escapeTelegram(sub.business_name)} declined ${escapeTelegram(tradeLabel(offer.trade))} in ${escapeTelegram(offer.town)} at ${formatDollars(offer.sub_pay_cents)}.` +
          `\nReason: ${escapeTelegram(action.reason ? DECLINE_REASON_LABEL[action.reason] : 'none given')}` +
          `${sub.phone ? `\nCall them: ${escapeTelegram(sub.phone)}` : ''}`,
        `Decline: ${sub.business_name}, ${tradeLabel(offer.trade)} in ${offer.town}`,
        `${sub.business_name} declined at ${formatDollars(offer.sub_pay_cents)}. Reason: ${action.reason ? DECLINE_REASON_LABEL[action.reason] : 'none given'}.\nA call task is waiting in Service Requests > Sub Responses: ${adminLink()}`,
      );
      return { ok: true, outcome: 'declined' };
    }
  }
}

async function assign(found: FoundOffer, payCents: number, confirmedResponseId: string | null, now: Date): Promise<RespondResult> {
  const { offer, recipient, sub } = found;
  const won = await supabaseRest<JobOfferRow[]>(
    'PATCH',
    `job_offers?id=eq.${offer.id}&status=eq.open&select=${OFFER_COLUMNS}`,
    { status: 'assigned', assigned_sub_id: sub.id, assigned_at: now.toISOString(), sub_pay_cents: payCents },
  );
  if (!won || won.length === 0) {
    // Someone else's write landed first (or the offer closed under us).
    const fresh = await supabaseRest<JobOfferRow[]>('GET', `job_offers?select=status,assigned_sub_id&id=eq.${offer.id}`);
    const status = fresh?.[0]?.status;
    if (status === 'assigned') return closedError(fresh?.[0]?.assigned_sub_id === sub.id ? 'won' : 'taken');
    if (status === 'cancelled') return closedError('cancelled');
    return closedError('expired');
  }
  const assigned = won[0];

  // The record of who accepted, and the counter they confirmed.
  await supabaseRest('POST', 'offer_responses', [{
    offer_id: offer.id, recipient_id: recipient.id, sub_id: sub.id, type: 'accept',
    counter_cents: payCents !== offer.sub_pay_cents ? payCents : null, status: 'recorded',
  }], { prefer: 'return=minimal' });
  if (confirmedResponseId) {
    await supabaseRest('PATCH', `offer_responses?id=eq.${confirmedResponseId}`, { status: 'confirmed' }, { prefer: 'return=minimal' });
  }

  // Close everyone else, then tell them.
  const closed = (await supabaseRest<OfferRecipientRow[]>(
    'PATCH',
    `offer_recipients?offer_id=eq.${offer.id}&id=neq.${recipient.id}&closed_reason=is.null&select=${RECIPIENT_COLUMNS}`,
    { closed_reason: 'taken' },
  )) ?? [];

  const request = await getRequest(offer.request_id);
  const otherSubs = closed.length
    ? (await supabaseRest<SubRow[]>('GET', `subs?select=${SUB_COLUMNS}&id=${inList(closed.map((c) => c.sub_id))}`)) ?? []
    : [];

  const notify = (kind: NoticeKind, s: SubRow, token: string) => {
    const msg = buildNotice(kind, { lang: s.language, subName: s.contact_name || s.business_name, trade: offer.trade, town: offer.town, token });
    return sendToSub({ sub: s, category: 'sub_offer_notice', email: msg, sms: msg.sms, campaign: { offer_id: offer.id, notice: kind } }).catch(() => null);
  };
  await Promise.all([
    ...closed.map((c) => {
      const s = otherSubs.find((o) => o.id === c.sub_id);
      return s ? notify('taken', s, c.token) : Promise.resolve(null);
    }),
    notify('won', sub, recipient.token),
  ]);

  // Hand the job to SpecNook and record what happened.
  let push: SpecNookPushStatus = 'failed';
  if (request) {
    const photos = await sharedPhotoUrls(assigned.photo_ids);
    const service = serviceForTrade(request.services, offer.trade);
    const answers = describeAnswers(service ? [service] : request.services, request.answers);
    const result = await pushJob({
      offerId: offer.id,
      requestId: request.id,
      trade: offer.trade,
      customer: { firstName: request.first_name, lastName: request.last_name, phone: request.phone, email: request.email },
      address: { street: request.address, town: request.town, zip: request.zip },
      scope: offer.scope_summary,
      answers,
      photos: photos.filter((p): p is string => !!p),
      customerPriceCents: offer.customer_price_cents,
      subPayCents: payCents,
      sub: { id: sub.id, specnookSubId: sub.specnook_sub_id, businessName: sub.business_name },
      targetStart: offer.target_start,
      targetEnd: offer.target_end,
      jobOrderText: [
        `${tradeLabel(offer.trade)} for ${request.first_name} ${request.last_name}`.trim(),
        `${request.address}, ${request.town} ${request.zip}`.trim(),
        offer.scope_summary,
        ...answers,
        `Customer price ${formatDollars(offer.customer_price_cents)}, sub pay ${formatDollars(payCents)}.`,
      ].filter(Boolean).join('\n'),
    });
    push = result.status;
  }
  await supabaseRest('PATCH', `job_offers?id=eq.${offer.id}`, { specnook_push_status: push }, { prefer: 'return=minimal' });

  if (request) {
    const status = ['won', 'lost'].includes(request.status) ? {} : { status: 'assigned' };
    await appendRequestNote(
      request.id,
      `Assigned ${tradeLabel(offer.trade)} to ${sub.business_name} at ${formatDollars(payCents)}. SpecNook push: ${push}.`,
      status,
    );
  }

  await sendTelegramMessage(
    `✅ <b>Job assigned</b>\n${escapeTelegram(tradeLabel(offer.trade))} in ${escapeTelegram(offer.town)} to <b>${escapeTelegram(sub.business_name)}</b> at ${formatDollars(payCents)} (customer ${formatDollars(offer.customer_price_cents)}).` +
      `\n${closed.length} other sub${closed.length === 1 ? '' : 's'} told it is taken. SpecNook push: ${push}.`,
  ).catch(() => 'failed');

  return { ok: true, outcome: 'assigned' };
}

/** Signed links for an offer's shared photos (lead_photos ids), in order. */
export async function sharedPhotoUrls(photoIds: string[]): Promise<Array<string | null>> {
  if (!photoIds || photoIds.length === 0) return [];
  const rows = (await supabaseRest<Array<{ id: string; storage_path: string }>>(
    'GET', `lead_photos?select=id,storage_path&id=${inList(photoIds)}`,
  )) ?? [];
  const ordered = photoIds.map((id) => rows.find((r) => r.id === id)?.storage_path).filter((p): p is string => !!p);
  return signPaths(ordered);
}

// ---------------------------------------------------------------------------
// Alex's side: the Sub Responses inbox (BD5-BD7)
// ---------------------------------------------------------------------------

export class InboxError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

async function loadResponseContext(responseId: string) {
  const rows = await supabaseRest<OfferResponseRow[]>('GET', `offer_responses?select=${RESPONSE_COLUMNS}&id=eq.${responseId}`);
  const response = rows?.[0];
  if (!response) throw new InboxError('That response no longer exists.', 404);
  const [offers, recipients, subs] = await Promise.all([
    supabaseRest<JobOfferRow[]>('GET', `job_offers?select=${OFFER_COLUMNS}&id=eq.${response.offer_id}`),
    supabaseRest<OfferRecipientRow[]>('GET', `offer_recipients?select=${RECIPIENT_COLUMNS}&id=eq.${response.recipient_id}`),
    supabaseRest<SubRow[]>('GET', `subs?select=${SUB_COLUMNS}&id=eq.${response.sub_id}`),
  ]);
  const offer = offers?.[0];
  const recipient = recipients?.[0];
  const sub = subs?.[0];
  if (!offer || !recipient || !sub) throw new InboxError('The offer behind this response is gone.', 404);
  return { response, offer, recipient, sub };
}

export type InboxAction =
  | { action: 'accept' }
  | { action: 'reject'; text?: string }
  | { action: 'reply_price'; price_cents: number; text?: string }
  | { action: 'reply_details'; text: string; attachments: Attachment[] };

export async function handleInboxAction(responseId: string, act: InboxAction, by: string | null, now: Date = new Date()):
  Promise<{ status: string; email_status: string; sms_status: string; expires_at?: string }> {
  const { response, offer, recipient, sub } = await loadResponseContext(responseId);
  if (response.status !== 'pending') throw new InboxError(`This response was already handled (${response.status}).`, 409);
  if (offer.status !== 'open') throw new InboxError(`The offer is ${offer.status}; there is nothing to answer.`, 409);

  let patch: Record<string, unknown>;
  let notice: NoticeKind;
  let priceCents: number | undefined;
  let replyText: string | undefined;
  let newExpiry: string | undefined;

  if (act.action === 'reply_details') {
    if (response.type !== 'details') throw new InboxError('Only a detail request takes a details reply.');
    patch = { status: 'replied', admin_reply: act.text, admin_reply_at: now.toISOString(), admin_reply_attachments: act.attachments };
    notice = 'reply_details';
    replyText = act.text;
  } else {
    if (response.type !== 'counter') throw new InboxError('Only a counter offer can be accepted, rejected or re-priced.');
    if (act.action === 'accept') {
      const violation = subPayViolation(offer.customer_price_cents, response.counter_cents ?? 0);
      if (violation) throw new InboxError(`Cannot accept: ${violation}`);
      patch = { status: 'accepted', admin_reply_at: now.toISOString() };
      notice = 'counter_accepted';
      priceCents = response.counter_cents ?? undefined;
    } else if (act.action === 'reject') {
      patch = { status: 'rejected', admin_reply: act.text ?? null, admin_reply_at: now.toISOString() };
      notice = 'counter_rejected';
      priceCents = response.counter_cents ?? undefined;
    } else {
      const violation = subPayViolation(offer.customer_price_cents, act.price_cents);
      if (violation) throw new InboxError(violation);
      patch = { status: 'replied', admin_price_cents: act.price_cents, admin_reply: act.text ?? null, admin_reply_at: now.toISOString() };
      notice = 'reply_price';
      priceCents = act.price_cents;
      replyText = act.text;
    }
  }

  // Conditional on still pending, so a double click cannot send two replies.
  const updated = await supabaseRest<OfferResponseRow[]>(
    'PATCH', `offer_responses?id=eq.${response.id}&status=eq.pending&select=id`, patch,
  );
  if (!updated || updated.length === 0) throw new InboxError('This response was just handled by someone else.', 409);

  // Answering a detail request restarts the sub's clock where it stopped (BD6).
  if (act.action === 'reply_details' && recipient.paused_at) {
    const otherPending = await supabaseRest<Array<{ id: string }>>(
      'GET', `offer_responses?select=id&recipient_id=eq.${recipient.id}&type=eq.details&status=eq.pending`,
    );
    if (!otherPending || otherPending.length === 0) {
      newExpiry = extendedExpiry(recipient.expires_at, recipient.paused_at, now);
      await supabaseRest('PATCH', `offer_recipients?id=eq.${recipient.id}`, { expires_at: newExpiry, paused_at: null }, { prefer: 'return=minimal' });
    }
  }

  const msg = buildNotice(notice, {
    lang: sub.language, subName: sub.contact_name || sub.business_name, trade: offer.trade, town: offer.town,
    token: recipient.token, priceCents, replyText,
  });
  const sent = await sendToSub({ sub, category: 'sub_offer_notice', email: msg, sms: msg.sms, sentBy: by, campaign: { offer_id: offer.id, notice } });

  const what = act.action === 'reply_details' ? 'Answered detail request from'
    : act.action === 'accept' ? `Accepted ${formatDollars(response.counter_cents ?? 0)} counter from`
      : act.action === 'reject' ? `Rejected ${formatDollars(response.counter_cents ?? 0)} counter from`
        : `Replied ${formatDollars(act.price_cents)} to the counter from`;
  await appendRequestNote(offer.request_id, `${what} ${sub.business_name} (${tradeLabel(offer.trade)}).`, {}, by);

  return { status: String(patch.status), email_status: sent.email, sms_status: sent.sms, expires_at: newExpiry };
}

export async function logDeclineCall(
  callId: string,
  outcome: { counter_cents: number | null; will_take: boolean | null; reason_text: string },
  by: string | null,
): Promise<DeclineCallRow> {
  const rows = await supabaseRest<DeclineCallRow[]>(
    'PATCH',
    `decline_calls?id=eq.${callId}&status=eq.open&select=id,response_id,request_id,sub_id,status,counter_cents,will_take,reason_text,called_at,created_at`,
    { ...outcome, status: 'done', called_at: new Date().toISOString() },
  );
  const call = rows?.[0];
  if (!call) throw new InboxError('That call task is already done or gone.', 409);
  const subs = await supabaseRest<Array<{ business_name: string }>>('GET', `subs?select=business_name&id=eq.${call.sub_id}`);
  const parts = [
    outcome.counter_cents ? `would do it for ${formatDollars(outcome.counter_cents)}` : null,
    outcome.will_take === true ? 'will take it' : outcome.will_take === false ? 'will not take it' : null,
    outcome.reason_text ? `"${outcome.reason_text}"` : null,
  ].filter(Boolean).join(', ');
  await appendRequestNote(call.request_id, `Decline call with ${subs?.[0]?.business_name ?? 'sub'}: ${parts || 'logged'}.`, {}, by);
  return call;
}

// ---------------------------------------------------------------------------
// Expiry (BD8)
// ---------------------------------------------------------------------------

export interface ExpiryRun {
  checked: number;
  expiredOffers: string[];
  recipientsClosed: number;
  stillLive: number;
}

/**
 * Offers past expires_at that are still open. A recipient whose clock is
 * paused, or whose deadline was extended past now by a detail reply, keeps the
 * offer alive; everyone else is closed 'expired'. When nobody live is left the
 * offer expires and the request is flagged for Alex.
 */
export async function expireOffers(now: Date = new Date(), limit = 200): Promise<ExpiryRun> {
  const nowIso = now.toISOString();
  const offers = (await supabaseRest<JobOfferRow[]>(
    'GET', `job_offers?select=${OFFER_COLUMNS}&status=eq.open&expires_at=lte.${encodeURIComponent(nowIso)}&order=expires_at.asc&limit=${limit}`,
  )) ?? [];
  const run: ExpiryRun = { checked: offers.length, expiredOffers: [], recipientsClosed: 0, stillLive: 0 };

  for (const offer of offers) {
    // Never close a paused recipient, and never one whose own deadline is ahead.
    const closed = (await supabaseRest<Array<{ id: string }>>(
      'PATCH',
      `offer_recipients?offer_id=eq.${offer.id}&closed_reason=is.null&paused_at=is.null&expires_at=lte.${encodeURIComponent(nowIso)}&select=id`,
      { closed_reason: 'expired' },
    )) ?? [];
    run.recipientsClosed += closed.length;

    const live = (await supabaseRest<Array<{ id: string }>>(
      'GET', `offer_recipients?select=id&offer_id=eq.${offer.id}&closed_reason=is.null`,
    )) ?? [];
    if (live.length > 0) {
      run.stillLive += 1;
      continue;
    }

    const expired = await supabaseRest<JobOfferRow[]>(
      'PATCH', `job_offers?id=eq.${offer.id}&status=eq.open&select=id`, { status: 'expired' },
    );
    if (!expired || expired.length === 0) continue; // assigned or cancelled in the meantime
    run.expiredOffers.push(offer.id);

    const request = await appendRequestNote(
      offer.request_id,
      `Offer expired with no acceptance - adjust pay and resend (${tradeLabel(offer.trade)} at ${formatDollars(offer.sub_pay_cents)}).`,
    );
    const who = request ? `${request.first_name} ${request.last_name}`.trim() : '';
    await sendTelegramMessage(
      `⏰ <b>Offer expired</b>\n${escapeTelegram(tradeLabel(offer.trade))} in ${escapeTelegram(offer.town)} at ${formatDollars(offer.sub_pay_cents)}${who ? ` for ${escapeTelegram(who)}` : ''}: nobody accepted. Adjust pay and resend: ${adminLink()}`,
    ).catch(() => 'failed');
  }
  return run;
}

/** Scope lines for one service on a request, as the bid form pre-fills them. */
export function scopeLinesFor(request: Pick<HomeServiceRequestRow, 'services' | 'answers' | 'notes'>, trade: Trade): string {
  const slug = serviceForTrade(request.services, trade);
  const lines = slug ? describeAnswers([slug], request.answers) : [];
  const name = slug ? getService(slug)?.name.en : tradeLabel(trade);
  return [lines[0] ?? name, request.notes ? `Homeowner notes: ${request.notes}` : ''].filter(Boolean).join('\n');
}

export { offerLink };
