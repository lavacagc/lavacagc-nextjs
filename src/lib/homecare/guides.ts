/**
 * La Vaca Home Care — seasonal "learn more" guide content.
 *
 * Editorial content lives in code (not the DB) so the guide pages render without
 * a backend and stay in version control. Each item's `key` matches a
 * maintenance_catalog key so the checklist/email "Learn more →" links can anchor
 * straight to the right section (/home-care/guides/<season>#<key>).
 */

export type Season = 'spring' | 'summer' | 'fall' | 'winter';

export interface GuideItem {
  key: string;
  title: string;
  /** 2–4 sentence "the details": why it matters, how/when, DIY vs pro. */
  body: string;
  bookable?: boolean;
}

export interface SeasonGuide {
  season: Season;
  label: string;
  intro: string;
  items: GuideItem[];
}

export const GUIDES: Record<Season, SeasonGuide> = {
  spring: {
    season: 'spring',
    label: 'Spring',
    intro:
      'After a Northern NJ winter, spring is about undoing freeze damage and getting systems ready for summer. Tackle these as the snow clears and before the first heat wave.',
    items: [
      { key: 'clean_gutters', title: 'Clean gutters & downspouts', bookable: true, body: 'Winter dumps grit, shingle granules, and the last of the leaves into your gutters. Flush them and confirm downspouts carry water at least 4–6 feet from the foundation — clogged gutters are the #1 cause of wet basements in spring storms.' },
      { key: 'hvac_ac_tuneup', title: 'Service the A/C before summer', bookable: true, body: 'Book the tune-up in spring while HVAC techs still have openings — by July they\'re slammed. A pro will check refrigerant, clean the coils, and catch a failing capacitor before it strands you in a heat wave. Swap the filter while you\'re at it.' },
      { key: 'test_sump_pump', title: 'Test the sump pump', bookable: true, body: 'Spring is peak groundwater season. Pour a bucket of water into the pit and confirm the pump kicks on and drains. If it hesitates, or you don\'t have a battery backup, get it sorted now — the time you find out it\'s dead should never be 2 a.m. during a storm.' },
      { key: 'roof_inspect', title: 'Inspect the roof', bookable: true, body: 'From the ground (or with a drone/phone zoom), look for lifted or missing shingles, damaged flashing around chimneys and vents, and any winter ice-dam damage at the eaves. Small fixes now prevent leaks during spring rains.' },
      { key: 'power_wash', title: 'Power-wash siding & walkways', bookable: true, body: 'Wash off a winter\'s salt, grime, and mildew. Beyond curb appeal, it\'s a good excuse to walk the exterior and spot cracked caulk, peeling paint, or siding that\'s pulling away.' },
      { key: 'lawn_spring_prep', title: 'Spring lawn prep & aeration', bookable: true, body: 'Aerate compacted soil, overseed bare patches, and put down a pre-emergent before crabgrass takes hold (timing matters — roughly when the forsythia blooms in NJ). A healthy spring start sets up the whole season.' },
    ],
  },
  summer: {
    season: 'summer',
    label: 'Summer',
    intro:
      'Summer is the season for the bigger exterior projects — dry, warm weather is exactly what sealants and coatings need to cure properly.',
    items: [
      { key: 'replace_hvac_filter', title: 'Replace the HVAC filter', body: 'In peak cooling season your system moves a lot of air. A clogged filter makes it work harder, run hotter, and cost more. Check monthly in summer and swap when it looks gray.' },
      { key: 'seal_deck', title: 'Clean & seal the deck', bookable: true, body: 'Wash the deck, let it dry fully (a couple of dry days), then seal or stain. Summer\'s low humidity and warmth let the finish cure right. Skipping it a year or two leads to graying, cracking, and far costlier board replacement down the line.' },
      { key: 'reseal_driveway', title: 'Seal-coat the driveway', bookable: true, body: 'Asphalt needs warm, dry weather to cure, so summer is the window. A fresh seal-coat fills hairline cracks and blocks water before it freezes and splits the surface next winter. Plan to keep cars off it for 24–48 hours.' },
    ],
  },
  fall: {
    season: 'fall',
    label: 'Fall',
    intro:
      'Fall is the most important maintenance season in NJ — everything here is about getting your home buttoned up before the first freeze. Don\'t put these off.',
    items: [
      { key: 'clean_gutters', title: 'Clean gutters & downspouts', bookable: true, body: 'Do this after the leaves drop (often late November here). Gutters packed with leaves freeze into ice dams that back water under your shingles. Clear them and check that downspouts still direct water away from the foundation.' },
      { key: 'hvac_furnace_tuneup', title: 'Service the furnace / heating', bookable: true, body: 'A fall tune-up keeps heat reliable and — just as important — safe: a tech checks the heat exchanger for cracks that can leak carbon monoxide. Book before the first cold snap when everyone calls at once.' },
      { key: 'flush_water_heater', title: 'Flush the water heater', bookable: true, body: 'Sediment builds up at the bottom of the tank and makes it work harder right when you\'re using the most hot water. An annual flush extends the tank\'s life and keeps showers hot. Easy to roll into a fall maintenance visit.' },
      { key: 'winterize_faucets', title: 'Shut off & drain outdoor faucets', bookable: true, body: 'This is the cheap chore that prevents the expensive disaster. Shut off the interior valve to each hose bib, open the outside spigot to drain it, and disconnect hoses. Water left in the line freezes, expands, and bursts the pipe inside your wall.' },
      { key: 'clean_dryer_vent', title: 'Clean the dryer vent', bookable: true, body: 'Lint buildup in the vent line is a leading cause of house fires and makes the dryer run long and hot. Once a year, clear the full run from the dryer to the exterior hood — not just the lint trap.' },
      { key: 'chimney_inspect', title: 'Chimney inspection & sweep', bookable: true, body: 'Before the first fire, have the flue inspected and swept. Creosote buildup is a chimney-fire hazard, and inspectors catch cracked liners and damaged caps that let water (and animals) in.' },
      { key: 'caulk_windows', title: 'Re-caulk windows & doors', bookable: true, body: 'Seal gaps around windows, doors, and where pipes/wires enter the house. It cuts drafts and heating bills all winter, and keeps cold air (and the occasional mouse) out. A few tubes of caulk pay for themselves fast.' },
      { key: 'attic_check', title: 'Check attic insulation & ventilation', bookable: true, body: 'Proper attic insulation and airflow are what prevent ice dams and sky-high heating bills. Look for thin or compressed insulation and blocked soffit vents. Worth a pro\'s eye if you\'ve had ice dams before.' },
      { key: 'lawn_winterize', title: 'Winterize the sprinkler system', bookable: true, body: 'If you have in-ground irrigation, have the lines blown out with compressed air before the freeze — water left in them cracks the pipes and heads. This one really does need a pro with the right compressor.' },
    ],
  },
  winter: {
    season: 'winter',
    label: 'Winter',
    intro:
      'Winter is for the indoor jobs and the "know where things are" tasks — plus staying ahead of the cold-weather problems that catch homeowners off guard.',
    items: [
      { key: 'replace_hvac_filter', title: 'Replace the HVAC filter', body: 'The furnace runs hard in winter. A fresh filter protects the system, keeps air cleaner during the closed-up months, and helps even out hot/cold spots in the house.' },
      { key: 'water_shutoff', title: 'Find & test the main water shut-off', body: 'A frozen pipe can burst and flood a room in minutes. Know exactly where your main shut-off is and that it turns freely — before you need it. Same for individual fixture shut-offs. Two minutes that can save thousands.' },
      { key: 'refresh_bath_caulk', title: 'Refresh bathroom caulk & grout', bookable: true, body: 'Winter is a good time for indoor jobs. Re-seal tubs, showers, and sink edges where caulk has cracked — that\'s how water sneaks behind tile and rots the wall. Quick to do, easy to ignore until there\'s real damage.' },
    ],
  },
};

export function getGuide(season: string): SeasonGuide | null {
  return (GUIDES as Record<string, SeasonGuide>)[season] ?? null;
}

/** True if there's a guide section to link to for this task in this season. */
export function hasGuideItem(season: string, taskKey: string): boolean {
  const g = getGuide(season);
  return !!g && g.items.some((i) => i.key === taskKey);
}
