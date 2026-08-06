import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { newLeadNotificationHtml } from '../src/lib/emailTemplates';
import { buildNewsletter, type NewsletterTask } from '../src/lib/homecare/newsletter';

/**
 * Home Care: consolidated multi-service requests.
 *
 * Owner requirement: when a homeowner asks for several services from Home Care,
 * they should arrive as ONE concise, itemized message, not one alert per
 * service. Two halves:
 *   1. Every per-row "book now" surface is removed so the checklist cart is the
 *      only submit path (add to request, review, one lead). Guides + newsletter
 *      route into the same checklist flow instead of one-off book links.
 *   2. The structured service titles ride the notification payload (only) and
 *      are itemized in both the Telegram and email owner alert; the alert's
 *      Project is labelled "Home Care". The durable record stays in the lead's
 *      `message`, and the titles are stripped before the sanitizer so they
 *      never reach the leads table.
 *
 * These guard the wiring (source assertions, matching the sibling home-care
 * specs) plus the pure email builder exercised at runtime.
 */

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const checklist = read('src/components/homecare/HomeCareChecklistClient.tsx');
const bookingForm = read('src/components/homecare/HomeCareBookingForm.tsx');
const submitRoute = read('src/app/api/leads/submit/route.ts');
const telegram = read('src/lib/notify/telegramLead.ts');
const newLeadEmail = read('src/lib/notify/newLeadEmail.ts');
const guides = read('src/app/home-care/guides/[season]/page.tsx');
const newsletter = read('src/lib/homecare/newsletter.ts');
const checklistPage = read('src/app/home-care/checklist/page.tsx');

/** One bookable task, so exactly one "Add to plan" deep link renders. */
const AC9_TASKS: NewsletterTask[] = [
  { key: 'clean_gutters', title: 'Clean gutters', blurb: 'Clear them out.', bookable: true, diy_or_pro: 'pro', priority: 9, applies_to: ['all'] },
];

test('AC1: checklist has no per-row single-book link (the fan-out is removed)', () => {
  expect(checklist).not.toContain('book?task=');
  expect(checklist).not.toContain('Book this now');
});

test('AC2: every bookable row has a way onto the cart, and they all drive one set', () => {
  // Two shapes since the DIY/Pro slice, and both end at `selected`:
  //  - a pro-only task keeps the explicit Add-to-request button;
  //  - a task the member can choose about gets there by picking "La Vaca does
  //    it", which IS adding it to the request. That merge is what let the card
  //    drop a row - the button and the choice were the same action.
  expect(checklist).toContain('Add to request');
  expect(checklist).toContain('Added to request');
  expect(checklist).toContain('La Vaca does it');
  expect(checklist).toContain('On your request');
  // One selection set, whichever way a task got there.
  expect(checklist).toMatch(/setMode[\s\S]{0,1200}copy\.add\(key\)/);
  expect(checklist).toContain('toggleSelect(t.key)');
});

test('AC3: the only submit path is the consolidated cart pill', () => {
  expect(checklist).toContain('book?tasks='); // cart -> one consolidated lead
  expect(checklist).toContain('Review request'); // renamed pill label
  expect(checklist).toContain('Review your request for'); // renamed pill aria
  expect(checklist).not.toContain('Request an estimate for'); // old aria gone
});

test('AC4: booking form sends structured service titles for itemization', () => {
  expect(bookingForm).toContain('services: services.map((s) => s.title)');
  // The durable record still lives in the message field.
  expect(bookingForm).toContain('(tasks:');
});

test('AC5: submit route strips services before the sanitizer and passes them to both alerts', () => {
  // Destructured out of the lead fields, so they never reach
  // sanitizeLeadForInsert (no "unknown column" alert) or the leads table.
  // (Slice 5's task_keys is destructured out alongside services here too.)
  expect(submitRoute).toMatch(/services:\s*rawServices,\s*task_keys:\s*rawTaskKeys,\s*\.\.\.rawLeadFields/);
  expect(submitRoute).toContain('requestedServices');
  // Handed to both owner-alert channels.
  const passCount = submitRoute.split('services: requestedServices.length ? requestedServices : undefined').length - 1;
  expect(passCount).toBe(2);
  // Alert Project relabelled to "Home Care" for home_care sources only.
  expect(submitRoute).toContain("source.startsWith('home_care') ? 'Home Care'");
  expect(submitRoute).toContain('projectType: alertProjectType');
});

test('AC6: Telegram alert renders an escaped, itemized services block', () => {
  expect(telegram).toContain('services?: string[]');
  expect(telegram).toContain('Services requested');
  expect(telegram).toContain('esc(s)'); // each title escaped before interpolation
});

test('AC7: email builder itemizes + escapes services at runtime', () => {
  const html = newLeadNotificationHtml({
    name: 'Alex',
    email: 'a@b.com',
    projectType: 'Home Care',
    services: ['Clean & seal the deck', '<script>x</script> filter'],
  });
  expect(html).toContain('Services requested (2)');
  expect(html).toContain('Clean &amp; seal the deck'); // & escaped
  expect(html).toContain('&lt;script&gt;'); // < > escaped
  expect(html).not.toContain('<script>x</script>'); // no raw injection
  // No services block when there are none.
  const none = newLeadNotificationHtml({ name: 'Alex', email: 'a@b.com' });
  expect(none).not.toContain('Services requested');
  // sendNewLeadEmail forwards the field into the template.
  expect(newLeadEmail).toContain('services,');
});

test('AC8: guides + newsletter route into the checklist flow, not one-off book links', () => {
  expect(guides).not.toContain('book?task=');
  expect(guides).toContain('/home-care/checklist');
  expect(newsletter).not.toContain('book?task=');
  expect(newsletter).toContain('Add to plan');
});

test('AC9: guides + newsletter per-task CTAs deep-link the task via ?add=', () => {
  // Per-item guide CTA carries the task key so the checklist pre-selects it.
  expect(guides).toContain('/home-care/checklist?add=${encodeURIComponent(item.key)}');
  // Newsletter "Add to plan" (HTML) and per-task text line both carry ?add=.
  // Asserted from the RENDERED email rather than a source literal: the link is
  // now built through the access-token helper, so the deep link can live behind
  // ?to= and a source grep for "?add=" would miss it either way it is spelled.
  const addKey = (accessToken: string | null) => {
    const { html, text } = buildNewsletter({
      firstName: 'Dana', season: 'fall', tasks: AC9_TASKS, isSeasonal: true,
      baseUrl: 'https://www.lavacagc.com', accessToken,
      unsubscribeUrl: 'https://www.lavacagc.com/u',
    });
    return [html, text].map((body) => {
      const link = body.match(/https:\/\/[^\s"']*add[=%][^\s"']*/)?.[0]?.replace(/&amp;/g, '&');
      const url = new URL(link!);
      const dest = url.searchParams.get('to');
      return new URL(dest ?? url.pathname + url.search, 'https://www.lavacagc.com').searchParams.get('add');
    });
  };
  expect(addKey('tok-ac9'), 'tokenized links must still carry ?add=').toEqual(['clean_gutters', 'clean_gutters']);
  expect(addKey(null), 'and so must the bare fallback').toEqual(['clean_gutters', 'clean_gutters']);
  // The full-checklist buttons stay bare (no ?add), so they open the whole plan.
  // Rendered for the same reason the deep link above is: the label is
  // season/month-specific since the design port ("Open My August Checklist"),
  // and a source literal asserts how the builder is written rather than what it
  // emits - it broke on a rename of a local while the emails were correct.
  const { html, text } = buildNewsletter({
    firstName: 'Dana', season: 'fall', tasks: AC9_TASKS, isSeasonal: true,
    baseUrl: 'https://www.lavacagc.com', accessToken: 'tok-ac9',
    unsubscribeUrl: 'https://www.lavacagc.com/u',
  });
  for (const [part, body] of [['html', html], ['text', text]] as const) {
    const wholePlan = (body.match(/https:\/\/[^\s"']*\/api\/home-care\/access[^\s"']*/g) ?? [])
      .map((u) => new URL(u.replace(/&amp;/g, '&')))
      .filter((u) => !(u.searchParams.get('to') ?? '').includes('add='));
    expect(wholePlan.length, `${part} must offer a link to the whole plan, not only ?add= deep links`).toBeGreaterThan(0);
  }
});

test('AC10: checklist page derives autoAddKey behind a bookable/dismissed guard', () => {
  expect(checklistPage).toContain('add?: string');
  // Only a bookable, non-starter, non-dismissed task in the catalog may pre-select.
  expect(checklistPage).toContain('t.key === addKey && t.bookable && !t.starter && !dismissedKeys.includes(addKey)');
  // The ?add value is coerced array-safely before any string methods run.
  expect(checklistPage).toContain('Array.isArray(sp?.add) ? sp.add[0] : sp?.add');
  expect(checklistPage).toContain('autoAddKey={autoAddKey}');
});

test('AC11: client accepts autoAddKey and seeds the request cart from it', () => {
  expect(checklist).toContain('autoAddKey?: string');
  expect(checklist).toContain('new Set(autoAddKey ? [autoAddKey] : [])');
});
