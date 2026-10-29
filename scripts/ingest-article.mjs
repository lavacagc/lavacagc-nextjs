#!/usr/bin/env node
/**
 * Write, publish and take down La Vaca blog articles from Claude Code, and read
 * the SEO feedback that says what to write next. docs/articles-ingest.md has
 * the worked example.
 *
 *   node scripts/ingest-article.mjs create --file article.md --category "Kitchen Remodeling" \
 *     [--title "..."] [--slug ...] [--excerpt "..."] [--meta-title "..."] [--meta-description "..."] \
 *     [--keywords "a, b"] [--image https://...] [--faq faq.json] [--action <id>] [--publish] [--dry-run]
 *   node scripts/ingest-article.mjs patch <post id> [--file article.md] [any create option] [--action <id>]
 *   node scripts/ingest-article.mjs publish <post id> [--action <id>]
 *   node scripts/ingest-article.mjs unpublish <post id>
 *   node scripts/ingest-article.mjs feedback [--days 28] [--summary]
 *
 * --file is markdown; when it starts with "# Title" and --title is not given,
 * that line is the title and is left out of the body. --faq is a JSON file
 * holding [{ "q": "...", "a": "..." }]. A publish the guard holds, or a patch
 * the guard refuses on a live post, exits 2 and prints the reasons; any other
 * failure exits 1.
 *
 * Common: --site (default ARTICLE_INGEST_SITE, PROJECT_INGEST_SITE, then
 * https://www.lavacagc.com), --token (default PROJECT_INGEST_TOKEN).
 * Node 18+ (global fetch). No dependencies.
 */
import { readFileSync } from 'node:fs';

const COMMANDS = new Set(['create', 'patch', 'publish', 'unpublish', 'feedback']);
const FLAGS = new Set(['publish', 'dry-run', 'summary', 'help']);
const VALUE_OPTIONS = new Set([
  'site', 'token', 'file', 'title', 'slug', 'category', 'excerpt', 'meta-title', 'meta-description',
  'keywords', 'image', 'faq', 'action', 'days', 'content',
]);

function usage(code = 0) {
  const text = readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(2, 22).map((l) => l.replace(/^ \* ?/, '')).join('\n');
  (code ? console.error : console.log)(text);
  process.exit(code);
}

function fail(message, code = 1) {
  console.error(`ingest-article: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const out = { positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) { out.positional.push(arg); continue; }
    const [name, inline] = arg.slice(2).split(/=(.*)/s);
    if (FLAGS.has(name)) { out[name] = true; continue; }
    if (!VALUE_OPTIONS.has(name)) fail(`Unknown option --${name}`);
    const value = inline ?? argv[++i];
    if (value === undefined) fail(`--${name} needs a value`);
    out[name] = value;
  }
  return out;
}

/** Title from a leading `# ` line, and the body without it. */
function splitMarkdown(markdown) {
  const text = markdown.replace(/^﻿/, '');
  const match = /^\s*#\s+(.+?)\s*\r?\n/.exec(text);
  if (!match) return { title: null, body: text.trim() };
  return { title: match[1].trim(), body: text.slice(match[0].length).trim() };
}

function readJsonFile(path, what) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    fail(`${what} ${path}: ${err instanceof Error ? err.message : err}`);
  }
}

/** The JSON body for create or patch, from the options given. */
function articleBody(opts, { requireAll }) {
  const body = {};
  let title = opts.title ?? null;
  if (opts.file || opts.content !== undefined) {
    let markdown = opts.content ?? '';
    if (opts.file) {
      try { markdown = readFileSync(opts.file, 'utf8'); } catch { fail(`No such file: ${opts.file}`); }
    }
    const split = splitMarkdown(markdown);
    body.content = split.body;
    if (!title && split.title) title = split.title;
  }
  if (title) body.title = title;
  if (opts.slug) body.slug = opts.slug;
  if (opts.category) body.category = opts.category;
  if (opts.excerpt) body.excerpt = opts.excerpt;
  if (opts['meta-title']) body.meta_title = opts['meta-title'];
  if (opts['meta-description']) body.meta_description = opts['meta-description'];
  if (opts.keywords) body.meta_keywords = opts.keywords;
  if (opts.image) body.featured_image = opts.image;
  if (opts.faq) body.faq = readJsonFile(opts.faq, 'FAQ file');
  if (opts.action) body.action_id = opts.action;
  if (requireAll) {
    for (const [key, flag] of [['title', '--title or a "# Title" line'], ['content', '--file'], ['category', '--category']]) {
      if (!body[key]) fail(`create needs ${flag}`);
    }
  }
  return body;
}

async function api(ctx, method, path, body) {
  if (ctx.dryRun) {
    console.log(JSON.stringify({ method, url: `${ctx.site}${path}`, body: body ?? null }, null, 2));
    return { status: 0, data: {} };
  }
  let res;
  try {
    res = await fetch(`${ctx.site}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${ctx.token}`,
        // The site's bot filter refuses curl-like agents; this CLI is first-party.
        'User-Agent': 'Mozilla/5.0 (compatible; LaVacaArticleCLI/1.0)',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (err) {
    fail(`${method} ${path}: ${err instanceof Error ? err.message : err}`);
  }
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text.slice(0, 300) }; }
  return { status: res.status, data };
}

function explain(status, data, what) {
  if (status === 404 && data.error === 'Not found') {
    return `${what}: 404. Either the id is wrong or PROJECT_INGEST_TOKEN is not set on the site (the routes stay dark without it).`;
  }
  const issues = Array.isArray(data.issues) ? `\n${data.issues.map((i) => `  - ${i.path || '(body)'}: ${i.message}`).join('\n')}` : '';
  return `${what} failed (${status}): ${data.error ?? 'unknown error'}${issues}`;
}

async function publish(ctx, id, actionId) {
  const { status, data } = await api(ctx, 'POST', `/api/articles/ingest/${id}/publish`, actionId ? { action_id: actionId } : undefined);
  if (ctx.dryRun) return;
  if (status === 409 && data.published === false) {
    console.error('Held for review, not published:');
    for (const reason of data.hold ?? []) console.error(`  - ${reason}`);
    console.error(`Fix the article and publish again, or leave it for Alex: ${data.adminUrl}`);
    if (data.telegram) console.error(`Telegram to Alex: ${data.telegram}`);
    process.exit(2);
  }
  if (status !== 200) fail(explain(status, data, 'publish'));
  console.log(`Published: ${data.url}`);
  if (data.unpublish_url) console.log(`Unpublish link (7 days): ${data.unpublish_url}`);
  if (data.telegram) console.log(`Telegram to Alex: ${data.telegram}`);
}

function summarize(feedback) {
  const lines = [`Window: ${feedback.window.startDate} to ${feedback.window.endDate} (${feedback.window.days} days)`];
  const decaying = feedback.pages.filter((p) => p.decaying);
  lines.push(`Pages: ${feedback.pages.length} of ${feedback.pages_total}, ${decaying.length} decaying`);
  for (const p of decaying.slice(0, 10)) {
    lines.push(`  ${p.path}  clicks ${p.clicks}, trend ${p.trend_delta}${p.post ? `, post ${p.post.id}` : ''}`);
  }
  lines.push(`Open actions: ${feedback.open_actions.length}`);
  for (const a of feedback.open_actions.slice(0, 10)) {
    lines.push(`  ${a.id}  ${a.kind} (${a.status})  ${a.target.post?.slug ?? a.target.query ?? ''}`);
  }
  lines.push(`New article candidates: ${feedback.new_article_candidates.length}`);
  for (const c of feedback.new_article_candidates.slice(0, 5)) lines.push(`  "${c.query}"  ${c.impressions} impressions`);
  if (Array.isArray(feedback.facts)) {
    lines.push('Locked facts (quote verbatim):');
    for (const f of feedback.facts) lines.push(`  ${f.key}: ${f.value}`);
  }
  if (Array.isArray(feedback.counties)) lines.push(`Counties: ${feedback.counties.join(', ')}`);
  return lines.join('\n');
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === '--help' || command === 'help') usage(0);
  if (!COMMANDS.has(command)) usage(1);
  const opts = parseArgs(rest);
  if (opts.help) usage(0);

  const ctx = {
    site: (opts.site ?? process.env.ARTICLE_INGEST_SITE ?? process.env.PROJECT_INGEST_SITE ?? 'https://www.lavacagc.com').replace(/\/+$/, ''),
    token: opts.token ?? process.env.PROJECT_INGEST_TOKEN ?? '',
    dryRun: !!opts['dry-run'],
  };
  if (!ctx.token && !ctx.dryRun) fail('Set PROJECT_INGEST_TOKEN or pass --token.');

  const needId = () => {
    const id = opts.positional[0];
    if (!id) fail(`${command} needs the post id`);
    return id;
  };

  if (command === 'create') {
    const body = articleBody(opts, { requireAll: true });
    const { status, data } = await api(ctx, 'POST', '/api/articles/ingest', body);
    if (ctx.dryRun) return;
    if (status !== 201) fail(explain(status, data, 'create'));
    console.log(`Draft created: ${data.id}`);
    console.log(`Slug:          ${data.slug}`);
    console.log(`Preview:       ${data.previewUrl}`);
    console.log(`Admin:         ${data.adminUrl}`);
    if (data.action) console.log(`Action:        ${data.action.id} is ${data.action.status}${data.action.validation?.ok === false ? ` (fact-lock: ${data.action.validation.issues.join('; ')})` : ''}`);
    if (opts.publish) await publish(ctx, data.id, opts.action);
    return;
  }

  if (command === 'patch') {
    const id = needId();
    const body = articleBody(opts, { requireAll: false });
    if (Object.keys(body).filter((k) => k !== 'action_id').length === 0) fail('patch needs at least one field to change');
    const { status, data } = await api(ctx, 'PATCH', `/api/articles/ingest/${id}`, body);
    if (ctx.dryRun) return;
    if (status === 409 && Array.isArray(data.hold)) {
      console.error('Refused: this post is live and the change would not pass the publish guard. Nothing was changed.');
      for (const reason of data.hold) console.error(`  - ${reason}`);
      process.exit(2);
    }
    if (status !== 200) fail(explain(status, data, 'patch'));
    console.log(`Updated: ${data.id} (${data.published ? 'published' : 'draft'})  ${data.slug}`);
    if (data.action) console.log(`Action:  ${data.action.id} is ${data.action.status}. ${data.action.note ?? ''}`.trim());
    return;
  }

  if (command === 'publish') {
    await publish(ctx, needId(), opts.action);
    return;
  }

  if (command === 'unpublish') {
    const { status, data } = await api(ctx, 'POST', `/api/articles/ingest/${needId()}/unpublish`);
    if (ctx.dryRun) return;
    if (status !== 200) fail(explain(status, data, 'unpublish'));
    console.log(`Unpublished: ${data.id}  ${data.slug}`);
    return;
  }

  // feedback
  const days = opts.days ? `?days=${encodeURIComponent(opts.days)}` : '';
  const { status, data } = await api(ctx, 'GET', `/api/articles/seo-feedback${days}`);
  if (ctx.dryRun) return;
  if (status !== 200) fail(explain(status, data, 'feedback'));
  console.log(opts.summary ? summarize(data) : JSON.stringify(data, null, 2));
}

main();
