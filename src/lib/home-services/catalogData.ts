/**
 * Server-only read of the home services catalog (docs/phase-2/acceptance-criteria.md,
 * "Catalog module split").
 *
 * The pages render per request (the language cookie), so instead of ISR the
 * table read is cached in the data cache under the tag `home-services` for an
 * hour, and every admin save calls `invalidateCatalog()`, which expires the
 * tag immediately (`{ expire: 0 }`: the next request reads the new row rather
 * than being served the old one while it refreshes) and revalidates the
 * landing page, the seven service pages and the sitemap (SITEMAP_TAG and
 * every path in SITEMAP_PATHS, as the blog and project writers do).
 *
 * Imports next/cache and the service key helper, so it cannot be bundled into
 * a client component; client components get the services as props.
 */
import { revalidatePath, revalidateTag, unstable_cache } from 'next/cache';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { SITEMAP_PATHS, SITEMAP_TAG } from '@/lib/revalidate';
import { isServiceSlug, SERVICE_SLUGS, type HomeService, type ServiceNames } from './catalog';
import { contentToRow, HOME_SERVICE_COLUMNS, rowToService, type HomeServiceRow } from './catalogRow';
import { HOME_SERVICES_SEED } from './catalogSeed';

export const CATALOG_TAG = 'home-services';

/** The slug set is fixed at seven; 50 bounds the read even if the table grows by mistake. */
const CATALOG_LIMIT = 50;

const readRows = unstable_cache(
  async (): Promise<HomeServiceRow[]> =>
    (await supabaseRest<HomeServiceRow[]>(
      'GET',
      `home_services?select=${HOME_SERVICE_COLUMNS}&order=sort.asc,slug.asc&limit=${CATALOG_LIMIT}`,
    )) ?? [],
  ['home-services-catalog'],
  { tags: [CATALOG_TAG], revalidate: 3600 },
);

let warnedSeed = false;

/**
 * Every row, active or not, in `sort` order, straight from the table: throws
 * when the table cannot be read, and never stands the seed in. Only rows whose
 * slug is one of the seven in code are returned: a slug without questions or
 * a route is not a service.
 *
 * The publish guard reads prices through this (src/lib/articles/catalogPrices.ts):
 * checking an article against the day-one seed would pass a price the admin
 * has since changed, or the price of a service since switched off.
 */
export async function getAllServicesStrict(): Promise<HomeService[]> {
  if (!process.env.SUPABASE_SECRET_KEY) throw new Error('SUPABASE_SECRET_KEY not configured');
  const rows = await readRows();
  return rows.filter((row) => isServiceSlug(row.slug)).map(rowToService);
}

/** The active services from the table; throws like `getAllServicesStrict`. */
export async function getCatalogStrict(): Promise<HomeService[]> {
  return (await getAllServicesStrict()).filter((service) => service.active);
}

function seedServices(): HomeService[] {
  return HOME_SERVICES_SEED.map((content, i) => rowToService(contentToRow(content, i + 1)));
}

/**
 * `getAllServicesStrict` for rendering: the landing page, the service pages,
 * the sitemap and names in alerts.
 *
 * Without SUPABASE_SECRET_KEY (the stub-backed test build and CI, which have no
 * database) the day-one seed stands in so the pages still render. Production
 * always has the key; when the configured read fails (the table not migrated
 * yet because the deploy landed before the Supabase integration ran, or a
 * database outage) the seed stands in as well and the failure is logged, so
 * the landing and service pages never 500 over a price the admin may since
 * have changed. Verified 2026-10-29 on a preview against a database without the
 * table: the pages returned 500 before this fallback.
 */
export async function getAllServices(): Promise<HomeService[]> {
  if (!process.env.SUPABASE_SECRET_KEY) {
    if (!warnedSeed) {
      warnedSeed = true;
      console.warn('home services: SUPABASE_SECRET_KEY not set, rendering the day-one seed instead of the table');
    }
    return seedServices();
  }
  try {
    return await getAllServicesStrict();
  } catch (err) {
    console.error('home services: table read failed, rendering the day-one seed:', err instanceof Error ? err.message : String(err));
    return seedServices();
  }
}

/** The active services, in `sort` order: what the landing page, the sitemap and the flow show. */
export async function getCatalog(): Promise<HomeService[]> {
  return (await getAllServices()).filter((service) => service.active);
}

/** One active service; undefined for an unknown or inactive slug (its page 404s). */
export async function getServiceData(slug: string): Promise<HomeService | undefined> {
  if (!isServiceSlug(slug)) return undefined;
  return (await getCatalog()).find((service) => service.slug === slug);
}

/**
 * Names by slug for every row, active or not, so an existing request keeps
 * its service names after a service is switched off. Never throws: names in an
 * alert or the admin are cosmetic, and a failed read prints the slug instead.
 */
export async function getServiceNames(): Promise<ServiceNames> {
  try {
    return Object.fromEntries((await getAllServices()).map((service) => [service.slug, service.name]));
  } catch (err) {
    console.error('home services: could not read service names:', err instanceof Error ? err.message : String(err));
    return {};
  }
}

/** Drop the cached catalog and the pages that render it, after an admin save. */
export function invalidateCatalog(): void {
  revalidateTag(CATALOG_TAG, { expire: 0 });
  revalidateTag(SITEMAP_TAG, { expire: 0 });
  revalidatePath('/home-services');
  for (const slug of SERVICE_SLUGS) revalidatePath(`/home-services/${slug}`);
  for (const path of SITEMAP_PATHS) revalidatePath(path);
}
