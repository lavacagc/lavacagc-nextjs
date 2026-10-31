import { test, expect } from '@playwright/test';

/**
 * /api/health is what uptime monitors and the deploy pipeline's smoke step
 * read. They identify as curl or a monitoring bot, so the route is exempt from
 * the bad-bot filter by exact path, and nothing else is.
 */
test.describe('health check', () => {
  test('reports the commit and a database verdict whose HTTP code matches it', async ({ request }) => {
    const res = await request.get('/api/health');
    const body = await res.json();
    expect(['ok', 'degraded']).toContain(body.status);
    expect(res.status()).toBe(body.status === 'ok' ? 200 : 503);
    expect(typeof body.commit).toBe('string');
    expect(typeof body.db.ok).toBe('boolean');
    expect(res.headers()['cache-control']).toContain('no-store');
    // Nothing beyond these fields: no env values, no keys.
    expect(Object.keys(body).sort()).toEqual(['commit', 'db', 'env', 'ms', 'region', 'status']);
  });

  test('a monitor that identifies as curl gets through', async ({ request }) => {
    const res = await request.get('/api/health', { headers: { 'user-agent': 'curl/8.7.1' } });
    expect(res.status()).not.toBe(403);
  });

  test('the exemption is exact: curl is still refused elsewhere', async ({ request }) => {
    for (const path of ['/', '/api/health/forms', '/api/healthz']) {
      const res = await request.get(path, { headers: { 'user-agent': 'curl/8.7.1' }, maxRedirects: 0 });
      expect(res.status(), path).toBe(403);
    }
  });
});
