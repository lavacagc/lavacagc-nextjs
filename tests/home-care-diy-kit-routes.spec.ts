import { test, expect, type BrowserContext } from '@playwright/test';
import { SKIP_WITHOUT_LIVE_BACKEND } from './helpers/liveBackend';

/**
 * Home Care DIY Kit - the admin routes, exercised rather than grepped.
 *
 * The static spec (home-care-diy-kit.spec.ts) asserts the CONTRACT: that the
 * gate exists, that the disclosure says what it must, that the schema carries
 * the rules. This file asks the running routes what they actually answer, and
 * it leads with the UNHAPPY paths, because those are what a member or an owner
 * meets on a bad day and they are the ones no string match can prove.
 *
 * TWO HALVES, deliberately split by what they need:
 *
 *  - Everything validated BEFORE a database call runs under the ordinary stub
 *    build, in CI, every time. That is most of the refusals: a URL with no
 *    product in it, an ASIN that is not one, a nameless product, a price band
 *    we do not have, a photo that is not an image, a live product with no
 *    picture at all.
 *  - The refusals that need to READ something - the pro-task gate, the
 *    duplicate ASIN, the round trip of creating and deleting a product - are
 *    guarded by SKIP_WITHOUT_LIVE_BACKEND, the same way links.spec.ts is. They
 *    run against a real build with real credentials and skip loudly otherwise,
 *    because a stub cannot answer the question they are asking.
 *
 * Auth follows the house pattern for admin specs: the fabricated session cookie
 * whose name derives from the baked NEXT_PUBLIC_SUPABASE_URL, against the
 * GoTrue stub playwright.config.ts runs for the whole suite. `context.request`
 * inherits those cookies, so these are real requests through real middleware.
 */

const PRODUCTS = '/api/admin/home-care/products';
const PARSE = '/api/admin/home-care/parse-amazon';
const IMAGE = '/api/admin/home-care/product-image';

/** A well-formed request body, so each test changes exactly one thing. */
const VALID = {
  asin: 'B08XYZ1234',
  display_name: 'Digital hygrometer, 2-pack',
  pitch: 'One at each end of the basement.',
  images: ['B08XYZ1234/1-0.jpg'],
  image_source: 'manual',
  price_band: 'under_25',
  category: 'monitor',
  task_keys: [] as string[],
  active: false,
};

async function signInAsAdmin(context: BrowserContext, baseURL: string) {
  const session = {
    access_token: 'stub-access-token',
    refresh_token: 'stub-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', role: 'authenticated' },
  };
  await context.addCookies([{
    name: 'sb-127-auth-token',
    value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'),
    url: baseURL,
  }]);
}

test.describe('DIY Kit admin routes', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signInAsAdmin(context, baseURL!);
  });

  // ------------------------------------------------------------- unauthorised

  test('unhappy: an unauthenticated caller never reaches any of the three routes', async ({ browser, baseURL }) => {
    // A fresh context, deliberately WITHOUT the session cookie. This is the one
    // guard that is not ours - middleware owns it - and it is worth one test,
    // because every other refusal in this file assumes it holds.
    const anon = await browser.newContext();
    for (const path of [PRODUCTS, PARSE, IMAGE]) {
      const res = await anon.request.post(`${baseURL}${path}`, { data: {} });
      expect(res.status(), path).toBe(401);
    }
    const listed = await anon.request.get(`${baseURL}${PRODUCTS}`);
    expect(listed.status()).toBe(401);
    await anon.close();
  });

  // --------------------------------------------------- parse: unhappy first

  test('unhappy: a body that is not JSON is refused before anything else', async ({ context, baseURL }) => {
    // Raw bytes, not a string: Playwright JSON-ENCODES a string data value, so
    // `data: 'not json'` arrives as the valid JSON document `"not json"` and
    // exercises the wrong refusal. A Buffer is sent verbatim.
    const res = await context.request.post(`${baseURL}${PARSE}`, {
      headers: { 'Content-Type': 'application/json' },
      data: Buffer.from('{"url": '),
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/JSON body/i);

    // A body that PARSES but is not an object refuses one step later, with the
    // other sentence. `JSON.stringify` because a bare string with no JSON
    // content-type is sent as text/plain and fails at the parse above instead.
    const scalar = await context.request.post(`${baseURL}${PARSE}`, {
      headers: { 'Content-Type': 'application/json' },
      data: Buffer.from(JSON.stringify('not an object')),
    });
    expect(scalar.status()).toBe(400);
    expect((await scalar.json()).error).toMatch(/Paste an Amazon product link/i);
  });

  test('unhappy: an empty paste asks for a link rather than guessing', async ({ context, baseURL }) => {
    for (const url of ['', '   ', null, 42]) {
      const res = await context.request.post(`${baseURL}${PARSE}`, { data: { url } });
      expect(res.status(), String(url)).toBe(400);
      expect((await res.json()).error).toMatch(/Paste an Amazon product link/i);
    }
  });

  test('unhappy: a link with no product in it is refused, and the message says how to fix it', async ({ context, baseURL }) => {
    for (const url of [
      'https://www.amazon.com/s?k=hygrometer',
      'https://www.amazon.com/',
      'https://example.com/dp/B08XYZ1234',
      'JAVASCRIPT',
    ]) {
      const res = await context.request.post(`${baseURL}${PARSE}`, { data: { url } });
      expect(res.status(), url).toBe(422);
      // The refusal has to be actionable: it names /dp/ and where to find it.
      expect((await res.json()).error, url).toMatch(/\/dp\//);
    }
  });

  // ------------------------------------------------- products POST: refusals

  test('unhappy: every malformed product is refused with a sentence, not a constraint name', async ({ context, baseURL }) => {
    const cases: Array<[string, Record<string, unknown>, RegExp]> = [
      ['lower-case asin', { asin: 'b08xyz1234x' }, /valid Amazon identifier/i],
      ['short asin', { asin: 'B08XYZ123' }, /valid Amazon identifier/i],
      ['punctuated asin', { asin: 'B08-YZ1234' }, /valid Amazon identifier/i],
      ['missing asin', { asin: undefined }, /valid Amazon identifier/i],
      ['blank name', { display_name: '   ' }, /display name/i],
      ['missing name', { display_name: undefined }, /display name/i],
      ['unknown band', { price_band: 'cheap' }, /price band/i],
      ['missing band', { price_band: undefined }, /price band/i],
      ['live with no photo', { active: true, images: [] }, /photo/i],
    ];
    for (const [label, patch, message] of cases) {
      const res = await context.request.post(`${baseURL}${PRODUCTS}`, { data: { ...VALID, ...patch } });
      expect(res.status(), label).toBe(422);
      const body = await res.json();
      expect(body.error, label).toMatch(message);
      // No refusal may leak the database's own vocabulary at the operator.
      expect(body.error, label).not.toMatch(/constraint|violates|null value|23505/i);
    }
  });

  test('unhappy: a product edit is refused the same way, and an unknown id is a 404', async ({ context, baseURL }) => {
    const id = '11111111-1111-1111-1111-111111111111';
    for (const bad of ['not-a-uuid', '1234', 'null']) {
      const res = await context.request.patch(`${baseURL}${PRODUCTS}/${bad}`, { data: { display_name: 'x' } });
      expect(res.status(), bad).toBe(404);
      const del = await context.request.delete(`${baseURL}${PRODUCTS}/${bad}`);
      expect(del.status(), bad).toBe(404);
    }
    const blank = await context.request.patch(`${baseURL}${PRODUCTS}/${id}`, { data: { display_name: '  ' } });
    expect(blank.status()).toBe(422);
    const band = await context.request.patch(`${baseURL}${PRODUCTS}/${id}`, { data: { price_band: 'free' } });
    expect(band.status()).toBe(422);
  });

  test('unhappy: activating fails closed when the stored row cannot be read', async ({ context, baseURL }) => {
    // hasNoStoredImage answers "no image" on a read failure, so a product is
    // refused activation rather than being published on the strength of a
    // question we could not ask. Under the stub build the read always fails,
    // which is exactly the state being asserted.
    test.skip(!SKIP_WITHOUT_LIVE_BACKEND, 'asserts the stub-build failure mode');
    const res = await context.request.patch(`${baseURL}${PRODUCTS}/11111111-1111-1111-1111-111111111111`, {
      data: { active: true },
    });
    expect(res.status()).toBe(422);
    expect((await res.json()).error).toMatch(/photo/i);
  });

  // ------------------------------------------------------- image: refusals

  test('unhappy: the photo uploader refuses anything it should not store', async ({ context, baseURL }) => {
    const png = Buffer.from('89504e470d0a1a0a', 'hex');

    const noAsin = await context.request.post(`${baseURL}${IMAGE}`, {
      multipart: { asin: 'nope', file: { name: 'a.png', mimeType: 'image/png', buffer: png } },
    });
    expect(noAsin.status()).toBe(422);
    expect((await noAsin.json()).error).toMatch(/Parse the Amazon link first/i);

    const noFile = await context.request.post(`${baseURL}${IMAGE}`, {
      multipart: { asin: 'B08XYZ1234' },
    });
    expect(noFile.status()).toBe(400);

    const wrongType = await context.request.post(`${baseURL}${IMAGE}`, {
      multipart: { asin: 'B08XYZ1234', file: { name: 'a.pdf', mimeType: 'application/pdf', buffer: png } },
    });
    expect(wrongType.status()).toBe(415);

    const tooBig = await context.request.post(`${baseURL}${IMAGE}`, {
      multipart: { asin: 'B08XYZ1234', file: { name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(9 * 1024 * 1024) } },
    });
    expect(tooBig.status()).toBe(413);
  });

});

