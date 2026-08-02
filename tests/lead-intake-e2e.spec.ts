import { test, expect, type Locator, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';

/**
 * The lead intake chat, end to end, through the real routes.
 *
 * tests/lead-intake.spec.ts proves the flow data and the copy guarantees as
 * pure functions. This drives what a lead actually does: fills in the landing
 * form, lands on the confirmation panel, opens the link it offers, and walks
 * the whole conversation in a browser - with a real Next server running the
 * real `/api/leads/submit`, `/api/intake/[token]/answer`, `/message` and
 * `/photo` handlers.
 *
 * Everything downstream is a stub on one port (tests/helpers/intake-stub.mjs):
 * Supabase REST, the intake-photos bucket, and api.telegram.org. So the
 * Telegram brief this captures is the exact text the owner's phone would show,
 * and the outbound-URL log is a real answer to "does this call a model".
 *
 * Run recipe - the server has to be started with the preload, because
 * `telegramMessage.ts` hardcodes api.telegram.org:
 *
 *   node tests/helpers/intake-stub.mjs &          # or let the spec start it
 *
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9416 \
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb-stub-publishable \
 *   SUPABASE_SECRET_KEY=sb-stub-secret \
 *   TELEGRAM_BOT_TOKEN=stub-bot-token TELEGRAM_CHAT_ID=999 \
 *   RESEND_API_KEY= \
 *   RECAPTCHA_E2E_BYPASS_TOKEN=intake-e2e-bypass-token-0123456789abcd \
 *   NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3100 \
 *   INTAKE_STUB_URL=http://127.0.0.1:9416 \
 *   INTAKE_FETCH_LOG=/tmp/intake-outbound.log \
 *   NODE_OPTIONS='--require ./tests/helpers/outbound-fetch.cjs' \
 *   npx next dev -p 3100
 *
 *   INTAKE_E2E=1 TEST_URL=http://127.0.0.1:3100 \
 *   npx playwright test tests/lead-intake-e2e.spec.ts --project=chromium
 */

const RUN = process.env.INTAKE_E2E === '1';
const STUB = process.env.INTAKE_STUB_URL || 'http://127.0.0.1:9416';
const BYPASS = process.env.RECAPTCHA_E2E_BYPASS_TOKEN || 'intake-e2e-bypass-token-0123456789abcd';
const FETCH_LOG = process.env.INTAKE_FETCH_LOG || '';
const EVIDENCE = process.env.INTAKE_EVIDENCE_DIR || join(process.cwd(), 'test-results', 'lead-intake-e2e');

const shot = (name: string) => join(EVIDENCE, name);

interface StubState {
  telegram: { text: string; parse_mode?: string }[];
  storage: { key: string; bytes: number }[];
  tables: Record<string, Record<string, unknown>[]>;
}

const state = async (): Promise<StubState> =>
  (await (await fetch(`${STUB}/__state`)).json()) as StubState;

/** Put a session straight into the stub, to start a branch part way through. */
async function seedSession(row: Record<string, unknown>): Promise<string> {
  const token = `seed-${Math.random().toString(36).slice(2)}${'x'.repeat(20)}`;
  await fetch(`${STUB}/rest/v1/lead_intake_sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lead_id: null,
      token,
      first_name: 'Sarah',
      status: 'pending',
      answers: {},
      opened_at: null,
      completed_at: null,
      declined_at: null,
      ...row,
    }),
  });
  return token;
}

/** The bot's bubbles, in order, as a lead reads them. */
const botText = (page: Page) => page.locator('[data-role="bot"]');

async function tap(page: Page, label: string) {
  await page.getByRole('button', { name: label, exact: true }).click();
}

async function type(page: Page, value: string) {
  await page.locator('input[type="text"]').fill(value);
  await page.getByRole('button', { name: 'Send' }).click();
}

/**
 * What a tap at the middle of this control actually hits.
 *
 * `toBeVisible` is not enough here: an element covered by something fixed to
 * the viewport is still visible, and a composer that has scrolled off the
 * bottom of the window is still in the DOM. Returns 'the control itself' when
 * the tap lands on it, and otherwise says what took the tap.
 */
async function tapLandsOn(page: Page, target: Locator): Promise<string> {
  const box = await target.boundingBox();
  if (!box) return 'nothing - the control is not laid out';
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const { height, width } = page.viewportSize()!;
  if (point.y < 0 || point.y > height || point.x < 0 || point.x > width) {
    return 'nothing - the control is off screen';
  }
  return target.evaluate((el, p) => {
    const hit = document.elementFromPoint(p.x, p.y);
    if (!hit) return 'nothing - the control is off screen';
    return el.contains(hit) ? 'the control itself' : hit.outerHTML.slice(0, 120);
  }, point);
}

/**
 * The chat has to stay usable on a phone: the conversation scrolls inside the
 * thread rather than growing the page, and every control it is offering right
 * now takes its own tap.
 */
async function expectChatUsable(page: Page, where: string) {
  // The thread scrolls itself smoothly after every new bubble; measure once
  // that has stopped, or the numbers describe a frame nobody ever taps at.
  const thread = page.getByTestId('intake-thread');
  for (let previous = -1, i = 0; i < 30; i++) {
    const top = await thread.evaluate((el) => el.scrollTop);
    if (top === previous) break;
    previous = top;
    await page.waitForTimeout(100);
  }

  // A page taller than the window is what puts the composer below the fold and
  // arms the site's fixed mobile chrome on top of the answers.
  const fit = await page.evaluate(() => ({
    documentHeight: document.documentElement.scrollHeight,
    windowHeight: window.innerHeight,
  }));
  expect(fit.documentHeight, `${where}: the conversation must fit the window`)
    .toBeLessThanOrEqual(fit.windowHeight);

  const options = page.getByTestId('intake-options').getByRole('button');
  for (const option of await options.all()) {
    const label = (await option.innerText()).trim();
    expect(await tapLandsOn(page, option), `${where}: tapping "${label}"`).toBe('the control itself');
  }
  const composer = page.locator('input[type="text"]');
  if (await composer.count()) {
    expect(await tapLandsOn(page, composer), `${where}: tapping the composer`).toBe('the control itself');
  }
}

test.describe(RUN ? 'lead intake, end to end' : 'lead intake, end to end (set INTAKE_E2E=1)', () => {
  test.skip(!RUN, 'Opt-in: needs the stub-backed dev server from the recipe above.');
  test.describe.configure({ mode: 'serial' });
  test.use({ viewport: { width: 430, height: 932 } });

  let stub: ChildProcess | undefined;
  /** The token the real submit route minted, carried between tests. */
  let token = '';

  test.beforeAll(async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    // Reuse whatever is already listening, the way playwright.config does.
    const alive = await fetch(`${STUB}/__state`).then(() => true).catch(() => false);
    if (!alive) {
      stub = spawn('node', ['tests/helpers/intake-stub.mjs'], { stdio: 'inherit' });
      for (let i = 0; i < 40; i++) {
        if (await fetch(`${STUB}/__state`).then(() => true).catch(() => false)) break;
        await new Promise((r) => setTimeout(r, 250));
      }
    }
  });

  test.afterAll(() => {
    stub?.kill();
  });

  /* ── AC2 - the form hands the lead a token ──────────────────────────────── */

  test('submitting the landing form offers the intake, and mints one token for that lead', async ({ page }) => {
    // The only thing faked in the browser: reCAPTCHA cannot mint a real token
    // for localhost. The server-side hook this feeds is the repo's existing
    // RECAPTCHA_E2E_BYPASS_TOKEN, so /api/leads/submit runs for real.
    await page.addInitScript((tokenValue) => {
      (window as unknown as { grecaptcha: unknown }).grecaptcha = {
        enterprise: {
          ready: (cb: () => void) => cb(),
          execute: async () => tokenValue,
        },
      };
    }, BYPASS);
    // The real enterprise.js would land on top of that stub and replace it.
    await page.route('**/recaptcha/**', (route) => route.abort());

    await page.goto('/free-estimate?service=kitchen');

    await page.locator('input#lp-name:visible').fill('Sarah Kim');
    await page.locator('input#lp-email:visible').fill('sarah.kim@example.com');
    await page.locator('input#lp-phone:visible').fill('(201) 555-0142');
    await page.locator('input#lp-zip:visible').fill('07042');
    await page.locator('button#lp-terms:visible').click();
    await page.locator('form button[type="submit"]:visible').click();

    await expect(page.getByText('Thank You!')).toBeVisible({ timeout: 30_000 });

    // The invite itself: three minutes, never a question count, and skipping
    // offered in plain words.
    const invite = page.getByTestId('intake-invite-link');
    await expect(invite).toBeVisible();
    await expect(page.getByText('Make the call worth your time')).toBeVisible();
    await expect(page.getByText(/About three minutes/)).toBeVisible();
    await expect(page.getByText(/Or skip it/)).toBeVisible();
    const panel = await page.locator('body').innerText();
    expect(panel.toLowerCase()).not.toContain('seven');
    expect(panel).not.toMatch(/\b7 (quick )?questions\b/);

    await page.screenshot({ path: shot('01-confirmation-invite.png'), fullPage: true });

    const href = await invite.getAttribute('href');
    expect(href).toMatch(/^\/intake\//);
    token = href!.replace('/intake/', '');

    // One token, one lead: the row the real route wrote carries the lead id.
    const { tables } = await state();
    const sessions = (tables.lead_intake_sessions ?? []).filter((s) => s.token === token);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].lead_id).toBeTruthy();
    expect(sessions[0].current_step).toBe('consent');
    expect(tables.leads?.some((l) => l.id === sessions[0].lead_id)).toBe(true);
  });

  /* ── AC4-AC9, AC13 - the conversation ───────────────────────────────────── */

  test('a lead walks the whole conversation and the owner gets the brief', async ({ page }) => {
    expect(token, 'the previous test must have minted a token').not.toBe('');
    await page.goto(`/intake/${token}`);

    // AC4 - the opening discloses the AI, says why, and asks.
    await expect(botText(page).first()).toContainText("I'm La Vaca's AI assistant");
    await expect(page.getByText(/about 3 minutes. Is that okay\?/)).toBeVisible();
    const opener = await page.getByTestId('intake-thread').innerText();
    expect(opener.toLowerCase()).not.toContain('seven');
    expect(opener).not.toMatch(/\b7\b/);
    await page.screenshot({ path: shot('02-opener-consent.png'), fullPage: true });

    await tap(page, 'Sure, go ahead');

    // AC5 step 1 - the open question, with photos.
    await expect(page.getByText(/Tell me about your project, in your own words/)).toBeVisible();
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    await page.locator('input[type="file"]').setInputFiles({
      name: 'kitchen.png',
      mimeType: 'image/png',
      buffer: png,
    });
    await expect(page.getByText('1 photo added')).toBeVisible();
    await type(page, 'We want to open the kitchen into the living room, there is a wall in the middle.');

    // AC8 - a service-area town, so the warm line is true and is said.
    await expect(page.getByText(/What town are you in\?/)).toBeVisible();
    await page.screenshot({ path: shot('03-project-and-photo.png'), fullPage: true });
    await type(page, 'Montclair');
    await expect(page.getByText("Good, that's ten minutes from us.")).toBeVisible();
    await expect(page.getByText('Is this a full gut, or more of a refresh?')).toBeVisible();
    await page.screenshot({ path: shot('04-town-in-service-area.png'), fullPage: true });

    // AC7 - freeform text at a button step is caught, never answered.
    await type(page, 'do you handle permits?');
    await expect(page.getByText("Good question, and I'm not going to guess at it.")).toBeVisible();
    await expect(page.getByText(/sent it straight to Alex and Veronica/)).toBeVisible();
    await expect(page.getByText(/Back to where we were: is this a full gut/)).toBeVisible();
    await page.screenshot({ path: shot('05-off-script-question.png'), fullPage: true });

    const afterQuestion = await state();
    const routed = (afterQuestion.tables.lead_intake_events ?? [])[0];
    expect(routed?.body).toBe('do you handle permits?');
    expect(routed?.routed_at, 'the question must be stamped once a human has it').toBeTruthy();
    const question = afterQuestion.telegram.at(-1)!.text;
    expect(question).toContain('did NOT answer this');

    await tap(page, 'Major update, moving some walls');
    await tap(page, 'Somewhere in the middle');
    await tap(page, '1 to 3 months');

    // AC6 - the price question states our real starting number and asks how it
    // lands. It never asks the lead for a figure, and never says "budget".
    await expect(page.getByText(/starts at \$35,000/)).toBeVisible();
    await expect(page.getByText(/Where does that sit against what you had in mind\?/)).toBeVisible();
    const priceScreen = await page.locator('main').innerText();
    expect(priceScreen.toLowerCase()).not.toContain('budget');
    await expect(page.getByTestId('intake-options').getByRole('button')).toHaveCount(4);
    await page.screenshot({ path: shot('06-price-anchor.png'), fullPage: true });
    // The phone-sized view as well, because a full-page capture flattens fixed
    // elements and would hide anything sitting on top of the composer.
    await page.screenshot({ path: shot('06b-price-anchor-on-a-phone.png') });

    // By here the thread is long, which is exactly when the site's own fixed
    // mobile chrome used to arm and land on top of the last option.
    await expectChatUsable(page, 'the price question');

    await tap(page, 'About what I expected');
    await expect(page.getByText(/What's the address, so we can get someone out to you\?/)).toBeVisible();
    await expectChatUsable(page, 'the address question');
    await type(page, '51 Crestmont Rd, Montclair');
    await tap(page, 'Weekday afternoons');

    // AC9 - the close states the promise and reflects the answer just given.
    await expect(page.getByText(/aim for an afternoon/)).toBeVisible();
    await expect(page.getByText(/That's everything, thank you Sarah/)).toBeVisible();
    await expect(page.getByText('Nothing else needed, Sarah.')).toBeVisible();
    await page.screenshot({ path: shot('07-close.png'), fullPage: true });
    await page.screenshot({ path: shot('07b-close-on-a-phone.png') });

    // AC10 - the answers landed on the lead row, in the existing columns.
    const done = await state();
    const session = done.tables.lead_intake_sessions!.find((s) => s.token === token)!;
    expect(session.status).toBe('completed');
    const lead = done.tables.leads!.find((l) => l.id === session.lead_id)! as Record<string, string>;
    expect(lead.city).toBe('Montclair');
    expect(lead.project_timeline).toBe('1_3_months');
    expect(lead.address).toBe('51 Crestmont Rd, Montclair');
    expect(lead.contact_time_preference).toBe('afternoon');
    expect(lead.scope_tier).toBe('major_update');
    expect(lead.price_anchor_shown).toBe(35000);
    expect(lead.budget_range, 'budget_range is not the price reaction').toBeUndefined();
    expect(lead.message, 'the form message must be added to, not replaced')
      .toContain('open the kitchen into the living room');

    // AC13 - and a human was told, with every answer in words.
    const brief = done.telegram.at(-1)!.text;
    writeFileSync(join(EVIDENCE, 'telegram-completion-brief.txt'), brief);
    expect(brief).toContain('Intake finished - Sarah');
    expect(brief).toContain('Major update, moving some walls');
    expect(brief).toContain('1 to 3 months');
    expect(brief).toContain('Weekday afternoons');
    expect(brief).toContain('$35,000 landed about where they expected');
    expect(brief).toContain('1 attached');
    for (const raw of ['major_update', '1_3_months', 'about_expected']) {
      expect(brief, `${raw} must not reach the owner as a code`).not.toContain(raw);
    }
    const entities = brief.match(/&[a-z]+;|&#\d+;/gi) ?? [];
    expect(entities.filter((e) => !['&lt;', '&gt;', '&amp;'].includes(e.toLowerCase()))).toEqual([]);

    // The whole owner-facing thread, which is what AC13 is about: the alert at
    // submit time knew a name and a project type, and until this change that
    // was the last thing anybody was told.
    const thread = done.telegram.map((m) => m.text);
    expect(thread).toHaveLength(3); // new lead, the question, the brief
    expect(thread[0]).toMatch(/New .*Lead/);
    expect(thread[0], 'the submit-time alert knows nothing about the project itself')
      .not.toContain('Crestmont');
    writeFileSync(
      join(EVIDENCE, 'telegram-transcript.txt'),
      thread.map((t, i) => `--- message ${i + 1} ---\n${t}`).join('\n\n'),
    );

    // Rendered the way Telegram renders HTML mode, so the artifact is what the
    // owner's phone actually shows.
    writeFileSync(join(EVIDENCE, 'telegram-thread.html'), telegramPreview(thread));
    await page.setViewportSize({ width: 470, height: 1100 });
    await page.goto(`file://${join(EVIDENCE, 'telegram-thread.html')}`);
    await page.screenshot({ path: shot('08-telegram-brief.png'), fullPage: true });

    // AC3 - and none of it called a model.
    if (FETCH_LOG && existsSync(FETCH_LOG)) {
      const urls = readFileSync(FETCH_LOG, 'utf8').split('\n').filter(Boolean);
      writeFileSync(
        join(EVIDENCE, 'outbound-urls.txt'),
        ['Every URL the server requested while a lead walked the whole flow:', '', ...urls].join('\n'),
      );
      expect(urls.filter((u) => /openai|anthropic|googleapis\.com\/v1beta|ai-sdk/i.test(u))).toEqual([]);
    }
  });

  /* ── AC8 - and the warm line is NOT said when it would be false ─────────── */

  test('a town outside the service area gets the question with no pleasantry', async ({ page }) => {
    const seeded = await seedSession({ project_type: 'Kitchen Remodeling', current_step: 'town' });
    await page.goto(`/intake/${seeded}`);
    await expect(page.getByText(/What town are you in\?/)).toBeVisible();

    await type(page, 'Princeton');
    await expect(page.getByText('Is this a full gut, or more of a refresh?')).toBeVisible();
    await expect(page.getByText('ten minutes from us')).toHaveCount(0);
    await page.screenshot({ path: shot('09-town-outside-area.png'), fullPage: true });
  });

  /* ── AC6 - a project type with no honest number skips the question ──────── */

  test('a project type with no honest starting price is never shown an invented one', async ({ page }) => {
    const seeded = await seedSession({ project_type: 'Interior Finishing', current_step: 'timeline' });
    await page.goto(`/intake/${seeded}`);
    await expect(page.getByText('When are you hoping to start?')).toBeVisible();

    await tap(page, 'As soon as we can');

    // Straight past the money question to the address.
    await expect(page.getByText(/What's the address, so we can get someone out to you\?/)).toBeVisible();
    const thread = await page.getByTestId('intake-thread').innerText();
    expect(thread).not.toMatch(/\$\d/);
    expect(thread.toLowerCase()).not.toContain('budget');
    await page.screenshot({ path: shot('10-no-anchor-skips-price.png'), fullPage: true });
  });

  /* ── AC4 - declining is honoured ────────────────────────────────────────── */

  test('declining ends the conversation, still promises the call, and sends no brief', async ({ page }) => {
    const before = (await state()).telegram.length;
    const seeded = await seedSession({ project_type: 'Kitchen Remodeling', current_step: 'consent' });
    await page.goto(`/intake/${seeded}`);

    await tap(page, "I'd rather just get a call");
    await expect(page.getByText('Of course, no problem at all.')).toBeVisible();
    await expect(page.getByText(/will call you within 24 hours, Sarah/)).toBeVisible();
    await page.screenshot({ path: shot('11-declined.png'), fullPage: true });

    const after = await state();
    expect(after.telegram.length, 'a decline tells us nothing new, so nothing is sent').toBe(before);
    const session = after.tables.lead_intake_sessions!.find((s) => s.token === seeded)!;
    expect(session.status).toBe('declined');
    expect(session.declined_at).toBeTruthy();
  });

  /* ── AC12 - failure reads as failure ────────────────────────────────────── */

  test('an unknown link and an unreachable database read differently', async ({ page }) => {
    await page.goto(`/intake/${'n'.repeat(43)}`);
    await expect(page.getByRole('heading', { name: "This link isn't valid" })).toBeVisible();
    await page.screenshot({ path: shot('12-invalid-link.png'), fullPage: true });

    // The SAME link, with the database unreachable. The lead must not be told
    // their link is bad when the truth is that we could not check it.
    await fetch(`${STUB}/__fail?on=1`);
    try {
      await page.goto(`/intake/${token}`);
      await expect(page.getByRole('heading', { name: "We couldn't load your details" })).toBeVisible();
      await expect(page.getByText(/Something went wrong at our end, not yours/)).toBeVisible();
      await page.screenshot({ path: shot('13-database-unreachable.png'), fullPage: true });
    } finally {
      await fetch(`${STUB}/__fail?on=0`);
    }

    // And it recovers: the same link renders the conversation again.
    await page.goto(`/intake/${token}`);
    await expect(page.getByText('Nothing else needed, Sarah.')).toBeVisible();
  });
});

/** The owner's chat, rendered the way Telegram's HTML mode renders it. */
function telegramPreview(messages: string[]): string {
  const bubbles = messages
    .map(
      (text, i) =>
        `<div class="bubble">${text.replace(/\n/g, '<br>')}<div class="time">message ${i + 1}</div></div>`,
    )
    .join('\n');
  return `<!doctype html><meta charset="utf-8"><title>Telegram - La Vaca ops</title>
<style>
  body{margin:0;background:#0e1621;font:14.5px/1.5 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:18px}
  .who{color:#7d8e9e;font-size:12px;margin:0 0 10px 4px}
  .bubble{background:#182533;color:#e9eef3;border-radius:14px 14px 14px 4px;padding:12px 14px;max-width:410px;margin-bottom:10px;white-space:pre-wrap;word-wrap:break-word}
  .bubble b{color:#fff}
  .time{color:#6d7f8f;font-size:11px;text-align:right;margin-top:6px}
</style>
<p class="who">La Vaca ops bot</p>
${bubbles}`;
}
