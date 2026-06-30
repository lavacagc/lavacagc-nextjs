import { Resend } from 'resend';
import { cleanEnv } from '@/lib/envClean';

/**
 * Customer-facing emails for La Vaca Home Care (double opt-in + welcome). Warm
 * identity per the from-address convention. Runs in-process (do NOT self-fetch).
 */

const FROM_ADDRESS = 'Alex from La Vaca GC <alex@email.lavaca.link>';
const DEFAULT_REPLY_TO = 'info@lavacagc.com';

export interface HomeCareEmailResult {
  status: 'sent' | 'skipped' | 'failed' | 'error';
  reason?: string;
  emailId?: string;
  error?: string;
}

function shell(title: string, body: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;background:#f6f4ef;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#002855;color:#fff;border-radius:14px 14px 0 0;padding:22px 26px">
      <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#FFCB8E;font-weight:700">La Vaca Home Care</div>
      <div style="font-size:21px;font-weight:800;margin-top:6px">${title}</div>
    </div>
    <div style="background:#fff;padding:24px 26px;border-radius:0 0 14px 14px">${body}</div>
  </div>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:linear-gradient(135deg,#EE9639,#FF6F31);color:#1a1003;font-weight:800;text-decoration:none;padding:13px 26px;border-radius:10px">${label}</a>`;
}

async function send(to: string, subject: string, html: string, text: string): Promise<HomeCareEmailResult> {
  const apiKey = cleanEnv(process.env.RESEND_API_KEY);
  if (!apiKey) {
    console.warn('⚠️ RESEND_API_KEY not configured — skipping home-care email');
    return { status: 'skipped', reason: 'no_api_key' };
  }
  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({ from: FROM_ADDRESS, to: [to], replyTo: DEFAULT_REPLY_TO, subject, html, text });
    if (error) {
      console.error('Failed to send home-care email:', error);
      return { status: 'failed', error: error.message };
    }
    return { status: 'sent', emailId: data?.id };
  } catch (err) {
    console.error('Home-care email error:', err);
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}

export function sendHomeCareVerificationEmail(args: {
  to: string;
  firstName?: string | null;
  verifyUrl: string;
  unsubscribeUrl: string;
}): Promise<HomeCareEmailResult> {
  const hi = args.firstName ? `Hi ${args.firstName},` : 'Hi there,';
  const body = `<p style="font-size:15px;color:#0c1730;margin:0 0 16px">${hi}</p>
    <p style="font-size:15px;color:#5b6b82;margin:0 0 20px">Confirm your email and we'll set up your free, personalized seasonal home-maintenance plan — a simple checklist of what your house needs each season, with one-tap booking when you'd rather we handle it.</p>
    <p style="margin:0 0 22px">${button(args.verifyUrl, 'Confirm & get my plan')}</p>
    <p style="font-size:12px;color:#9aa3b0;margin:0">This link expires in 48 hours. If you didn't request this, ignore it — or <a href="${args.unsubscribeUrl}" style="color:#9aa3b0">unsubscribe</a>.</p>`;
  const text = `${hi}\n\nConfirm your email to set up your free seasonal home-maintenance plan from La Vaca:\n${args.verifyUrl}\n\nThis link expires in 48 hours. Unsubscribe: ${args.unsubscribeUrl}`;
  return send(args.to, "Confirm your email — your La Vaca Home Care plan", shell("Let's set up your home plan", body), text);
}

/** Send a pre-rendered seasonal/monthly newsletter (content built by lib/homecare/newsletter). */
export function sendHomeCareNewsletterEmail(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<HomeCareEmailResult> {
  return send(args.to, args.subject, args.html, args.text);
}

export function sendHomeCareWelcomeEmail(args: {
  to: string;
  firstName?: string | null;
  checklistUrl: string;
  unsubscribeUrl: string;
}): Promise<HomeCareEmailResult> {
  const hi = args.firstName ? `Welcome, ${args.firstName}!` : 'Welcome!';
  const body = `<p style="font-size:15px;color:#0c1730;margin:0 0 16px">${hi}</p>
    <p style="font-size:15px;color:#5b6b82;margin:0 0 20px">You're all set. Your seasonal checklist is ready — see what your home needs right now, check things off as you go, and tap "Book La Vaca" on anything you'd rather hand to us.</p>
    <p style="margin:0 0 22px">${button(args.checklistUrl, 'See my checklist')}</p>
    <p style="font-size:13px;color:#9aa3b0;margin:0">We'll send a short seasonal reminder a few times a year. <a href="${args.unsubscribeUrl}" style="color:#9aa3b0">Unsubscribe</a> anytime.</p>`;
  const text = `${hi}\n\nYour La Vaca Home Care checklist is ready: ${args.checklistUrl}\n\nUnsubscribe: ${args.unsubscribeUrl}`;
  return send(args.to, "You're in — your La Vaca Home Care checklist is ready", shell("Your plan is ready", body), text);
}
