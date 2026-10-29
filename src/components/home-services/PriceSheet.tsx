'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Check, Plus, X } from 'lucide-react';
import { t, type HomeService, type Lang } from '@/lib/home-services/catalog';
import { s } from '@/lib/home-services/i18n';
import { formatDollars } from '@/lib/home-services/pricing';

/**
 * "What's included" and "What raises the price" for one service (LP3).
 * Opening it never changes the card's selection.
 */
export default function PriceSheet({
  service,
  lang,
  onClose,
}: {
  service: HomeService | null;
  lang: Lang;
  onClose: () => void;
}) {
  return (
    <DialogPrimitive.Root open={Boolean(service)} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          data-testid="price-sheet"
          className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-card p-6 pb-8 shadow-elegant focus:outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
        >
          {service && (
            <>
              <div className="pr-12">
                <DialogPrimitive.Title className="text-xl font-extrabold tracking-tight text-text-primary">
                  {t(service.name, lang)}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-1 text-sm text-text-secondary">
                  {s('startingAt', lang)} <span className="font-bold text-text-primary">{t(service.priceDisplay, lang)}</span>{' '}
                  {t(service.priceUnit, lang)}
                  {service.priceNote ? `. ${t(service.priceNote, lang)}` : ''}
                  {service.minimumCents ? `. ${s('minimum', lang)} ${formatDollars(service.minimumCents)}` : ''}
                </DialogPrimitive.Description>
              </div>
              <h3 className="mt-6 text-sm font-extrabold uppercase tracking-wider text-secondary">{s('whatsIncluded', lang)}</h3>
              <ul className="mt-3 space-y-2.5">
                {service.included.map((item) => (
                  <li key={item.en} className="flex gap-3 text-[15px] leading-snug text-text-secondary">
                    <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent-teal" />
                    {t(item, lang)}
                  </li>
                ))}
              </ul>
              <h3 className="mt-6 text-sm font-extrabold uppercase tracking-wider text-secondary">{s('raisesPrice', lang)}</h3>
              <ul className="mt-3 space-y-2.5">
                {service.raisesPrice.map((item) => (
                  <li key={item.en} className="flex gap-3 text-[15px] leading-snug text-text-secondary">
                    <Plus aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
                    {t(item, lang)}
                  </li>
                ))}
              </ul>
              <DialogPrimitive.Close
                aria-label={s('close', lang)}
                className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-background-soft text-text-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
              >
                <X aria-hidden className="h-5 w-5" />
              </DialogPrimitive.Close>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
