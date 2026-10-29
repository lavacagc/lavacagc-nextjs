/**
 * Prints the INSERT that seeds public.home_services from the catalog constants,
 * so the Phase 2 migration's seed equals the code on the day it ships
 * (docs/phase-2/acceptance-criteria.md, "Migration"). Run with
 *   npx -y tsx scripts/seed-home-services.ts > /tmp/seed.sql
 * and paste the output into the migration. A unit test re-runs this and
 * compares it to the migration, so a catalog edit without a re-seed fails.
 */
import { HOME_SERVICES_CATALOG } from '../src/lib/home-services/catalog';

const q = (v: unknown): string => {
  if (v === undefined || v === null) return 'null';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
};
const j = (v: unknown): string => `${q(JSON.stringify(v))}::jsonb`;

export function seedSql(): string {
  const rows = HOME_SERVICES_CATALOG.map((s, i) =>
    [
      q(s.slug), i + 1, 'true', q(s.trade), q(s.icon), q(s.image ?? null),
      s.startingPriceCents, q(s.priceDisplay.en), q(s.priceDisplay.es), q(s.priceUnit.en), q(s.priceUnit.es),
      q(s.priceNote?.en ?? null), q(s.priceNote?.es ?? null), s.minimumCents ?? 'null',
      q(s.name.en), q(s.name.es), q(s.description.en), q(s.description.es),
      j(s.included.map((x) => x.en)), j(s.included.map((x) => x.es)),
      j(s.raisesPrice.map((x) => x.en)), j(s.raisesPrice.map((x) => x.es)),
      q(s.seo.title.en), q(s.seo.title.es), q(s.seo.description.en), q(s.seo.description.es), j(s.seo.keywords),
      j(s.faq),
    ].join(', '),
  );
  return [
    'INSERT INTO public.home_services (slug, sort, active, trade, icon, image, starting_price_cents, price_display_en, price_display_es, price_unit_en, price_unit_es, price_note_en, price_note_es, minimum_cents, name_en, name_es, description_en, description_es, included_en, included_es, raises_en, raises_es, seo_title_en, seo_title_es, seo_description_en, seo_description_es, seo_keywords, faq) VALUES',
    rows.map((r) => `  (${r})`).join(',\n'),
    'ON CONFLICT (slug) DO NOTHING;',
  ].join('\n');
}

if (process.argv[1] && process.argv[1].endsWith('seed-home-services.ts')) process.stdout.write(seedSql() + '\n');
