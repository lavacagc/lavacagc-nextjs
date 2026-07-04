import { sendTrackedEmail, type EmailCategory } from '@/lib/notify/sendEmail';
import type { StreamKey } from '@/lib/preferences/preferences';

/**
 * Customer-facing emails for La Vaca Home Care (double opt-in + welcome).
 * Program identity: everything a Home Care member receives is from
 * "La Vaca Home Care" (owner decision 2026-07-03 — program emails carry the
 * program's name, not the personal warm identity used elsewhere). Runs
 * in-process (do NOT self-fetch). All sends funnel through sendTrackedEmail
 * so they land in email_log.
 */

const FROM_ADDRESS = 'La Vaca Home Care <alex@email.lavaca.link>';
const DEFAULT_REPLY_TO = 'info@lavacagc.com';
const LOGO = 'https://www.lavacagc.com/logo.png';
const PHONE = '(201) 212-4917';
const HIC = 'NJ HIC# 13VH13373800';

export interface HomeCareEmailResult {
  status: 'sent' | 'skipped' | 'failed' | 'error';
  reason?: string;
  emailId?: string;
  error?: string;
}

function shell(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#eef0ea;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <table width="100%" style="background:#002855;border-radius:14px 14px 0 0;border-collapse:collapse"><tr>
      <td style="padding:20px 24px" valign="middle">
        <table style="border-collapse:collapse"><tr>
          <td valign="middle"><img src="${LOGO}" width="44" height="44" alt="La Vaca" style="display:block;border-radius:10px;background:#fff"></td>
          <td valign="middle" style="padding-left:12px">
            <div style="color:#fff;font-size:17px;font-weight:800;line-height:1.1">La Vaca Home Care</div>
            <div style="color:#FFCB8E;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-top:2px">${title}</div>
          </td>
        </tr></table>
      </td>
    </tr></table>
    <div style="background:#fff;padding:24px 26px;border-radius:0 0 14px 14px">
      ${body}
      <table width="100%" style="border-top:1px solid #e6e9ef;margin-top:22px;border-collapse:collapse"><tr><td style="padding-top:16px">
        <div style="font-size:13px;font-weight:800;color:#002855">La Vaca General Contractors</div>
        <div style="font-size:12px;color:#5b6b82;margin-top:3px"><a href="tel:2012124917" style="color:#EE9639;font-weight:700;text-decoration:none">${PHONE}</a> &nbsp;·&nbsp; ${HIC}</div>
      </td></tr></table>
    </div>
  </div>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:linear-gradient(135deg,#EE9639,#FF6F31);color:#1a1003;font-weight:800;text-decoration:none;padding:13px 26px;border-radius:10px">${label}</a>`;
}

function send(
  to: string,
  subject: string,
  html: string,
  text: string,
  category: EmailCategory,
  homeownerId?: string | null,
  preferenceStream?: StreamKey,
): Promise<HomeCareEmailResult> {
  return sendTrackedEmail({
    from: FROM_ADDRESS,
    to,
    replyTo: DEFAULT_REPLY_TO,
    subject,
    html,
    text,
    category,
    homeownerId: homeownerId ?? null,
    ...(preferenceStream ? { preferenceStream } : {}),
  });
}

export function sendHomeCareVerificationEmail(args: {
  to: string;
  firstName?: string | null;
  verifyUrl: string;
  unsubscribeUrl: string;
  homeownerId?: string | null;
}): Promise<HomeCareEmailResult> {
  const hi = args.firstName ? `Hi ${args.firstName},` : 'Hi there,';
  const body = `<p style="font-size:15px;color:#0c1730;margin:0 0 16px">${hi}</p>
    <p style="font-size:15px;color:#5b6b82;margin:0 0 20px">Confirm your email and we'll set up your free, personalized seasonal home-maintenance plan — a simple checklist of what your house needs each season, with one-tap booking when you'd rather we handle it.</p>
    <p style="margin:0 0 22px">${button(args.verifyUrl, 'Confirm & get my plan')}</p>
    <p style="font-size:12px;color:#9aa3b0;margin:0">This link expires in 48 hours. If you didn't request this, ignore it — or <a href="${args.unsubscribeUrl}" style="color:#9aa3b0">unsubscribe</a>.</p>`;
  const text = `${hi}\n\nConfirm your email to set up your free seasonal home-maintenance plan from La Vaca:\n${args.verifyUrl}\n\nThis link expires in 48 hours. Unsubscribe: ${args.unsubscribeUrl}`;
  return send(args.to, "Confirm your email — your La Vaca Home Care plan", shell("Let's set up your home plan", body), text, 'verification', args.homeownerId);
}

/** Send a pre-rendered seasonal/monthly newsletter (content built by lib/homecare/newsletter). */
export function sendHomeCareNewsletterEmail(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
  homeownerId?: string | null;
}): Promise<HomeCareEmailResult> {
  return send(args.to, args.subject, args.html, args.text, 'home_care_newsletter', args.homeownerId, 'home_care');
}

export function sendHomeCareWelcomeEmail(args: {
  to: string;
  firstName?: string | null;
  checklistUrl: string;
  unsubscribeUrl: string;
  preferencesUrl?: string | null;
  homeownerId?: string | null;
}): Promise<HomeCareEmailResult> {
  const hi = args.firstName ? `Welcome, ${args.firstName}!` : 'Welcome!';
  const manage = args.preferencesUrl
    ? `<a href="${args.preferencesUrl}" style="color:#9aa3b0;text-decoration:underline">Manage email preferences</a> · `
    : '';
  const body = `<p style="font-size:15px;color:#0c1730;margin:0 0 16px">${hi}</p>
    <p style="font-size:15px;color:#5b6b82;margin:0 0 20px">You're all set. Your seasonal checklist is ready — see what your home needs right now, check things off as you go, and tap "Book La Vaca" on anything you'd rather hand to us.</p>
    <p style="margin:0 0 22px">${button(args.checklistUrl, 'See my checklist')}</p>
    <p style="font-size:13px;color:#5b6b82;margin:0 0 16px">Know someone who'd want this? Forward this email — they can get their own free plan at <a href="https://www.lavacagc.com/home-care?utm_source=member_share&utm_medium=email&utm_campaign=home_care_share" style="color:#EE9639;font-weight:700;text-decoration:none">lavacagc.com/home-care</a>.</p>
    <p style="font-size:13px;color:#9aa3b0;margin:0">We'll send a short seasonal reminder a few times a year. ${manage}<a href="${args.unsubscribeUrl}" style="color:#9aa3b0">Unsubscribe</a> anytime.</p>`;
  const text = `${hi}\n\nYour La Vaca Home Care checklist is ready: ${args.checklistUrl}\n\nKnow someone who'd want this? They can get their own free plan: https://www.lavacagc.com/home-care\n\n${args.preferencesUrl ? `Manage email preferences: ${args.preferencesUrl}\n` : ''}Unsubscribe: ${args.unsubscribeUrl}`;
  return send(args.to, "You're in — your La Vaca Home Care checklist is ready", shell("Your plan is ready", body), text, 'welcome', args.homeownerId);
}
