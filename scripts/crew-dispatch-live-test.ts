/**
 * Send ONE real crew dispatch to a single address, so the owner can see it in a
 * real inbox: the [ACTION REQUIRED] subject, Gmail's Add-to-calendar card off
 * the attached METHOD:REQUEST invite, and a confirm link that actually works.
 *
 *   npx tsx --env-file=.env.local scripts/crew-dispatch-live-test.ts <email>
 *   npx tsx --env-file=.env.local scripts/crew-dispatch-live-test.ts --cleanup
 *
 * COSTS ONE RESEND SEND. Nothing else is mailed: the customer's night-before
 * reminder is only QUEUED (and this books far enough ahead that it will not
 * fire), and the test recipient is the only one on the dispatch.
 *
 * It writes real rows to production - a pending homeowner, its maintenance
 * rows, a queued reminder and the dispatch records - because a confirm link
 * that does not resolve to a real assignment is not the thing worth looking at.
 * `--cleanup` removes every one of them.
 */
import { randomBytes } from 'crypto';
import { supabaseRest } from '../src/lib/notify/supabase-rest';
import { ensureServiceHomeowner, scheduleVisit, requeueVisitReminder } from '../src/lib/homecare/serviceScheduling';
import { sendVisitDispatch } from '../src/lib/homecare/dispatch';
import { buildVisitReminderEmail } from '../src/lib/homecare/serviceEmails';
import { visitDateLabel, visitTimeWindow } from '../src/lib/homecare/visitSchedule';
import { seasonForTaskVisit } from '../src/lib/homecare/season';

/**
 * The customer on the test visit. Override with --customer=<email> to be the
 * customer as well as the crew, which is the only way to see the portal side.
 */
const DEFAULT_CUSTOMER = 'crew-dispatch-test@lavacagc.com';
const customerArg = process.argv.find((a) => a.startsWith('--customer='));
const TEST_CUSTOMER = (customerArg?.split('=')[1] ?? DEFAULT_CUSTOMER).trim().toLowerCase();
const SITE = 'http://localhost:3001';

async function cleanup(who: string = TEST_CUSTOMER) {
  const owners = (await supabaseRest<{ id: string }[]>(
    'GET', `homeowners?select=id&email=eq.${encodeURIComponent(who)}`)) ?? [];
  for (const o of owners) {
    await supabaseRest('DELETE', `visit_dispatch?homeowner_id=eq.${o.id}`).catch(() => {});
    await supabaseRest('DELETE', `homeowner_maintenance?homeowner_id=eq.${o.id}`).catch(() => {});
    await supabaseRest('DELETE', `homeowners?id=eq.${o.id}`).catch(() => {});
  }
  await supabaseRest('DELETE', `follow_up_queue?lead_email=eq.${encodeURIComponent(who)}`).catch(() => {});
  console.log(`Cleaned up ${owners.length} record(s) for ${who} and everything hanging off them.`);
}

async function main() {
  const arg = process.argv.find((a) => a.includes('@') && !a.startsWith('--'));
  if (process.argv.includes('--cleanup')) {
    await cleanup(DEFAULT_CUSTOMER);
    if (TEST_CUSTOMER !== DEFAULT_CUSTOMER) await cleanup(TEST_CUSTOMER);
    return;
  }
  if (!arg || !arg.includes('@')) {
    console.error('Pass the address to send to, e.g. npx tsx --env-file=.env.local scripts/crew-dispatch-live-test.ts you@example.com');
    process.exit(1);
  }
  const to = arg.trim().toLowerCase();

  // Start clean, so re-running does not stack duplicate bookings.
  await cleanup();

  // The recipient. Added active so the picker and resolveRecipients see them;
  // the dispatch below names them explicitly, so nobody else is mailed.
  const existing = (await supabaseRest<{ id: string; active: boolean }[]>(
    'GET', `dispatch_recipients?select=id,active&email=eq.${encodeURIComponent(to)}`)) ?? [];
  let recipientId = existing[0]?.id;
  if (!recipientId) {
    const made = await supabaseRest<{ id: string }[]>('POST', 'dispatch_recipients',
      [{ name: 'Alex (walkthrough)', email: to }]);
    recipientId = made?.[0]?.id;
  } else if (!existing[0].active) {
    await supabaseRest('PATCH', `dispatch_recipients?id=eq.${recipientId}`, { active: true });
  }
  if (!recipientId) throw new Error('could not create the dispatch recipient');

  // Three weeks out: far enough that tonight's 23:30 UTC reminder run cannot
  // pick it up, so no customer mail goes anywhere.
  const start = new Date(Date.now() + 21 * 86400_000);
  start.setUTCHours(12, 0, 0, 0);
  const end = new Date(start.getTime() + 3 * 3600_000);

  const taskKeys = ['clean_gutters', 'clean_dryer_vent'];
  const catalog = (await supabaseRest<{ key: string; title: string; seasons: string[] | null }[]>(
    'GET', `maintenance_catalog?select=key,title,seasons&key=in.(${taskKeys.map((k) => `"${k}"`).join(',')})`)) ?? [];
  if (catalog.length === 0) throw new Error('no catalog rows - check the task keys');

  const tasks = catalog
    .map((c) => ({ taskKey: c.key, season: seasonForTaskVisit(start, c.seasons ?? []) }))
    .filter((t): t is { taskKey: string; season: NonNullable<typeof t.season> } => Boolean(t.season));
  const services = catalog.map((c) => c.title);
  const address = '14 Maple Ave, West Orange, NJ 07052';

  const homeowner = await ensureServiceHomeowner({
    email: TEST_CUSTOMER, firstName: 'Jordan', phone: '(201) 555-0100',
    address: '14 Maple Ave', city: 'West Orange', zip: '07052',
  });
  if (!homeowner) throw new Error('could not create the test customer');

  await scheduleVisit({ homeownerId: homeowner.id, tasks, start, end, address });

  // Queued, never sent - it fires 7:30pm the night before, three weeks away.
  const { subject: rSubject, html: rHtml } = buildVisitReminderEmail({
    recipientName: 'Jordan', services, address,
    timeWindow: visitTimeWindow(start, end), visitDateLabel: visitDateLabel(start),
    portalUrl: `${SITE}/home-care/checklist`,
    unsubscribeUrl: `${SITE}/api/home-care/unsubscribe?token=${encodeURIComponent(homeowner.unsubscribe_token)}`,
  });
  const reminder = await requeueVisitReminder({
    email: TEST_CUSTOMER, name: 'Jordan', start, subject: rSubject, html: rHtml,
  });

  const result = await sendVisitDispatch({
    siteUrl: SITE,
    homeownerId: homeowner.id,
    visitStart: start, visitEnd: end,
    customerName: 'Jordan Caruso', customerPhone: '(201) 555-0100',
    address, services,
    visitDateLabel: visitDateLabel(start), timeWindow: visitTimeWindow(start, end),
    subName: 'Ramirez Exteriors',
    recipientIds: [recipientId],
    customerReminder: reminder,
  });

  // A sign-in link for the CUSTOMER side, so the portal can be seen without
  // waiting on a magic-link email. Same verify-token flow the login route uses.
  const verifyToken = randomBytes(32).toString('hex');
  await supabaseRest('PATCH', `homeowners?id=eq.${homeowner.id}`, {
    verify_token: verifyToken,
    verify_token_expires_at: new Date(Date.now() + 48 * 3600_000).toISOString(),
  }).catch(() => {});

  const tokens = (await supabaseRest<{ confirm_token: string }[]>(
    'GET', `visit_dispatch_recipients?select=confirm_token&recipient_id=eq.${recipientId}&order=created_at.desc&limit=1`)) ?? [];

  console.log('');
  console.log(`  dispatch  : ${result.outcome}`);
  console.log(`  sent to   : ${result.sentTo.join(', ') || '(nobody)'}`);
  console.log(`  reminder  : ${reminder} (queued for 7:30pm the night before, 3 weeks out - fires nothing today)`);
  console.log(`  visit     : ${visitDateLabel(start)} ${visitTimeWindow(start, end)}`);
  console.log(`  confirm   : ${SITE}/crew/confirm/${tokens[0]?.confirm_token ?? '(none)'}`);
  console.log(`  customer  : ${TEST_CUSTOMER}`);
  console.log(`  portal    : ${SITE}/api/home-care/verify?token=${verifyToken}`);
  console.log('');
  console.log('  Clean up with: npx tsx --env-file=.env.local scripts/crew-dispatch-live-test.ts --cleanup');
}

main().catch((err) => { console.error(err); process.exit(1); });
