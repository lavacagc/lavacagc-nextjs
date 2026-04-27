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
  <title>La Vaca General Contractors</title>
  <style type="text/css">
    body { margin: 0 auto !important; padding: 0; background-color: #f7f7f7; }
    a { color: ${BRAND_COLOR}; }
  </style>
</head>
<body style="margin:0 auto !important;padding:0;background-color:#f7f7f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="color:transparent;display:none !important;font-size:0;height:0;opacity:0;width:0">${previewText}</div>
  <div style="padding:24px 16px">
    <div style="color:#222222;width:100%;max-width:640px;margin:0 auto;background-color:#ffffff;border-radius:12px;border:1px solid #dddddd;overflow:hidden;box-sizing:border-box">
      ${content}
      ${footer()}
    </div>
  </div>
</body>
</html>`;
}

function logo(): string {
  return `
    <div style="text-align:center;padding:32px 48px 0 48px">
      <a href="${WEBSITE_URL}" style="text-decoration:none">
        <img src="${LOGO_URL}" alt="La Vaca General Contractors" width="80" height="80" style="border:0;width:80px;height:80px;border-radius:12px" />
      </a>
    </div>`;
}

function heading(text: string): string {
  return `
    <div style="text-align:center;padding:24px 48px 8px 48px">
      <h1 style="color:#222222;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;font-weight:700;font-size:32px;line-height:38px;letter-spacing:-0.02em">${text}</h1>
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

export interface EstimateEmailPayload {
  recipientName: string;          // Full name; we extract first name for greeting
  projectType: string;            // 'Bathroom Renovation', 'Kitchen Remodel', etc.
  estimateUrl: string;            // QBO estimate link — required
  portalUrl?: string;             // Personalized customer portal — optional
  updateCadence?: 'daily' | 'weekly';  // Drives "what you get" wording
  personalNote?: string;          // Optional 2-3 sentence custom note
}

/**
 * Detect Schluter relevance from project type. We mention the lifetime
 * warranty asterisk inline (rather than only in the footer) when the
 * project is a bathroom — that's where it actually applies. Other project
 * types still see the asterisk in the footer for legal clarity.
 */
function isBathroomProject(projectType: string): boolean {
  return /bath|shower|powder/i.test(projectType);
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
  const showSchluterInline = isBathroomProject(projectType);

  // ── Section: personal greeting + optional handwritten-feel note
  const greeting = `
    <div data-testid="greeting" style="padding:0 48px;text-align:left">
      <p style="color:#222;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;font-size:16px;line-height:26px;padding:8px 0">
        Hi ${safeFirst},
      </p>
      <p style="color:#222;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;font-size:16px;line-height:26px;padding:8px 0">
        Thank you for letting us into your home and for the time you spent walking us through your project. We don't take that lightly — every estimate we put together starts with what we saw, heard, and learned from you.
      </p>
    </div>`;

  const noteBlock = safeNote
    ? `<div data-testid="personal-note" style="padding:8px 48px">
         <div style="background-color:#fafafa;border-left:3px solid ${BRAND_COLOR};border-radius:0 8px 8px 0;padding:14px 18px;font-style:italic;color:#333;font-size:15px;line-height:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
           ${safeNote.replace(/\n/g, '<br>')}
         </div>
       </div>`
    : '';

  // ── Section: estimate CTA + read-carefully callout
  const estimateCta = `
    <div data-testid="estimate-cta" style="padding:8px 48px 0 48px">
      <div style="background-color:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:24px;text-align:center">
        <p style="color:#222;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;font-weight:700;font-size:18px;line-height:26px;padding-bottom:8px">
          Your ${safeProject} estimate is ready
        </p>
        <p style="color:#444;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;font-size:15px;line-height:22px;padding-bottom:16px">
          <strong>Please read your estimate carefully.</strong> Every item, material, and scope detail is listed. Take your time — this is exactly what you'll be agreeing to.
        </p>
        <div style="display:inline-block;background-color:${BRAND_COLOR};border-radius:8px">
          <a data-testid="estimate-link" href="${safeEstimateUrl}" style="color:#fff;display:inline-block;text-decoration:none;font-size:16px;line-height:22px;font-weight:600;padding:14px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
            View Your Estimate →
          </a>
        </div>
      </div>
    </div>`;

  // ── Section: how to accept on QBO
  const qboInstructions = `
    <div data-testid="qbo-steps" style="padding:24px 48px 0 48px;text-align:left">
      <h3 style="color:#222;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;font-size:18px;line-height:26px;font-weight:700;padding-bottom:12px">
        How to accept your estimate
      </h3>
      <ol style="color:#222;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;padding-left:22px;font-size:15px;line-height:24px">
        <li style="padding:4px 0">Click <strong>"View Your Estimate"</strong> above — it opens in QuickBooks Online.</li>
        <li style="padding:4px 0">Review every line item carefully — materials, scope, and pricing.</li>
        <li style="padding:4px 0">Click the green <strong>"Accept"</strong> button at the top of the QuickBooks page.</li>
        <li style="padding:4px 0">Add any notes or questions in the comments box if you have them.</li>
        <li style="padding:4px 0">Once you accept, we'll convert it into a signed agreement and invoice, and lock your project on our calendar.</li>
      </ol>
    </div>`;

  // ── Section: what you get with La Vaca (warranty + portal + transparency)
  const portalRow = safePortalUrl
    ? `<tr><td style="padding:8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#222"><span style="color:${BRAND_COLOR};font-weight:700">✓</span> &nbsp;<strong>Your personalized project portal</strong> — updated regularly so you always know where things stand. <a data-testid="portal-link" href="${safePortalUrl}" style="color:${BRAND_COLOR};text-decoration:underline;font-weight:500">Open your portal →</a></td></tr>`
    : `<tr><td style="padding:8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#222"><span style="color:${BRAND_COLOR};font-weight:700">✓</span> &nbsp;<strong>Your personalized project portal</strong> — updated regularly so you always know where things stand.</td></tr>`;

  const warrantyAsterisk = showSchluterInline
    ? '<sup style="font-size:11px;color:#717171">*</sup>'
    : '<sup style="font-size:11px;color:#717171">*</sup>';

  const whatYouGet = `
    <div data-testid="what-you-get" style="padding:24px 48px 0 48px;text-align:left">
      <h3 style="color:#222;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;font-size:18px;line-height:26px;font-weight:700;padding-bottom:12px">
        What you get when you work with La Vaca
      </h3>
      <table cellpadding="0" role="presentation" style="border-collapse:collapse;width:100%" width="100%">
        <tr><td style="padding:8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#222"><span style="color:${BRAND_COLOR};font-weight:700">✓</span> &nbsp;<strong>Full transparency from day one</strong> — no surprises, no hidden charges, no scope creep without a conversation.</td></tr>
        ${portalRow}
        <tr><td style="padding:8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#222"><span style="color:${BRAND_COLOR};font-weight:700">✓</span> &nbsp;<strong>${cadenceLabel} progress updates</strong> with photos, milestones, and what's next — direct from your project manager.</td></tr>
        <tr><td data-testid="warranty-lifetime" style="padding:8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#222"><span style="color:${BRAND_COLOR};font-weight:700">✓</span> &nbsp;<strong>Lifetime warranty${warrantyAsterisk}</strong> — we stand behind our work for life.</td></tr>
        <tr><td style="padding:8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#222"><span style="color:${BRAND_COLOR};font-weight:700">✓</span> &nbsp;<strong>5-year structural warranty</strong> on framing, structural alterations, and load-bearing work.</td></tr>
        <tr><td style="padding:8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#222"><span style="color:${BRAND_COLOR};font-weight:700">✓</span> &nbsp;<strong>1-year workmanship warranty</strong> on all finish work — paint, tile, trim, cabinetry installation.</td></tr>
        <tr><td style="padding:8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#222"><span style="color:${BRAND_COLOR};font-weight:700">✓</span> &nbsp;<strong>Licensed, bonded, and insured</strong> — NJ ${LICENSE}. <a data-testid="credentials-link" href="${CREDENTIALS_URL}" style="color:${BRAND_COLOR};text-decoration:underline;font-weight:500">Verify our credentials →</a></td></tr>
      </table>
    </div>`;

  // ── Section: what you get from other contractors (the comparison)
  const comparison = `
    <div data-testid="comparison" style="padding:24px 48px 0 48px;text-align:left">
      <h3 style="color:#222;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;font-size:18px;line-height:26px;font-weight:700;padding-bottom:4px">
        What you might get from other contractors
      </h3>
      <p style="color:#717171;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;font-size:14px;line-height:20px;padding-bottom:12px">
        We're not bad-mouthing anyone — we're being honest about why our process exists.
      </p>
      <table cellpadding="0" role="presentation" style="border-collapse:collapse;width:100%" width="100%">
        <tr>
          <td style="padding:10px 12px 10px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#717171;border-bottom:1px solid #f0f0f0;vertical-align:top;width:50%">
            <span style="color:#dc2626;font-weight:700">✗</span> Stops returning calls and texts after the deposit clears
          </td>
          <td style="padding:10px 0 10px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#222;border-bottom:1px solid #f0f0f0;vertical-align:top;width:50%">
            <span style="color:${BRAND_COLOR};font-weight:700">✓</span> Same-day responses from a real human
          </td>
        </tr>
        <tr>
          <td style="padding:10px 12px 10px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#717171;border-bottom:1px solid #f0f0f0;vertical-align:top">
            <span style="color:#dc2626;font-weight:700">✗</span> "I'll be there Tuesday" turns into next week
          </td>
          <td style="padding:10px 0 10px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#222;border-bottom:1px solid #f0f0f0;vertical-align:top">
            <span style="color:${BRAND_COLOR};font-weight:700">✓</span> Crews show up when we say they will
          </td>
        </tr>
        <tr>
          <td style="padding:10px 12px 10px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#717171;border-bottom:1px solid #f0f0f0;vertical-align:top">
            <span style="color:#dc2626;font-weight:700">✗</span> Verbal estimates and a handshake
          </td>
          <td style="padding:10px 0 10px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#222;border-bottom:1px solid #f0f0f0;vertical-align:top">
            <span style="color:${BRAND_COLOR};font-weight:700">✓</span> A signed scope and a fixed price
          </td>
        </tr>
        <tr>
          <td style="padding:10px 12px 10px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#717171;border-bottom:1px solid #f0f0f0;vertical-align:top">
            <span style="color:#dc2626;font-weight:700">✗</span> No license, no bond, no insurance — your problem if something goes wrong
          </td>
          <td style="padding:10px 0 10px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#222;border-bottom:1px solid #f0f0f0;vertical-align:top">
            <span style="color:${BRAND_COLOR};font-weight:700">✓</span> NJ ${LICENSE}, fully bonded, fully insured (<a href="${CREDENTIALS_URL}" style="color:${BRAND_COLOR};text-decoration:underline">verify</a>)
          </td>
        </tr>
        <tr>
          <td style="padding:10px 12px 10px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#717171;vertical-align:top">
            <span style="color:#dc2626;font-weight:700">✗</span> Disappears when something needs warranty work
          </td>
          <td style="padding:10px 0 10px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#222;vertical-align:top">
            <span style="color:${BRAND_COLOR};font-weight:700">✓</span> Lifetime warranty backed by a local business that's still here
          </td>
        </tr>
      </table>
    </div>`;

  // ── Section: scope-of-work + Schluter disclaimer (legal language)
  const disclaimer = `
    <div data-testid="disclaimer" style="padding:24px 48px 0 48px">
      ${divider()}
      <p style="color:#717171;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;font-size:12px;line-height:18px;padding-top:16px">
        <strong>*</strong> Lifetime warranty applies exclusively to Schluter-system bathroom installations completed using Schluter waterproofing membranes, drains, and substrate components throughout. Other installations are covered by the 5-year structural warranty and the 1-year workmanship warranty.
      </p>
      <p style="color:#717171;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;font-size:12px;line-height:18px;padding-top:12px">
        <strong>About this estimate:</strong> The price reflects the cost of materials, labor, operating costs, permits, and every scope item explicitly listed on the linked estimate. <strong>If a scope item is not on the estimate, it is not included in the price.</strong> By accepting the QuickBooks estimate, you are agreeing to the scope, materials, and price as listed.
      </p>
      <p style="color:#717171;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;font-size:12px;line-height:18px;padding-top:12px">
        La Vaca General Contractors, LLC · ${BUSINESS_ADDRESS} · NJ ${LICENSE}
      </p>
    </div>`;

  // Closing handwritten-feel signoff (above the standard footer block)
  const signoff = `
    <div style="padding:24px 48px 0 48px;text-align:left">
      <p style="color:#222;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;font-size:16px;line-height:26px">
        Looking forward to working with you, ${safeFirst}.<br>
        <br>
        — Alex<br>
        <span style="color:#717171;font-size:14px">La Vaca General Contractors</span>
      </p>
    </div>`;

  return emailShell(
    `${logo()}
     ${heading(`Your ${safeProject}<br>Estimate`)}
     ${greeting}
     ${noteBlock}
     ${estimateCta}
     ${qboInstructions}
     ${spacer(8)}
     ${whatYouGet}
     ${spacer(16)}
     ${comparison}
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
    "Thank you for letting us into your home and for the time you spent walking us through your project. Every estimate we put together starts with what we saw, heard, and learned from you.",
    '',
    payload.personalNote ? `${payload.personalNote}\n` : '',
    `YOUR ${payload.projectType.toUpperCase()} ESTIMATE IS READY`,
    `View it here: ${payload.estimateUrl}`,
    '',
    'Please read your estimate carefully. Every item, material, and scope detail is listed.',
    '',
    'HOW TO ACCEPT:',
    '  1. Click the link above (opens in QuickBooks Online).',
    '  2. Review every line item.',
    '  3. Click the green "Accept" button at the top.',
    '  4. Add notes or questions in the comments box.',
    "  5. Once accepted, we'll send the signed agreement and invoice.",
    '',
    'WHAT YOU GET WITH LA VACA:',
    '  - Full transparency from day one',
    payload.portalUrl ? `  - Your personalized project portal: ${payload.portalUrl}` : '  - Your personalized project portal',
    `  - ${cadence} progress updates with photos and milestones`,
    '  - Lifetime warranty* (Schluter bathrooms — see disclaimer)',
    '  - 5-year structural warranty',
    '  - 1-year workmanship warranty',
    `  - NJ ${LICENSE}, fully bonded and insured (verify: ${CREDENTIALS_URL})`,
    '',
    '* Lifetime warranty applies exclusively to Schluter-system bathroom installations completed using Schluter waterproofing membranes, drains, and substrate components throughout. Other installations are covered by the 5-year structural and 1-year workmanship warranties.',
    '',
    'ABOUT THIS ESTIMATE: The price reflects materials, labor, operating costs, permits, and every scope item explicitly listed on the linked estimate. If a scope item is not on the estimate, it is not included in the price. By accepting the QuickBooks estimate, you are agreeing to the scope, materials, and price as listed.',
    '',
    `Looking forward to working with you, ${firstName}.`,
    '',
    '— Alex',
    'La Vaca General Contractors, LLC',
    BUSINESS_ADDRESS,
    `NJ ${LICENSE} · ${PHONE} · ${EMAIL}`,
  ].filter(Boolean).join('\n');
}
