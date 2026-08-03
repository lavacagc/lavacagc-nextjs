/**
 * Live credential diagnostic — isolates which Google credential is failing.
 * Uses the SAME production code path as the deployed ingest.
 *
 *   GOOGLE_SERVICE_ACCOUNT_B64="$(base64 -i key.json)" \
 *   GSC_SITE_URL="sc-domain:lavacagc.com" \
 *   GA4_PROPERTY_ID="458820388" \
 *   npx tsx scripts/seo-live-check.ts
 *
 * Reports PASS/FAIL for each of: token mint, Search Console, GA4 — so you know
 * exactly which piece to fix.
 */
import { getAccessToken } from '../src/lib/seo/google-auth';
import { fetchGscRows } from '../src/lib/seo/gsc-client';
import { fetchGa4Rows } from '../src/lib/seo/ga4-client';

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
const end = new Date();
end.setUTCDate(end.getUTCDate() - 3); // GSC finalization lag
const start = new Date(end);
start.setUTCDate(start.getUTCDate() - 10);
const startDate = iso(start);
const endDate = iso(end);

function show(name: string, present: boolean, hint: string) {
  console.log(`  ${present ? '✓' : '✗'} ${name}${present ? '' : `  ← ${hint}`}`);
}

async function main() {
  console.log('Environment provided to this check:');
  show('GOOGLE_SERVICE_ACCOUNT_B64', !!process.env.GOOGLE_SERVICE_ACCOUNT_B64, 'missing — pass the base64 of the key JSON');
  show('GSC_SITE_URL', !!process.env.GSC_SITE_URL, 'missing — e.g. sc-domain:lavacagc.com');
  show('GA4_PROPERTY_ID', !!process.env.GA4_PROPERTY_ID, 'missing — numeric property id');
  console.log(`  window: ${startDate} → ${endDate}\n`);

  // 1) Service-account key → OAuth token (tests the key JSON + base64).
  console.log('[1/3] Minting OAuth token from the service-account key…');
  try {
    const tok = await getAccessToken(['https://www.googleapis.com/auth/webmasters.readonly']);
    console.log(`  ✅ PASS — token minted (len ${tok.length}). The key JSON + base64 are valid.\n`);
  } catch (e) {
    console.log(`  ❌ FAIL — ${e instanceof Error ? e.message : e}`);
    console.log('  → The key itself is the problem (bad base64, wrong JSON, or wrong project). Fix this first.\n');
    return;
  }

  // 2) Search Console.
  console.log('[2/3] Querying Search Console (searchAnalytics.query)…');
  try {
    const rows = await fetchGscRows({ startDate, endDate });
    console.log(`  ✅ PASS — ${rows.length} GSC rows. The service account has Search Console access + GSC_SITE_URL is correct.\n`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  ❌ FAIL — ${msg}`);
    if (/403/.test(msg)) console.log('  → 403: the service account email is NOT added to this property in Search Console (Settings → Users), OR the Search Console API isn\'t enabled.');
    else if (/404/.test(msg)) console.log('  → 404: GSC_SITE_URL is wrong. For a domain property it must be exactly "sc-domain:lavacagc.com".');
    else console.log('  → Check GSC_SITE_URL format and that the Search Console API is enabled in the Cloud project.');
    console.log('');
  }

  // 3) GA4.
  console.log('[3/3] Querying GA4 (runReport)…');
  try {
    const rows = await fetchGa4Rows({ startDate, endDate });
    console.log(`  ✅ PASS — ${rows.length} GA4 rows. The service account has GA4 Viewer access + GA4_PROPERTY_ID is correct.\n`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  ❌ FAIL — ${msg}`);
    if (/403|PERMISSION_DENIED/.test(msg)) console.log('  → 403: the service account email is NOT added to the GA4 property (Admin → Property Access Management → Viewer), OR the Analytics Data API isn\'t enabled.');
    else if (/404|NOT_FOUND/.test(msg)) console.log('  → 404: GA4_PROPERTY_ID is wrong. Use the *Property* id (458820388), not the Account id.');
    else console.log('  → Check GA4_PROPERTY_ID and that the Google Analytics Data API is enabled.');
    console.log('');
  }

  console.log('Done. If a step failed, the arrow line tells you exactly what to fix.');
}

main().catch((e) => {
  console.error('check crashed:', e);
  process.exit(1);
});
