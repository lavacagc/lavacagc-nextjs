import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseStaffEmails, isHomeCareStaff } from '../src/lib/homecare/staffAllowlist';
import { isInetAddress } from '../src/lib/rateLimit';

/**
 * Home Care "My Home Systems" - Slice 6: the staff Home Record view.
 *
 * A page under /vaca-mgmt where the team can see a homeowner's saved home
 * details before a visit. Two owner-approved guarantees drive every AC here:
 *
 *  1. NEED-TO-KNOW: the view is gated on a DEDICATED HOME_CARE_STAFF_EMAILS
 *     allowlist - not "any logged-in admin" - re-checked server-side in the
 *     route, failing closed in every direction.
 *  2. NO LOG, NO LOOK: every detail view writes a row to
 *     home_record_access_log (who viewed whose record, which fact categories,
 *     when, from where) BEFORE any sensitive value is returned; a failed audit
 *     insert blocks the view.
 *
 * A live render needs a real admin session + the go-live-only tables, so these
 * are unit tests of the pure allowlist helpers plus source/contract assertions
 * on the route, migration, page, and nav wiring - the same pattern as the
 * Slice 1-5 specs.
 */

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const staffAccess = read('src/lib/homecare/staffAccess.ts');
const route = read('src/app/api/admin/home-care/home-records/route.ts');
const migration = read('supabase/migrations/20260813000000_home_record_access_log.sql');
const page = read('src/app/vaca-mgmt/home-records/page.tsx');
const sidebar = read('src/components/admin/AdminSidebar.tsx');
const adminContent = read('src/components/AdminContent.tsx');

test('AC1: allowlist parsing normalizes, splits on commas, and drops junk', () => {
  expect(parseStaffEmails('Alex@VacaMoo.com,  crew@lavacagc.com ')).toEqual([
    'alex@vacamoo.com',
    'crew@lavacagc.com',
  ]);
  // Dashboard-paste artifacts (trailing literal \n) are stripped via cleanEnv.
  expect(parseStaffEmails('alex@vacamoo.com\\n')).toEqual(['alex@vacamoo.com']);
  // Entries without an @ are not emails and never match anyone.
  expect(parseStaffEmails('not-an-email, alex@vacamoo.com,,')).toEqual(['alex@vacamoo.com']);
  expect(parseStaffEmails(undefined)).toEqual([]);
  expect(parseStaffEmails('')).toEqual([]);
  expect(parseStaffEmails('   ')).toEqual([]);
});

test('AC2: staff membership fails closed - empty list or missing email is never staff', () => {
  const list = parseStaffEmails('alex@vacamoo.com,crew@lavacagc.com');
  expect(isHomeCareStaff('ALEX@vacamoo.COM', list)).toBe(true); // case-insensitive
  expect(isHomeCareStaff(' alex@vacamoo.com ', list)).toBe(true); // whitespace-tolerant
  expect(isHomeCareStaff('other-admin@lavacagc.com', list)).toBe(false);
  expect(isHomeCareStaff('', list)).toBe(false);
  expect(isHomeCareStaff(null, list)).toBe(false);
  expect(isHomeCareStaff(undefined, list)).toBe(false);
  // THE fail-closed case: no allowlist configured means NOBODY is staff.
  expect(isHomeCareStaff('alex@vacamoo.com', [])).toBe(false);
});

test('AC3: the session gate derives the email server-side and has no admin fallback', () => {
  // Email comes from the Supabase session cookie via the server client - never
  // from a header, query param, or client payload.
  expect(staffAccess).toContain("from '@/lib/supabase/server'");
  expect(staffAccess).toMatch(/supabase\.auth\.getUser\(\)/);
  expect(staffAccess).toMatch(/isHomeCareStaff\(email,\s*getHomeCareStaffEmails\(\)\)/);
  // Any error reading the session is "not staff" (fail-closed), and the
  // allowlist env var is the only source of membership.
  expect(staffAccess).toMatch(/catch\s*\{\s*return\s+null;?\s*\}/);
  expect(staffAccess).toContain('HOME_CARE_STAFF_EMAILS');
});

test('AC4: the route 403s non-staff before touching any data', () => {
  // requireHomeCareStaff() is the first await in GET, and its failure returns
  // 403 before any supabase read.
  const gateIdx = route.indexOf('await requireHomeCareStaff()');
  const firstReadIdx = route.indexOf('await supabaseRest');
  expect(gateIdx).toBeGreaterThan(-1);
  expect(gateIdx).toBeLessThan(firstReadIdx);
  expect(route).toMatch(/\{\s*ok:\s*false,\s*error:\s*'Not authorized for Home Care records'\s*\},\s*\{\s*status:\s*403\s*\}/);
});

test('AC5: NO LOG, NO LOOK - the audit insert happens before values are returned, and its failure blocks the view', () => {
  const auditIdx = route.indexOf("supabaseRest('POST', 'home_record_access_log'");
  const successIdx = route.indexOf('facts,\n      recent_access');
  expect(auditIdx).toBeGreaterThan(-1);
  expect(successIdx).toBeGreaterThan(-1);
  // Insert strictly precedes the success payload.
  expect(auditIdx).toBeLessThan(successIdx);
  // And a failed insert returns 500 with no record shown.
  expect(route).toMatch(/Could not record this access, so the record was not shown/);
});

test('AC6: the audit row logs fact KEYS and requester metadata, never values', () => {
  expect(route).toMatch(/fact_keys:\s*facts\.map\(\(f\)\s*=>\s*f\.fact_key\)/);
  expect(route).toMatch(/staff_email:\s*staffEmail/);
  // The audit row object must not carry summaries/notes (no second copy of
  // the sensitive data in the log).
  const auditBlock = route.slice(
    route.indexOf('const auditRow'),
    route.indexOf("supabaseRest('POST', 'home_record_access_log'"),
  );
  expect(auditBlock).not.toMatch(/summary|note|detail:/);
});

test('AC7: the roster exposes counts and freshness only - no fact values, no logged view needed', () => {
  // Roster reads only homeowner_id + fact_key (a category, never a value) +
  // updated_at from home_records, paged with an explicit limit/offset so a large
  // dataset never silently truncates...
  expect(route).toContain('home_records?select=homeowner_id,fact_key,updated_at&order=id.asc&limit=');
  expect(route).toMatch(/offset=\$\{offset\}/);
  expect(route).not.toMatch(/home_records\?select=[^`']*(note|detail)/);
  // ...and the count is registry-filtered like detail(), so a fact_key retired
  // from HOME_FACTS can't show staff a phantom count for an empty record.
  expect(route).toContain('knownFactKeys.has(r.fact_key)');
  expect(route).toMatch(/knownFactKeys\s*=\s*new Set\(HOME_FACTS\.map/);
  // ...and identity fields from homeowners - never note/detail. The id lookup is
  // batched so a large id set never truncates or overflows the request URL.
  expect(route).toMatch(/homeowners\?id=in\.[^`']*select=id,email,first_name,zip,home_type,status/);
  expect(route).toMatch(/slice\(i,\s*i\s*\+\s*OWNER_ID_BATCH\)/);
});

test('AC7b: only a missing table reads as an empty roster - a real fault 500s', () => {
  // Pre-go-live the table doesn't exist yet, and the page should render an empty
  // roster. Every other error (outage, unset key, permission) must reach staff as
  // a 500: "no homeowners have saved details" reported during an outage is the
  // same masquerade readHomeRecordsStrict exists to prevent, and staff read it
  // as truth.
  expect(route).toContain("import { supabaseRest, isMissingTableError } from '@/lib/notify/supabase-rest'");
  const failure = route.slice(route.indexOf('function rosterReadFailure'));
  expect(failure).toMatch(/if \(isMissingTableError\(err\)\) return NextResponse\.json\(\{ ok: true, roster: \[\] \}\)/);
  expect(failure).toMatch(/status: 500/);
  // Both roster reads route their failure through that single classifier, and
  // every catch in roster() does so - none may blanket-swallow into an empty
  // roster on its own.
  const rosterFn = route.slice(route.indexOf('async function roster()'), route.indexOf('async function detail('));
  expect(rosterFn.match(/return rosterReadFailure\(/g)?.length).toBe(2);
  const catches = rosterFn.match(/catch \(err\) \{\s*\n\s*[^\n]+/g) ?? [];
  expect(catches.length).toBe(2);
  for (const c of catches) expect(c).toContain('return rosterReadFailure(');
});

test('AC7c: a roster truncated at the row cap is observable, not silent', () => {
  // The pager stops at ROSTER_MAX_ROWS. Exiting on the cap (rather than on a
  // short page) means homeowners are missing, which renders identically to a
  // complete roster - the same masquerade AC7b guards. It must announce itself.
  const rosterFn = route.slice(route.indexOf('async function roster()'), route.indexOf('async function detail('));
  expect(rosterFn).toMatch(/complete = true;/);
  expect(rosterFn).toMatch(/if \(!complete\) \{\s*\n\s*console\.warn\(/);
  expect(rosterFn).toContain('ROSTER_MAX_ROWS');
});

test('AC7d: the audit IP validator is anchored - a junk header drops the field, never blocks a view', () => {
  // ip_address is an optional INET column on an audit row. A value Postgres
  // rejects 422s the insert, and the "no log, no look" catch turns that into a
  // 500 - so an unparseable header would deny staff a legitimate, audited view,
  // and would not self-heal (the same header repeats on every retry).
  for (const ok of ['1.2.3.4', '255.255.255.255', '::1', '::ffff:1.2.3.4', '2001:db8::1', 'fe80::1']) {
    expect(isInetAddress(ok)).toBe(true);
  }
  // Suffixes the URL parser silently truncated the host at ('/', '?', '#'), plus
  // the real-world near-misses: appended proxy port, zone id, CIDR, sentinel.
  for (const bad of [
    '::1]/evil',
    '::1]?x=1',
    '::1]#f',
    '[::1]',
    '1.2.3.4:5678',
    'fe80::1%eth0',
    '1.2.3.4/24',
    '999.1.1.1',
    '01.2.3.4',
    'abc',
    'unknown',
    '',
  ]) {
    expect(isInetAddress(bad)).toBe(false);
  }
});

test('AC8: detail rendering goes through the registry chokepoint', () => {
  // Registry order + registry filter + the shared one-line formatter, so the
  // staff view renders a saved detail exactly like the recap and the rider.
  expect(route).toMatch(/for\s*\(const\s+fact\s+of\s+HOME_FACTS\)/);
  expect(route).toMatch(/factValueSummary\(fact,\s*\{\s*note:\s*row\.note,\s*detail:\s*row\.detail\s*\?\?\s*\{\}\s*\}\)/);
});

test('AC9: the migration is deny-by-default with no policies, cascading with the homeowner', () => {
  expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.home_record_access_log');
  expect(migration).toMatch(/homeowner_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+public\.homeowners\(id\)\s+ON\s+DELETE\s+CASCADE/);
  expect(migration).toMatch(/staff_email\s+TEXT\s+NOT\s+NULL/);
  expect(migration).toMatch(/fact_keys\s+JSONB\s+NOT\s+NULL/);
  expect(migration).toContain('ALTER TABLE public.home_record_access_log ENABLE ROW LEVEL SECURITY');
  // Deny-by-default: RLS on, zero policies.
  expect(migration).not.toMatch(/CREATE\s+POLICY/i);
});

test('AC10: the page is a thin client of the admin API and never touches sensitive reads itself', () => {
  expect(page).toContain("'use client'");
  expect(page).toContain('/api/admin/home-care/home-records');
  // No direct supabase or server-lib imports from the browser bundle.
  expect(page).not.toMatch(/supabase-rest|readHomeRecords|from '@\/lib\/homecare\/homeRecords'/);
});

test('AC11: the page surfaces the need-to-know gate and the audit trail to the team', () => {
  // 403 state for admins not on the staff list.
  expect(page).toContain('home-records-forbidden');
  expect(page).toMatch(/res\.status\s*===\s*403/);
  // "This view was just logged" notice + the recent-access list.
  expect(page).toContain('access-logged-notice');
  expect(page).toContain('recent-access');
  expect(page).toContain('staff-only-notice');
});

test('AC11b: a failed roster load renders as an error, never as an empty roster', () => {
  // The API 500s on a real fault (AC7b), but the page is where a human forms
  // the belief: a toast fades, "No homeowners have saved home details yet."
  // stays on screen and reads as truth. So the error state must REPLACE the
  // empty state, and the count must not assert 0 when it is unknown.
  expect(page).toContain('roster-load-error');
  expect(page).toMatch(/setLoadError\(true\)/);
  // The catch sets the flag and clears any stale roster...
  const catchBlock = page.slice(page.indexOf('} catch (err) {'), page.indexOf('} finally {'));
  expect(catchBlock).toContain('setLoadError(true)');
  expect(catchBlock).toContain('setRoster([])');
  // ...a fresh attempt clears it...
  expect(page).toMatch(/setLoading\(true\);\s*\n\s*setLoadError\(false\);/);
  // ...and loadError is branched BEFORE the empty state, so the two can never
  // render together.
  expect(page.indexOf('loadError ? (')).toBeLessThan(page.indexOf("data-testid=\"empty-roster\""));
  // The header count is suppressed while the roster is unknown.
  expect(page).toContain("? 'Homes with saved details'");
});

test('AC12: nav wiring - sidebar leaf and AdminContent tab both exist and match', () => {
  expect(sidebar).toMatch(/\{\s*id:\s*'home-records',\s*icon:\s*KeyRound,\s*label:\s*'Home Records'\s*\}/);
  expect(adminContent).toMatch(/<TabsContent\s+value="home-records">/);
  expect(adminContent).toMatch(/import\('@\/app\/vaca-mgmt\/home-records\/page'\)/);
});
