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
 * The feedback email is governed by the `follow_ups` opt-out - the same one the
 * quote's footer offers when it promises that unsubscribing "stops our
 * follow-up emails about it". A recipient who took that offer is answered with
 * `feedback: 'suppressed'`, which is the promise being kept, not a failure.
 *
 * Admin auth is enforced by middleware on /api/admin/*.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { sendTrackedEmail } from '@/lib/notify/sendEmail';
import { HOME_CARE_FROM } from '@/lib/notify/sendHomeCareEmails';
import { buildServiceCompletedEmail, SERVICE_REPLY_TO } from '@/lib/homecare/serviceEmails';
import { cancelVisitReminder } from '@/lib/homecare/serviceScheduling';
import { clearVisitDispatch } from '@/lib/homecare/dispatch';
import { preferencesUrlFor, normalizeEmail } from '@/lib/preferences/preferences';
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
interface OwnerRow { id: string; email: string; first_name: string | null }

export async function POST(request: NextRequest) {
  let raw: unknown;
  try { raw = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = completeSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  const { homeownerId, taskKeys, seasons, start, skipFeedback } = parsed.data;
  const performedAt = start ? new Date(start).getTime() : null;

  try {
    const inList = taskKeys.map((k) => `"${k}"`).join(',');

    // Read across every season, not one: the season a task was filed under comes
    // from the visit date reconciled against that task's catalog seasons, so the
    // caller cannot re-derive it and one visit can span two of them. The BOOKED
    // row is the source of truth - completing means closing that booking.
    //
    // 'todo' is in the status list because a member can untick a task La Vaca
    // has booked; the row still holds the window, and that window is what says
    // a visit is on the books.
    const existing = (await supabaseRest<MaintRow[]>(
      'GET',
      `homeowner_maintenance?select=task_key,season,status,completed_by,scheduled_start` +
        `&homeowner_id=eq.${homeownerId}&task_key=in.(${inList})&status=in.(booked,done,todo)`,
    )) ?? [];

    // The visit being closed. When the caller names its window, only rows booked
    // into that window count - completing this morning's job can then never
    // reach into another visit and stamp it done. Windows are compared as
    // INSTANTS: PostgREST renders `timestamptz` as "...+00:00" and the caller
    // sends `Date#toISOString()`'s "....000Z", the same moment spelled two ways.
    //
    // Unnamed, the EARLIEST window wins. One booking per task means there is
    // normally only one; taking the latest would close a future visit and null
    // its window while leaving the job just performed still on the books.
    const bookedFor = new Map<string, MaintRow>();
    for (const r of existing) {
      if (!r.scheduled_start) continue;
      const at = new Date(r.scheduled_start).getTime();
      if (!Number.isFinite(at)) continue;
      if (performedAt !== null && at !== performedAt) continue;
      const held = bookedFor.get(r.task_key);
      if (!held || at < new Date(held.scheduled_start!).getTime()) bookedFor.set(r.task_key, r);
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

    // The windows this call closes. Scoped to the ones these tasks were BOOKED
    // into: a customer with another visit later must keep that one's reminder
    // and that one's dispatch, and a row completed on some earlier visit is not
    // a window this call closes.
    //
    // Taken from the rows read above, BEFORE the upsert nulls them - after it
    // there is nothing left to say which windows this call retired. The visit
    // itself is deliberately NOT resolved: a completion retracts nothing, so
    // reading the customer, the address and the services for it would be three
    // Supabase round trips per window for a value nobody looks at.
    const completedVisitStarts = [...new Set(
      taskKeys.map((k) => bookedFor.get(k)?.scheduled_start).filter((s): s is string => !!s),
    )];

    const completedAt = new Date().toISOString();
    if (transitioning.length > 0) {
      await supabaseRest('POST', 'homeowner_maintenance', transitioning.map(({ taskKey, season }) => ({
        homeowner_id: homeownerId,
        task_key: taskKey,
        season,
        status: 'done',
        completed_at: completedAt,
        completed_by: 'lavaca',
        // The visit happened, so it comes off the books. A row carrying a
        // window is what every reader treats as a visit still to come - the
        // portal card, the reminder cron, the reschedule read - so leaving one
        // behind would keep announcing a job that is already done.
        scheduled_start: null,
        scheduled_end: null,
        updated_at: completedAt,
      })), { onConflict: 'homeowner_id,task_key,season' });
    }

    const owners = (await supabaseRest<OwnerRow[]>(
      'GET',
      `homeowners?select=id,email,first_name&id=eq.${homeownerId}&limit=1`,
    )) ?? [];
    const owner = owners[0];
    if (!owner) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

    // The visit happened - its queued reminder is now noise.
    // Reported, never assumed: a cancel that could not reach the queue leaves a
    // "we're coming tomorrow" pending for a visit already performed.
    let reminder: 'cancelled' | 'unavailable' = 'cancelled';
    for (const iso of completedVisitStarts) {
      if (await cancelVisitReminder(owner.email, new Date(iso)) === 'unavailable') reminder = 'unavailable';
    }

    // And so is its dispatch. The row is keyed on (homeowner, window), so a
    // closed-out visit that keeps it hands the next booking of that same slot
    // an already-'confirmed' assignment and a `nudged_at` that tells the 5pm
    // stage it has nothing to do - the same hazard the cancel path exists to
    // avoid. Retired as COMPLETED, not cancelled: the job happened, so no
    // calendar retraction goes out. Mailing the crew "this visit is off, you
    // are not going" about work they have just finished would be a lie.
    let dispatch: 'cleared' | 'unavailable' = 'cleared';
    for (const iso of completedVisitStarts) {
      const cleared = await clearVisitDispatch(homeownerId, new Date(iso), { reason: 'completed' });
      if (cleared.status === 'unavailable') dispatch = 'unavailable';
    }

    if (skipFeedback || transitioning.length === 0) {
      return NextResponse.json({
        status: 'completed', completed: transitioning.length, feedback: 'skipped', reminder, dispatch,
        reason: transitioning.length === 0 ? 'already_completed_by_lavaca' : 'caller_requested',
      });
    }

    const catalog = (await supabaseRest<{ key: string; title: string }[]>(
      'GET', `maintenance_catalog?select=key,title&key=in.(${inList})`,
    )) ?? [];
    const services = taskKeys.map((k) => catalog.find((c) => c.key === k)?.title ?? k);

    const preferencesUrl = await preferencesUrlFor(SITE_URL, owner.email).catch(() => undefined);
    // The quote's footer told this recipient in writing that unsubscribing
    // "stops our follow-up emails about it", and this IS that follow-up. So it
    // carries the same opt-out the quote set - the scoped `follow_ups` link,
    // not the tokenized Home Care one, which governs the seasonal programme the
    // customer may never have joined and would leave this send unstoppable.
    const unsubscribeUrl =
      `${SITE_URL}/unsub?stream=follow_ups&email=${encodeURIComponent(normalizeEmail(owner.email))}`;
    const { subject, html, text } = buildServiceCompletedEmail({
      recipientName: owner.first_name || owner.email,
      services,
      feedbackUrl: `${SITE_URL}/home-care/checklist`,
      unsubscribeUrl,
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
      // Gated on the stream the quote's opt-out sets, so that promise is kept.
      // An opted-out customer getting no review request is the correct outcome:
      // they asked not to be emailed. The visit reminder deliberately stays
      // ungated - it is a job the customer booked, not a request for a favour.
      preferenceStream: 'follow_ups',
    });

    // A suppression is the opt-out working, not a fault: reported apart from a
    // failure so the admin does not chase a retry for an email we chose not to
    // send. `skipped` also covers a missing API key, which IS worth chasing.
    const feedback =
      res.status === 'sent' ? 'sent'
        : res.status === 'skipped' && res.reason === 'unsubscribed' ? 'suppressed'
          : 'failed';

    return NextResponse.json({
      status: 'completed',
      completed: transitioning.length,
      reminder,
      dispatch,
      feedback,
      feedbackError: res.error ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('service-quote complete failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
