/**
 * La Vaca Home Care — release-notes email builder (R1).
 *
 * Pure function: takes the queued feature_releases rows and produces the
 * branded "what's new" email. Sending happens only from the admin
 * /api/admin/releases/send route — never automatically.
 */

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

const PHONE = '(201) 212-4917';
const HIC = 'NJ HIC# 13VH13373800';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function buildReleaseEmail(args: ReleaseEmailArgs): { subject: string; html: string; text: string } {
  const { firstName, features, baseUrl, unsubscribeUrl, preferencesUrl, assetVersion } = args;
  const n = features.length;
  const subject = n === 1
    ? `New in your Home Care portal: ${features[0].headline}`
    : `${n} new things in your Home Care portal`;
  const portalUrl = `${baseUrl}/home-care/checklist?utm_source=release_email&utm_medium=email&utm_campaign=home_care_release`;

  const featureBlock = (f: ReleaseFeature) => `
    <table width="100%" style="border-collapse:collapse;margin:0 0 26px"><tr><td style="border:1px solid #e6e9ef;border-radius:12px;padding:20px 22px">
      ${f.screenshot_path ? `<img src="${baseUrl}${esc(f.screenshot_path)}${assetVersion ? `?v=${encodeURIComponent(assetVersion)}` : ''}" alt="${esc(f.headline)}" width="100%" style="display:block;width:100%;height:auto;border-radius:8px;border:1px solid #e6e9ef;margin-bottom:14px">` : ''}
      <div style="font-size:17px;font-weight:800;color:#002855">${esc(f.headline)}</div>
      <div style="font-size:14px;color:#5b6b82;margin-top:4px;line-height:1.5">${esc(f.subhead)}</div>
      <div style="font-size:13px;color:#002855;margin-top:10px;line-height:1.5"><span style="font-weight:800;color:#EE9639">Why it matters:</span> ${esc(f.benefit)}</div>
    </td></tr></table>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef0ea;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px">
    <!-- Branded header -->
    <div style="background:#002855;border-radius:14px 14px 0 0;padding:20px 24px">
      <table style="border-collapse:collapse"><tr>
        <td style="padding-right:12px"><img src="${baseUrl}/logo.png" width="42" height="42" alt="La Vaca" style="display:block;border-radius:9px;background:#ffffff"></td>
        <td>
          <div style="color:#FFCB8E;font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase">What's new</div>
          <div style="color:#ffffff;font-size:17px;font-weight:800">La Vaca Home Care</div>
        </td>
      </tr></table>
    </div>
    <div style="background:#ffffff;border-radius:0 0 14px 14px;padding:26px 24px">
      <p style="font-size:15px;color:#0c1730;margin:0 0 6px">${firstName ? `Hi ${esc(firstName)},` : 'Hi there,'}</p>
      <p style="font-size:14px;color:#5b6b82;margin:0 0 22px;line-height:1.55">We've been building. Here's what's new in your (still 100% free) Home Care portal:</p>

      ${features.map(featureBlock).join('')}

      <div style="text-align:center;margin:4px 0 8px">
        <a href="${portalUrl}" style="display:inline-block;background:linear-gradient(135deg,#EE9639,#FF6F31);color:#fff;font-weight:800;text-decoration:none;padding:13px 26px;border-radius:10px;font-size:15px">Open my checklist →</a>
        <div style="margin-top:10px;font-size:12px"><a href="${baseUrl}/home-care/whats-new?utm_source=release_email&amp;utm_medium=email&amp;utm_campaign=home_care_release" style="color:#5b6b82;text-decoration:underline">Browse every update we've shipped</a></div>
      </div>

      <!-- Share line -->
      <div style="background:#f4f6f9;border-radius:10px;padding:12px 16px;margin-top:18px;font-size:13px;color:#5b6b82;text-align:center">
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

  let text = `${firstName ? `Hi ${firstName},` : 'Hi there,'}\n\nHere's what's new in your (still 100% free) Home Care portal:\n\n`;
  for (const f of features) {
    text += `* ${f.headline}\n  ${f.subhead}\n  Why it matters: ${f.benefit}\n\n`;
  }
  text += `Open your checklist: ${portalUrl}\n\nKnow someone who'd want this? They can get their own free plan: ${baseUrl}/home-care\n\nLa Vaca General Contractors · ${PHONE} · ${HIC}\n`;
  if (preferencesUrl) text += `Manage email preferences: ${preferencesUrl}\n`;
  text += `Unsubscribe: ${unsubscribeUrl}`;

  return { subject, html, text };
}
