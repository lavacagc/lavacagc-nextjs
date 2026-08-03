/**
 * The Home Care staff allowlist gate for the "My Home Systems" staff Home
 * Record view (Slice 6).
 *
 * The owner's explicit decision: saved home details (shut-off locations, panel
 * maps) are need-to-know, so the staff view is gated on a DEDICATED allowlist -
 * NOT "any logged-in admin" like the rest of /vaca-mgmt. Middleware still
 * enforces a valid admin session on /api/admin/*; this module adds the second,
 * stricter check on top: the session's email must be on HOME_CARE_STAFF_EMAILS
 * (comma-separated, case-insensitive).
 *
 * FAIL-CLOSED everywhere: no env var, an empty list, no session, or a session
 * without an email all mean "not staff". There is deliberately no fallback to
 * the plain admin gate. The pure parsing/membership helpers live in
 * staffAllowlist.ts (import-light, unit-testable); this module owns only the
 * session read.
 */
import { createClient } from '@/lib/supabase/server';
import { parseStaffEmails, isHomeCareStaff } from '@/lib/homecare/staffAllowlist';

export function getHomeCareStaffEmails(): string[] {
  return parseStaffEmails(process.env.HOME_CARE_STAFF_EMAILS);
}

/**
 * Resolve the acting admin's email from the Supabase session cookie and check
 * it against the allowlist. Returns the normalized email for the audit log, or
 * null when the caller is not Home Care staff (route responds 403). Never
 * throws - any session-read error is "not staff".
 */
export async function requireHomeCareStaff(): Promise<{ email: string } | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const email = user?.email;
    if (!email || !isHomeCareStaff(email, getHomeCareStaffEmails())) return null;
    return { email: email.trim().toLowerCase() };
  } catch {
    return null;
  }
}
