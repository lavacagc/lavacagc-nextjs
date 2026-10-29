#!/usr/bin/env node
/**
 * Create a portfolio project DRAFT on the La Vaca site from local photos and/or
 * photos already in the `project-images` bucket, and optionally publish it.
 * Built for Claude Code; docs/projects-ingest.md has the worked example.
 *
 *   node scripts/ingest-project.mjs \
 *     --site https://www.lavacagc.com --token "$PROJECT_INGEST_TOKEN" \
 *     --title "Modern Kitchen Remodel" --location "Clifton" --service "Kitchen Remodeling" \
 *     --before before1.jpg --after after1.jpg --after after2.heic \
 *     [--from-storage drafts/1760035527927-bund8n.jpg[:before|:during|:after]] \
 *     [--pair] [--challenge "..."] [--solution "..."] [--date 2026-10] \
 *     [--publish] [--feature] [--dry-run]
 *
 * Local files go up through signed upload URLs straight to storage (a 10 MB
 * phone photo never passes through a size-capped function), HEIC is converted
 * to JPEG with macOS `sips` first, and the server checks every file's bytes
 * before attaching it. Prints the admin URL to review the draft.
 *
 * Environment fallbacks: PROJECT_INGEST_SITE, PROJECT_INGEST_TOKEN.
 * Node 18+ (global fetch). No dependencies.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';

const SERVICES = [
  'Kitchen Remodeling', 'Bathroom Renovation', 'Basement Finishing',
  'Home Additions', 'Whole Home Remodel', 'Custom Living Space',
];
const CONTENT_TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
};
const REPEATABLE = new Set(['service', 'before', 'during', 'after', 'from-storage', 'material', 'feature-item']);
const FLAGS = new Set(['publish', 'feature', 'pair', 'dry-run', 'help']);

function usage(code = 0) {
  const text = readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(2, 22).map((l) => l.replace(/^ \* ?/, '')).join('\n');
  (code ? console.error : console.log)(text);
  process.exit(code);
}

function parseArgs(argv) {
  const out = { service: [], before: [], during: [], after: [], 'from-storage': [], material: [], 'feature-item': [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) fail(`Unexpected argument: ${arg}`);
    const [name, inline] = arg.slice(2).split(/=(.*)/s);
    if (FLAGS.has(name)) { out[name] = true; continue; }
    const value = inline ?? argv[++i];
    if (value === undefined) fail(`--${name} needs a value`);
    if (REPEATABLE.has(name)) out[name].push(value);
    else out[name] = value;
  }
  return out;
}

function fail(message) {
  console.error(`ingest-project: ${message}`);
  process.exit(1);
}

/** A local file ready to upload: HEIC converted, extension checked. */
function prepareLocal(file) {
  let path = file;
  try { statSync(path); } catch { fail(`No such file: ${file}`); }
  let ext = extname(path).toLowerCase();
  if (ext === '.heic' || ext === '.heif') {
    if (process.platform !== 'darwin') fail(`${file}: convert HEIC to JPEG first (sips is macOS-only).`);
    const dir = mkdtempSync(join(tmpdir(), 'ingest-'));
    const out = join(dir, `${basename(path, extname(path))}.jpg`);
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '90', path, '--out', out], { stdio: 'ignore' });
    path = out;
    ext = '.jpg';
  }
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) fail(`${file}: only JPEG, PNG, WebP, HEIC, MP4, MOV or WebM.`);
  return { source: file, path, contentType, size: statSync(path).size, kind: contentType.startsWith('video/') ? 'video' : 'image' };
}

async function call(site, token, method, path, body) {
  const res = await fetch(`${site}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      // The site's bot filter refuses headless user agents; say who we are.
      'User-Agent': 'Mozilla/5.0 (compatible; LaVacaIngestCLI/1.0)',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text.slice(0, 200) }; }
  if (!res.ok) {
    const issues = Array.isArray(data.issues) ? ` (${data.issues.map((i) => `${i.path}: ${i.message}`).join('; ')})` : '';
    const hint = res.status === 404 && path.startsWith('/api/projects/ingest')
      ? ' - is PROJECT_INGEST_TOKEN (32+ characters) set on the site?' : '';
    fail(`${method} ${path} -> ${res.status}: ${data.error ?? 'request failed'}${issues}${hint}`);
  }
  return data;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) usage(0);

  const site = (args.site ?? process.env.PROJECT_INGEST_SITE ?? 'https://www.lavacagc.com').replace(/\/+$/, '');
  const token = args.token ?? process.env.PROJECT_INGEST_TOKEN;
  if (!token) fail('Pass --token or set PROJECT_INGEST_TOKEN.');
  if (!args.title) fail('--title is required.');
  if (!args.location) fail('--location is required.');
  if (args.service.length === 0) fail(`--service is required (one of: ${SERVICES.join(', ')}).`);
  for (const s of args.service) if (!SERVICES.includes(s)) fail(`Unknown service "${s}". Use one of: ${SERVICES.join(', ')}.`);

  // Local files, in the order given per stage: before, during, after.
  const locals = ['before', 'during', 'after'].flatMap((category) => args[category].map((f) => ({ category, ...prepareLocal(f) })));
  const fromStorage = args['from-storage'].map((spec) => {
    const m = /^(.+?)(?::(before|during|after))?$/.exec(spec);
    return { path: m[1], category: m[2] ?? 'after' };
  });
  if (locals.length + fromStorage.length === 0) fail('Add at least one --before/--during/--after file or --from-storage path.');

  if (args['dry-run']) {
    console.log(JSON.stringify({ site, locals: locals.map(({ source, category, size }) => ({ source, category, size })), fromStorage }, null, 2));
    return;
  }

  // 1. Signed upload URLs, then PUT each file straight to storage.
  const images = [];
  if (locals.length > 0) {
    const { uploads, headers = {} } = await call(site, token, 'POST', '/api/projects/ingest/uploads', {
      files: locals.map((f) => ({ filename: basename(f.path), size: f.size, kind: f.kind })),
    });
    for (const [i, f] of locals.entries()) {
      const up = uploads[i];
      process.stdout.write(`uploading ${f.source} (${(f.size / 1048576).toFixed(1)} MB)... `);
      const res = await fetch(up.signed_url, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': f.contentType, 'cache-control': 'max-age=31536000', 'x-upsert': 'false' },
        body: readFileSync(f.path),
      });
      if (!res.ok) fail(`upload of ${f.source} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
      console.log('done');
      images.push({ path: up.path, category: f.category });
    }
  }
  images.push(...fromStorage);

  // --pair links the first before with the first after as a slider.
  if (args.pair) {
    const b = images.find((i) => i.category === 'before');
    const a = images.find((i) => i.category === 'after');
    if (!b || !a) fail('--pair needs at least one before and one after image.');
    b.pair_key = a.pair_key = 'pair-1';
  }

  // 2. The draft.
  const project = {
    title: args.title,
    location: args.location,
    service_types: args.service,
    images,
    ...(args.challenge && { challenge: args.challenge }),
    ...(args.solution && { solution: args.solution }),
    ...(args.client && { client_first_name: args.client }),
    ...(args.date && { date_completed: args.date }),
    ...(args.budget && { budget_range: args.budget }),
    ...(args.duration && { duration: args.duration }),
    ...(args.slug && { url_slug: args.slug }),
    ...(args.keyword && { focus_keyword: args.keyword }),
    ...(args.material.length && { materials_used: args.material }),
    ...(args['feature-item'].length && { special_features: args['feature-item'] }),
  };
  const created = await call(site, token, 'POST', '/api/projects/ingest', project);
  console.log(`draft created: ${created.id} (${created.url_slug})`);

  // 3. Optional publish.
  let status = created.status;
  if (args.publish || args.feature) {
    const published = await call(site, token, 'POST', `/api/projects/ingest/${created.id}/publish`, args.feature ? { feature: true } : {});
    status = published.status;
    console.log(`published${args.feature ? ' and featured on the homepage' : ''}: ${site}/projects/${published.url_slug}`);
  }

  console.log(`status: ${status}`);
  console.log(`review: ${created.admin_url}`);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
