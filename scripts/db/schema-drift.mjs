#!/usr/bin/env node
// Turn schema drift into an idempotent migration.
//
//   node scripts/db/schema-drift.mjs <reference.sql> <fresh.sql> > migration.sql
//
// <reference.sql>: `supabase db dump -s public` of production.
// <fresh.sql>:     the same dump of a database built only from supabase/migrations.
//
// Every statement in the reference dump that the fresh dump lacks is emitted in a
// form that is a no-op where the object already exists, so the migration can run
// on production (nothing changes) and on any fresh database (it converges to
// production). Session SET statements are dropped. Exits 1 on a statement kind
// it does not know how to make idempotent, rather than guessing.

import { readFileSync } from 'node:fs';

/** Split a pg_dump file into statements, respecting quotes, dollar quotes and comments. */
export function splitStatements(sql) {
  const out = [];
  let buf = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? sql.length : nl + 1;
      continue;
    }
    if (ch === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") break;
        j++;
      }
      buf += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === '"') {
      const j = sql.indexOf('"', i + 1);
      buf += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === '$') {
      const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (m) {
        const end = sql.indexOf(m[0], i + m[0].length);
        buf += sql.slice(i, end + m[0].length);
        i = end + m[0].length;
        continue;
      }
    }
    if (ch === ';') {
      const s = buf.trim();
      if (s) out.push(s);
      buf = '';
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const lit = (s) => `'${s.replace(/'/g, "''")}'`;
const unq = (s) => s.replace(/^"|"$/g, '');

/** "public"."x" or public.x -> x */
function tableName(ref) {
  const parts = ref.split('.');
  return unq(parts[parts.length - 1]);
}

function tableColumns(stmt) {
  const body = stmt.slice(stmt.indexOf('(') + 1, stmt.lastIndexOf(')'));
  const cols = new Map();
  let depth = 0, cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { cols.set(...colEntry(cur)); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) cols.set(...colEntry(cur));
  cols.delete(null);
  return cols;
}
function colEntry(def) {
  const d = def.trim();
  if (/^CONSTRAINT\s/i.test(d)) return [null, null];
  const m = /^("[^"]+"|\S+)/.exec(d);
  return [unq(m[1]), d];
}

function guard(condition, stmt) {
  return `DO $drift$ BEGIN\n  IF NOT (${condition}) THEN\n    EXECUTE ${lit(stmt)};\n  END IF;\nEND $drift$;`;
}

export function driftMigration(referenceSql, freshSql) {
  const fresh = splitStatements(freshSql);
  const freshSet = new Set(fresh.map(norm));
  const freshTables = new Map();
  for (const s of fresh) {
    const m = /^CREATE TABLE IF NOT EXISTS (\S+)/.exec(s);
    if (m) freshTables.set(tableName(m[1]), tableColumns(s));
  }

  const out = [];
  const unknown = [];
  for (const s of splitStatements(referenceSql)) {
    if (freshSet.has(norm(s))) continue;
    let m;
    if (/^(SET|SELECT pg_catalog\.set_config|RESET)\b/.test(s)) continue;

    if ((m = /^CREATE TABLE IF NOT EXISTS (\S+)/.exec(s))) {
      const t = tableName(m[1]);
      if (!freshTables.has(t)) { out.push(s + ';'); continue; }
      const have = freshTables.get(t);
      for (const [col, def] of tableColumns(s)) {
        if (!have.has(col)) out.push(`ALTER TABLE ${m[1]} ADD COLUMN IF NOT EXISTS ${def};`);
      }
      continue;
    }
    if ((m = /^ALTER TABLE (?:ONLY )?(\S+)\s+ADD CONSTRAINT ("[^"]+"|\S+)/.exec(s))) {
      // A UNIQUE or PRIMARY KEY constraint owns an index of the same name, and a
      // migration may have created that index on its own; either means present.
      const name = unq(m[2]);
      out.push(guard(`EXISTS (SELECT 1 FROM pg_constraint WHERE conname = ${lit(name)} AND conrelid = ${lit(m[1])}::regclass) OR to_regclass(${lit('public."' + name + '"')}) IS NOT NULL`, s));
      continue;
    }
    if ((m = /^CREATE POLICY ("[^"]+"|\S+) ON (\S+)/.exec(s))) {
      out.push(guard(`EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = ${lit(tableName(m[2]))} AND policyname = ${lit(unq(m[1]))})`, s));
      continue;
    }
    if ((m = /^CREATE (TYPE|DOMAIN) (\S+)/.exec(s))) {
      out.push(guard(`EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = ${lit(tableName(m[2]))})`, s));
      continue;
    }
    if (/^CREATE (UNIQUE )?INDEX /.test(s)) {
      out.push(s.replace(/^CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/, 'CREATE $1INDEX IF NOT EXISTS ') + ';');
      continue;
    }
    if (/^(CREATE OR REPLACE (FUNCTION|TRIGGER|VIEW)|CREATE (SEQUENCE|SCHEMA) IF NOT EXISTS|GRANT |REVOKE |COMMENT ON |ALTER DEFAULT PRIVILEGES |ALTER (FUNCTION|SEQUENCE|SCHEMA|TYPE|DOMAIN) |ALTER TABLE (ONLY )?\S+ (OWNER TO|ENABLE ROW LEVEL SECURITY|ALTER COLUMN \S+ SET DEFAULT|REPLICA IDENTITY))/.test(s)) {
      out.push(s + ';');
      continue;
    }
    unknown.push(s.slice(0, 120));
  }
  return { sql: out.join('\n\n') + '\n', unknown };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [ref, fresh] = process.argv.slice(2);
  if (!ref || !fresh) {
    console.error('usage: schema-drift.mjs <reference.sql> <fresh.sql>');
    process.exit(2);
  }
  const { sql, unknown } = driftMigration(readFileSync(ref, 'utf8'), readFileSync(fresh, 'utf8'));
  if (unknown.length) {
    console.error(`schema-drift: ${unknown.length} statement(s) of an unhandled kind:\n` + unknown.map((u) => '  ' + u).join('\n'));
    process.exit(1);
  }
  process.stdout.write(sql);
}
