import { test, expect } from '@playwright/test';
import { buildSelectionPayload, OPTION_DB_MAP } from '../src/lib/calculator/optionCatalog';
import { PROJECT_LOCATIONS } from '../src/components/calculator/steps/ProjectOverviewStep';

/**
 * Project calculator - selection capture + home-addition contract fixes.
 *
 * IMPORTANT CONTEXT: /project-calculator currently 308-redirects to
 * /free-estimate (next.config.ts) - the calculator UI is retired from public
 * routing, so there is no URL to drive a browser flow against. These tests
 * therefore pin the CONTRACTS so the feature is correct the day it is
 * re-enabled (and because the deployed calculate-estimate fn is shared by any
 * caller):
 *
 * Background (all verified live against production on 2026-07-13):
 *  - The UI sent kebab-case option ids but the calculate-estimate edge fn
 *    matched catalog NAMES: no selection ever matched, so
 *    calculator_lead_selections stayed empty and estimates omitted all option
 *    costs. Duplicate catalog names also double-counted when a name DID match
 *    (one "Soaking Tub" charged $11,200 instead of $5,600).
 *  - Quality level and additional-features picks were collected by the UI and
 *    then never sent anywhere.
 *  - Home addition: the location dropdown values had zero overlap with the
 *    submit-home-addition enum (every submission rejected), and the PDF
 *    "upload" was simulated - raw browser File objects JSON.stringify to {}.
 *
 * Acceptance criteria:
 *  AC1: buildSelectionPayload maps mapped ids to catalog UUIDs (deduped) and
 *       reports everything else - unmapped options, quality level, additional
 *       features - as unmatched selections. Nothing is dropped.
 *  AC2: the UI location list matches the deployed submit-home-addition enum.
 *  AC3 (opt-in, E2E_CALC_FN_PROBES=1): the DEPLOYED calculate-estimate fn
 *       prices duplicate ids once and records unmatched picks as zero-cost
 *       calculator_lead_selections rows. Creates + deletes real rows and
 *       sends real admin emails, so it does not run in routine suites.
 */

const SOAKING_TUB_UUID = 'd119ebf1-a4ac-424f-9082-e173261592be';

test.describe('calculator selection payload (unit)', () => {
  test.skip(({ isMobile }) => Boolean(isMobile), 'pure contract spec - chromium project only');

  test('AC1: mapped ids dedupe; quality/features/unmapped all recorded', () => {
    const payload = buildSelectionPayload({
      materialOptionIds: ['soaking-tub', 'soaking-tub', 'led-mirror', 'heated-floor'],
      qualityLevel: 'mid-range',
      additionalFeatureIds: ['premium-hardware'],
    });

    expect(payload.selected_option_ids).toContain(SOAKING_TUB_UUID);
    expect(payload.selected_option_ids).toContain(OPTION_DB_MAP['heated-floor']);
    expect(payload.selected_option_ids).toHaveLength(2); // duplicate soaking-tub deduped

    expect(payload.unmatched_selections).toContainEqual({ category: 'Features', label: 'LED Mirror' });
    expect(payload.unmatched_selections).toContainEqual({ category: 'Quality Level', label: 'Mid-Range' });
    expect(payload.unmatched_selections).toContainEqual({
      category: 'Additional Features',
      label: 'Premium Hardware & Accessories',
    });
    expect(payload.unmatched_selections).toHaveLength(3);
  });

  test('AC1b: unknown option ids degrade to recorded unmatched, never dropped', () => {
    const payload = buildSelectionPayload({ materialOptionIds: ['some-future-option'] });
    expect(payload.selected_option_ids).toEqual([]);
    expect(payload.unmatched_selections).toEqual([{ category: 'Options', label: 'some-future-option' }]);
  });

  test('AC2: UI location list matches the deployed submit-home-addition enum', () => {
    // Enum captured from the deployed fn's Zod error on 2026-07-13. The old UI
    // list ("Addition to existing home" / "Detached structure" / "Other") had
    // zero overlap and every submission was rejected.
    expect(PROJECT_LOCATIONS).toEqual([
      'Front Addition',
      'Rear Addition',
      'Side Addition',
      'Second Story Addition',
    ]);
  });
});

/**
 * Live probe of the DEPLOYED calculate-estimate fn. Opt-in: creates and
 * deletes production estimate_leads/calculator_lead_selections rows and sends
 * the fn's real admin notification emails.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const PROBES_ON = process.env.E2E_CALC_FN_PROBES === '1' && Boolean(SUPABASE_URL && SUPABASE_KEY && ANON_KEY);

test.describe('deployed calculate-estimate contract (opt-in live probe)', () => {
  test.skip(!PROBES_ON, 'Set E2E_CALC_FN_PROBES=1 with Supabase env to run (writes prod rows + sends admin emails).');
  test.skip(({ isMobile }) => Boolean(isMobile), 'server contract - chromium project only');

  test('AC3: duplicate ids priced once; unmatched picks recorded as zero-cost rows', async () => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/calculate-estimate`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_type: 'bathroom',
        square_footage: 50,
        selected_options: [],
        selected_option_ids: [SOAKING_TUB_UUID, SOAKING_TUB_UUID],
        unmatched_selections: [{ category: 'Features', label: 'LED Mirror' }],
        lead_data: {
          first_name: 'E2E',
          last_name: 'CalcProbe',
          email: 'delivered+calc-spec@resend.dev',
          phone: '2015550123',
          street_address: '1 Test St',
          city: 'Montclair',
          state: 'NJ',
          zip_code: '07042',
          lead_source: 'e2e-probe',
          best_contact_time: 'anytime',
          marketing_consent: false,
        },
      }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { lead_id: string; lead_data: { combined_total: number } };
    // 50 sqft bathroom base (150+100)/sqft = 12,500 + Soaking Tub 5,600 ONCE.
    expect(data.lead_data.combined_total).toBe(18100);

    const h = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
    const selRes = await fetch(
      `${SUPABASE_URL}/rest/v1/calculator_lead_selections?estimate_lead_id=eq.${data.lead_id}&select=option_item_id,option_item_name,total_cost`,
      { headers: h }
    );
    const selections = (await selRes.json()) as Array<Record<string, unknown>>;
    expect(selections).toHaveLength(2);
    expect(selections).toContainEqual(
      expect.objectContaining({ option_item_id: SOAKING_TUB_UUID, total_cost: 5600 })
    );
    expect(selections).toContainEqual(
      expect.objectContaining({ option_item_id: null, option_item_name: 'LED Mirror', total_cost: 0 })
    );

    // Cleanup
    for (const q of [
      `calculator_lead_selections?estimate_lead_id=eq.${data.lead_id}`,
      `material_estimates?estimate_lead_id=eq.${data.lead_id}`,
      `estimate_leads?id=eq.${data.lead_id}`,
    ]) {
      await fetch(`${SUPABASE_URL}/rest/v1/${q}`, { method: 'DELETE', headers: h });
    }
  });
});
