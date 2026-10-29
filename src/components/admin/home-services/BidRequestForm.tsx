'use client';

/**
 * "Send bid request" (BD1-BD4). One block per trade on the request: sub pay,
 * the customer price computed at 1.43x (editable), the live margin, the 70%
 * rule blocking the send with its reason, the homeowner's answers (each sub
 * reads them in their own language), Alex's own scope text, town only, photos
 * to share and target dates. The homeowner's free-text notes are shown in a
 * private box and never sent: they can hold gate codes or an address, and subs
 * see the town only until one wins. It shows who will get each
 * offer and who will not and why, and after sending, exactly who got what over
 * which channel.
 */
import { useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';
import { HOME_SERVICES_CATALOG, type Trade } from '@/lib/home-services/catalog';
import {
  OFFER_TTL_HOURS, SUB_MARKUP, customerPriceForSubPay, formatDollars, margin, parseDollarsToCents, subPayViolation,
} from '@/lib/home-services/pricing';
import type { HomeServiceRequestRow } from '@/lib/home-services/requestsAdmin';
import { channelLabel, formatWhen, jsonInit, tradeName } from './shared';

export interface BidTrade {
  trade: Trade;
  /** The homeowner's taps for this trade, in English here; subs get their own language. */
  answers: string[];
  preview: {
    county: string | null;
    eligible: Array<{ id: string; business_name: string; language: string; email: string; phone: string }>;
    excluded: Array<{ id: string; business_name: string; reason: string }>;
  } | null;
}

interface TradeForm {
  include: boolean;
  subPay: string;
  customer: string;
  customerEdited: boolean;
  scope: string;
  town: string;
  photoIds: string[];
  start: string;
  end: string;
}

type SendResult =
  | { trade: Trade; status: 'sent'; offer_id: string; expires_at: string; recipients: Array<{ sub_id: string; business_name: string; language: string; email_status: string; sms_status: string }> }
  | { trade: Trade; status: 'no_eligible_subs'; excluded: Array<{ business_name: string; reason: string }> }
  | { trade: Trade; status: 'already_open'; offer_id: string; expires_at: string };

const toDollars = (cents: number) => (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);

export default function BidRequestForm({
  request, trades, photos, integrations, onBack, onSent,
}: {
  request: HomeServiceRequestRow;
  trades: BidTrade[];
  photos: Array<{ id: string; url: string | null }>;
  integrations: { specnook: boolean; sms: boolean; email: boolean };
  onBack: () => void;
  onSent: () => void;
}) {
  const [forms, setForms] = useState<Record<string, TradeForm>>(() =>
    Object.fromEntries(trades.map((t) => [t.trade, {
      include: (t.preview?.eligible.length ?? 0) > 0,
      subPay: '',
      customer: '',
      customerEdited: false,
      scope: '',
      town: request.town,
      photoIds: photos.map((p) => p.id),
      start: '',
      end: '',
    } satisfies TradeForm])),
  );
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SendResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = (trade: string, patch: Partial<TradeForm>) =>
    setForms((f) => ({ ...f, [trade]: { ...f[trade], ...patch } }));

  const computed = useMemo(() => Object.fromEntries(trades.map((t) => {
    const f = forms[t.trade];
    const sub = parseDollarsToCents(f.subPay);
    const customer = f.customerEdited ? parseDollarsToCents(f.customer) : sub ? customerPriceForSubPay(sub) : null;
    const violation = !f.include ? null
      : !sub ? 'Enter the sub pay.'
        : !customer ? 'Enter the customer price.'
          : subPayViolation(customer, sub);
    const dateError = f.include && f.start && f.end && f.end < f.start ? 'The end date is before the start date.' : null;
    return [t.trade, { sub, customer, violation: violation ?? dateError, m: sub && customer ? margin(customer, sub) : null }];
  })), [forms, trades]);

  const included = trades.filter((t) => forms[t.trade].include);
  const blocked = included.length === 0 || included.some((t) => computed[t.trade].violation || !forms[t.trade].town.trim());

  async function send() {
    setSending(true);
    setError(null);
    try {
      const body = {
        request_id: request.id,
        offers: included.map((t) => {
          const f = forms[t.trade];
          return {
            trade: t.trade,
            sub_pay_cents: computed[t.trade].sub,
            customer_price_cents: computed[t.trade].customer,
            scope_summary: f.scope.trim(),
            town: f.town.trim(),
            photo_ids: f.photoIds,
            target_start: f.start || null,
            target_end: f.end || null,
          };
        }),
      };
      const res = await fetch('/api/admin/offers', jsonInit('POST', body));
      const data = await res.json().catch(() => ({}));
      if (data.results) {
        setResults(data.results);
        if (data.sent) onSent();
      } else {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send');
      toast({ title: 'Bid request not sent', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  }

  if (results) {
    return (
      <div className="mt-4 space-y-4 pb-8 text-sm" data-testid="bid-results">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" aria-hidden /> Back to the request</Button>
        <h3 className="text-lg font-bold">Bid request results</h3>
        {(!integrations.email || !integrations.sms) && (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900">
            {!integrations.email && 'Email is not configured (no Resend key), so no offer email left. '}
            {!integrations.sms && 'Text messages are not configured (no Twilio keys), so no offer text left. '}
            The offers exist and their links work; send the links another way if needed.
          </p>
        )}
        {results.map((res) => (
          <div key={res.trade} className="rounded-lg border p-3" data-testid="bid-result" data-trade={res.trade} data-status={res.status}>
            <p className="font-semibold">{tradeName(res.trade)}</p>
            {res.status === 'sent' && (
              <>
                <p className="text-muted-foreground">Sent to {res.recipients.length} sub{res.recipients.length === 1 ? '' : 's'} · expires {formatWhen(res.expires_at)}</p>
                <table className="mt-2 w-full text-left text-xs">
                  <thead><tr className="text-muted-foreground"><th className="py-1 font-medium">Sub</th><th className="font-medium">Lang</th><th className="font-medium">Email</th><th className="font-medium">Text</th></tr></thead>
                  <tbody>
                    {res.recipients.map((rc) => (
                      <tr key={rc.sub_id} className="border-t" data-testid="bid-recipient">
                        <td className="py-1 pr-2">{rc.business_name}</td>
                        <td className="pr-2 uppercase">{rc.language}</td>
                        <td className={`pr-2 ${rc.email_status === 'failed' ? 'font-bold text-red-700' : ''}`}>{channelLabel(rc.email_status)}</td>
                        <td className={rc.sms_status === 'failed' ? 'font-bold text-red-700' : ''}>{channelLabel(rc.sms_status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            {res.status === 'no_eligible_subs' && (
              <div className="text-red-700">
                <p className="font-medium">Not sent: no eligible sub for this trade. Nothing was created.</p>
                {res.excluded.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-xs">{res.excluded.map((x) => <li key={x.business_name}>{x.business_name}: {x.reason}</li>)}</ul>
                )}
              </div>
            )}
            {res.status === 'already_open' && (
              <p className="text-amber-800">Not sent: an offer for this trade is still open until {formatWhen(res.expires_at)}. Withdraw it first to resend at a different pay.</p>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-5 pb-8 text-sm" data-testid="bid-form">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" aria-hidden /> Back to the request</Button>
      <div>
        <h3 className="text-lg font-bold">Send bid request</h3>
        <p className="text-muted-foreground">
          One offer per trade, to every eligible sub at once. Subs see the town only until one wins. Expires in {OFFER_TTL_HOURS} hours.
        </p>
      </div>

      {request.notes.trim() && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-3" aria-labelledby="bid-private-notes-title" data-testid="bid-private-notes">
          <h4 id="bid-private-notes-title" className="text-xs font-semibold text-amber-900">Homeowner notes (private)</h4>
          <p className="mt-1 whitespace-pre-line text-sm text-amber-950">{request.notes}</p>
          <p className="mt-1 text-xs text-amber-900">Never sent to subs. Paraphrase anything they need into your scope notes, without codes or addresses.</p>
        </section>
      )}

      {trades.map((t) => {
        const f = forms[t.trade];
        const c = computed[t.trade];
        const catalog = HOME_SERVICES_CATALOG.find((s) => s.trade === t.trade);
        const eligible = t.preview?.eligible ?? [];
        const excluded = t.preview?.excluded ?? [];
        const idp = `bid-${t.trade}`;
        return (
          <fieldset key={t.trade} className="space-y-3 rounded-lg border p-3" data-testid="bid-trade" data-trade={t.trade}>
            <legend className="px-1 font-semibold">{tradeName(t.trade)}</legend>
            <div className="flex items-center gap-2">
              <Checkbox id={`${idp}-include`} checked={f.include} onCheckedChange={(v) => update(t.trade, { include: v === true })} disabled={eligible.length === 0} />
              <label htmlFor={`${idp}-include`}>Send this trade</label>
              {catalog && <span className="ml-auto text-xs text-muted-foreground">Catalog starting price {catalog.priceDisplay.en}</span>}
            </div>

            <div className="text-xs">
              <p className={eligible.length ? 'text-green-800' : 'font-medium text-red-700'} data-testid="bid-eligible">
                {eligible.length
                  ? `Goes to ${eligible.length}: ${eligible.map((e) => e.business_name).join(', ')}`
                  : `No eligible sub${t.preview?.county ? ` in ${t.preview.county}` : ''}. Nothing will be sent for this trade.`}
              </p>
              {excluded.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-muted-foreground" data-testid="bid-excluded">
                  {excluded.map((x) => <li key={x.id}>Not sent to {x.business_name}: {x.reason}</li>)}
                </ul>
              )}
            </div>

            {f.include && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={`${idp}-pay`} className="mb-1 block text-xs font-medium">Sub pay (USD)</label>
                    <Input id={`${idp}-pay`} inputMode="decimal" value={f.subPay} onChange={(e) => update(t.trade, { subPay: e.target.value })} placeholder={catalog ? String(Math.round(catalog.startingPriceCents / SUB_MARKUP / 100)) : "1400"} data-testid="bid-sub-pay" />
                  </div>
                  <div>
                    <label htmlFor={`${idp}-customer`} className="mb-1 block text-xs font-medium">Customer price (USD)</label>
                    <Input
                      id={`${idp}-customer`}
                      inputMode="decimal"
                      value={f.customerEdited ? f.customer : c.customer ? toDollars(c.customer) : ''}
                      onChange={(e) => update(t.trade, { customer: e.target.value, customerEdited: true })}
                      placeholder="auto (1.43x)"
                      data-testid="bid-customer"
                    />
                    {f.customerEdited && (
                      <button type="button" className="mt-1 text-xs underline" onClick={() => update(t.trade, { customerEdited: false, customer: '' })}>Back to 1.43x</button>
                    )}
                  </div>
                </div>
                <p className="text-xs" data-testid="bid-margin">
                  {c.m ? <>Margin <strong>{formatDollars(c.m.cents)}</strong> ({Math.round(c.m.share * 1000) / 10}%)</> : 'Margin shows once both prices are set.'}
                </p>
                {c.violation && <p className="text-xs font-medium text-red-700" role="alert" data-testid="bid-violation">{c.violation}</p>}

                <div>
                  <p className="mb-1 text-xs font-medium">Homeowner answers (subs see these, in their own language)</p>
                  {t.answers.length ? (
                    <ul className="mb-2 list-disc rounded-md bg-muted px-6 py-2 text-xs" data-testid="bid-answers">
                      {t.answers.map((line) => <li key={line}>{line}</li>)}
                    </ul>
                  ) : <p className="mb-2 text-xs text-muted-foreground">No answers for this service.</p>}
                  <label htmlFor={`${idp}-scope`} className="mb-1 block text-xs font-medium">Your scope notes for subs (optional, sent as written)</label>
                  <Textarea id={`${idp}-scope`} rows={3} maxLength={2000} value={f.scope} onChange={(e) => update(t.trade, { scope: e.target.value })} placeholder="Measurements, access, anything the answers leave out" />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label htmlFor={`${idp}-town`} className="mb-1 block text-xs font-medium">Town (no street address)</label>
                    <Input id={`${idp}-town`} value={f.town} onChange={(e) => update(t.trade, { town: e.target.value })} maxLength={80} />
                  </div>
                  <div>
                    <label htmlFor={`${idp}-start`} className="mb-1 block text-xs font-medium">Target start</label>
                    <Input id={`${idp}-start`} type="date" value={f.start} onChange={(e) => update(t.trade, { start: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor={`${idp}-end`} className="mb-1 block text-xs font-medium">Target end</label>
                    <Input id={`${idp}-end`} type="date" value={f.end} onChange={(e) => update(t.trade, { end: e.target.value })} />
                  </div>
                </div>
                {photos.length > 0 && (
                  <fieldset>
                    <legend className="mb-1 text-xs font-medium">Photos to share</legend>
                    <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                      {photos.map((p, i) => {
                        const checked = f.photoIds.includes(p.id);
                        return (
                          <li key={p.id}>
                            <label className={`block cursor-pointer overflow-hidden rounded-md border-2 ${checked ? 'border-primary' : 'border-transparent opacity-60'}`}>
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={checked}
                                onChange={() => update(t.trade, { photoIds: checked ? f.photoIds.filter((x) => x !== p.id) : [...f.photoIds, p.id] })}
                              />
                              <span className="sr-only">Share photo {i + 1}</span>
                              {p.url
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={p.url} alt="" className="aspect-square w-full object-cover" />
                                : <span className="flex aspect-square items-center justify-center text-[10px]">Photo {i + 1}</span>}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </fieldset>
                )}
              </>
            )}
          </fieldset>
        );
      })}

      {error && <p className="text-sm font-medium text-red-700" role="alert">{error}</p>}
      <Button onClick={send} disabled={blocked || sending} className="w-full sm:w-auto" data-testid="bid-send">
        {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" aria-hidden />}
        Send {included.length > 0 ? `${included.length} offer${included.length > 1 ? 's' : ''}` : 'bid request'}
      </Button>
      {included.length === 0 && <p className="text-xs text-muted-foreground">No trade is selected or eligible, so nothing can be sent.</p>}
    </div>
  );
}
