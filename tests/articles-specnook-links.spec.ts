import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'http';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFile } from 'child_process';
import type { AddressInfo } from 'net';
import { validateDraft } from '../src/lib/seo/draftGuardrails';

/**
 * SpecNook links (Alex 2026-10-29): `ingest-article.mjs specnook-articles`
 * lists SpecNook's blog from its sitemap so the article skill can add at most
 * two links where the topic overlaps. Stub-backed: a local server plays
 * www.specnook.app with a sitemap sample and two article pages.
 */

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>ORIGIN</loc><priority>1</priority></url>
<url><loc>ORIGIN/construction-selections-software</loc></url>
<url><loc>ORIGIN/blog</loc></url>
<url><loc>ORIGIN/blog/homeowner-construction-selections-guide</loc><lastmod>2026-08-24T00:00:00.000Z</lastmod></url>
<url><loc> ORIGIN/blog/how-to-reduce-construction-project-delays/ </loc></url>
<url><loc>ORIGIN/blog/homeowner-construction-selections-guide</loc></url>
<url><loc>ORIGIN/blog/missing-page</loc></url>
</urlset>`;

const PAGES: Record<string, string> = {
  '/blog/homeowner-construction-selections-guide': `<html><head>
<title>A Homeowner&#x27;s Guide to Construction Selections | SpecNook</title>
<meta property="og:title" content="A Homeowner&#x27;s Guide to Construction Selections: What to Expect and How to Prepare"/>
</head><body><nav><p>Skip this navigation paragraph, it comes before the heading.</p></nav>
<h1 class="text-3xl">A Homeowner&#x27;s Guide to Construction Selections</h1>
<p>Short.</p>
<p class="text-xl">What homeowners need to know about the material <strong>selection</strong> process during a remodel &amp; new build.</p>
<p>Second paragraph that should not be read.</p></body></html>`,
  '/blog/how-to-reduce-construction-project-delays': `<html><head><title>How to Reduce Construction Project Delays - SpecNook</title></head>
<body><h1>How to Reduce Construction Project Delays</h1><p>Most delays come from late decisions, not slow crews; here is how to keep a schedule.</p></body></html>`,
};

async function stubSpecNook() {
  let origin = '';
  const state = { sitemapHits: 0, withMissing: true };
  const server: Server = createServer((req, res) => {
    if (req.url === '/sitemap.xml') {
      state.sitemapHits += 1;
      res.writeHead(200, { 'Content-Type': 'application/xml' });
      const xml = state.withMissing ? SITEMAP : SITEMAP.replace(/<url><loc>ORIGIN\/blog\/missing-page<\/loc><\/url>\n/, '');
      return res.end(xml.replaceAll('ORIGIN', origin));
    }
    const page = PAGES[req.url ?? ''];
    res.writeHead(page ? 200 : 404, { 'Content-Type': 'text/html' });
    res.end(page ?? 'not found');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { origin, state, close: () => new Promise<void>((r) => server.close(() => r())) };
}

function cli(args: string[], env: Record<string, string>) {
  return new Promise<{ code: number; out: string; err: string }>((resolve) => {
    execFile('node', ['scripts/ingest-article.mjs', ...args], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '', ...env } as unknown as NodeJS.ProcessEnv,
    }, (error, stdout, stderr) => {
      resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, out: stdout, err: stderr });
    });
  });
}

test.describe('specnook-articles: the SpecNook blog from its sitemap', () => {
  test('lists each /blog/<slug> once with its title and first paragraph, without a token, and caches only a full read', async () => {
    const stub = await stubSpecNook();
    const tmp = mkdtempSync(join(tmpdir(), 'specnook-'));
    try {
      const first = await cli(['specnook-articles', '--specnook', stub.origin], { TMPDIR: tmp });
      expect(first.code, first.err).toBe(0);
      expect(first.out).toBe([
        'SpecNook blog: 3 articles',
        '',
        'homeowner-construction-selections-guide',
        "  Title: A Homeowner's Guide to Construction Selections: What to Expect and How to Prepare",
        `  URL:   ${stub.origin}/blog/homeowner-construction-selections-guide`,
        '  First paragraph: What homeowners need to know about the material selection process during a remodel & new build.',
        '',
        'how-to-reduce-construction-project-delays',
        '  Title: How to Reduce Construction Project Delays',
        `  URL:   ${stub.origin}/blog/how-to-reduce-construction-project-delays`,
        '  First paragraph: Most delays come from late decisions, not slow crews; here is how to keep a schedule.',
        '',
        'missing-page',
        '  Title: (could not read the page)',
        `  URL:   ${stub.origin}/blog/missing-page`,
        '',
      ].join('\n'));

      // A page failed to load, so nothing was cached: the next call fetches again.
      expect(stub.state.sitemapHits).toBe(1);
      stub.state.withMissing = false;
      const again = await cli(['specnook-articles', '--specnook', stub.origin], { TMPDIR: tmp });
      expect(again.code, again.err).toBe(0);
      expect(stub.state.sitemapHits).toBe(2);
      expect(again.out.split('\n')[0]).toBe('SpecNook blog: 2 articles');

      // Every page loaded, so the next call in the run reads the cache, even with SpecNook gone.
      await stub.close();
      const cached = await cli(['specnook-articles', '--specnook', stub.origin], { TMPDIR: tmp });
      expect(cached.code, cached.err).toBe(0);
      expect(cached.out.split('\n')[0]).toBe('SpecNook blog: 2 articles (cached; --refresh to fetch again)');
      const refreshed = await cli(['specnook-articles', '--specnook', stub.origin, '--refresh'], { TMPDIR: tmp });
      expect(refreshed.code).toBe(1);
      expect(refreshed.err).toContain('Cannot read the SpecNook sitemap');
    } finally {
      await stub.close().catch(() => {});
    }
  });

  test('SpecNook links never count toward the three internal links', () => {
    const body = [
      'Plan your selections early so the crew never waits on you.',
      'See [kitchen remodeling](/services/kitchen-remodeling) and [a free estimate](/free-estimate).',
      'The [SpecNook homeowner selections guide](https://www.specnook.app/blog/homeowner-construction-selections-guide) and',
      '[SpecNook on avoiding delays](https://www.specnook.app/blog/how-to-reduce-construction-project-delays) explain the rest.',
    ].join('\n\n');
    const verdict = validateDraft(body, []);
    expect(verdict.internalLinks).toBe(2);
    expect(verdict.ok).toBe(false);
  });
});
