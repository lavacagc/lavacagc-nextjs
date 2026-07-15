/**
 * Pure Home Care staff-allowlist helpers (My Home Systems, Slice 6).
 *
 * Kept import-light on purpose - no supabase, no next/headers - mirroring the
 * records.ts (pure) vs homeRecords.ts (server) split, so unit tests and any
 * client-safe module can import these directly. The server-side session gate
 * that USES them lives in staffAccess.ts.
 *
 * FAIL-CLOSED is the contract: an unset or empty HOME_CARE_STAFF_EMAILS, or a
 * missing email, must always mean "not staff".
 */
import { cleanEnv } from '@/lib/envClean';

/** Mirrors homeowners.ts normalizeEmail; local so this module stays dependency-free. */
function normalize(email: string): string {
  return email.trim().toLowerCase();
}

/** Parse a comma-separated allowlist into normalized emails. */
export function parseStaffEmails(raw: string | undefined | null): string[] {
  const cleaned = cleanEnv(raw);
  if (!cleaned) return [];
  return cleaned
    .split(',')
    .map((e) => normalize(e))
    .filter((e) => e.includes('@'));
}

/** True only when the email is non-empty and on a non-empty allowlist. */
export function isHomeCareStaff(email: string | null | undefined, staffEmails: string[]): boolean {
  if (!email || staffEmails.length === 0) return false;
  return staffEmails.includes(normalize(email));
}
