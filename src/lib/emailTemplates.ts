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

export function newLeadNotificationHtml(data: {
  name?: string;
  email?: string;
  phone?: string;
  projectType?: string;
  location?: string;
  source?: string;
}): string {
  return emailShell(
    `${logo()}
     ${heading('New Lead 🔥')}
     ${paragraph(`A new lead just came in from <strong>${data.source || 'the website'}</strong>.`)}
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
     ${button('View in Admin Dashboard', `${WEBSITE_URL}/admin`)}
     ${spacer(8)}`,
    `New lead from ${data.source || 'website'}: ${data.name || 'Unknown'}`
  );
}
