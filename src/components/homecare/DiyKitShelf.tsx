'use client';

/**
 * "What you'll need" - the DIY Kit shelf on a maintenance task.
 *
 * Its own component rather than more rows inside the 870-line checklist client:
 * it owns a scroll position and a resize listener, and the checklist has enough
 * state of its own.
 *
 * THE SHAPE IS THE OWNER'S DECISION, not a default:
 *  - Collapsed by default (D1). It is a warm tinted bar with the first photos
 *    stacked on it and a count, so it is noticed on every scroll pass while
 *    costing one row of height until it is wanted. "Add to request" stays the
 *    only orange primary on the row, because a booking is worth two orders of
 *    magnitude more than a commission and the page should say so.
 *  - Past two products it swipes, with a slider bar that is ALWAYS DRAWN (D2).
 *    Not the platform scrollbar: that one fades out, and a member who cannot see
 *    it reads a four-product shelf as a two-product shelf and never swipes.
 *
 * Every outbound link carries rel="sponsored nofollow noopener" - `sponsored` is
 * what Google asks of a monetized link, and this site's organic ranking is the
 * whole lead engine. The disclosure sits in this block, next to the links,
 * because that is what Amazon and the FTC both require and what the member
 * deserves anyway.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import {
  AFFILIATE_DISCLOSURE, amazonProductUrl, productImageUrl, type HomeCareProduct,
} from '@/lib/homecare/products';
import { SHELF_GAP, shelfPosition, shelfRangeLabel } from '@/lib/homecare/shelfPosition';

interface Props {
  taskKey: string;
  products: HomeCareProduct[];
  /** From AMAZON_ASSOCIATES_TAG, server-side. Absent is fine: links render untagged. */
  affiliateTag?: string | null;
}

/** Below this the shelf is a plain grid; at or above it, it swipes. */
const SWIPE_FROM = 3;

export default function DiyKitShelf({ taskKey, products, affiliateTag }: Props) {
  const [open, setOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ left: 0, width: 100 });
  const [range, setRange] = useState({ first: 1, last: 1 });

  const swipes = products.length >= SWIPE_FROM;

  /**
   * Where the shelf is, as the bar and the counter show it.
   *
   * Read off the scroller rather than tracked as an index, because the scroll is
   * the source of truth: a member can fling it, drag it, or land mid-card, and a
   * counter derived from a click handler would disagree with what they see. What
   * those four measurements MEAN is `shelfPosition`, which is pure so a test can
   * hand it real browser numbers and check the answer.
   */
  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el || products.length === 0) return;
    const position = shelfPosition({
      scrollLeft: el.scrollLeft,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      cardWidth: (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? el.clientWidth,
      count: products.length,
    });
    setThumb(position.thumb);
    setRange(position.range);
  }, [products.length]);

  useEffect(() => {
    if (!open || !swipes) return;
    measure();
    const el = scroller.current;
    if (!el) return;
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, swipes, measure]);

  const nudge = (direction: -1 | 1) => {
    const el = scroller.current;
    if (!el) return;
    const cardWidth = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? el.clientWidth;
    el.scrollBy({ left: direction * (cardWidth + SHELF_GAP), behavior: 'smooth' });
  };

  if (products.length === 0) return null;

  const panelId = `diy-kit-${taskKey}`;
  const stack = products.slice(0, 3);

  return (
    <div className="mt-3 border-t border-dashed border-border pt-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        data-testid={`diy-kit-toggle-${taskKey}`}
        className="flex w-full items-center gap-2.5 rounded-lg border border-primary/35 bg-gradient-to-r from-primary/10 to-accent-sunset/5 px-2.5 py-2 text-left transition-colors hover:from-primary/15"
      >
        <span className="flex shrink-0">
          {stack.map((p, i) => (
            <span
              key={p.id}
              className={`relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-md border border-border bg-white shadow-sm ${i > 0 ? '-ml-2' : ''}`}
            >
              <ProductPhoto product={p} sizes="28px" />
            </span>
          ))}
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-[13px] font-extrabold text-text-primary">What you&apos;ll need</span>
          <span className="text-[11px] font-bold text-text-muted"> · {products.length} pick{products.length === 1 ? '' : 's'}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-primary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div id={panelId} className="mt-2.5">
          <div
            ref={scroller}
            onScroll={swipes ? measure : undefined}
            role={swipes ? 'region' : undefined}
            aria-label={swipes ? `${products.length} recommended products` : undefined}
            className={swipes
              ? 'flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
              : 'grid grid-cols-2 gap-2.5'}
          >
            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                affiliateTag={affiliateTag}
                // 44%, not 50%: two cards fit and a sliver of the third shows.
                // The peek is the strongest "there is more" cue there is - the
                // slider bar below says the same thing, but only to someone who
                // has already looked down.
                className={swipes ? 'w-[44%] shrink-0 snap-start sm:w-[30%]' : ''}
              />
            ))}
          </div>

          {swipes && (
            <>
              {/* Always drawn, on every platform. This bar is the only thing
                  telling a member on a phone that the shelf continues. */}
              <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[margin,width] duration-150"
                  style={{ width: `${thumb.width}%`, marginLeft: `${thumb.left}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span data-testid={`diy-kit-count-${taskKey}`} className="text-[11px] font-bold text-text-muted">
                  {shelfRangeLabel(range)} of {products.length}
                  <span className="sm:hidden"> · swipe for more</span>
                </span>
                <span className="hidden gap-1 sm:flex">
                  <ShelfArrow direction={-1} onClick={() => nudge(-1)} />
                  <ShelfArrow direction={1} onClick={() => nudge(1)} />
                </span>
              </div>
            </>
          )}

          <p className="mt-2 text-[11px] leading-relaxed text-text-muted">{AFFILIATE_DISCLOSURE}</p>
        </div>
      )}
    </div>
  );
}

function ShelfArrow({ direction, onClick }: { direction: -1 | 1; onClick: () => void }) {
  const Icon = direction === -1 ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === -1 ? 'Previous products' : 'More products'}
      className="group -my-2 flex items-center justify-center"
    >
      {/* The visual is 28px inside a button the global 44px rule keeps tappable. */}
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-secondary transition-colors group-hover:border-primary group-hover:text-primary">
        <Icon className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}

function ProductPhoto({ product, sizes }: { product: HomeCareProduct; sizes: string }) {
  const url = productImageUrl(product.images[0]);
  if (!url) return null;
  return <Image src={url} alt="" fill sizes={sizes} className="object-contain" />;
}

function ProductCard({
  product, affiliateTag, className,
}: { product: HomeCareProduct; affiliateTag?: string | null; className?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 rounded-xl border border-border bg-card p-2.5 ${className ?? ''}`}>
      <div className="relative h-[72px] overflow-hidden rounded-lg border border-border/60 bg-white">
        <ProductPhoto product={product} sizes="(min-width: 640px) 180px, 45vw" />
      </div>
      <span className="text-xs font-bold leading-tight text-text-primary">{product.display_name}</span>
      {/* No price band (owner, 2026-08-06): it was manual labour to maintain and
          is no longer collected or shown. The card is name, pitch, photo, link. */}
      {product.pitch && <span className="text-[11px] leading-snug text-text-muted">{product.pitch}</span>}
      <a
        href={amazonProductUrl(product.asin, affiliateTag)}
        target="_blank"
        rel="sponsored nofollow noopener"
        data-testid="diy-kit-link"
        className="mt-auto inline-flex min-h-[36px] w-full items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-secondary px-1.5 py-2 text-[11px] font-extrabold text-secondary-foreground transition-transform hover:-translate-y-px"
      >
        {/* nowrap: the label broke across two lines inside a 44%-wide card,
            which made every card in the shelf a different height. */}
        <ExternalLink className="h-3 w-3 shrink-0" /> View on Amazon
      </a>
    </div>
  );
}
