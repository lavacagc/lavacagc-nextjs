/**
 * Monthly newsletter sender (Goal B, Phase 3).
 *
 * Monthly cron. Assembles the approved lineup into the branded navy/gold email
 * (buildMonthlyNewsletterHtml) and sends it to two unioned audiences: the
 * identity-table marketing members (Home Care / Buy+Remodel) gated on the
 * 'announcements' stream, and the standalone affirmative-consent subscribers
 * (email_preferences.newsletter=true) gated on the 'newsletter' stream.
 * Explicit newsletter consent wins, so a member who also signed up for the
 * newsletter is gated on 'newsletter'.
 *
 * Delivery goes through sendTrackedEmail with each recipient's own
 * preferenceStream, which (a) skips anyone who unsubscribed from that stream and
 * (b) attaches the per-recipient List-Unsubscribe header — so this cron just
 * needs to enumerate subscribers, build a per-recipient unsubscribe URL for the
 * visible footer, and pace sends.
 *
 * The lineup is a static config here for now (real roster slugs); a later
 * iteration can source it from maintained_articles / content_actions.
 *
 * Auth: Bearer CRON_SECRET (also enforced by middleware on /api/cron/*).
 */
import { NextRequest, NextResponse } from 'next/server';
import { cleanEnv } from '@/lib/envClean';
import { supabaseRest } from '@/lib/seo/supabase-rest';
import { sendTrackedEmail } from '@/lib/notify/sendEmail';
import { getOrCreateByEmail, normalizeEmail } from '@/lib/preferences/preferences';
import { buildMonthlyNewsletterHtml, type MonthlyNewsletterPayload } from '@/lib/notify/monthlyNewsletterEmail';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const FROM_ADDRESS = 'La Vaca <alex@email.lavaca.link>';
const SITE_URL = cleanEnv(process.env.NEXT_PUBLIC_SITE_URL) || 'https://www.lavacagc.com';
const PAGE_SIZE = 500;

/** Static approved lineup — real roster slugs. */
function buildLineup(issueLabel: string): Omit<MonthlyNewsletterPayload, 'unsubscribeUrl' | 'preferencesUrl'> {
  const blog = (slug: string) => `${SITE_URL}/blog/${slug}`;
  return {
    issueLabel,
    hero: {
      title: 'Turning a basement into legal living space in NJ',
      blurb:
        "It's the highest-ROI square footage in most Northern NJ homes — if you do it to code. Here's what egress, ceiling height, and permits actually require before you frame a single wall.",
      ctaLabel: 'Read the basement guide',
      ctaUrl: blog('basement-legal-living-space-nj-code-requirements'),
    },
    checklist: {
      heading: "This month's Home Care checklist",
      bullets: [
        'Flush the water heater and check the pressure-relief valve.',
        'Clear gutters and confirm downspouts drain away from the foundation.',
        'Test every smoke and CO detector; replace batteries older than a year.',
      ],
      ctaUrl: `${SITE_URL}/home-care`,
    },
    picks: [
      {
        title: 'What a home addition really costs in Millburn, NJ',
        url: blog('2025-home-addition-costs-in-millburn-nj-what-50-homeowners-actually-paid'),
      },
      {
        title: 'Kitchen remodel cost in Northern NJ (2026)',
        url: blog('kitchen-remodel-cost-northern-nj-2026'),
      },
    ],
    buyRemodel: {
      text: 'New this month: hand-picked homes to buy and remodel, each with a full estimate.',
      url: `${SITE_URL}/buy-and-remodel`,
    },
  };
}

function monthLabel(now: Date): string {
  return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'America/New_York' });
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';
  const issueLabel = monthLabel(new Date());
  const lineup = buildLineup(issueLabel);
  const subject = `La Vaca Home Journal — ${issueLabel}`;

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  let recipients = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let deduped = 0;

  try {
    // RECIPIENTS = people who AFFIRMATIVELY joined a marketing program: Home Care
    // (double opt-in → homeowners.status='active') or Buy+Remodel
    // (newsletter_subscribers.status='active'). We deliberately do NOT enumerate
    // by email_preferences.announcements=true: getOrCreateByEmail creates that row
    // with announcements defaulting TRUE on ANY transactional touch (a lead
    // follow-up / review request, even a bare contact-form submitter), so that
    // flag is not a reliable marketing-consent signal and would sweep in people
    // who never opted into marketing. announcements opt-outs are still honored at
    // send time by sendTrackedEmail's preferenceStream:'announcements' gate. (If a
    // standalone announcements-only signup is ever added, union it in here.)
    // The cron stays unscheduled until the owner confirms the first send.
    //
    // Each recipient carries the marketing stream that put them on the list, so
    // the send gate + unsubscribe link match what they actually opted into:
    //   - identity-table members (Home Care / Buy+Remodel) → 'announcements'
    //     (unchanged behavior)
    //   - anyone with email_preferences.newsletter=true (the affirmative-consent
    //     stream fed by /api/newsletter/subscribe) → 'newsletter'
    // Explicit newsletter consent is the more specific signal, so it WINS over
    // the legacy announcements gate: a member who also signed up for the
    // newsletter is gated on 'newsletter'. This honors someone who opted out of
    // announcements but explicitly signed up for the newsletter (no lost send),
    // and keeps their footer link, one-click header, and send gate consistent.
    const recipientStream = new Map<string, 'announcements' | 'newsletter'>();
    for (const table of ['homeowners', 'newsletter_subscribers'] as const) {
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const rows = await supabaseRest<Array<{ email: string | null }>>(
          'GET',
          `${table}?status=eq.active&select=email&order=email.asc&limit=${PAGE_SIZE}&offset=${offset}`,
        );
        if (!rows?.length) break;
        for (const r of rows) {
          if (r.email) {
            const e = normalizeEmail(r.email);
            if (!recipientStream.has(e)) recipientStream.set(e, 'announcements');
          }
        }
        if (rows.length < PAGE_SIZE) break;
      }
    }
    // Union in the affirmative-consent newsletter subscribers. This runs after
    // the identity tables and assigns 'newsletter' UNCONDITIONALLY, so explicit
    // newsletter consent overrides any 'announcements' gate set above.
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const rows = await supabaseRest<Array<{ email: string | null }>>(
        'GET',
        `email_preferences?newsletter=eq.true&select=email&order=email.asc&limit=${PAGE_SIZE}&offset=${offset}`,
      );
      if (!rows?.length) break;
      for (const r of rows) {
        if (r.email) {
          const e = normalizeEmail(r.email);
          recipientStream.set(e, 'newsletter');
        }
      }
      if (rows.length < PAGE_SIZE) break;
    }

    for (const [email, stream] of recipientStream) {
        recipients++;
        if (dryRun) continue;

        // Per-issue dedup + resume: if this issue was already sent to this
        // address, skip it. Makes a manual re-run (the only trigger) resume from
        // where a timed-out run left off instead of re-emailing everyone.
        //
        // FAIL-CLOSED: if the dedup query itself errors we skip this recipient
        // rather than send. For a newsletter a duplicate is worse than a deferred
        // send, and a skipped recipient is simply retried on the next run (their
        // dedup check finds no prior send once the DB recovers).
        let priorSend: Array<{ id: string }> | null;
        try {
          priorSend = await supabaseRest<Array<{ id: string }>>(
            'GET',
            `email_log?select=id&to_email=eq.${encodeURIComponent(email)}` +
              `&category=eq.broadcast&status=eq.sent` +
              `&campaign->>issue=eq.${encodeURIComponent(issueLabel)}&limit=1`,
          );
        } catch (e) {
          console.error(
            `monthly-newsletter dedup check failed for ${email} — skipping this run:`,
            e instanceof Error ? e.message : e,
          );
          failed++;
          continue;
        }
        if (priorSend && priorSend.length > 0) {
          deduped++;
          continue;
        }

        try {
          // One token lookup drives both the visible footer unsubscribe link and
          // the manage-preferences link. sendTrackedEmail does its own suppression
          // check + List-Unsubscribe header for this recipient's stream, so the
          // footer link, the one-click header, and the send gate all agree.
          const pref = await getOrCreateByEmail(email);
          const unsubscribeUrl =
            `${SITE_URL}/api/preferences/unsubscribe?token=${encodeURIComponent(pref.preference_token)}&stream=${stream}`;
          const preferencesUrl = `${SITE_URL}/preferences?token=${encodeURIComponent(pref.preference_token)}`;

          const html = buildMonthlyNewsletterHtml({ ...lineup, unsubscribeUrl, preferencesUrl });

          const result = await sendTrackedEmail({
            from: FROM_ADDRESS,
            to: email,
            subject,
            html,
            category: 'broadcast',
            preferenceStream: stream,
            campaign: { newsletter: 'monthly', issue: issueLabel },
          });

          if (result.status === 'sent') sent++;
          else if (result.status === 'skipped') skipped++;
          else failed++;
        } catch (err) {
          console.error(`monthly-newsletter send failed for ${email}:`, err instanceof Error ? err.message : err);
          failed++;
        }

        // Pace sends ~1/sec to stay under Resend's rate limit (matches send-follow-ups).
        await delay(1000);
    }

    return NextResponse.json({ ok: true, issue: issueLabel, dryRun, recipients, sent, skipped, failed, deduped });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('monthly-newsletter failed:', message);
    return NextResponse.json({ ok: false, error: message, recipients, sent, skipped, failed, deduped }, { status: 500 });
  }
}
