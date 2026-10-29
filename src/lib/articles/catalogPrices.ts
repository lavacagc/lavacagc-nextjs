/**
 * The published home-services prices, in the shape the publish guard reads
 * (an article may quote a service's starting price, `priceDisplay`, and
 * nothing else).
 *
 * The prices live in the `home_services` table (Phase 2 slice E), read through
 * `getCatalogStrict()`: the active services only, cached under the
 * `home-services` tag that every admin save invalidates. So the price an admin
 * sets in "Services & Prices" is the price the guard allows on the next
 * publish, and an inactive service's price is allowed nowhere. The pages fall
 * back to the day-one seed when the table cannot be read; the guard never
 * does: `loadCatalogPrices` returns null and the guard holds the post
 * (`CATALOG_UNAVAILABLE_REASON`).
 *
 * `catalogPricesFrom` is pure and takes anything with the catalog's shape, so
 * the guard's unit tests feed it the seed.
 */
import { TRADE_LABEL, type HomeServiceContent } from '@/lib/home-services/catalog';
import type { CatalogPrice } from './publishGuard';

type PricedService = Pick<HomeServiceContent, 'slug' | 'trade' | 'name' | 'priceDisplay'>;

export function catalogPricesFrom(services: PricedService[]): CatalogPrice[] {
  return services.map((s) => {
    const names = new Set<string>([
      s.name.en, s.name.es,
      TRADE_LABEL[s.trade]?.en, TRADE_LABEL[s.trade]?.es,
      s.slug.replace(/-/g, ' '),
    ].filter((n): n is string => Boolean(n)).map((n) => n.toLowerCase().trim()));
    return {
      slug: s.slug,
      names: [...names],
      priceDisplays: [...new Set([s.priceDisplay.en, s.priceDisplay.es])],
    };
  });
}

/** Server-only: imported lazily so this module stays importable by the pure specs. Null when the table cannot be read. */
export async function loadCatalogPrices(): Promise<CatalogPrice[] | null> {
  try {
    const { getCatalogStrict } = await import('@/lib/home-services/catalogData');
    return catalogPricesFrom(await getCatalogStrict());
  } catch (err) {
    console.error('publish guard: price catalog unavailable:', err instanceof Error ? err.message : String(err));
    return null;
  }
}
