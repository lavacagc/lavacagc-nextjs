/**
 * Google Search Console (Search Analytics) client.
 *
 * Pulls (page, query, date) rows for a configured site over a date window.
 * In `SEO_INGEST_MODE=fixture` mode, returns rows from `fixtures/gsc.json`
 * so the full ingest pipeline can be exercised without API access.
 */
import { getAccessToken, isFixtureMode } from './google-auth';
import gscFixture from './fixtures/gsc.json';

export interface GscRow {
  page: string;
  query: string;
  date: string; // YYYY-MM-DD
  impressions: number;
  clicks: number;
  position: number;
  ctr: number;
}

interface GscApiRow {
  keys: string[]; // [page, query, date] in our request
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface GscApiResponse {
  rows?: GscApiRow[];
  responseAggregationType?: string;
}

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly' as const;

function requireSiteUrl(): string {
  const site = process.env.GSC_SITE_URL;
  if (!site) {
    throw new Error(
      'GSC_SITE_URL is not set (e.g. "sc-domain:lavacagc.com"). Set SEO_INGEST_MODE=fixture for local testing.',
    );
  }
  return site;
}

/**
 * Fetch (page, query, date) rows for the given inclusive date range.
 * Dates must be `YYYY-MM-DD`.
 */
export async function fetchGscRows(opts: {
  startDate: string;
  endDate: string;
  rowLimit?: number;
}): Promise<GscRow[]> {
  if (isFixtureMode()) {
    return (gscFixture.rows as GscRow[]).filter(
      (r) => r.date >= opts.startDate && r.date <= opts.endDate,
    );
  }

  const siteUrl = requireSiteUrl();
  const token = await getAccessToken([SCOPE]);
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;

  const body = {
    startDate: opts.startDate,
    endDate: opts.endDate,
    dimensions: ['page', 'query', 'date'],
    rowLimit: opts.rowLimit ?? 5000,
    dataState: 'final',
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GSC searchAnalytics.query failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as GscApiResponse;
  const rows = data.rows ?? [];
  return rows.map((r) => ({
    page: r.keys[0],
    query: r.keys[1],
    date: r.keys[2],
    impressions: r.impressions,
    clicks: r.clicks,
    position: r.position,
    ctr: r.ctr,
  }));
}
