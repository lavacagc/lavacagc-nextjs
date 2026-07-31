import { test, expect } from '@playwright/test';
import http from 'http';
import {
  ensureServiceHomeowner, scheduleVisit, bookedVisitRows, orphanedVisitStarts, supersededBookings,
  crossSeasonBookings, requeueVisitReminder, cancelVisitReminder,
} from '../src/lib/homecare/serviceScheduling';
import { lastDoneFor, lastDoneLabel, type CompletionRow } from '../src/lib/homecare/serviceIntake';
import { visitKey, reminderSendAt } from '../src/lib/homecare/visitSchedule';
import {
  clearVisitDispatch, dispatchStateOf, assignmentsForDispatch, ensureAssignments,
  type DispatchRecipient,
} from '../src/lib/homecare/dispatch';
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
  visit_dispatch: [], visit_dispatch_recipients: [],
};

let server: http.Server;

/**
 * Simulates a follow_up_queue whose hand-applied migrations have not landed:
 * PostgREST answers an unknown column with a 400, which is what the queue insert
 * must survive rather than turning a successful booking into a 500.
 */
let preMigrationQueue = false;

/**
 * Makes every PATCH against one table fail the way a real one can - a revoked
 * grant, a CHECK the hand-applied migration has not widened yet.
 *
 * Without it, "the caller reports success even though the write failed" is a
 * bug that can only be reasoned about. With it, it fails a test.
 */
let failPatchOn: string | null = null;

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
        if (failPatchOn === table) {
          return json({ code: '42501', message: `permission denied for table ${table}` }, 403);
        }
        const patch = JSON.parse(body || '{}') as Row;
        const targets = applyFilters(rows);
        for (const t of targets) Object.assign(t, patch);
        return json(targets);
      }

      // Filtered delete, as PostgREST does it - and the cascade with it, which
      // is the whole reason the dispatch's recipients have to be read first.
      if (req.method === 'DELETE') {
        const doomed = new Set(applyFilters(rows));
        const removed = rows.filter((r) => doomed.has(r));
        db[table] = rows.filter((r) => !doomed.has(r));
        if (table === 'visit_dispatch') {
          const ids = new Set(removed.map((r) => String(r.id)));
          db.visit_dispatch_recipients = (db.visit_dispatch_recipients ?? [])
            .filter((r) => !ids.has(String(r.dispatch_id)));
        }
        return json(removed.map(asPostgrest));
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

test('CP2+SC16: booking retakes the status of a La Vaca completion, and the tick retakes the label', async () => {
  // The attribution must not be sticky - the member ticks the re-booked task
  // themselves and the portal must stop reading "Completed by La Vaca" - but it
  // is the TICK that owns that, not the booking. A booking clearing the record
  // took an invoiced visit out of the service history (SC16); what actually
  // keeps the label honest is the status going to 'booked' (no label renders on
  // a row that is not done) and the member's own write reassigning the row.
  const gutters = () => db.homeowner_maintenance.find((m) => m.task_key === 'clean_gutters')!;
  const performed = new Date().toISOString();
  Object.assign(gutters(), { status: 'done', completed_by: 'lavaca', completed_at: performed });

  const start = new Date(Date.now() + 40 * 3600_000);
  await scheduleVisit({
    homeownerId: 'member-1', tasks: [{ taskKey: 'clean_gutters', season: 'fall' }],
    start, end: new Date(start.getTime() + 2 * 3600_000), address: '9 Elm St, Montclair, NJ',
  });
  expect(gutters().status).toBe('booked');
  expect(gutters().completed_by, 'the record of the last job stands').toBe('lavaca');
  expect(gutters().completed_at).toBe(performed);

  // Exactly the body /api/home-care/task writes on a tick.
  const now = new Date().toISOString();
  await supabaseRest('POST', 'homeowner_maintenance?on_conflict=homeowner_id,task_key,season', {
    homeowner_id: 'member-1', task_key: 'clean_gutters', season: 'fall',
    status: 'done', completed_at: now, completed_by: 'homeowner', updated_at: now,
  }, { prefer: 'resolution=merge-duplicates,return=minimal' });
  expect(gutters().completed_by, 'and their own tick is theirs').toBe('homeowner');
});

/**
 * Exactly what the schedule route does, in the order it does it - including the
 * cross-season refusal, which throws here the way the route answers 409.
 */
const rebook = async (homeownerId: string, tasks: { taskKey: string; season: string }[], start: Date) => {
  const previous = await bookedVisitRows(homeownerId);
  const conflicts = crossSeasonBookings({ previous, tasks });
  if (conflicts.length > 0) {
    throw new Error(`Already on the books for a different season: ${conflicts.map((r) => r.task_key).join(', ')}`);
  }
  const superseded = supersededBookings({ previous, tasks, start });
  const supersedes = orphanedVisitStarts({ previous, superseded });
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

test('SC15: booking a service into a second season is refused, and writes nothing', async () => {
  // A booking is keyed on (task, season), so a second season is a second row and
  // neither disturbs the other. That is right for the case it was written for -
  // `clean_gutters` is a fall AND a spring task - but the season is reconciled
  // from the visit DATE, and for a two-season service it flips on 1 Jun and
  // 1 Dec. So a seven-day slip from 25 Nov to 3 Dec files a second row while the
  // fall row keeps 25 Nov: "we're coming tomorrow" the night before a visit that
  // moved, and a portal card for it until it passes.
  //
  // Telling that from a deliberate second booking is not knowable from here, and
  // guessing at it is what the `replaces` handshake cost three defects to learn.
  // So it is refused and the admin decides: Cancel visit, then book.
  const octStart = new Date(Date.now() + 30 * 24 * 3600_000);
  await scheduleVisit({
    homeownerId: 'seasons', tasks: [{ taskKey: 'clean_gutters', season: 'fall' }],
    start: octStart, end: new Date(octStart.getTime() + 2 * 3600_000), address: '9 Elm St',
  });

  const aprStart = new Date(Date.now() + 250 * 24 * 3600_000);
  await expect(
    rebook('seasons', [{ taskKey: 'clean_gutters', season: 'spring' }], aprStart),
  ).rejects.toThrow(/different season/);

  // Refused before anything is written: the fall visit stands untouched, and
  // there is no spring row for the member's portal to show or the cron to read.
  expect(db.homeowner_maintenance.filter((m) => m.homeowner_id === 'seasons')
    .map((m) => [m.season, m.status, m.scheduled_start]))
    .toEqual([['fall', 'booked', octStart.toISOString()]]);

  // And once that visit is off the books, the same booking goes through.
  db.homeowner_maintenance
    .filter((m) => m.homeowner_id === 'seasons')
    .forEach((m) => { m.scheduled_start = null; m.scheduled_end = null; m.status = 'todo'; });
  const supersedes = await rebook('seasons', [{ taskKey: 'clean_gutters', season: 'spring' }], aprStart);
  expect(supersedes, 'nothing to retire - the fall window was already cancelled').toEqual([]);
  expect(db.homeowner_maintenance.find((m) => m.homeowner_id === 'seasons' && m.season === 'spring')?.scheduled_start)
    .toBe(aprStart.toISOString());
});

test('SC10: rescheduling WITHIN the season moves the row and retires its window', async () => {
  // The case the upsert does reach, and the only one a booking supersedes. The
  // window compared as an INSTANT: PostgREST hands the row back spelled "+00:00"
  // and the booking is a `Date`, so string equality matches neither - which is
  // how a supersede fix can pass every stub test and do nothing in prod.
  const first = new Date(Date.now() + 30 * 24 * 3600_000);
  await scheduleVisit({
    homeownerId: 'inseason', tasks: [{ taskKey: 'chimney_inspect', season: 'fall' }],
    start: first, end: new Date(first.getTime() + 2 * 3600_000), address: '9 Elm St',
  });

  const moved = new Date(Date.now() + 37 * 24 * 3600_000);
  const supersedes = await rebook('inseason', [{ taskKey: 'chimney_inspect', season: 'fall' }], moved);
  expect(supersedes.map((d) => d.toISOString()), 'the reminder to pull')
    .toEqual([first.toISOString()]);

  const rows = db.homeowner_maintenance.filter((m) => m.homeowner_id === 'inseason');
  expect(rows.length, 'one row, updated in place').toBe(1);
  expect(rows[0].scheduled_start).toBe(moved.toISOString());
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
  // completion - the same narrowing the cancel route makes with status=eq.booked
  // precisely so their 'done' survives being unbooked.
  const moved = new Date(Date.now() + 5 * 24 * 3600_000);
  await rebook('ticker', [{ taskKey: 'clean_gutters', season: 'fall' }], moved);

  const row = db.homeowner_maintenance.find((m) => m.homeowner_id === 'ticker')!;
  expect(row.status, 'their completion survives the move').toBe('done');
  expect(row.completed_by).toBe('homeowner');
  expect(row.completed_at, 'and keeps its date').toBeTruthy();
  expect(row.scheduled_start, 'while the visit itself moves').toBe(moved.toISOString());
});

test('SC13+SC16: a booking retakes the STATUS of a row La Vaca completed, not the record', async () => {
  // The status has to be retaken: left reading 'done' by us it labels whoever
  // ticks the row next as our work, and mark-complete treats the new visit as
  // already handled, so its window never comes off the books.
  // The record must NOT be, and that is the whole of SC16 - `completed_at` is
  // what IN4 reads to tell the next quote "last done Oct 2026 by La Vaca", and
  // booking the job again is not us saying it never happened.
  const start = new Date(Date.now() + 7 * 24 * 3600_000);
  await scheduleVisit({
    homeownerId: 'ours', tasks: [{ taskKey: 'clean_gutters', season: 'fall' }],
    start, end: new Date(start.getTime() + 2 * 3600_000), address: '5 Cedar St',
  });
  const row = () => db.homeowner_maintenance.find((m) => m.homeowner_id === 'ours')!;
  const performed = new Date().toISOString();
  Object.assign(row(), { status: 'done', completed_by: 'lavaca', completed_at: performed });

  const again = new Date(Date.now() + 14 * 24 * 3600_000);
  await rebook('ours', [{ taskKey: 'clean_gutters', season: 'fall' }], again);
  expect(row().status).toBe('booked');
  expect(row().completed_by, 'the record of who did it stands').toBe('lavaca');
  expect(row().completed_at, 'and so does when').toBe(performed);
  expect(lastDoneFor([row() as unknown as CompletionRow]).get('clean_gutters')?.by).toBe('lavaca');
});

test('SC16: booking the redo a member asked for keeps the invoiced visit in the history', async () => {
  // The reachable flow, and the one the completion email invites: La Vaca does
  // the gutters, the member unticks them ("this needs doing again"), the admin
  // books the redo. CP10 leaves our completion standing on a row now reading
  // 'todo', which no `status=eq.done` read can see - so the redo was exactly
  // what erased the job, and cancelling it restored nothing.
  const performed = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  db.homeowner_maintenance.push({
    homeowner_id: 'redo', task_key: 'clean_gutters', season: 'fall',
    status: 'todo', completed_by: 'lavaca', completed_at: performed,
    updated_at: new Date().toISOString(), scheduled_start: null, scheduled_end: null, service_address: null,
  });

  const start = new Date(Date.now() + 3 * 24 * 3600_000);
  await rebook('redo', [{ taskKey: 'clean_gutters', season: 'fall' }], start);

  const row = db.homeowner_maintenance.find((m) => m.homeowner_id === 'redo')!;
  expect(row.status, 'the redo is on the books').toBe('booked');
  expect(row.scheduled_start).toBe(start.toISOString());
  expect(row.completed_at, 'and the invoiced visit is still history').toBe(performed);
  expect(lastDoneLabel(lastDoneFor([row as unknown as CompletionRow]).get('clean_gutters'))).toContain('by La Vaca');
});

test('a failed booking read refuses the booking instead of guessing', async () => {
  // `[]` from this read does not mean "no read" - it means "this customer holds
  // no bookings", the one answer that makes the caller cancel nothing.
  // Swallowed, a reschedule would move the visit, leave a live reminder on the
  // window it vacated and still answer 200.
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

/** Point the client at a dead port for one call, the way the booking read does. */
const withQueueDown = async <T>(fn: () => Promise<T>): Promise<T> => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${STUB_PORT + 1}`;
  try { return await fn(); } finally { process.env.NEXT_PUBLIC_SUPABASE_URL = url; }
};

test('RM17: a cancel that cannot reach the queue says so instead of claiming success', async () => {
  // The one path in this pipeline that failed OPEN. Swallowed, a failed cancel
  // is indistinguishable from "nothing to cancel" - so the route answered
  // "cancelled", the toast read "the reminder is pulled", and the customer was
  // told we were coming tomorrow for a visit that had been called off.
  const start = new Date(Date.now() + 6 * 24 * 3600_000);
  await requeueVisitReminder({
    email: 'stranded@example.com', name: 'Stranded', start, subject: 'Gutters', html: '<p>x</p>',
  });
  expect(pendingFor('stranded@example.com').length).toBe(1);

  expect(await withQueueDown(() => cancelVisitReminder('stranded@example.com', start)),
    'reported, never swallowed').toBe('unavailable');
  // And the row really is still live, which is exactly what the admin needs
  // telling: nothing else is going to stop it going out.
  expect(pendingFor('stranded@example.com').length).toBe(1);

  expect(await cancelVisitReminder('stranded@example.com', start)).toBe('cancelled');
  expect(pendingFor('stranded@example.com')).toEqual([]);
});

test('RM17: a requeue whose cancel failed queues nothing on top of it', async () => {
  // The stale row would still be pending for a window the visit has left, so a
  // second one announces both - the visit that moved and the one that is real.
  const start = new Date(Date.now() + 7 * 24 * 3600_000);
  const verdict = await withQueueDown(() => requeueVisitReminder({
    email: 'nocancel@example.com', name: 'No Cancel', start, subject: 'S', html: '<p>x</p>',
  }));
  expect(verdict).toBe('unavailable');
  expect(pendingFor('nocancel@example.com')).toEqual([]);
});

/* ── retiring a visit's dispatch (crew dispatch AC 72, 79) ───────────────── */

/**
 * Seed one visit that has already been dispatched to one person.
 *
 * `dispatched_at` is what says an invite actually landed on somebody's phone,
 * which is the only case a retraction is owed for.
 */
const seedDispatch = (visitStart: Date, over: Record<string, unknown> = {}) => {
  db.visit_dispatch = db.visit_dispatch ?? [];
  db.visit_dispatch_recipients = db.visit_dispatch_recipients ?? [];
  const id = `vd-${db.visit_dispatch.length + 1}`;
  db.visit_dispatch.push({
    id, homeowner_id: 'member-1', visit_start: visitKey(visitStart), sub_name: null,
    dispatched_at: new Date().toISOString(), nudged_at: null, escalated_at: null, ics_sequence: 0,
    ...over,
  });
  db.visit_dispatch_recipients.push({
    id: `${id}-a`, dispatch_id: id, recipient_id: 'rec-1', email: 'veronica@lavacagc.com',
    name: 'Veronica', confirm_token: `tok-${id}`, status: 'sent', confirmed_at: null, note: null,
  });
  return id;
};

test('a cancelled visit still ahead is cleared, and the failed retraction is reported', async () => {
  const start = new Date(Date.now() + 4 * 24 * 3600_000);
  const id = seedDispatch(start);

  const result = await clearVisitDispatch('member-1', start, { reason: 'cancelled' });

  // The row goes whatever happens to the email: left behind, the next booking
  // of that window inherits the stamps saying it has already been chased.
  expect(db.visit_dispatch.some((r) => r.id === id)).toBe(false);
  expect(db.visit_dispatch_recipients.some((r) => r.dispatch_id === id), 'assignments cascade').toBe(false);
  expect(result.status).toBe('cleared');
  // No RESEND_API_KEY here, so nothing went out - and that is reported as
  // exactly what it is. Answering 'sent' would tell the admin the crew had been
  // told, while they still hold the visit and its 7:00am "text the customer"
  // alarm.
  expect(result.retraction).toBe('send_failed');
  expect(result.unretracted).toEqual(['veronica@lavacagc.com']);
});

test('a window already past is cleared but never mailed about', async () => {
  // Re-booking a service into a later window in the same season puts the old
  // one through here. It has no 7:00am alarm left to fire, so "[CANCELLED] you
  // are not going" for it is pure noise on the channel that must stay read.
  const start = new Date(Date.now() - 2 * 24 * 3600_000);
  const id = seedDispatch(start);

  const result = await clearVisitDispatch('member-1', start, { reason: 'cancelled' });

  expect(db.visit_dispatch.some((r) => r.id === id)).toBe(false);
  expect(result).toEqual({ status: 'cleared', retraction: 'not_needed', unretracted: [] });
});

test('the cutoff is injectable, so a window ahead of a given now is still retracted', async () => {
  const start = new Date(Date.now() + 2 * 24 * 3600_000);
  seedDispatch(start);

  const past = await clearVisitDispatch('member-1', start, {
    reason: 'cancelled', now: new Date(start.getTime() + 3600_000),
  });
  expect(past.retraction, 'now after the window: nothing to take back').toBe('not_needed');

  const ahead = seedDispatch(start);
  const live = await clearVisitDispatch('member-1', start, {
    reason: 'cancelled', now: new Date(start.getTime() - 3600_000),
  });
  expect(live.retraction, 'now before the window: it is owed a retraction').toBe('send_failed');
  expect(db.visit_dispatch.some((r) => r.id === ahead)).toBe(false);
});

test('a completed visit clears its row and retracts nothing', async () => {
  // The job HAPPENED. Mailing "this visit is off, you are not going" about work
  // somebody just finished would be a lie.
  const start = new Date(Date.now() + 3 * 24 * 3600_000);
  const id = seedDispatch(start);

  const result = await clearVisitDispatch('member-1', start, { reason: 'completed' });

  expect(db.visit_dispatch.some((r) => r.id === id)).toBe(false);
  expect(result).toEqual({ status: 'cleared', retraction: 'not_needed', unretracted: [] });
});

test('a dispatch that never sent leaves nothing to retract', async () => {
  const start = new Date(Date.now() + 5 * 24 * 3600_000);
  seedDispatch(start, { dispatched_at: null });

  const result = await clearVisitDispatch('member-1', start, { reason: 'cancelled' });
  expect(result.retraction).toBe('not_needed');
});

/* ── taking somebody off a visit (crew dispatch AC 81, 85) ───────────────── */

const crew = (id: string, name: string, email: string): DispatchRecipient =>
  ({ id, name, email, active: true });

test('un-ticking somebody retires their row, and the send names only who is on it', async () => {
  // Veronica was dispatched this visit; the admin realises she is not on it and
  // re-submits the same window with only Alex ticked. That is a re-dispatch,
  // not a supersede, so nothing else would ever clean her row up.
  const id = seedDispatch(new Date(Date.now() + 7 * 24 * 3600_000));

  const result = await ensureAssignments(id, [crew('rec-2', 'Alex', 'alex@lavacagc.com')]);

  expect(result.assignments.map((a) => a.email)).toEqual(['alex@lavacagc.com']);
  expect(result.stillLive, 'the retirement landed').toEqual([]);
  expect(result.notMailed).toEqual([]);
  const dropped = db.visit_dispatch_recipients.find((r) => r.id === `${id}-a`)!;
  expect(dropped.status, 'her confirm token stops working').toBe('retired');
  // The row is never deleted: it is the record that she was sent it.
  expect(dropped.confirm_token).toBe(`tok-${id}`);
});

test('a retirement the database refuses is reported, never rendered as a clean send', async () => {
  const id = seedDispatch(new Date(Date.now() + 8 * 24 * 3600_000));
  failPatchOn = 'visit_dispatch_recipients';
  try {
    const result = await ensureAssignments(id, [crew('rec-2', 'Alex', 'alex@lavacagc.com')]);

    // Alex is still dispatched - the booking already happened, and a failed
    // retirement is no reason to leave the person going uninformed.
    expect(result.assignments.map((a) => a.email)).toEqual(['alex@lavacagc.com']);
    // But Veronica's row never retired. Her confirm link still works, and one
    // tap from her satisfies the escalation's "somebody confirmed" - silencing
    // the 5pm and 6pm chases for a visit Alex has never answered. Handed back,
    // not logged: only the admin can undo it.
    expect(result.stillLive).toEqual(['veronica@lavacagc.com']);
    expect(db.visit_dispatch_recipients.find((r) => r.id === `${id}-a`)!.status).toBe('sent');
  } finally { failPatchOn = null; }
});

test('somebody who could not be put back on the visit is named, not silently dropped', async () => {
  const id = seedDispatch(new Date(Date.now() + 9 * 24 * 3600_000));
  // Taken off this visit earlier, and now ticked again.
  db.visit_dispatch_recipients.find((r) => r.id === `${id}-a`)!.status = 'retired';
  failPatchOn = 'visit_dispatch_recipients';
  try {
    const result = await ensureAssignments(id, [crew('rec-1', 'Veronica', 'veronica@lavacagc.com')]);

    // Her link is still dead, so mailing her would open "you are no longer on
    // this visit" - worse than not writing to her at all. The only other clue
    // the admin would get is a "dispatched to" list shorter than what they
    // ticked, which is not a clue anybody reads.
    expect(result.assignments).toEqual([]);
    expect(result.notMailed).toEqual(['veronica@lavacagc.com']);
    expect(result.stillLive, 'nobody was dropped from this one').toEqual([]);
  } finally { failPatchOn = null; }
});

test('the crew state a visit reads at is what the admin list shows', async () => {
  const start = new Date(Date.now() + 6 * 24 * 3600_000);
  const id = seedDispatch(start);
  db.visit_dispatch_recipients.push({
    id: `${id}-b`, dispatch_id: id, recipient_id: 'rec-2', email: 'alex@lavacagc.com',
    name: 'Alex', confirm_token: `tok-${id}-b`, status: 'flagged', confirmed_at: null,
    note: 'sub cancelled',
  });

  const before = dispatchStateOf(await assignmentsForDispatch(id));
  expect(before.state).toBe('flagged');
  expect(before.flags).toEqual([{ by: 'Alex', note: 'sub cancelled' }]);

  // What "Mark handled" does: the flagged rows become confirmed, which is what
  // the escalation reads, and the note stays as the record of what was wrong.
  await supabaseRest('PATCH', `visit_dispatch_recipients?dispatch_id=eq.${id}&status=eq.flagged`, {
    status: 'confirmed', confirmed_at: new Date().toISOString(),
  });

  const after = dispatchStateOf(await assignmentsForDispatch(id));
  expect(after.state).toBe('confirmed');
  expect(after.confirmedBy).toEqual(['Alex']);
  expect(db.visit_dispatch_recipients.find((r) => r.id === `${id}-b`)!.note).toBe('sub cancelled');
  // The person who never answered is untouched - their silence is not a
  // confirmation, and the chase has to keep saying so.
  expect(db.visit_dispatch_recipients.find((r) => r.id === `${id}-a`)!.status).toBe('sent');
});
