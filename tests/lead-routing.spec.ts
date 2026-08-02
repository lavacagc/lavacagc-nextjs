import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { scoreIntake, routeIntake, lowIntentDecision } from '../src/lib/intake/scoring';
import { scoreLead } from '../src/lib/leadScoring';
import { sanitizeLeadForInsert } from '../src/lib/leadSanitize';
import {
  chaseMessage, lowIntentMessage, abandonedMessage, answeredLabels, hoursSince,
  chaseOne, candidateQuery, claimPath, chaseCutoff, paginate, isPastChasing,
  CHASE_PAGE, CHASE_STAMP, CHASE_MAX_AGE_HOURS,
  type ChaseCandidate, type ChaseDeps,
} from '../src/lib/intake/chase';
import { countPhotosForScoring, recordRouting } from '../src/lib/intake/session';
import { completionMessage } from '../src/lib/intake/completionAlert';
import { TELEGRAM_TEXT_LIMIT, type TelegramOutcome } from '../src/lib/notify/telegramMessage';

/**
 * Acceptance criteria for lead scoring and routing.
 * See docs/lead-routing-acceptance-criteria.md - IDs below match that doc.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const code = (p: string) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const NOW = new Date('2026-08-02T18:00:00Z');
const CUTOFF = '2026-08-02T14:00:00.000Z';

const answers = (o: Partial<Record<string, string>> = {}) => ({
  city: 'Montclair', scope_tier: 'full_gut', project_timeline: 'asap',
  price_reaction: 'about_expected', ...o,
}) as Record<string, string>;

/* ── AC1 - the four signals the spec names ────────────────────────────────── */

test.describe('AC1 - the spec four', () => {
  test('town in the service area scores, and is named in the record', () => {
    const near = scoreIntake({ answers: answers({ city: 'Montclair' }), photoCount: 0 });
    const far = scoreIntake({ answers: answers({ city: 'Princeton' }), photoCount: 0 });
    expect(near.score).toBeGreaterThan(far.score);
    expect(near.signals.join(' ')).toContain('In the service area');
    expect(far.signals.join(' ')).toContain('Outside the service area');
  });

  test('scope tier is ordered full gut > major update > refresh', () => {
    const s = (v: string) => scoreIntake({ answers: answers({ scope_tier: v }), photoCount: 0 }).score;
    expect(s('full_gut')).toBeGreaterThan(s('major_update'));
    expect(s('major_update')).toBeGreaterThan(s('refresh'));
  });

  test('"described it themselves" scores mid, not zero', () => {
    // They told us more, not less. Scoring it zero would punish engagement.
    const own = scoreIntake({ answers: answers({ scope_tier: 'own_details' }), photoCount: 0 }).score;
    const refresh = scoreIntake({ answers: answers({ scope_tier: 'refresh' }), photoCount: 0 }).score;
    const gut = scoreIntake({ answers: answers({ scope_tier: 'full_gut' }), photoCount: 0 }).score;
    expect(own).toBeGreaterThan(refresh);
    expect(own).toBeLessThan(gut);
  });

  test('timeline is ordered, and "just planning" scores nothing', () => {
    const s = (v: string) => scoreIntake({ answers: answers({ project_timeline: v }), photoCount: 0 }).score;
    expect(s('asap')).toBeGreaterThan(s('1_3_months'));
    expect(s('1_3_months')).toBeGreaterThan(s('3_6_months'));
    expect(s('3_6_months')).toBeGreaterThan(s('later_this_year'));
    expect(s('later_this_year')).toBeGreaterThan(s('planning'));
  });

  test('photos score, and their absence is recorded rather than left silent', () => {
    const with3 = scoreIntake({ answers: answers(), photoCount: 3 });
    const none = scoreIntake({ answers: answers(), photoCount: 0 });
    expect(with3.score).toBeGreaterThan(none.score);
    expect(with3.signals.join(' ')).toContain('Sent 3 photos');
    expect(none.signals.join(' ')).toContain('No photos');
  });

  test('a photo count that could NOT be read is never recorded as "No photos"', () => {
    // The signals are written permanently to the lead and quoted into
    // routing_reason. A transient Supabase error must not put a false statement
    // there: "they sent none" and "we could not tell" are different facts.
    const unknown = scoreIntake({ answers: answers(), photoCount: null });
    expect(unknown.signals.join(' ')).not.toContain('No photos');
    expect(unknown.signals.join(' ')).toContain('Photo count unavailable');
  });

  test('AN UNREADABLE COUNT THAT WOULD HAVE DECIDED THE BUCKET ROUTES HOT', () => {
    // 45 with photos unknown: 10 more would clear 55. A wrongly hot lead costs
    // one phone call, a wrongly cold one is lost, so the doubt goes to the lead.
    const doubtful = scoreIntake({
      answers: answers({ project_timeline: 'planning', price_reaction: 'well_above' }),
      photoCount: null,
    });
    expect(doubtful.score).toBe(45);
    expect(doubtful.bucket).toBe('hot');
    // The count is never invented, and the record says which way the doubt went.
    expect(scoreIntake({
      answers: answers({ project_timeline: 'planning', price_reaction: 'well_above' }),
      photoCount: 0,
    }).bucket).toBe('cold');
    expect(doubtful.signals[0]).toContain('Photo count unavailable');
    expect(doubtful.signals[0]).toContain('routed hot rather than risk losing it');
    // ...and it leads the reason, so a score under the threshold next to a hot
    // bucket is never left looking like a bug.
    expect(routeIntake(doubtful).reason).toContain('Photo count unavailable');
  });

  test('an unreadable count that could not have changed the bucket says exactly that', () => {
    const stillHot = scoreIntake({ answers: answers(), photoCount: null });
    expect(stillHot.bucket).toBe('hot');
    expect(stillHot.signals.join(' ')).toContain('could not have changed the bucket');

    const stillCold = scoreIntake({ answers: { city: 'Princeton' }, photoCount: null });
    expect(stillCold.bucket).toBe('cold');
    expect(stillCold.signals.join(' ')).toContain('could not have changed the bucket');
  });

  test('the completion path reads a count that is allowed to say "unknown"', () => {
    const src = code('src/app/api/intake/[token]/answer/route.ts');
    expect(src).toContain('countPhotosForScoring(session.id)');
    expect(src).not.toContain('countPhotos(session.id)');
  });

  test('the scoring read retries once before it settles for "unknown"', async () => {
    let calls = 0;
    const recovered = await countPhotosForScoring('s1', async () => (++calls === 1 ? null : 3));
    expect(recovered).toBe(3);
    expect(calls).toBe(2);

    calls = 0;
    expect(await countPhotosForScoring('s1', async () => { calls++; return null; })).toBeNull();
    expect(calls).toBe(2);
  });

  test('a count that read first time is not read again', async () => {
    let calls = 0;
    // Zero is an answer, not a failure, and must not trigger the retry.
    expect(await countPhotosForScoring('s1', async () => { calls++; return 0; })).toBe(0);
    expect(calls).toBe(1);
  });

  test('the town predicate is shared with the flow and the scorer, not re-implemented', () => {
    expect(code('src/lib/intake/scoring.ts')).toContain("cityInServiceArea");
    expect(code('src/lib/intake/scoring.ts')).toContain("from '@/lib/leadScoring'");
  });
});

/* ── AC2 - the fifth signal ───────────────────────────────────────────────── */

test.describe('AC2 - the price reaction is scored and is heaviest', () => {
  test('priced out costs more than any other single downgrade', () => {
    const base = scoreIntake({ answers: answers(), photoCount: 0 }).score;
    const priced = base - scoreIntake({ answers: answers({ price_reaction: 'well_above' }), photoCount: 0 }).score;
    const timing = base - scoreIntake({ answers: answers({ project_timeline: 'planning' }), photoCount: 0 }).score;
    const scope = base - scoreIntake({ answers: answers({ scope_tier: 'refresh' }), photoCount: 0 }).score;
    expect(priced).toBeGreaterThan(0);
    expect(priced).toBeGreaterThanOrEqual(Math.min(timing, scope));
  });

  test('"under what I expected" is not penalised against "about right"', () => {
    const under = scoreIntake({ answers: answers({ price_reaction: 'below_expected' }), photoCount: 0 }).score;
    const about = scoreIntake({ answers: answers({ price_reaction: 'about_expected' }), photoCount: 0 }).score;
    expect(under).toBe(about);
  });

  test('the reaction is named in plain words in the record', () => {
    const r = scoreIntake({ answers: answers({ price_reaction: 'well_above' }), photoCount: 0 });
    expect(r.signals.join(' ')).toContain('well above what they planned');
  });
});

/* ── AC3 - two buckets, defensible threshold ──────────────────────────────── */

test.describe('AC3 - bucketing actually separates', () => {
  test('THE PRINCETON CASE: what the old scorer called hot, this calls cold', () => {
    // scoreLead gives this 105 and buckets it hot, because project type alone
    // contributes 80 against an 80-point threshold. That is the whole reason
    // this module exists.
    const old = scoreLead({ projectType: 'Bathroom Renovation', city: 'Princeton', email: 'a@b.c', source: 'contact_form' });
    expect(old.tier).toBe('hot');

    const now = scoreIntake({
      answers: { city: 'Princeton', scope_tier: 'refresh', project_timeline: 'planning', price_reaction: 'well_above' },
      photoCount: 0,
    });
    expect(now.bucket).toBe('cold');
  });

  test('in area, full gut, starting soon, price fine is hot', () => {
    expect(scoreIntake({ answers: answers(), photoCount: 3 }).bucket).toBe('hot');
  });

  test('local and ambitious but priced out and not starting is still cold', () => {
    const r = scoreIntake({
      answers: answers({ project_timeline: 'planning', price_reaction: 'well_above' }),
      photoCount: 0,
    });
    expect(r.bucket).toBe('cold');
  });

  test('no single signal can carry a lead to hot on its own', () => {
    for (const only of [
      { city: 'Montclair' },
      { scope_tier: 'full_gut' },
      { project_timeline: 'asap' },
      { price_reaction: 'about_expected' },
    ]) {
      const r = scoreIntake({ answers: only as Record<string, string>, photoCount: 0 });
      expect(r.bucket, `${JSON.stringify(only)} alone must not be hot`).toBe('cold');
    }
  });

  test('there is no third bucket', () => {
    const seen = new Set<string>();
    for (const city of ['Montclair', 'Princeton']) {
      for (const scope of ['full_gut', 'major_update', 'refresh', 'own_details']) {
        for (const tl of ['asap', '1_3_months', '3_6_months', 'later_this_year', 'planning']) {
          for (const pr of ['below_expected', 'about_expected', 'a_bit_more', 'well_above']) {
            seen.add(scoreIntake({
              answers: { city, scope_tier: scope, project_timeline: tl, price_reaction: pr },
              photoCount: 0,
            }).bucket);
          }
        }
      }
    }
    expect([...seen].sort()).toEqual(['cold', 'hot']);
  });

  test('an empty answer set does not crash and is cold', () => {
    const r = scoreIntake({ answers: {}, photoCount: 0 });
    expect(r.bucket).toBe('cold');
    expect(r.score).toBe(0);
  });
});

/* ── AC4/AC5 - the decision is recorded and acted on ──────────────────────── */

test.describe('AC4 - routing is recorded, not just made', () => {
  test('hot routes to the people who do the visit', () => {
    const d = routeIntake(scoreIntake({ answers: answers(), photoCount: 2 }));
    expect(d.bucket).toBe('hot');
    expect(d.routedTo).toContain('Alex');
    expect(d.routedTo).toContain('Veronica');
  });

  test('cold enters nurture - a destination, not a bin', () => {
    const d = routeIntake(scoreIntake({
      answers: { city: 'Princeton', project_timeline: 'planning' }, photoCount: 0,
    }));
    expect(d.bucket).toBe('cold');
    expect(d.routedTo).toBe('nurture');
  });

  test('the reason is readable by a person, not a code', () => {
    const d = routeIntake(scoreIntake({ answers: answers(), photoCount: 1 }));
    expect(d.reason).toMatch(/^Scored \d+, hot\./);
    expect(d.reason).toContain('In the service area');
    expect(d.reason).not.toMatch(/full_gut|1_3_months|about_expected/);
  });

  test('the answer route writes the decision BEFORE it sends the brief', () => {
    const src = code('src/app/api/intake/[token]/answer/route.ts');
    expect(src).toContain('await recordRouting(');
    expect(src.indexOf('await recordRouting(')).toBeLessThan(src.indexOf('await sendCompletionAlert('));
  });

  test('a failed routing write is loud, not swallowed', () => {
    expect(code('src/lib/intake/session.ts')).toContain('FAILED to record routing');
  });

  test('the outcome of the routing write reaches the brief', () => {
    const src = code('src/app/api/intake/[token]/answer/route.ts');
    expect(src).toContain('const routingRecorded = await recordRouting(');
    expect(src).toContain('recorded: routingRecorded');
  });

  test('A SESSION WITH NO LEAD ROW IS NOT A FAILED WRITE', async () => {
    // submit/route sets lead_id to null when the insert returned nothing. There
    // was never a row for the routing to be missing from, and warning about a
    // lost record when none was due teaches the owner to ignore the warning.
    expect(await recordRouting({
      leadId: null, score: 90, bucket: 'hot', signals: [], routedTo: 'Alex and Veronica', reason: 'x',
    })).toBeNull();

    const msg = completionMessage({
      firstName: 'Sarah', projectType: 'Kitchen Remodeling', answers: answers(),
      routing: { bucket: 'hot', score: 92, recorded: null },
    });
    expect(msg).not.toContain('NOT saved to the lead');
  });

  test('a brief whose routing did not save says so, rather than implying it did', () => {
    const msg = completionMessage({
      firstName: 'Sarah', projectType: 'Kitchen Remodeling', answers: answers(),
      routing: { bucket: 'hot', score: 92, recorded: false },
    });
    expect(msg).toContain('HOT LEAD (92/100)');
    expect(msg).toContain('NOT saved to the lead');
  });

  test('a brief whose routing did save does not nag about it', () => {
    const msg = completionMessage({
      firstName: 'Sarah', projectType: 'Kitchen Remodeling', answers: answers(),
      routing: { bucket: 'hot', score: 92, recorded: true },
    });
    expect(msg).not.toContain('NOT saved to the lead');
  });

  test('the migration adds every column the routing writes', () => {
    const sql = read('supabase/migrations/20260820000000_lead_routing.sql');
    for (const c of ['intake_score', 'intake_bucket', 'intake_signals', 'routed_to', 'routed_at', 'routing_reason']) {
      expect(sql).toContain(c);
    }
    expect(sql).toContain("CHECK (intake_bucket IS NULL OR intake_bucket IN ('hot', 'cold'))");
  });

  test('A ROUTING VERDICT IN A PAYLOAD IS DROPPED, NEVER WRITTEN', () => {
    // /api/leads/submit is unauthenticated and LeadSubmitSchema passes unknown
    // keys through, so anything the sanitizer accepts here can be forged onto a
    // fresh lead. recordRouting PATCHes the lead directly and never comes
    // through this function, so none of these columns has any business being
    // accepted from a request body.
    const forged = {
      intake_bucket: 'hot', intake_score: 100, intake_signals: ['forged'],
      routed_to: 'Alex and Veronica', routing_reason: 'forged', routed_at: '2026-08-02T00:00:00Z',
    };
    const r = sanitizeLeadForInsert({
      first_name: 'Sarah', last_name: 'K', email: 'a@b.c', phone: '201',
      inquiry_type: 'estimate', ...forged,
    });
    for (const col of Object.keys(forged)) {
      expect(r.lead[col], `${col} must never come from a payload`).toBeUndefined();
      expect(r.adjustments.join(' ')).toContain(col);
    }
    // Dropped loudly, and the lead itself still saves. Losing a field a form had
    // no business sending beats losing the lead.
    expect(r.lead.first_name).toBe('Sarah');
  });

  test('a value the CHECK would reject cannot cost the whole lead either', () => {
    // Postgres answers 23514 for an out-of-range intake_bucket, the route would
    // 500, and the lead would be lost. Dropped before it gets there.
    const r = sanitizeLeadForInsert({
      first_name: 'Sarah', last_name: 'K', email: 'a@b.c', phone: '201',
      inquiry_type: 'estimate', intake_bucket: 'warm',
    });
    expect(r.lead.intake_bucket).toBeUndefined();
    expect(r.adjustments.join(' ')).toContain('intake_bucket');
    expect(r.lead.first_name).toBe('Sarah');
  });

  test('the columns the intake really does capture still go through', () => {
    // The answers slice A collects are mirrored onto the lead and must not be
    // caught by the same net as the routing verdict.
    const r = sanitizeLeadForInsert({
      first_name: 'Sarah', last_name: 'K', email: 'a@b.c', phone: '201',
      inquiry_type: 'estimate',
      scope_tier: 'full_gut', scope_detail: 'gut it', finish_level: 'middle',
      price_reaction: 'about_expected',
    });
    expect(r.lead.scope_tier).toBe('full_gut');
    expect(r.lead.price_reaction).toBe('about_expected');
    expect(r.adjustments).toEqual([]);
  });

  test('score and tier are left alone', () => {
    const sql = read('supabase/migrations/20260820000000_lead_routing.sql');
    expect(sql).not.toMatch(/ALTER TABLE public\.leads[^;]*\b(DROP COLUMN|ALTER COLUMN)\s+(score|tier)\b/);
  });
});

test.describe('AC5 - a hot lead announces itself', () => {
  test('the brief leads with the bucket and the score', () => {
    const hot = completionMessage({
      firstName: 'Sarah', projectType: 'Kitchen Remodeling', answers: answers(),
      routing: { bucket: 'hot', score: 92 },
    });
    expect(hot).toContain('HOT LEAD (92/100)');
  });

  test('a cold lead still gets the whole brief, quietly', () => {
    const cold = completionMessage({
      firstName: 'Sarah', projectType: 'Kitchen Remodeling', answers: answers(),
      routing: { bucket: 'cold', score: 30 },
    });
    expect(cold).toContain('cold, 30/100');
    expect(cold).not.toContain('HOT LEAD');
    // Cold is a different destination, not a bin: the detail is still there.
    expect(cold).toContain('Scope');
    expect(cold).toContain('Timeline');
  });

  test('with no routing at all the brief still renders', () => {
    const plain = completionMessage({ firstName: 'Sarah', projectType: 'Kitchen', answers: answers() });
    expect(plain).toContain('Intake finished');
  });

  test('A HOT BANNER UNDER THE THRESHOLD EXPLAINS ITSELF', async () => {
    // The benefit of the doubt produces "HOT LEAD (45/100)" against a threshold
    // of 55. Unexplained, the one message the owner reads before picking up the
    // phone looks like a bug in the scoring, on the one occasion they most need
    // to trust the label.
    const scored = scoreIntake({
      answers: answers({ project_timeline: 'planning', price_reaction: 'well_above' }),
      photoCount: null,
    });
    expect(scored.score).toBeLessThan(55);
    expect(scored.bucket).toBe('hot');

    const msg = completionMessage({
      firstName: 'Sarah', projectType: 'Kitchen Remodeling', answers: answers(),
      routing: { bucket: scored.bucket, score: scored.score, signals: scored.signals },
    });
    expect(msg).toContain(`HOT LEAD (${scored.score}/100)`);
    expect(msg).toContain('Photo count unavailable');
    expect(msg).toContain('routed hot rather than risk losing it');
  });

  test('a hot lead whose score earned it is not explained at all', () => {
    const msg = completionMessage({
      firstName: 'Sarah', projectType: 'Kitchen Remodeling', answers: answers(),
      routing: { bucket: 'hot', score: 92, signals: ['In the service area (Montclair)'] },
    });
    expect(msg).toContain('HOT LEAD (92/100)');
    expect(msg).not.toContain('In the service area');
  });

  test('A PHOTO COUNT THAT COULD NOT BE READ DOES NOT RENDER AS "THEY SENT NONE"', () => {
    const brief = (photoCount: number | null | undefined) => completionMessage({
      firstName: 'Sarah', projectType: 'Kitchen Remodeling', answers: answers(), photoCount,
    });
    expect(brief(3)).toContain('<b>Photos</b> 3 attached');
    expect(brief(0)).toContain('none sent');
    expect(brief(null)).toContain('count unavailable');
    // Three different facts, three different lines - and no line at all when
    // the caller had no count to offer either way.
    expect(brief(0)).not.toBe(brief(null));
    expect(brief(undefined)).not.toContain('Photos');
  });
});

/* ── AC6/AC7 - chasing the quiet ones ─────────────────────────────────────── */

const candidate = (o: Partial<ChaseCandidate> = {}): ChaseCandidate => ({
  id: 's1', lead_id: 'l1', first_name: 'Sarah', project_type: 'Kitchen Remodeling',
  answers: {}, created_at: '2026-08-02T10:00:00Z', opened_at: null, updated_at: null, ...o,
});

/** A candidate for the abandoned stage: opened, then quiet. */
const quiet = (o: Partial<ChaseCandidate> = {}): ChaseCandidate =>
  candidate({ opened_at: '2026-08-02T12:00:00Z', updated_at: '2026-08-02T13:00:00Z', ...o });

test.describe('AC6 - never opened the link', () => {
  test('says what happened and that it is a signal, not a complaint', () => {
    const msg = lowIntentMessage(candidate(), NOW);
    expect(msg).toContain('Never opened');
    expect(msg).toContain('8 hours ago');
    expect(msg).toContain('worth one manual follow-up');
  });

  test('the decision it records is cold, into nurture', () => {
    const d = lowIntentDecision();
    expect(d.bucket).toBe('cold');
    expect(d.routedTo).toBe('nurture');
    expect(d.reason).toContain('Never opened');
  });

  test('the candidate query only picks sessions never opened and never alerted', () => {
    const q = candidateQuery('low_intent', CUTOFF);
    expect(q).toContain('opened_at=is.null');
    expect(q).toContain('low_intent_alert_at=is.null');
    expect(q).toContain(`created_at=lt.${CUTOFF}`);
  });

  test('a session that already finished is not chased as low intent', () => {
    // markOpened swallows its errors, so a completed session can carry a null
    // opened_at - and chasing it would overwrite its real hot routing with cold.
    const q = candidateQuery('low_intent', CUTOFF);
    expect(q).toContain('completed_at=is.null');
    expect(q).toContain('declined_at=is.null');
  });

  test('the name is clipped, so one long name cannot cost the whole message', () => {
    const msg = lowIntentMessage(candidate({ first_name: '<'.repeat(2000) }), NOW);
    expect(msg.length).toBeLessThan(TELEGRAM_TEXT_LIMIT);
  });
});

test.describe('AC7 - started and stopped', () => {
  test('says how far they got, so it cannot be mistaken for a finished one', () => {
    const msg = abandonedMessage(quiet({
      answers: { message: 'gut the kitchen', city: 'Montclair', scope_tier: 'full_gut' },
    }), NOW);
    expect(msg).toContain('Started the intake and stopped');
    expect(msg).toContain('what the project is, their town, scope');
    expect(msg).toContain('has NOT been scored or routed');
  });

  test('it reports the quiet period, which is what selected them', () => {
    const msg = abandonedMessage(quiet(), NOW);
    expect(msg).toContain('Opened it 6 hours ago');
    expect(msg).toContain('Nothing from them for 5 hours');
  });

  test('a lead who opened it and answered nothing says exactly that', () => {
    const msg = abandonedMessage(quiet(), NOW);
    expect(msg).toContain('They answered nothing');
  });

  test('the quiet period is measured from the last answer, not from the open', () => {
    // A lead who opened the link hours ago but answered a question minutes ago
    // is still mid-conversation. Chasing them would land "you did not finish" a
    // minute before the completion brief, and the owner would trust neither.
    const q = candidateQuery('abandoned', CUTOFF);
    expect(q).toContain(`updated_at=lt.${CUTOFF}`);
    expect(q).not.toContain('opened_at=lt.');
    expect(q).toContain('opened_at=not.is.null');
  });

  test('lead-supplied answers cannot push the message past the Telegram limit', () => {
    // Over the limit Telegram 400s, this run releases its claim, and the SAME
    // session fails identically on every run after it - never chased at all.
    const msg = abandonedMessage(quiet({
      first_name: 'A'.repeat(500),
      project_type: 'B'.repeat(500),
      answers: { message: '<'.repeat(2000), city: '&'.repeat(2000), scope_tier: 'full_gut' },
    }), NOW);
    expect(msg.length).toBeLessThan(TELEGRAM_TEXT_LIMIT);
    expect(msg).toContain('Started the intake and stopped');
  });

  test('answered labels follow the order the flow asks them', () => {
    expect(answeredLabels({ contact_time_preference: 'x', message: 'y', city: 'z' }))
      .toEqual(['what the project is', 'their town', 'when to call']);
  });

  test('a lead who DECLINED is never chased - they answered the question asked', () => {
    expect(candidateQuery('abandoned', CUTOFF)).toContain('declined_at=is.null');
    expect(candidateQuery('low_intent', CUTOFF)).toContain('declined_at=is.null');
  });

  test('hoursSince is floored and never negative', () => {
    expect(hoursSince('2026-08-02T12:00:00Z', NOW)).toBe(6);
    expect(hoursSince('2026-08-02T17:59:00Z', NOW)).toBe(0);
    expect(hoursSince('2026-08-03T00:00:00Z', NOW)).toBe(0);
    expect(hoursSince('not-a-date', NOW)).toBe(0);
  });

  test('both stages route through one message builder', () => {
    const c = quiet();
    expect(chaseMessage('low_intent', c, NOW)).toBe(lowIntentMessage(c, NOW));
    expect(chaseMessage('abandoned', c, NOW)).toBe(abandonedMessage(c, NOW));
  });
});

/* ── AC8 - failure reads as failure ───────────────────────────────────────── */

/**
 * A stand-in for the two writes and the one send `chaseOne` makes, so the
 * safety property can be tested by exercising it. A test that greps the route
 * for the spelling of a filter passes just as happily when the guard does not
 * work, which is how this one shipped broken the first time.
 */
function fakeDeps(opts: {
  claim?: unknown;
  claimThrows?: boolean;
  send?: TelegramOutcome;
  /** One entry per attempt, so a write that succeeds on the retry can be told. */
  recorded?: boolean | null | Array<boolean | null>;
} = {}) {
  const patches: Array<{ path: string; body: Record<string, unknown> }> = [];
  const sends: string[] = [];
  const routed: Array<{ leadId: string | null; bucket: string }> = [];
  const deps: ChaseDeps = {
    async patch(path, body) {
      patches.push({ path, body });
      if (patches.length > 1) return [];
      if (opts.claimThrows) throw new Error('supabase unreachable');
      return opts.claim === undefined ? [{ id: 's1' }] : opts.claim;
    },
    async send(text) {
      sends.push(text);
      return opts.send ?? 'sent';
    },
    async recordRouting(args) {
      routed.push({ leadId: args.leadId, bucket: args.bucket });
      const r = opts.recorded;
      if (Array.isArray(r)) return r[Math.min(routed.length - 1, r.length - 1)];
      return r === undefined ? true : r;
    },
  };
  return { deps, patches, sends, routed };
}

test.describe('AC8 - a broken cron does not look like a quiet one', () => {
  test('an unreadable candidate list is a 503, not ok:true with zero', () => {
    const src = code('src/app/api/cron/intake-chase/route.ts');
    expect(src).toContain('could not read');
    expect(src).toContain('ok: false');
    expect(src).toContain('status: 503');
    expect(src).toContain('nothing was chased');
  });

  test('A CLAIM THAT MATCHED NO ROWS LOST THE RACE, AND NOTHING IS SENT', async () => {
    // Two overlapping runs read the same candidate list. Only one of them can
    // match the is.null filter, and the other must be able to tell.
    const f = fakeDeps({ claim: [] });
    const result = await chaseOne('abandoned', quiet(), NOW, f.deps);
    expect(result.outcome).toBe('skipped');
    expect(f.sends).toEqual([]);
    // Nothing to release: this run never held the stamp.
    expect(f.patches).toHaveLength(1);
  });

  test('the claim asks for the rows it affected, filtered on the unset stamp', async () => {
    const f = fakeDeps();
    await chaseOne('abandoned', quiet(), NOW, f.deps);
    expect(f.patches[0].path).toContain(`${CHASE_STAMP.abandoned}=is.null`);
    expect(f.patches[0].body).toEqual({ [CHASE_STAMP.abandoned]: NOW.toISOString() });
  });

  test('THE CLAIM RE-ASSERTS WHAT MADE THE ROW A CANDIDATE, NOT JUST THE STAMP', async () => {
    // The list is read once and then worked through one at a time. A lead who
    // opens their link mid-run must not be told "never opened their intake
    // link", and must not have a real routing decision overwritten with cold.
    const low = fakeDeps();
    await chaseOne('low_intent', candidate(), NOW, low.deps);
    expect(low.patches[0].path).toBe(claimPath('low_intent', 's1', chaseCutoff('low_intent', NOW)));
    for (const guard of ['opened_at=is.null', 'completed_at=is.null', 'declined_at=is.null']) {
      expect(low.patches[0].path, `the claim must re-check ${guard}`).toContain(guard);
    }

    const ab = fakeDeps();
    await chaseOne('abandoned', quiet(), NOW, ab.deps);
    for (const guard of [
      'opened_at=not.is.null', 'completed_at=is.null', 'declined_at=is.null',
      // The quiet window too: a lead who answers during the run is active again.
      `updated_at=lt.${chaseCutoff('abandoned', NOW)}`,
    ]) {
      expect(ab.patches[0].path, `the claim must re-check ${guard}`).toContain(guard);
    }
  });

  test('the claim and the candidate query apply the same conditions', () => {
    // One definition, so a guard added to the snapshot cannot be missing from
    // the only atomic point in the run. Paging and ordering shape the list and
    // are not conditions, so they are the only difference allowed.
    for (const kind of ['low_intent', 'abandoned'] as const) {
      const cutoff = chaseCutoff(kind, NOW);
      const claim = claimPath(kind, 's1', cutoff).split('&').slice(1).sort();
      const query = candidateQuery(kind, cutoff).split('&').slice(1)
        .filter((p) => !p.startsWith('limit=') && !p.startsWith('order=')).sort();
      expect(claim).toEqual(query);
    }
  });

  test('THE BACKLOG DRAINS OLDEST FIRST, ON THE CLOCK THE STAGE SELECTS BY', () => {
    // Unordered, a lead quiet for three hours can go ahead of one quiet for
    // three days, and the dry run previews three arbitrary rows rather than the
    // three that will actually go. "The rest go on the next run" is only a
    // queue if it is ordered.
    expect(candidateQuery('low_intent', CUTOFF)).toContain('order=created_at.asc');
    expect(candidateQuery('abandoned', CUTOFF)).toContain('order=updated_at.asc');
    // And ordering is not a condition: it must not reach the claim.
    expect(claimPath('abandoned', 's1', CUTOFF)).not.toContain('order=');
  });

  test('a row that stopped being a candidate mid-run is skipped, not chased', async () => {
    // Which is what a zero-row claim now means, as well as a lost race.
    const f = fakeDeps({ claim: [] });
    const result = await chaseOne('low_intent', candidate(), NOW, f.deps);
    expect(result.outcome).toBe('skipped');
    expect(f.sends).toEqual([]);
    expect(f.routed).toEqual([]);
  });

  test('a claim that could not be verified sends nothing and clears nothing', async () => {
    const f = fakeDeps({ claim: null });
    const result = await chaseOne('abandoned', quiet(), NOW, f.deps);
    expect(result.outcome).toBe('failed');
    expect(f.sends).toEqual([]);
    expect(f.patches).toHaveLength(1);
  });

  test('the stamp is claimed BEFORE the send - a failed claim sends nothing', async () => {
    const f = fakeDeps({ claimThrows: true });
    const result = await chaseOne('low_intent', candidate(), NOW, f.deps);
    expect(result.outcome).toBe('failed');
    expect(f.sends).toEqual([]);
  });

  test('a failed send releases the claim, scoped to the stamp this run set', async () => {
    const f = fakeDeps({ send: 'failed' });
    const result = await chaseOne('abandoned', quiet(), NOW, f.deps);
    expect(result.outcome).toBe('failed');
    expect(f.patches).toHaveLength(2);
    expect(f.patches[1].path).toContain(
      `${CHASE_STAMP.abandoned}=eq.${encodeURIComponent(NOW.toISOString())}`,
    );
    expect(f.patches[1].body).toEqual({ [CHASE_STAMP.abandoned]: null });
  });

  test('a sent alert keeps its stamp, so the next run does not re-alert', async () => {
    const f = fakeDeps();
    const result = await chaseOne('abandoned', quiet(), NOW, f.deps);
    expect(result.outcome).toBe('sent');
    expect(f.sends).toHaveLength(1);
    expect(f.patches).toHaveLength(1);
  });

  test('a low-intent send records its routing, and a failed write is reported', async () => {
    const ok = fakeDeps();
    expect((await chaseOne('low_intent', candidate(), NOW, ok.deps)).routingRecorded).toBe(true);
    expect(ok.routed).toEqual([{ leadId: 'l1', bucket: 'cold' }]);

    const bad = fakeDeps({ recorded: false });
    const result = await chaseOne('low_intent', candidate(), NOW, bad.deps);
    expect(result.outcome).toBe('sent');
    expect(result.routingRecorded).toBe(false);
  });

  test('THE ROUTING WRITE IS RETRIED, BECAUSE NOTHING ELSE EVER WILL', async () => {
    // The alert has gone and the stamp stays set - releasing it would re-alert,
    // which is worse - so this session is a candidate for no future run. A write
    // dropped here is recorded nowhere, permanently.
    const f = fakeDeps({ recorded: [false, true] });
    const result = await chaseOne('low_intent', candidate(), NOW, f.deps);
    expect(result.routingRecorded).toBe(true);
    expect(f.routed).toHaveLength(2);

    // And it is not retried forever, nor reported as saved when it was not.
    const lost = fakeDeps({ recorded: false });
    expect((await chaseOne('low_intent', candidate(), NOW, lost.deps)).routingRecorded).toBe(false);
    expect(lost.routed).toHaveLength(2);
  });

  test('A THROW AFTER THE CLAIM RELEASES IT INSTEAD OF SWALLOWING THE LEAD', async () => {
    // The stamp is written before the send, so anything that throws between the
    // two would leave a claimed, unsent candidate that no future run can see -
    // the one case the claim-before-send sequence cannot survive on its own.
    const f = fakeDeps();
    const broken = quiet({ answers: null as unknown as Record<string, string> });
    const result = await chaseOne('abandoned', broken, NOW, f.deps);
    expect(result.outcome).toBe('failed');
    expect(f.sends).toEqual([]);
    expect(f.patches).toHaveLength(2);
    expect(f.patches[1].body).toEqual({ [CHASE_STAMP.abandoned]: null });
  });

  test('the run names the fault, not the stage after it', async () => {
    // Supabase refusing every claim reported "chase_send_failed", which sends
    // the reader to look at Telegram. This is the only field the cron log shows.
    expect((await chaseOne('low_intent', candidate(), NOW, fakeDeps({ claimThrows: true }).deps)).failure)
      .toBe('claim');
    expect((await chaseOne('low_intent', candidate(), NOW, fakeDeps({ claim: null }).deps)).failure)
      .toBe('claim');
    expect((await chaseOne('abandoned', quiet(), NOW, fakeDeps({ send: 'failed' }).deps)).failure)
      .toBe('send');
    expect((await chaseOne('abandoned', quiet(), NOW, fakeDeps().deps)).failure).toBeUndefined();

    const src = code('src/app/api/cron/intake-chase/route.ts');
    for (const label of ['chase_claim_failed', 'chase_send_failed', 'chase_threw']) {
      expect(src).toContain(label);
    }
  });

  test('one bad candidate cannot take the whole run down with it', () => {
    // chaseOne releases its own claim on a throw; the loop still guards, so the
    // REST of the page is not left claimed and unsent by something unforeseen.
    const src = code('src/app/api/cron/intake-chase/route.ts');
    expect(src).toMatch(/try\s*\{\s*result = await chaseOne\(/);
    expect(src).toContain('threw and was not chased');
  });

  test('A CANDIDATE PAST THE AGE CEILING KEEPS ITS CLAIM AND GETS NO MESSAGE', async () => {
    // A send that does not succeed releases its claim, so an environment with
    // no Telegram credentials - or any sustained outage - accumulates
    // candidates indefinitely and delivers them a page per run on recovery.
    // The claim is what retires them: stamped, so no future run sees the row,
    // and nothing sent, because "submitted 700 hours ago" is not actionable.
    const old = new Date(NOW.getTime() - (CHASE_MAX_AGE_HOURS + 1) * 3_600_000).toISOString();

    const ab = fakeDeps();
    const abResult = await chaseOne('abandoned', quiet({ updated_at: old }), NOW, ab.deps);
    expect(abResult.outcome).toBe('retired');
    expect(ab.sends).toEqual([]);
    // One PATCH: the claim that retired it. No release - the stamp is the point.
    expect(ab.patches).toHaveLength(1);
    expect(ab.patches[0].body).toEqual({ [CHASE_STAMP.abandoned]: NOW.toISOString() });

    // And the low-intent stage does not write score 0 / cold onto a lead it
    // decided was too old to have an opinion about.
    const low = fakeDeps();
    const lowResult = await chaseOne('low_intent', candidate({ created_at: old }), NOW, low.deps);
    expect(lowResult.outcome).toBe('retired');
    expect(low.sends).toEqual([]);
    expect(low.routed).toEqual([]);
  });

  test('each stage measures age on the same clock it selects by', () => {
    const past = new Date(NOW.getTime() - (CHASE_MAX_AGE_HOURS + 1) * 3_600_000).toISOString();
    // A lead who answered an hour ago is not stale because they first arrived
    // four days ago - the abandoned stage's clock is the last answer.
    expect(isPastChasing('abandoned', quiet({ created_at: past }), NOW)).toBe(false);
    expect(isPastChasing('abandoned', quiet({ updated_at: past }), NOW)).toBe(true);
    expect(isPastChasing('low_intent', candidate({ created_at: past }), NOW)).toBe(true);
    expect(isPastChasing('low_intent', candidate(), NOW)).toBe(false);
    // A timestamp that cannot be parsed reads as brand new, so it is chased
    // rather than silently retired: dropping a lead on a bad date is worse.
    expect(isPastChasing('low_intent', candidate({ created_at: 'not-a-date' }), NOW)).toBe(false);
  });

  test('MISSING CREDENTIALS ARE NOT A REFUSED SEND, AND THE CLAIM STILL GOES BACK', async () => {
    // An unset token is not transient. Named apart so the cron log points at
    // the configuration instead of at a Telegram that was never asked.
    const f = fakeDeps({ send: 'not_configured' });
    const result = await chaseOne('abandoned', quiet(), NOW, f.deps);
    expect(result.outcome).toBe('failed');
    expect(result.failure).toBe('not_configured');
    // Nothing was delivered, so the lead stays chaseable once it is fixed.
    expect(f.patches).toHaveLength(2);
    expect(f.patches[1].body).toEqual({ [CHASE_STAMP.abandoned]: null });

    const src = code('src/app/api/cron/intake-chase/route.ts');
    expect(src).toContain('telegram_not_configured');
    // And the run stops rather than claiming and releasing the rest of the page
    // against credentials that will not be there by the next candidate.
    expect(src).toMatch(/if \(result\.failure === 'not_configured'\)/);
  });

  test('a retirement is reported, because nobody was told and nobody will be', () => {
    const src = code('src/app/api/cron/intake-chase/route.ts');
    expect(src).toContain('chase_retired_stale');
    expect(src).toContain('retired ${retired}');
  });

  test('a session with no lead has nothing to record, which is not a failure', async () => {
    const f = fakeDeps();
    const result = await chaseOne('low_intent', candidate({ lead_id: null }), NOW, f.deps);
    expect(result.routingRecorded).toBeNull();
    expect(f.routed).toEqual([]);
  });

  test('a truncated run cannot read as a drained one', () => {
    const rows = Array.from({ length: CHASE_PAGE + 1 }, (_, i) => i);
    expect(paginate(rows)).toEqual({ candidates: rows.slice(0, CHASE_PAGE), truncated: true });
    expect(paginate(rows.slice(0, CHASE_PAGE)))
      .toEqual({ candidates: rows.slice(0, CHASE_PAGE), truncated: false });
    // One row over the page is what makes the difference detectable at all.
    expect(candidateQuery('abandoned', CUTOFF)).toContain(`limit=${CHASE_PAGE + 1}`);
    expect(code('src/app/api/cron/intake-chase/route.ts')).toContain('truncated');
  });

  test('a half-done run does not answer the way a clean one does', () => {
    // Same shape as the cron this is modelled on: ok follows the degraded list,
    // so a run where every send failed is visible in the cron log itself and
    // not only in a counter buried in a body nobody reads.
    const src = code('src/app/api/cron/intake-chase/route.ts');
    expect(src).toContain('ok: degraded.length === 0');
    for (const reason of ['chase_send_failed', 'routing_write_failed', 'candidate_read_truncated']) {
      expect(src).toContain(reason);
    }
  });

  test('a run that could be killed mid-loop gets the time not to be', () => {
    // A candidate claimed but not yet sent keeps its stamp and is never chased
    // again, because the release never runs.
    expect(code('src/app/api/cron/intake-chase/route.ts')).toContain('maxDuration = 300');
  });

  test('an unknown stage is rejected rather than defaulted', () => {
    const src = code('src/app/api/cron/intake-chase/route.ts');
    expect(src).toContain("stage must be 'low_intent' or 'abandoned'");
    expect(src).toContain('status: 400');
  });

  test('both stages are registered as crons', () => {
    const vercel = read('vercel.json');
    expect(vercel).toContain('/api/cron/intake-chase?stage=low_intent');
    expect(vercel).toContain('/api/cron/intake-chase?stage=abandoned');
  });

  test('THE THRESHOLD DECIDES WHEN A CHASE LANDS, NOT THE CRON TIME', () => {
    // Checked once a day, a 6h threshold is inoperative: a lead who submits at
    // 10am is chased at 9am the next day. Every three hours across the working
    // day, so the wait is the one the constants describe - and daytime only,
    // because these land in the owner's personal chat.
    const crons: Array<{ path: string; schedule: string }> =
      JSON.parse(read('vercel.json')).crons;
    const stages = crons.filter((c) => c.path.startsWith('/api/cron/intake-chase'));
    expect(stages).toHaveLength(2);
    for (const stage of stages) {
      const hours = stage.schedule.split(' ')[1].split(',').map(Number);
      expect(hours, `${stage.path} must run more than once a day`).toEqual([13, 16, 19, 22]);
      // 9am to 6pm Eastern in summer, an hour earlier in winter. Fixed UTC with
      // the DST drift accepted, like the dispatch escalation crons.
      expect(Math.max(...hours) - Math.min(...hours)).toBeLessThanOrEqual(12);
    }
  });
});
