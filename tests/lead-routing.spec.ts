import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { scoreIntake, routeIntake, lowIntentDecision } from '../src/lib/intake/scoring';
import { scoreLead } from '../src/lib/leadScoring';
import { sanitizeLeadForInsert } from '../src/lib/leadSanitize';
import {
  chaseMessage, lowIntentMessage, abandonedMessage, answeredLabels, hoursSince,
  chaseOne, candidateQuery, paginate, CHASE_PAGE, CHASE_STAMP,
  type ChaseCandidate, type ChaseDeps,
} from '../src/lib/intake/chase';
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
    const near = scoreIntake({ answers: answers({ city: 'Montclair' }) });
    const far = scoreIntake({ answers: answers({ city: 'Princeton' }) });
    expect(near.score).toBeGreaterThan(far.score);
    expect(near.signals.join(' ')).toContain('In the service area');
    expect(far.signals.join(' ')).toContain('Outside the service area');
  });

  test('scope tier is ordered full gut > major update > refresh', () => {
    const s = (v: string) => scoreIntake({ answers: answers({ scope_tier: v }) }).score;
    expect(s('full_gut')).toBeGreaterThan(s('major_update'));
    expect(s('major_update')).toBeGreaterThan(s('refresh'));
  });

  test('"described it themselves" scores mid, not zero', () => {
    // They told us more, not less. Scoring it zero would punish engagement.
    const own = scoreIntake({ answers: answers({ scope_tier: 'own_details' }) }).score;
    const refresh = scoreIntake({ answers: answers({ scope_tier: 'refresh' }) }).score;
    const gut = scoreIntake({ answers: answers({ scope_tier: 'full_gut' }) }).score;
    expect(own).toBeGreaterThan(refresh);
    expect(own).toBeLessThan(gut);
  });

  test('timeline is ordered, and "just planning" scores nothing', () => {
    const s = (v: string) => scoreIntake({ answers: answers({ project_timeline: v }) }).score;
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

  test('the completion path reads a count that is allowed to say "unknown"', () => {
    const src = code('src/app/api/intake/[token]/answer/route.ts');
    expect(src).toContain('countPhotosOrNull(session.id)');
    expect(src).not.toContain('countPhotos(session.id)');
  });

  test('the town predicate is shared with the flow and the scorer, not re-implemented', () => {
    expect(code('src/lib/intake/scoring.ts')).toContain("cityInServiceArea");
    expect(code('src/lib/intake/scoring.ts')).toContain("from '@/lib/leadScoring'");
  });
});

/* ── AC2 - the fifth signal ───────────────────────────────────────────────── */

test.describe('AC2 - the price reaction is scored and is heaviest', () => {
  test('priced out costs more than any other single downgrade', () => {
    const base = scoreIntake({ answers: answers() }).score;
    const priced = base - scoreIntake({ answers: answers({ price_reaction: 'well_above' }) }).score;
    const timing = base - scoreIntake({ answers: answers({ project_timeline: 'planning' }) }).score;
    const scope = base - scoreIntake({ answers: answers({ scope_tier: 'refresh' }) }).score;
    expect(priced).toBeGreaterThan(0);
    expect(priced).toBeGreaterThanOrEqual(Math.min(timing, scope));
  });

  test('"under what I expected" is not penalised against "about right"', () => {
    const under = scoreIntake({ answers: answers({ price_reaction: 'below_expected' }) }).score;
    const about = scoreIntake({ answers: answers({ price_reaction: 'about_expected' }) }).score;
    expect(under).toBe(about);
  });

  test('the reaction is named in plain words in the record', () => {
    const r = scoreIntake({ answers: answers({ price_reaction: 'well_above' }) });
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
            seen.add(scoreIntake({ answers: { city, scope_tier: scope, project_timeline: tl, price_reaction: pr } }).bucket);
          }
        }
      }
    }
    expect([...seen].sort()).toEqual(['cold', 'hot']);
  });

  test('an empty answer set does not crash and is cold', () => {
    const r = scoreIntake({ answers: {} });
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
    const d = routeIntake(scoreIntake({ answers: { city: 'Princeton', project_timeline: 'planning' } }));
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

  test('a CHECK-constrained intake_bucket never costs the whole lead', () => {
    // LeadSubmitSchema passes unknown keys through, so a payload can carry an
    // intake_bucket the CHECK rejects. Postgres would answer 23514, the route
    // would 500, and the lead would be lost - for a column no form should be
    // sending in the first place. Losing a field beats losing a lead.
    const r = sanitizeLeadForInsert({
      first_name: 'Sarah', last_name: 'K', email: 'a@b.c', phone: '201',
      inquiry_type: 'estimate', intake_bucket: 'warm',
    });
    expect(r.lead.intake_bucket).toBeUndefined();
    expect(r.adjustments.join(' ')).toContain('intake_bucket');
    expect(r.lead.first_name).toBe('Sarah');
  });

  test('a bucket the scorer really writes still goes through', () => {
    for (const bucket of ['hot', 'cold']) {
      const r = sanitizeLeadForInsert({ email: 'a@b.c', inquiry_type: 'estimate', intake_bucket: bucket });
      expect(r.lead.intake_bucket).toBe(bucket);
      expect(r.adjustments.join(' ')).not.toContain('intake_bucket');
    }
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
  recorded?: boolean;
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
      return opts.recorded ?? true;
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
});
