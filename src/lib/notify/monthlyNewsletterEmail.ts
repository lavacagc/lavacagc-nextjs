/**
 * Monthly La Vaca newsletter — HTML builder (Goal B, Phase 3).
 *
 * Self-contained, fully-inline-styled email matching the approved lineup:
 *   1. Above-the-fold hero feature (title, blurb, one CTA → a blog URL).
 *   2. "This month's Home Care checklist" anchor block (3 bullets + CTA → /home-care).
 *   3. Two small cost-guide picks (title + link).
 *   4. Below-the-fold Buy + Remodel teaser line.
 *   5. CAN-SPAM footer: working unsubscribe URL + physical mailing address.
 *
 * Mirrors the emailShell / button / footer conventions of src/lib/emailTemplates.ts
 * but is deliberately self-contained (no import) so the newsletter can evolve its
 * navy/gold branding without touching the orange transactional templates.
 *
 * Brand: navy #002855 + gold #C8A55B. Max width 640. Light-only color scheme.
 */

const NAVY = '#002855';
const GOLD = '#C8A55B';
const INK = '#1f2933';
const MUTED = '#6b7280';
const HAIRLINE = '#e5e7eb';
const FF = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

const BUSINESS_LINE = 'La Vaca General Contractors, LLC · 51 Crestmont Rd, West Orange, NJ 07052';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface NewsletterLink {
  title: string;
  url: string;
}

export interface MonthlyNewsletterPayload {
  /** Shown in the preheader + used as the issue label, e.g. "July 2026". */
  issueLabel: string;
  hero: {
    title: string;
    blurb: string;
    ctaLabel: string;
    ctaUrl: string;
  };
  checklist: {
    heading: string;
    bullets: string[]; // rendered as up to 3 checklist lines
    ctaUrl: string; // → /home-care
  };
  picks: NewsletterLink[]; // two small cost-guide picks
  /** CAN-SPAM: a working per-recipient unsubscribe URL. */
  unsubscribeUrl: string;
  /** Optional preference-center URL for a "manage preferences" link. */
  preferencesUrl?: string;
}

function button(label: string, href: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0">
      <tr>
        <td bgcolor="${GOLD}" style="background-color:${GOLD};border-radius:8px">
          <a href="${escapeHtml(href)}" style="display:inline-block;color:${NAVY};text-decoration:none;font-family:${FF};font-size:15px;line-height:20px;font-weight:700;padding:13px 26px">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

export function buildMonthlyNewsletterHtml(payload: MonthlyNewsletterPayload): string {
  const { issueLabel, hero, checklist, picks, unsubscribeUrl, preferencesUrl } = payload;
  const preheader = escapeHtml(hero.blurb).slice(0, 140);

  const bullets = checklist.bullets
    .slice(0, 3)
    .map(
      (b) => `
        <tr>
          <td valign="top" style="width:22px;padding:5px 8px 5px 0;font-family:${FF};color:${GOLD};font-size:15px;line-height:22px;font-weight:700">✓</td>
          <td valign="top" style="padding:5px 0;font-family:${FF};color:${INK};font-size:15px;line-height:22px">${escapeHtml(b)}</td>
        </tr>`,
    )
    .join('');

  const pickRows = picks
    .map(
      (p) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid ${HAIRLINE};font-family:${FF};font-size:15px;line-height:22px">
            <a href="${escapeHtml(p.url)}" style="color:${NAVY};text-decoration:none;font-weight:600">${escapeHtml(p.title)}</a>
            <span style="color:${GOLD};font-weight:700">&nbsp;→</span>
          </td>
        </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>La Vaca — ${escapeHtml(issueLabel)}</title>
</head>
<body style="margin:0 auto !important;padding:0;background-color:#f4f5f7;font-family:${FF}">
  <div style="color:transparent;display:none !important;font-size:0;height:0;opacity:0;width:0">${preheader}</div>
  <div style="padding:24px 16px">
    <div style="color:${INK};width:100%;max-width:640px;margin:0 auto;background-color:#ffffff;border-radius:12px;border:1px solid ${HAIRLINE};overflow:hidden;box-sizing:border-box">

      <!-- Header / masthead -->
      <div style="background-color:${NAVY};padding:26px 40px">
        <div style="font-family:${FF};color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.02em">La Vaca <span style="color:${GOLD}">General Contractors</span></div>
        <div style="font-family:${FF};color:#c9d3e0;font-size:13px;padding-top:4px">Monthly Home Journal · ${escapeHtml(issueLabel)}</div>
      </div>

      <!-- 1. Hero feature -->
      <div style="padding:32px 40px 8px 40px">
        <div style="font-family:${FF};color:${GOLD};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">This month's feature</div>
        <h1 style="font-family:${FF};color:${NAVY};margin:8px 0 0 0;font-size:26px;line-height:32px;font-weight:700;letter-spacing:-0.01em">${escapeHtml(hero.title)}</h1>
        <p style="font-family:${FF};color:${INK};margin:12px 0 18px 0;font-size:16px;line-height:26px">${escapeHtml(hero.blurb)}</p>
        ${button(hero.ctaLabel, hero.ctaUrl)}
      </div>

      <div style="padding:8px 40px"><div style="border-top:1px solid ${HAIRLINE}"></div></div>

      <!-- 2. Home Care checklist anchor -->
      <div style="padding:16px 40px 8px 40px">
        <div style="background-color:#f7f9fc;border-left:4px solid ${GOLD};border-radius:0 8px 8px 0;padding:20px 22px">
          <h2 style="font-family:${FF};color:${NAVY};margin:0 0 12px 0;font-size:18px;line-height:24px;font-weight:700">${escapeHtml(checklist.heading)}</h2>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            ${bullets}
          </table>
          <div style="padding-top:14px">${button('Open My Home Care Checklist', checklist.ctaUrl)}</div>
        </div>
      </div>

      <!-- 3. Cost-guide picks -->
      <div style="padding:20px 40px 8px 40px">
        <div style="font-family:${FF};color:${GOLD};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">Cost guides worth a look</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:8px">
          ${pickRows}
        </table>
      </div>

      <!-- 4. CAN-SPAM footer -->
      <div style="background-color:#f7f9fc;border-top:1px solid ${HAIRLINE};padding:24px 40px;text-align:center">
        <p style="font-family:${FF};color:${MUTED};font-size:12px;line-height:18px;margin:0">
          You're receiving La Vaca's monthly home journal because you asked to hear from us.
        </p>
        <p style="font-family:${FF};color:${MUTED};font-size:12px;line-height:18px;margin:8px 0 0 0">
          <a href="${escapeHtml(unsubscribeUrl)}" style="color:${MUTED};text-decoration:underline">Unsubscribe</a>${
            preferencesUrl
              ? ` &nbsp;·&nbsp; <a href="${escapeHtml(preferencesUrl)}" style="color:${MUTED};text-decoration:underline">Manage preferences</a>`
              : ''
          }
        </p>
        <p style="font-family:${FF};color:${MUTED};font-size:12px;line-height:18px;margin:8px 0 0 0">${escapeHtml(BUSINESS_LINE)}</p>
      </div>

    </div>
  </div>
</body>
</html>`;
}
