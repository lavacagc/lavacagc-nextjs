/**
 * Email safety for non-production deployments.
 *
 * Previews read the staging database, but a Resend key that sends real mail
 * would still reach real people (a test signup typed with a real address, a
 * follow-up queued from copied data). So outside production every message is
 * redirected to one inbox, the original recipients are kept in the subject,
 * and writes to Resend audiences are skipped.
 *
 * "Production" means a real Vercel production function: VERCEL_ENV ===
 * 'production' AND VERCEL_REGION set. VERCEL_REGION is a runtime-only system
 * variable, so `vercel env pull --environment=production` never writes it into
 * .env.local; a local run on pulled production env is still redirected.
 * Previews, `vercel dev` (development) and local `next dev` / `next start`
 * are all redirected, even with a real RESEND_API_KEY in .env.local.
 *
 * EMAIL_REDIRECT_TO sets the inbox, in any environment. Without it, mail
 * outside production goes to Resend's test sink `delivered@resend.dev`
 * (accepted, logged, delivered to no one): the fail-safe default, so nothing
 * but production can mail a customer just because a variable is missing.
 * Production is never redirected unless EMAIL_REDIRECT_TO is set there on
 * purpose.
 */

export const RESEND_TEST_SINK = 'delivered@resend.dev';

export function isRealProduction(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV === 'production' && Boolean(env.VERCEL_REGION?.trim());
}

export function emailRedirectTarget(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env.EMAIL_REDIRECT_TO?.trim();
  if (explicit) return explicit;
  if (!isRealProduction(env)) return RESEND_TEST_SINK;
  return null;
}

export interface Envelope {
  to: string[];
  cc: string[];
  subject: string;
}

/** The envelope to actually send: unchanged in production, redirected elsewhere. */
export function applyEmailSafety(envelope: Envelope, env: NodeJS.ProcessEnv = process.env): Envelope {
  const target = emailRedirectTarget(env);
  if (!target) return envelope;
  const original = [...envelope.to, ...envelope.cc].join(', ') || 'nobody';
  return { to: [target], cc: [], subject: `[${env.VERCEL_ENV || 'local'} → ${original}] ${envelope.subject}` };
}

/** Resend audiences are production mailing lists; only production may write them. */
export function audienceWritesAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return emailRedirectTarget(env) === null;
}
