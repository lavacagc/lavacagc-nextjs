// TEMP preview — renders the checklist client with mock tasks (mirroring the
// applied catalog v2 data) so the seasonal spotlight + pricing can be viewed
// without login. DELETE after review (not linked anywhere).
import HomeCareChecklistClient, { type ChecklistTask } from '@/components/homecare/HomeCareChecklistClient';

const t = (o: Partial<ChecklistTask> & { key: string; title: string; seasons: string[] }): ChecklistTask => ({
  blurb: '', diy_or_pro: 'either', bookable: true, est_cost_low: null, est_cost_high: null, frequency: 'annual', starter: false, ...o,
});

const MOCK: ChecklistTask[] = [
  // winter
  t({ key: 'refresh_bath_caulk', title: 'Refresh bathroom caulk & grout', blurb: 'Re-seal tubs and showers to stop water getting behind tile.', diy_or_pro: 'either', seasons: ['winter'], est_cost_low: 150, est_cost_high: 675 }),
  t({ key: 'ice_dam_check', title: 'Check for ice dams & heat cables', blurb: 'After heavy snow, look for ice building at the roof edge — a sign of heat escaping the attic.', seasons: ['winter'] }),
  t({ key: 'radon_test', title: 'Test for radon', blurb: 'New Jersey has some of the highest radon levels in the country.', seasons: ['winter'] }),
  t({ key: 'refinish_hardwood', title: 'Refresh or refinish hardwood floors', blurb: 'Winter is the season to bring tired hardwood back to life — a screen-and-recoat, or a full refinish.', diy_or_pro: 'pro', seasons: ['winter'] }),
  // spring
  t({ key: 'clean_gutters', title: 'Clean gutters & downspouts', blurb: 'Clear leaves and debris so rain drains away from your foundation.', diy_or_pro: 'pro', seasons: ['spring'], est_cost_low: 150, est_cost_high: 525 }),
  t({ key: 'drainage_check', title: 'Check grading & yard drainage', blurb: 'Make sure the ground slopes away from the house and downspouts carry water clear of the foundation.', seasons: ['spring'] }),
  t({ key: 'sump_backup_test', title: 'Test the sump-pump battery backup', blurb: 'A sump pump is only as good as its backup when the power goes out mid-storm.', seasons: ['spring'] }),
  // summer
  t({ key: 'seal_deck', title: 'Clean & seal the deck', blurb: 'Wash and reseal to protect the wood through another season of weather.', diy_or_pro: 'pro', seasons: ['summer'], est_cost_low: 400, est_cost_high: 1800 }),
  t({ key: 'reseal_driveway', title: 'Seal-coat the driveway', blurb: 'A fresh seal-coat protects asphalt from cracks and water in the off-season.', diy_or_pro: 'pro', seasons: ['summer'], est_cost_low: 300, est_cost_high: 1200 }),
  t({ key: 'trim_paint_touchup', title: 'Touch up exterior trim & paint', blurb: 'Catch peeling or bare trim before the wood weathers.', seasons: ['summer'] }),
  // fall
  t({ key: 'hvac_furnace_tuneup', title: 'Service the furnace / heating', blurb: 'A fall tune-up keeps heat reliable and safe through a NJ winter.', diy_or_pro: 'pro', seasons: ['fall'], est_cost_low: 100, est_cost_high: 375 }),
  t({ key: 'generator_service', title: 'Service the standby generator', blurb: 'If you have a whole-home standby generator, have it exercised and serviced before storm season.', diy_or_pro: 'pro', seasons: ['fall'] }),
  t({ key: 'range_hood_service', title: 'Service the range hood & kitchen vents', blurb: 'Clean or replace the range-hood filter and confirm it vents outside.', seasons: ['fall'] }),
];

export default function SpotlightPreview() {
  return (
    <div className="mx-auto max-w-xl p-4">
      <HomeCareChecklistClient tasks={MOCK} doneItems={[]} showStarter={false} currentSeason="winter" />
    </div>
  );
}
