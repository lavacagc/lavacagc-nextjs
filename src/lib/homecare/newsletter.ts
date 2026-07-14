/**
 * La Vaca Home Care — newsletter content builder (pure, testable).
 *
 * Two modes from one monthly cron:
 *  - seasonal (at each season start): the full seasonal checklist.
 *  - nudge (other months): the top few timely tasks, lighter touch.
 */
import { SEASON_LABEL, type Season } from './season';
import { hasGuideItem } from './guides';

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
  /** Self-serve preference-center link (per-recipient token). Preferred footer CTA. */
  preferencesUrl?: string;
  monthLabel?: string; // e.g. "July" (for nudge subject)
}

const NUDGE_COUNT = 3;

export function selectTasks(tasks: NewsletterTask[], isSeasonal: boolean): NewsletterTask[] {
  const sorted = [...tasks].sort((a, b) => b.priority - a.priority);
  return isSeasonal ? sorted : sorted.slice(0, NUDGE_COUNT);
}

/** Escape user/catalog text for safe, artifact-free HTML. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const LOGO = 'https://www.lavacagc.com/logo.png';
const PHONE = '(201) 212-4917';
const HIC = 'NJ HIC# 13VH13373800';

export function buildNewsletter(args: NewsletterArgs): { subject: string; html: string; text: string } {
  const { firstName, season, isSeasonal, baseUrl, unsubscribeUrl, preferencesUrl } = args;
  const seasonLabel = SEASON_LABEL[season];
  const list = selectTasks(args.tasks, isSeasonal);
  const hi = firstName ? `Hi ${esc(firstName)},` : 'Hi there,';
  const checklistUrl = `${baseUrl}/home-care/checklist`;

  const subject = isSeasonal
    ? `Your ${seasonLabel} home checklist`
    : `${args.monthLabel ?? 'This month'}: ${list.length} quick home to-dos`;

  const intro = isSeasonal
    ? `${seasonLabel} is here — here's your checklist to keep your home in great shape. Check items off on your saved list, and book us for anything you'd rather hand off.`
    : `A quick mid-season nudge — a few timely things worth doing around the house right now.`;

  // A compact checklist ROW (table-based for email-client reliability).
  const row = (t: NewsletterTask) => {
    const badge = t.diy_or_pro === 'pro' ? 'Pro' : t.diy_or_pro === 'diy' ? 'DIY' : 'DIY / Pro';
    const badgeColor = t.diy_or_pro === 'pro' ? '#b8761f' : '#177a66';
    // Pro jobs route to the saved checklist (email can't hold a cart) so the
    // member adds them to one request and checks out once - no per-task
    // one-off booking, so no separate owner alert per link.
    const book = t.bookable
      ? `<a href="${checklistUrl}?add=${encodeURIComponent(t.key)}" style="display:inline-block;background:#EE9639;color:#1a1003;font-weight:800;text-decoration:none;padding:8px 14px;border-radius:8px;font-size:13px;white-space:nowrap">Add to plan</a>`
      : '';
    return `<tr>
      <td width="30" valign="top" style="padding:14px 0 14px 0"><div style="width:20px;height:20px;border:2px solid #c7d0dc;border-radius:5px"></div></td>
      <td valign="top" style="padding:14px 10px 14px 4px">
        <a href="${checklistUrl}" style="font-size:16px;font-weight:700;color:#002855;text-decoration:none">${esc(t.title)}</a>
        <span style="display:inline-block;margin-left:6px;font-size:11px;font-weight:800;color:${badgeColor};vertical-align:middle">${badge}</span>
        <div style="font-size:13px;color:#5b6b82;margin-top:3px;line-height:1.45">${esc(t.blurb)}</div>
        ${hasGuideItem(season, t.key) ? `<div style="margin-top:5px"><a href="${baseUrl}/home-care/guides/${season}#${encodeURIComponent(t.key)}" style="font-size:12px;font-weight:700;color:#EE9639;text-decoration:none">Learn more →</a></div>` : ''}
      </td>
      <td width="120" valign="top" align="right" style="padding:14px 0">${book}</td>
    </tr>
    <tr><td colspan="3" style="border-bottom:1px solid #eef1f5;font-size:0;line-height:0">&nbsp;</td></tr>`;
  };

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#eef0ea;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
  <div style="max-width:620px;margin:0 auto;padding:20px">
    <!-- Branded header -->
    <table width="100%" style="background:#002855;border-radius:16px 16px 0 0;border-collapse:collapse"><tr>
      <td style="padding:20px 24px" valign="middle">
        <table style="border-collapse:collapse"><tr>
          <td valign="middle"><img src="${LOGO}" width="48" height="48" alt="La Vaca" style="display:block;border-radius:10px;background:#fff"></td>
          <td valign="middle" style="padding-left:12px">
            <div style="color:#fff;font-size:18px;font-weight:800;line-height:1.1">La Vaca Home Care</div>
            <div style="color:#FFCB8E;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-top:2px">Northern New Jersey</div>
          </td>
        </tr></table>
      </td>
    </tr></table>

    <!-- Title band -->
    <table width="100%" style="background:#0a3a6b;border-collapse:collapse"><tr>
      <td style="padding:16px 24px">
        <div style="color:#fff;font-size:22px;font-weight:800">${isSeasonal ? `Your ${seasonLabel} checklist` : 'Your monthly home nudge'}</div>
      </td>
    </tr></table>

    <!-- Body -->
    <div style="background:#fff;padding:22px 24px;border-radius:0 0 16px 16px">
      <p style="font-size:15px;color:#0c1730;margin:0 0 6px;font-weight:600">${hi}</p>
      <p style="font-size:14px;color:#5b6b82;margin:0 0 16px;line-height:1.5">${intro}</p>

      <table width="100%" style="border-collapse:collapse">${list.map(row).join('')}</table>

      <div style="text-align:center;margin:22px 0 6px">
        <a href="${checklistUrl}" style="display:inline-block;background:linear-gradient(135deg,#EE9639,#FF6F31);color:#fff;font-weight:800;text-decoration:none;padding:13px 26px;border-radius:10px;font-size:15px">Open &amp; save my full checklist →</a>
      </div>

      <!-- Share line: members are the best ad channel -->
      <div style="background:#f4f6f9;border-radius:10px;padding:12px 16px;margin-top:8px;font-size:13px;color:#5b6b82;text-align:center">
        Know someone who&rsquo;d want this? Forward this email — they can get their own free plan at
        <a href="${baseUrl}/home-care?utm_source=member_share&amp;utm_medium=email&amp;utm_campaign=home_care_share" style="color:#EE9639;font-weight:700;text-decoration:none">lavacagc.com/home-care</a>.
      </div>

      <!-- Branded footer -->
      <table width="100%" style="border-top:1px solid #e6e9ef;margin-top:20px;border-collapse:collapse"><tr>
        <td style="padding-top:16px">
          <div style="font-size:14px;font-weight:800;color:#002855">La Vaca General Contractors</div>
          <div style="font-size:13px;color:#5b6b82;margin-top:3px">
            <a href="tel:2012124917" style="color:#EE9639;font-weight:700;text-decoration:none">${PHONE}</a>
            &nbsp;·&nbsp; ${HIC}
          </div>
          <div style="font-size:11px;color:#9aa3b0;margin-top:12px">You're receiving this because you joined La Vaca Home Care. ${preferencesUrl ? `<a href="${preferencesUrl}" style="color:#9aa3b0;text-decoration:underline">Manage email preferences</a> · ` : ''}<a href="${unsubscribeUrl}" style="color:#9aa3b0">Unsubscribe</a>.</div>
        </td>
      </tr></table>
    </div>
  </div>
</body></html>`;

  let text = `${firstName ? `Hi ${firstName},` : 'Hi there,'}\n\n${intro}\n\n`;
  for (const t of list) {
    text += `[ ] ${t.title} — ${t.blurb}\n`;
    if (t.bookable) text += `    Add to your checklist to have La Vaca do it: ${checklistUrl}?add=${t.key}\n`;
  }
  text += `\nOpen & save your full checklist: ${checklistUrl}\n\nKnow someone who'd want this? They can get their own free plan: ${baseUrl}/home-care\n\nLa Vaca General Contractors · ${PHONE} · ${HIC}\n`;
  if (preferencesUrl) text += `Manage email preferences: ${preferencesUrl}\n`;
  text += `Unsubscribe: ${unsubscribeUrl}`;

  return { subject, html, text };
}
