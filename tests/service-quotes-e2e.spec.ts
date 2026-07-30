import { test, expect } from '@playwright/test';
import http from 'http';
import {
  ensureServiceHomeowner, scheduleVisit, requeueVisitReminder, cancelVisitReminder,
} from '../src/lib/homecare/serviceScheduling';

/**
 * Integration test for the service-quote loop against a stubbed Supabase REST.
 *
 * Exercises the REAL scheduling library rather than the HTTP routes: the admin
 * routes are session-gated by middleware, and standing up a Supabase auth
 * session would test the gate rather than the logic. The routes themselves are
 * covered by tests/service-quotes-wiring.spec.ts; this covers what actually
 * happens to the data.
 *
 * supabase-rest reads its URL at module scope, so the env must be set by the
 * RUN COMMAND, not inside the test. Skipped unless SQ_E2E=1:
 *
 *   SQ_E2E=1 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9414 \
 *   SUPABASE_SECRET_KEY=sb-stub-secret \
 *   npx playwright test tests/service-quotes-e2e.spec.ts --workers=1
 */
const STUB_PORT = 9414;

interface Row { [k: string]: unknown }
const db: Record<string, Row[]> = {
  homeowners: [], homeowner_maintenance: [], follow_up_queue: [], maintenance_catalog: [],
};

let server: http.Server;

test.skip(!process.env.SQ_E2E, 'set SQ_E2E=1 with NEXT_PUBLIC_SUPABASE_URL pointed at the stub');

test.beforeAll(async () => {
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
          if (op === 'ilike') out = out.filter((r) => String(r[k]).toLowerCase() === val.toLowerCase().replace(/\\/g, ''));
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
  expect(db.homeowners.length).toBe(1);
});

test('an existing ACTIVE member is reused and never downgraded', async () => {
  db.homeowners.push({
    id: 'member-1', email: 'member@example.com', first_name: 'Real', phone: null,
    status: 'active', source: 'home-care', address: null, city: null, zip: '07050',
  });
  const owner = await ensureServiceHomeowner({
    email: 'member@example.com', firstName: 'Ignored', address: '9 Elm St', zip: '07999',
  });
  expect(owner!.id).toBe('member-1');
  expect(owner!.status, 'scheduling must not downgrade a real member').toBe('active');
  expect(owner!.source).toBe('home-care');
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
  await scheduleVisit({
    homeownerId: 'member-1', taskKeys: ['clean_gutters'], season: 'fall',
    start, end, address: '9 Elm St, Montclair, NJ',
  });
  const rows = db.homeowner_maintenance.filter((m) => m.task_key === 'clean_gutters' && m.season === 'fall');
  expect(rows.length, 'one row, updated in place').toBe(1);
  expect(rows[0].scheduled_start).toBe(start.toISOString());
});

test('a requeued reminder cancels the superseded one first', async () => {
  const start = new Date(Date.now() + 48 * 3600_000);
  const first = await requeueVisitReminder({
    email: 'member@example.com', name: 'Real', start, subject: 'S1', html: '<p>1</p>',
  });
  expect(first).toBe('queued');
  expect(db.follow_up_queue.filter((q) => q.status === 'pending').length).toBe(1);

  const moved = new Date(Date.now() + 96 * 3600_000);
  const second = await requeueVisitReminder({
    email: 'member@example.com', name: 'Real', start: moved, subject: 'S2', html: '<p>2</p>',
  });
  expect(second).toBe('queued');
  const pending = db.follow_up_queue.filter((q) => q.status === 'pending');
  expect(pending.length, 'still exactly one pending reminder').toBe(1);
  expect(pending[0].email_subject).toBe('S2');
  expect(db.follow_up_queue.filter((q) => q.status === 'cancelled').length).toBe(1);
});

test('a visit in the past never earns a reminder', async () => {
  const result = await requeueVisitReminder({
    email: 'past@example.com', name: 'Past', start: new Date(Date.now() - 3600_000),
    subject: 'S', html: '<p>x</p>',
  });
  expect(result).toBe('skipped');
  expect(db.follow_up_queue.filter((q) => q.lead_email === 'past@example.com' && q.status === 'pending').length).toBe(0);
});

test('cancelling a visit pulls its pending reminder', async () => {
  await cancelVisitReminder('member@example.com');
  expect(db.follow_up_queue.filter((q) => q.lead_email === 'member@example.com' && q.status === 'pending').length).toBe(0);
});
