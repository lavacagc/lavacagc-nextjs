/**
 * La Vaca Home Care — newsletter content builder (pure, testable).
 *
 * Two modes from one monthly cron:
 *  - seasonal (at each season start): the full seasonal checklist.
 *  - nudge (other months): the top few timely tasks, lighter touch.
 */
import { SEASON_LABEL, type Season } from './season';

export interface NewsletterTask {
  key: string;
  title: string;
  blurb: string;
  bookable: boolean;
  diy_or_pro: 'diy' | 'pro' | 'either';
  priority: number;
  applies_to: string[];
}

export interface NewsletterArgs {
  firstName?: string | null;
  season: Season;
  tasks: NewsletterTask[];
  isSeasonal: boolean;
  baseUrl: string;
  unsubscribeUrl: string;
  monthLabel?: string; // e.g. "July" (for nudge subject)
}

const NUDGE_COUNT = 3;

export function selectTasks(tasks: NewsletterTask[], isSeasonal: boolean): NewsletterTask[] {
  const sorted = [...tasks].sort((a, b) => b.priority - a.priority);
  return isSeasonal ? sorted : sorted.slice(0, NUDGE_COUNT);
}

export function buildNewsletter(args: NewsletterArgs): { subject: string; html: string; text: string } {
  const { firstName, season, isSeasonal, baseUrl, unsubscribeUrl } = args;
  const seasonLabel = SEASON_LABEL[season];
  const list = selectTasks(args.tasks, isSeasonal);
  const hi = firstName ? `Hi ${firstName},` : 'Hi there,';

  const subject = isSeasonal
    ? `Your ${seasonLabel} home checklist 🍂`
    : `${args.monthLabel ?? 'This month'}: ${list.length} quick home to-dos`;

  const intro = isSeasonal
    ? `${seasonLabel} is here — here's everything worth doing around the house this season to keep it in great shape. Knock out the easy ones yourself, and tap “Book La Vaca” on anything you'd rather hand off.`
    : `A quick mid-season nudge — a few timely things worth doing around the house right now. Two minutes to skim.`;

  const card = (t: NewsletterTask) => {
    const badge = t.diy_or_pro === 'pro' ? 'Pro recommended' : t.diy_or_pro === 'diy' ? 'DIY-friendly' : 'DIY or pro';
    const book = t.bookable
      ? `<a href="${baseUrl}/home-care/book?task=${encodeURIComponent(t.key)}" style="display:inline-block;margin-top:8px;background:linear-gradient(135deg,#EE9639,#FF6F31);color:#1a1003;font-weight:800;text-decoration:none;padding:8px 16px;border-radius:8px;font-size:13px">Book La Vaca →</a>`
      : '';
    return `<div style="border:1px solid #eee;border-radius:12px;padding:14px 16px;margin-bottom:12px">
      <div style="font-size:16px;font-weight:800;color:#002855">${t.title}</div>
      <div style="font-size:14px;color:#5b6b82;margin-top:4px">${t.blurb}</div>
      <div style="font-size:12px;color:#9aa3b0;margin-top:6px">${badge}</div>
      ${book}
    </div>`;
  };

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f6f4ef;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:24px">
    <div style="background:#002855;color:#fff;border-radius:14px 14px 0 0;padding:22px 26px">
      <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#FFCB8E;font-weight:700">La Vaca Home Care</div>
      <div style="font-size:21px;font-weight:800;margin-top:6px">${isSeasonal ? `Your ${seasonLabel} checklist` : 'Your monthly home nudge'}</div>
    </div>
    <div style="background:#fff;padding:22px 26px;border-radius:0 0 14px 14px">
      <p style="font-size:15px;color:#0c1730;margin:0 0 8px">${hi}</p>
      <p style="font-size:14px;color:#5b6b82;margin:0 0 20px">${intro}</p>
      ${list.map(card).join('')}
      <p style="margin:18px 0 0"><a href="${baseUrl}/home-care/checklist" style="color:#EE9639;font-weight:700">See your full checklist →</a></p>
      <p style="font-size:12px;color:#9aa3b0;margin-top:22px;border-top:1px solid #eee;padding-top:14px">You're getting this because you joined La Vaca Home Care. <a href="${unsubscribeUrl}" style="color:#9aa3b0">Unsubscribe</a>.</p>
    </div>
  </div>
</body></html>`;

  let text = `${hi}\n\n${intro}\n\n`;
  for (const t of list) {
    text += `• ${t.title} — ${t.blurb}\n`;
    if (t.bookable) text += `  Book: ${baseUrl}/home-care/book?task=${t.key}\n`;
  }
  text += `\nFull checklist: ${baseUrl}/home-care/checklist\nUnsubscribe: ${unsubscribeUrl}`;

  return { subject, html, text };
}
