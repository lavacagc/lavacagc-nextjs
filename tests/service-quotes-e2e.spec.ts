import { test, expect } from '@playwright/test';
import http from 'http';
import {
  ensureServiceHomeowner, scheduleVisit, bookedVisitRows, orphanedVisitStarts, supersededBookings,
  clearSupersededBookings, requeueVisitReminder, cancelVisitReminder,
} from '../src/lib/homecare/serviceScheduling';
import { visitKey, reminderSendAt } from '../src/lib/homecare/visitSchedule';
import { easternWallClock } from '../src/lib/homecare/ics';
import { supabaseRest } from '../src/lib/notify/supabase-rest';

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

/**
 * Simulates a follow_up_queue whose hand-applied migrations have not landed:
 * PostgREST answers an unknown column with a 400, which is what the queue insert
 * must survive rather than turning a successful booking into a 500.
 */
let preMigrationQueue = false;

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
          // Postgres compares a timestamp column by INSTANT, not by spelling, so
          // `eq.2026-09-05T12:00:00.000Z` matches a row stored as
          // "...+00:00". Only string equality in JS would not.
          if (op === 'eq') {
            const wantedAt = new Date(val).getTime();
            out = out.filter((r) => {
              if (String(r[k]) === val) return true;
              if (Number.isNaN(wantedAt) || typeof r[k] !== 'string') return false;
              return new Date(r[k] as string).getTime() === wantedAt;
            });
          }
          if (op === 'ilike') out = out.filter((r) => likeRegex(val).test(String(r[k])));
          // `col=not.is.null` - the one negation these queries use, and the
          // filter that says "this row carries a visit window".
          if (op === 'not' && val === 'is.null') out = out.filter((r) => r[k] !== null && r[k] !== undefined);
          if (op === 'in') {
            const wanted = new Set(val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')));
            out = out.filter((r) => wanted.has(String(r[k])));
          }
        }
        return out;
      };

      // PostgREST renders `timestamptz` the way Postgres does, NOT the way
      // `Date#toISOString()` does: "2026-09-05T12:00:00+00:00", not
      // "2026-09-05T12:00:00.000Z". Same instant, two spellings - and a stub
      // that echoed back whatever JS wrote would hide every place the code
      // compares one against the other as a string.
      const TIMESTAMPS = ['scheduled_start', 'scheduled_end', 'scheduled_at', 'visit_start', 'created_at', 'sent_at'];
      const asPostgrest = (row: Row): Row => {
        const out: Row = { ...row };
        for (const col of TIMESTAMPS) {
          const v = out[col];
          if (typeof v !== 'string') continue;
          const at = new Date(v);
          // Same instant, Postgres spelling: the offset written out, and a
          // whole-second fraction dropped rather than rendered as ".000".
          if (!Number.isNaN(at.getTime())) {
            out[col] = at.toISOString().replace(/\.000Z$/, 'Z').replace(/Z$/, '+00:00');
          }
        }
        return out;
      };

      if (req.method === 'GET') return json(applyFilters(rows).map(asPostgrest));

      if (req.method === 'POST') {
        // PostgREST takes a bare object or an array; the checklist toggle sends
        // one row, the scheduling writes send several.
        const payload = JSON.parse(body || '[]') as Row | Row[];
        const arr = Array.isArray(payload) ? payload : [payload];
        if (preMigrationQueue && table === 'follow_up_queue' && arr.some((r) => 'visit_start' in r)) {
          return json({ code: '42703', message: 'column "visit_start" of relation "follow_up_queue" does not exist' }, 400);
        }
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
    homeownerId: 'member-1', tasks: [{ taskKey: 'clean_gutters', season: 'fall' }],
    start, end, address: '9 Elm St, Montclair, NJ',
  });
  const booked = db.homeowner_maintenance.filter((m) => m.status === 'booked');
  expect(booked.length).toBe(1);
  expect(booked[0].scheduled_start).toBe(start.toISOString());
  expect(booked[0].scheduled_end).toBe(end.toISOString());
  expect(booked[0].service_address).toBe('9 Elm St, Montclair, NJ');
});

test('CP2: booking clears a previous La Vaca completion off the row', async () => {
  // Otherwise the attribution is sticky: the member ticks the re-booked task
  // themselves and the portal still reads "Completed by La Vaca".
  const gutters = () => db.homeowner_maintenance.find((m) => m.task_key === 'clean_gutters')!;
  Object.assign(gutters(), { status: 'done', completed_by: 'lavaca', completed_at: new Date().toISOString() });

  const start = new Date(Date.now() + 40 * 3600_000);
  await scheduleVisit({
    homeownerId: 'member-1', tasks: [{ taskKey: 'clean_gutters', season: 'fall' }],
    start, end: new Date(start.getTime() + 2 * 3600_000), address: '9 Elm St, Montclair, NJ',
  });
  expect(gutters().status).toBe('booked');
  expect(gutters().completed_by, 'a booking is not a completion').toBe('homeowner');
  expect(gutters().completed_at).toBe(null);
});

/** Exactly what the schedule route does, in the order it does it. */
const rebook = async (homeownerId: string, tasks: { taskKey: string; season: string }[], start: Date) => {
  const previous = await bookedVisitRows(homeownerId);
  const superseded = supersededBookings({ previous, taskKeys: tasks.map((t) => t.taskKey), start });
  const supersedes = orphanedVisitStarts({ previous, superseded });
  await clearSupersededBookings({ homeownerId, rows: superseded });
  await scheduleVisit({
    homeownerId, tasks, start, end: new Date(start.getTime() + 2 * 3600_000), address: '9 Elm St, Montclair, NJ',
  });
  return supersedes;
};

test('SC6: rescheduling updates in place rather than duplicating the booking', async () => {
  const start = new Date(Date.now() + 60 * 3600_000);
  const supersedes = await rebook('member-1', [{ taskKey: 'clean_gutters', season: 'fall' }], start);
  expect(supersedes.length, 'the window this booking replaces').toBe(1);

  const rows = db.homeowner_maintenance.filter((m) => m.task_key === 'clean_gutters' && m.season === 'fall');
  expect(rows.length, 'one row, updated in place').toBe(1);
  expect(rows[0].scheduled_start).toBe(start.toISOString());
});

test('SC9: moving a visit across a season boundary leaves no phantom booking', async () => {
  // The season comes from the visit date reconciled against the task's own
  // catalog seasons, so a reschedule can land the booking on a DIFFERENT row.
  // The upsert alone would never touch the old one: it would keep its window,
  // so the portal would show a visit that is not happening and the cron would
  // send "we're coming tomorrow" for a slot nobody attends.
  //
  // No handshake: ONE booking per service, so whatever window the task was
  // already holding is by definition the one this call moves.
  const septStart = new Date(Date.now() + 30 * 24 * 3600_000);
  await scheduleVisit({
    homeownerId: 'member-1', tasks: [{ taskKey: 'chimney_inspect', season: 'fall' }],
    start: septStart, end: new Date(septStart.getTime() + 2 * 3600_000), address: '9 Elm St',
  });

  const augStart = new Date(Date.now() + 20 * 24 * 3600_000);
  const supersedes = await rebook('member-1', [{ taskKey: 'chimney_inspect', season: 'summer' }], augStart);
  // The window compared as an INSTANT. PostgREST hands the row back spelled
  // "+00:00" and the booking is a `Date`; string equality matches neither, which
  // is how a supersede fix can pass every stub test and do nothing in prod.
  expect(supersedes.map((d) => d.toISOString()), 'the reminder to pull')
    .toEqual([septStart.toISOString()]);

  const chimney = db.homeowner_maintenance.filter((m) => m.task_key === 'chimney_inspect');
  expect(chimney.map((m) => [m.season, m.status]).sort())
    .toEqual([['fall', 'todo'], ['summer', 'booked']]);
  const stale = chimney.find((m) => m.season === 'fall')!;
  expect(stale.scheduled_start, 'the phantom window is cleared').toBe(null);
});

test('SC12: moving one service off a shared window leaves the rest of the visit booked', async () => {
  // Gutters and a dryer vent booked into one 5 Aug window, then the gutters move
  // to the 12th. The 5 Aug visit is still happening for the dryer vent, so its
  // row keeps its window - and, the part that bites, its reminder is NOT pulled:
  // a window is shared by every task booked into it.
  const shared = new Date(Date.now() + 9 * 24 * 3600_000);
  const movedTo = new Date(Date.now() + 16 * 24 * 3600_000);
  await scheduleVisit({
    homeownerId: 'shared',
    tasks: [{ taskKey: 'clean_gutters', season: 'fall' }, { taskKey: 'clean_dryer_vent', season: 'fall' }],
    start: shared, end: new Date(shared.getTime() + 3 * 3600_000), address: '3 Birch Rd',
  });

  const supersedes = await rebook('shared', [{ taskKey: 'clean_gutters', season: 'fall' }], movedTo);
  expect(supersedes, 'the shared window is still a visit, so no reminder is pulled').toEqual([]);

  expect(db.homeowner_maintenance
    .filter((m) => m.homeowner_id === 'shared')
    .map((m) => [m.task_key, m.status, m.scheduled_start]).sort())
    .toEqual([
      ['clean_dryer_vent', 'booked', shared.toISOString()],
      ['clean_gutters', 'booked', movedTo.toISOString()],
    ]);
});

test('SC11: a member ticking a booked task leaves the visit on the books', async () => {
  // The checkbox and the booking share one row and one `status` column. The
  // member's write owns status/completed_at/completed_by and nothing else, so
  // the WINDOW - which is what every reader treats as "a visit is coming" -
  // survives it. Filed under status, the visit card would vanish and the cron
  // would skip a job the owner's calendar still holds.
  const start = new Date(Date.now() + 3 * 24 * 3600_000);
  await scheduleVisit({
    homeownerId: 'ticker', tasks: [{ taskKey: 'clean_gutters', season: 'fall' }],
    start, end: new Date(start.getTime() + 3 * 3600_000), address: '1 Oak Ln',
  });

  // Exactly the body /api/home-care/task writes, through the same
  // merge-duplicates upsert.
  const now = new Date().toISOString();
  await supabaseRest('POST', 'homeowner_maintenance?on_conflict=homeowner_id,task_key,season', {
    homeowner_id: 'ticker', task_key: 'clean_gutters', season: 'fall',
    status: 'done', completed_at: now, completed_by: 'homeowner', updated_at: now,
  }, { prefer: 'resolution=merge-duplicates,return=minimal' });

  const row = db.homeowner_maintenance.find((m) => m.homeowner_id === 'ticker')!;
  expect(row.status, 'their completion is recorded').toBe('done');
  expect(row.completed_by).toBe('homeowner');
  expect(row.scheduled_start, 'and the booking is untouched').toBe(start.toISOString());
  // Still a visit as far as the reschedule read is concerned.
  expect((await bookedVisitRows('ticker')).map((r) => new Date(r.scheduled_start!).toISOString()))
    .toEqual([start.toISOString()]);
});

test('SC13: rescheduling that visit leaves the member\'s own tick standing', async () => {
  // The other half of SC11, and the direction that was still broken: their
  // checkbox does not clear the window, but the booking cleared their
  // completion - two statements after clearSupersededBookings narrows its own
  // PATCH with status=eq.booked precisely so their 'done' survives it.
  const moved = new Date(Date.now() + 5 * 24 * 3600_000);
  await rebook('ticker', [{ taskKey: 'clean_gutters', season: 'fall' }], moved);

  const row = db.homeowner_maintenance.find((m) => m.homeowner_id === 'ticker')!;
  expect(row.status, 'their completion survives the move').toBe('done');
  expect(row.completed_by).toBe('homeowner');
  expect(row.completed_at, 'and keeps its date').toBeTruthy();
  expect(row.scheduled_start, 'while the visit itself moves').toBe(moved.toISOString());
});

test('SC13: a booking still retakes a row La Vaca completed', async () => {
  // The exception CP2 exists for, and the reason this is not "preserve every
  // completion": left in place, `completed_by='lavaca'` labels whoever ticks
  // the row next as work we did, AND makes mark-complete treat the new visit as
  // already handled - which would leave its window on the books for good.
  const start = new Date(Date.now() + 7 * 24 * 3600_000);
  await scheduleVisit({
    homeownerId: 'ours', tasks: [{ taskKey: 'clean_gutters', season: 'fall' }],
    start, end: new Date(start.getTime() + 2 * 3600_000), address: '5 Cedar St',
  });
  const row = () => db.homeowner_maintenance.find((m) => m.homeowner_id === 'ours')!;
  Object.assign(row(), { status: 'done', completed_by: 'lavaca', completed_at: new Date().toISOString() });

  const again = new Date(Date.now() + 14 * 24 * 3600_000);
  await rebook('ours', [{ taskKey: 'clean_gutters', season: 'fall' }], again);
  expect(row().status).toBe('booked');
  expect(row().completed_by).toBe('homeowner');
  expect(row().completed_at).toBe(null);
});

test('a failed booking read refuses the booking instead of guessing', async () => {
  // `[]` from this read does not mean "no read" - it means "this customer holds
  // no bookings", the one answer that makes the caller clear nothing and cancel
  // nothing. Swallowed, a cross-season move would write the new row, leave the
  // old one holding its window forever and still answer 200.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${STUB_PORT + 1}`;
  try {
    await expect(bookedVisitRows('member-1')).rejects.toThrow();
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  }
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

test('RM12: a visit whose 7:30pm slot has gone is skipped, not queued', async () => {
  // The visit is still hours away, but the run that would have carried its
  // reminder fired before the booking existed. Queueing anyway leaves a row
  // pending forever while the admin is told a reminder is on its way.
  const visit = easternWallClock(new Date(Date.UTC(2026, 7, 5)), 8, 0);
  const bookedLateTheNightBefore = easternWallClock(new Date(Date.UTC(2026, 7, 4)), 23, 0);
  const result = await requeueVisitReminder({
    email: 'latebooking@example.com', name: 'Late', start: visit,
    subject: 'S', html: '<p>x</p>', now: bookedLateTheNightBefore,
  });
  expect(result).toBe('skipped');
  expect(pendingFor('latebooking@example.com').length).toBe(0);

  // Booked before the slot, it still queues.
  const queued = await requeueVisitReminder({
    email: 'latebooking@example.com', name: 'Late', start: visit,
    subject: 'S', html: '<p>x</p>',
    now: easternWallClock(new Date(Date.UTC(2026, 7, 4)), 15, 0),
  });
  expect(queued).toBe('queued');
  expect(pendingFor('latebooking@example.com').length).toBe(1);
});

test('RM13: a queue schema behind the deploy fails the reminder, not the booking', async () => {
  // 20260816/20260817 are hand-applied like every migration here. Until they
  // land the insert 400s - and a booking that in fact succeeded must not be
  // reported to the admin as a failure.
  preMigrationQueue = true;
  try {
    const result = await requeueVisitReminder({
      email: 'nomigration@example.com', name: 'No Migration',
      start: new Date(Date.now() + 5 * 24 * 3600_000), subject: 'S', html: '<p>x</p>',
    });
    expect(result, 'reported, not thrown').toBe('unavailable');
    expect(pendingFor('nomigration@example.com')).toEqual([]);
  } finally {
    preMigrationQueue = false;
  }
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
