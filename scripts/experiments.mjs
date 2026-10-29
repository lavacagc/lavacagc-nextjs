#!/usr/bin/env node
/**
 * The experiments agent CLI: read the weekly report and the backlog, create
 * and start an experiment, conclude one, post the weekly summary.
 * Built for the experiments skill (.claude/skills/experiments/SKILL.md);
 * docs/experiments.md has the details.
 *
 * Every command needs --site: there is no default, so a dry run can never
 * write to production by accident.
 *
 *   node scripts/experiments.mjs report --site <url> [--json]
 *   node scripts/experiments.mjs copy --site <url> --page /home-services --element hero
 *   node scripts/experiments.mjs backlog
 *   node scripts/experiments.mjs backlog-add --page /home-services --element hero --hypothesis "..." [--priority 50]
 *   node scripts/experiments.mjs create <experiment.json>
 *   node scripts/experiments.mjs start <key>
 *   node scripts/experiments.mjs conclude <key> --winner B
 *   node scripts/experiments.mjs conclude <key> --retire "reason"
 *   node scripts/experiments.mjs notify "summary text"
 *
 * Options: --site (required, e.g. http://localhost:3120 or https://www.lavacagc.com),
 * --token (default PROJECT_INGEST_TOKEN). Node 18+, no dependencies.
 */
import { readFileSync } from 'node:fs';

function parse(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const [name, inline] = a.slice(2).split(/=(.*)/s);
    if (name === 'json' || name === 'help') { out[name] = true; continue; }
    const value = inline ?? argv[++i];
    if (value === undefined) fail(`--${name} needs a value`);
    out[name] = value;
  }
  return out;
}

function fail(message) {
  console.error(`experiments: ${message}`);
  process.exit(1);
}

function usage(code = 0) {
  const text = readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(2, 23).map((l) => l.replace(/^ \* ?/, '')).join('\n');
  (code ? console.error : console.log)(text);
  process.exit(code);
}

const args = parse(process.argv.slice(2));
if (args.help || args._.length === 0) usage(args.help ? 0 : 1);
if (!args.site) fail('pass --site <url> (http://localhost:<port> for the local rig, https://www.lavacagc.com for production); there is no default');
const site = args.site.replace(/\/$/, '');
const token = args.token || process.env.PROJECT_INGEST_TOKEN;
if (!token) fail('set PROJECT_INGEST_TOKEN or pass --token');

async function call(method, path, body) {
  const res = await fetch(`${site}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    console.error(`${method} ${path} -> ${res.status}`);
    console.error(JSON.stringify(json, null, 2));
    if (res.status === 404 && !json.error?.startsWith('No experiment')) console.error('404 without a body means the token is wrong or unset on the site.');
    process.exit(1);
  }
  return json;
}

const pct = (v, d = 1) => (v === null || v === undefined ? '-' : `${(v * 100).toFixed(d)}%`);

function printReport(r) {
  console.log(`Report ${r.generated_at}. Pages with a running experiment: ${r.pages_with_running_experiment.join(', ') || 'none'}`);
  for (const e of r.experiments) {
    console.log(`\n${e.key} [${e.status}] ${e.page} ${e.element}  metric=${e.primary_metric} min=${e.min_visitors} visitors, ${e.min_days} days`);
    console.log(`  hypothesis: ${e.hypothesis}`);
    const arms = new Map((e.evaluation?.arms ?? []).map((a) => [a.key, a]));
    for (const v of e.variants) {
      const a = arms.get(v.key);
      const f = v.funnel;
      console.log(`  ${v.key}${v.is_control ? '*' : ' '} ${v.active ? '' : '(off) '}${v.label}: view ${f.view}, click ${f.click}, started ${f.request_started}, sent ${f.request_submitted}, accepted ${f.quote_accepted}, paid ${f.job_paid}; beats control ${pct(a?.p_beat_control)}, loss ${pct(a?.expected_loss, 2)}`);
    }
    if (e.evaluation) console.log(`  verdict: ${e.evaluation.verdict.kind}: ${e.evaluation.verdict.reason}${e.evaluation.verdict.ready_on ? ` (ready about ${e.evaluation.verdict.ready_on})` : ''}`);
    const p = e.decision?.pending;
    if (p) console.log(p.veto_sent_at
      ? `  pending: ${p.winner_key} becomes the default at the daily run ${p.promote_at} unless vetoed (veto message sent ${p.veto_sent_at})`
      : `  pending: ${p.winner_key} NOT promoted yet: veto message not delivered (${p.veto_outcome}, ${p.attempts} attempts); the daily run retries`);
  }
  console.log('\nBacklog (open):');
  for (const b of r.backlog) console.log(`  #${b.id} P${b.priority} ${b.page} ${b.element}: ${b.hypothesis}`);
  console.log('\nDrafts (start these before anything new):');
  for (const e of r.experiments.filter((x) => x.status === 'draft')) console.log(`  ${e.key} ${e.page} ${e.element}`);
  console.log('\nSurfaces:');
  for (const s of r.surfaces) console.log(`  ${s.page} ${s.element}: slots ${s.slots.join(', ')}${s.sections ? ` (sections ${s.sections.join(', ')})` : ''}`);
}

const [command, key] = args._;
switch (command) {
  case 'report': {
    const r = await call('GET', '/api/experiments/report');
    if (args.json) console.log(JSON.stringify(r, null, 2));
    else printReport(r);
    break;
  }
  case 'copy': {
    // Today's copy for one surface, as a payload to paste as the control.
    const r = await call('GET', '/api/experiments/report');
    const found = r.current_copy.filter((c) => (!args.page || c.page === args.page) && (!args.element || c.element === args.element));
    if (!found.length) fail(`no surface ${args.page ?? ''} ${args.element ?? ''}; surfaces: ${r.current_copy.map((c) => `${c.page} ${c.element}`).join('; ')}`);
    for (const c of found) {
      console.log(`# ${c.page} ${c.element} (from ${c.source})`);
      console.log(JSON.stringify(c.payload, null, 2));
      for (const l of c.locked ?? []) {
        console.log(`# locked: "${l.slot}" states a fixed fact (${l.reason}) - leave it out of every variant; the page keeps showing it.`);
      }
      console.log('# Put in each variant ONLY the slots your test changes, with this copy as variant A.');
    }
    break;
  }
  case 'backlog':
    console.log(JSON.stringify((await call('GET', '/api/experiments/backlog')).backlog, null, 2));
    break;
  case 'backlog-add':
    console.log(JSON.stringify(await call('POST', '/api/experiments/backlog', {
      page: args.page, element: args.element, hypothesis: args.hypothesis,
      ...(args.priority ? { priority: Number(args.priority) } : {}), source: args.source || 'agent',
    }), null, 2));
    break;
  case 'create': {
    if (!key) fail('create needs a JSON file');
    const body = JSON.parse(readFileSync(key, 'utf8'));
    const r = await call('POST', '/api/experiments', body);
    console.log(`Draft ${r.experiment.key} created. Admin: ${r.adminUrl}`);
    console.log('Preview (signed-in admin):');
    for (const u of r.previewUrls) console.log(`  ${u}`);
    break;
  }
  case 'start': {
    if (!key) fail('start needs a key');
    const r = await call('POST', `/api/experiments/${encodeURIComponent(key)}/start`, {});
    console.log(`${r.experiment.key} is ${r.experiment.status}. Telegram: ${r.telegram}`);
    if (r.message) console.log(`Message:\n${r.message}`);
    break;
  }
  case 'conclude': {
    if (!key) fail('conclude needs a key');
    const body = args.winner ? { winner_key: args.winner } : args.retire ? { retire: true, reason: args.retire } : fail('pass --winner <key> or --retire "reason"');
    const r = await call('POST', `/api/experiments/${encodeURIComponent(key)}/conclude`, body);
    console.log(`${r.experiment.key} is ${r.experiment.status}. Telegram: ${r.telegram}`);
    if (r.message) console.log(`Message:\n${r.message}`);
    break;
  }
  case 'notify': {
    if (!key) fail('notify needs the summary text');
    const r = await call('POST', '/api/experiments/notify', { text: args._.slice(1).join(' ') });
    console.log(`Telegram: ${r.telegram}`);
    break;
  }
  default:
    usage(1);
}
