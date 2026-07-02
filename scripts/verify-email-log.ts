/**
 * Phase 1 proof: exercises the real sendTrackedEmail() wrapper end-to-end and
 * reads the row back from public.email_log.
 *
 * Prereqs:
 *   - The email_log migration is applied to the target Supabase project.
 *   - .env.local has RESEND_API_KEY + SUPABASE_SECRET_KEY + NEXT_PUBLIC_SUPABASE_URL
 *     (pull with `vercel env pull --environment=production` if missing).
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register --compiler-options '{"module":"commonjs"}' \
 *     -r dotenv/config scripts/verify-email-log.ts dotenv_config_path=.env.local
 *
 * Sends ONE real email to the owner's own inbox (TEST_TO below) — the
 * "test to me first" pattern — then prints the audit row it wrote.
 */
import { sendTrackedEmail } from '@/lib/notify/sendEmail';
import { supabaseRest } from '@/lib/notify/supabase-rest';

const TEST_TO = process.env.EMAIL_LOG_TEST_TO || 'alex@vacamoo.com';

async function main() {
  const stamp = new Date().toISOString();
  const subject = `[email_log proof] tracked send ${stamp}`;
  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:24px">
    <h2>email_log proof</h2>
    <p>This is a Phase 1 verification send. If you can see this and a row exists in
    <code>email_log</code> with the full HTML, the universal tracking pipeline works.</p>
    <p>Sent ${stamp}.</p></body></html>`;

  console.log(`→ sending tracked '${'other'}' email to ${TEST_TO} …`);
  const result = await sendTrackedEmail({
    from: 'La Vaca General Contractors <info@email.lavaca.link>',
    to: TEST_TO,
    subject,
    html,
    text: 'email_log proof — Phase 1 verification send.',
    category: 'other',
    campaign: { proof: true, stamp },
  });
  console.log('   send result:', result);

  // Read the row back by its Resend message id (or by subject if skipped).
  const filter = result.emailId
    ? `resend_message_id=eq.${encodeURIComponent(result.emailId)}`
    : `subject=eq.${encodeURIComponent(subject)}`;
  const rows = await supabaseRest<Array<Record<string, unknown>>>(
    'GET',
    `email_log?${filter}&select=id,category,to_email,from_email,subject,status,resend_message_id,sent_at,created_at,length(html):html`,
  ).catch(async () => {
    // length() isn't a PostgREST func in all versions; fall back to fetching html.
    return supabaseRest<Array<Record<string, unknown>>>(
      'GET',
      `email_log?${filter}&select=id,category,to_email,from_email,subject,status,resend_message_id,sent_at,created_at,html`,
    );
  });

  if (!rows.length) {
    console.error('✗ NO email_log row found — logging did not work.');
    process.exit(1);
  }
  const row = rows[0];
  const htmlVal = typeof row.html === 'string' ? row.html : '';
  console.log('✓ email_log row written:');
  console.log(JSON.stringify({ ...row, html: htmlVal ? `<${htmlVal.length} chars>` : row.html }, null, 2));
  console.log(`   → full HTML stored: ${htmlVal.length} chars`);
}

main().catch((err) => {
  console.error('proof script failed:', err);
  process.exit(1);
});
