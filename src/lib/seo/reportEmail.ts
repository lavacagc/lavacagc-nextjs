/**
 * SEO Autonomy — Phase 1 (Observer): weekly digest email renderer.
 *
 * Pure function: turns a SeoReport into { subject, html, text }. No I/O, so it
 * is unit-testable with a synthetic report. The actual send lives in
 * src/lib/notify/sendSeoReportEmail.ts (Resend), matching the notify/ pattern.
 */
import type { SeoReport } from './report';

const SITE = 'https://www.lavacagc.com';

function pct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(2)}%`;
}

function num(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function pos(n: number | null): string {
  return n === null ? '—' : n.toFixed(1);
}

function fullUrl(path: string): string {
  return path.startsWith('http') ? path : `${SITE}${path}`;
}

export function renderSeoReportEmail(report: SeoReport): { subject: string; html: string; text: string } {
  const { window: win, totals, refresh_candidates, winners, new_article_candidates, trend } = report;

  const subject = `SEO weekly: ${num(totals.clicks_total)} clicks, ${refresh_candidates.length} refresh + ${new_article_candidates.length} new-post ideas`;

  // ─── HTML ──────────────────────────────────────────────────────────────────
  const th = 'style="text-align:left;padding:6px 10px;border-bottom:2px solid #002855;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#5b6b82"';
  const td = 'style="padding:6px 10px;border-bottom:1px solid #eee;font-size:14px;color:#0c1730"';

  const refreshRows = refresh_candidates.length
    ? refresh_candidates
        .map(
          (c) => `<tr>
        <td ${td}><a href="${fullUrl(c.url)}" style="color:#EE9639">${c.url}</a></td>
        <td ${td}>${c.query ? `“${c.query}”` : '—'}</td>
        <td ${td}>${num(c.impressions)}</td>
        <td ${td}>${num(c.clicks)}</td>
        <td ${td}>${pos(c.avg_position)}</td>
        <td ${td}>${pct(c.ctr)}</td>
      </tr>`,
        )
        .join('')
    : `<tr><td ${td} colspan="6">No pages currently sit in the position 5–15 / low-CTR sweet spot.</td></tr>`;

  const newRows = new_article_candidates.length
    ? new_article_candidates
        .map(
          (c) => `<tr>
        <td ${td}>“${c.query}”</td>
        <td ${td}>${num(c.impressions)}</td>
        <td ${td}>${num(c.clicks)}</td>
        <td ${td}>${pct(c.ctr)}</td>
      </tr>`,
        )
        .join('')
    : `<tr><td ${td} colspan="4">No high-impression queries without an owning page this week.</td></tr>`;

  const winnerRows = winners.length
    ? winners
        .map(
          (w) => `<tr>
        <td ${td}><a href="${fullUrl(w.url)}" style="color:#EE9639">${w.url}</a></td>
        <td ${td}>${num(w.conversions)}</td>
        <td ${td}>${num(w.users)}</td>
      </tr>`,
        )
        .join('')
    : `<tr><td ${td} colspan="3">No conversions recorded in GA4 this window.</td></tr>`;

  const trendRows = trend.length
    ? trend
        .map(
          (t) => `<tr>
        <td ${td}><a href="${fullUrl(t.url)}" style="color:#EE9639">${t.url}</a></td>
        <td ${td}>${num(t.recent_clicks)}</td>
        <td ${td}>${num(t.prior_clicks)}</td>
        <td ${td} style="padding:6px 10px;border-bottom:1px solid #eee;font-size:14px;font-weight:700;color:${t.delta >= 0 ? '#0f6b58' : '#c0392b'}">${t.delta >= 0 ? '+' : ''}${num(t.delta)}</td>
      </tr>`,
        )
        .join('')
    : `<tr><td ${td} colspan="4">No meaningful 14-day swings.</td></tr>`;

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#f6f4ef;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:680px;margin:0 auto;padding:24px">
    <div style="background:#002855;color:#fff;border-radius:14px 14px 0 0;padding:22px 26px">
      <div style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#FFCB8E;font-weight:700">La Vaca GC · SEO Observer</div>
      <div style="font-size:22px;font-weight:800;margin-top:6px">Weekly Search Report</div>
      <div style="font-size:13px;color:#9fb6d4;margin-top:4px">${win.startDate} → ${win.endDate} (28-day window)</div>
    </div>
    <div style="background:#fff;padding:22px 26px;border-radius:0 0 14px 14px">
      <p style="font-size:14px;color:#5b6b82;margin:0 0 18px">
        Read-only snapshot of how the site is performing in Google. This report takes no action —
        it surfaces what's worth refreshing or writing. Numbers from Search Console + GA4.
      </p>

      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px">
        <div style="flex:1;min-width:120px;background:#f1f4f8;border-radius:10px;padding:14px"><div style="font-size:24px;font-weight:800;color:#002855">${num(totals.clicks_total)}</div><div style="font-size:12px;color:#5b6b82">clicks</div></div>
        <div style="flex:1;min-width:120px;background:#f1f4f8;border-radius:10px;padding:14px"><div style="font-size:24px;font-weight:800;color:#002855">${num(totals.impressions_total)}</div><div style="font-size:12px;color:#5b6b82">impressions</div></div>
        <div style="flex:1;min-width:120px;background:#fff3e3;border-radius:10px;padding:14px"><div style="font-size:24px;font-weight:800;color:#c97a16">${num(totals.conversions_total)}</div><div style="font-size:12px;color:#b8761f">conversions</div></div>
      </div>

      <h2 style="font-size:16px;color:#002855;margin:0 0 4px">🔧 Refresh candidates (${refresh_candidates.length})</h2>
      <p style="font-size:13px;color:#5b6b82;margin:0 0 8px">Ranking 5–15 with traffic but low CTR — rewrite the title/meta/intro to win the clicks you're already close to.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px"><thead><tr><th ${th}>Page</th><th ${th}>Query</th><th ${th}>Impr</th><th ${th}>Clicks</th><th ${th}>Pos</th><th ${th}>CTR</th></tr></thead><tbody>${refreshRows}</tbody></table>

      <h2 style="font-size:16px;color:#002855;margin:0 0 4px">✍️ New-article ideas (${new_article_candidates.length})</h2>
      <p style="font-size:13px;color:#5b6b82;margin:0 0 8px">Queries you appear for but no page owns well — candidates for a dedicated post.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px"><thead><tr><th ${th}>Query</th><th ${th}>Impr</th><th ${th}>Clicks</th><th ${th}>CTR</th></tr></thead><tbody>${newRows}</tbody></table>

      <h2 style="font-size:16px;color:#002855;margin:0 0 4px">🏆 Winners — don't break these (${winners.length})</h2>
      <p style="font-size:13px;color:#5b6b82;margin:0 0 8px">Pages driving conversions. Leave them alone or improve carefully.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px"><thead><tr><th ${th}>Page</th><th ${th}>Conv</th><th ${th}>Users</th></tr></thead><tbody>${winnerRows}</tbody></table>

      <h2 style="font-size:16px;color:#002855;margin:0 0 4px">📈 Biggest movers (14d vs prior 14d)</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:8px"><thead><tr><th ${th}>Page</th><th ${th}>Recent</th><th ${th}>Prior</th><th ${th}>Δ</th></tr></thead><tbody>${trendRows}</tbody></table>

      <p style="font-size:12px;color:#9aa3b0;margin-top:24px;border-top:1px solid #eee;padding-top:14px">
        Generated by the SEO Observer (Phase 1). Phase 2 will turn these into one-click draft actions in your admin.
      </p>
    </div>
  </div>
</body></html>`;

  // ─── plain text fallback ─────────────────────────────────────────────────────
  const line = (s: string) => `${s}\n`;
  let text = '';
  text += line(`La Vaca GC — SEO Weekly Report`);
  text += line(`${win.startDate} → ${win.endDate}`);
  text += line('');
  text += line(`Clicks: ${num(totals.clicks_total)} | Impressions: ${num(totals.impressions_total)} | Conversions: ${num(totals.conversions_total)}`);
  text += line('');
  text += line(`REFRESH CANDIDATES (${refresh_candidates.length}) — pos 5–15, low CTR:`);
  for (const c of refresh_candidates) text += line(`  - ${c.url} ${c.query ? `"${c.query}"` : ''} | impr ${num(c.impressions)} | pos ${pos(c.avg_position)} | ctr ${pct(c.ctr)}`);
  text += line('');
  text += line(`NEW-ARTICLE IDEAS (${new_article_candidates.length}):`);
  for (const c of new_article_candidates) text += line(`  - "${c.query}" | impr ${num(c.impressions)} | ctr ${pct(c.ctr)}`);
  text += line('');
  text += line(`WINNERS (${winners.length}) — pages with conversions:`);
  for (const w of winners) text += line(`  - ${w.url} | ${num(w.conversions)} conv | ${num(w.users)} users`);
  text += line('');
  text += line(`BIGGEST MOVERS:`);
  for (const t of trend) text += line(`  - ${t.url} | ${t.delta >= 0 ? '+' : ''}${num(t.delta)} clicks (recent ${num(t.recent_clicks)} vs prior ${num(t.prior_clicks)})`);

  return { subject, html, text };
}
