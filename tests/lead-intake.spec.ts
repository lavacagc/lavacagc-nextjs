import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  buildStep, nextStep, isTerminal, isValidAnswer, closingPromise, normalizeIntakeText,
  type FlowContext, type StepId,
} from '../src/lib/intake/flow';
import { priceAnchorFor, hasPriceAnchor, NO_ANCHOR_SENTENCE } from '../src/lib/intake/pricing';
import { isServiceArea, normalizeTown } from '../src/lib/intake/serviceArea';
import { offScriptReply, reachedAHuman, offScriptTelegram } from '../src/lib/intake/offScript';
import { completionMessage, reactionLine, urgencyLine } from '../src/lib/intake/completionAlert';
import { newIntakeToken, intakeUrlFor, intakePathFor } from '../src/lib/intake/session';
import { TELEGRAM_TEXT_LIMIT } from '../src/lib/notify/telegramMessage';
import { leadInstantAckHtml } from '../src/lib/emailTemplates';

/**
 * Acceptance criteria for the lead intake chat.
 * See docs/lead-intake-acceptance-criteria.md - IDs below match that doc.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Source with comments stripped. Several guarantees below are "this word
 * appears nowhere", and a comment explaining WHY it appears nowhere must not
 * fail the check - that mistake made the doc comment the thing under test on
 * the last feature.
 */
const code = (p: string) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const CTX: FlowContext = { firstName: 'Sarah', projectType: 'Kitchen Remodeling' };

/** Walk the flow the way a lead would, returning every step visited. */
function walk(answers: Partial<Record<StepId, string>>, ctx: FlowContext = CTX): StepId[] {
  const visited: StepId[] = [];
  let step: StepId = 'consent';
  let guard = 0;
  const acc = { ...ctx };
  while (!isTerminal(step) && guard++ < 20) {
    visited.push(step);
    const answer = answers[step] ?? defaultAnswer(step, acc);
    if (step === 'town') acc.town = answer;
    if (step === 'contact_time') acc.contactTime = answer;
    step = nextStep(step, answer, acc);
  }
  visited.push(step);
  return visited;
}

function defaultAnswer(step: StepId, ctx: FlowContext): string {
  const built = buildStep(step, ctx);
  if (built.kind === 'buttons') return built.options?.[0]?.value ?? '';
  return 'some text';
}

/* ── AC1 - the LLM is gone ────────────────────────────────────────────────── */

test.describe('AC1 - the LLM chat is gone', () => {
  test('ChatWidget and /api/chat no longer exist', () => {
    expect(existsSync(join(process.cwd(), 'src/components/ChatWidget.tsx'))).toBe(false);
    expect(existsSync(join(process.cwd(), 'src/app/api/chat/route.ts'))).toBe(false);
  });

  test('nothing mounts ChatWidget', () => {
    expect(read('src/app/layout.tsx')).not.toContain('ChatWidget');
  });

  test('/api/chat is no longer a public route, /api/intake is', () => {
    const mw = code('src/middleware.ts');
    expect(mw).not.toContain("'/api/chat'");
    expect(mw).toContain("'/api/intake/'");
  });

  test('no intake code imports an AI SDK', () => {
    for (const f of [
      'src/lib/intake/flow.ts',
      'src/lib/intake/pricing.ts',
      'src/lib/intake/session.ts',
      'src/lib/intake/offScript.ts',
      'src/app/api/intake/[token]/answer/route.ts',
      'src/app/api/intake/[token]/message/route.ts',
    ]) {
      expect(code(f), `${f} must not import an AI SDK`).not.toMatch(/from ['"](openai|@anthropic-ai|@ai-sdk)/);
    }
  });

  test('the chat_conversations table keeps its readers and its other writer', () => {
    // The table is NOT ours to drop: LeaveReviewClient writes to it as a
    // fallback store, and /api/leads/conversations reads it.
    expect(existsSync(join(process.cwd(), 'src/app/api/leads/conversations/route.ts'))).toBe(true);
    expect(read('src/components/LeaveReviewClient.tsx')).toContain('chat_conversations');
  });
});

/* ── AC3/AC5 - the flow ───────────────────────────────────────────────────── */

test.describe('AC5 - question order, warmest to most revealing', () => {
  test('a kitchen lead walks consent to done in spec order', () => {
    expect(walk({})).toEqual([
      'consent', 'project', 'town', 'scope', 'finish', 'timeline', 'price', 'address', 'contact_time', 'done',
    ]);
  });

  test('declining at consent ends immediately, without nagging', () => {
    expect(walk({ consent: 'no' })).toEqual(['consent', 'declined']);
  });

  test('"Add my own details" detours through a text step', () => {
    const visited = walk({ scope: 'own_details' });
    expect(visited).toContain('scope_detail');
    expect(visited.indexOf('scope_detail')).toBe(visited.indexOf('scope') + 1);
  });

  test('the word budget never appears anywhere a lead can read it', () => {
    const steps: StepId[] = [
      'consent', 'project', 'town', 'scope', 'scope_detail', 'finish',
      'timeline', 'price', 'address', 'contact_time', 'done', 'declined',
    ];
    for (const id of steps) {
      const step = buildStep(id, CTX);
      const text = [...step.say, ...(step.options ?? []).map((o) => o.label)].join(' ').toLowerCase();
      expect(text, `step ${id} must never say "budget"`).not.toContain('budget');
    }
  });

  test('every button step offers only listed values, and rejects anything else', () => {
    const step = buildStep('timeline', CTX);
    expect(isValidAnswer(step, 'asap')).toBe(true);
    expect(isValidAnswer(step, 'whenever')).toBe(false);
    expect(isValidAnswer(step, '')).toBe(false);
  });

  test('contact-time presets are all values the leads check constraint allows', () => {
    // Six allowed by the DB; the flow uses five of them. A sixth invented value
    // would be rejected on write, after the lead had already tapped it.
    const allowed = ['anytime', 'morning', 'afternoon', 'evening', 'weekends', 'specific'];
    const step = buildStep('contact_time', CTX);
    for (const o of step.options ?? []) {
      expect(allowed, `${o.value} is not an allowed contact_time_preference`).toContain(o.value);
    }
  });
});

/* ── AC4 - disclosure and consent ─────────────────────────────────────────── */

test.describe('AC4 - the opening', () => {
  test('discloses the AI plainly', () => {
    const opener = buildStep('consent', CTX).say.join(' ');
    expect(opener).toContain("I'm La Vaca's AI assistant");
  });

  test('says 3 minutes and never states a question count', () => {
    const opener = buildStep('consent', CTX).say.join(' ');
    expect(opener).toContain('about 3 minutes');
    // The owner removed the count deliberately on 1 Aug.
    expect(opener.toLowerCase()).not.toContain('seven');
    expect(opener).not.toMatch(/\b7\b/);
  });

  test('asks permission rather than assuming it', () => {
    expect(buildStep('consent', CTX).say.join(' ')).toContain('Is that okay?');
  });

  test('neither entry point advertises a question count either', () => {
    const ack = leadInstantAckHtml('Sarah Kim', 'Kitchen Remodeling', 'https://x/unsub', 'https://x/intake/tok');
    expect(ack).toContain('three minutes');
    expect(ack.toLowerCase()).not.toContain('7 quick questions');
    expect(ack.toLowerCase()).not.toContain('seven quick questions');
  });
});

/* ── AC6 - the price question ─────────────────────────────────────────────── */

test.describe('AC6 - price offers, never asks', () => {
  test('the owner real starting prices, verbatim', () => {
    expect(priceAnchorFor('Kitchen Remodeling')?.amount).toBe(35000);
    expect(priceAnchorFor('Bathroom Renovation')?.amount).toBe(16000);
    expect(priceAnchorFor('Basement Finishing')?.amount).toBe(30000);
    expect(priceAnchorFor('Home Addition')?.amount).toBe(350);
    expect(priceAnchorFor('Home Addition')?.unit).toBe('per_sqft');
  });

  test('project types with no honest number get no anchor', () => {
    expect(priceAnchorFor('Interior Finishing')).toBeNull();
    expect(priceAnchorFor('Whole Home Remodeling')).toBeNull();
    expect(priceAnchorFor('Other')).toBeNull();
    expect(priceAnchorFor(null)).toBeNull();
  });

  test('and skip the price step entirely rather than see an invented one', () => {
    const ctx: FlowContext = { firstName: 'Sarah', projectType: 'Interior Finishing' };
    const visited = walk({}, ctx);
    expect(visited).not.toContain('price');
    expect(visited).toContain('address');
    expect(nextStep('timeline', '1_3_months', ctx)).toBe('address');
  });

  test('the lead is never asked to supply a figure of their own', () => {
    const step = buildStep('price', CTX);
    expect(step.kind).toBe('buttons');
    for (const o of step.options ?? []) {
      // Every option is a reaction, not an amount.
      expect(o.label).not.toMatch(/\$|\d{3,}/);
    }
  });

  test('there is no "let us talk about it later" escape - the owner removed it', () => {
    const labels = (buildStep('price', CTX).options ?? []).map((o) => o.label.toLowerCase());
    expect(labels).toHaveLength(4);
    expect(labels.some((l) => l.includes('talk it through'))).toBe(false);
  });

  test('the anchor sentence says out loud that it is not a quote', () => {
    expect(buildStep('price', CTX).say.join(' ')).toContain("not a quote");
  });

  test('spelling drift between the form and the owner both resolve', () => {
    expect(hasPriceAnchor('home additions')).toBe(true);
    expect(hasPriceAnchor('Home Addition')).toBe(true);
    expect(hasPriceAnchor('KITCHEN REMODELING')).toBe(true);
  });

  test('a price step built without an anchor says so instead of rendering blank', () => {
    const step = buildStep('price', { firstName: 'Sarah', projectType: 'Interior Finishing' });
    expect(step.say.join(' ')).toBe(NO_ANCHOR_SENTENCE);
  });
});

/* ── AC7 - off script ─────────────────────────────────────────────────────── */

test.describe('AC7 - freeform is caught, never answered', () => {
  test('the message route never generates a reply', () => {
    const src = code('src/app/api/intake/[token]/message/route.ts');
    expect(src).toContain('offScriptReply');
    expect(src).not.toMatch(/openai|completions|generateText/i);
  });

  test('the reply promises a human and does not attempt the answer', () => {
    const reply = offScriptReply(true).join(' ');
    expect(reply).toContain("not going to guess");
    expect(reply).toContain('Alex and Veronica');
  });

  test('when routing failed, the lead is NOT told somebody has it', () => {
    const failed = offScriptReply(false).join(' ');
    expect(failed).not.toContain("I've sent it straight to");
    expect(failed).toContain('trouble passing it along');
    expect(failed).toContain('201) 212-4917');
  });

  test('one channel succeeding is enough to count as reaching a human', () => {
    expect(reachedAHuman({ telegram: 'sent', email: 'failed' })).toBe(true);
    expect(reachedAHuman({ telegram: 'failed', email: 'sent' })).toBe(true);
    expect(reachedAHuman({ telegram: 'failed', email: 'failed' })).toBe(false);
    expect(reachedAHuman({ telegram: 'not_configured', email: 'failed' })).toBe(false);
  });

  test('the owner alert states plainly that nothing was answered', () => {
    const msg = offScriptTelegram({
      firstName: 'Sarah', email: 's@x.com', phone: '201-555-0100',
      projectType: 'Kitchen Remodeling', question: 'do you handle permits?', intakeUrl: null,
    });
    expect(msg).toContain('did NOT answer this');
    expect(msg).toContain('do you handle permits?');
  });

  test('the question is stored before it is routed, so a routing failure is recoverable', () => {
    const src = code('src/app/api/intake/[token]/message/route.ts');
    expect(src.indexOf('recordOffScript')).toBeLessThan(src.indexOf('routeOffScript'));
  });
});

/* ── AC8 - the town line is only said when true ───────────────────────────── */

test.describe('AC8 - the warm line is conditional', () => {
  test('a service-area town gets the acknowledgement', () => {
    const step = buildStep('scope', { ...CTX, town: 'Montclair' });
    expect(step.say[0]).toContain('ten minutes from us');
  });

  test('a town we do not serve gets no pleasantry at all', () => {
    const step = buildStep('scope', { ...CTX, town: 'Princeton' });
    expect(step.say.join(' ')).not.toContain('ten minutes');
    expect(step.say[0]).toContain('full gut');
  });

  test('and the question itself is unchanged either way', () => {
    const near = buildStep('scope', { ...CTX, town: 'Montclair' });
    const far = buildStep('scope', { ...CTX, town: 'Princeton' });
    expect(near.options).toEqual(far.options);
    expect(near.say[near.say.length - 1]).toBe(far.say[far.say.length - 1]);
  });

  test('typed variations of a real town still match', () => {
    expect(isServiceArea('West Orange')).toBe(true);
    expect(isServiceArea('west orange, NJ')).toBe(true);
    expect(isServiceArea('Montclair Township')).toBe(true);
    expect(isServiceArea('Montclair NJ 07042')).toBe(true);
  });

  test('and towns we do not serve do not', () => {
    expect(isServiceArea('Princeton')).toBe(false);
    expect(isServiceArea('Hoboken')).toBe(false);
    expect(isServiceArea('')).toBe(false);
    expect(isServiceArea(null)).toBe(false);
  });

  test('normalisation strips the noise a person actually types', () => {
    expect(normalizeTown('West Orange, NJ 07052')).toBe('west orange');
    expect(normalizeTown('  MAPLEWOOD  ')).toBe('maplewood');
  });

  test('it reads the scorer own list rather than keeping a second copy', () => {
    // Two lists would drift, and the flow would greet somebody as a neighbour
    // that the scorer counts as out of area.
    expect(code('src/lib/intake/serviceArea.ts')).toContain("from '@/lib/leadScoring'");
  });
});

/* ── AC9 - the close ──────────────────────────────────────────────────────── */

test.describe('AC9 - the closing promise', () => {
  test('states 24 hours explicitly', () => {
    expect(buildStep('done', CTX).say.join(' ')).toContain('within 24 hours');
  });

  test('reflects the contact-time answer when there is one', () => {
    expect(closingPromise('evening')).toContain('aim for an evening');
    expect(closingPromise('morning')).toContain('aim for a morning');
    expect(closingPromise('weekends')).toContain('try for the weekend');
  });

  test('and does not invent one when there is not', () => {
    expect(closingPromise('anytime')).toBe('Alex or Veronica will call you within 24 hours.');
    expect(closingPromise(null)).toBe('Alex or Veronica will call you within 24 hours.');
  });

  test('a lead who declined is still promised the call', () => {
    expect(buildStep('declined', CTX).say.join(' ')).toContain('within 24 hours');
  });
});

/* ── AC2 - two ways in, one token ─────────────────────────────────────────── */

test.describe('AC2 - entry points', () => {
  test('tokens are long and unguessable', () => {
    const a = newIntakeToken();
    const b = newIntakeToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
  });

  test('the ack email carries the link when there is one', () => {
    const html = leadInstantAckHtml('Sarah Kim', 'Kitchen Remodeling', 'https://x/unsub', 'https://x/intake/tok123');
    expect(html).toContain('https://x/intake/tok123');
    expect(html).toContain('Add a few details');
  });

  test('and renders no button at all when the session could not be created', () => {
    // A dead button is worse than no button.
    for (const missing of [null, undefined, '']) {
      const html = leadInstantAckHtml('Sarah Kim', 'Kitchen Remodeling', 'https://x/unsub', missing);
      expect(html).not.toContain('Add a few details');
      expect(html).toContain('Thanks for');
    }
  });

  test('both entry points address the same token', () => {
    expect(intakePathFor('abc')).toBe('/intake/abc');
    expect(intakeUrlFor('https://www.lavacagc.com', 'abc')).toBe('https://www.lavacagc.com/intake/abc');
    const src = code('src/app/api/leads/submit/route.ts');
    expect(src).toContain('intakePathFor');
    expect(src).toContain('intakeUrl: intakePath,');
  });

  test('the emailed link is canonical, not built from the request host', () => {
    // An emailed CTA is opened days later from an inbox, so it cannot point at
    // whichever alias - apex, www, a preview host - happened to serve the form.
    const submit = code('src/app/api/leads/submit/route.ts');
    expect(submit, 'the submit route must not derive the link from request.url')
      .not.toContain('new URL(request.url).origin');

    const followUp = code('src/lib/notify/leadFollowUp.ts');
    expect(followUp).toContain('${SITE_URL}${intakePath}');
  });

  test('a failed session does not fail the submission', () => {
    // createIntakeSession returns null rather than throwing; a lead that saved
    // is a lead, and must still alert and acknowledge.
    expect(code('src/lib/intake/session.ts')).toContain('return null;');
  });
});

/* ── AC11/AC12 - security and honest failure ──────────────────────────────── */

test.describe('AC11 - security', () => {
  test('all three new tables have RLS enabled', () => {
    const sql = read('supabase/migrations/20260819000000_lead_intake.sql');
    for (const t of ['lead_intake_sessions', 'lead_intake_events', 'lead_intake_photos']) {
      // Whitespace-tolerant: the statements are column-aligned in the file, and
      // the guarantee is that RLS is on, not how the SQL is indented.
      expect(sql, `${t} must have RLS enabled`).toMatch(
        new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`),
      );
    }
    // Service-role only means RLS on with NO policies. A policy here would be
    // the bug, not the fix.
    expect(sql).not.toContain('CREATE POLICY');
  });

  test('every intake route is rate limited', () => {
    for (const f of [
      'src/app/api/intake/[token]/answer/route.ts',
      'src/app/api/intake/[token]/message/route.ts',
      'src/app/api/intake/[token]/photo/route.ts',
    ]) {
      expect(code(f), `${f} must rate limit`).toContain('checkRateLimit');
    }
  });

  test('the intake page is noindex', () => {
    expect(code('src/app/intake/[token]/page.tsx')).toContain('index: false');
  });

  test('the answer route is POST only', () => {
    const src = code('src/app/api/intake/[token]/answer/route.ts');
    expect(src).toContain('export async function POST');
    expect(src).not.toContain('export async function GET');
  });

  test('a finished conversation takes no further uploads', () => {
    // The answer route already 409s on a terminal session; without the same
    // check here a completed session is an open upload endpoint forever.
    const src = code('src/app/api/intake/[token]/photo/route.ts');
    expect(src).toContain('isTerminal(session.current_step)');
    expect(src).toContain('status: 409');
  });

  test('photos are bounded per session, not just per request', () => {
    const src = code('src/app/api/intake/[token]/photo/route.ts');
    expect(src).toContain('MAX_PER_SESSION');
    expect(src).toContain('already + files.length > MAX_PER_SESSION');
  });
});

test.describe('AC12 - failure reads as failure', () => {
  test('an unreadable session is not reported as an invalid link', () => {
    const page = read('src/app/intake/[token]/page.tsx');
    expect(page).toContain("We couldn't load your details");
    expect(page).toContain("This link isn't valid");
    // The two states must produce different words.
    expect(page.indexOf("We couldn't load your details")).not.toBe(page.indexOf("This link isn't valid"));
  });

  test('the answer route separates 503 from 404', () => {
    const src = code('src/app/api/intake/[token]/answer/route.ts');
    expect(src).toContain("status: 503");
    expect(src).toContain("status: 404");
    expect(src).toContain("wasn't saved");
  });

  test('a NUL byte does not dead-end the conversation', () => {
    // Postgres rejects U+0000 in text AND in jsonb, so an unstripped one makes
    // recordAnswer throw, the route answer 503, and every identical retry fail
    // the same way - with the draft already cleared on the client.
    const pasted = `open the \u0000kitchen\u0000`;
    expect(normalizeIntakeText(pasted)).toBe('open the kitchen');
    expect(normalizeIntakeText('  padded  ')).toBe('padded');
    // A button value survives it, so validation still passes.
    expect(isValidAnswer(buildStep('scope', CTX), normalizeIntakeText('full_gut\u0000'))).toBe(true);

    for (const f of [
      'src/app/api/intake/[token]/answer/route.ts',
      'src/app/api/intake/[token]/message/route.ts',
    ]) {
      expect(code(f), `${f} must normalise before it validates or stores`).toContain('normalizeIntakeText(');
    }
  });

  test('the intake adds to leads.message rather than replacing it', () => {
    // RequestEstimateForm composes property type, services, timing and the
    // lead's own notes into that column, and now shows the intake invite on its
    // confirmation panel. A blind PATCH would destroy all of it.
    const src = code('src/lib/intake/session.ts');
    expect(src).toContain("APPEND_COLUMNS = new Set(['message'])");
    expect(src, 'a failed read must write nothing rather than overwrite').toContain('if (next === null) return;');
    expect(src, 'a retried answer must not stack a second copy').toContain('existing.includes(value)');
  });

  test('a partial photo upload reports the failures', () => {
    const src = code('src/app/api/intake/[token]/photo/route.ts');
    expect(src).toContain('failed: failed.length');
    expect(src).toContain("None of those uploaded");
  });

  test('the client shows the server message rather than a generic apology', () => {
    expect(code('src/app/intake/[token]/IntakeThread.tsx')).toContain('data.error ||');
  });

  test('a lookup distinguishes missing from unreadable', () => {
    const src = code('src/lib/intake/session.ts');
    expect(src).toContain("state: 'missing'");
    expect(src).toContain("state: 'unreadable'");
  });
});

/* ── AC10 - columns ───────────────────────────────────────────────────────── */

test.describe('AC10 - data lands in the right columns', () => {
  test('existing columns are filled, not duplicated', () => {
    const fields = (['project', 'town', 'timeline', 'address', 'contact_time'] as StepId[])
      .map((id) => buildStep(id, CTX).field);
    expect(fields).toEqual(['message', 'city', 'project_timeline', 'address', 'contact_time_preference']);
  });

  test('the new columns are registered with the sanitizer', () => {
    const src = read('src/lib/leadSanitize.ts');
    for (const c of ['scope_tier', 'scope_detail', 'finish_level', 'price_reaction']) {
      expect(src, `${c} must be a writable column or the sanitizer drops it`).toContain(`'${c}'`);
    }
    expect(src).toContain('price_anchor_shown');
  });

  test('budget_range is left alone', () => {
    // It holds real ranges from the calculator and forms, and the owner alert
    // renders it. Storing 'about_expected' there would make those emails read
    // as nonsense.
    const steps: StepId[] = ['price', 'scope', 'finish', 'timeline'];
    for (const id of steps) {
      expect(buildStep(id, CTX).field).not.toBe('budget_range');
    }
  });

  test('the migration adds every column the flow writes', () => {
    const sql = read('supabase/migrations/20260819000000_lead_intake.sql');
    for (const c of ['scope_tier', 'scope_detail', 'finish_level', 'price_anchor_shown', 'price_reaction']) {
      expect(sql).toContain(c);
    }
  });
});

/* ── AC2 (cont) - the on-page confirmation ────────────────────────────────── */

test.describe('AC2 - the on-page invite', () => {
  const FORMS = [
    'src/components/HomeEstimateForm.tsx',
    'src/components/LandingPageLeadForm.tsx',
    'src/components/services/RequestEstimateForm.tsx',
  ];

  test('every form with a confirmation panel renders the invite', () => {
    for (const f of FORMS) {
      const src = code(f);
      expect(src, `${f} must render IntakeInvite`).toContain('<IntakeInvite url={intakeUrl}');
      expect(src, `${f} must read intakeUrl off the submit response`).toContain('data?.intakeUrl');
    }
  });

  test('the invite renders nothing without a url, rather than a dead button', () => {
    const src = code('src/components/IntakeInvite.tsx');
    expect(src).toContain('if (!url) return null;');
  });

  test('and offers skipping in plain words', () => {
    const src = read('src/components/IntakeInvite.tsx');
    expect(src).toContain('Or skip it');
    expect(src).toContain('still call you within 24 hours');
  });

  test('nothing this feature says to a lead uses an em dash', () => {
    for (const f of [
      'src/components/IntakeInvite.tsx',
      'src/lib/intake/flow.ts',
      'src/lib/intake/pricing.ts',
      'src/app/intake/[token]/IntakeThread.tsx',
      'src/app/intake/[token]/page.tsx',
    ]) {
      expect(read(f), `${f} must use a plain dash`).not.toContain('—');
    }
  });

  test('the invite states 3 minutes, not a question count', () => {
    const src = read('src/components/IntakeInvite.tsx');
    expect(src).toContain('three minutes');
    expect(src.toLowerCase()).not.toContain('seven');
  });
});

/* ── AC13 - the completion brief ──────────────────────────────────────────── */

test.describe('AC13 - finishing the intake tells a human', () => {
  const ANSWERS = {
    message: 'open the kitchen into the living room, there is a wall in the middle',
    city: 'West Orange', address: '51 Crestmont Rd', scope_tier: 'major_update',
    finish_level: 'middle', project_timeline: '1_3_months',
    price_reaction: 'about_expected', contact_time_preference: 'afternoon',
  };
  const base = { firstName: 'Alex', projectType: 'Kitchen Remodeling', answers: ANSWERS };

  test('the brief carries every answer the lead gave', () => {
    const msg = completionMessage({ ...base, phone: '(201) 555-0100', photoCount: 3, priceAnchor: 35000 });
    expect(msg).toContain('Intake finished');
    expect(msg).toContain('open the kitchen into the living room');
    expect(msg).toContain('Major update');
    expect(msg).toContain('1 to 3 months');
    expect(msg).toContain('West Orange');
    expect(msg).toContain('51 Crestmont Rd');
    expect(msg).toContain('Weekday afternoons');
    expect(msg).toContain('3 attached');
  });

  test('stored codes are translated, never shown raw', () => {
    const msg = completionMessage({ ...base, priceAnchor: 35000 });
    for (const raw of ['major_update', '1_3_months', 'about_expected', 'contact_time_preference']) {
      expect(msg, `${raw} must not reach the owner as a code`).not.toContain(raw);
    }
  });

  test('the money signal is stated in plain words, with the number we showed', () => {
    expect(reactionLine('about_expected', 35000)).toContain('$35,000');
    expect(reactionLine('well_above', 16000)).toContain('WELL ABOVE');
    expect(reactionLine('below_expected', 30000)).toContain('less than they expected');
    // No anchor shown means no invented figure in the brief either.
    expect(reactionLine('about_expected', null)).toContain('our starting price');
    expect(reactionLine(undefined, 35000)).toBeNull();
  });

  test('urgency reads off timeline and price together', () => {
    expect(urgencyLine('asap', 'about_expected')).toContain('Call this one first');
    expect(urgencyLine('1_3_months', 'well_above')).toContain('stretch');
    expect(urgencyLine('planning', 'about_expected')).toContain('Still planning');
    expect(urgencyLine('3_6_months', undefined)).toBeNull();
  });

  test('a very long answer still fits inside one Telegram message', () => {
    // sendMessage 400s on the WHOLE message over 4096 characters, so without a
    // cap the most engaged lead - long description AND the "Add my own details"
    // branch - is exactly the one whose brief never arrives. '&' is the worst
    // case: escaping turns each one into five characters.
    const long = '&'.repeat(2000);
    const msg = completionMessage({
      firstName: long,
      projectType: long,
      answers: {
        ...ANSWERS, message: long, scope_detail: long, address: long, city: long,
      },
      phone: long,
      photoCount: 6,
      priceAnchor: 35000,
    });
    expect(msg.length).toBeLessThanOrEqual(TELEGRAM_TEXT_LIMIT);
    // Clipped, not dropped: the start of what they said still has to be there.
    expect(msg).toContain('Intake finished');
    expect(msg).toContain('...');

    const question = offScriptTelegram({
      firstName: long, email: long, phone: long, projectType: long,
      question: long, intakeUrl: null,
    });
    expect(question.length).toBeLessThanOrEqual(TELEGRAM_TEXT_LIMIT);
    expect(question).toContain('did NOT answer this');
  });

  test('clipping never leaves half an HTML entity behind', () => {
    // '&' escapes to '&amp;'. A cut through the middle of that would arrive as
    // the literal text "&am", which is the bug this whole test file guards.
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      const msg = completionMessage({
        ...base,
        answers: { ...ANSWERS, address: `${'x'.repeat(190 + n)}${'&'.repeat(20)}` },
      });
      const entities = msg.match(/&[a-z]*;?/gi) ?? [];
      expect(entities.every((e) => ['&lt;', '&gt;', '&amp;'].includes(e.toLowerCase())), msg).toBe(true);
    }
  });

  test('no HTML entity beyond the three Telegram actually supports', () => {
    // Telegram HTML mode delivers &middot; and &#128222; as literal text, so a
    // message using them arrives reading "Alex &middot; Kitchen".
    const messages = [
      completionMessage({ ...base, phone: '(201) 555-0100', priceAnchor: 35000 }),
      offScriptTelegram({
        firstName: 'Alex', email: 'a@x.com', phone: '201-555-0100',
        projectType: 'Kitchen Remodeling', question: 'permits?', intakeUrl: null,
      }),
    ];
    for (const msg of messages) {
      const entities = msg.match(/&[a-z]+;|&#\d+;/gi) ?? [];
      const unsupported = entities.filter((e) => !['&lt;', '&gt;', '&amp;'].includes(e.toLowerCase()));
      expect(unsupported, `unsupported Telegram entities: ${unsupported.join(', ')}`).toEqual([]);
    }
  });

  test('the answer route sends it on completion, and awaits it', () => {
    const src = code('src/app/api/intake/[token]/answer/route.ts');
    expect(src).toContain('await sendCompletionAlert(');
    expect(src).toContain('terminal && !declined');
  });

  test('a lead who declined gets no brief - there is nothing new to say', () => {
    const src = code('src/app/api/intake/[token]/answer/route.ts');
    const guard = src.indexOf('terminal && !declined');
    const call = src.indexOf('await sendCompletionAlert(');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(call);
  });

  test('the last answer is included, not the stale session copy', () => {
    // contact_time_preference is the FINAL answer; reading session.answers
    // alone would send a brief missing the one field that says when to call.
    const src = code('src/app/api/intake/[token]/answer/route.ts');
    expect(src).toContain('...session.answers, ...(step.field ? { [step.field]: answer } : {})');
  });

  test('a failed brief is logged loudly rather than swallowed', () => {
    expect(code('src/app/api/intake/[token]/answer/route.ts')).toContain("outcome !== 'sent'");
  });
});
