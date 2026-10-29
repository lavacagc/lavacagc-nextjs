/**
 * The home services as the Phase 2 migration seeded them, shaped the way the
 * pages render them. Specs that expect seeded prices and copy read them here,
 * never from catalog constants (there are none since slice E; CAT6).
 * tests/home-services-catalog.spec.ts pins this seed to the migration's INSERT.
 */
import { HOME_SERVICES_SEED } from '../../src/lib/home-services/catalogSeed';
import { contentToRow, rowToService, type HomeServiceRow } from '../../src/lib/home-services/catalogRow';
import type { HomeService, ServiceNames } from '../../src/lib/home-services/catalog';

export const SEED_ROWS: HomeServiceRow[] = HOME_SERVICES_SEED.map((content, i) => contentToRow(content, i + 1));

export const SEED_SERVICES: HomeService[] = SEED_ROWS.map(rowToService);

export function seedService(slug: string): HomeService {
  const service = SEED_SERVICES.find((x) => x.slug === slug);
  if (!service) throw new Error(`no seeded service ${slug}`);
  return service;
}

export const SEED_NAMES: ServiceNames = Object.fromEntries(SEED_SERVICES.map((x) => [x.slug, x.name]));
