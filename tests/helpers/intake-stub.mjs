/**
 * A stand-in for everything the lead intake talks to, so the whole feature can
 * be driven end to end without a database, a storage bucket or a real Telegram
 * bot.
 *
 * It plays four roles on one port:
 *
 *   /rest/v1/<table>     a small in-memory PostgREST - the shapes
 *                        `supabaseRest` and supabase-js actually send
 *   /storage/v1/object   the intake-photos bucket
 *   /telegram/bot<t>/... api.telegram.org, reached because the Next process is
 *                        started with the `outbound-fetch.cjs` preload, which
 *                        rewrites the hostname
 *   /__state, /__reset   what the spec reads back
 *
 * Deliberately generic rather than table-aware: the submit route, the follow-up
 * sequence and the rate limiter all write tables this feature does not care
 * about, and a stub that 404s them would fail the run for the wrong reason.
 *
 * Started by tests/lead-intake-e2e.spec.ts. See the run recipe in that file.
 */
import http from 'http';
import { randomUUID } from 'crypto';

const PORT = Number(process.env.INTAKE_STUB_PORT || 9416);

/** table name -> rows. Created on first touch, so any table works. */
const tables = new Map();
/** Every sendMessage body Telegram would have received. */
const telegram = [];
/** Every object uploaded to the bucket. */
const storage = [];
/**
 * Toggled by POST /__fail, so a spec can show what a lead sees when the
 * database is unreachable rather than absent. Killing the stub process would
 * do it too, but only for whoever happens to own that process.
 */
let failing = false;

const rowsOf = (name) => {
  if (!tables.has(name)) tables.set(name, []);
  return tables.get(name);
};

/**
 * PostgREST filters, limited to the operators this codebase uses: `eq` and
 * `is.null`. Anything else is ignored rather than guessed at - a filter that
 * silently means something different is worse than one that does not apply.
 */
function matches(row, params) {
  for (const [key, raw] of params) {
    if (['select', 'limit', 'order', 'on_conflict', 'offset'].includes(key)) continue;
    if (raw === 'is.null') {
      if (row[key] !== null && row[key] !== undefined) return false;
    } else if (raw.startsWith('eq.')) {
      if (String(row[key]) !== raw.slice(3)) return false;
    }
  }
  return true;
}

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
};

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function handleRest(req, res, url, body) {
  const table = url.pathname.replace('/rest/v1/', '').split('/')[0];
  const rows = rowsOf(table);
  const params = [...url.searchParams.entries()];
  const minimal = (req.headers.prefer || '').includes('return=minimal');

  if (req.method === 'GET') {
    let found = rows.filter((r) => matches(r, params));
    const limit = Number(url.searchParams.get('limit') || 0);
    if (limit > 0) found = found.slice(0, limit);
    return json(res, 200, found);
  }

  if (req.method === 'POST') {
    const parsed = JSON.parse(body.toString() || '{}');
    const incoming = Array.isArray(parsed) ? parsed : [parsed];
    const inserted = incoming.map((r) => {
      const row = { id: randomUUID(), created_at: new Date().toISOString(), ...r };
      rows.push(row);
      return row;
    });
    return json(res, 201, minimal ? undefined : inserted);
  }

  if (req.method === 'PATCH') {
    const patch = JSON.parse(body.toString() || '{}');
    const hit = rows.filter((r) => matches(r, params));
    hit.forEach((r) => Object.assign(r, patch));
    return json(res, 200, minimal ? undefined : hit);
  }

  if (req.method === 'DELETE') {
    const keep = rows.filter((r) => !matches(r, params));
    tables.set(table, keep);
    return json(res, 200, minimal ? undefined : []);
  }

  return json(res, 405, { message: 'not supported by the stub' });
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const body = await readBody(req);

    // What the spec reads back.
    if (url.pathname === '/__state') {
      return json(res, 200, {
        telegram,
        storage,
        tables: Object.fromEntries([...tables.entries()].map(([k, v]) => [k, v])),
      });
    }
    if (url.pathname === '/__reset') {
      tables.clear();
      telegram.length = 0;
      storage.length = 0;
      failing = false;
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/__fail') {
      failing = url.searchParams.get('on') === '1';
      return json(res, 200, { failing });
    }

    // api.telegram.org, after the preload rewrote the host.
    if (url.pathname.includes('/sendMessage')) {
      const payload = JSON.parse(body.toString() || '{}');
      telegram.push(payload);
      return json(res, 200, { ok: true, result: { message_id: telegram.length } });
    }

    // The intake-photos bucket.
    if (url.pathname.startsWith('/storage/v1/object')) {
      const key = url.pathname.replace('/storage/v1/object/', '');
      storage.push({ key, bytes: body.length });
      return json(res, 200, { Key: key });
    }

    if (url.pathname.startsWith('/rest/v1/')) {
      if (failing) return json(res, 500, { message: 'stub is pretending to be down' });
      return handleRest(req, res, url, body);
    }

    return json(res, 404, { message: `stub has no route for ${req.method} ${url.pathname}` });
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`intake stub listening on http://127.0.0.1:${PORT}`);
  });
