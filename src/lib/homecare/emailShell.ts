/**
 * La Vaca Home Care - shared email chrome (pure, testable).
 *
 * Home Care had three customer emails running two design systems: the monthly
 * newsletter used the redesigned comp (cream page, 600px card, navy licence
 * bar, brand row, season pill, two-tone headline, navy call block, CAN-SPAM
 * postal address) while the verification, welcome and release-notes emails
 * still used an older 560px shell with a different header and NO postal
 * address. A member could receive three emails in a week that looked like
 * three different companies.
 *
 * This module owns the chrome so there is one place to change branding. The
 * per-email content stays with the email; only the frame lives here.
 *
 * NOTE ON `buildNewsletter`: it still renders its own copy of this chrome.
 * That is deliberate and temporary - the newsletter shipped to production on
 * 2026-07-29 and its first send under the new design is 2026-08-01, so it is
 * not being refactored days before that run. `tests/home-care-email-shell.spec.ts`
 * pins the newsletter's chrome against this module so the two cannot drift
 * while they coexist; converging `buildNewsletter` onto `homeCareEmailShell`
 * is a follow-up for after the August send.
 */

export const LOGO = 'https://www.lavacagc.com/logo.png';
export const PHONE = '(201) 212-4917';
export const HIC = 'HIC# 13VH13373800';
/** CAN-SPAM requires a valid physical postal address in commercial email. */
export const BUSINESS_ADDRESS = '51 Crestmont Rd, West Orange, NJ 07052';

export const FF = `Arial,Helvetica,sans-serif`;
export const PAGE_BG = '#EFEBE6';
export const CARD_BG = '#FCFCFC';
export const NAVY = '#002855';
export const ORANGE = '#EE9639';
export const ORANGE_DEEP = '#D97D1A';
export const PILL_BG = '#FBEEDF';
export const INK = '#1A1A1A';
export const BODY = '#303030';
export const MUTED = '#666666';
export const HAIRLINE = '#E2E8F0';
export const PANEL_BG = '#FBFAF8';

/** Escape user/catalog text for safe, artifact-free HTML. */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const DOT = ' &nbsp;&middot;&nbsp; ';

/* ── chrome pieces (each independently reusable + assertable) ─────────────── */

/** Navy top bar. Every Home Care email opens with the licence line. */
export function licenceBar(): string {
  return `  <tr><td align="center" bgcolor="${NAVY}" style="background:${NAVY};padding:10px 16px;font-family:${FF};font-size:11px;line-height:16px;mso-line-height-rule:exactly;letter-spacing:0.08em;color:#C7D4E4;text-transform:uppercase">Licensed, Bonded, &amp; Insured &nbsp;|&nbsp; ${HIC}</td></tr>`;
}

/** Logo + wordmark, with a right-hand program label. */
export function brandRow(rightLabel = 'Home Care'): string {
  return `  <tr><td class="px" style="padding:28px 40px 0 40px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%">
      <tr>
        <td align="left" valign="middle" width="44" style="width:44px;padding-right:10px"><img src="${LOGO}" width="40" height="40" alt="La Vaca General Contractors" style="display:block;width:40px;height:40px;border:0" /></td>
        <td align="left" valign="middle" style="font-family:${FF};font-size:17px;line-height:22px;mso-line-height-rule:exactly;font-weight:bold;color:${INK};letter-spacing:-0.01em">La Vaca<br /><span style="font-weight:normal;font-size:11px;letter-spacing:0.08em;color:${MUTED};text-transform:uppercase">General Contractors</span></td>
        <td align="right" valign="middle" style="font-family:${FF};font-size:11px;line-height:22px;mso-line-height-rule:exactly;letter-spacing:0.1em;color:${MUTED};text-transform:uppercase">${esc(rightLabel)}</td>
      </tr>
    </table>
  </td></tr>`;
}

/** Rounded context pill, e.g. "Danielle's Home Care · August 2026 · Summer". */
export function pill(segments: string[]): string {
  if (segments.length === 0) return '';
  return `  <tr><td class="px" style="padding:26px 40px 0 40px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate">
      <tr><td bgcolor="${PILL_BG}" style="background:${PILL_BG};border-radius:9999px;padding:8px 16px;font-family:${FF};font-size:11px;line-height:14px;mso-line-height-rule:exactly;font-weight:bold;letter-spacing:0.12em;color:${ORANGE_DEEP};text-transform:uppercase">${segments.join(DOT)}</td></tr>
    </table>
  </td></tr>`;
}

/** Oversized two-tone headline: dark first line, orange accent line. */
export function headline(top: string, accent?: string): string {
  return `  <tr><td class="px" style="padding:18px 40px 0 40px">
    <h1 class="h1" style="margin:0;font-family:${FF};font-size:38px;line-height:42px;mso-line-height-rule:exactly;font-weight:bold;letter-spacing:-0.02em;color:${INK}">${top}${accent ? `<br /><span style="color:${ORANGE}">${accent}</span>` : ''}</h1>
  </td></tr>`;
}

/** Bold greeting line + body paragraph. `body` is trusted HTML from the caller. */
export function intro(greeting: string, body: string): string {
  return `  <tr><td class="px" style="padding:16px 40px 0 40px;font-family:${FF};font-size:17px;line-height:26px;mso-line-height-rule:exactly;color:${BODY}"><div style="font-weight:bold;color:${INK}">${greeting}</div><div style="padding-top:6px">${body}</div></td></tr>`;
}

/** Full-width hosted photo band. Omitted entirely when no URL is given. */
export function heroBand(url?: string): string {
  if (!url) return '';
  return `  <tr><td class="px" style="padding:26px 40px 0 40px">
    <img src="${esc(url)}" width="520" alt="" style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:12px" />
  </td></tr>`;
}

/**
 * Primary orange call-to-action button, with optional reassurance line under it.
 *
 * `url` is escaped for the attribute it sits in, the same as the label beside
 * it. The portal links this renders carry `?token=...&to=...&utm_*`, and a raw
 * `&` in an href is one parameter name away from an HTML5 legacy named
 * reference a mail client resolves silently - an email-only broken link with
 * nothing failing anywhere it would be seen.
 */
export function cta(label: string, url: string, subtext?: string): string {
  return `  <tr><td class="px" align="center" style="padding:28px 40px 0 40px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto">
      <tr><td align="center" bgcolor="${ORANGE}" style="background:${ORANGE};border-radius:12px;padding:17px 34px">
        <a href="${esc(url)}" style="display:block;font-family:${FF};font-size:17px;line-height:20px;mso-line-height-rule:exactly;font-weight:bold;color:#FFFFFF;text-decoration:none;letter-spacing:-0.01em">${esc(label)}</a>
      </td></tr>
    </table>
  </td></tr>${
    subtext
      ? `\n  <tr><td class="px" align="center" style="padding:12px 40px 0 40px;font-family:${FF};font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:${MUTED}">${subtext}</td></tr>`
      : ''
  }`;
}

/** Navy "rather we handled it?" block with the phone number. */
export function callBlock(
  title = 'Rather we handled it?',
  body = `One call and we'll put it on the schedule.`,
  note = '24-hour response guaranteed',
): string {
  return `  <tr><td class="px" style="padding:26px 40px 0 40px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:${NAVY};border-radius:12px">
      <tr><td style="padding:22px 24px;font-family:${FF};font-size:16px;line-height:24px;mso-line-height-rule:exactly;color:#E8EEF6">
        <strong style="color:#FFFFFF">${esc(title)}</strong> ${body}
        <div style="padding-top:12px"><a href="tel:+12012124917" style="font-family:${FF};font-size:18px;line-height:24px;mso-line-height-rule:exactly;font-weight:bold;color:#F2B273;text-decoration:none">Call ${PHONE} &rarr;</a></div>
        <div style="padding-top:6px;font-size:13px;line-height:18px;mso-line-height-rule:exactly;color:#9FB4CC">${esc(note)}</div>
      </td></tr>
    </table>
  </td></tr>`;
}

/** Soft panel, used for the member-share line and similar asides. */
export function panel(innerHtml: string): string {
  return `  <tr><td class="px" style="padding:20px 40px 0 40px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:${PANEL_BG};border-radius:12px">
      <tr><td align="center" style="padding:14px 18px;font-family:${FF};font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:${MUTED}">${innerHtml}</td></tr>
    </table>
  </td></tr>`;
}

export interface FooterArgs {
  /** "You're getting this because ..." - why this person received the email. */
  reason: string;
  unsubscribeUrl: string;
  preferencesUrl?: string;
}

/**
 * Sign-off + postal address + opt-out. The postal address is not optional:
 * CAN-SPAM requires it and the pre-existing Home Care shell omitted it.
 */
export function footer({ reason, unsubscribeUrl, preferencesUrl }: FooterArgs): string {
  return `  <tr><td class="px" style="padding:30px 40px 34px 40px">
    <div style="height:1px;background:${HAIRLINE};line-height:1px;font-size:1px">&nbsp;</div>
    <div style="padding-top:18px;font-family:${FF};font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:${MUTED}">
      - The La Vaca Team<br />
      ${BUSINESS_ADDRESS} &nbsp;&middot;&nbsp; <a href="tel:+12012124917" style="color:${ORANGE_DEEP};text-decoration:none">${PHONE}</a><br />
      <span style="color:#8A8A8A">${reason} ${preferencesUrl ? `<a href="${preferencesUrl}" style="color:#8A8A8A;text-decoration:underline">Manage email preferences</a> &nbsp;&middot;&nbsp; ` : ''}<a href="${unsubscribeUrl}" style="color:#8A8A8A;text-decoration:underline">Unsubscribe</a>.</span>
    </div>
  </td></tr>`;
}

export interface ShellArgs {
  /** Hidden preheader - the grey line inboxes show beside the subject. */
  preheader: string;
  /** Everything between the licence bar and the closing tags. */
  rows: string;
}

/** Wraps assembled rows in the page + 600px card, with the mobile rules. */
export function homeCareEmailShell({ preheader, rows }: ShellArgs): string {
  return `<!DOCTYPE html>
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

${rows}

</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Shared plain-text sign-off so the text parts stay consistent too. */
export function textFooter(reason: string, unsubscribeUrl: string, preferencesUrl?: string): string {
  let t = `\n- The La Vaca Team\nLa Vaca General Contractors · ${BUSINESS_ADDRESS} · ${PHONE} · ${HIC}\n${reason}\n`;
  if (preferencesUrl) t += `Manage email preferences: ${preferencesUrl}\n`;
  t += `Unsubscribe: ${unsubscribeUrl}`;
  return t;
}
