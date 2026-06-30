/**
 * Google Analytics 4 Data API client.
 *
 * Pulls (page, date) engagement + conversion rows for the configured property.
 * In `SEO_INGEST_MODE=fixture` mode, returns rows from `fixtures/ga4.json`.
 */
import { getAccessToken, isFixtureMode } from './google-auth';
import ga4Fixture from './fixtures/ga4.json';

export interface Ga4Row {
  page: string; // pagePath, e.g. "/services/kitchen-remodeling"
  date: string; // YYYY-MM-DD
  users: number;
  engaged_sessions: number;
  conversions: number;
}

interface Ga4ApiRow {
  dimensionValues: { value: string }[]; // [pagePath, date]
  metricValues: { value: string }[]; // [totalUsers, engagedSessions, conversions]
}

interface Ga4ApiResponse {
  rows?: Ga4ApiRow[];
}

const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly' as const;

function requirePropertyId(): string {
  const id = process.env.GA4_PROPERTY_ID;
  if (!id) {
    throw new Error(
      'GA4_PROPERTY_ID is not set. Set SEO_INGEST_MODE=fixture for local testing.',
    );
  }
  return id;
}

function ga4DateFormat(d: string): string {
  // GA4 API accepts YYYY-MM-DD directly.
  return d;
}

export async function fetchGa4Rows(opts: {
  startDate: string;
  endDate: string;
  rowLimit?: number;
}): Promise<Ga4Row[]> {
  if (isFixtureMode()) {
    return (ga4Fixture.rows as Ga4Row[]).filter(
      (r) => r.date >= opts.startDate && r.date <= opts.endDate,
    );
  }

  const propertyId = requirePropertyId();
  const token = await getAccessToken([SCOPE]);
  const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

  const body = {
    dateRanges: [{ startDate: ga4DateFormat(opts.startDate), endDate: ga4DateFormat(opts.endDate) }],
    dimensions: [{ name: 'pagePath' }, { name: 'date' }],
    metrics: [
      { name: 'totalUsers' },
      { name: 'engagedSessions' },
      { name: 'conversions' },
    ],
    limit: String(opts.rowLimit ?? 5000),
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
    throw new Error(`GA4 runReport failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as Ga4ApiResponse;
  const rows = data.rows ?? [];
  return rows.map((r) => {
    const [pagePath, dateRaw] = r.dimensionValues.map((v) => v.value);
    // GA4 returns dates as YYYYMMDD; normalize to YYYY-MM-DD.
    const date =
      dateRaw && dateRaw.length === 8
        ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
        : dateRaw;
    const [users, engaged, conversions] = r.metricValues.map((v) => Number(v.value || 0));
    return {
      page: pagePath,
      date,
      users,
      engaged_sessions: engaged,
      conversions,
    };
  });
}
