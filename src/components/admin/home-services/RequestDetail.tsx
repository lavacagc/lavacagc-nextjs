'use client';

/**
 * The detail panel for one service request (AD2-AD4, BD1, BD9 status):
 * contact with one-tap call and text, the map link, every field, the answers
 * as lines, photos (signed links), status change, Won and Lost, append-only
 * notes, the offers already sent with who got them and what they said, and
 * the "Send bid request" form.
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, MapPin, MessageSquare, Phone, Mail, Send, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { formatDollars, parseDollarsToCents } from '@/lib/home-services/pricing';
import { dialable, mapsUrl, type HomeServiceRequestRow, type RequestStatus } from '@/lib/home-services/requestsAdmin';
import type { JobOfferRow, OfferRecipientRow, OfferResponseRow } from '@/lib/home-services/offerRules';
import { DECLINE_REASON_LABEL } from '@/lib/home-services/offerRules';
import { LabeledSelect, StatusBadge, channelLabel, fetchJson, formatWhen, jsonInit, serviceName, tradeName } from './shared';
import BidRequestForm, { type BidTrade } from './BidRequestForm';

export interface DetailResponse {
  request: HomeServiceRequestRow & { county: string | null; answer_lines: string[] };
  photos: Array<{ id: string; url: string | null; content_type: string; created_at: string }>;
  offers: Array<JobOfferRow & {
    assigned_sub_name: string | null;
    recipients: Array<Omit<OfferRecipientRow, 'token'> & { sub_name: string }>;
    responses: Array<OfferResponseRow & { sub_name: string }>;
  }>;
  /** Latest offer state per trade that went out. */
  trade_state: Array<{ trade: string; status: string }>;
  bid: { trades: BidTrade[] };
  integrations: { specnook: boolean; sms: boolean; email: boolean };
}

const MANUAL_STATUSES: RequestStatus[] = ['held', 'new', 'contacted', 'bid_sent', 'assigned'];
const TIMING_LABEL: Record<string, string> = { this_week: 'This week', two_weeks: 'Next two weeks', flexible: 'Flexible' };

/** The column says `cancelled`; Alex's word for it is withdrawn. */
function offerStateLabel(status: string): string {
  return status === 'cancelled' ? 'withdrawn' : status;
}

const TRADE_STATE_STYLE: Record<string, string> = {
  open: 'border-violet-300 bg-violet-50 text-violet-900',
  assigned: 'border-teal-300 bg-teal-50 text-teal-900',
  expired: 'border-red-300 bg-red-50 text-red-800',
  cancelled: 'border-zinc-300 bg-zinc-100 text-zinc-700',
};

export default function RequestDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [nextStatus, setNextStatus] = useState<RequestStatus | ''>('');
  const [note, setNote] = useState('');
  const [wonPrice, setWonPrice] = useState('');
  const [lostReason, setLostReason] = useState('');
  const [outcome, setOutcome] = useState<'won' | 'lost' | null>(null);
  const [bidOpen, setBidOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await fetchJson<DetailResponse>(`/api/admin/service-requests/${id}`);
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the request');
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function patch(body: Record<string, unknown>, label: string) {
    setBusy(label);
    try {
      await fetchJson(`/api/admin/service-requests/${id}`, jsonInit('PATCH', body));
      await load();
      onChanged();
      return true;
    } catch (e) {
      toast({ title: `Could not ${label}`, description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function retryPush(offerId: string) {
    setBusy('retry');
    try {
      const res = await fetchJson<{ specnook_push_status: string }>(`/api/admin/offers/${offerId}`, jsonInit('POST', { action: 'retry_push' }));
      toast({ title: `SpecNook push: ${res.specnook_push_status}` });
      await load();
    } catch (e) {
      toast({ title: 'Could not retry the push', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  async function cancelOffer(offerId: string) {
    setBusy('withdraw');
    try {
      await fetchJson(`/api/admin/offers/${offerId}`, jsonInit('POST', { action: 'cancel' }));
      await load();
      onChanged();
    } catch (e) {
      toast({ title: 'Could not withdraw the offer', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  if (error) return <p className="mt-4 text-sm font-medium text-red-700" role="alert">{error}</p>;
  if (!data) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" /></div>;

  const r = data.request;
  const name = `${r.first_name} ${r.last_name}`.trim() || 'No name';
  const phone = dialable(r.phone);
  const fullAddress = [r.address, r.town, r.zip].filter(Boolean).join(', ');
  const wonCents = parseDollarsToCents(wonPrice);

  if (bidOpen) {
    return (
      <BidRequestForm
        request={r}
        trades={data.bid.trades}
        photos={data.photos}
        integrations={data.integrations}
        // Subs may have answered while the form was open; come back to fresh state.
        onBack={() => { setBidOpen(false); void load(); }}
        onSent={() => { void load(); onChanged(); }}
      />
    );
  }

  return (
    <div className="mt-4 space-y-6 pb-8 text-sm" data-testid="sr-detail">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-xl font-bold" data-testid="sr-detail-name">{name}</h3>
          <StatusBadge status={r.status} />
          {r.phone_verified ? <Badge variant="outline" className="border-green-300 text-green-800">phone verified</Badge> : <Badge variant="outline">phone unverified</Badge>}
        </div>
        <p className="text-muted-foreground">{r.services.map(serviceName).join(', ')}</p>
        <div className="flex flex-wrap gap-2">
          {phone && (
            <>
              <Button asChild size="sm" variant="outline"><a href={`tel:${phone}`} data-testid="sr-call"><Phone className="mr-1.5 h-4 w-4" aria-hidden />Call {r.phone}</a></Button>
              <Button asChild size="sm" variant="outline"><a href={`sms:${phone}`} data-testid="sr-text"><MessageSquare className="mr-1.5 h-4 w-4" aria-hidden />Text</a></Button>
            </>
          )}
          {r.email && <Button asChild size="sm" variant="outline"><a href={`mailto:${r.email}`}><Mail className="mr-1.5 h-4 w-4" aria-hidden />Email</a></Button>}
          {fullAddress && (
            <Button asChild size="sm" variant="outline">
              <a href={mapsUrl(r.address, r.town, r.zip)} target="_blank" rel="noreferrer" data-testid="sr-map"><MapPin className="mr-1.5 h-4 w-4" aria-hidden />Map</a>
            </Button>
          )}
        </div>
      </section>

      <section>
        <h4 className="mb-2 font-semibold">Details</h4>
        <dl className="grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-1.5" data-testid="sr-fields">
          <Field label="Address">{fullAddress || '-'}</Field>
          <Field label="County">{r.county ?? 'Unknown'}{r.in_service_area ? '' : ' (outside service area)'}</Field>
          <Field label="Phone">{r.phone || '-'}</Field>
          <Field label="Email">{r.email || '-'}</Field>
          <Field label="Timing">{TIMING_LABEL[r.timing] ?? r.timing}</Field>
          <Field label="Language">{r.language === 'es' ? 'Spanish' : 'English'}</Field>
          <Field label="Source">{r.source}{r.listing_id ? ` · listing ${r.listing_id}` : ''}</Field>
          <Field label="UTM">{Object.keys(r.utm ?? {}).length ? Object.entries(r.utm).map(([k, v]) => `${k}=${v}`).join(', ') : '-'}</Field>
          <Field label="Landing page">{r.landing_path || '-'}</Field>
          <Field label="CTA variants">{r.cta_variant_primary || r.cta_variant_secondary ? `primary ${r.cta_variant_primary ?? '-'}, secondary ${r.cta_variant_secondary ?? '-'}` : '-'}</Field>
          <Field label="CAPTCHA score">{r.captcha_score ?? '-'}</Field>
          <Field label="SMS consent">{r.consent_sms ? 'Yes' : 'No'}</Field>
          <Field label="Merged">{r.merged_count > 0 ? `${r.merged_count} later request(s) merged in` : 'No'}</Field>
          <Field label="Created">{formatWhen(r.created_at)}</Field>
          {r.status === 'won' && <Field label="Won">{r.customer_price_cents ? formatDollars(r.customer_price_cents) : '-'} · {formatWhen(r.won_at)}</Field>}
          {r.status === 'lost' && <Field label="Lost reason">{r.lost_reason ?? '-'}</Field>}
        </dl>
      </section>

      <section>
        <h4 className="mb-2 font-semibold">Answers</h4>
        <ul className="list-disc space-y-1 pl-5" data-testid="sr-answers">
          {r.answer_lines.map((line) => <li key={line}>{line}</li>)}
        </ul>
        {r.notes && <p className="mt-2 whitespace-pre-line rounded-md bg-muted p-2"><span className="font-medium">Homeowner notes: </span>{r.notes}</p>}
      </section>

      <section>
        <h4 className="mb-2 font-semibold">Photos ({data.photos.length})</h4>
        {data.photos.length === 0 ? (
          <p className="text-muted-foreground">No photos.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="sr-photos">
            {data.photos.map((p, i) => (
              <li key={p.id}>
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border">
                    {/* Signed private-bucket links expire; next/image would cache them past that. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={`Photo ${i + 1} from ${name}`} className="aspect-square w-full object-cover" loading="lazy" />
                  </a>
                ) : (
                  <div className="flex aspect-square items-center justify-center rounded-md border text-xs text-muted-foreground">Could not sign</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-lg border p-3">
        <h4 className="font-semibold">Status</h4>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-48">
            <LabeledSelect id="sr-status-select" label="Change status to" value={nextStatus} onChange={(e) => setNextStatus(e.target.value as RequestStatus)}>
              <option value="">Choose a status</option>
              {MANUAL_STATUSES.filter((st) => st !== r.status).map((st) => (
                <option key={st} value={st}>{st === 'bid_sent' ? 'Bid sent' : st[0].toUpperCase() + st.slice(1)}</option>
              ))}
            </LabeledSelect>
          </div>
          <Button
            size="sm"
            disabled={!nextStatus || !!busy}
            onClick={async () => { if (await patch({ action: 'status', status: nextStatus }, 'change status')) setNextStatus(''); }}
            data-testid="sr-status-save"
          >
            {busy === 'change status' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save status'}
          </Button>
          <Button size="sm" variant="outline" className="border-green-400 text-green-800" onClick={() => setOutcome(outcome === 'won' ? null : 'won')} aria-expanded={outcome === 'won'} data-testid="sr-won">Mark won</Button>
          <Button size="sm" variant="outline" onClick={() => setOutcome(outcome === 'lost' ? null : 'lost')} aria-expanded={outcome === 'lost'} data-testid="sr-lost">Mark lost</Button>
        </div>
        {outcome === 'won' && (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!wonCents) return;
              if (await patch({ action: 'won', customer_price_cents: wonCents }, 'mark won')) { setOutcome(null); setWonPrice(''); }
            }}
          >
            <div className="w-48">
              <label htmlFor="sr-won-price" className="mb-1 block text-xs font-medium text-muted-foreground">Customer price (USD)</label>
              <Input id="sr-won-price" inputMode="decimal" value={wonPrice} onChange={(e) => setWonPrice(e.target.value)} placeholder="2000" />
            </div>
            <Button size="sm" type="submit" disabled={!wonCents || !!busy} data-testid="sr-won-save">Save as won</Button>
            {wonPrice && !wonCents && <p className="w-full text-xs text-red-700">Enter dollars, for example 2000 or 2,000.50.</p>}
          </form>
        )}
        {outcome === 'lost' && (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!lostReason.trim()) return;
              if (await patch({ action: 'lost', reason: lostReason.trim() }, 'mark lost')) { setOutcome(null); setLostReason(''); }
            }}
          >
            <div className="min-w-0 flex-1">
              <label htmlFor="sr-lost-reason" className="mb-1 block text-xs font-medium text-muted-foreground">Why was it lost?</label>
              <Input id="sr-lost-reason" value={lostReason} onChange={(e) => setLostReason(e.target.value)} placeholder="Went with another contractor" maxLength={500} />
            </div>
            <Button size="sm" type="submit" disabled={!lostReason.trim() || !!busy} data-testid="sr-lost-save">Save as lost</Button>
          </form>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-semibold">Bid requests</h4>
          <Button size="sm" onClick={() => setBidOpen(true)} disabled={data.bid.trades.length === 0} data-testid="sr-send-bid">
            <Send className="mr-1.5 h-4 w-4" aria-hidden /> Send bid request
          </Button>
        </div>
        {data.trade_state.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="State per trade" data-testid="sr-trade-state">
            {data.trade_state.map((ts) => (
              <li key={ts.trade} data-trade={ts.trade} data-state={offerStateLabel(ts.status)}>
                <Badge variant="outline" className={TRADE_STATE_STYLE[ts.status] ?? ''}>
                  {tradeName(ts.trade)}: {offerStateLabel(ts.status)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        {data.offers.length === 0 ? (
          <p className="text-muted-foreground">No offers sent yet.</p>
        ) : (
          <ul className="space-y-3" data-testid="sr-offers">
            {data.offers.map((o) => (
              <li key={o.id} className="rounded-lg border p-3" data-testid="sr-offer" data-offer-status={o.status}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{tradeName(o.trade)}</span>
                  <Badge variant="outline">{offerStateLabel(o.status)}</Badge>
                  <span className="text-muted-foreground">pay {formatDollars(o.sub_pay_cents)} · customer {formatDollars(o.customer_price_cents)}</span>
                  {o.status === 'open' && (
                    <Button size="sm" variant="ghost" className="ml-auto h-7 text-red-700" onClick={() => cancelOffer(o.id)} disabled={!!busy}>
                      <XCircle className="mr-1 h-3.5 w-3.5" aria-hidden /> Withdraw
                    </Button>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sent {formatWhen(o.created_at)} · {o.status === 'open' ? `expires ${formatWhen(o.expires_at)}` : o.status === 'assigned' ? `assigned to ${o.assigned_sub_name} ${formatWhen(o.assigned_at)}` : ''}
                </p>
                {o.status === 'assigned' && (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs" data-testid="sr-push" data-push-status={o.specnook_push_status}>
                    <span>
                      SpecNook push: <strong>{o.specnook_push_status}</strong>
                      {o.specnook_push_status !== 'sent' && !data.integrations.specnook && ' (SpecNook not connected; it goes out once SpecNook is configured)'}
                    </span>
                    {o.specnook_push_status !== 'sent' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        onClick={() => retryPush(o.id)}
                        disabled={!!busy || !data.integrations.specnook}
                        title={data.integrations.specnook ? undefined : 'SpecNook is not connected'}
                        data-testid="sr-push-retry"
                      >
                        Retry
                      </Button>
                    )}
                  </div>
                )}
                <ul className="mt-2 space-y-1 text-xs">
                  {o.recipients.map((rc) => (
                    <li key={rc.id} className="flex flex-wrap gap-x-2">
                      <span className="font-medium">{rc.sub_name}</span>
                      <span>email {channelLabel(rc.email_status)}</span>
                      <span>text {channelLabel(rc.sms_status)}</span>
                      {rc.paused_at && <span className="text-amber-700">clock paused</span>}
                      {rc.closed_reason && <span className="text-muted-foreground">closed: {rc.closed_reason}</span>}
                    </li>
                  ))}
                </ul>
                {o.responses.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t pt-2 text-xs">
                    {o.responses.map((resp) => (
                      <li key={resp.id}>
                        <span className="font-medium">{resp.sub_name}</span>{' '}
                        {resp.type === 'counter' && `countered ${formatDollars(resp.counter_cents ?? 0)}`}
                        {resp.type === 'details' && 'asked for details'}
                        {resp.type === 'decline' && `declined (${resp.decline_reason ? DECLINE_REASON_LABEL[resp.decline_reason] : 'no reason'})`}
                        {resp.type === 'accept' && `accepted${resp.counter_cents ? ` at ${formatDollars(resp.counter_cents)}` : ''}`}
                        {' '}<span className="text-muted-foreground">· {resp.status} · {formatWhen(resp.created_at)}</span>
                        {resp.note && <span className="block text-muted-foreground">&ldquo;{resp.note}&rdquo;</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h4 className="font-semibold">Admin notes</h4>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-sans text-xs leading-relaxed" data-testid="sr-admin-notes">
          {r.admin_notes || 'No notes yet.'}
        </pre>
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!note.trim()) return;
            if (await patch({ action: 'note', text: note.trim() }, 'add the note')) setNote('');
          }}
        >
          <label htmlFor="sr-note" className="sr-only">Add a note</label>
          <Textarea id="sr-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (kept with a timestamp, never edited)" maxLength={2000} />
          <Button size="sm" type="submit" variant="outline" disabled={!note.trim() || !!busy} data-testid="sr-note-save">Add note</Button>
        </form>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}
