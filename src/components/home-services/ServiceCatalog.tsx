'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { ArrowRight, Check, Info } from 'lucide-react';
import { HOME_SERVICES_CATALOG, t, type HomeService, type Lang } from '@/lib/home-services/catalog';
import { s } from '@/lib/home-services/i18n';
import { cn } from '@/lib/utils';
import ServiceIcon from './ServiceIcon';
import PriceSheet from './PriceSheet';
import { preloadRequestFlow, useHashSheet, useRequestFlow } from './useRequestFlow';

const RequestFlow = dynamic(() => import('./RequestFlow'), { ssr: false });

/**
 * The seven priced cards (LP1-LP4). The whole card toggles selection
 * (grill 001 Q2) and is a real button with aria-pressed, so it works by
 * keyboard and announces its state; the price is a separate button that opens
 * the "what's included" sheet and never toggles. A sticky bar counts the
 * selection and opens the request flow in-page.
 */
export default function ServiceCatalog({ lang }: { lang: Lang }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [priceFor, setPriceFor] = useState<HomeService | null>(null);
  const flow = useRequestFlow();
  // The price sheet is a full-width bottom sheet on phones, so Back must close it too (review D2).
  const priceSheet = useHashSheet('#price');

  const toggle = (slug: string) => {
    preloadRequestFlow();
    setSelected((prev) => (prev.includes(slug) ? prev.filter((x) => x !== slug) : [...prev, slug]));
  };
  // Keep catalog order no matter the tap order, so the flow reads top to bottom like the page.
  const ordered = HOME_SERVICES_CATALOG.map((x) => x.slug).filter((slug) => selected.includes(slug));

  return (
    <>
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="service-cards">
        {HOME_SERVICES_CATALOG.map((service) => {
          const isOn = selected.includes(service.slug);
          return (
            <li
              key={service.slug}
              data-testid={`card-${service.slug}`}
              data-selected={isOn}
              // The padding strip around the price toggles too ("anywhere except the price", LP2).
              // Keyboard and screen-reader users have the real button inside; this is a pointer convenience.
              onClick={(e) => {
                if (e.target === e.currentTarget) toggle(service.slug);
              }}
              className={cn(
                'flex flex-col rounded-2xl border-2 bg-card shadow-card transition-all',
                isOn ? 'border-secondary ring-1 ring-secondary' : 'border-border hover:-translate-y-[2px] hover:border-secondary/40',
              )}
            >
              <button
                type="button"
                aria-pressed={isOn}
                onClick={() => toggle(service.slug)}
                className="group flex flex-1 flex-col rounded-t-2xl p-5 pb-3 text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-secondary/40"
              >
                <span className="flex w-full items-start justify-between gap-3">
                  <span
                    className={cn(
                      'flex h-12 w-12 items-center justify-center rounded-xl',
                      isOn ? 'bg-secondary text-white' : 'bg-primary/15 text-secondary',
                    )}
                  >
                    <ServiceIcon icon={service.icon} className="h-6 w-6" />
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-md border-2 transition-colors',
                      isOn ? 'border-secondary bg-secondary text-white' : 'border-text-muted/50 bg-card text-transparent',
                    )}
                  >
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </span>
                </span>
                <span className="mt-4 text-lg font-extrabold leading-tight tracking-tight text-text-primary">
                  {t(service.name, lang)}
                </span>
                <span className="mt-2 text-[15px] leading-relaxed text-text-secondary">{t(service.description, lang)}</span>
                <span className={cn('mt-3 text-xs font-bold uppercase tracking-wider', isOn ? 'text-secondary' : 'text-text-muted')}>
                  {isOn ? s('selected', lang) : s('select', lang)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPriceFor(service);
                  priceSheet.openSheet();
                }}
                data-testid={`price-${service.slug}`}
                className="mx-4 mb-4 flex min-h-[52px] items-center justify-between gap-3 rounded-xl bg-background-soft px-4 py-2.5 text-left transition-colors hover:bg-primary/10 focus:outline-none focus-visible:ring-4 focus-visible:ring-secondary/40"
              >
                {/* The accessible name is the visible text plus screen-reader-only context, so it
                    starts with what a voice-control user sees ("Starting at" and the price). */}
                <span className="flex min-w-0 flex-col">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">{s('startingAt', lang)}</span>
                  <span className="text-xl font-extrabold leading-tight text-text-primary">{t(service.priceDisplay, lang)}</span>
                  <span className="text-xs font-semibold leading-snug text-text-secondary">{t(service.priceUnit, lang)}</span>
                  <span className="sr-only">
                    {', '}
                    {t(service.name, lang)}. {s('priceDetails', lang)}
                  </span>
                </span>
                <Info aria-hidden className="h-5 w-5 shrink-0 text-secondary" />
              </button>
            </li>
          );
        })}
      </ul>

      <PriceSheet service={priceFor} open={priceSheet.open} lang={lang} onClose={priceSheet.closeSheet} />

      {ordered.length > 0 && !flow.open && (
        <div
          data-testid="request-bar"
          className="fixed inset-x-3 bottom-[84px] z-40 mx-auto max-w-xl rounded-2xl border border-border bg-card/95 p-2.5 shadow-elegant backdrop-blur lg:bottom-6"
        >
          <button
            type="button"
            onClick={flow.openFlow}
            className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl bg-secondary px-5 py-3 text-left font-bold text-white transition-transform hover:-translate-y-[1px] focus:outline-none focus-visible:ring-4 focus-visible:ring-secondary/40"
          >
            <span className="text-[17px]">
              {s('requestThese', lang)} ({ordered.length})
            </span>
            <ArrowRight aria-hidden className="h-5 w-5" />
          </button>
        </div>
      )}

      {flow.mounted && (
        <RequestFlow
          open={flow.open}
          lang={lang}
          services={ordered}
          onClose={flow.closeFlow}
          onSubmitted={() => setSelected([])}
        />
      )}
    </>
  );
}
