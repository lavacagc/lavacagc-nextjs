/**
 * The published home-services prices, in the shape the publish guard reads
 * (an article may quote a service's `priceDisplay` and nothing else).
 *
 * Today the prices live in src/lib/home-services/catalog.ts. Phase 2 slice E
 * moves them into the `home_services` table behind `getCatalog()`; when both
 * slices are on one branch, `loadCatalogPrices()` should read `getCatalog()`
 * instead, so an admin price change is what the guard allows. The mapping
 * function below takes any list with the catalog's shape, so only the loader
 * changes.
 *
 * Client-safe (no I/O in the mapping).
 */
import { HOME_SERVICES_CATALOG, TRADE_LABEL, type HomeService } from '@/lib/home-services/catalog';
import type { CatalogPrice } from './publishGuard';

type PricedService = Pick<HomeService, 'slug' | 'trade' | 'name' | 'priceDisplay'>;

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

export async function loadCatalogPrices(): Promise<CatalogPrice[]> {
  return catalogPricesFrom(HOME_SERVICES_CATALOG);
}
