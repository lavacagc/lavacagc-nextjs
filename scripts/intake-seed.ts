/**
 * Create ONE intake session against a real lead, print its URL, and stop.
 *
 * Sends no email and creates no lead - it attaches to a lead that already
 * exists, or runs standalone with no lead at all. Use it to click through the
 * flow locally without submitting a form and mailing real people.
 *
 *   npx tsx scripts/intake-seed.ts                      # standalone session
 *   npx tsx scripts/intake-seed.ts --project="Bathroom Renovation"
 *   npx tsx scripts/intake-seed.ts --lead=<uuid>        # attach to a real lead
 *   npx tsx scripts/intake-seed.ts --cleanup            # remove seeded sessions
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

async function cleanup() {
  const rows = await supabaseRest<{ id: string }[]>(
    'GET',
    `lead_intake_sessions?first_name=eq.${SEED_NAME}&select=id`,
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log('Nothing seeded to clean up.');
    return;
  }
  await supabaseRest(
    'DELETE',
    `lead_intake_sessions?first_name=eq.${SEED_NAME}`,
    undefined,
    { prefer: 'return=minimal' },
  );
  console.log(`Deleted ${rows.length} seeded session(s).`);
}

async function main() {
  if (has('cleanup')) return cleanup();

  const projectType = arg('project') ?? 'Kitchen Remodeling';
  const leadId = arg('lead') ?? null;
  const firstName = arg('name') ?? SEED_NAME;

  const session = await createIntakeSession({ leadId, firstName, projectType });
  if (!session) {
    console.error('Could not create the session. Has the migration been applied?');
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
