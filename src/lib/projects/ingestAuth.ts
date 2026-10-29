/**
 * Bearer-token check for /api/projects/ingest (SEC4).
 *
 * Server-only (node:crypto). Kept free of Next and Supabase imports so a spec
 * can import it directly and pin the behaviour that a running server cannot
 * show, above all "token unset means the route does not exist".
 */
import { createHash, timingSafeEqual } from 'node:crypto';

/** The slice of the environment this module reads (a plain object in specs). */
export type IngestEnv = Partial<Record<string, string | undefined>>;

/** A shorter token is treated as no token at all: the route stays dark. */
export const MIN_INGEST_TOKEN_LENGTH = 32;

/** The configured token, or null when it is unset or too short to be safe. */
export function configuredIngestToken(env: IngestEnv = process.env): string | null {
  const token = env.PROJECT_INGEST_TOKEN?.trim() ?? '';
  return token.length >= MIN_INGEST_TOKEN_LENGTH ? token : null;
}

/** The token from `Authorization: Bearer <token>`, or null. */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match ? match[1] : null;
}

/**
 * Constant-time comparison.
 *
 * `timingSafeEqual` throws on buffers of different length, and an early length
 * check would leak the token's length. Hashing both sides first gives two
 * 32-byte digests, so the comparison is always equal-length and its timing says
 * nothing about where, or whether, the inputs differ.
 */
export function tokensMatch(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

export type IngestTokenVerdict = 'disabled' | 'valid' | 'invalid' | 'absent';

/**
 * The bearer half of the ingest decision.
 *
 * `disabled` wins over everything: with no usable token configured the route
 * answers 404 to every caller, signed-in admins included, so a deploy that
 * forgot the env var exposes nothing and says nothing about why.
 */
export function checkIngestToken(
  authorizationHeader: string | null | undefined,
  env: IngestEnv = process.env,
): IngestTokenVerdict {
  const expected = configuredIngestToken(env);
  if (!expected) return 'disabled';
  const provided = bearerToken(authorizationHeader);
  if (!provided) return 'absent';
  return tokensMatch(provided, expected) ? 'valid' : 'invalid';
}
