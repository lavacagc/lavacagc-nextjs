import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildDispatchEmail } from '../src/lib/homecare/dispatchEmail';

/**
 * Home Care "My Home Systems" - Slice 5: the booking rider.
 *
 * When a signed-in homeowner submits the consolidated Home Care booking, the
 * home details they have saved (Slices 1-4: shut-off locations, panel, filter
 * sizes) ride along on that booking's OWNER ALERT - scoped to only the booked
 * services - so the crew arrives knowing where things are.
 *
 * Security is the whole point: shut-off locations are home-security data, so the
 * client never carries them. The booking form sends only non-sensitive booked
 * task keys; the submit route derives the homeowner from the verified,
 * HMAC-signed hc_access cookie (NEVER the client payload), reads home_records
 * server-side, scopes to the booked tasks, and renders the result into La Vaca's
 * internal Telegram + email alert only. Nothing reaches public.leads or any
 * customer-facing surface. A live booking render needs a real session + the
 * go-live-only home_records table, so these are source/contract assertions; the
 * scoping/formatting + owner-alert render were verified against the real
 * functions before commit.
 */

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const bookingForm = read('src/components/homecare/HomeCareBookingForm.tsx');
const route = read('src/app/api/leads/submit/route.ts');
const homeRecords = read('src/lib/homecare/homeRecords.ts');
const records = read('src/lib/homecare/records.ts');
const checklistClient = read('src/components/homecare/HomeCareChecklistClient.tsx');
const telegram = read('src/lib/notify/telegramLead.ts');
const email = read('src/lib/notify/newLeadEmail.ts');
const templates = read('src/lib/emailTemplates.ts');

test('AC1: booking form sends non-sensitive booked task keys, not the details themselves', () => {
  // The form carries only catalog slugs; the sensitive details stay server-side.
  expect(bookingForm).toMatch(/task_keys:\s*services\.map\(\(s\)\s*=>\s*s\.key\)/);
  // It must NOT send any home-records/home-details payload from the client.
  expect(bookingForm).not.toMatch(/homeDetails|home_records|readHomeRecords/);
});

test('AC2: submit route schema accepts task_keys as a bounded, nullish array', () => {
  expect(route).toMatch(/task_keys:\s*z\.array\(z\.string\(\)\.max\(\d+\)\)\.max\(\d+\)\.nullish\(\)/);
});

test('AC3: task_keys is destructured OUT before sanitize/insert (never a leads column)', () => {
  // Pulled out of rawLeadFields alongside services, so sanitizeLeadForInsert
  // never sees it and it can never reach public.leads.
  expect(route).toMatch(/services:\s*rawServices,\s*task_keys:\s*rawTaskKeys,\s*\.\.\.rawLeadFields/);
  expect(route).toMatch(/const\s+bookedTaskKeys\s*=\s*Array\.isArray\(rawTaskKeys\)/);
});

test('AC4: home details are resolved from the VERIFIED cookie, never the client payload', () => {
  expect(route).toMatch(/import\s*\{[^}]*HC_ACCESS_COOKIE[^}]*verifyHomeAccess[^}]*\}\s*from\s*'@\/lib\/homecare\/accessCookie'/);
  expect(route).toMatch(/import\s*\{\s*readBookedHomeDetails\s*\}\s*from\s*'@\/lib\/homecare\/homeRecords'/);
  // Gated on a Home Care source, keyed off the signed cookie -> homeownerId.
  const window = route.slice(route.indexOf('let homeDetails'), route.indexOf('let homeDetails') + 700);
  expect(window).toMatch(/source\.startsWith\('home_care'\)\s*&&\s*bookedTaskKeys\.length\s*>\s*0/);
  expect(window).toMatch(/verifyHomeAccess\(\s*request\.cookies\.get\(HC_ACCESS_COOKIE\)\?\.value\s*\)/);
  expect(window).toMatch(/readBookedHomeDetails\(\s*access\.homeownerId,\s*bookedTaskKeys\s*\)/);
});

test('AC5: home details thread into BOTH owner-alert channels, guarded by length', () => {
  const matches = route.match(/homeDetails:\s*homeDetails\.length\s*\?\s*homeDetails\s*:\s*undefined/g) ?? [];
  expect(matches.length).toBe(2); // telegram + email
});

test('AC6: readBookedHomeDetails scopes via getFactForTask, dedupes, and is server-only fail-soft', () => {
  // Server-only module (imports the service-role client).
  expect(homeRecords).toMatch(/from\s*'@\/lib\/notify\/supabase-rest'/);
  // Task key -> canonical fact via getFactForTask, collected into a Set (dedupe).
  expect(homeRecords).toMatch(/const\s+neededFactKeys\s*=\s*new\s+Set<string>\(\)/);
  expect(homeRecords).toMatch(/getFactForTask\(tk\)/);
  // Intersect with the homeowner's saved rows read server-side.
  expect(homeRecords).toMatch(/await\s+readHomeRecords\(homeownerId\)/);
  expect(homeRecords).toMatch(/neededFactKeys\.has\(fact\.key\)/);
  // Fail-soft guards: no cookie/id or no booked tasks -> [].
  expect(homeRecords).toMatch(/if\s*\(!homeownerId\s*\|\|\s*!bookedTaskKeys\.length\)\s*return\s*\[\]/);
});

test('AC7: factValueSummary is shared from records.ts, not duplicated in the client', () => {
  // Exported once from the pure registry...
  expect(records).toMatch(/export\s+function\s+factValueSummary\(/);
  // ...imported by both the checklist client and the server rider module...
  expect(checklistClient).toMatch(/import\s*\{[^}]*factValueSummary[^}]*\}\s*from\s*'@\/lib\/homecare\/records'/);
  expect(homeRecords).toMatch(/import\s*\{[^}]*factValueSummary[^}]*\}\s*from\s*'@\/lib\/homecare\/records'/);
  // ...and NOT re-defined locally in the client anymore.
  expect(checklistClient).not.toMatch(/function\s+factValueSummary\(/);
});

test('AC8: both renderers add a guarded home-details block with the correct escaper', () => {
  // Telegram: guarded, uses esc() (its &<> escaper).
  const tgWindow = telegram.slice(telegram.indexOf('Home details for this visit'), telegram.indexOf('Home details for this visit') + 220);
  expect(telegram).toMatch(/if\s*\(homeDetails\s*&&\s*homeDetails\.length\s*>\s*0\)/);
  expect(tgWindow).toMatch(/esc\(d\)/);
  // Email payload forwards homeDetails into the HTML template.
  expect(email).toMatch(/homeDetails,/);
  // Template: guarded card built with escapeHtml per item.
  expect(templates).toMatch(/const\s+details\s*=\s*\(data\.homeDetails\s*\?\?\s*\[\]\)\.filter/);
  expect(templates).toMatch(/const\s+homeDetailsCard\s*=\s*details\.length/);
  const cardWindow = templates.slice(templates.indexOf('const homeDetailsCard'), templates.indexOf('const homeDetailsCard') + 1200);
  expect(cardWindow).toMatch(/details\.map\(\(d\)\s*=>[\s\S]*escapeHtml\(d\)/);
  // Rendered into the shell after the services block.
  expect(templates).toMatch(/\$\{servicesCard\}\s*\n\s*\$\{homeDetailsCard\}/);
});

test('AC9: the block is internal-only - never rendered in the customer-facing form', () => {
  // The confirmation/success UI lives in the booking form; it must not reference
  // home details at all (the form only sends task_keys; it never receives them).
  expect(bookingForm).not.toMatch(/Home details for this visit/);
});

test('AC10: no em dashes in the new rider code (per house style)', () => {
  // Scope to the files this slice authored end-to-end; legacy files keep their
  // own history.
  expect(homeRecords).not.toContain('—');
  // The factValueSummary block added to the pure registry.
  const rec = records.slice(records.indexOf('export interface FactValue'), records.indexOf('export interface FactValue') + 900);
  expect(rec).not.toContain('—');
});

/*
 * AC11-AC14: the crew-dispatch rider (added when #88/#89 landed the visit
 * scheduling + crew dispatch flow). The same scoped details that decorate the
 * booking owner-alert now ride the crew dispatch email, because "the crew
 * arrives knowing where things are" is the fact registry's whole purpose.
 * Same security posture: read server-side in the schedule route, scoped to the
 * visit's booked services, rendered into internal mail only - and never into
 * the .ics, which is forwarded and synced to calendars this data must not
 * live on.
 */

test('AC11: crew dispatch email renders the scoped home details, escaped, in html and text', () => {
  const args = {
    recipientName: 'Veronica',
    customerName: 'Rachel',
    customerPhone: '(973) 555-0100',
    address: '14 Maple Ave, Montclair, NJ',
    services: ['Clean gutters & downspouts'],
    visitDateLabel: 'Tuesday, August 11',
    timeWindow: '8:00 - 11:00am',
    confirmUrl: 'https://www.lavacagc.com/crew/confirm/tok',
    calendarUrl: 'https://calendar.google.com/render',
    visitStart: new Date('2026-08-11T12:00:00Z'),
    now: new Date('2026-08-03T12:00:00Z'),
    customerReminder: 'queued' as const,
  };

  const withDetails = buildDispatchEmail({
    ...args,
    homeDetails: ['Water main shut-off: basement, under the <stairs>'],
  });
  expect(withDetails.html).toContain('Home details');
  // Escaped by esc(), so the raw angle brackets never reach the html.
  expect(withDetails.html).toContain('basement, under the &lt;stairs&gt;');
  expect(withDetails.html).not.toContain('under the <stairs>');
  expect(withDetails.text).toContain('Home:     Water main shut-off: basement, under the <stairs>');
  // Sensitive values stay out of the subject (it is visible in list views and
  // notification previews).
  expect(withDetails.subject).not.toContain('basement');

  const without = buildDispatchEmail(args);
  expect(without.html).not.toContain('Home details');
  expect(without.text).not.toContain('Home:     ');
});

test('AC12: home details never reach the calendar invite', () => {
  // buildIcs takes no home-details input at all - the invite is built from the
  // visit facts only, so the sensitive lines cannot leak into a file that syncs
  // to phones and third-party calendars.
  const ics = read('src/lib/homecare/ics.ts');
  expect(ics).not.toMatch(/homeDetails/);
  // And dispatch.ts hands homeDetails to the email builder only.
  const dispatch = read('src/lib/homecare/dispatch.ts');
  const icsCalls = dispatch.split('buildIcs({');
  for (const call of icsCalls.slice(1)) {
    expect(call.slice(0, call.indexOf('})'))).not.toContain('homeDetails');
  }
  expect(dispatch).toMatch(/buildDispatchEmail\(\{[\s\S]{0,400}homeDetails,/);
});

test('AC13: schedule route reads the details server-side, scoped to the booked tasks', () => {
  const schedule = read('src/app/api/admin/service-quote/schedule/route.ts');
  expect(schedule).toMatch(/import\s*\{\s*readBookedHomeDetails\s*\}\s*from\s*'@\/lib\/homecare\/homeRecords'/);
  // Scoped to this visit's task keys, from the server-side homeowner row -
  // never anything client-supplied.
  expect(schedule).toMatch(/readBookedHomeDetails\(homeowner\.id,\s*taskKeys\)/);
  // Threaded into the dispatch send.
  expect(schedule).toMatch(/sendVisitDispatch\(\{[\s\S]{0,700}homeDetails,/);
});

test('AC14: no em dashes in the crew-rider additions (per house style)', () => {
  const dispatchEmail = read('src/lib/homecare/dispatchEmail.ts');
  const block = dispatchEmail.slice(
    dispatchEmail.indexOf('The homeowner\'s saved My Home Systems lines'),
    dispatchEmail.indexOf('confirmUrl: string'),
  );
  expect(block).not.toContain('—');
});
