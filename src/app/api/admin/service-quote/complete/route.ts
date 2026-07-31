/**
 * POST /api/admin/service-quote/complete
 *
 * "Mark service completed" from the admin dashboard. Two effects:
 *   1. stamps the tasks done, with completed_by='lavaca' so the portal can
 *      label the work La Vaca performed and leave self-ticked tasks unlabelled,
 *   2. sends the feedback email - "Please let us know how our team did".
 *
 * IDEMPOTENT: a second click must not send a second feedback email. Rows
 * already done by La Vaca are treated as already-handled, so the send only
 * fires on the transition.
 *
 * Admin auth is enforced by middleware on /api/admin/*.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { sendTrackedEmail } from '@/lib/notify/sendEmail';
import { HOME_CARE_FROM } from '@/lib/notify/sendHomeCareEmails';
import { buildServiceCompletedEmail, SERVICE_REPLY_TO } from '@/lib/homecare/serviceEmails';
import { cancelVisitReminder } from '@/lib/homecare/serviceScheduling';
import { preferencesUrlFor } from '@/lib/preferences/preferences';
import { cleanEnv } from '@/lib/envClean';
import { completeSchema } from '../_schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SITE_URL = cleanEnv(process.env.NEXT_PUBLIC_SITE_URL) || 'https://www.lavacagc.com';

interface MaintRow {
  task_key: string;
  season: string;
  status: string;
  completed_by: string | null;
  scheduled_start: string | null;
}
interface OwnerRow { id: string; email: string; first_name: string | null; unsubscribe_token: string }

export async function POST(request: NextRequest) {
  let raw: unknown;
  try { raw = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = completeSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  const { homeownerId, taskKeys, seasons, skipFeedback } = parsed.data;

  try {
    const inList = taskKeys.map((k) => `"${k}"`).join(',');

    // Read across every season, not one: the season a task was filed under comes
    // from the visit date reconciled against that task's catalog seasons, so the
    // caller cannot re-derive it and one visit can span two of them. The BOOKED
    // row is the source of truth - completing means closing that booking.
    const existing = (await supabaseRest<MaintRow[]>(
      'GET',
      `homeowner_maintenance?select=task_key,season,status,completed_by,scheduled_start` +
        `&homeowner_id=eq.${homeownerId}&task_key=in.(${inList})&status=in.(booked,done)`,
    )) ?? [];

    const bookedFor = new Map<string, MaintRow>();
    for (const r of existing) {
      if (r.status !== 'booked') continue;
      const held = bookedFor.get(r.task_key);
      if (!held || (r.scheduled_start ?? '') > (held.scheduled_start ?? '')) bookedFor.set(r.task_key, r);
    }

    const targets: { taskKey: string; season: string }[] = [];
    const unresolved: string[] = [];
    for (const key of taskKeys) {
      const resolved = bookedFor.get(key)?.season ?? seasons?.[key];
      if (resolved) targets.push({ taskKey: key, season: resolved }); else unresolved.push(key);
    }
    if (unresolved.length > 0) {
      return NextResponse.json({
        error: `No booking to complete for: ${unresolved.join(', ')}. Schedule the visit first.`,
      }, { status: 400 });
    }

    // Idempotency: anything already done BY LA VACA in that same row has had its
    // email. Matched per (task, season), so last year's completion of the same
    // task does not silently swallow this one.
    const alreadyOurs = new Set(
      existing.filter((r) => r.status === 'done' && r.completed_by === 'lavaca')
        .map((r) => `${r.task_key}|${r.season}`),
    );
    const transitioning = targets.filter((t) => !alreadyOurs.has(`${t.taskKey}|${t.season}`));

    const completedAt = new Date().toISOString();
    if (transitioning.length > 0) {
      await supabaseRest('POST', 'homeowner_maintenance', transitioning.map(({ taskKey, season }) => ({
        homeowner_id: homeownerId,
        task_key: taskKey,
        season,
        status: 'done',
        completed_at: completedAt,
        completed_by: 'lavaca',
        updated_at: completedAt,
      })), { onConflict: 'homeowner_id,task_key,season' });
    }

    const owners = (await supabaseRest<OwnerRow[]>(
      'GET',
      `homeowners?select=id,email,first_name,unsubscribe_token&id=eq.${homeownerId}&limit=1`,
    )) ?? [];
    const owner = owners[0];
    if (!owner) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

    // The visit happened - its queued reminder is now noise. Scoped to the
    // windows these tasks were BOOKED into: a customer with another visit later
    // must keep that one's reminder, and a row completed on some earlier visit
    // is not a window this call closes.
    const completedVisitStarts = [...new Set(
      taskKeys.map((k) => bookedFor.get(k)?.scheduled_start).filter((s): s is string => !!s),
    )];
    for (const iso of completedVisitStarts) {
      await cancelVisitReminder(owner.email, new Date(iso));
    }

    if (skipFeedback || transitioning.length === 0) {
      return NextResponse.json({
        status: 'completed', completed: transitioning.length, feedback: 'skipped',
        reason: transitioning.length === 0 ? 'already_completed_by_lavaca' : 'caller_requested',
      });
    }

    const catalog = (await supabaseRest<{ key: string; title: string }[]>(
      'GET', `maintenance_catalog?select=key,title&key=in.(${inList})`,
    )) ?? [];
    const services = taskKeys.map((k) => catalog.find((c) => c.key === k)?.title ?? k);

    const preferencesUrl = await preferencesUrlFor(SITE_URL, owner.email).catch(() => undefined);
    const { subject, html, text } = buildServiceCompletedEmail({
      recipientName: owner.first_name || owner.email,
      services,
      feedbackUrl: `${SITE_URL}/home-care/checklist`,
      unsubscribeUrl: `${SITE_URL}/api/home-care/unsubscribe?token=${encodeURIComponent(owner.unsubscribe_token)}`,
      preferencesUrl,
    });

    const res = await sendTrackedEmail({
      from: HOME_CARE_FROM,
      to: owner.email,
      replyTo: SERVICE_REPLY_TO.join(', '),
      subject, html, text,
      category: 'feedback_request',
      toName: owner.first_name ?? null,
      homeownerId: owner.id,
      campaign: { follow_up_type: 'service_completed' },
    });

    return NextResponse.json({
      status: 'completed',
      completed: transitioning.length,
      feedback: res.status === 'sent' ? 'sent' : 'failed',
      feedbackError: res.error ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('service-quote complete failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
