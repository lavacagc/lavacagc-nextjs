/**
 * Render every message crew dispatch can send, to static files.
 *
 * SENDS NOTHING and TOUCHES NO DATABASE - it calls the pure builders directly,
 * so it costs no Resend credits and cannot write to production. That matters
 * here: the admin UI runs against the real Supabase, so clicking "Schedule
 * visit" locally books a real visit and mails real people. This is the way to
 * read the copy without doing any of that.
 *
 *   npx tsx scripts/crew-dispatch-preview.ts
 *
 * Output lands in .preview/ and is opened in the browser.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { buildDispatchEmail, buildDispatchCancelledEmail } from '../src/lib/homecare/dispatchEmail';
import { flagAlertMessage, escalationMessage, siblingVerdict } from '../src/lib/homecare/dispatchAlerts';
import { buildIcs, googleCalendarUrl } from '../src/lib/homecare/ics';
import { visitDateLabel, visitTimeWindow } from '../src/lib/homecare/visitSchedule';

const OUT = join(process.cwd(), '.preview');
mkdirSync(OUT, { recursive: true });

const CONFIRM = 'http://localhost:3000/crew/confirm/PREVIEW-TOKEN';

/** A visit three weeks out, booked today - the case the copy used to get wrong. */
const FAR_START = new Date(Date.UTC(2026, 7, 20, 12));
const FAR_END = new Date(Date.UTC(2026, 7, 20, 15));
/** A visit tomorrow - the ordinary case. */
const SOON_START = new Date(Date.UTC(2026, 7, 2, 12));
const SOON_END = new Date(Date.UTC(2026, 7, 2, 15));
const NOW = new Date(Date.UTC(2026, 7, 1, 14));

const base = {
  recipientName: 'Veronica',
  customerName: 'Jordan Caruso',
  customerPhone: '(201) 555-0100',
  address: '14 Maple Ave, West Orange, NJ',
  services: ['Clean gutters & downspouts', 'Clean the dryer vent'],
  subName: 'Ramirez Exteriors',
  confirmUrl: CONFIRM,
  calendarUrl: googleCalendarUrl({
    title: 'La Vaca: Clean gutters - Jordan Caruso',
    start: SOON_START, end: SOON_END,
    details: 'Services: Clean gutters', location: '14 Maple Ave, West Orange, NJ',
  }),
  now: NOW,
};

interface Panel { id: string; title: string; note: string; html?: string; text?: string; subject?: string }
const panels: Panel[] = [];

function email(id: string, title: string, note: string, built: { subject: string; html: string; text: string }) {
  writeFileSync(join(OUT, `${id}.html`), built.html);
  panels.push({ id, title, note, html: built.html, subject: built.subject });
}

/* ── the dispatch, in its three reminder states ──────────────────────────── */

email('dispatch-tomorrow', 'Dispatch - visit tomorrow, reminder queued',
  'The ordinary case. Note "tonight" and "tomorrow" are correct here.',
  buildDispatchEmail({ ...base, visitStart: SOON_START,
    visitDateLabel: visitDateLabel(SOON_START), timeWindow: visitTimeWindow(SOON_START, SOON_END),
    customerReminder: 'queued' }));

email('dispatch-home-details', 'Dispatch - with the homeowner\'s saved home details (My Home Systems)',
  'The Slice 5 rider on the crew email: details scoped to the booked services, body only, never the .ics.',
  buildDispatchEmail({ ...base, visitStart: SOON_START,
    visitDateLabel: visitDateLabel(SOON_START), timeWindow: visitTimeWindow(SOON_START, SOON_END),
    homeDetails: [
      'Water main shut-off: basement, under the stairs',
      'Outdoor faucet shut-offs: utility room ceiling, labeled',
    ],
    customerReminder: 'queued' }));

email('dispatch-weeks-out', 'Dispatch - visit three weeks out',
  'Booked 1 Aug for 20 Aug. This is what used to say "tonight" - check the dates read correctly.',
  buildDispatchEmail({ ...base, visitStart: FAR_START,
    visitDateLabel: visitDateLabel(FAR_START), timeWindow: visitTimeWindow(FAR_START, FAR_END),
    customerReminder: 'queued' }));

email('dispatch-no-reminder', 'Dispatch - same-day booking, NO customer reminder',
  'requeueVisitReminder answered "skipped": nobody is telling the customer, and the crew are the only ones who can.',
  buildDispatchEmail({ ...base, visitStart: SOON_START,
    visitDateLabel: visitDateLabel(SOON_START), timeWindow: visitTimeWindow(SOON_START, SOON_END),
    customerReminder: 'skipped' }));

email('dispatch-no-sub', 'Dispatch - no sub named',
  'The Sub row disappears entirely and the button reads "Confirm - I am on this".',
  buildDispatchEmail({ ...base, subName: null, visitStart: SOON_START,
    visitDateLabel: visitDateLabel(SOON_START), timeWindow: visitTimeWindow(SOON_START, SOON_END),
    customerReminder: 'queued' }));

email('cancelled', 'Retraction - the visit is off',
  'Carries a METHOD:CANCEL .ics. Leads with "do not text this customer", because the invite they hold says to.',
  buildDispatchCancelledEmail({
    recipientName: 'Veronica', customerName: 'Jordan Caruso',
    address: '14 Maple Ave, West Orange, NJ',
    services: ['Clean gutters & downspouts', 'Clean the dryer vent'],
    visitDateLabel: visitDateLabel(SOON_START), timeWindow: visitTimeWindow(SOON_START, SOON_END),
    visitStart: SOON_START, now: NOW,
  }));

/* ── the calendar files ──────────────────────────────────────────────────── */

const crewIcs = buildIcs({
  uid: 'lavaca-crew-PREVIEW', start: SOON_START, end: SOON_END,
  services: base.services, address: base.address,
  customerName: base.customerName, customerPhone: base.customerPhone,
  variant: 'crew', attendees: [{ name: 'Veronica', email: 'veronica@lavacagc.com' }], now: NOW,
});
writeFileSync(join(OUT, 'crew.ics'), crewIcs);
panels.push({
  id: 'crew-ics', title: 'The crew calendar invite (attached to the dispatch)',
  note: 'Look for METHOD:REQUEST, the ATTENDEE line, and TWO alarms - 7:30pm the night before, and 7:00am on the day telling you to text the customer.',
  text: crewIcs,
});

/* ── the Telegram messages ───────────────────────────────────────────────── */

const tg = (id: string, title: string, note: string, body: string) =>
  panels.push({ id, title, note, text: body });

tg('tg-nudge', 'Telegram 5pm - nobody has confirmed',
  'Goes to your existing chat. This is the first stage.',
  escalationMessage({
    stage: 'nudge', customer: 'Jordan Caruso',
    label: `${visitDateLabel(SOON_START)} ${visitTimeWindow(SOON_START, SOON_END)}`,
    address: base.address, services: base.services, phone: base.customerPhone,
    dispatched: true, sentTo: ['Alex', 'Veronica'], flags: [], customerReminder: 'coming',
  }));

tg('tg-escalate', 'Telegram 6pm - still unconfirmed',
  'Second stage. Note the urgency changes - the customer is told at 7:30pm.',
  escalationMessage({
    stage: 'escalate', customer: 'Jordan Caruso',
    label: `${visitDateLabel(SOON_START)} ${visitTimeWindow(SOON_START, SOON_END)}`,
    address: base.address, services: base.services, phone: base.customerPhone,
    dispatched: true, sentTo: ['Alex', 'Veronica'], flags: [], customerReminder: 'coming',
  }));

tg('tg-never-dispatched', 'Telegram - nobody was EVER told',
  'The worse case: no dispatch went out at all, so this is chased harder rather than skipped.',
  escalationMessage({
    stage: 'escalate', customer: 'Jordan Caruso',
    label: `${visitDateLabel(SOON_START)} ${visitTimeWindow(SOON_START, SOON_END)}`,
    address: base.address, services: base.services, phone: base.customerPhone,
    dispatched: false, sentTo: [], flags: [], customerReminder: 'coming',
  }));

tg('tg-flag', 'Telegram - a crew member flagged a problem',
  'Fires the moment they tap it, with their note verbatim. This is the one you asked for.',
  flagAlertMessage({
    who: 'Veronica', when: `${visitDateLabel(SOON_START)} ${visitTimeWindow(SOON_START, SOON_END)}`,
    customerName: 'Jordan Caruso', customerPhone: base.customerPhone,
    address: base.address, services: base.services, subName: 'Ramirez Exteriors',
    visitRead: 'ok', note: 'Sub cancelled on me - Ramirez cannot make Sunday.',
    verdict: siblingVerdict([{ name: 'Alex', email: 'alex@lavacagc.com', status: 'sent' }], ['nudge', 'escalate']),
    customerReminder: 'coming',
  }));

tg('tg-flag-after-confirm', 'Telegram - flagged AFTER a colleague confirmed',
  'The important one: because Alex confirmed, the 5pm/6pm chases are silent, so this alert is the only warning you get.',
  flagAlertMessage({
    who: 'Veronica', when: `${visitDateLabel(SOON_START)} ${visitTimeWindow(SOON_START, SOON_END)}`,
    customerName: 'Jordan Caruso', customerPhone: base.customerPhone,
    address: base.address, services: base.services, subName: 'Ramirez Exteriors',
    visitRead: 'ok', note: 'Van is in the shop, we cannot get there.',
    verdict: siblingVerdict([{ name: 'Alex', email: 'alex@lavacagc.com', status: 'confirmed' }], []),
    customerReminder: 'told',
  }));

/* ── the index ───────────────────────────────────────────────────────────── */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const index = `<!doctype html><meta charset="utf-8"><title>Crew dispatch - preview</title>
<style>
 body{margin:0;background:#F4F1ED;font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#303030}
 .w{max-width:1000px;margin:0 auto;padding:28px 18px 80px}
 h1{font-size:30px;letter-spacing:-.02em;margin:0 0 6px;color:#1A1A1A}
 .lede{color:#666;margin:0 0 26px;max-width:70ch}
 .warn{background:#FEF2F2;border:1px solid #FCA5A5;border-radius:10px;padding:14px 16px;margin-bottom:26px}
 .c{background:#fff;border:1px solid #E2E8F0;border-radius:12px;margin-bottom:18px;overflow:hidden}
 .h{padding:14px 18px;border-bottom:1px solid #E2E8F0}
 .h b{display:block;color:#1A1A1A;font-size:16px}
 .h span{font-size:13px;color:#666}
 .subj{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;background:#F8FAFC;padding:8px 18px;border-bottom:1px solid #E2E8F0;color:#1A1A1A;overflow-x:auto;white-space:nowrap}
 iframe{width:100%;height:760px;border:0;display:block}
 pre{margin:0;padding:16px 18px;background:#0F172A;color:#E2E8F0;font-size:12.5px;overflow-x:auto;white-space:pre-wrap;word-break:break-word}
</style>
<div class="w">
<h1>Crew dispatch - every message it can send</h1>
<p class="lede">Rendered straight from the builders. <strong>Nothing was sent and nothing was written to the database</strong> - no Resend credits used.</p>
<div class="warn"><strong>Careful in the admin UI.</strong> Your local server reads and writes the REAL production Supabase, and scheduling a visit there sends REAL email to alex@ and veronica@. Use it to look around; use this page to read the copy.</div>
${panels.map((p) => `<div class="c">
  <div class="h"><b>${esc(p.title)}</b><span>${esc(p.note)}</span></div>
  ${p.subject ? `<div class="subj">${esc(p.subject)}</div>` : ''}
  ${p.html ? `<iframe src="./${p.id}.html"></iframe>` : `<pre>${esc(p.text ?? '')}</pre>`}
</div>`).join('\n')}
</div>`;
writeFileSync(join(OUT, 'index.html'), index);

console.log(`Rendered ${panels.length} panels to .preview/index.html - nothing sent, nothing written.`);
