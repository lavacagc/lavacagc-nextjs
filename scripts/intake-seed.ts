/**
 * Create ONE intake session against a real lead, print its URL, and stop.
 *
 * Sends no email and creates no lead - it attaches to a lead that already
 * exists, or runs standalone with no lead at all. Use it to click through the
 * flow locally without submitting a form and mailing real people.
 *
 * It talks to whatever project SUPABASE_SECRET_KEY points at, so .env.local has
 * to be loaded explicitly - a bare `npx tsx scripts/intake-seed.ts` sees no
 * credentials at all. Same form scripts/verify-email-log.ts documents:
 *
 *   SEED="npx tsx -r dotenv/config scripts/intake-seed.ts dotenv_config_path=.env.local"
 *
 *   $SEED                                # standalone session
 *   $SEED --project="Bathroom Renovation"
 *   $SEED --lead=<uuid>                  # attach to a real lead
 *   $SEED --cleanup                      # remove seeded sessions
 */
import { createIntakeSession, intakeUrlFor } from '../src/lib/intake/session';
import { supabaseRest } from '../src/lib/notify/supabase-rest';

const arg = (name: string): string | undefined => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const has = (name: string) => process.argv.includes(`--${name}`);

const ORIGIN = arg('origin') ?? 'http://localhost:3000';
const SEED_NAME = 'IntakePreview';

/**
 * Fail on the real reason.
 *
 * `createIntakeSession` swallows its error and returns null, so without this
 * check a missing env var surfaces as "has the migration been applied?" and
 * sends you off to the SQL editor to look at a migration that is fine.
 */
function requireCredentials(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const missing = (['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY'] as const).filter(
    (k) => !process.env[k],
  );
  if (missing.length > 0 || !url) {
    console.error(`Missing ${missing.join(' and ')}.`);
    console.error('Load .env.local explicitly:');
    console.error('  npx tsx -r dotenv/config scripts/intake-seed.ts dotenv_config_path=.env.local');
    process.exit(1);
  }
  return url;
}

/**
 * Remove every seeded session, identified by having no lead.
 *
 * NOT by name: --name= exists, so filtering on the default name silently leaves
 * behind anything seeded with a different one. That exact mistake left test rows
 * in production on the last feature, so this keys off the thing that is actually
 * true of a seed and never true of a real session - a real one always has a
 * lead_id, because it is created by the submit route from an inserted lead.
 */
async function cleanup(projectUrl: string) {
  // Say which project is about to be deleted from. SUPABASE_SECRET_KEY points
  // at production for this repo, and a silent DELETE there is not something to
  // find out about afterwards.
  console.log(`Cleaning up seeded sessions in ${new URL(projectUrl).host}`);

  const rows = await supabaseRest<{ id: string; first_name: string | null }[]>(
    'GET',
    'lead_intake_sessions?lead_id=is.null&select=id,first_name',
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log('Nothing seeded to clean up.');
    return;
  }
  await supabaseRest(
    'DELETE',
    'lead_intake_sessions?lead_id=is.null',
    undefined,
    { prefer: 'return=minimal' },
  );
  const names = rows.map((r) => r.first_name ?? '(no name)').join(', ');
  console.log(`Deleted ${rows.length} seeded session(s): ${names}`);
}

async function main() {
  const projectUrl = requireCredentials();
  if (has('cleanup')) return cleanup(projectUrl);

  const projectType = arg('project') ?? 'Kitchen Remodeling';
  const leadId = arg('lead') ?? null;
  const firstName = arg('name') ?? SEED_NAME;

  const session = await createIntakeSession({ leadId, firstName, projectType });
  if (!session) {
    // createIntakeSession already logged the real error above this line.
    console.error('Could not create the session - see the error above.');
    console.error('If it is a missing table, apply supabase/migrations/20260819000000_lead_intake.sql.');
    process.exit(1);
  }

  console.log('');
  console.log(`  project type : ${projectType}`);
  console.log(`  lead         : ${leadId ?? '(standalone, nothing is mirrored to a lead row)'}`);
  console.log('');
  console.log(`  ${intakeUrlFor(ORIGIN, session.token)}`);
  console.log('');
  console.log('  Clean up with: npx tsx scripts/intake-seed.ts --cleanup');
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
