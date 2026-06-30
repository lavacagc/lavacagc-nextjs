/**
 * Google service-account auth helper for the SEO autonomy engine.
 *
 * Reads `GOOGLE_SERVICE_ACCOUNT_B64` (base64 of the service-account JSON),
 * mints short-lived OAuth2 access tokens via the JWT-bearer flow, and caches
 * them in-memory until ~60s before expiry.
 *
 * In `SEO_INGEST_MODE=fixture` mode, returns a sentinel token so callers can
 * exercise the full pipeline without real Google credentials.
 */
import { createSign } from 'node:crypto';

export const FIXTURE_TOKEN = 'fixture-access-token';
export const FIXTURE_MODE_ENV = 'SEO_INGEST_MODE';

export type GoogleScope =
  | 'https://www.googleapis.com/auth/webmasters.readonly'
  | 'https://www.googleapis.com/auth/analytics.readonly';

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

const tokenCache = new Map<string, CachedToken>();

export function isFixtureMode(): boolean {
  return process.env[FIXTURE_MODE_ENV] === 'fixture';
}

function loadServiceAccount(): ServiceAccountKey {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  if (!b64) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_B64 is not set. Set SEO_INGEST_MODE=fixture for local testing without credentials.',
    );
  }
  let decoded: string;
  try {
    decoded = Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_B64 is not valid base64');
  }
  let parsed: ServiceAccountKey;
  try {
    parsed = JSON.parse(decoded) as ServiceAccountKey;
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_B64 did not decode to valid JSON');
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('Service account JSON missing client_email or private_key');
  }
  return parsed;
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function buildJwt(account: ServiceAccountKey, scopes: GoogleScope[]): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const aud = account.token_uri || 'https://oauth2.googleapis.com/token';
  const claims = {
    iss: account.client_email,
    scope: scopes.join(' '),
    aud,
    exp: nowSec + 3600,
    iat: nowSec,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = base64url(signer.sign(account.private_key));
  return `${signingInput}.${signature}`;
}

/**
 * Get an OAuth2 access token for the requested scopes.
 * Tokens are cached in-memory by sorted-scope key.
 */
export async function getAccessToken(scopes: GoogleScope[]): Promise<string> {
  if (isFixtureMode()) return FIXTURE_TOKEN;

  const cacheKey = [...scopes].sort().join(' ');
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAtMs > Date.now() + 60_000) {
    return cached.token;
  }

  const account = loadServiceAccount();
  const assertion = buildJwt(account, scopes);
  const tokenUri = account.token_uri || 'https://oauth2.googleapis.com/token';

  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error('Google token exchange returned no access_token');
  }

  const ttlMs = (data.expires_in ?? 3600) * 1000;
  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAtMs: Date.now() + ttlMs,
  });
  return data.access_token;
}

/** Test-only: clear the in-memory token cache. */
export function _clearTokenCacheForTests(): void {
  tokenCache.clear();
}
