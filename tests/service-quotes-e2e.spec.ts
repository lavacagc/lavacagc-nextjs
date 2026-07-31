import { test, expect } from '@playwright/test';
import http from 'http';
import {
  ensureServiceHomeowner, scheduleVisit, bookedVisitStarts, requeueVisitReminder, cancelVisitReminder,
} from '../src/lib/homecare/serviceScheduling';
import { visitKey, reminderSendAt } from '../src/lib/homecare/visitSchedule';
import { easternWallClock } from '../src/lib/homecare/ics';

/**
 * Integration test for the service-quote loop against a stubbed Supabase REST.
 *
 * Exercises the REAL scheduling library rather than the HTTP routes: the admin
 * routes are session-gated by middleware, and standing up a Supabase auth
 * session would test the gate rather than the logic. The routes themselves are
 * covered by tests/service-quotes-wiring.spec.ts; this covers what actually
 * happens to the data.
 *
 * Runs unattended in the `node` Playwright project. It stands up its own stub
 * and points the env at it here rather than relying on a run command - a suite
 * that only runs when someone remembers a flag protects nothing. supabase-rest
 * reads its env per call, which is what makes that possible.
 *
 * The tests share one in-memory db and build on each other, so the project runs
 * them serially in a single worker.
 */
const STUB_PORT = 9414;

test.describe.configure({ mode: 'serial' });

/**
 * PostgREST `ilike` semantics, faithfully enough to be worth testing against:
 * `%` and `*` are both wildcards, `_` matches one character, and a backslash
 * escapes the next character - except `*`, which has no escape at all. That last
 * detail is the whole reason the cancel path re-checks the address in JS, so a
 * stub that treated the pattern as a literal would test nothing.
 */
const likeRegex = (pattern: string) => {
  const literal = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let rx = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i];
    if (c === '\\') { rx += literal(pattern[++i] ?? ''); continue; }
    rx += c === '%' || c === '*' ? '.*' : c === '_' ? '.' : literal(c);
  }
  return new RegExp(`^${rx}$`, 'i');
};

interface Row { [k: string]: unknown }
const db: Record<string, Row[]> = {
  homeowners: [], homeowner_maintenance: [], follow_up_queue: [], maintenance_catalog: [],
};

let server: http.Server;

test.beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${STUB_PORT}`;
  process.env.SUPABASE_SECRET_KEY = 'sb-stub-secret';

  db.maintenance_catalog = [
    { key: 'clean_gutters', title: 'Clean gutters & downspouts', bookable: true, active: true, priority: 10 },
  ];

  server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${STUB_PORT}`);
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const table = url.pathname.replace('/rest/v1/', '').split('?')[0];
      const rows = db[table] ?? (db[table] = []);
      const json = (v: unknown, code = 200) => {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(v));
      };
      const applyFilters = (input: Row[]) => {
        let out = [...input];
        for (const [k, v] of url.searchParams) {
          if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
          const [op, ...rest] = v.split('.');
          const val = rest.join('.');
          if (op === 'eq') out = out.filter((r) => String(r[k]) === val);
          if (op === 'ilike') out = out.filter((r) => likeRegex(val).test(String(r[k])));
          if (op === 'in') {
            const wanted = new Set(val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')));
            out = out.filter((r) => wanted.has(String(r[k])));
          }
        }
        return out;
      };

      if (req.method === 'GET') return json(applyFilters(rows));

      if (req.method === 'POST') {
        const arr = JSON.parse(body || '[]') as Row[];
        const onConflict = url.searchParams.get('on_conflict');
        const written: Row[] = [];
        for (const r of arr) {
          if (onConflict) {
            const keys = onConflict.split(',');
            const idx = rows.findIndex((e) => keys.every((k) => String(e[k]) === String(r[k])));
            if (idx >= 0) { rows[idx] = { ...rows[idx], ...r }; written.push(rows[idx]); continue; }
          }
          const created = { id: `${table}-${rows.length + 1}`, ...r };
          rows.push(created);
          written.push(created);
        }
        return json(written, 201);
      }

      if (req.method === 'PATCH') {
        const patch = JSON.parse(body || '{}') as Row;
        const targets = applyFilters(rows);
        for (const t of targets) Object.assign(t, patch);
        return json(targets);
      }
      json([]);
    });
  });
  await new Promise<void>((r) => server.listen(STUB_PORT, r));
});

test.afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });

test('scheduling creates a PENDING homeowner the newsletter can never mail', async () => {
  const owner = await ensureServiceHomeowner({
    email: 'Walkin@Example.com', firstName: 'Walk', address: '14 Maple Ave', city: 'West Orange', zip: '07052',
  });
  expect(owner).toBeTruthy();
  // The guard that matters. The newsletter cron selects status=eq.active, so a
  // pending row is structurally excluded from every send.
  expect(owner!.status).toBe('pending');
  expect(owner!.source).toBe('service_quote');
  expect(owner!.email).toBe('walkin@example.com'); // normalised
  expect(owner!.unsubscribe_token, 'every emailed record needs a working opt-out').toBeTruthy();
  expect(db.homeowners.length).toBe(1);
});

test('an existing ACTIVE member is reused and never downgraded', async () => {
  db.homeowners.push({
    id: 'member-1', email: 'member@example.com', first_name: 'Real', phone: null,
    status: 'active', source: 'home-care', address: null, city: null, zip: '07050',
    unsubscribe_token: 'member-token',
  });
  const owner = await ensureServiceHomeowner({
    email: 'member@example.com', firstName: 'Ignored', address: '9 Elm St', zip: '07999',
  });
  expect(owner!.id).toBe('member-1');
  expect(owner!.status, 'scheduling must not downgrade a real member').toBe('active');
  expect(owner!.source).toBe('home-care');
  // The reminder email's unsubscribe link is built from this. Before it was in
  // the select it came back undefined and the footer linked to token=.
  expect(owner!.unsubscribe_token).toBe('member-token');
  // Blanks are filled...
  expect(owner!.address).toBe('9 Elm St');
  // ...but what they told us themselves is never overwritten.
  const row = db.homeowners.find((h) => h.id === 'member-1')!;
  expect(row.first_name).toBe('Real');
  expect(row.zip).toBe('07050');
  expect(db.homeowners.length, 'no duplicate row').toBe(2);
});

test('scheduling books the tasks with a window and an address', async () => {
  const start = new Date(Date.now() + 36 * 3600_000);
  const end = new Date(start.getTime() + 3 * 3600_000);
  await scheduleVisit({
    homeownerId: 'member-1', taskKeys: ['clean_gutters'], season: 'fall',
    start, end, address: '9 Elm St, Montclair, NJ',
  });
  const booked = db.homeowner_maintenance.filter((m) => m.status === 'booked');
  expect(booked.length).toBe(1);
  expect(booked[0].scheduled_start).toBe(start.toISOString());
  expect(booked[0].scheduled_end).toBe(end.toISOString());
  expect(booked[0].service_address).toBe('9 Elm St, Montclair, NJ');
});

test('rescheduling updates in place rather than duplicating the booking', async () => {
  const start = new Date(Date.now() + 60 * 3600_000);
  const end = new Date(start.getTime() + 2 * 3600_000);
  // Read BEFORE the upsert overwrites it - this is what the schedule route
  // hands to requeueVisitReminder so it pulls the right visit's reminder.
  const previous = await bookedVisitStarts({
    homeownerId: 'member-1', taskKeys: ['clean_gutters'], season: 'fall',
  });
  expect(previous.length, 'the window this booking replaces').toBe(1);

  await scheduleVisit({
    homeownerId: 'member-1', taskKeys: ['clean_gutters'], season: 'fall',
    start, end, address: '9 Elm St, Montclair, NJ',
  });
  const rows = db.homeowner_maintenance.filter((m) => m.task_key === 'clean_gutters' && m.season === 'fall');
  expect(rows.length, 'one row, updated in place').toBe(1);
  expect(rows[0].scheduled_start).toBe(start.toISOString());
});

const MEMBER_VISIT = new Date(Date.now() + 48 * 3600_000);
const MEMBER_VISIT_MOVED = new Date(Date.now() + 96 * 3600_000);

test('a requeued reminder cancels the superseded one first', async () => {
  const first = await requeueVisitReminder({
    email: 'member@example.com', name: 'Real', start: MEMBER_VISIT, subject: 'S1', html: '<p>1</p>',
  });
  expect(first).toBe('queued');
  expect(db.follow_up_queue.filter((q) => q.status === 'pending').length).toBe(1);

  const second = await requeueVisitReminder({
    email: 'member@example.com', name: 'Real', start: MEMBER_VISIT_MOVED,
    subject: 'S2', html: '<p>2</p>', supersedes: [MEMBER_VISIT],
  });
  expect(second).toBe('queued');
  const pending = db.follow_up_queue.filter((q) => q.status === 'pending');
  expect(pending.length, 'still exactly one pending reminder').toBe(1);
  expect(pending[0].email_subject).toBe('S2');
  expect(db.follow_up_queue.filter((q) => q.status === 'cancelled').length).toBe(1);
});

/* Two visits for one customer: the case that made an address-scoped cancel wrong. */
const GUTTERS = new Date(Date.now() + 5 * 24 * 3600_000);
const GUTTERS_MOVED = new Date(Date.now() + 6 * 24 * 3600_000);
const FURNACE = new Date(Date.now() + 20 * 24 * 3600_000);
const pendingFor = (email: string) =>
  db.follow_up_queue.filter((q) => q.lead_email === email && q.status === 'pending');

test('moving one visit leaves another visit\'s reminder standing', async () => {
  for (const [start, subject] of [[GUTTERS, 'Gutters'], [FURNACE, 'Furnace']] as const) {
    await requeueVisitReminder({ email: 'two@example.com', name: 'Two', start, subject, html: `<p>${subject}</p>` });
  }
  expect(pendingFor('two@example.com').length, 'one reminder per visit').toBe(2);

  await requeueVisitReminder({
    email: 'two@example.com', name: 'Two', start: GUTTERS_MOVED,
    subject: 'Gutters moved', html: '<p>moved</p>', supersedes: [GUTTERS],
  });
  expect(pendingFor('two@example.com').map((q) => q.email_subject).sort())
    .toEqual(['Furnace', 'Gutters moved']);
  // And the superseded one is the only casualty.
  expect(db.follow_up_queue.filter((q) => q.lead_email === 'two@example.com' && q.status === 'cancelled').length).toBe(1);
});

test('a visit in the past never earns a reminder', async () => {
  const result = await requeueVisitReminder({
    email: 'past@example.com', name: 'Past', start: new Date(Date.now() - 3600_000),
    subject: 'S', html: '<p>x</p>',
  });
  expect(result).toBe('skipped');
  expect(pendingFor('past@example.com').length).toBe(0);
});

test('cancelling a visit pulls its reminder and only its reminder', async () => {
  // Completing the moved gutters job must not silently drop the furnace visit.
  await cancelVisitReminder('two@example.com', GUTTERS_MOVED);
  expect(pendingFor('two@example.com').map((q) => q.email_subject)).toEqual(['Furnace']);

  await cancelVisitReminder('member@example.com', MEMBER_VISIT_MOVED);
  expect(pendingFor('member@example.com').length).toBe(0);
});

test('the reminder row is keyed on the visit the cron claims against', async () => {
  const row = db.follow_up_queue.find((q) => q.email_subject === 'Furnace')!;
  expect(row.follow_up_type).toBe('visit_reminder_1d');
  // The visit it belongs to...
  expect(row.visit_start).toBe(visitKey(FURNACE));
  // ...and, separately, when it goes out.
  expect(row.scheduled_at).toBe(reminderSendAt(FURNACE).toISOString());
});

/* Two visits on the SAME Eastern date - the case a day-granular slot could not
   tell apart. Both reminders go out the same evening, so the send time is
   identical and only the visit distinguishes them. */
const nextWeek = new Date(Date.now() + 8 * 24 * 3600_000);
const sameDay = (hour: number) =>
  easternWallClock(new Date(Date.UTC(nextWeek.getUTCFullYear(), nextWeek.getUTCMonth(), nextWeek.getUTCDate())), hour, 0);
const MORNING = sameDay(8);
const AFTERNOON = sameDay(13);

test('two visits on one day keep separate reminders', async () => {
  expect(reminderSendAt(MORNING).toISOString(), 'one send time for both')
    .toBe(reminderSendAt(AFTERNOON).toISOString());

  for (const [start, subject] of [[MORNING, 'Gutters 8am'], [AFTERNOON, 'Dryer vent 1pm']] as const) {
    await requeueVisitReminder({ email: 'busy@example.com', name: 'Busy', start, subject, html: `<p>${subject}</p>` });
  }
  // Booking the second must not have pulled the first: this is the bug a slot
  // keyed on the shared 7:30pm send time produced.
  expect(pendingFor('busy@example.com').map((q) => q.email_subject).sort())
    .toEqual(['Dryer vent 1pm', 'Gutters 8am']);
  expect(pendingFor('busy@example.com').map((q) => q.visit_start).sort())
    .toEqual([visitKey(MORNING), visitKey(AFTERNOON)].sort());
});

test('completing the morning visit leaves the afternoon one reminded', async () => {
  await cancelVisitReminder('busy@example.com', MORNING);
  expect(pendingFor('busy@example.com').map((q) => q.email_subject)).toEqual(['Dryer vent 1pm']);
});

test('a cancel cannot reach another address through a wildcard', async () => {
  // PostgREST reads `*` as an alias for `%` with no way to escape it, so the
  // ilike prefilter alone would match every address at this visit.
  await cancelVisitReminder('*', AFTERNOON);
  expect(pendingFor('busy@example.com').map((q) => q.email_subject)).toEqual(['Dryer vent 1pm']);
  // The real address still cancels its own.
  await cancelVisitReminder('BUSY@example.com', AFTERNOON);
  expect(pendingFor('busy@example.com')).toEqual([]);
});
