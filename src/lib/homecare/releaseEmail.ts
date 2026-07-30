/**
 * La Vaca Home Care — release-notes email builder (R1).
 *
 * Pure function: takes the queued feature_releases rows and produces the
 * branded "what's new" email. Sending happens only from the admin
 * /api/admin/releases/send route — never automatically.
 */

import {
  homeCareEmailShell, licenceBar, brandRow, pill, headline, intro, cta, panel, footer,
  textFooter, esc, FF, INK, BODY, MUTED, HAIRLINE, PANEL_BG, ORANGE_DEEP,
} from './emailShell';

export interface ReleaseFeature {
  headline: string;
  subhead: string;
  benefit: string;
  screenshot_path: string | null;
}

export interface ReleaseEmailArgs {
  firstName: string | null;
  features: ReleaseFeature[];
  /** Absolute site origin for links + screenshot URLs (e.g. https://www.lavacagc.com). */
  baseUrl: string;
  unsubscribeUrl: string;
  preferencesUrl?: string;
  /**
   * Cache-busting token appended to screenshot URLs (?v=...). Cloudflare
   * caches error responses for image paths, so a screenshot fetched before
   * its deploy landed can keep 404ing from cache long after the file is live
   * (2026-07-03 release email). A per-send version gives every edition a
   * fresh cache key that goes straight to origin.
   */
  assetVersion?: string;
}



export function buildReleaseEmail(args: ReleaseEmailArgs): { subject: string; html: string; text: string } {
  const { firstName, features, baseUrl, unsubscribeUrl, preferencesUrl, assetVersion } = args;
  const n = features.length;
  const subject = n === 1
    ? `New in your Home Care portal: ${features[0].headline}`
    : `${n} new things in your Home Care portal`;
  const portalUrl = `${baseUrl}/home-care/checklist?utm_source=release_email&utm_medium=email&utm_campaign=home_care_release`;

  const featureBlock = (f: ReleaseFeature) => `
    <table role="presentation" width="100%" style="width:100%;border-collapse:collapse;margin:0 0 16px"><tr><td style="border:1px solid ${HAIRLINE};background:${PANEL_BG};border-radius:12px;padding:18px 20px">
      ${f.screenshot_path ? `<img src="${baseUrl}${esc(f.screenshot_path)}${assetVersion ? `?v=${encodeURIComponent(assetVersion)}` : ''}" alt="${esc(f.headline)}" width="100%" style="display:block;width:100%;height:auto;border-radius:8px;border:1px solid ${HAIRLINE};margin-bottom:14px">` : ''}
      <div style="font-family:${FF};font-size:17px;line-height:24px;mso-line-height-rule:exactly;font-weight:bold;color:${INK}">${esc(f.headline)}</div>
      <div style="font-family:${FF};font-size:14px;line-height:20px;mso-line-height-rule:exactly;color:${MUTED};padding-top:4px">${esc(f.subhead)}</div>
      <div style="font-family:${FF};font-size:13px;line-height:19px;mso-line-height-rule:exactly;color:${BODY};padding-top:10px"><span style="font-weight:bold;color:${ORANGE_DEEP}">Why it matters:</span> ${esc(f.benefit)}</div>
    </td></tr></table>`;

  const rows = [
    licenceBar(),
    brandRow(),
    pill([firstName ? `${esc(firstName)}'s Home Care` : 'La Vaca Home Care', "What's new"]),
    headline(n === 1 ? 'One new thing' : `${n} new things`, 'in your portal.'),
    intro(
      firstName ? `Hi ${esc(firstName)},` : 'Hi there,',
      `We've been building. Here's what's new in your (still 100% free) Home Care portal.`,
    ),
    `  <tr><td class="px" style="padding:26px 40px 0 40px">${features.map(featureBlock).join('')}</td></tr>`,
    cta('Open my checklist', portalUrl,
      `<a href="${baseUrl}/home-care/whats-new?utm_source=release_email&amp;utm_medium=email&amp;utm_campaign=home_care_release" style="color:${MUTED};text-decoration:underline">Browse every update we've shipped</a>`),
    panel(`Know someone who&rsquo;d want this? Forward this email - they can get their own free plan at <a href="${baseUrl}/home-care?utm_source=member_share&amp;utm_medium=email&amp;utm_campaign=home_care_share" style="color:${ORANGE_DEEP};font-weight:bold;text-decoration:none">lavacagc.com/home-care</a>.`),
    footer({
      reason: `You're receiving this because you joined La Vaca Home Care.`,
      unsubscribeUrl,
      preferencesUrl,
    }),
  ].join('\n');

  const html = homeCareEmailShell({
    preheader: n === 1
      ? `New in your Home Care portal: ${features[0].headline}`
      : `${n} new things just landed in your Home Care portal.`,
    rows,
  });

  let text = `${firstName ? `Hi ${firstName},` : 'Hi there,'}\n\nHere's what's new in your (still 100% free) Home Care portal:\n\n`;
  for (const f of features) {
    text += `* ${f.headline}\n  ${f.subhead}\n  Why it matters: ${f.benefit}\n\n`;
  }
  text += `Open your checklist: ${portalUrl}\n\nKnow someone who'd want this? They can get their own free plan: ${baseUrl}/home-care\n`;
  text += textFooter(`You're receiving this because you joined La Vaca Home Care.`, unsubscribeUrl, preferencesUrl);

  return { subject, html, text };
}
