import { test, expect } from '@playwright/test';
import { createServer, type IncomingMessage, type Server } from 'http';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFile } from 'child_process';
import type { AddressInfo } from 'net';
import { checkSocialCopy, parseSocialMarkdown } from '../src/lib/articles/socialCopy';
import { catalogPricesFrom } from '../src/lib/articles/catalogPrices';
import { HOME_SERVICES_SEED } from '../src/lib/home-services/catalogSeed';

/**
 * scripts/postiz-drafts.mjs queues an article's social copy in Postiz as
 * drafts (Alex 2026-10-29). Stub-backed: the pure parsing and per-channel
 * mapping are imported from the script, and the CLI runs against a stub
 * Postiz public API that records what it was sent. No real Postiz is touched.
 */

type Drafts = typeof import('../scripts/postiz-drafts.mjs');
const load = () => import('../scripts/postiz-drafts.mjs') as Promise<Drafts>;

const SLUG = 'when-to-clean-gutters-in-essex-county';
const ARTICLE = `https://www.lavacagc.com/blog/${SLUG}`;
const FILE = [
  '# Social copy: When should you clean gutters in Essex County?',
  '',
  `Article: ${ARTICLE}`,
  'Date: 2026-10-30',
  '',
  '## Instagram and Facebook',
  'Leaves in your gutters again?',
  '',
  'Late fall is the time to clean gutters in Essex County. Clogged gutters push water toward your foundation. Wait until the trees are bare.',
  '',
  'Book it here: https://www.lavacagc.com/home-services/gutter-cleaning',
  '',
  '## Google Business',
  `Clean your gutters in late fall, after the oaks and maples drop their leaves. We serve Essex County. Read more: ${ARTICLE}`,
  '',
  '## X',
  `Clean gutters in late fall, after the leaves drop. ${ARTICLE}`,
  '',
  '## Threads',
  `Most people clean gutters too early. Wait until the trees are bare, then do it once. When do you clean yours? #EssexCounty ${ARTICLE}`,
  '',
  '## Hashtags',
  '#GutterCleaning #EssexCounty #NJHomes',
  '',
].join('\n');

const INTEGRATIONS = [
  { id: 'int-tiktok', identifier: 'tiktok', disabled: false },
  { id: 'int-pin', identifier: 'pinterest', disabled: false },
  { id: 'int-ig', identifier: 'instagram', disabled: false },
  { id: 'int-x', identifier: 'x', disabled: false },
  { id: 'int-threads', identifier: 'threads', disabled: false },
  { id: 'int-fb-old', identifier: 'facebook', disabled: true },
  { id: 'int-fb', identifier: 'facebook', disabled: false },
  { id: 'int-gmb', identifier: 'gmb', disabled: false },
];

test.describe('postiz-drafts: parsing and the per-channel mapping', () => {
  test('the file parses into the four text posts, the same way the publish route reads it', async () => {
    const { parseSocialFile, channelTexts, fileProblems } = await load();
    const copy = parseSocialFile(FILE);
    expect(copy.title).toBe('When should you clean gutters in Essex County?');
    expect(copy.articleUrl).toBe(ARTICLE);
    expect(copy.date).toBe('2026-10-30');
    expect(copy.threads).toBe(`Most people clean gutters too early. Wait until the trees are bare, then do it once. When do you clean yours? #EssexCounty ${ARTICLE}`);
    expect(copy.hashtags).toEqual(['#GutterCleaning', '#EssexCounty', '#NJHomes']);
    // The script and the publish route agree on every section.
    const route = parseSocialMarkdown(FILE);
    expect([copy.instagram, copy.google, copy.x, copy.threads]).toEqual([route.instagram, route.google, route.x, route.threads]);
    expect(checkSocialCopy(route, SLUG, { contentFacts: [], catalogPrices: catalogPricesFrom(HOME_SERVICES_SEED) })).toEqual([]);
    expect(fileProblems(copy)).toEqual([]);

    const texts = channelTexts(copy);
    expect(texts.facebook.endsWith('\n\n#GutterCleaning #EssexCounty #NJHomes')).toBe(true);
    expect(texts.facebook.startsWith('Leaves in your gutters again?')).toBe(true);
    expect(texts.gmb).toBe(copy.google);
    expect(texts.x).toBe(copy.x);

    const missing = parseSocialFile(FILE.replace(/## Threads[\s\S]*?## Hashtags/, '## Hashtags'));
    expect(fileProblems(missing)).toEqual(['the "Threads" section is missing']);
    expect(fileProblems(parseSocialFile(FILE.replace(`Article: ${ARTICLE}`, 'Article: https://www.lavacagc.com/about'))))
      .toEqual([
        'the "Article:" line must be the article URL (.../blog/<slug>)',
        'the "Threads" post must contain the article URL', 'the "X" post must contain the article URL', 'the "Google Business" post must contain the article URL',
      ]);
    // X, Threads and Google Business must carry the article URL (the caption links to the service page).
    expect(fileProblems(parseSocialFile(FILE.replace(`Clean gutters in late fall, after the leaves drop. ${ARTICLE}`, 'Clean gutters in late fall.'))))
      .toEqual(['the "X" post must contain the article URL']);
  });

  test('one draft request: facebook, threads, x and gmb with their settings; media channels skipped', async () => {
    const { parseSocialFile, pickIntegrations, buildRequest, toPostizHtml } = await load();
    const copy = parseSocialFile(FILE);
    const { picked, notes } = pickIntegrations(INTEGRATIONS);
    expect(Object.fromEntries(Object.entries(picked).map(([c, i]) => [c, i.id])))
      .toEqual({ facebook: 'int-fb', threads: 'int-threads', x: 'int-x', gmb: 'int-gmb' });
    expect(notes).toEqual(['tiktok, pinterest, instagram: skipped, they need media']);

    const body = buildRequest({ copy, picked, date: '2026-10-30T14:00:00.000Z' });
    expect(body.type).toBe('draft');
    expect(body.shortLink).toBe(false);
    expect(body.tags).toEqual([]);
    expect(body.posts.map((p) => [p.integration.id, p.settings])).toEqual([
      ['int-fb', { __type: 'facebook', post_type: 'post', url: ARTICLE }],
      ['int-threads', { __type: 'threads' }],
      ['int-x', { __type: 'x', who_can_reply_post: 'everyone' }],
      ['int-gmb', { __type: 'gmb', topicType: 'STANDARD', callToActionType: 'LEARN_MORE', callToActionUrl: ARTICLE }],
    ]);
    expect(body.posts[2].value).toEqual([{ content: `<p>Clean gutters in late fall, after the leaves drop. ${ARTICLE}</p>`, image: [] }]);
    expect(toPostizHtml('A & <b>\n\nB')).toBe('<p>A &amp; &lt;b&gt;</p><p></p><p>B</p>');

    // A skipped channel is left out; nothing else changes.
    const some = buildRequest({ copy, picked, skip: { x: { id: 'p', state: 'DRAFT', reason: 'same article URL' } }, date: body.date });
    expect(some.posts.map((p) => p.settings.__type)).toEqual(['facebook', 'threads', 'gmb']);
  });

  test('dedup: same URL or near-identical text on the same channel, ignoring errored posts', async () => {
    const { parseSocialFile, pickIntegrations, channelTexts, findDuplicates, toPostizHtml, similarity } = await load();
    const copy = parseSocialFile(FILE);
    const { picked } = pickIntegrations(INTEGRATIONS);
    const texts = channelTexts(copy);
    const posts = [
      // X already has the article (http and no www: still the same URL).
      { id: 'p1', state: 'QUEUE', content: `<p>Old wording. http://lavacagc.com/blog/${SLUG}/</p>`, integration: { id: 'int-x' } },
      // Facebook has the caption with one word changed.
      { id: 'p2', state: 'PUBLISHED', content: toPostizHtml(texts.facebook.replace('again', 'agian')), integration: { id: 'int-fb' } },
      // Threads only has an errored attempt: fair to retry.
      { id: 'p3', state: 'ERROR', content: toPostizHtml(texts.threads), integration: { id: 'int-threads' } },
      // The same GMB text on another channel does not count.
      { id: 'p4', state: 'DRAFT', content: toPostizHtml(texts.gmb), integration: { id: 'int-other' } },
      // A different article on GMB.
      { id: 'p5', state: 'DRAFT', content: '<p>Paint your deck in spring. https://www.lavacagc.com/blog/deck-paint</p>', integration: { id: 'int-gmb' } },
    ];
    expect(findDuplicates(posts, picked, texts, copy.articleUrl)).toEqual({
      x: { id: 'p1', state: 'QUEUE', reason: 'same article URL' },
      facebook: { id: 'p2', state: 'PUBLISHED', reason: expect.stringMatching(/^text \d+% similar$/) },
    });
    expect(similarity('Clean gutters in fall', 'Paint the deck in spring')).toBeLessThan(0.9);
  });

  test('plain messages for 401, Cloudflare and the 90-an-hour limit; CF headers only as a pair', async () => {
    const { explainStatus, headersFor } = await load();
    expect(explainStatus(401, 'GET /integrations')).toContain('Postiz refused the API key');
    expect(explainStatus(403, 'GET /integrations')).toContain('Cloudflare Access');
    expect(explainStatus(302, 'GET /integrations')).toContain('Cloudflare Access');
    expect(explainStatus(429, 'POST /posts')).toContain('its API_LIMIT setting');
    expect(headersFor({ POSTIZ_API_KEY: 'k' })).toEqual({ Authorization: 'k', 'Content-Type': 'application/json' });
    expect(headersFor({ POSTIZ_API_KEY: 'k', CF_ACCESS_CLIENT_ID: 'id' })).toEqual({ Authorization: 'k', 'Content-Type': 'application/json' });
    expect(headersFor({ POSTIZ_API_KEY: 'k', CF_ACCESS_CLIENT_ID: 'id', CF_ACCESS_CLIENT_SECRET: 's' })).toMatchObject({
      'CF-Access-Client-Id': 'id', 'CF-Access-Client-Secret': 's',
    });
  });
});

// ---------------------------------------------------------------------------
// The CLI against a stub Postiz
// ---------------------------------------------------------------------------

interface Seen { method: string; url: string; headers: IncomingMessage['headers']; body: unknown }

async function stubPostiz(opts: { posts?: Array<{ publishDate?: string; [key: string]: unknown }>; createStatus?: number; redirect?: string } = {}) {
  const seen: Seen[] = [];
  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      seen.push({ method: req.method!, url: req.url!, headers: req.headers, body: raw ? JSON.parse(raw) : null });
      const send = (status: number, data: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
      if (opts.redirect) { res.writeHead(302, { Location: opts.redirect }); return res.end(); }
      if (req.headers.authorization !== 'test-key') return send(401, { msg: 'Unauthorized' });
      if (req.method === 'GET' && req.url === '/api/public/v1/integrations') return send(200, INTEGRATIONS);
      if (req.method === 'GET' && req.url!.startsWith('/api/public/v1/posts?')) {
        // Like Postiz: only posts dated inside [startDate, endDate].
        const q = new URL(req.url!, 'http://stub').searchParams;
        const from = Date.parse(q.get('startDate')!);
        const to = Date.parse(q.get('endDate')!);
        const inWindow = (opts.posts ?? []).filter((p) => !p.publishDate || (Date.parse(p.publishDate) >= from && Date.parse(p.publishDate) <= to));
        return send(200, { posts: inWindow });
      }
      if (req.method === 'POST' && req.url === '/api/public/v1/posts') {
        if (opts.createStatus) return send(opts.createStatus, { msg: 'ThrottlerException: Too Many Requests' });
        const body = JSON.parse(raw) as { posts: Array<{ integration: { id: string } }> };
        return send(201, body.posts.map((p, i) => ({ postId: `post-${i}`, integration: p.integration.id })));
      }
      return send(404, {});
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, seen, close: () => new Promise<void>((r) => server.close(() => r())) };
}

function cli(args: string[], env: Record<string, string>) {
  return new Promise<{ code: number; out: string; err: string }>((resolve) => {
    execFile('node', ['scripts/postiz-drafts.mjs', ...args], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '', ...env } as unknown as NodeJS.ProcessEnv,
    }, (error, stdout, stderr) => {
      resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, out: stdout, err: stderr });
    });
  });
}

test.describe('postiz-drafts: the CLI against a stub Postiz', () => {
  const dir = mkdtempSync(join(tmpdir(), 'postiz-drafts-'));
  const file = join(dir, `${SLUG}.md`);
  writeFileSync(file, FILE);

  test('creates one draft request with the key as is and the Cloudflare headers', async () => {
    const stub = await stubPostiz();
    try {
      const r = await cli(['--file', file, '--postiz', stub.url, '--date', '2026-11-02T14:00:00Z'], {
        POSTIZ_API_KEY: 'test-key', CF_ACCESS_CLIENT_ID: 'cf-id', CF_ACCESS_CLIENT_SECRET: 'cf-secret',
      });
      expect(r.code, r.err).toBe(0);
      const posts = stub.seen.filter((s) => s.method === 'POST');
      expect(posts).toHaveLength(1);
      const body = posts[0].body as { type: string; date: string; posts: Array<{ settings: { __type: string } }> };
      expect(body.type).toBe('draft');
      expect(body.date).toBe('2026-11-02T14:00:00Z');
      expect(body.posts.map((p) => p.settings.__type)).toEqual(['facebook', 'threads', 'x', 'gmb']);
      for (const s of stub.seen) {
        expect(s.headers.authorization).toBe('test-key');
        expect(s.headers['cf-access-client-id']).toBe('cf-id');
        expect(s.headers['cf-access-client-secret']).toBe('cf-secret');
      }
      expect(r.out).toContain('facebook: draft post-0');
      expect(r.out).toContain('gmb: draft post-3');
      expect(r.out).toContain('Nothing was published or scheduled.');
    } finally {
      await stub.close();
    }
  });

  test('skips channels that already have the post, and creates nothing when all do', async () => {
    const { parseSocialFile, channelTexts, toPostizHtml } = await load();
    const texts = channelTexts(parseSocialFile(FILE));
    const existing = (['facebook', 'threads', 'x', 'gmb'] as const).map((c, i) => ({
      id: `old-${i}`, state: 'DRAFT', content: toPostizHtml(texts[c]), integration: { id: { facebook: 'int-fb', threads: 'int-threads', x: 'int-x', gmb: 'int-gmb' }[c] },
    }));
    const partial = await stubPostiz({ posts: existing.slice(2) });
    try {
      const r = await cli(['--file', file, '--postiz', partial.url], { POSTIZ_API_KEY: 'test-key' });
      expect(r.code, r.err).toBe(0);
      const body = partial.seen.find((s) => s.method === 'POST')!.body as { posts: Array<{ settings: { __type: string } }> };
      expect(body.posts.map((p) => p.settings.__type)).toEqual(['facebook', 'threads']);
      expect(r.out).toContain('x: already in Postiz (post old-2, DRAFT, same article URL), skipped');
    } finally {
      await partial.close();
    }
    const full = await stubPostiz({ posts: existing });
    try {
      const r = await cli(['--file', file, '--postiz', full.url], { POSTIZ_API_KEY: 'test-key' });
      expect(r.code, r.err).toBe(0);
      expect(full.seen.some((s) => s.method === 'POST')).toBe(false);
      expect(r.out).toContain('Nothing to create.');
    } finally {
      await full.close();
    }
  });

  test('a far --date still finds its own drafts: the look-up covers today and that date', async () => {
    const { parseSocialFile, channelTexts, toPostizHtml, dedupWindow } = await load();
    const far = '2027-03-01T14:00:00Z';
    const now = Date.parse('2026-10-29T12:00:00Z');
    const w = dedupWindow(now, Date.parse(far));
    expect(Date.parse(w.startDate)).toBeLessThan(now);
    expect(Date.parse(w.endDate)).toBeGreaterThan(Date.parse(far));
    const back = dedupWindow(Date.parse(far), now); // a --date in the past works the same way
    expect(back).toEqual(w);

    const texts = channelTexts(parseSocialFile(FILE));
    const ids = { facebook: 'int-fb', threads: 'int-threads', x: 'int-x', gmb: 'int-gmb' } as const;
    const existing = (Object.keys(ids) as Array<keyof typeof ids>).map((c, i) => ({
      id: `far-${i}`, state: 'DRAFT', publishDate: '2027-03-01T14:00:00.000Z', content: toPostizHtml(texts[c]), integration: { id: ids[c] },
    }));
    const stub = await stubPostiz({ posts: existing });
    try {
      const r = await cli(['--file', file, '--postiz', stub.url, '--date', far], { POSTIZ_API_KEY: 'test-key' });
      expect(r.code, r.err).toBe(0);
      expect(stub.seen.some((s) => s.method === 'POST')).toBe(false);
      expect(r.out).toContain('Nothing to create.');
      const q = new URL(stub.seen.find((s) => s.url.startsWith('/api/public/v1/posts?'))!.url, 'http://stub').searchParams;
      expect(Date.parse(q.get('startDate')!)).toBeLessThan(Date.now());
      expect(Date.parse(q.get('endDate')!)).toBeGreaterThan(Date.parse(far));
    } finally {
      await stub.close();
    }
  });

  test('a Cloudflare Access redirect to its login page exits 1 naming the service token', async () => {
    const stub = await stubPostiz({ redirect: 'https://old-field-2a50.cloudflareaccess.com/cdn-cgi/access/login/postiz.lavacagc.com' });
    try {
      const r = await cli(['--file', file, '--postiz', stub.url], { POSTIZ_API_KEY: 'test-key' });
      expect(r.code).toBe(1);
      expect(r.err).toContain('GET /integrations: 302, stopped by Cloudflare Access in front of Postiz. Set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET');
      expect(stub.seen).toHaveLength(1); // the redirect is not followed
    } finally {
      await stub.close();
    }
  });

  test('dry run sends no POST; 401 and 429 exit 1 with a plain message', async () => {
    const stub = await stubPostiz({ createStatus: 429 });
    try {
      const dry = await cli(['--file', file, '--postiz', stub.url, '--dry-run'], { POSTIZ_API_KEY: 'test-key' });
      expect(dry.code, dry.err).toBe(0);
      expect(stub.seen.some((s) => s.method === 'POST')).toBe(false);
      const printed = JSON.parse(dry.out.slice(dry.out.indexOf('{'), dry.out.lastIndexOf('}') + 1)) as { method: string; body: { type: string } };
      expect(printed).toMatchObject({ method: 'POST', body: { type: 'draft' } });

      const bad = await cli(['--file', file, '--postiz', stub.url], { POSTIZ_API_KEY: 'wrong' });
      expect(bad.code).toBe(1);
      expect(bad.err).toContain('401, Postiz refused the API key');

      const limited = await cli(['--file', file, '--postiz', stub.url], { POSTIZ_API_KEY: 'test-key' });
      expect(limited.code).toBe(1);
      expect(limited.err).toContain("429, over Postiz's hourly limit on post creations for the organization (its API_LIMIT setting");
    } finally {
      await stub.close();
    }
  });
});
