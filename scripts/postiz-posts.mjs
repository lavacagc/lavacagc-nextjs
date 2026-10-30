#!/usr/bin/env node
/**
 * Publish an article's social copy through Postiz: the text channels, right
 * away by default (decision 007, Alex 2026-10-29: article posts go out
 * without his approval), or at a given time, or as drafts on request.
 *
 *   node scripts/postiz-posts.mjs --file docs/social/<slug>.md --postiz <url> [--date <ISO> | --draft] [--dry-run]
 *
 * --file    the social copy file the article skill wrote (docs/social/<slug>.md).
 * --postiz  the Postiz origin, e.g. http://localhost:4007 (default POSTIZ_URL).
 * --date    schedule the posts for this time instead of publishing now.
 * --draft   create drafts in the calendar (tomorrow 14:00 UTC, or --date) and
 *           publish nothing; the pre-007 behaviour, for a run Alex wants to see first.
 * --dry-run print the POST it would send; nothing is created. With a key it
 *           still reads the channels and recent posts (read-only); without
 *           one it uses placeholder channel ids and skips the dedup.
 *
 * Env: POSTIZ_API_KEY (sent as "Authorization: <key>", no Bearer prefix),
 * and, for the hosted instance behind Cloudflare Access, CF_ACCESS_CLIENT_ID
 * and CF_ACCESS_CLIENT_SECRET (a service token).
 *
 * One POST /api/public/v1/posts carries one entry per text channel: facebook
 * (the caption and hashtags), threads, x and gmb. Pinterest, Instagram and
 * TikTok are skipped because they need media. Before creating, GET /posts
 * lists from 60 days before the earlier of today and the post date to 60
 * days after the later of them; a channel that already has a live (not
 * errored) post with this article URL or a near-identical text is skipped,
 * so a re-run never posts twice. After a "now" publish it reads each post
 * back (up to 45 s) and prints published with its link, or FAILED. Exits 0
 * when done (including "all skipped"), 2 when Postiz accepted the posts but a
 * channel failed to publish, 1 on any other failure. Node 18+ (global fetch).
 * No dependencies. Docs: docs/articles-ingest.md.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Postiz post types: "now" publishes as soon as the request is accepted,
 * "schedule" publishes at `date`, "draft" sits in the calendar and starts no
 * publishing workflow.
 */
export const POST_TYPES = ['now', 'schedule', 'draft'];
/** The text channels, in the order they are sent. */
export const CHANNELS = ['facebook', 'threads', 'x', 'gmb'];
/** Connected channels this script never posts to: they need an image or video. */
export const MEDIA_ONLY = ['instagram', 'instagram-standalone', 'pinterest', 'tiktok'];
/** Same limits as src/lib/articles/socialCopy.ts. */
export const LIMITS = { facebook: 2200, threads: 500, x: 280, gmb: 1500 };
/** Text similarity at or above this counts as the same post (as postiz_dedup.py). */
export const SIMILAR = 0.9;
const DEDUP_WINDOW_DAYS = 60;

class CliError extends Error {}

// ---------------------------------------------------------------------------
// The social file (same shape and heading rules as parseSocialMarkdown)
// ---------------------------------------------------------------------------

function sectionOf(heading) {
  const h = heading.toLowerCase().trim();
  if (/instagram|facebook/.test(h)) return 'instagram';
  if (/google/.test(h)) return 'google';
  if (/hashtag/.test(h)) return 'hashtags';
  if (/threads/.test(h)) return 'threads';
  if (/^x\b|twitter/.test(h)) return 'x';
  return null;
}

/** Read docs/social/<slug>.md into { title, articleUrl, date, instagram, google, x, threads, hashtags }. */
export function parseSocialFile(markdown) {
  const text = markdown.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const sections = { instagram: [], google: [], x: [], threads: [], hashtags: [] };
  let current = null;
  let title = null;
  for (const line of text.split('\n')) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) { current = sectionOf(heading[1]); continue; }
    const top = /^#\s+(.+?)\s*$/.exec(line);
    if (top) {
      title = title ?? top[1].replace(/^social copy:\s*/i, '');
      current = null;
      continue;
    }
    if (current) sections[current].push(line);
  }
  const body = (s) => sections[s].join('\n').trim();
  return {
    title,
    articleUrl: /^Article:\s*(\S+)\s*$/im.exec(text)?.[1] ?? null,
    date: /^Date:\s*(\d{4}-\d{2}-\d{2})\s*$/im.exec(text)?.[1] ?? null,
    instagram: body('instagram'),
    google: body('google'),
    x: body('x'),
    threads: body('threads'),
    hashtags: body('hashtags').split(/\s+/).filter(Boolean),
  };
}

/** The text each channel gets. Facebook is the caption plus the hashtags; the others are their own post. */
export function channelTexts(copy) {
  const tags = copy.hashtags.join(' ');
  return {
    facebook: [copy.instagram, tags].filter(Boolean).join('\n\n'),
    threads: copy.threads,
    x: copy.x,
    gmb: copy.google,
  };
}

/** Every reason the file cannot be queued; empty means it can. The full claim check ran at publish. */
export function fileProblems(copy) {
  const problems = [];
  let url = null;
  try { url = new URL(copy.articleUrl ?? ''); } catch { /* reported below */ }
  if (!url || !/^\/blog\/[a-z0-9-]+\/?$/.test(url.pathname)) problems.push('the "Article:" line must be the article URL (.../blog/<slug>)');
  const texts = channelTexts(copy);
  const names = { facebook: 'Instagram and Facebook', threads: 'Threads', x: 'X', gmb: 'Google Business' };
  const key = url ? urlKey(url.href) : null;
  for (const channel of CHANNELS) {
    const t = channel === 'facebook' ? copy.instagram : texts[channel];
    // Threads got its own section after the first social files were written
    // (PR #111); a file without one posts to the other three channels.
    if (!t && channel === 'threads') continue;
    if (!t) problems.push(`the "${names[channel]}" section is missing`);
    else if (texts[channel].length > LIMITS[channel]) problems.push(`the ${channel} text has ${texts[channel].length} characters; the limit is ${LIMITS[channel]}`);
    else if (channel !== 'facebook' && key && !urlKeysIn(texts[channel]).includes(key)) problems.push(`the "${names[channel]}" post must contain the article URL`);
  }
  return problems;
}

/** Postiz stores posts as HTML from its editor: one <p> per line, an empty <p> for a blank line. */
export function toPostizHtml(text) {
  const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return text.split('\n').map((line) => `<p>${escape(line.trimEnd())}</p>`).join('');
}

/** Provider settings Postiz validates (CreatePostDto's per-provider DTOs). */
export function settingsFor(channel, articleUrl) {
  switch (channel) {
    case 'facebook': return { __type: 'facebook', post_type: 'post', url: articleUrl };
    case 'threads': return { __type: 'threads' };
    case 'x': return { __type: 'x', who_can_reply_post: 'everyone' };
    case 'gmb': return { __type: 'gmb', topicType: 'STANDARD', callToActionType: 'LEARN_MORE', callToActionUrl: articleUrl };
    default: throw new CliError(`No settings for channel ${channel}`);
  }
}

/** The first enabled integration per text channel, and what is not posted to and why. */
export function pickIntegrations(integrations) {
  const picked = {};
  const notes = [];
  for (const channel of CHANNELS) {
    const found = integrations.find((i) => i.identifier === channel && !i.disabled);
    if (found) picked[channel] = found;
    else notes.push(`${channel}: no enabled channel connected in Postiz, skipped`);
  }
  const media = [...new Set(integrations.filter((i) => MEDIA_ONLY.includes(i.identifier)).map((i) => i.identifier))];
  if (media.length) notes.push(`${media.join(', ')}: skipped, they need media`);
  return { picked, notes };
}

// ---------------------------------------------------------------------------
// Dedup against the posts Postiz already has
// ---------------------------------------------------------------------------

/** Plain lowercase text from Postiz HTML or from our text. */
export function normalizeText(s) {
  return String(s ?? '')
    .replace(/<\/p>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Dice coefficient on character bigrams, 0..1. */
export function similarity(a, b) {
  const x = normalizeText(a);
  const y = normalizeText(b);
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const grams = new Map();
  for (let i = 0; i < x.length - 1; i += 1) {
    const g = x.slice(i, i + 2);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < y.length - 1; i += 1) {
    const g = y.slice(i, i + 2);
    const n = grams.get(g) ?? 0;
    if (n > 0) { hits += 1; grams.set(g, n - 1); }
  }
  return (2 * hits) / (x.length - 1 + y.length - 1);
}

/** "https://www.lavacagc.com/blog/x/" -> "lavacagc.com/blog/x", so any scheme or www form matches. */
function urlKey(url) {
  return String(url).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
}

/** The URL keys of every link written in a text. */
function urlKeysIn(text) {
  return [...String(text).matchAll(/https?:\/\/[^\s<>"')]+/gi)].map((m) => urlKey(m[0].replace(/[.,;:!?]+$/, '')));
}

/**
 * For each channel we would post to, the existing post that makes it a
 * duplicate: same integration, not deleted (Postiz leaves those out), not
 * errored (a failed post is fair to retry), and either the article URL in its
 * text or a near-identical text.
 */
export function findDuplicates(posts, picked, texts, articleUrl) {
  const dupes = {};
  const key = urlKey(articleUrl);
  for (const [channel, integration] of Object.entries(picked)) {
    if (!texts[channel]) continue;
    for (const post of posts) {
      if (post.integration?.id !== integration.id || post.state === 'ERROR' || post.deletedAt) continue;
      const sameUrl = key && urlKeysIn(normalizeText(post.content)).includes(key);
      const score = similarity(post.content, texts[channel]);
      if (sameUrl || score >= SIMILAR) {
        dupes[channel] = { id: post.id, state: post.state, reason: sameUrl ? 'same article URL' : `text ${Math.round(score * 100)}% similar` };
        break;
      }
    }
  }
  return dupes;
}

/** The one POST /posts body: one entry per channel to post to, published, scheduled or drafted per `type`. */
export function buildRequest({ copy, picked, skip = {}, date, type = 'now' }) {
  if (!POST_TYPES.includes(type)) throw new CliError(`Unknown post type ${type}`);
  const texts = channelTexts(copy);
  const posts = CHANNELS.filter((c) => picked[c] && !skip[c]).map((channel) => ({
    integration: { id: picked[channel].id },
    value: [{ content: toPostizHtml(texts[channel]), image: [] }],
    settings: settingsFor(channel, copy.articleUrl),
  }));
  return { type, shortLink: false, date, tags: [], posts };
}

/**
 * The GET /posts window: 60 days either side of both today and the posts'
 * date, so a re-run with a far --date still finds its own posts.
 */
export function dedupWindow(now, date) {
  const day = 24 * 60 * 60 * 1000;
  return {
    startDate: new Date(Math.min(now, date) - DEDUP_WINDOW_DAYS * day).toISOString(),
    endDate: new Date(Math.max(now, date) + DEDUP_WINDOW_DAYS * day).toISOString(),
  };
}

/** Tomorrow at 14:00 UTC (10 in the morning in New Jersey for most of the year). */
export function defaultDate(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 14, 0, 0));
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

export function headersFor(env) {
  const headers = { Authorization: env.POSTIZ_API_KEY ?? '', 'Content-Type': 'application/json' };
  if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
    headers['CF-Access-Client-Id'] = env.CF_ACCESS_CLIENT_ID;
    headers['CF-Access-Client-Secret'] = env.CF_ACCESS_CLIENT_SECRET;
  }
  return headers;
}

/** A plain sentence for a failed Postiz call. */
export function explainStatus(status, what, body = '') {
  if (status === 401) return `${what}: 401, Postiz refused the API key. Check POSTIZ_API_KEY (Postiz Settings > Public API; it is sent without "Bearer").`;
  if (status === 403 || (status >= 300 && status < 400)) {
    return `${what}: ${status}, stopped by Cloudflare Access in front of Postiz. Set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET to a service token the Access policy allows.`;
  }
  if (status === 429) return `${what}: 429, over Postiz's hourly limit on post creations for the organization (its API_LIMIT setting, 90 unless the instance sets it). Wait for the hour to roll over and run this again; the dedup check keeps it from doubling anything.`;
  const detail = String(body).replace(/\s+/g, ' ').slice(0, 300);
  return `${what}: ${status}${detail ? ` ${detail}` : ''}`;
}

async function call(ctx, method, path, body) {
  let res;
  try {
    res = await fetch(`${ctx.api}${path}`, {
      method,
      headers: ctx.headers,
      redirect: 'manual', // Cloudflare Access answers a missing token with a redirect to its login page
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (err) {
    throw new CliError(`${method} ${path}: cannot reach Postiz at ${ctx.api} (${err instanceof Error ? err.message : err})`);
  }
  const text = await res.text();
  if (res.status < 200 || res.status >= 300) throw new CliError(explainStatus(res.status, `${method} ${path}`, text));
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    // An HTML page with a 200 is Cloudflare's login page served in place of the API.
    throw new CliError(explainStatus(403, `${method} ${path}`));
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const [name, inline] = arg.replace(/^--/, '').split(/=(.*)/s);
    if (!arg.startsWith('--')) throw new CliError(`Unexpected argument ${arg}`);
    if (name === 'dry-run' || name === 'help' || name === 'draft') { out[name] = true; continue; }
    if (!['file', 'postiz', 'date'].includes(name)) throw new CliError(`Unknown option --${name}`);
    const value = inline ?? argv[++i];
    if (value === undefined) throw new CliError(`--${name} needs a value`);
    out[name] = value;
  }
  return out;
}

/**
 * The Postiz origin from --postiz or POSTIZ_URL, tolerant of what a value
 * pasted into a dashboard picks up: surrounding whitespace, a trailing slash,
 * and a trailing period (the cloud routine's first POSTIZ_URL ended in one,
 * 2026-10-29, and every request went to "postiz.lavacagc.com."). A value
 * without a scheme gets https://. Empty stays empty; anything else that is
 * not a URL is a plain error.
 */
export function postizOrigin(value) {
  let v = (value ?? '').trim();
  if (!v) return '';
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  v = v.replace(/[/.]+$/, '');
  let url;
  try { url = new URL(v); } catch { throw new CliError(`${value} is not a URL; set POSTIZ_URL to the Postiz origin, like https://postiz.lavacagc.com`); }
  return url.origin;
}

export async function run(argv, env = process.env, log = console.log) {
  const opts = parseArgs(argv);
  if (opts.help) {
    const lines = readFileSync(new URL(import.meta.url), 'utf8').split('\n');
    log(lines.slice(2, lines.findIndex((l) => l.trim() === '*/')).map((l) => l.replace(/^ \* ?/, '')).join('\n'));
    return;
  }
  if (!opts.file) throw new CliError('--file docs/social/<slug>.md is required');
  let markdown;
  try { markdown = readFileSync(opts.file, 'utf8'); } catch { throw new CliError(`No such file: ${opts.file}`); }
  const copy = parseSocialFile(markdown);
  const problems = fileProblems(copy);
  if (problems.length) throw new CliError(`${opts.file} cannot be queued:\n${problems.map((p) => `  - ${p}`).join('\n')}`);

  // now: publish on acceptance. --date: schedule for then. --draft: drafts at --date or tomorrow 14:00 UTC.
  const type = opts.draft ? 'draft' : opts.date ? 'schedule' : 'now';
  const date = opts.date ?? (opts.draft ? defaultDate() : new Date().toISOString());
  if (Number.isNaN(Date.parse(date))) throw new CliError(`--date ${date} is not a date`);
  if (type === 'schedule' && Date.parse(date) < Date.now()) throw new CliError(`--date ${date} is in the past; drop it to publish now`);
  const origin = postizOrigin(opts.postiz ?? env.POSTIZ_URL);
  if (!origin) throw new CliError('Pass --postiz <url> or set POSTIZ_URL.');
  const dryRun = !!opts['dry-run'];
  const hasKey = !!env.POSTIZ_API_KEY;
  if (!hasKey && !dryRun) throw new CliError('Set POSTIZ_API_KEY.');
  if (!!env.CF_ACCESS_CLIENT_ID !== !!env.CF_ACCESS_CLIENT_SECRET) {
    log('Note: only one of CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET is set, so neither is sent.');
  }
  const ctx = { api: `${origin}/api/public/v1`, headers: headersFor(env) };

  let picked;
  let notes = [];
  let posts = [];
  if (hasKey) {
    const integrations = await call(ctx, 'GET', '/integrations');
    ({ picked, notes } = pickIntegrations(Array.isArray(integrations) ? integrations : []));
    const { startDate, endDate } = dedupWindow(Date.now(), Date.parse(date));
    const query = `startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
    posts = (await call(ctx, 'GET', `/posts?${query}`))?.posts ?? [];
  } else {
    picked = Object.fromEntries(CHANNELS.map((c) => [c, { id: `<${c} integration id>`, identifier: c }]));
    notes.push('dry run without POSTIZ_API_KEY: placeholder channel ids, dedup not checked');
  }

  const texts = channelTexts(copy);
  const skip = findDuplicates(posts, picked, texts, copy.articleUrl);
  if (!texts.threads) skip.threads = { missing: true };
  const body = buildRequest({ copy, picked, skip, date, type });

  for (const [channel, d] of Object.entries(skip)) {
    if (d.missing) log(`${channel}: no "Threads" section in the file, skipped`);
    else log(`${channel}: already in Postiz (post ${d.id}, ${d.state}, ${d.reason}), skipped`);
  }
  for (const note of notes) log(note);

  if (dryRun) {
    log(JSON.stringify({ method: 'POST', url: `${ctx.api}/posts`, body }, null, 2));
    log('Dry run: nothing was sent.');
    return;
  }
  if (body.posts.length === 0) {
    log('Nothing to create.');
    return;
  }
  const created = await call(ctx, 'POST', '/posts', body);
  log(`Postiz answered: ${JSON.stringify(created)}`);
  const byIntegration = Object.fromEntries(Object.entries(picked).map(([c, i]) => [i.id, c]));
  const rows = Array.isArray(created) ? created : [];
  const noun = type === 'draft' ? 'draft' : type === 'schedule' ? 'scheduled' : 'publishing';
  for (const row of rows) log(`${byIntegration[row.integration] ?? row.integration}: ${noun} ${row.postId}`);
  if (rows.length === 0) {
    log(`Postiz answered without post ids for "${copy.title ?? copy.articleUrl}"; check the calendar.`);
    return 0;
  }
  if (type === 'draft') {
    log(`Drafts for "${copy.title ?? copy.articleUrl}" are in the Postiz calendar on ${date.slice(0, 10)}. Nothing was published or scheduled.`);
    return 0;
  }
  if (type === 'schedule') {
    log(`Posts for "${copy.title ?? copy.articleUrl}" are scheduled in Postiz for ${date}.`);
    return 0;
  }
  // "now": read each post back until Postiz has published it or given up, so
  // the report says what actually went out (X failed on 2026-10-29 with the
  // account out of API credits, and the calendar was the only place it showed).
  const states = await awaitStates(ctx, rows.map((r) => r.postId), date, env);
  let live = 0;
  let failed = 0;
  let pending = 0;
  for (const row of rows) {
    const channel = byIntegration[row.integration] ?? row.integration;
    const s = states[row.postId];
    if (s?.state === 'PUBLISHED') { live += 1; log(`${channel}: published ${s.releaseURL ?? '(no link returned)'}`); }
    else if (s?.state === 'ERROR') { failed += 1; log(`${channel}: FAILED; Postiz could not post it (open the calendar entry for the provider's reason)`); }
    else { pending += 1; log(`${channel}: still ${s?.state ?? 'queued'} after ${Math.round(pollTimeoutMs(env) / 1000)} s; check the calendar`); }
  }
  const tally = [
    live && `${live} live`,
    failed && `${failed} failed`,
    pending && `${pending} still publishing (check the calendar)`,
  ].filter(Boolean).join(', ');
  log(`Posts for "${copy.title ?? copy.articleUrl}": ${tally}.${failed ? ' A re-run retries only the failed channels.' : ''}`);
  return failed ? 2 : 0;
}

const pollTimeoutMs = (env) => Number(env.POSTIZ_POLL_TIMEOUT_MS) || 45_000;

/** Poll GET /posts until every id is PUBLISHED or ERROR, or the timeout passes; returns { id: { state, releaseURL } }. */
export async function awaitStates(ctx, ids, date, env = process.env) {
  const every = Number(env.POSTIZ_POLL_MS) || 5_000;
  const deadline = Date.now() + pollTimeoutMs(env);
  const { startDate, endDate } = dedupWindow(Date.now(), Date.parse(date));
  const query = `startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
  let states = {};
  for (;;) {
    const listed = (await call(ctx, 'GET', `/posts?${query}`))?.posts ?? [];
    states = Object.fromEntries(listed.filter((p) => ids.includes(p.id)).map((p) => [p.id, { state: p.state, releaseURL: p.releaseURL ?? null }]));
    const settled = ids.every((id) => ['PUBLISHED', 'ERROR'].includes(states[id]?.state));
    if (settled || Date.now() >= deadline) return states;
    await new Promise((r) => setTimeout(r, every));
  }
}

const invokedDirectly = (() => {
  try { return realpathSync(process.argv[1] ?? '') === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();

if (invokedDirectly) {
  run(process.argv.slice(2)).then((code) => process.exit(code ?? 0), (err) => {
    console.error(`postiz-posts: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
}
