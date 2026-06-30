import { Resend } from 'resend';
import { cleanEnv } from '@/lib/envClean';

/**
 * Phase 3: 14-day autogen-post performance digest. Internal/system mail.
 * Sent only when there's something to report (reverts or posts reviewed).
 */

export interface RollbackDigestItem {
  title: string;
  slug: string;
  verdict: string;
  reason: string;
  clicks: number;
  impressions: number;
  ctr: number;
  reverted: boolean;
}

export interface RollbackDigestResult {
  status: 'sent' | 'skipped' | 'failed' | 'error';
  reason?: string;
  emailId?: string;
  error?: string;
}

const FROM_ADDRESS = 'La Vaca SEO <noreply@email.lavaca.link>';
const SITE = 'https://www.lavacagc.com';

export async function sendRollbackDigestEmail(items: RollbackDigestItem[]): Promise<RollbackDigestResult> {
  const apiKey = cleanEnv(process.env.RESEND_API_KEY);
  if (!apiKey) return { status: 'skipped', reason: 'no_api_key' };
  if (items.length === 0) return { status: 'skipped', reason: 'nothing_to_report' };

  const to = cleanEnv(process.env.SEO_REPORT_EMAIL) || cleanEnv(process.env.LEAD_NOTIFICATION_EMAIL) || 'alex@vacamoo.com';
  const reverted = items.filter((i) => i.reverted).length;

  const td = 'style="padding:6px 10px;border-bottom:1px solid #eee;font-size:14px;color:#0c1730"';
  const rows = items
    .map(
      (i) => `<tr>
      <td ${td}><a href="${SITE}/blog/${i.slug}" style="color:#EE9639">${i.title}</a></td>
      <td ${td}>${i.impressions}</td>
      <td ${td}>${i.clicks}</td>
      <td ${td}>${(i.ctr * 100).toFixed(2)}%</td>
      <td ${td} style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;font-weight:700;color:${i.reverted ? '#c0392b' : '#0f6b58'}">${i.reverted ? 'REVERTED' : i.verdict}</td>
    </tr>`,
    )
    .join('');

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#f6f4ef;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:24px">
    <div style="background:#002855;color:#fff;border-radius:14px 14px 0 0;padding:20px 24px">
      <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#FFCB8E;font-weight:700">La Vaca SEO · 14-day review</div>
      <div style="font-size:20px;font-weight:800;margin-top:6px">Autogen post performance</div>
      <div style="font-size:13px;color:#9fb6d4;margin-top:4px">${items.length} post(s) hit their 14-day mark${reverted ? ` · ${reverted} auto-reverted` : ''}</div>
    </div>
    <div style="background:#fff;padding:20px 24px;border-radius:0 0 14px 14px">
      ${reverted ? `<p style="font-size:14px;color:#c0392b;margin:0 0 12px"><b>${reverted} refreshed post(s) lost &gt;20% of their CTR and were rolled back to the prior version.</b></p>` : ''}
      <table style="width:100%;border-collapse:collapse"><thead><tr>
        <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #002855;font-size:12px;text-transform:uppercase;color:#5b6b82">Post</th>
        <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #002855;font-size:12px;color:#5b6b82">Impr</th>
        <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #002855;font-size:12px;color:#5b6b82">Clicks</th>
        <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #002855;font-size:12px;color:#5b6b82">CTR</th>
        <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #002855;font-size:12px;color:#5b6b82">Verdict</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <p style="font-size:12px;color:#9aa3b0;margin-top:16px">New posts are reported, not auto-changed — 14 days is early for SEO. Low performers worth revising are flagged for your call.</p>
    </div>
  </div>
</body></html>`;

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [to],
      subject: `📊 SEO 14-day review: ${items.length} autogen post(s)${reverted ? ` · ${reverted} reverted` : ''}`,
      html,
    });
    if (error) return { status: 'failed', error: error.message };
    return { status: 'sent', emailId: data?.id };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}
