/**
 * La Vaca Home Care - newsletter content builder (pure, testable).
 *
 * Two modes from one monthly cron:
 *  - seasonal (at each season start): the full seasonal checklist.
 *  - nudge (other months): the top few timely tasks, lighter touch.
 *
 * Layout ported from the "Home Care Monthly Email" Claude Design project:
 * a 600px card on a cream page, navy license bar, brand row, season pill,
 * oversized two-tone headline, numbered task rows, and a navy "rather we
 * handled it?" call block. Table-based with `mso-line-height-rule:exactly`
 * throughout so Outlook renders the same as everything else.
 *
 * Two deliberate departures from the design comp:
 *  - The comp's 600x200 "swap in a hosted photo" placeholder only renders when
 *    a caller passes `heroImageUrl`. Shipping a literal "Image placeholder"
 *    block to members would be worse than shipping no image.
 *  - The comp personalizes on town ("your home in West Orange"). `homeowners`
 *    stores `zip`, not town, so that clause is dropped rather than guessed.
 *
 * Functionality the comp doesn't show is preserved: per-task "Add to plan"
 * CTAs for bookable jobs, seasonal guide deep-links, the member-share line,
 * and the tokenized preference-center / unsubscribe footer.
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
  /** From maintenance_catalog. Rendered only when BOTH ends are present. */
  est_cost_low?: number | null;
  est_cost_high?: number | null;
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
  /** Calendar year for the season pill, e.g. 2026. Omitted from the pill if unset. */
  year?: number;
  /**
   * Absolute URL of a hosted photo for the 600x200 hero band (a recent
   * Northern NJ project reads best). Omit and the band is not rendered.
   */
  heroImageUrl?: string;
  /**
   * The member has already handled everything that applies to their home this
   * season. Renders the short congratulatory variant (no task list) instead of
   * going silent, so the monthly touchpoint and the booking CTA survive.
   * `tasks` is expected to be empty when this is set.
   */
  caughtUp?: boolean;
}

/**
 * How many tasks any one email shows. Every email is a teaser now, including
 * the season opener: three concrete jobs, then a "+N more on your list" line
 * that sends them to the checklist for the rest. A 20-item fall list rendered
 * in full gets skimmed and closed; three items plus a count gets clicked.
 */
const SHOW_COUNT = 3;

/**
 * Hero photo for the month, from the twelve-image rotation in
 * `public/email/home-care/`. Named by zero-padded calendar month so the
 * filename is derivable rather than table-driven: January -> hero-01.jpg.
 *
 * Every month must have a file - `tests/home-care-newsletter.spec.ts` asserts
 * all twelve exist on disk, because a missing one renders a broken image in
 * the send rather than degrading to no band.
 */
export function homeCareHeroUrl(baseUrl: string, date: Date): string {
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${baseUrl}/email/home-care/hero-${mm}.jpg`;
}

export function selectTasks(tasks: NewsletterTask[], limit: number = SHOW_COUNT): NewsletterTask[] {
  return [...tasks].sort((a, b) => b.priority - a.priority).slice(0, limit);
}

/** Escape user/catalog text for safe, artifact-free HTML. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const LOGO = 'https://www.lavacagc.com/logo.png';
const PHONE = '(201) 212-4917';
const HIC = 'HIC# 13VH13373800';
/** CAN-SPAM requires a valid physical postal address in commercial email. */
const BUSINESS_ADDRESS = '51 Crestmont Rd, West Orange, NJ 07052';

// Design tokens from the comp.
const FF = `Arial,Helvetica,sans-serif`;
const PAGE_BG = '#EFEBE6';
const CARD_BG = '#FCFCFC';
const NAVY = '#002855';
const ORANGE = '#EE9639';
const ORANGE_DEEP = '#D97D1A';
const PILL_BG = '#FBEEDF';
const INK = '#1A1A1A';
const BODY = '#303030';
const MUTED = '#666666';
const HAIRLINE = '#E2E8F0';
const PANEL_BG = '#FBFAF8';

/** Short enough to sit as one segment of "badge · cost · blurb". */
const CONSULT_COST = 'Consult with our team';

/**
 * The cost segment of a task's meta line: "$150", "$150–$250", the consult
 * copy when the catalog's low end is 0, or '' when there are no numbers at all.
 *
 * A 0 low end is the catalog's way of saying "no meaningful floor" - four
 * active tasks carry one - not a price we can quote. Rendered literally it
 * gives "Inspect the roof · Pro job · $0–$375", which reads as a data error and
 * undercuts the rule this module already follows: a wrong price in a customer
 * email is worse than no price.
 */
function costLabel(t: NewsletterTask): string {
  const { est_cost_low: lo, est_cost_high: hi } = t;
  if (typeof lo !== 'number' || typeof hi !== 'number') return '';
  if (lo <= 0) return CONSULT_COST;
  return lo === hi ? `$${lo}` : `$${lo}&ndash;$${hi}`;
}

function badgeFor(t: NewsletterTask): string {
  return t.diy_or_pro === 'pro' ? 'Pro job' : t.diy_or_pro === 'diy' ? 'DIY' : 'DIY or pro';
}

const DOT = ' &nbsp;&middot;&nbsp; ';

/** Every string that varies between the caught-up, seasonal and nudge emails. */
interface NewsletterCopy {
  subject: string;
  preheader: string;
  headlineTop: string;
  headlineAccent: string;
  /** One intro for both renderings; `strong` is false for the plain-text build. */
  intro: (strong: boolean) => string;
  panelHeading: string;
  ctaLabel: string;
}

export function buildNewsletter(args: NewsletterArgs): { subject: string; html: string; text: string } {
  const { firstName, season, isSeasonal, baseUrl, unsubscribeUrl, preferencesUrl, year, heroImageUrl, caughtUp } = args;
  const seasonLabel = SEASON_LABEL[season];
  const monthLabel = args.monthLabel ?? 'This month';
  const list = selectTasks(args.tasks);
  /** Everything that applies but didn't fit - the hook back to the checklist. */
  const remaining = Math.max(0, args.tasks.length - list.length);
  const name = firstName ? esc(firstName) : '';
  const hi = firstName ? `Hi ${name},` : 'Hi there,';
  const checklistUrl = `${baseUrl}/home-care/checklist`;
  /**
   * Standing links for the caught-up email. Tagged like the member-share line
   * so the traffic is attributable, and pointed at the index pages rather than
   * individual posts so a send needs no extra data fetch.
   */
  const utm = (content: string) =>
    `utm_source=home_care_newsletter&utm_medium=email&utm_campaign=home_care_caught_up&utm_content=${content}`;
  const portfolioUrl = `${baseUrl}/portfolio?${utm('portfolio')}`;
  const blogUrl = `${baseUrl}/blog?${utm('blog')}`;

  const shown = list.length;
  const seasonLower = seasonLabel.toLowerCase();
  const jobWord = (n: number) => (n === 1 ? 'job' : 'jobs');
  /**
   * The one sentence both the HTML and plain-text intros end on. `strong` is
   * the only difference between them, so it's a parameter rather than a second
   * copy of the sentence.
   */
  const taggedTail = (strong: boolean) => {
    const tag = strong ? `<strong style="color:${INK}">DIY or pro</strong>` : 'DIY or pro';
    return shown === 1
      ? `It's tagged ${tag} so you know whether it's worth handing off.`
      : `Each one is tagged ${tag} so you know what's worth handing off.`;
  };

  /**
   * Every string that varies by email mode, in one place. The HTML and text
   * intros live side by side deliberately: they were separate branches and the
   * text one drifted, still promising "the full run of jobs" long after the
   * HTML became a top-3 teaser.
   *
   * Counts are singular-safe throughout - late in a season a member can have
   * exactly one job left, and "Your top 1 for October" reads like a bug.
   */
  const copy: NewsletterCopy = caughtUp
    ? {
        subject: `You're all caught up, ${firstName || 'neighbor'}`,
        preheader: `Nothing left on your ${seasonLower} list. Two things worth a look while you're ahead.`,
        headlineTop: `Your home is`,
        headlineAccent: 'all caught up.',
        // Deliberately true on a repeat: a member who clears their list in
        // September gets this again in October and November, so it cannot
        // promise silence until the next season.
        intro: () =>
          `You've cleared everything on your ${seasonLower} list - nice work. That's the boring maintenance that quietly prevents the expensive repairs, and most homeowners never get to the end of it. Nothing new to add this month - we'll check in again next month, and your next season's list will be waiting here when it opens.`,
        panelHeading: '',
        ctaLabel: `Review My ${seasonLabel} List`,
      }
    : isSeasonal
      ? {
          subject: `Your ${seasonLabel} home checklist`,
          preheader: `${shown === 1 ? 'The one' : `The ${shown}`} to do first${remaining ? `, plus ${remaining} more on your list` : ''}. What to DIY, what to hand off.`,
          headlineTop: `Your ${seasonLower} checklist`,
          headlineAccent: 'has arrived.',
          intro: (strong: boolean) =>
            `${seasonLabel} is here and your checklist is ready. ${shown === 1 ? `Here's the one worth doing first` : `Here are the ${shown} worth doing first`}${remaining ? `, with ${remaining} more waiting on your list` : ''}. ${taggedTail(strong)}`,
          panelHeading: shown === 1 ? 'Start with this one' : `Start with these ${shown}`,
          ctaLabel: `Open My ${seasonLabel} Checklist`,
        }
      : {
          subject: `${monthLabel}: ${shown} quick home to-do${shown === 1 ? '' : 's'}`,
          preheader: `${shown} ${jobWord(shown)} worth doing this month${remaining ? `, and ${remaining} more waiting` : ''}.`,
          headlineTop: `Your ${monthLabel} check-in`,
          headlineAccent: 'is here.',
          intro: (strong: boolean) =>
            `${shown === 1 ? 'One timely job worth knocking out this month.' : 'A few timely jobs worth knocking out this month.'} ${taggedTail(strong)}`,
          panelHeading: shown === 1 ? `Your top job for ${monthLabel}` : `Your top ${shown} for ${monthLabel}`,
          ctaLabel: `Open My ${monthLabel} Checklist`,
        };

  const { subject, preheader, headlineTop, headlineAccent, panelHeading, ctaLabel } = copy;

  const pillParts = [
    firstName ? `${name}'s Home Care` : 'La Vaca Home Care',
    year ? `${monthLabel} ${year}` : monthLabel,
    seasonLabel,
  ];

  /** One numbered task row, matching the comp's 01/02/03 treatment. */
  const row = (t: NewsletterTask, i: number, last: boolean) => {
    const meta = [badgeFor(t), costLabel(t), esc(t.blurb)].filter(Boolean).join(DOT);
    const guide = hasGuideItem(season, t.key)
      ? `<div style="padding-top:6px"><a href="${baseUrl}/home-care/guides/${season}#${encodeURIComponent(t.key)}" style="font-family:${FF};font-size:12px;line-height:16px;mso-line-height-rule:exactly;font-weight:bold;color:${ORANGE_DEEP};text-decoration:none">Learn more &rarr;</a></div>`
      : '';
    // Pro jobs route to the saved checklist (email can't hold a cart) so the
    // member adds them to one request and checks out once - no per-task
    // one-off booking, so no separate owner alert per link.
    const book = t.bookable
      ? `<div style="padding-top:10px"><a href="${checklistUrl}?add=${encodeURIComponent(t.key)}" style="display:inline-block;background:${ORANGE};border-radius:8px;padding:9px 16px;font-family:${FF};font-size:13px;line-height:16px;mso-line-height-rule:exactly;font-weight:bold;color:#FFFFFF;text-decoration:none">Add to plan</a></div>`
      : '';
    // Top and bottom are independent: the first row tucks under the panel
    // heading, and the last row closes the panel out - unless a teaser row
    // follows, which keeps normal padding so the divider above it sits evenly.
    // A one-task panel is both, so neither edge can win over the other.
    const padTop = i === 0 ? '8px' : '14px';
    const padBottom = last && !remaining ? '22px' : '14px';
    return `<tr><td style="padding:${padTop} 22px ${padBottom} 22px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%">
          <tr>
            <td width="30" valign="top" style="width:30px;font-family:${FF};font-size:20px;line-height:26px;mso-line-height-rule:exactly;font-weight:bold;color:${ORANGE}">${String(i + 1).padStart(2, '0')}</td>
            <td valign="top" style="font-family:${FF};font-size:17px;line-height:24px;mso-line-height-rule:exactly;font-weight:bold;color:${INK}"><a href="${checklistUrl}" style="color:${INK};text-decoration:none">${esc(t.title)}</a><div style="padding-top:4px;font-family:${FF};font-size:14px;line-height:20px;mso-line-height-rule:exactly;font-weight:normal;color:${MUTED}">${meta}</div>${guide}${book}</td>
          </tr>
        </table>
      </td></tr>${
        last && !remaining
          ? ''
          : `<tr><td style="padding:0 22px"><div style="height:1px;background:${HAIRLINE};line-height:1px;font-size:1px">&nbsp;</div></td></tr>`
      }`;
  };

  /**
   * "+ N more on your fall list" - the last row inside the task panel. Sits
   * where a 4th task would, so it reads as the list continuing rather than an
   * ad, and it's the whole reason the season opener is now a teaser.
   */
  const teaserRow = remaining
    ? `<tr><td style="padding:14px 22px 20px 22px">
        <a href="${checklistUrl}" style="display:block;font-family:${FF};font-size:15px;line-height:22px;mso-line-height-rule:exactly;font-weight:bold;color:${ORANGE_DEEP};text-decoration:none">+ ${remaining} more ${jobWord(remaining)} on your ${seasonLower} list &rarr;</a>
        <div style="padding-top:3px;font-family:${FF};font-size:13px;line-height:19px;mso-line-height-rule:exactly;color:${MUTED}">Open your checklist to see the rest and tick them off as you go.</div>
      </td></tr>`
    : '';

  const heroBand = heroImageUrl
    ? `<tr><td class="px" style="padding:26px 40px 0 40px">
    <img src="${esc(heroImageUrl)}" width="520" alt="" style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:12px" />
  </td></tr>`
    : '';

  /**
   * The caught-up email keeps arriving monthly for the rest of the season -
   * a member who clears their fall list in September gets it again in October
   * and November - so the congratulation alone would wear out fast. This block
   * takes the task panel's slot, above the CTA like every other variant, and
   * gives each repeat something new to open: the work we've been doing, and
   * what we've written since. Both are index pages, so a send still needs no
   * extra fetch. Same panel treatment as the task list so it reads as part of
   * the email, not an ad bolted on.
   */
  const linkStyle = `font-family:${FF};font-size:15px;line-height:22px;mso-line-height-rule:exactly;font-weight:bold;color:${ORANGE_DEEP};text-decoration:none`;
  const keepInTouch = caughtUp
    ? `  <tr><td class="px" style="padding:26px 40px 0 40px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:${PANEL_BG};border:1px solid ${HAIRLINE};border-radius:12px">
      <tr><td style="padding:20px 22px 6px 22px;font-family:${FF};font-size:11px;line-height:16px;mso-line-height-rule:exactly;font-weight:bold;letter-spacing:0.12em;color:${MUTED};text-transform:uppercase">While you're ahead</td></tr>
      <tr><td style="padding:0 22px 20px 22px;font-family:${FF};font-size:15px;line-height:22px;mso-line-height-rule:exactly;color:${BODY}">
        Two things worth a look this month:
        <div style="padding-top:10px"><a href="${esc(portfolioUrl)}" style="${linkStyle}">See what we've been building &rarr;</a></div>
        <div style="padding-top:8px"><a href="${esc(blogUrl)}" style="${linkStyle}">Read our latest home guides &rarr;</a></div>
      </td></tr>
    </table>
  </td></tr>`
    : '';

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark" />
<style>
  body { margin:0; padding:0; background:${PAGE_BG}; -webkit-text-size-adjust:100%; }
  a { color:${ORANGE_DEEP}; }
  a:hover { color:${ORANGE}; }
  @media only screen and (max-width:620px) {
    .px { padding-left:24px !important; padding-right:24px !important; }
    .h1 { font-size:32px !important; line-height:1.15 !important; }
  }
</style>
</head>
<body>
<span style="display:none;font-size:1px;color:${PAGE_BG};max-height:0;max-width:0;opacity:0;overflow:hidden">${preheader}</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:${PAGE_BG};margin:0;padding:0">
<tr><td align="center" style="padding:24px 12px">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background:${CARD_BG};border-radius:12px;overflow:hidden;font-family:${FF}">

  <tr><td align="center" bgcolor="${NAVY}" style="background:${NAVY};padding:10px 16px;font-family:${FF};font-size:11px;line-height:16px;mso-line-height-rule:exactly;letter-spacing:0.08em;color:#C7D4E4;text-transform:uppercase">Licensed, Bonded, &amp; Insured &nbsp;|&nbsp; ${HIC}</td></tr>

  <tr><td class="px" style="padding:28px 40px 0 40px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%">
      <tr>
        <td align="left" valign="middle" width="44" style="width:44px;padding-right:10px"><img src="${LOGO}" width="40" height="40" alt="La Vaca General Contractors" style="display:block;width:40px;height:40px;border:0" /></td>
        <td align="left" valign="middle" style="font-family:${FF};font-size:17px;line-height:22px;mso-line-height-rule:exactly;font-weight:bold;color:${INK};letter-spacing:-0.01em">La Vaca<br /><span style="font-weight:normal;font-size:11px;letter-spacing:0.08em;color:${MUTED};text-transform:uppercase">General Contractors</span></td>
        <td align="right" valign="middle" style="font-family:${FF};font-size:11px;line-height:22px;mso-line-height-rule:exactly;letter-spacing:0.1em;color:${MUTED};text-transform:uppercase">Home Care</td>
      </tr>
    </table>
  </td></tr>

  <tr><td class="px" style="padding:26px 40px 0 40px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate">
      <tr><td bgcolor="${PILL_BG}" style="background:${PILL_BG};border-radius:9999px;padding:8px 16px;font-family:${FF};font-size:11px;line-height:14px;mso-line-height-rule:exactly;font-weight:bold;letter-spacing:0.12em;color:${ORANGE_DEEP};text-transform:uppercase">${pillParts.join(' &nbsp;&middot;&nbsp; ')}</td></tr>
    </table>
  </td></tr>

  <tr><td class="px" style="padding:18px 40px 0 40px">
    <h1 class="h1" style="margin:0;font-family:${FF};font-size:38px;line-height:42px;mso-line-height-rule:exactly;font-weight:bold;letter-spacing:-0.02em;color:${INK}">${headlineTop}<br /><span style="color:${ORANGE}">${headlineAccent}</span></h1>
  </td></tr>

  <tr><td class="px" style="padding:16px 40px 0 40px;font-family:${FF};font-size:17px;line-height:26px;mso-line-height-rule:exactly;color:${BODY}"><div style="font-weight:bold;color:${INK}">${hi}</div><div style="padding-top:6px">${copy.intro(true)}</div></td></tr>
${heroBand}
${
  caughtUp
    ? ''
    : `  <tr><td class="px" style="padding:26px 40px 0 40px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:${PANEL_BG};border:1px solid ${HAIRLINE};border-radius:12px">
      <tr><td style="padding:20px 22px 6px 22px;font-family:${FF};font-size:11px;line-height:16px;mso-line-height-rule:exactly;font-weight:bold;letter-spacing:0.12em;color:${MUTED};text-transform:uppercase">${panelHeading}</td></tr>
${list.map((t, i) => row(t, i, i === list.length - 1)).join('\n')}
${teaserRow}
    </table>
  </td></tr>`
}
${keepInTouch}

  <tr><td class="px" align="center" style="padding:28px 40px 0 40px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto">
      <tr><td align="center" bgcolor="${ORANGE}" style="background:${ORANGE};border-radius:12px;padding:17px 34px">
        <a href="${checklistUrl}" style="display:block;font-family:${FF};font-size:17px;line-height:20px;mso-line-height-rule:exactly;font-weight:bold;color:#FFFFFF;text-decoration:none;letter-spacing:-0.01em">${ctaLabel}</a>
      </td></tr>
    </table>
  </td></tr>

  <tr><td class="px" align="center" style="padding:12px 40px 0 40px;font-family:${FF};font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:${MUTED}">Free &nbsp;&middot;&nbsp; No account &nbsp;&middot;&nbsp; Nothing to download</td></tr>

  <tr><td class="px" style="padding:26px 40px 0 40px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:${NAVY};border-radius:12px">
      <tr><td style="padding:22px 24px;font-family:${FF};font-size:16px;line-height:24px;mso-line-height-rule:exactly;color:#E8EEF6">
        <strong style="color:#FFFFFF">Rather we handled it?</strong> One call and we'll put it on the schedule.
        <div style="padding-top:12px"><a href="tel:+12012124917" style="font-family:${FF};font-size:18px;line-height:24px;mso-line-height-rule:exactly;font-weight:bold;color:#F2B273;text-decoration:none">Call ${PHONE} &rarr;</a></div>
        <div style="padding-top:6px;font-size:13px;line-height:18px;mso-line-height-rule:exactly;color:#9FB4CC">24-hour response guaranteed</div>
      </td></tr>
    </table>
  </td></tr>

  <tr><td class="px" style="padding:20px 40px 0 40px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:${PANEL_BG};border-radius:12px">
      <tr><td align="center" style="padding:14px 18px;font-family:${FF};font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:${MUTED}">Know someone who&rsquo;d want this? Forward this email - they can get their own free plan at <a href="${baseUrl}/home-care?utm_source=member_share&amp;utm_medium=email&amp;utm_campaign=home_care_share" style="color:${ORANGE_DEEP};font-weight:bold;text-decoration:none">lavacagc.com/home-care</a>.</td></tr>
    </table>
  </td></tr>

  <tr><td class="px" style="padding:30px 40px 34px 40px">
    <div style="height:1px;background:${HAIRLINE};line-height:1px;font-size:1px">&nbsp;</div>
    <div style="padding-top:18px;font-family:${FF};font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:${MUTED}">
      - The La Vaca Team<br />
      ${BUSINESS_ADDRESS} &nbsp;&middot;&nbsp; <a href="tel:+12012124917" style="color:${ORANGE_DEEP};text-decoration:none">${PHONE}</a><br />
      <span style="color:#8A8A8A">You're getting this because you're enrolled in La Vaca Home Care. ${preferencesUrl ? `<a href="${preferencesUrl}" style="color:#8A8A8A;text-decoration:underline">Manage email preferences</a> &nbsp;&middot;&nbsp; ` : ''}<a href="${unsubscribeUrl}" style="color:#8A8A8A;text-decoration:underline">Unsubscribe</a>.</span>
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  const plainMeta = (t: NewsletterTask) => {
    const cost = costLabel(t).replace(/&ndash;/g, '-');
    return [badgeFor(t), cost, t.blurb].filter(Boolean).join(' · ');
  };

  let text = `${hi}\n\n${copy.intro(false)}\n\n`;
  if (!caughtUp) {
    text += `${panelHeading.toUpperCase()}\n\n`;
    list.forEach((t, i) => {
      text += `${String(i + 1).padStart(2, '0')}. ${t.title}\n    ${plainMeta(t)}\n`;
      if (t.bookable) text += `    Add to your plan: ${checklistUrl}?add=${t.key}\n`;
    });
    if (remaining) {
      text += `\n+ ${remaining} more ${jobWord(remaining)} on your ${seasonLower} list. Open your checklist to see the rest: ${checklistUrl}\n`;
    }
  } else {
    text += `WHILE YOU'RE AHEAD\n\nTwo things worth a look this month:\n- See what we've been building: ${portfolioUrl}\n- Read our latest home guides: ${blogUrl}\n`;
  }
  text += `\n${ctaLabel}: ${checklistUrl}\nFree · No account · Nothing to download\n\nRather we handled it? Call ${PHONE} - 24-hour response guaranteed.\n\nKnow someone who'd want this? They can get their own free plan: ${baseUrl}/home-care\n\n- The La Vaca Team\nLa Vaca General Contractors · ${BUSINESS_ADDRESS} · ${PHONE} · ${HIC}\n`;
  if (preferencesUrl) text += `Manage email preferences: ${preferencesUrl}\n`;
  text += `Unsubscribe: ${unsubscribeUrl}`;

  return { subject, html, text };
}
