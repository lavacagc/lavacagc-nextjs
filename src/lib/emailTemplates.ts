/**
 * La Vaca General Contractors — HTML Email Templates
 * Inspired by Airbnb's clean email design. Fully inline styles for email client compatibility.
 */

const LOGO_URL = 'https://www.lavacagc.com/logo.png';
const BRAND_COLOR = '#ea580c'; // La Vaca orange
const REVIEW_LINK = 'https://g.page/r/CflitSa4DKHAEBM/review';
const WEBSITE_URL = 'https://www.lavacagc.com';
const PHONE = '(201) 212-4917';
const EMAIL = 'info@lavacagc.com';
const FACEBOOK_URL = 'https://www.facebook.com/p/La-Vaca-General-Contractor-61563600601660/';
const INSTAGRAM_URL = 'https://www.instagram.com/lavacagc/';
const LICENSE = 'HIC# 13VH13373800';

function emailShell(content: string, previewText: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>La Vaca General Contractors</title>
  <style type="text/css">
    body { margin: 0 auto !important; padding: 0; background-color: #f7f7f7; }
    a { color: ${BRAND_COLOR}; }
    /* Mobile overrides — Apple Mail / Gmail respect @media; Outlook desktop ignores it (uses the default desktop padding above). */
    @media only screen and (max-width: 600px) {
      .lv-outer { padding: 8px 6px !important; }
      .lv-card { border-radius: 10px !important; }
      .lv-section { padding-left: 12px !important; padding-right: 12px !important; }
      .lv-section-tight { padding-left: 12px !important; padding-right: 12px !important; }
      .lv-block-pad { padding: 18px 14px !important; }
      .lv-h1 { font-size: 26px !important; line-height: 32px !important; padding-left: 12px !important; padding-right: 12px !important; }
      .lv-logo-wrap { padding-left: 12px !important; padding-right: 12px !important; }
      .lv-icon-cell { width: 28px !important; }
      .lv-bullet-text { font-size: 15px !important; line-height: 22px !important; }
    }
  </style>
</head>
<body style="margin:0 auto !important;padding:0;background-color:#f7f7f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="color:transparent;display:none !important;font-size:0;height:0;opacity:0;width:0">${previewText}</div>
  <div class="lv-outer" style="padding:24px 16px">
    <div class="lv-card" style="color:#222222;width:100%;max-width:640px;margin:0 auto;background-color:#ffffff;border-radius:12px;border:1px solid #dddddd;overflow:hidden;box-sizing:border-box">
      ${content}
      ${footer()}
    </div>
  </div>
</body>
</html>`;
}

function logo(): string {
  return `
    <div class="lv-logo-wrap" style="text-align:center;padding:32px 48px 0 48px">
      <a href="${WEBSITE_URL}" style="text-decoration:none">
        <img src="${LOGO_URL}" alt="La Vaca General Contractors" width="80" height="80" style="border:0;width:80px;height:80px;border-radius:12px" />
      </a>
    </div>`;
}

function heading(text: string): string {
  return `
    <div class="lv-section" style="text-align:center;padding:24px 48px 8px 48px">
      <h1 class="lv-h1" style="color:#222222;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;font-weight:700;font-size:32px;line-height:38px;letter-spacing:-0.02em">${text}</h1>
    </div>`;
}

function paragraph(text: string): string {
  return `
    <div style="padding:0 48px;text-align:center">
      <p style="color:#222222;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;font-weight:400;font-size:16px;line-height:26px;padding:8px 0">${text}</p>
    </div>`;
}

function paragraphLeft(text: string): string {
  return `
    <div style="padding:0 48px;text-align:left">
      <p style="color:#222222;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;font-weight:400;font-size:16px;line-height:26px;padding:8px 0">${text}</p>
    </div>`;
}

function button(text: string, href: string, filled = false): string {
  const bgStyle = filled
    ? `background-color:${BRAND_COLOR};color:#ffffff;border:none`
    : `background:none;color:#222222;border:1px solid #222222`;

  const textColor = filled ? '#ffffff' : '#222222';

  return `
    <div style="text-align:center;padding:24px 48px 32px 48px">
      <div style="display:inline-block;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-weight:500;${bgStyle}">
        <a href="${href}" style="color:${textColor};display:inline-block;text-decoration:none;font-size:16px;line-height:22px;text-align:center;font-weight:600;padding:14px 28px">
          ${text}
        </a>
      </div>
    </div>`;
}

function divider(): string {
  return `<div style="padding:0 48px"><div style="border-top:1px solid #dddddd"></div></div>`;
}

function spacer(height = 24): string {
  return `<div style="height:${height}px"></div>`;
}

function footer(): string {
  return `
    ${divider()}
    <div style="text-align:center;padding:32px 48px">
      <a href="${WEBSITE_URL}" style="text-decoration:none">
        <img src="${LOGO_URL}" alt="La Vaca" width="42" height="42" style="border:0;width:42px;height:42px;border-radius:8px" />
      </a>
      <p style="color:#222222;font-size:14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-weight:500;margin:0;line-height:20px;padding-top:12px">La Vaca General Contractors, LLC</p>
      <p style="color:#717171;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;line-height:20px;padding-top:4px">Licensed, Bonded &amp; Insured | ${LICENSE}</p>
      <p style="color:#717171;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;line-height:20px;padding-top:4px">Northern New Jersey</p>
      <div style="padding-top:16px">
        <a href="tel:2012124917" style="color:${BRAND_COLOR};font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;text-decoration:none;font-weight:500">${PHONE}</a>
        <span style="color:#dddddd;padding:0 8px">|</span>
        <a href="mailto:${EMAIL}" style="color:${BRAND_COLOR};font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;text-decoration:none;font-weight:500">${EMAIL}</a>
      </div>
      <div style="padding-top:16px">
        <a href="${FACEBOOK_URL}" style="text-decoration:none;padding:0 8px">
          <img alt="Facebook" src="https://cdn-icons-png.flaticon.com/512/733/733547.png" width="24" height="24" style="border:0;width:24px;height:24px;opacity:0.5" />
        </a>
        <a href="${INSTAGRAM_URL}" style="text-decoration:none;padding:0 8px">
          <img alt="Instagram" src="https://cdn-icons-png.flaticon.com/512/733/733558.png" width="24" height="24" style="border:0;width:24px;height:24px;opacity:0.5" />
        </a>
      </div>
      <p style="color:#717171;font-size:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;line-height:18px;padding-top:16px">
        <a href="${WEBSITE_URL}" style="color:#717171;text-decoration:underline">lavacagc.com</a>
      </p>
    </div>`;
}

// ==========================================
// FEEDBACK EMAILS (Review Requests)
// ==========================================

export function feedbackDay0Html(name: string): string {
  const firstName = name.split(' ')[0] || name;
  return emailShell(
    `${logo()}
     ${heading('How Was Your<br>Experience?')}
     ${paragraph(`Hi ${firstName}, thank you for choosing La Vaca General Contractors for your recent project! We hope you're enjoying the results.`)}
     ${paragraph('We\'d love to hear about your experience. Your honest feedback helps us continue delivering quality work to homeowners like you.')}
     ${paragraph('If you have a moment, it would mean the world to us:')}
     ${button('Leave a Google Review ★', REVIEW_LINK, true)}
     ${paragraph('<span style="color:#717171;font-size:14px">It only takes a couple of minutes, and it makes a huge difference for our small business.</span>')}
     ${spacer(16)}`,
    `Hi ${firstName}, we'd love to hear about your experience with La Vaca!`
  );
}

export function feedbackDay3Html(name: string): string {
  const firstName = name.split(' ')[0] || name;
  return emailShell(
    `${logo()}
     ${heading('Quick Follow-Up')}
     ${paragraph(`Hi ${firstName}, just following up on my previous email. We'd really appreciate hearing about your experience with La Vaca.`)}
     ${paragraph('If you have 2 minutes, leaving us a Google review would mean the world to us. Your feedback helps other homeowners make informed decisions when choosing a contractor.')}
     ${button('Leave a Google Review ★', REVIEW_LINK, true)}
     ${paragraph('<span style="color:#717171;font-size:14px">Thanks so much!</span>')}
     ${spacer(8)}
     ${paragraphLeft('Best,<br><strong>Alex &amp; The La Vaca Team</strong>')}
     ${spacer(16)}`,
    `Just following up — we'd love your feedback, ${firstName}`
  );
}

export function feedbackDay7Html(name: string): string {
  const firstName = name.split(' ')[0] || name;
  return emailShell(
    `${logo()}
     ${heading('Last Chance to<br>Share Your Thoughts')}
     ${paragraph(`Hi ${firstName}, this is our last note about this. We completely understand how busy life gets.`)}
     ${paragraph('If your experience with La Vaca was a positive one, we\'d be incredibly grateful for a quick Google review. Your support helps our small business grow and serve more homeowners in our community.')}
     ${button('Leave a Google Review ★', REVIEW_LINK, true)}
     ${spacer(8)}
     ${paragraphLeft('Thank you for choosing La Vaca!<br><br>Best regards,<br><strong>Alex</strong>')}
     ${spacer(16)}`,
    `Last chance to share your thoughts, ${firstName}`
  );
}

// ==========================================
// LEAD FOLLOW-UP EMAILS
// ==========================================

export function leadInstantAckHtml(name: string, projectType?: string): string {
  const firstName = name.split(' ')[0] || name;
  const projectMention = projectType ? ` about your ${projectType} project` : '';

  return emailShell(
    `${logo()}
     ${heading('Thanks for<br>Reaching Out!')}
     ${paragraph(`Hi ${firstName}, thank you for contacting La Vaca General Contractors${projectMention}! We're excited to learn more about what you have in mind.`)}
     ${paragraph('One of our team members will be reaching out to you shortly to discuss your project and schedule a free estimate at your convenience.')}
     ${spacer(8)}
     ${divider()}
     ${spacer(8)}
     <div style="padding:8px 48px;text-align:center">
       <p style="color:#222222;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;font-weight:600;font-size:15px;line-height:24px">In the meantime:</p>
     </div>
     <div style="padding:0 48px 8px 48px">
       <table cellpadding="0" role="presentation" style="border-collapse:collapse;width:100%;font-size:inherit" width="100%">
         <tr><td style="padding:6px 0"><a href="${WEBSITE_URL}/portfolio" style="color:${BRAND_COLOR};font-size:15px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;text-decoration:none;font-weight:500">→ Browse our portfolio</a></td></tr>
         <tr><td style="padding:6px 0"><a href="${WEBSITE_URL}/process" style="color:${BRAND_COLOR};font-size:15px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;text-decoration:none;font-weight:500">→ Learn about our process</a></td></tr>
         <tr><td style="padding:6px 0"><a href="tel:2012124917" style="color:${BRAND_COLOR};font-size:15px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;text-decoration:none;font-weight:500">→ Call us directly: ${PHONE}</a></td></tr>
       </table>
     </div>
     ${spacer(8)}
     ${paragraphLeft('We look forward to working with you!<br><br>Best regards,<br><strong>The La Vaca Team</strong>')}
     ${spacer(16)}`,
    `Thanks for reaching out, ${firstName}! We'll be in touch shortly.`
  );
}

export function lead24hHtml(name: string, projectType?: string): string {
  const firstName = name.split(' ')[0] || name;
  const projectMention = projectType ? ` about your ${projectType} project` : '';

  return emailShell(
    `${logo()}
     ${heading('Following Up on<br>Your Inquiry')}
     ${paragraph(`Hi ${firstName}, just wanted to follow up on your recent inquiry${projectMention}. We know choosing the right contractor is a big decision, and we're here to make the process as smooth as possible.`)}
     ${spacer(8)}
     <div style="padding:0 48px">
       <div style="background-color:#fef7f4;border-radius:12px;padding:24px;text-align:left">
         <p style="color:#222222;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;font-weight:600;font-size:15px;line-height:24px;padding-bottom:12px">Here's what makes La Vaca different:</p>
         <table cellpadding="0" role="presentation" style="border-collapse:collapse;width:100%" width="100%">
           <tr><td style="padding:4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#222">✓ &nbsp;Dedicated project manager for your project</td></tr>
           <tr><td style="padding:4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#222">✓ &nbsp;Transparent pricing with no hidden costs</td></tr>
           <tr><td style="padding:4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#222">✓ &nbsp;Warranty-backed craftsmanship</td></tr>
           <tr><td style="padding:4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#222">✓ &nbsp;5.0 Google Rating from homeowners like you</td></tr>
         </table>
       </div>
     </div>
     ${spacer(8)}
     ${paragraph('Would you like to schedule a free, no-obligation estimate?')}
     ${button('Schedule Your Free Estimate', `${WEBSITE_URL}/contact`, true)}
     ${paragraph(`<span style="color:#717171;font-size:14px">Or call us anytime at <a href="tel:2012124917" style="color:${BRAND_COLOR};text-decoration:none;font-weight:500">${PHONE}</a></span>`)}
     ${spacer(16)}`,
    `Following up on your home renovation inquiry, ${firstName}`
  );
}

export function lead48hHtml(name: string, projectType?: string): string {
  const firstName = name.split(' ')[0] || name;
  const projectMention = projectType ? ` about your ${projectType} project` : '';

  return emailShell(
    `${logo()}
     ${heading("Let's Make It<br>Happen")}
     ${paragraph(`Hi ${firstName}, we hope we're not being a bother! We just wanted to make sure you saw our previous messages${projectMention}.`)}
     ${spacer(8)}
     <div style="padding:0 48px">
       <div style="border-left:3px solid ${BRAND_COLOR};padding:16px 24px;background-color:#fafafa;border-radius:0 8px 8px 0">
         <p style="color:#222222;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;font-style:italic;font-size:15px;line-height:24px">"Unbelievably communicative and transparent... The final result is beyond anything we could have imagined."</p>
         <p style="color:#717171;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;font-size:14px;line-height:20px;padding-top:8px">— Gerrick K., Verified Client</p>
       </div>
     </div>
     ${spacer(8)}
     ${paragraph('If you\'re still exploring options, we\'d be happy to provide a free estimate and answer any questions. No pressure at all.')}
     ${button('Get Your Free Estimate', `${WEBSITE_URL}/contact`, true)}
     ${paragraph(`<span style="color:#717171;font-size:14px">Or reply to this email — we'd love to chat.</span>`)}
     ${spacer(8)}
     ${paragraphLeft('Wishing you the best with your project!<br><br>Warm regards,<br><strong>The La Vaca Team</strong><br><span style="color:#717171;font-size:14px">Family-Owned &amp; Operated in Northern NJ</span>')}
     ${spacer(16)}`,
    `Your home renovation dreams — let's make them happen, ${firstName}`
  );
}

export function lead7dHtml(name: string): string {
  const firstName = name.split(' ')[0] || name;

  return emailShell(
    `${logo()}
     ${heading('We\'re Here<br>When You\'re Ready')}
     ${paragraph(`Hi ${firstName}, it's been about a week since you reached out, and we just wanted to let you know — we're here whenever you're ready!`)}
     ${paragraph('Home renovations are a big step, and we understand it takes time to plan. Whether you\'re ready to move forward or just have questions, our team is always happy to chat.')}
     ${spacer(8)}
     <div style="padding:0 48px">
       <table cellpadding="0" role="presentation" style="border-collapse:collapse;width:100%;font-size:inherit" width="100%">
         <tr><td style="padding:6px 0"><a href="${WEBSITE_URL}/contact" style="color:${BRAND_COLOR};font-size:15px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;text-decoration:none;font-weight:500">→ Free estimates — no commitment required</a></td></tr>
         <tr><td style="padding:6px 0"><a href="${WEBSITE_URL}/portfolio" style="color:${BRAND_COLOR};font-size:15px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;text-decoration:none;font-weight:500">→ See our latest work</a></td></tr>
         <tr><td style="padding:6px 0"><a href="tel:2012124917" style="color:${BRAND_COLOR};font-size:15px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;text-decoration:none;font-weight:500">→ Call anytime: ${PHONE}</a></td></tr>
         <tr><td style="padding:6px 0"><a href="mailto:${EMAIL}" style="color:${BRAND_COLOR};font-size:15px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;text-decoration:none;font-weight:500">→ Email: ${EMAIL}</a></td></tr>
       </table>
     </div>
     ${spacer(8)}
     ${paragraph(`We'll leave the ball in your court from here. Wishing you all the best, ${firstName}!`)}
     ${spacer(8)}
     ${paragraphLeft('Best regards,<br><strong>Alex &amp; The La Vaca Team</strong>')}
     ${spacer(16)}`,
    `Still thinking about your renovation? We're here when you're ready, ${firstName}`
  );
}

// ==========================================
// LEAD NOTIFICATION (Internal to Alex)
// ==========================================

import { formatContactTime } from '@/lib/notify/formatContactTime';

export function newLeadNotificationHtml(data: {
  name?: string;
  email?: string;
  phone?: string;
  projectType?: string;
  location?: string;
  source?: string;
  contactTimePreference?: string | null;
  contactTimeDetails?: string | null;
  contactTimezone?: string | null;
}): string {
  const timeLabel = formatContactTime(data.contactTimePreference as Parameters<typeof formatContactTime>[0]);
  // Best-time block rendered as a bold highlight card, not buried in the
  // details table — mirrors the Telegram design: this is the field that
  // decides whether the owner calls now or later.
  const bestTimeCard = timeLabel
    ? `<div style="padding:0 48px 16px 48px">
         <div style="background-color:#fef7f4;border-left:4px solid ${BRAND_COLOR};border-radius:0 8px 8px 0;padding:14px 18px">
           <div style="color:#717171;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">⏰ Best time to reach them</div>
           <div style="color:#222;font-size:17px;font-weight:600;padding-top:4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">${timeLabel}</div>
           ${
             data.contactTimeDetails
               ? `<div style="color:#555;font-size:14px;padding-top:6px;font-style:italic;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">&ldquo;${data.contactTimeDetails}&rdquo;</div>`
               : ''
           }
           ${
             data.contactTimezone && data.contactTimezone !== 'America/New_York'
               ? `<div style="color:#b45309;font-size:13px;padding-top:6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">⚠️ Customer timezone: ${data.contactTimezone}</div>`
               : ''
           }
         </div>
       </div>`
    : '';

  return emailShell(
    `${logo()}
     ${heading('New Lead 🔥')}
     ${paragraph(`A new lead just came in from <strong>${data.source || 'the website'}</strong>.`)}
     ${bestTimeCard}
     <div style="padding:0 48px">
       <table cellpadding="0" role="presentation" style="border-collapse:collapse;width:100%;border-spacing:0" width="100%">
         <tr>
           <td style="padding:10px 12px;font-weight:600;border-bottom:1px solid #f0f0f0;width:120px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#717171">Name</td>
           <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#222">${data.name || 'Not provided'}</td>
         </tr>
         <tr>
           <td style="padding:10px 12px;font-weight:600;border-bottom:1px solid #f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#717171">Email</td>
           <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#222">${data.email ? `<a href="mailto:${data.email}" style="color:${BRAND_COLOR}">${data.email}</a>` : 'Not provided'}</td>
         </tr>
         <tr>
           <td style="padding:10px 12px;font-weight:600;border-bottom:1px solid #f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#717171">Phone</td>
           <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#222">${data.phone ? `<a href="tel:${data.phone}" style="color:${BRAND_COLOR}">${data.phone}</a>` : 'Not provided'}</td>
         </tr>
         <tr>
           <td style="padding:10px 12px;font-weight:600;border-bottom:1px solid #f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#717171">Project</td>
           <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#222">${data.projectType || 'Not specified'}</td>
         </tr>
         <tr>
           <td style="padding:10px 12px;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#717171">Location</td>
           <td style="padding:10px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#222">${data.location || 'Not specified'}</td>
         </tr>
       </table>
     </div>
     ${button('View in Admin Dashboard', `${WEBSITE_URL}/vaca-mgmt`)}
     ${spacer(8)}`,
    `New lead from ${data.source || 'website'}: ${data.name || 'Unknown'}`
  );
}

// ==========================================
// CUSTOMER-FACING ESTIMATE PRESENTATION
// ==========================================

const BUSINESS_ADDRESS = '51 Crestmont Rd, West Orange, NJ 07052';
const CREDENTIALS_URL = `${WEBSITE_URL}/about#credentials`;
const PROCESS_URL = `${WEBSITE_URL}/process`;
const WARRANTY_URL = `${WEBSITE_URL}/warranty`;

export interface EstimateEmailPayload {
  recipientName: string;          // Full name; we extract first name for greeting
  projectType: string;            // 'Bathroom Renovation', 'Kitchen Remodel', etc.
  estimateUrl: string;            // QBO estimate link — required
  portalUrl?: string;             // Personalized customer portal — optional
  updateCadence?: 'daily' | 'weekly';  // Drives "what you get" wording
  personalNote?: string;          // Optional 2-3 sentence custom note
}

/**
 * Escape user-provided strings before HTML interpolation. The personal
 * note + names come from an authenticated admin form so the trust level
 * is high, but we never want a typo with `<` or `&` to break rendering
 * across email clients.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function estimateEmailHtml(payload: EstimateEmailPayload): string {
  const {
    recipientName,
    projectType,
    estimateUrl,
    portalUrl,
    updateCadence = 'weekly',
    personalNote,
  } = payload;

  const firstName = (recipientName || '').split(' ')[0] || 'there';
  const safeFirst = escapeHtml(firstName);
  const safeProject = escapeHtml(projectType);
  const safeNote = personalNote ? escapeHtml(personalNote) : '';
  const safeEstimateUrl = escapeHtml(estimateUrl);
  const safePortalUrl = portalUrl ? escapeHtml(portalUrl) : '';
  const cadenceLabel = updateCadence === 'daily' ? 'Daily' : 'Weekly';

  // ─────────────────────────────────────────────────────────────────
  // Color tokens — chosen for email-client safety. bgcolor attribute
  // mirrors style background-color so Outlook desktop (Word engine)
  // still paints the section. Keep tints relatively dark (#FEF2F2,
  // #F0FDF4) — Gmail Android dark-mode inversion is gentler with
  // them than near-white tints.
  // ─────────────────────────────────────────────────────────────────
  const GREEN_BG = '#F0FDF4';
  const GREEN_BORDER = '#16A34A';
  const GREEN_HEAD = '#166534';
  const GREEN_TEXT = '#14532D';

  const ORANGE_BG = '#FFF7ED';
  const ORANGE_HEAD = '#9A3412';
  const ORANGE_TEXT = '#7C2D12';

  const FF = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

  // ─────────────────────────────────────────────────────────────────
  // Email icons. Hosted as PNGs at https://www.lavacagc.com/email/icons/
  // because Gmail and Outlook desktop both strip inline <svg>. The
  // PNGs are 40×40 (2× retina for 20px display); generated by
  // scripts/generate-email-icons.mjs and committed to /public/email/icons.
  // ─────────────────────────────────────────────────────────────────
  const ICON_BASE = `${WEBSITE_URL}/email/icons`;
  const iconImg = (name: string, alt = '', size = 20): string =>
    `<img src="${ICON_BASE}/${name}.png" width="${size}" height="${size}" alt="${escapeHtml(alt)}" style="display:inline-block;vertical-align:middle;border:0;outline:none;text-decoration:none">`;

  // Render one bullet line as an icon-cell + text-cell row. Using a 2-cell
  // table keeps the icon column at a fixed width so wrapping text doesn't
  // ride under the icon, and the cell itself collapses gracefully on
  // mobile via the lv-icon-cell class.
  const iconBullet = (icon: string, html: string, color: string, extraTd = ''): string => `
    <tr>
      <td class="lv-icon-cell" valign="top" style="width:28px;padding:7px 10px 7px 0;font-family:${FF};line-height:0">
        ${icon}
      </td>
      <td class="lv-bullet-text" valign="top"${extraTd} style="padding:6px 0;color:${color};font-family:${FF};font-size:15px;line-height:22px">
        ${html}
      </td>
    </tr>`;

  // ── 1. Greeting (white, brief)
  const greeting = `
    <div data-testid="greeting" class="lv-section" style="padding:0 48px;text-align:left">
      <p style="color:#222;font-family:${FF};margin:0;font-size:16px;line-height:26px;padding:8px 0">
        Hi ${safeFirst},
      </p>
      <p style="color:#222;font-family:${FF};margin:0;font-size:16px;line-height:26px;padding:8px 0">
        Thank you for letting us into your home. Before you open the estimate, here's what you can expect from us throughout this project.
      </p>
    </div>`;

  const noteBlock = safeNote
    ? `<div data-testid="personal-note" class="lv-section" style="padding:8px 48px">
         <div style="background-color:#fafafa;border-left:3px solid ${BRAND_COLOR};border-radius:0 8px 8px 0;padding:14px 18px;font-style:italic;color:#333;font-size:15px;line-height:24px;font-family:${FF}">
           ${safeNote.replace(/\n/g, '<br>')}
         </div>
       </div>`
    : '';

  // ── 2. GREEN block — what you DO get with La Vaca
  // Each bullet is title-only and the title is itself a clickable link to
  // the section of lavacagc.com that explains the feature. A small
  // superscript ref number trails the title; the same number resolves to a
  // URL line in the disclaimer footer below.
  //
  // Portal URL handling: when payload.portalUrl is present we link the title
  // to the customer's personalized portal; otherwise the marketing /process
  // page so they can read about the feature.
  const portalLinkTarget = safePortalUrl || PROCESS_URL;

  const linkedTitle = (
    title: string,
    href: string,
    refNum: number,
    refColor: string,
  ): string =>
    `<a href="${href}" style="color:${GREEN_TEXT};text-decoration:none;font-weight:700">${title}</a><sup style="font-size:10px;line-height:0;font-weight:600"><a href="${href}" style="color:${refColor};text-decoration:none">${refNum}</a></sup>`;

  const doGet = `
    <div data-testid="what-you-get" class="lv-section" style="padding:0 48px 0 48px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${GREEN_BG}" style="background-color:${GREEN_BG};border-left:4px solid ${GREEN_BORDER};border-radius:8px">
        <tr>
          <td class="lv-block-pad" style="padding:24px 24px">
            <h3 style="color:${GREEN_HEAD};font-family:${FF};margin:0 0 14px 0;font-size:18px;line-height:24px;font-weight:700">
              What you get with La Vaca
            </h3>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              ${iconBullet(iconImg('smartphone'), linkedTitle('Personal project portal', portalLinkTarget, 1, GREEN_BORDER), GREEN_TEXT, ' data-testid="portal-row"')}
              ${iconBullet(iconImg('camera'), linkedTitle(`${cadenceLabel} progress updates`, PROCESS_URL, 2, GREEN_BORDER), GREEN_TEXT)}
              ${iconBullet(iconImg('fileCheck'), linkedTitle('Transparent agreement', PROCESS_URL, 3, GREEN_BORDER), GREEN_TEXT, ' data-testid="transparent-agreement"')}
              ${iconBullet(iconImg('shieldCheck'), linkedTitle('Lifetime warranty<sup style="font-size:11px">*</sup>', WARRANTY_URL, 4, GREEN_BORDER), GREEN_TEXT, ' data-testid="warranty-lifetime"')}
              ${iconBullet(iconImg('wrench'), linkedTitle('5-year structural &amp; 1-year workmanship warranty', WARRANTY_URL, 5, GREEN_BORDER), GREEN_TEXT)}
              ${iconBullet(iconImg('badgeCheck'), linkedTitle('Licensed, bonded &amp; insured', CREDENTIALS_URL, 6, GREEN_BORDER), GREEN_TEXT, ' data-testid="credentials-link-row"')}
            </table>
          </td>
        </tr>
      </table>
    </div>`;

  // ── 3. ORANGE/BRAND block — Estimate CTA + 3-step accept (combined)
  const cta = `
    <div data-testid="estimate-cta" class="lv-section" style="padding:0 48px 0 48px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${ORANGE_BG}" style="background-color:${ORANGE_BG};border-left:4px solid ${BRAND_COLOR};border-radius:8px">
        <tr>
          <td class="lv-block-pad" style="padding:28px 24px">
            <h3 style="color:${ORANGE_HEAD};font-family:${FF};margin:0 0 8px 0;font-size:20px;line-height:26px;font-weight:700">
              <span style="display:inline-block;vertical-align:middle;margin-right:8px">${iconImg('fileText', '', 22)}</span>Your ${safeProject} estimate
            </h3>
            <p style="color:${ORANGE_TEXT};font-family:${FF};margin:0 0 18px 0;font-size:15px;line-height:22px">
              Read every line — this is exactly what you'll be agreeing to.
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td bgcolor="${BRAND_COLOR}" style="background-color:${BRAND_COLOR};border-radius:8px">
                  <a data-testid="estimate-link" href="${safeEstimateUrl}" style="display:inline-block;color:#ffffff;text-decoration:none;font-family:${FF};font-size:16px;line-height:22px;font-weight:600;padding:14px 32px">
                    Open Your Estimate →
                  </a>
                </td>
              </tr>
            </table>
            <div data-testid="qbo-steps" style="margin-top:22px">
              <p style="color:${ORANGE_HEAD};font-family:${FF};margin:0 0 8px 0;font-size:14px;line-height:20px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em">
                <span style="display:inline-block;vertical-align:middle;margin-right:6px">${iconImg('circleCheck', '', 18)}</span>How to accept
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                ${iconBullet(iconImg('step-1'), `Open the link above — it takes you to your QuickBooks estimate.`, ORANGE_TEXT)}
                ${iconBullet(iconImg('step-2'), `Click <strong>View estimate</strong> on the right side to see everything that's covered.`, ORANGE_TEXT)}
                ${iconBullet(iconImg('step-3'), `Review every line item, then click the green <strong>Accept</strong> button.`, ORANGE_TEXT)}
                ${iconBullet(iconImg('step-4'), `Add notes or questions in the comments box if you have any.`, ORANGE_TEXT)}
              </table>
            </div>
          </td>
        </tr>
      </table>
    </div>`;

  // ── 4. Closing signoff (handwritten-feel, white)
  const signoff = `
    <div class="lv-section" style="padding:24px 48px 0 48px;text-align:left">
      <p style="color:#222;font-family:${FF};margin:0;font-size:16px;line-height:26px">
        Looking forward to building this with you, ${safeFirst}.<br><br>
        — Alex<br>
        <span style="color:#717171;font-size:14px">La Vaca General Contractors</span>
      </p>
    </div>`;

  // ── 5. Disclaimer (grey, small, legal) + bullet-reference footnotes
  const refLink = (href: string): string =>
    `<a href="${href}" style="color:#717171;text-decoration:underline">${href.replace(/^https?:\/\//, '')}</a>`;
  const portalRefUrl = safePortalUrl || PROCESS_URL;
  const portalRefLabel = safePortalUrl ? 'your project portal' : 'lavacagc.com/process';

  const bulletReferences = `
    <p data-testid="bullet-references" style="color:#717171;font-family:${FF};margin:0;font-size:12px;line-height:20px;padding-top:12px">
      <sup>1</sup> Personal project portal — ${safePortalUrl ? `<a href="${portalRefUrl}" style="color:#717171;text-decoration:underline">${portalRefLabel}</a>` : refLink(portalRefUrl)}<br>
      <sup>2</sup> ${cadenceLabel} progress updates — ${refLink(PROCESS_URL)}<br>
      <sup>3</sup> Transparent agreement — ${refLink(PROCESS_URL)}<br>
      <sup>4</sup> Lifetime warranty (Schluter installs) — ${refLink(WARRANTY_URL)}<br>
      <sup>5</sup> 5-year structural &amp; 1-year workmanship warranty — ${refLink(WARRANTY_URL)}<br>
      <sup>6</sup> Licensed, bonded &amp; insured (NJ ${LICENSE}) — ${refLink(CREDENTIALS_URL)}
    </p>`;

  const disclaimer = `
    <div data-testid="disclaimer" class="lv-section" style="padding:24px 48px 0 48px">
      ${divider()}
      ${bulletReferences}
      <p style="color:#717171;font-family:${FF};margin:0;font-size:12px;line-height:18px;padding-top:16px">
        <strong>*</strong> Lifetime warranty applies to Schluter-system bathroom installations using Schluter waterproofing membranes, drains, and substrate components throughout. Other installs are covered by the 5-year structural and 1-year workmanship warranties.
      </p>
      <p style="color:#717171;font-family:${FF};margin:0;font-size:12px;line-height:18px;padding-top:12px">
        <strong>About this estimate:</strong> Price reflects materials, labor, operating costs, permits, and every scope item listed. <strong>If a scope item is not on the estimate, it is not included in the price.</strong> Accepting in QuickBooks means agreeing to the scope, materials, and price as listed.
      </p>
      <p style="color:#717171;font-family:${FF};margin:0;font-size:12px;line-height:18px;padding-top:12px">
        La Vaca General Contractors, LLC · ${BUSINESS_ADDRESS} · NJ ${LICENSE}
      </p>
    </div>`;

  return emailShell(
    `${logo()}
     ${heading(`Your ${safeProject}<br>Estimate`)}
     ${greeting}
     ${noteBlock}
     ${spacer(16)}
     ${doGet}
     ${spacer(16)}
     ${cta}
     ${signoff}
     ${disclaimer}
     ${spacer(16)}`,
    `Your ${projectType} estimate from La Vaca General Contractors — please review carefully`
  );
}

/**
 * Plaintext fallback for clients that don't render HTML. Resend will
 * auto-generate one if we don't supply it; we ship our own so the message
 * still reads like a person wrote it instead of stripped tags.
 */
export function estimateEmailText(payload: EstimateEmailPayload): string {
  const firstName = (payload.recipientName || '').split(' ')[0] || 'there';
  const cadence = payload.updateCadence === 'daily' ? 'Daily' : 'Weekly';
  return [
    `Hi ${firstName},`,
    '',
    "Thank you for letting us into your home. Before you open the estimate, here's what you can expect from us throughout this project.",
    '',
    payload.personalNote ? `${payload.personalNote}\n` : '',
    'WHAT YOU GET WITH LA VACA',
    `  1. Personal project portal — ${payload.portalUrl || PROCESS_URL}`,
    `  2. ${cadence} progress updates — ${PROCESS_URL}`,
    `  3. Transparent agreement — ${PROCESS_URL}`,
    `  4. Lifetime warranty* (Schluter installs) — ${WARRANTY_URL}`,
    `  5. 5-year structural & 1-year workmanship warranty — ${WARRANTY_URL}`,
    `  6. Licensed, bonded & insured — NJ ${LICENSE} — ${CREDENTIALS_URL}`,
    '',
    `YOUR ${payload.projectType.toUpperCase()} ESTIMATE`,
    `Open it: ${payload.estimateUrl}`,
    '',
    'How to accept:',
    '  1. Open the link above — it takes you to your QuickBooks estimate.',
    '  2. Click "View estimate" on the right side to see everything that\'s covered.',
    '  3. Review every line item, then click the green "Accept" button.',
    '  4. Add notes or questions in the comments box if you have any.',
    '',
    '* Lifetime warranty applies to Schluter-system bathroom installations using Schluter waterproofing membranes, drains, and substrate components throughout. Other installs are covered by the 5-year structural and 1-year workmanship warranties.',
    '',
    'ABOUT THIS ESTIMATE: Price reflects materials, labor, operating costs, permits, and every scope item listed. If a scope item is not on the estimate, it is not included in the price. Accepting in QuickBooks means agreeing to the scope, materials, and price as listed.',
    '',
    `Looking forward to building this with you, ${firstName}.`,
    '',
    '— Alex',
    'La Vaca General Contractors, LLC',
    BUSINESS_ADDRESS,
    `NJ ${LICENSE} · ${PHONE} · ${EMAIL}`,
  ].filter(Boolean).join('\n');
}
