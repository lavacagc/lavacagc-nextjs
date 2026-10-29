'use client';

/**
 * Sub Responses inbox (BD5-BD7): pending counter offers (accept, reject, reply
 * with a new price), pending detail requests (answer with text and files, which
 * restarts the sub's paused clock), and open decline call tasks (log what the
 * sub said on the phone). No counter is ever approved without Alex.
 */
import { useEffect, useState } from 'react';
import { Loader2, Paperclip, Phone } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { formatDollars, parseDollarsToCents, subPayViolation } from '@/lib/home-services/pricing';
import {
  DECLINE_REASON_LABEL, MAX_RESPONSE_BODY_BYTES, MAX_RESPONSE_FILES, MAX_RESPONSE_FILE_BYTES, type DeclineReason,
} from '@/lib/home-services/offerRules';
import { compressAll } from '@/lib/home-services/compressImage';
import { dialable } from '@/lib/home-services/requestsAdmin';
import { fetchJson, formatWhen, jsonInit, tradeName } from './shared';

interface SubLite { id: string; business_name: string; contact_name: string; phone: string; email: string; language: string }
interface OfferLite { id: string; trade: string; town: string; sub_pay_cents: number; customer_price_cents: number; status: string; expires_at: string; request_id: string }
interface RequestLite { id: string; first_name: string; last_name: string; town: string }

interface InboxItem {
  id: string;
  type: 'counter' | 'details';
  counter_cents: number | null;
  note: string;
  created_at: string;
  attachments: Array<{ name: string; content_type: string; url: string | null }>;
  sub: SubLite | null;
  offer: OfferLite | null;
  request: RequestLite | null;
  recipient: { paused_at: string | null; expires_at: string; closed_reason: string | null } | null;
}

interface DeclineCall {
  id: string;
  created_at: string;
  reason: DeclineReason | null;
  note: string;
  sub: SubLite | null;
  offer: OfferLite | null;
  request: RequestLite | null;
}

interface Inbox { counters: InboxItem[]; details: InboxItem[]; declineCalls: DeclineCall[]; closed: InboxItem[] }

export default function SubResponsesInbox({ onChanged }: { onChanged: () => void }) {
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let current = true;
    fetchJson<Inbox>('/api/admin/offers/responses')
      .then((data) => { if (current) { setInbox(data); setError(null); } })
      .catch((e) => { if (current) setError(e instanceof Error ? e.message : 'Could not load the inbox'); });
    return () => { current = false; };
  }, [version]);

  const changed = () => { setVersion((v) => v + 1); onChanged(); };

  if (error) return <p className="text-sm font-medium text-red-700" role="alert">The inbox could not be read, so this is not an empty inbox: {error}</p>;
  if (!inbox) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" /></div>;

  return (
    <div className="space-y-4" data-testid="inbox">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Counter offers ({inbox.counters.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {inbox.counters.length === 0 && <p className="text-sm text-muted-foreground">No counters waiting.</p>}
          {inbox.counters.map((item) => <CounterItem key={item.id} item={item} onDone={changed} />)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Detail requests ({inbox.details.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {inbox.details.length === 0 && <p className="text-sm text-muted-foreground">No questions waiting.</p>}
          {inbox.details.map((item) => <DetailsItem key={item.id} item={item} onDone={changed} />)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Decline calls to make ({inbox.declineCalls.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {inbox.declineCalls.length === 0 && <p className="text-sm text-muted-foreground">No calls to make.</p>}
          {inbox.declineCalls.map((call) => <DeclineCallItem key={call.id} call={call} onDone={changed} />)}
        </CardContent>
      </Card>

      {inbox.closed.length > 0 && (
        <details className="rounded-lg border bg-card" data-testid="inbox-closed">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            Closed ({inbox.closed.length}) - their offer was assigned, expired or withdrawn
          </summary>
          <ul className="space-y-2 px-4 pb-4">
            {inbox.closed.map((item) => (
              <li key={item.id} className="rounded-md border p-3 opacity-80" data-testid="inbox-closed-item" data-response-id={item.id}>
                <Context sub={item.sub} offer={item.offer} request={item.request} created={item.created_at} />
                <p className="mt-1 text-sm">
                  {item.type === 'counter' ? `Counter: ${formatDollars(item.counter_cents ?? 0)}` : `Asked: ${item.note}`}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Context({ sub, offer, request, created }: { sub: SubLite | null; offer: OfferLite | null; request: RequestLite | null; created: string }) {
  return (
    <div className="text-sm">
      <p>
        <span className="font-semibold">{sub?.business_name ?? 'Unknown sub'}</span>
        {sub?.contact_name ? ` (${sub.contact_name})` : ''} · {offer ? `${tradeName(offer.trade)} in ${offer.town}` : 'offer gone'}
      </p>
      <p className="text-xs text-muted-foreground">
        {request ? `${request.first_name} ${request.last_name}`.trim() : ''}
        {offer ? ` · offered ${formatDollars(offer.sub_pay_cents)}, customer ${formatDollars(offer.customer_price_cents)} · offer ${offer.status}` : ''}
        {` · ${formatWhen(created)}`}
      </p>
    </div>
  );
}

function CounterItem({ item, onDone }: { item: InboxItem; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [price, setPrice] = useState('');
  const [text, setText] = useState('');
  const counter = item.counter_cents ?? 0;
  const acceptBlock = item.offer ? subPayViolation(item.offer.customer_price_cents, counter) : 'The offer is gone.';
  const replyCents = parseDollarsToCents(price);
  const replyBlock = replyCents && item.offer ? subPayViolation(item.offer.customer_price_cents, replyCents) : null;
  const offerClosed = item.offer?.status !== 'open';

  async function act(body: Record<string, unknown>, done: string) {
    setBusy(true);
    try {
      const res = await fetchJson<{ email_status: string; sms_status: string }>(`/api/admin/offers/responses/${item.id}`, jsonInit('POST', body));
      toast({ title: done, description: `Email ${res.email_status}, text ${res.sms_status}.` });
      onDone();
    } catch (e) {
      toast({ title: 'Not sent', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border p-3" data-testid="inbox-counter" data-response-id={item.id}>
      <Context sub={item.sub} offer={item.offer} request={item.request} created={item.created_at} />
      <p className="text-lg font-bold">Counter: {formatDollars(counter)}</p>
      {item.note && <p className="text-sm">&ldquo;{item.note}&rdquo;</p>}
      {acceptBlock && <p className="text-xs font-medium text-red-700" data-testid="inbox-counter-block">Cannot accept: {acceptBlock}</p>}
      {offerClosed && <p className="text-xs text-muted-foreground">The offer is {item.offer?.status}; there is nothing to answer.</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || !!acceptBlock || offerClosed} onClick={() => act({ action: 'accept' }, 'Counter accepted. The sub must confirm.')} data-testid="inbox-accept">
          Accept {formatDollars(counter)}
        </Button>
        <Button size="sm" variant="outline" disabled={busy || offerClosed} onClick={() => act({ action: 'reject', text: text || undefined }, 'Counter rejected')} data-testid="inbox-reject">
          Reject
        </Button>
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => { e.preventDefault(); if (replyCents && !replyBlock) void act({ action: 'reply_price', price_cents: replyCents, text: text || undefined }, 'New price sent'); }}
      >
        <div className="w-36">
          <label htmlFor={`reply-price-${item.id}`} className="mb-1 block text-xs font-medium text-muted-foreground">Reply with a new price</label>
          <Input id={`reply-price-${item.id}`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="1500" />
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor={`reply-text-${item.id}`} className="mb-1 block text-xs font-medium text-muted-foreground">Message (optional)</label>
          <Input id={`reply-text-${item.id}`} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
        </div>
        <Button size="sm" type="submit" variant="outline" disabled={busy || !replyCents || !!replyBlock || offerClosed} data-testid="inbox-reply-price">Send price</Button>
        {replyBlock && <p className="w-full text-xs font-medium text-red-700">{replyBlock}</p>}
      </form>
    </div>
  );
}

function DetailsItem({ item, onDone }: { item: InboxItem; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const offerClosed = item.offer?.status !== 'open';

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    if (files.length > MAX_RESPONSE_FILES) {
      toast({ title: 'Up to 3 files', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      // Photos are shrunk in the browser first (1600 px, JPEG 0.8); the server caps
      // each file at 3.5 MB and the whole body at 4 MB.
      const ready = await compressAll(files);
      if (ready.some((f) => f.size > MAX_RESPONSE_FILE_BYTES)) throw new Error('Each file must be 3.5 MB or less after shrinking. A large PDF is the usual cause.');
      if (ready.reduce((n, f) => n + f.size, 0) > MAX_RESPONSE_BODY_BYTES) throw new Error('The files are over 4 MB together. Send fewer or smaller files.');
      const form = new FormData();
      form.set('action', 'reply_details');
      form.set('text', text.trim());
      for (const f of ready) form.append('files', f);
      const res = await fetchJson<{ email_status: string; sms_status: string; expires_at?: string }>(`/api/admin/offers/responses/${item.id}`, { method: 'POST', body: form });
      toast({
        title: 'Answer sent',
        description: `Email ${res.email_status}, text ${res.sms_status}.${res.expires_at ? ` Their deadline is now ${formatWhen(res.expires_at)}.` : ''}`,
      });
      onDone();
    } catch (err) {
      toast({ title: 'Not sent', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-2 rounded-lg border p-3" onSubmit={send} data-testid="inbox-details" data-response-id={item.id}>
      <Context sub={item.sub} offer={item.offer} request={item.request} created={item.created_at} />
      <p className="whitespace-pre-line rounded-md bg-muted p-2 text-sm">{item.note}</p>
      {item.attachments.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-xs">
          {item.attachments.map((a, i) => (
            <li key={i}>
              {a.url ? <a href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline"><Paperclip className="h-3 w-3" aria-hidden />{a.name}</a> : <span>{a.name} (could not sign)</span>}
            </li>
          ))}
        </ul>
      )}
      {item.recipient?.paused_at && <p className="text-xs text-amber-800">Their clock has been paused since {formatWhen(item.recipient.paused_at)}. Answering restarts it with that time added back.</p>}
      <label htmlFor={`details-reply-${item.id}`} className="block text-xs font-medium text-muted-foreground">Your answer</label>
      <Textarea id={`details-reply-${item.id}`} rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} />
      <label htmlFor={`details-files-${item.id}`} className="block text-xs font-medium text-muted-foreground">Photos or files (optional, up to 3; photos are shrunk for you)</label>
      <input
        id={`details-files-${item.id}`}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
        className="block w-full text-xs"
        onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
      />
      <Button size="sm" type="submit" disabled={busy || !text.trim() || offerClosed} data-testid="inbox-details-send">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send answer'}
      </Button>
    </form>
  );
}

function DeclineCallItem({ call, onDone }: { call: DeclineCall; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [price, setPrice] = useState('');
  const [willTake, setWillTake] = useState<'' | 'yes' | 'no'>('');
  const [reason, setReason] = useState('');
  const counterCents = price ? parseDollarsToCents(price) : null;
  const phone = call.sub ? dialable(call.sub.phone) : '';

  async function log(e: React.FormEvent) {
    e.preventDefault();
    if (price && !counterCents) return;
    setBusy(true);
    try {
      await fetchJson(`/api/admin/offers/decline-calls/${call.id}`, jsonInit('PATCH', {
        counter_cents: counterCents,
        will_take: willTake === '' ? null : willTake === 'yes',
        reason_text: reason.trim(),
      }));
      toast({ title: 'Call logged' });
      onDone();
    } catch (err) {
      toast({ title: 'Not logged', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-2 rounded-lg border p-3" onSubmit={log} data-testid="inbox-decline-call" data-call-id={call.id}>
      <Context sub={call.sub} offer={call.offer} request={call.request} created={call.created_at} />
      <p className="text-sm">
        Reason: <strong>{call.reason ? DECLINE_REASON_LABEL[call.reason] : 'none given'}</strong>
        {call.note ? <> · &ldquo;{call.note}&rdquo;</> : null}
      </p>
      {phone ? (
        <Button asChild size="sm" variant="outline"><a href={`tel:${phone}`}><Phone className="mr-1.5 h-4 w-4" aria-hidden />Call {call.sub?.phone}</a></Button>
      ) : <p className="text-xs text-muted-foreground">No phone on file for this sub.</p>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[9rem_9rem_1fr]">
        <div>
          <label htmlFor={`call-price-${call.id}`} className="mb-1 block text-xs font-medium text-muted-foreground">Their price (USD)</label>
          <Input id={`call-price-${call.id}`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="1800" />
        </div>
        <div>
          <label htmlFor={`call-take-${call.id}`} className="mb-1 block text-xs font-medium text-muted-foreground">Will take it at that?</label>
          <select id={`call-take-${call.id}`} value={willTake} onChange={(e) => setWillTake(e.target.value as '' | 'yes' | 'no')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Not said</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        <div>
          <label htmlFor={`call-reason-${call.id}`} className="mb-1 block text-xs font-medium text-muted-foreground">Reason in their words</label>
          <Input id={`call-reason-${call.id}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
        </div>
      </div>
      {price && !counterCents && <p className="text-xs text-red-700">Enter dollars, for example 1800.</p>}
      <Button size="sm" type="submit" disabled={busy || (!counterCents && !willTake && !reason.trim())} data-testid="inbox-call-log">Log call and close task</Button>
    </form>
  );
}
