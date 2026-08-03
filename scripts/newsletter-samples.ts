/**
 * Render real Home Care newsletter samples (uses the production buildNewsletter).
 *   npx tsx scripts/newsletter-samples.ts <outDir>
 */
import { writeFileSync } from 'node:fs';
import { buildNewsletter, type NewsletterTask } from '../src/lib/homecare/newsletter';
import { filterTasksForProfile, type HomeSystems } from '../src/lib/homecare/profile';
import type { Season } from '../src/lib/homecare/season';

// The seeded maintenance_catalog (matches migration 20260725000000).
type Row = NewsletterTask & { seasons: Season[] };
const CATALOG: Row[] = [
  { key: 'clean_gutters', title: 'Clean gutters & downspouts', blurb: 'Clear leaves and debris so winter melt and spring rain drain away from your foundation.', applies_to: ['all'], seasons: ['fall', 'spring'], diy_or_pro: 'pro', bookable: true, priority: 9 },
  { key: 'hvac_ac_tuneup', title: 'Service the A/C before summer', blurb: 'A spring tune-up keeps cooling efficient and catches problems before the first heat wave.', applies_to: ['hvac'], seasons: ['spring'], diy_or_pro: 'pro', bookable: true, priority: 8 },
  { key: 'hvac_furnace_tuneup', title: 'Service the furnace/heating', blurb: 'A fall tune-up keeps heat reliable and safe through a NJ winter.', applies_to: ['hvac'], seasons: ['fall'], diy_or_pro: 'pro', bookable: true, priority: 9 },
  { key: 'replace_hvac_filter', title: 'Replace the HVAC filter', blurb: 'A fresh filter every few months protects the system and your air quality.', applies_to: ['hvac', 'all'], seasons: ['spring', 'summer', 'fall', 'winter'], diy_or_pro: 'diy', bookable: false, priority: 6 },
  { key: 'test_smoke_co', title: 'Test smoke & CO detectors', blurb: 'Press test on every alarm and swap batteries. Two minutes that matter most.', applies_to: ['all'], seasons: ['spring', 'fall'], diy_or_pro: 'diy', bookable: false, priority: 10 },
  { key: 'flush_water_heater', title: 'Flush the water heater', blurb: "Draining sediment once a year extends the tank's life and keeps hot water hot.", applies_to: ['water_heater'], seasons: ['fall'], diy_or_pro: 'pro', bookable: true, priority: 6 },
  { key: 'test_sump_pump', title: 'Test the sump pump', blurb: 'Pour water in the pit and confirm it kicks on before spring storms.', applies_to: ['sump_pump'], seasons: ['spring'], diy_or_pro: 'either', bookable: true, priority: 8 },
  { key: 'winterize_faucets', title: 'Shut off & drain outdoor faucets', blurb: 'Prevent burst pipes by draining hose bibs and irrigation before the first freeze.', applies_to: ['all'], seasons: ['fall'], diy_or_pro: 'either', bookable: true, priority: 9 },
  { key: 'clean_dryer_vent', title: 'Clean the dryer vent', blurb: 'Lint buildup is a top home-fire cause and makes the dryer work harder.', applies_to: ['all'], seasons: ['fall'], diy_or_pro: 'pro', bookable: true, priority: 7 },
  { key: 'seal_deck', title: 'Clean & seal the deck', blurb: 'Wash and reseal to protect the wood through another season of weather.', applies_to: ['deck'], seasons: ['summer'], diy_or_pro: 'pro', bookable: true, priority: 5 },
  { key: 'chimney_inspect', title: 'Chimney inspection & sweep', blurb: 'Have the flue inspected and swept before you light the first fire.', applies_to: ['fireplace'], seasons: ['fall'], diy_or_pro: 'pro', bookable: true, priority: 6 },
  { key: 'roof_inspect', title: 'Inspect the roof', blurb: 'Look for lifted shingles, flashing gaps, and winter damage twice a year.', applies_to: ['roof'], seasons: ['spring', 'fall'], diy_or_pro: 'pro', bookable: true, priority: 7 },
  { key: 'caulk_windows', title: 'Re-caulk windows & doors', blurb: 'Seal gaps to cut drafts and energy bills before heating season.', applies_to: ['windows', 'exterior'], seasons: ['fall'], diy_or_pro: 'either', bookable: true, priority: 6 },
  { key: 'attic_check', title: 'Check attic insulation & ventilation', blurb: 'Proper insulation and airflow prevent ice dams and high winter bills.', applies_to: ['all'], seasons: ['fall'], diy_or_pro: 'pro', bookable: true, priority: 5 },
  { key: 'lawn_winterize', title: 'Winterize the sprinkler system', blurb: "Blow out irrigation lines so they don't freeze and crack.", applies_to: ['lawn'], seasons: ['fall'], diy_or_pro: 'pro', bookable: true, priority: 4 },
  { key: 'refresh_bath_caulk', title: 'Refresh bathroom caulk & grout', blurb: 'Re-seal tubs and showers to stop water getting behind tile.', applies_to: ['all'], seasons: ['winter'], diy_or_pro: 'either', bookable: true, priority: 4 },
  { key: 'water_shutoff', title: 'Find & test the main water shut-off', blurb: 'Know where it is and that it works before you ever need it in a hurry.', applies_to: ['plumbing'], seasons: ['winter'], diy_or_pro: 'diy', bookable: false, priority: 5 },
  { key: 'reseal_driveway', title: 'Seal-coat the driveway', blurb: 'A fresh seal-coat protects asphalt from cracks and water in the off-season.', applies_to: ['driveway'], seasons: ['summer'], diy_or_pro: 'pro', bookable: true, priority: 4 },
];

const outDir = process.argv[2] || '.';
const BASE = 'https://www.lavacagc.com';
const unsub = `${BASE}/api/home-care/unsubscribe?token=SAMPLE`;
const forSeason = (s: Season) => CATALOG.filter((t) => t.seasons.includes(s)).sort((a, b) => b.priority - a.priority);

const samples: Array<{ file: string; label: string; n: ReturnType<typeof buildNewsletter> }> = [
  {
    file: 'sample-1_fall-seasonal.html',
    label: 'Fall seasonal (full checklist)',
    n: buildNewsletter({ firstName: 'Alex', season: 'fall', tasks: forSeason('fall'), isSeasonal: true, baseUrl: BASE, unsubscribeUrl: unsub }),
  },
  {
    file: 'sample-2_july-nudge.html',
    label: 'July monthly nudge (top 3)',
    n: buildNewsletter({ firstName: 'Alex', season: 'summer', tasks: forSeason('summer'), isSeasonal: false, monthLabel: 'July', baseUrl: BASE, unsubscribeUrl: unsub }),
  },
  {
    file: 'sample-3_fall-personalized.html',
    label: 'Fall seasonal — personalized (no fireplace, deck, or irrigation)',
    n: buildNewsletter({
      firstName: 'Alex',
      season: 'fall',
      // Homeowner has HVAC + water heater, but NO fireplace/deck/irrigation → those drop out.
      tasks: filterTasksForProfile(forSeason('fall'), { hvac: true, fireplace: false, deck: false, lawn: false, sump_pump: false, driveway: false } as HomeSystems),
      isSeasonal: true,
      baseUrl: BASE,
      unsubscribeUrl: unsub,
    }),
  },
];

for (const s of samples) {
  writeFileSync(`${outDir}/${s.file}`, s.n.html);
  console.log(`${s.label}\n  subject: ${s.n.subject}\n  → ${s.file}\n`);
}
