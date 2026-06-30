import { Resend } from 'resend';
import { cleanEnv } from '@/lib/envClean';

/**
 * Phase 3: notify the owner that an AI draft has been staged as a blog DRAFT and
 * is ready to review + publish. Internal/system mail → noreply identity. Runs
 * in-process (do NOT self-fetch).
 */

export interface StagedDraftEmailResult {
  status: 'sent' | 'skipped' | 'failed' | 'error';
  reason?: string;
  emailId?: string;
  error?: string;
}

const FROM_ADDRESS = 'La Vaca SEO <noreply@email.lavaca.link>';
const SITE = 'https://www.lavacagc.com';

export async function sendStagedDraftEmail(post: {
  title: string;
  slug: string;
  actionType?: string;
  query?: string | null;
}): Promise<StagedDraftEmailResult> {
  const apiKey = cleanEnv(process.env.RESEND_API_KEY);
  if (!apiKey) {
    console.warn('⚠️ RESEND_API_KEY not configured — skipping staged-draft email');
    return { status: 'skipped', reason: 'no_api_key' };
  }

  const to = cleanEnv(process.env.SEO_REPORT_EMAIL) || cleanEnv(process.env.LEAD_NOTIFICATION_EMAIL) || 'alex@vacamoo.com';
  const previewUrl = `${SITE}/blog/preview/${post.slug}`;
  const reason = post.actionType === 'new' ? 'a new post targeting' : 'a refresh for';

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#f6f4ef;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#002855;color:#fff;border-radius:14px 14px 0 0;padding:20px 24px">
      <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#FFCB8E;font-weight:700">La Vaca SEO · Draft ready</div>
      <div style="font-size:20px;font-weight:800;margin-top:6px">📝 An AI draft is ready to publish</div>
    </div>
    <div style="background:#fff;padding:22px 24px;border-radius:0 0 14px 14px">
      <p style="font-size:14px;color:#5b6b82;margin:0 0 14px">The SEO engine drafted ${reason}${post.query ? ` “${post.query}”` : ' an opportunity'} and saved it as an <b>unpublished blog draft</b>. It will <b>not</b> go live until you publish it.</p>
      <div style="background:#f1f4f8;border-radius:10px;padding:16px;margin-bottom:18px">
        <div style="font-size:12px;color:#7a869a;text-transform:uppercase;letter-spacing:.05em">Title</div>
        <div style="font-size:17px;font-weight:700;color:#002855;margin-top:4px">${post.title}</div>
      </div>
      <a href="${previewUrl}" style="display:inline-block;background:linear-gradient(135deg,#EE9639,#FF6F31);color:#1a1003;font-weight:800;text-decoration:none;padding:12px 22px;border-radius:10px">Preview the draft →</a>
      <p style="font-size:13px;color:#9aa3b0;margin-top:18px">To publish: Admin → Content → Blog Posts → open this draft → review → Publish. The fact-lock (license, phone, pricing) and internal-link checks already passed.</p>
    </div>
  </div>
</body></html>`;

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [to],
      subject: `📝 AI draft ready to publish: ${post.title}`,
      html,
    });
    if (error) {
      console.error('Failed to send staged-draft email:', error);
      return { status: 'failed', error: error.message };
    }
    return { status: 'sent', emailId: data?.id };
  } catch (err) {
    console.error('Staged-draft email error:', err);
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}
