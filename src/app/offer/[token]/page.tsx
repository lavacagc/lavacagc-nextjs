/**
 * /offer/<token> - the page a sub lands on from a job offer email or text.
 *
 * READ ONLY on GET (OF1). Mail scanners and link previews fetch every URL in a
 * message; a page that accepted, or even stamped "opened", on load would act
 * for somebody who never looked. Every action POSTs to /api/offers/<token>.
 *
 * Public and noindex: the token is the only credential. An unknown or
 * malformed token gets one generic answer (OF2, SEC3); expired, taken and
 * withdrawn offers say which, with no buttons.
 *
 * Town only until the job is won; the winner sees the full address (BD9).
 * Everything is in the sub's own language (OF6).
 */
import type { Metadata } from 'next';
import { cache } from 'react';
import { TRADE_LABEL, t, toLang, type Lang, type Trade } from '@/lib/home-services/catalog';
import { answerLinesFor } from '@/lib/home-services/requestsAdmin';
import { s } from '@/lib/home-services/i18n';
import { formatDollars } from '@/lib/home-services/pricing';
import { lookupOfferByToken, requestForOfferPage, sharedPhotoUrls, subCanAccept } from '@/lib/home-services/offers';
import { confirmablePrice, recipientView, type OfferResponseRow } from '@/lib/home-services/offerRules';
import { startWindowLabel } from '@/lib/home-services/offerEmail';
import { signPaths } from '@/lib/home-services/storage';
import { specNookSignupUrl } from '@/lib/specnook/client';
import OfferActions, { Countdown } from './OfferActions';

export const dynamic = 'force-dynamic';

/** One database lookup per render, shared by the title and the page. */
const lookupOnce = cache(lookupOfferByToken);

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lang?: string }>;
};

/** The browser title in the sub's own language (D6); a dead link uses ?lang or English. */
export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const lookup = await lookupOnce(token);
  const lang: Lang = lookup.status === 'found'
    ? (lookup.found.sub.language === 'es' ? 'es' : 'en')
    : toLang((await searchParams).lang);
  return {
    title: s('offerTitle', lang),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

export default async function OfferPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const fallbackLang = toLang((await searchParams).lang);
  const lookup = await lookupOnce(token);

  if (lookup.status === 'unavailable') {
    return (
      <Shell lang={fallbackLang}>
        <h1 className="text-xl font-bold text-[#1A1A1A]">{s('offerUnavailableTitle', fallbackLang)}</h1>
        <p className="mt-2 text-sm text-[#555]">{s('offerUnavailableBody', fallbackLang)}</p>
      </Shell>
    );
  }
  if (lookup.status === 'not_found') {
    return (
      <Shell lang={fallbackLang}>
        <h1 className="text-xl font-bold text-[#1A1A1A]" data-testid="offer-invalid">{s('offerInvalidTitle', fallbackLang)}</h1>
        <p className="mt-2 text-sm text-[#555]">{s('offerInvalidBody', fallbackLang)}</p>
      </Shell>
    );
  }

  const { offer, recipient, sub, responses } = lookup.found;
  const lang: Lang = sub.language === 'es' ? 'es' : 'en';
  const now = new Date();
  const view = recipientView(offer, recipient, now);
  const trade = t(TRADE_LABEL[offer.trade as Trade], lang) || offer.trade;

  if (view.kind === 'taken' || view.kind === 'expired' || view.kind === 'cancelled') {
    const title = view.kind === 'taken' ? 'offerTakenTitle' : view.kind === 'expired' ? 'offerExpiredTitle' : 'offerCancelledTitle';
    const body = view.kind === 'taken' ? 'offerTaken' : view.kind === 'expired' ? 'offerExpired' : 'offerCancelled';
    return (
      <Shell lang={lang}>
        <p className="text-xs font-bold uppercase tracking-wider text-[#B4600F]">{trade} · {offer.town}</p>
        <h1 className="mt-1 text-xl font-bold text-[#1A1A1A]" data-testid={`offer-${view.kind}`}>{s(title, lang)}</h1>
        <p className="mt-2 text-sm text-[#555]">{s(body, lang)}</p>
        <p className="mt-6 text-xs text-[#666]">{s('offerHelp', lang)}</p>
      </Shell>
    );
  }

  const [photoUrls, request] = await Promise.all([
    sharedPhotoUrls(offer.photo_ids),
    requestForOfferPage(offer.request_id, view.kind === 'won'),
  ]);
  const photos = photoUrls.filter((u): u is string => !!u);
  const start = startWindowLabel(offer.target_start, offer.target_end, lang);
  // The homeowner's taps for this trade in the sub's language, then Alex's own
  // scope text. Never the homeowner's free-text notes (D2).
  const answers = request ? answerLinesFor(request, offer.trade, lang) : [];
  const job = answers.length || offer.scope_summary
    ? <JobLines answers={answers} scope={offer.scope_summary} />
    : null;

  if (view.kind === 'won') {
    return (
      <Shell lang={lang}>
        <p className="text-xs font-bold uppercase tracking-wider text-[#B4600F]">{trade} · {offer.town}</p>
        <h1 className="mt-1 text-2xl font-bold text-[#1A1A1A]" data-testid="offer-won">{s('offerWonTitle', lang)}</h1>
        <p className="mt-2 text-sm text-[#555]">{s('offerAccepted', lang)}</p>
        <dl className="mt-5 divide-y divide-[#E2E8F0] border-y border-[#E2E8F0]">
          <Row label={s('offerAddress', lang)}>
            <span data-testid="offer-full-address">{request ? [request.address, request.town, request.zip].filter(Boolean).join(', ') : offer.town}</span>
          </Row>
          {request?.first_name && <Row label={s('offerCustomer', lang)}>{request.first_name}</Row>}
          <Row label={s('offerTrade', lang)}>{trade}</Row>
          <Row label={s('offerStart', lang)}>{start}</Row>
          <Row label={s('offerPay', lang)}><strong>{formatDollars(offer.sub_pay_cents)}</strong></Row>
          {job && <Row label={s('offerJob', lang)}>{job}</Row>}
        </dl>
        <Photos urls={photos} lang={lang} />
        <p className="mt-6 text-xs text-[#666]">{s('offerHelp', lang)}</p>
      </Shell>
    );
  }

  // Live offer.
  const canAccept = await subCanAccept(sub);
  const confirm = confirmablePrice(responses);
  const latestCounter = [...responses].reverse().find((r) => r.type === 'counter');
  const details = responses.filter((r) => r.type === 'details');
  const declined = responses.some((r) => r.type === 'decline');
  const replyFiles = await Promise.all(details.map((d) => signPaths((d.admin_reply_attachments ?? []).map((a) => a.storage_path))));

  return (
    <Shell lang={lang}>
      <p className="text-xs font-bold uppercase tracking-wider text-[#B4600F]">{trade} · {offer.town}</p>
      <h1 className="mt-1 text-2xl font-bold text-[#1A1A1A]">{s('offerTitle', lang)}</h1>

      <div className="mt-4 rounded-lg bg-[#FBEEDF] px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wider text-[#8A4B0E]">{s('offerPay', lang)}</p>
        <p className="text-3xl font-bold text-[#1A1A1A]" data-testid="offer-pay">{formatDollars(offer.sub_pay_cents)}</p>
      </div>

      <dl className="mt-4 divide-y divide-[#E2E8F0] border-y border-[#E2E8F0]">
        <Row label={s('offerTrade', lang)}>{trade}</Row>
        <Row label={s('offerTown', lang)}><span data-testid="offer-town">{offer.town}</span></Row>
        <Row label={s('offerStart', lang)}>{start}</Row>
        <Row label={s('offerExpires', lang)}>
          {recipient.paused_at
            ? <span className="font-medium text-[#1A1A1A]">{s('offerPausedNote', lang)}</span>
            : <Countdown expiresAt={recipient.expires_at} lang={lang} />}
        </Row>
        {job && <Row label={s('offerJob', lang)}>{job}</Row>}
      </dl>

      <Photos urls={photos} lang={lang} />

      <Notices
        lang={lang}
        latestCounter={latestCounter}
        details={details}
        replyFiles={replyFiles}
        declined={declined}
        hasConfirm={!!confirm}
      />

      <OfferActions
        token={token}
        lang={lang}
        canAccept={canAccept}
        signupUrl={specNookSignupUrl(offer.trade, offer.id)}
        confirm={confirm ? { cents: confirm.cents, source: confirm.source } : null}
      />

      <p className="mt-6 text-xs text-[#666]">{s('offerHelp', lang)}</p>
    </Shell>
  );
}

function Notices({
  lang, latestCounter, details, replyFiles, declined, hasConfirm,
}: {
  lang: Lang;
  latestCounter: OfferResponseRow | undefined;
  details: OfferResponseRow[];
  replyFiles: Array<Array<string | null>>;
  declined: boolean;
  hasConfirm: boolean;
}) {
  const items: React.ReactNode[] = [];
  if (latestCounter && !hasConfirm) {
    const price = formatDollars(latestCounter.counter_cents ?? 0);
    if (latestCounter.status === 'pending') items.push(<p key="cp">{s('offerCounterSent', lang, { price })}</p>);
    if (latestCounter.status === 'rejected') items.push(<p key="cr">{s('offerCounterRejected', lang, { price })}</p>);
  }
  details.forEach((d, i) => {
    if (d.status === 'pending') {
      items.push(<p key={`dp${d.id}`}>{s('offerDetailsSent', lang)} <span className="italic">&ldquo;{d.note}&rdquo;</span></p>);
    } else if (d.status === 'replied' && d.admin_reply) {
      const files = replyFiles[i] ?? [];
      items.push(
        <div key={`dr${d.id}`} data-testid="offer-alex-reply">
          <p className="font-bold text-[#1A1A1A]">{s('offerAlexReply', lang)}</p>
          <p className="whitespace-pre-line">{d.admin_reply}</p>
          {files.filter(Boolean).length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {files.map((url, j) => url && (
                <li key={url}><a className="text-[#B4600F] underline" href={url} target="_blank" rel="noreferrer">{d.admin_reply_attachments[j]?.name ?? `file ${j + 1}`}</a></li>
              ))}
            </ul>
          )}
        </div>,
      );
    }
  });
  if (declined) items.push(<p key="dc">{s('offerDeclined', lang)}</p>);
  if (items.length === 0) return null;
  return (
    <section aria-live="polite" className="mt-5 space-y-3 rounded-lg border border-[#E2E8F0] bg-[#FBFAF8] p-4 text-sm text-[#303030]" data-testid="offer-notices">
      {items}
    </section>
  );
}

function Photos({ urls, lang }: { urls: string[]; lang: Lang }) {
  if (urls.length === 0) return null;
  return (
    <section className="mt-5" aria-label={s('offerPhotos', lang)}>
      <h2 className="text-sm font-bold text-[#1A1A1A]">{s('offerPhotos', lang)}</h2>
      <ul className="mt-2 grid grid-cols-3 gap-2">
        {urls.map((url, i) => (
          <li key={url}>
            <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-[#E2E8F0]">
              {/* Signed private-bucket URLs: next/image would proxy and cache them past their expiry. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`${s('offerPhotos', lang)} ${i + 1}`} className="aspect-square w-full object-cover" loading="lazy" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Shell({ children, lang }: { children: React.ReactNode; lang: Lang }) {
  return (
    <main id="main-content" lang={lang} className="min-h-screen bg-[#EFEBE6] px-4 py-8 sm:py-10">
      <div className="mx-auto w-full max-w-md rounded-xl bg-white p-5 shadow-sm sm:p-8">
        <p className="mb-4 text-sm font-bold text-[#1A1A1A]">La Vaca <span className="font-normal text-[#666]">General Contractors</span></p>
        {children}
      </div>
    </main>
  );
}

function JobLines({ answers, scope }: { answers: string[]; scope: string }) {
  return (
    <div data-testid="offer-scope">
      {answers.length > 0 && (
        <ul className="space-y-0.5">{answers.map((line) => <li key={line}>{line}</li>)}</ul>
      )}
      {scope && <p className={`whitespace-pre-line ${answers.length ? 'mt-1.5' : ''}`}>{scope}</p>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2.5">
      <dt className="w-24 shrink-0 text-xs font-bold text-[#666]">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-[#1A1A1A]">{children}</dd>
    </div>
  );
}
